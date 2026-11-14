import re
import logging
from typing import List, Optional, Tuple
from app.schemas.transcript import TranscriptSegment, WordTimestamp, TranscriptResponse

logger = logging.getLogger("clipforge.transcript_cleaner")

class CleanerStats:
    def __init__(self, artifacts_removed: int = 0, repetitions_collapsed: int = 0):
        self.artifacts_removed = artifacts_removed
        self.repetitions_collapsed = repetitions_collapsed

# Regex patterns for non-speech noise and transcription artifacts
NOISE_PATTERNS = [
    re.compile(r"\[[^\]]*(?:music|applause|laughter|giggle|cough|sigh|cheering|silence|inaudible)[^\]]*\]", re.IGNORECASE),
    re.compile(r"\([^)]*(?:music|applause|laughter|giggle|cough|sigh|cheering|silence|inaudible)[^)]*\)", re.IGNORECASE),
    re.compile(r"(\*+|_+)"),
]

# Punctuation normalization patterns
MULTIPLE_PUNCT = re.compile(r"([,.!?;:])\1+")
SPACE_BEFORE_PUNCT = re.compile(r"\s+([,.!?;:])")
SPACE_AFTER_PUNCT = re.compile(r"([,.!?;:])(?=[A-Za-z0-9])")
MULTIPLE_SPACES = re.compile(r"\s+")

class TranscriptCleaner:
    """
    Cleans and standardizes raw Whisper / faster-whisper transcripts.
    Removes artifacts and hallucinations while strictly preserving original meaning,
    speaker identities, and accurate monotonic timestamps.
    """

    @classmethod
    def clean_text(cls, text: str) -> str:
        """
        Cleans transcription artifacts, normalizes punctuation, and removes noise tags.
        """
        if not text:
            return ""

        cleaned = text.strip()

        # Remove non-speech audio bracketed tags
        for pat in NOISE_PATTERNS:
            cleaned = pat.sub("", cleaned)

        # Normalize punctuation and spacing
        cleaned = MULTIPLE_PUNCT.sub(r"\1", cleaned)
        cleaned = SPACE_BEFORE_PUNCT.sub(r"\1", cleaned)
        cleaned = SPACE_AFTER_PUNCT.sub(r"\1 ", cleaned)
        cleaned = MULTIPLE_SPACES.sub(" ", cleaned).strip()

        # Collapse repetitive word loops (e.g., "word word word word" -> "word")
        cleaned = re.sub(r"\b(\w+)(?:\s+\1\b){2,}", r"\1", cleaned, flags=re.IGNORECASE)

        # Collapse repetitive phrase loops (e.g., "Thank you. Thank you. Thank you." -> "Thank you.")
        cleaned = re.sub(r"(\b[A-Za-z]+(?:\s+[A-Za-z]+){0,2}[.!?]?)(?:\s+\1){2,}", r"\1", cleaned, flags=re.IGNORECASE)

        return cleaned

    @classmethod
    def clean_segments(
        cls,
        segments: List[TranscriptSegment],
        min_word_duration: float = 0.04,
    ) -> List[TranscriptSegment]:
        """
        Cleans, validates, and normalizes a list of transcript segments.
        Guarantees strict monotonic timestamps and non-empty valid content.
        """
        if not segments:
            return []

        cleaned_segments: List[TranscriptSegment] = []
        last_end_time = 0.0

        for seg in segments:
            # Clean text
            cleaned_text = cls.clean_text(seg.text)
            if not cleaned_text:
                continue

            # Check if text is only punctuation
            if not re.search(r"\w", cleaned_text):
                continue

            # Validate timestamps
            start = max(0.0, float(seg.start))
            end = float(seg.end)

            # Ensure start is monotonically ordered
            if start < last_end_time:
                # Slight overlap correction (within 1.5s tolerance)
                if abs(start - last_end_time) <= 1.5:
                    start = max(start, last_end_time)
                else:
                    # Inversion error: enforce minimum start
                    start = last_end_time

            # Ensure end is strictly after start
            if end <= start:
                word_count = max(1, len(cleaned_text.split()))
                end = round(start + max(0.5, word_count * 0.25), 3)

            # Clean word-level tokens if present
            cleaned_words: List[WordTimestamp] = []
            if seg.words:
                prev_w_end = start
                for w in seg.words:
                    w_text = cls.clean_text(w.word)
                    if not w_text or not re.search(r"\w", w_text):
                        continue

                    w_start = max(start, float(w.start))
                    if w_start < prev_w_end:
                        w_start = prev_w_end

                    w_end = max(w_start + min_word_duration, float(w.end))
                    if w_end > end:
                        end = w_end

                    cleaned_words.append(
                        WordTimestamp(
                            word=w_text,
                            start=round(w_start, 3),
                            end=round(w_end, 3),
                            probability=round(float(w.probability or 1.0), 3),
                        )
                    )
                    prev_w_end = w_end

            # Ensure speaker_id is preserved and formatted
            speaker_id = (seg.speaker_id or "SPEAKER_00").strip()
            if not speaker_id:
                speaker_id = "SPEAKER_00"

            # Compute clean confidence
            confidence = float(seg.confidence or 1.0)
            if cleaned_words:
                confidence = sum(w.probability for w in cleaned_words) / len(cleaned_words)

            cleaned_seg = TranscriptSegment(
                start=round(start, 3),
                end=round(end, 3),
                text=cleaned_text,
                speaker_id=speaker_id,
                confidence=round(confidence, 3),
                words=cleaned_words,
            )

            cleaned_segments.append(cleaned_seg)
            last_end_time = cleaned_seg.end

        return cleaned_segments

    @classmethod
    def clean_transcript(cls, transcript: TranscriptResponse) -> Tuple[TranscriptResponse, CleanerStats]:
        """
        Cleans entire TranscriptResponse, standardizing segments, words, and word counts.
        """
        raw_seg_count = len(transcript.segments)
        cleaned_segs = cls.clean_segments(transcript.segments)

        total_words = 0
        for s in cleaned_segs:
            if s.words:
                total_words += len(s.words)
            else:
                total_words += len(s.text.split())

        cleaned_tr = transcript.model_copy(
            update={
                "segments": cleaned_segs,
                "word_count": total_words,
            }
        )
        stats = CleanerStats(
            artifacts_removed=max(0, raw_seg_count - len(cleaned_segs)),
            repetitions_collapsed=0,
        )
        return cleaned_tr, stats

transcript_cleaner = TranscriptCleaner()
