import re
import logging
from typing import List, Dict, Optional, Any, Tuple
from app.schemas.youtube import (
    YouTubePublicMetadata,
    RetentionDataPoint,
    RetentionInterval,
    YouTubeRetentionReport,
    RetentionEnrichedCandidate,
    YouTubeEnrichmentRequest,
    YouTubeEnrichmentResponse,
)

logger = logging.getLogger("clipforge.youtube_signals")

class YouTubeSignalService:
    """
    Integrates legitimate public YouTube metadata and authorized audience retention signals.
    Enforces strict OAuth channel ownership and safe fallbacks with zero fabricated statistics.
    """

    @staticmethod
    def parse_public_metadata(raw_data: Dict[str, Any]) -> YouTubePublicMetadata:
        """
        Parses public YouTube Data API metadata, gracefully handling missing or hidden metrics.
        """
        video_id = str(raw_data.get("video_id") or raw_data.get("id", "unknown")).strip()
        snippet = raw_data.get("snippet", {})
        statistics = raw_data.get("statistics", {})

        title = str(raw_data.get("title") or snippet.get("title", f"Video {video_id}")).strip()
        description = str(raw_data.get("description") or snippet.get("description", "")).strip()
        channel_id = raw_data.get("channel_id") or snippet.get("channelId")
        channel_title = raw_data.get("channel_title") or snippet.get("channelTitle")
        published_at = raw_data.get("published_at") or snippet.get("publishedAt")

        # Parse view count, handling hidden or missing statistics
        raw_views = raw_data.get("view_count", statistics.get("viewCount"))
        view_count: Optional[int] = None
        if raw_views is not None:
            try:
                view_count = int(raw_views)
            except (ValueError, TypeError):
                view_count = None

        # Parse like count, handling hidden or disabled likes
        raw_likes = raw_data.get("like_count", statistics.get("likeCount"))
        like_count: Optional[int] = None
        if raw_likes is not None:
            try:
                like_count = int(raw_likes)
            except (ValueError, TypeError):
                like_count = None

        # Parse comment count
        raw_comments = raw_data.get("comment_count", statistics.get("commentCount"))
        comment_count: Optional[int] = None
        if raw_comments is not None:
            try:
                comment_count = int(raw_comments)
            except (ValueError, TypeError):
                comment_count = None

        # Parse duration
        duration = float(raw_data.get("duration_seconds", raw_data.get("duration", 60.0)))
        if duration <= 0.0:
            duration = 60.0

        return YouTubePublicMetadata(
            video_id=video_id,
            title=title,
            description=description,
            view_count=view_count,
            like_count=like_count,
            comment_count=comment_count,
            duration_seconds=round(duration, 2),
            channel_id=channel_id,
            channel_title=channel_title,
            published_at=published_at,
        )

    @staticmethod
    def verify_channel_authorization(
        video_channel_id: Optional[str],
        authenticated_channel_id: Optional[str],
    ) -> bool:
        """
        Verifies that authenticated user owns the channel hosting the video.
        Guarantees that retention data is only accessible to authorized channel owners.
        """
        if not video_channel_id or not authenticated_channel_id:
            return False
        return video_channel_id.strip() == authenticated_channel_id.strip()

    def map_retention_data(
        self,
        video_id: str,
        raw_rows: List[Dict[str, Any]],
        video_duration: float,
        is_authorized: bool = True,
        authenticated_channel_id: Optional[str] = None,
        video_channel_id: Optional[str] = None,
    ) -> YouTubeRetentionReport:
        """
        Maps raw YouTube Analytics retention data to video timeline seconds.
        Detects relative retention peaks, rewatch spikes, and drop-off sections.
        Returns an unauthorized fallback if channel ownership is not verified.
        """
        # Strict security gate: unauthorized access must return unpopulated fallback
        if not is_authorized or not self.verify_channel_authorization(video_channel_id, authenticated_channel_id):
            return YouTubeRetentionReport(
                video_id=video_id,
                is_authorized=False,
                data_source="unavailable",
                total_data_points=0,
                average_retention=0.0,
                retention_points=[],
                peak_intervals=[],
                rewatch_intervals=[],
                dropoff_intervals=[],
            )

        if not raw_rows or video_duration <= 0.0:
            return YouTubeRetentionReport(
                video_id=video_id,
                is_authorized=True,
                data_source="youtube_analytics_api",
                total_data_points=0,
                average_retention=0.0,
                retention_points=[],
            )

        # 1. Parse data points and map ratio to video seconds
        points: List[RetentionDataPoint] = []
        for r in raw_rows:
            ratio = float(r.get("elapsedVideoTimeRatio", 0.0))
            watch_ratio = float(r.get("audienceWatchRatio", 0.0))
            rel_perf = float(r.get("relativeRetentionPerformance", 1.0))
            ts_seconds = round(ratio * video_duration, 2)

            points.append(
                RetentionDataPoint(
                    elapsed_time_ratio=round(ratio, 4),
                    timestamp_seconds=ts_seconds,
                    audience_watch_ratio=round(watch_ratio, 4),
                    relative_retention_performance=round(rel_perf, 4),
                    is_peak=False,
                    is_rewatch=False,
                    is_dropoff=False,
                )
            )

        # Sort chronologically by timestamp
        points.sort(key=lambda p: p.timestamp_seconds)

        # 2. Calculate baseline average retention
        avg_retention = sum(p.audience_watch_ratio for p in points) / max(1, len(points))
        baseline = max(0.05, avg_retention)

        # 3. Classify peaks, rewatches, and drop-offs
        for p in points:
            # Rewatch: audience watch ratio > 1.0 (viewers repeatedly playing this moment)
            if p.audience_watch_ratio > 1.0:
                p.is_rewatch = True
                p.is_peak = True
            # Relative Peak: watch ratio is 15% above local average or relative retention > 1.2
            elif p.audience_watch_ratio >= (baseline * 1.15) or p.relative_retention_performance >= 1.20:
                p.is_peak = True
            # Drop-off: watch ratio falls below 85% of baseline
            elif p.audience_watch_ratio <= (baseline * 0.85):
                p.is_dropoff = True

        # 4. Group contiguous points into intervals
        peak_intervals = self._group_intervals(points, lambda p: p.is_peak, "peak")
        rewatch_intervals = self._group_intervals(points, lambda p: p.is_rewatch, "rewatch")
        dropoff_intervals = self._group_intervals(points, lambda p: p.is_dropoff, "dropoff")

        return YouTubeRetentionReport(
            video_id=video_id,
            is_authorized=True,
            data_source="youtube_analytics_api",
            total_data_points=len(points),
            average_retention=round(avg_retention, 4),
            retention_points=points,
            peak_intervals=peak_intervals,
            rewatch_intervals=rewatch_intervals,
            dropoff_intervals=dropoff_intervals,
        )

    def _group_intervals(
        self,
        points: List[RetentionDataPoint],
        predicate: Any,
        interval_type: str,
    ) -> List[RetentionInterval]:
        """Groups contiguous matching data points into continuous time intervals."""
        intervals: List[RetentionInterval] = []
        cur_group: List[RetentionDataPoint] = []

        for p in points:
            if predicate(p):
                cur_group.append(p)
            else:
                if cur_group:
                    intervals.append(self._create_interval(cur_group, interval_type))
                    cur_group = []

        if cur_group:
            intervals.append(self._create_interval(cur_group, interval_type))

        return intervals

    @staticmethod
    def _create_interval(group: List[RetentionDataPoint], interval_type: str) -> RetentionInterval:
        start_time = group[0].timestamp_seconds
        end_time = max(start_time + 1.0, group[-1].timestamp_seconds)
        avg_ratio = sum(p.audience_watch_ratio for p in group) / len(group)
        peak_ratio = max(p.audience_watch_ratio for p in group)

        return RetentionInterval(
            start_time=round(start_time, 2),
            end_time=round(end_time, 2),
            average_ratio=round(avg_ratio, 4),
            peak_ratio=round(peak_ratio, 4),
            interval_type=interval_type,
        )

    def enrich_candidates(
        self,
        candidates: List[Any],
        retention_report: Optional[YouTubeRetentionReport],
    ) -> List[RetentionEnrichedCandidate]:
        """
        Enriches candidate highlights with verified YouTube retention signals where available.
        When retention data is unavailable, strictly falls back to AI semantic potential
        without fabricating numbers or claiming 'most viewed'.
        """
        enriched: List[RetentionEnrichedCandidate] = []

        for cand in candidates:
            # Extract start and end timestamps
            c_id = getattr(cand, "candidate_id", None) or cand.get("candidate_id", "cand_001")
            start = float(getattr(cand, "start_time", None) or getattr(cand, "refined_start", None) or cand.get("start_time", cand.get("start", 0.0)))
            end = float(getattr(cand, "end_time", None) or getattr(cand, "refined_end", None) or cand.get("end_time", cand.get("end", start + 15.0)))

            # Fallback condition: retention report missing or unauthorized
            if retention_report is None or not retention_report.is_authorized or retention_report.data_source != "youtube_analytics_api":
                enriched.append(
                    RetentionEnrichedCandidate(
                        candidate_id=c_id,
                        start_time=start,
                        end_time=end,
                        retention_boost=0.0,
                        has_retention_peak=False,
                        has_rewatch_spike=False,
                        overlaps_dropoff=False,
                        engagement_source="ai_estimated_potential",
                        retention_explanation="Audience retention data unavailable; engagement evaluated using AI semantic dialogue potential.",
                    )
                )
                continue

            # Check overlap with retention intervals
            has_rewatch = any(self._overlaps(start, end, inv.start_time, inv.end_time) for inv in retention_report.rewatch_intervals)
            has_peak = any(self._overlaps(start, end, inv.start_time, inv.end_time) for inv in retention_report.peak_intervals)
            has_dropoff = any(self._overlaps(start, end, inv.start_time, inv.end_time) for inv in retention_report.dropoff_intervals)

            boost = 0.0
            explanation_parts = []

            if has_rewatch:
                boost += 12.0
                explanation_parts.append("Overlaps verified audience rewatch spike (>100% watch ratio).")
            elif has_peak:
                boost += 8.0
                explanation_parts.append("Coincides with a verified YouTube audience retention peak.")

            if has_dropoff:
                boost -= 6.0
                explanation_parts.append("Overlaps audience drop-off section.")

            if not explanation_parts:
                explanation_parts.append("Steady viewer retention baseline across this section.")

            enriched.append(
                RetentionEnrichedCandidate(
                    candidate_id=c_id,
                    start_time=start,
                    end_time=end,
                    retention_boost=round(boost, 1),
                    has_retention_peak=has_peak,
                    has_rewatch_spike=has_rewatch,
                    overlaps_dropoff=has_dropoff,
                    engagement_source="youtube_analytics_retention",
                    retention_explanation=" ".join(explanation_parts),
                )
            )

        return enriched

    @staticmethod
    def _overlaps(start_a: float, end_a: float, start_b: float, end_b: float) -> bool:
        return max(0.0, min(end_a, end_b) - max(start_a, start_b)) > 1.0

    def process_enrichment_request(
        self,
        request: YouTubeEnrichmentRequest,
    ) -> YouTubeEnrichmentResponse:
        """Processes batch enrichment request."""
        has_retention = (
            request.retention_report is not None
            and request.retention_report.is_authorized
            and request.retention_report.data_source == "youtube_analytics_api"
        )
        label = "Verified YouTube Analytics Retention" if has_retention else "AI-Estimated Engagement Potential"

        enriched_cands = self.enrich_candidates(
            candidates=request.candidates,
            retention_report=request.retention_report,
        )

        return YouTubeEnrichmentResponse(
            project_id=request.project_id,
            video_id=request.video_id,
            retention_available=has_retention,
            engagement_label=label,
            enriched_candidates=enriched_cands,
        )

youtube_signal_service = YouTubeSignalService()
