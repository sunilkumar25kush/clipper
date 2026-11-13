from typing import List, Optional
from app.schemas.transcript import WordTimestamp, TranscriptSegment

class BoundaryOptimizer:
    """
    Optimizes candidate clip boundaries by snapping LLM timestamps to exact Whisper
    word boundaries, sentence beginnings, and terminal punctuation.
    """
    PRE_ROLL_BUFFER_SECONDS = 0.12   # 120ms speech lead-in buffer
    POST_ROLL_BUFFER_SECONDS = 0.20  # 200ms speech tail buffer
    SENTENCE_LOOKBACK_MAX = 3.0      # Max seconds to look back for sentence start

    @classmethod
    def optimize_boundaries(
        cls,
        raw_start: float,
        raw_end: float,
        all_words: List[WordTimestamp],
        video_duration: float,
        min_duration: float,
        max_duration: float,
    ) -> tuple[float, float]:
        """
        Refines raw start and end timestamps using millisecond-accurate Whisper words.
        """
        # Baseline sanitize
        start = max(0.0, min(raw_start, video_duration - 1.0))
        end = min(video_duration, max(raw_end, start + 1.0))

        if not all_words:
            # If no word-level timestamps available, enforce bounds directly
            duration = end - start
            if duration < min_duration:
                end = min(video_duration, start + min_duration)
            elif duration > max_duration:
                end = start + max_duration
            return round(start, 2), round(end, 2)

        # 1. Snap Start: Find closest word
        start_idx = 0
        min_start_diff = float("inf")
        for i, w in enumerate(all_words):
            diff = abs(w.start - start)
            if diff < min_start_diff:
                min_start_diff = diff
                start_idx = i

        # Look back up to SENTENCE_LOOKBACK_MAX to find sentence capital or after terminal punct
        optimal_start_idx = start_idx
        lookback_limit = start - cls.SENTENCE_LOOKBACK_MAX
        for k in range(start_idx, -1, -1):
            if all_words[k].start < lookback_limit:
                break
            w_text = all_words[k].word.strip()
            # If preceding word ended with terminal punct, current word is sentence start
            if k > 0 and any(all_words[k - 1].word.endswith(p) for p in [".", "!", "?", "\n"]):
                optimal_start_idx = k
                break
            # Or if capital letter
            if w_text and w_text[0].isupper() and k < start_idx:
                optimal_start_idx = k

        snapped_start = max(0.0, all_words[optimal_start_idx].start - cls.PRE_ROLL_BUFFER_SECONDS)

        # 2. Snap End: Find closest word near raw_end
        end_idx = len(all_words) - 1
        min_end_diff = float("inf")
        for i in range(optimal_start_idx, len(all_words)):
            diff = abs(all_words[i].end - end)
            if diff < min_end_diff:
                min_end_diff = diff
                end_idx = i

        # Look forward or back to find terminal punctuation (within max_duration limit)
        optimal_end_idx = end_idx
        # Check forward up to 3 words
        for k in range(end_idx, min(len(all_words), end_idx + 4)):
            w = all_words[k]
            cand_dur = (w.end + cls.POST_ROLL_BUFFER_SECONDS) - snapped_start
            if cand_dur <= max_duration and any(w.word.endswith(p) for p in [".", "!", "?", ";"]):
                optimal_end_idx = k
                break

        snapped_end = min(video_duration, all_words[optimal_end_idx].end + cls.POST_ROLL_BUFFER_SECONDS)

        # 3. Final duration enforcement
        cur_duration = snapped_end - snapped_start
        if cur_duration < min_duration:
            # Expand end if possible
            if snapped_start + min_duration <= video_duration:
                snapped_end = snapped_start + min_duration
            else:
                snapped_start = max(0.0, snapped_end - min_duration)

        if (snapped_end - snapped_start) > max_duration:
            snapped_end = min(video_duration, snapped_start + max_duration)

        return round(snapped_start, 2), round(snapped_end, 2)

