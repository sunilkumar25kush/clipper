import logging
import json
import re
from typing import List, Optional
from app.config import settings
from app.schemas.transcript import TranscriptResponse, TranscriptSegment, WordTimestamp
from app.schemas.clip import (
    ClipCandidate,
    ClipCategory,
    ClipScores,
    ClipDetectionRequest,
    ClipDetectionResponse,
)
from app.services.clip_prompts import (
    format_compact_transcript,
    CLIP_DETECTION_SYSTEM_INSTRUCTION,
    build_detection_prompt,
)
from app.services.boundary_optimizer import BoundaryOptimizer
from app.services.clip_nms import TemporalNMS
from app.services.storage import transcript_storage

logger = logging.getLogger("clipforge.clip_detector")

# Curated semantic heuristic markers for fallback analysis
HOOK_KEYWORDS = [
    "why", "how", "secret", "mistake", "never", "always", "truth", "stop", "listen",
    "imagine", "what if", "the problem", "most people", "nobody", "shocking", "worst"
]
EDUCATIONAL_KEYWORDS = [
    "step", "framework", "tip", "learn", "method", "process", "rule", "strategy", "technique", "guide"
]
EMOTIONAL_KEYWORDS = [
    "heart", "love", "cry", "pain", "struggle", "grateful", "feel", "scared", "fear", "hope"
]
MOTIVATIONAL_KEYWORDS = [
    "discipline", "win", "dream", "success", "grind", "hard work", "focus", "believe", "overcome"
]
FUNNY_KEYWORDS = [
    "haha", "laugh", "joke", "funny", "hilarious", "crazy", "ridiculous", "weird"
]

class ClipDetectionEngine:
    """
    Intelligent AI Clip Detection Engine powered by Google Gemini with robust
    heuristic fallback, sliding window support for long videos, boundary optimization,
    and temporal non-maximum suppression.
    """

    def __init__(self):
        self.api_key = settings.gemini_api_key
        self.primary_model = settings.gemini_primary_model
        self._genai_client = None

    def _get_genai_client(self):
        if self._genai_client is None:
            if self.api_key and not self.api_key.startswith("replace_with_"):
                try:
                    from google import genai
                    self._genai_client = genai.Client(api_key=self.api_key)
                except Exception as e:
                    logger.warning(f"Failed to initialize google-genai client: {e}")
                    self._genai_client = None
        return self._genai_client

    def _is_live_gemini_available(self) -> bool:
        return (
            bool(self.api_key)
            and not self.api_key.startswith("replace_with_")
            and self._get_genai_client() is not None
        )

    def _extract_all_words(self, transcript: TranscriptResponse) -> List[WordTimestamp]:
        """Flattens all words from segments or directly from transcript."""
        if getattr(transcript, "words", None):
            return transcript.words
        words = []
        for seg in transcript.segments:
            if seg.words:
                words.extend(seg.words)
        return words

    def _detect_candidates_with_gemini(
        self,
        formatted_transcript: str,
        video_duration: float,
        min_duration: float,
        max_duration: float,
        max_clips: int,
    ) -> List[ClipCandidate]:
        """Invokes Google Gemini with structured JSON output."""
        client = self._get_genai_client()
        if not client:
            raise RuntimeError("Gemini client is not available")

        system_instruction = CLIP_DETECTION_SYSTEM_INSTRUCTION.format(
            min_duration=min_duration,
            max_duration=max_duration,
        )

        user_prompt = build_detection_prompt(
            formatted_transcript=formatted_transcript,
            video_duration=video_duration,
            min_duration=min_duration,
            max_duration=max_duration,
            max_clips=max_clips,
        )

        from google.genai import types

        response = client.models.generate_content(
            model=self.primary_model,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                temperature=settings.gemini_temperature,
                max_output_tokens=settings.gemini_max_output_tokens,
            ),
        )

        raw_json = response.text
        if not raw_json:
            return []

        parsed = json.loads(raw_json)
        # Normalize list whether wrapped in {"clips": [...]} or raw array
        items = parsed if isinstance(parsed, list) else parsed.get("clips", parsed.get("candidates", []))

        candidates = []
        for item in items:
            try:
                candidate = ClipCandidate.model_validate(item)
                candidates.append(candidate)
            except Exception as parse_err:
                logger.warning(f"Skipping malformed LLM candidate: {parse_err}")

        return candidates

    def _detect_candidates_heuristic(
        self,
        segments: List[TranscriptSegment],
        video_duration: float,
        min_duration: float,
        max_duration: float,
        max_clips: int,
        target_categories: Optional[List[ClipCategory]] = None,
    ) -> List[ClipCandidate]:
        """
        Deterministic, semantic heuristic detection for offline testing and fallback.
        Analyzes narrative structure, punctuation, sentence grouping, and semantic cues.
        """
        if not segments:
            return []

        candidates: List[ClipCandidate] = []
        n_segs = len(segments)

        # Sliding window over segments to generate candidate moments
        i = 0
        while i < n_segs:
            window_start = segments[i].start
            # Skip if window starts too close to end of video
            if window_start + min_duration > video_duration:
                break

            j = i
            window_text = []
            while j < n_segs:
                seg = segments[j]
                window_text.append(seg.text)
                cur_dur = seg.end - window_start

                # If within [min_duration, max_duration] and ends at punctuation or sentence closure
                if cur_dur >= min_duration:
                    text_str = " ".join(window_text).strip()
                    ends_cleanly = bool(re.search(r"[.!?]\s*$", text_str)) or (j == n_segs - 1)

                    if ends_cleanly or cur_dur >= (min_duration + max_duration) / 2:
                        # Evaluate category and scores
                        lower_text = text_str.lower()
                        category = ClipCategory.INTERESTING
                        if any(k in lower_text for k in EDUCATIONAL_KEYWORDS):
                            category = ClipCategory.EDUCATIONAL
                        elif any(k in lower_text for k in MOTIVATIONAL_KEYWORDS):
                            category = ClipCategory.MOTIVATIONAL
                        elif any(k in lower_text for k in EMOTIONAL_KEYWORDS):
                            category = ClipCategory.EMOTIONAL
                        elif any(k in lower_text for k in FUNNY_KEYWORDS):
                            category = ClipCategory.FUNNY
                        elif "?" in segments[i].text or any(k in lower_text for k in HOOK_KEYWORDS):
                            category = ClipCategory.STRONG_OPINIONS

                        # Compute explainable scores
                        hook_score = 75
                        if "?" in segments[i].text or any(k in segments[i].text.lower() for k in HOOK_KEYWORDS):
                            hook_score += 15
                        hook_score = min(98, hook_score)

                        engagement_score = 70
                        if len(text_str.split()) > 25:
                            engagement_score += 10
                        if any(p in text_str for p in ["!", "?", "..."]):
                            engagement_score += 8
                        engagement_score = min(96, engagement_score)

                        context_score = 80
                        if ends_cleanly:
                            context_score += 12
                        context_score = min(98, context_score)

                        overall_score = round(0.30 * hook_score + 0.40 * engagement_score + 0.30 * context_score)

                        # Generate title from first sentence
                        first_sentence = re.split(r"[.!?]", text_str)[0].strip()
                        title = first_sentence[:80] if len(first_sentence) > 5 else f"{category.value.title()} Highlight"
                        if len(title) < 5:
                            title = f"ClipForge AI: {category.value.title()}"

                        reason = (
                            f"Identified strong opening hook in the first seconds, sustained narrative "
                            f"momentum with topic '{category.value}', and clear conclusion."
                        )

                        candidates.append(
                            ClipCandidate(
                                start=round(window_start, 2),
                                end=round(min(video_duration, seg.end), 2),
                                title=title,
                                category=category,
                                reason=reason,
                                scores=ClipScores(
                                    hook=hook_score,
                                    engagement=engagement_score,
                                    context=context_score,
                                    overall=overall_score,
                                ),
                            )
                        )
                        break

                if cur_dur > max_duration:
                    break
                j += 1

            i += max(1, (j - i) // 2 or 1)

        return candidates

    def detect_clips(self, request: ClipDetectionRequest) -> ClipDetectionResponse:
        """
        Orchestrates intelligent clip detection across transcript, boundaries, and NMS.
        """
        # 1. Resolve Transcript
        transcript = request.transcript
        if not transcript and request.transcript_id:
            transcript = transcript_storage.get_transcript(request.transcript_id)

        if not transcript or not transcript.segments:
            logger.warning("Empty or missing transcript provided for clip detection")
            return ClipDetectionResponse(
                project_id=request.project_id,
                transcript_id=request.transcript_id,
                video_duration=request.video_duration,
                total_candidates_found=0,
                clips=[],
                analyzed_windows_count=0,
            )

        video_duration = min(request.video_duration, transcript.duration_seconds or request.video_duration)
        all_words = self._extract_all_words(transcript)

        # 2. Windowing Strategy (for long videos > 45 minutes)
        raw_candidates: List[ClipCandidate] = []
        window_duration = 1800.0  # 30 min
        overlap = 300.0           # 5 min overlap

        if video_duration <= 2700.0:  # <= 45 minutes: single window
            windows = [(0.0, video_duration)]
        else:
            windows = []
            cur_start = 0.0
            while cur_start < video_duration:
                cur_end = min(video_duration, cur_start + window_duration)
                windows.append((cur_start, cur_end))
                if cur_end >= video_duration:
                    break
                cur_start = cur_end - overlap

        # 3. Candidate Generation per window
        for w_start, w_end in windows:
            # Filter segments in window
            window_segs = [s for s in transcript.segments if s.start >= w_start and s.end <= w_end]
            if not window_segs:
                continue

            window_candidates: List[ClipCandidate] = []

            if self._is_live_gemini_available():
                try:
                    formatted = format_compact_transcript(window_segs)
                    window_candidates = self._detect_candidates_with_gemini(
                        formatted_transcript=formatted,
                        video_duration=video_duration,
                        min_duration=request.min_duration,
                        max_duration=request.max_duration,
                        max_clips=request.max_clips,
                    )
                except Exception as e:
                    logger.error(f"Live Gemini API call failed, falling back to heuristic: {e}")
                    window_candidates = self._detect_candidates_heuristic(
                        segments=window_segs,
                        video_duration=video_duration,
                        min_duration=request.min_duration,
                        max_duration=request.max_duration,
                        max_clips=request.max_clips,
                        target_categories=request.target_categories,
                    )
            else:
                window_candidates = self._detect_candidates_heuristic(
                    segments=window_segs,
                    video_duration=video_duration,
                    min_duration=request.min_duration,
                    max_duration=request.max_duration,
                    max_clips=request.max_clips,
                    target_categories=request.target_categories,
                )

            raw_candidates.extend(window_candidates)

        # 4. Snap Boundaries using Word Timestamps
        optimized_candidates: List[ClipCandidate] = []
        for cand in raw_candidates:
            snapped_start, snapped_end = BoundaryOptimizer.optimize_boundaries(
                raw_start=cand.start,
                raw_end=cand.end,
                all_words=all_words,
                video_duration=video_duration,
                min_duration=request.min_duration,
                max_duration=request.max_duration,
            )

            # Enforce video boundary check
            if snapped_start >= 0.0 and snapped_end <= video_duration and snapped_end > snapped_start:
                optimized_candidates.append(
                    ClipCandidate(
                        start=snapped_start,
                        end=snapped_end,
                        title=cand.title,
                        category=cand.category,
                        reason=cand.reason,
                        scores=cand.scores,
                    )
                )

        # 5. Temporal Non-Maximum Suppression (De-duplication)
        final_clips = TemporalNMS.filter_candidates(
            candidates=optimized_candidates,
            iou_threshold=settings.nms_iou_threshold,
            overlap_threshold=settings.nms_overlap_threshold,
            max_clips=request.max_clips,
        )

        # 6. Apply Target Category Filters if requested
        if request.target_categories:
            cat_set = set(request.target_categories)
            final_clips = [c for c in final_clips if c.category in cat_set]

        return ClipDetectionResponse(
            project_id=request.project_id,
            transcript_id=request.transcript_id,
            video_duration=video_duration,
            total_candidates_found=len(final_clips),
            clips=final_clips,
            analyzed_windows_count=len(windows),
        )

clip_detection_engine = ClipDetectionEngine()
