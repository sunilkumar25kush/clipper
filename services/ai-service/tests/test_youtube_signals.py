import pytest
from typing import List, Dict, Any
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.youtube import (
    YouTubePublicMetadata,
    YouTubeRetentionReport,
    RetentionDataPoint,
    RetentionInterval,
    RetentionEnrichedCandidate,
    YouTubeEnrichmentRequest,
    YouTubeEnrichmentResponse,
)
from app.services.youtube_signals import youtube_signal_service

client = TestClient(app)

# ==========================================
# 1. Public Metadata Parsing Tests
# ==========================================

def test_parse_public_metadata_complete():
    """Verify parsing of standard YouTube Data API v3 public metadata."""
    raw = {
        "id": "dQw4w9WgXcQ",
        "snippet": {
            "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
            "description": "The official video for Never Gonna Give You Up.",
            "channelId": "UCuAXFkgsw1L7xaCfnd5JJOw",
            "channelTitle": "Rick Astley",
            "publishedAt": "2009-10-25T06:57:33Z",
        },
        "statistics": {
            "viewCount": "1500000000",
            "likeCount": "17000000",
            "commentCount": "2500000",
        },
        "duration": 213.0,
    }

    meta = youtube_signal_service.parse_public_metadata(raw)
    assert meta.video_id == "dQw4w9WgXcQ"
    assert meta.title.startswith("Rick Astley")
    assert meta.view_count == 1500000000
    assert meta.like_count == 17000000
    assert meta.comment_count == 2500000
    assert meta.duration_seconds == 213.0
    assert meta.channel_id == "UCuAXFkgsw1L7xaCfnd5JJOw"


def test_parse_public_metadata_missing_stats():
    """Verify robust handling when statistics (likes, views, comments) are hidden or missing."""
    raw = {
        "video_id": "test_hidden_stats",
        "title": "Private Unlisted Video",
        "duration_seconds": 180.0,
        # No statistics dictionary provided
    }

    meta = youtube_signal_service.parse_public_metadata(raw)
    assert meta.video_id == "test_hidden_stats"
    assert meta.view_count is None
    assert meta.like_count is None
    assert meta.comment_count is None
    assert meta.duration_seconds == 180.0


# ==========================================
# 2. Channel Authorization & Security
# ==========================================

def test_channel_authorization_success():
    """Authorized when authenticated user channel matches video channel ID."""
    assert youtube_signal_service.verify_channel_authorization(
        video_channel_id="UC_my_channel_123",
        authenticated_channel_id="UC_my_channel_123",
    ) is True


def test_channel_authorization_unauthorized_mismatch():
    """Rejects analytics access when video belongs to a third-party channel."""
    assert youtube_signal_service.verify_channel_authorization(
        video_channel_id="UC_competitor_channel_999",
        authenticated_channel_id="UC_my_channel_123",
    ) is False


def test_unauthorized_video_returns_safe_fallback():
    """
    Attempting to retrieve retention for an unauthorized video returns
    is_authorized=False, data_source='unavailable' with zero fabricated data.
    """
    raw_rows = [
        {"elapsedVideoTimeRatio": 0.1, "audienceWatchRatio": 1.25},
        {"elapsedVideoTimeRatio": 0.5, "audienceWatchRatio": 0.90},
    ]

    report = youtube_signal_service.map_retention_data(
        video_id="video_unauthorized",
        raw_rows=raw_rows,
        video_duration=300.0,
        is_authorized=False,  # UNAUTHORIZED
        authenticated_channel_id="UC_user_channel",
        video_channel_id="UC_other_channel",
    )

    assert report.is_authorized is False
    assert report.data_source == "unavailable"
    assert report.total_data_points == 0
    assert len(report.retention_points) == 0
    assert len(report.peak_intervals) == 0


# ==========================================
# 3. Retention Mapping: Peaks, Rewatches, Drop-offs
# ==========================================

def test_valid_retention_mapping_detects_peaks_and_rewatches():
    """
    Valid authorized retention report maps ratios to seconds and identifies
    retention peaks (>1.15x) and rewatch spikes (>1.0 watch ratio).
    """
    video_dur = 100.0  # 100 seconds for clean ratio mapping
    rows = [
        {"elapsedVideoTimeRatio": 0.05, "audienceWatchRatio": 0.95, "relativeRetentionPerformance": 1.0},
        {"elapsedVideoTimeRatio": 0.10, "audienceWatchRatio": 0.90, "relativeRetentionPerformance": 1.0},
        # Drop-off point (0.20 to 0.30)
        {"elapsedVideoTimeRatio": 0.20, "audienceWatchRatio": 0.55, "relativeRetentionPerformance": 0.7},
        {"elapsedVideoTimeRatio": 0.30, "audienceWatchRatio": 0.50, "relativeRetentionPerformance": 0.6},
        # Baseline recovery
        {"elapsedVideoTimeRatio": 0.40, "audienceWatchRatio": 0.70, "relativeRetentionPerformance": 1.0},
        # Massive Rewatch Peak at 50% (audienceWatchRatio = 1.35 > 1.0)
        {"elapsedVideoTimeRatio": 0.50, "audienceWatchRatio": 1.35, "relativeRetentionPerformance": 1.4},
        {"elapsedVideoTimeRatio": 0.55, "audienceWatchRatio": 1.25, "relativeRetentionPerformance": 1.3},
        # Normal baseline to end
        {"elapsedVideoTimeRatio": 0.70, "audienceWatchRatio": 0.65, "relativeRetentionPerformance": 0.9},
        {"elapsedVideoTimeRatio": 0.90, "audienceWatchRatio": 0.60, "relativeRetentionPerformance": 0.8},
    ]

    report = youtube_signal_service.map_retention_data(
        video_id="video_authorized_test",
        raw_rows=rows,
        video_duration=video_dur,
        is_authorized=True,
        authenticated_channel_id="UC_owner_channel",
        video_channel_id="UC_owner_channel",
    )

    assert report.is_authorized is True
    assert report.data_source == "youtube_analytics_api"
    assert report.total_data_points == len(rows)

    # 0.50 ratio mapped to 50.0s
    p_rewatch = next(p for p in report.retention_points if p.timestamp_seconds == 50.0)
    assert p_rewatch.is_rewatch is True
    assert p_rewatch.is_peak is True

    # Check intervals
    assert len(report.rewatch_intervals) >= 1
    rw_inv = report.rewatch_intervals[0]
    assert rw_inv.start_time <= 50.0
    assert rw_inv.peak_ratio >= 1.35

    assert len(report.dropoff_intervals) >= 1


# ==========================================
# 4. Fallback Handling (No Fabrication)
# ==========================================

def test_retention_unavailable_fallback():
    """
    When retention data is unavailable, candidates are labeled as 'ai_estimated_potential',
    no numbers are fabricated, and no claim of 'most viewed' is made.
    """
    candidates = [
        {"candidate_id": "c1", "start": 10.0, "end": 40.0},
        {"candidate_id": "c2", "start": 50.0, "end": 80.0},
    ]

    # Pass None for retention_report
    enriched = youtube_signal_service.enrich_candidates(candidates, retention_report=None)

    assert len(enriched) == 2
    for c in enriched:
        assert c.retention_boost == 0.0
        assert c.has_retention_peak is False
        assert c.has_rewatch_spike is False
        assert c.engagement_source == "ai_estimated_potential"
        assert "unavailable" in c.retention_explanation.lower()
        assert "most viewed" not in c.retention_explanation.lower()


def test_candidate_retention_enrichment_boost():
    """Candidate overlapping verified retention peak receives an evidence-based retention boost."""
    candidates = [
        {"candidate_id": "c_peak", "start": 48.0, "end": 60.0},
        {"candidate_id": "c_drop", "start": 18.0, "end": 32.0},
    ]

    # Build report with peak at 50-55s and drop-off at 20-30s
    report = YouTubeRetentionReport(
        video_id="v1",
        is_authorized=True,
        data_source="youtube_analytics_api",
        total_data_points=5,
        average_retention=0.75,
        peak_intervals=[RetentionInterval(start_time=48.0, end_time=58.0, average_ratio=1.25, peak_ratio=1.35, interval_type="peak")],
        rewatch_intervals=[RetentionInterval(start_time=50.0, end_time=55.0, average_ratio=1.28, peak_ratio=1.35, interval_type="rewatch")],
        dropoff_intervals=[RetentionInterval(start_time=19.0, end_time=30.0, average_ratio=0.50, peak_ratio=0.55, interval_type="dropoff")],
    )

    enriched = youtube_signal_service.enrich_candidates(candidates, report)
    assert len(enriched) == 2

    c_peak = next(c for c in enriched if c.candidate_id == "c_peak")
    assert c_peak.has_rewatch_spike is True
    assert c_peak.retention_boost > 0.0
    assert c_peak.engagement_source == "youtube_analytics_retention"
    assert "rewatch" in c_peak.retention_explanation.lower()

    c_drop = next(c for c in enriched if c.candidate_id == "c_drop")
    assert c_drop.overlaps_dropoff is True
    assert c_drop.retention_boost < 0.0


# ==========================================
# 5. FastAPI Router Tests
# ==========================================

def test_api_youtube_metadata_endpoint():
    """Verify POST /api/v1/youtube/metadata endpoint."""
    payload = {
        "video_id": "vid_api_123",
        "snippet": {"title": "API Test Title", "channelTitle": "TechChannel"},
        "statistics": {"viewCount": "120000", "likeCount": "4500"},
        "duration": 420.0,
    }
    resp = client.post("/api/v1/youtube/metadata", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["video_id"] == "vid_api_123"
    assert data["view_count"] == 120000
    assert data["duration_seconds"] == 420.0


def test_api_youtube_retention_map_endpoint():
    """Verify POST /api/v1/youtube/retention/map endpoint."""
    payload = {
        "video_id": "vid_map_test",
        "video_duration": 200.0,
        "is_authorized": True,
        "authenticated_channel_id": "UC_channel_1",
        "video_channel_id": "UC_channel_1",
        "rows": [
            {"elapsedVideoTimeRatio": 0.25, "audienceWatchRatio": 1.15},
            {"elapsedVideoTimeRatio": 0.50, "audienceWatchRatio": 0.80},
        ],
    }
    resp = client.post("/api/v1/youtube/retention/map", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_authorized"] is True
    assert data["total_data_points"] == 2
    assert len(data["retention_points"]) == 2


def test_api_youtube_enrich_candidates_endpoint():
    """Verify POST /api/v1/youtube/enrich-candidates endpoint with AI-estimated fallback."""
    payload = {
        "project_id": "proj_enrich_api",
        "video_id": "vid_api_test",
        "video_duration": 180.0,
        "candidates": [{"candidate_id": "cand_01", "start": 10.0, "end": 45.0}],
        # No retention report provided -> triggers AI fallback
    }
    resp = client.post("/api/v1/youtube/enrich-candidates", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["retention_available"] is False
    assert "AI-Estimated" in data["engagement_label"]
    assert len(data["enriched_candidates"]) == 1
    assert data["enriched_candidates"][0]["engagement_source"] == "ai_estimated_potential"

