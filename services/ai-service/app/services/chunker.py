import logging
from typing import List, Callable, Tuple
from app.schemas.transcript import WordTimestamp, TranscriptSegment
from app.config import settings

logger = logging.getLogger("clipforge.chunker")

class AudioChunker:
    """
    Handles chunking for long audio files (> 30 minutes).
    Maintains exact temporal offsets and resolves overlapping context boundaries.
    """

    def should_chunk(self, audio_duration_seconds: float) -> bool:
        return audio_duration_seconds > settings.chunk_threshold_seconds

    def generate_windows(
        self,
        total_duration: float,
        window_size: float = settings.chunk_window_seconds,
        overlap_size: float = settings.chunk_overlap_seconds,
    ) -> List[Tuple[float, float]]:
        """
        Generates [start_seconds, end_seconds] intervals with specified overlap.
        """
        if total_duration <= window_size:
            return [(0.0, total_duration)]

        windows: List[Tuple[float, float]] = []
        step = window_size - overlap_size
        start = 0.0

        while start < total_duration:
            end = min(start + window_size, total_duration)
            windows.append((round(start, 3), round(end, 3)))
            if end >= total_duration:
                break
            start += step

        return windows

    def merge_chunk_words(
        self,
        chunk_results: List[Tuple[float, List[WordTimestamp]]],
    ) -> List[WordTimestamp]:
        """
        Merges words extracted from overlapping windows into a continuous sequence.
        Offset start and end by window start, and deduplicate words occurring in the overlap zone.
        """
        if not chunk_results:
            return []

        if len(chunk_results) == 1:
            offset, words = chunk_results[0]
            if offset == 0.0:
                return words
            return [
                WordTimestamp(
                    word=w.word,
                    start=round(w.start + offset, 3),
                    end=round(w.end + offset, 3),
                    probability=w.probability,
                )
                for w in words
            ]

        merged: List[WordTimestamp] = []
        last_recorded_end = 0.0

        for offset, words in chunk_results:
            # Shift timestamps by window start offset
            shifted_words = [
                WordTimestamp(
                    word=w.word,
                    start=round(w.start + offset, 3),
                    end=round(w.end + offset, 3),
                    probability=w.probability,
                )
                for w in words
            ]

            if not merged:
                merged.extend(shifted_words)
                if merged:
                    last_recorded_end = merged[-1].end
                continue

            # In the overlap zone, skip words that were already captured in previous window
            for w in shifted_words:
                # If word starts after previous window's end, or if it represents new spoken content
                if w.start >= last_recorded_end - 0.15:
                    merged.append(w)
                    last_recorded_end = w.end

        return merged

audio_chunker = AudioChunker()

