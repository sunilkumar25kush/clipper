import re
import logging
from typing import List, Tuple, Optional
from app.schemas.transcript import TranscriptSegment

logger = logging.getLogger("clipforge.semantic_chunker")

# Discourse transition markers signaling thematic shift
TOPIC_SHIFT_PATTERNS = [
    re.compile(r"\b(now let's talk about|moving on to|transition to|next topic|turning to|another key point|on the other hand|let's discuss|to summarize|in summary)\b", re.IGNORECASE),
    re.compile(r"\b(first of all|secondly|thirdly|finally|the main reason is|here is the thing|switch gears)\b", re.IGNORECASE),
    re.compile(r"\b(let me tell you a story|i remember when|for example|for instance|a few years ago)\b", re.IGNORECASE),
]

class RawSemanticChunk:
    """Internal representation of a clustered semantic section before LLM intelligence analysis."""
    def __init__(
        self,
        chunk_id: str,
        start_time: float,
        end_time: float,
        segments: List[TranscriptSegment],
        has_question: bool = False,
        speaker_ids: List[str] = None,
    ):
        self.chunk_id = chunk_id
        self.start_time = round(start_time, 3)
        self.end_time = round(end_time, 3)
        self.segments = segments
        self.has_question = has_question
        self.speaker_ids = speaker_ids or []
        self.full_text = " ".join(s.text.strip() for s in segments)
        self.duration = round(self.end_time - self.start_time, 3)

class SemanticChunker:
    """
    Intelligently clusters transcript segments into natural conversational units
    based on speaker turns, complete thoughts, QA pairs, and topic transitions.
    """

    def __init__(
        self,
        min_chunk_duration: float = 40.0,
        target_chunk_duration: float = 120.0,
        max_chunk_duration: float = 240.0,
        overlap_segments: int = 1,
    ):
        self.min_chunk_duration = min_chunk_duration
        self.target_chunk_duration = target_chunk_duration
        self.max_chunk_duration = max_chunk_duration
        self.overlap_segments = overlap_segments

    def _is_sentence_terminal(self, text: str) -> bool:
        """Checks if text ends with conclusive terminal punctuation."""
        stripped = text.strip()
        return bool(re.search(r"[.!?…]\s*$", stripped))

    def _has_topic_shift(self, text: str) -> bool:
        """Detects whether text introduces a new topic or story."""
        return any(pat.search(text) for pat in TOPIC_SHIFT_PATTERNS)

    def _is_question(self, text: str) -> bool:
        """Determines if segment poses a question that expects an answer."""
        stripped = text.strip()
        if stripped.endswith("?"):
            return True
        return bool(re.search(r"\b(why|how|what|who|where|when)\s+(?:do|did|does|is|are|was|were|can|could|would|should|will)\b", stripped, re.IGNORECASE))

    def chunk_transcript(
        self,
        segments: List[TranscriptSegment],
        min_duration: Optional[float] = None,
        max_duration: Optional[float] = None,
        target_duration: Optional[float] = None,
        overlap_duration: Optional[float] = None,
        overlap_segments: Optional[int] = None,
        **kwargs,
    ) -> List[RawSemanticChunk]:
        """
        Groups cleaned transcript segments into semantically coherent, complete conversation chunks.
        """
        if not segments:
            return []

        eff_min = min_duration if min_duration is not None else self.min_chunk_duration
        eff_max = max_duration if max_duration is not None else self.max_chunk_duration
        eff_target = target_duration if target_duration is not None else min(eff_max * 0.7, self.target_chunk_duration)
        eff_overlap_segs = overlap_segments if overlap_segments is not None else self.overlap_segments

        chunks: List[RawSemanticChunk] = []
        n = len(segments)
        current_chunk_segments: List[TranscriptSegment] = []
        chunk_idx = 1
        waiting_for_answer = False

        i = 0
        while i < n:
            seg = segments[i]
            current_chunk_segments.append(seg)

            cur_start = current_chunk_segments[0].start
            cur_end = seg.end
            cur_duration = cur_end - cur_start

            # Track question-and-answer continuity
            if self._is_question(seg.text):
                waiting_for_answer = True
            elif waiting_for_answer and self._is_sentence_terminal(seg.text):
                waiting_for_answer = False

            # Check next segment for transition cues if available
            has_next = i + 1 < n
            next_seg = segments[i + 1] if has_next else None

            # Calculate decision criteria
            sentence_ended = self._is_sentence_terminal(seg.text)
            next_is_topic_shift = next_seg and self._has_topic_shift(next_seg.text)
            speaker_transition = next_seg and (next_seg.speaker_id != seg.speaker_id)
            silence_gap = next_seg and (next_seg.start - seg.end > 1.4)
            exceeds_target = cur_duration >= eff_target
            exceeds_max = cur_duration >= eff_max

            # Boundary Decision:
            # 1. Do NOT break if waiting for answer to a question (unless past max duration)
            # 2. Do NOT break mid-sentence (must end cleanly with sentence punctuation)
            # 3. Break if past min_duration AND (topic shift OR speaker transition after complete answer OR silence gap OR exceeds target)
            should_break = False

            if not has_next:
                should_break = True
            elif sentence_ended and not waiting_for_answer and cur_duration >= eff_min:
                if exceeds_max:
                    should_break = True
                elif next_is_topic_shift:
                    should_break = True
                elif silence_gap and (exceeds_target or speaker_transition):
                    should_break = True
                elif exceeds_target and speaker_transition:
                    should_break = True
            elif exceeds_max:
                # Force break at sentence end, or unconditionally if duration exceeds max * 1.25 when punctuation is absent
                if sentence_ended or cur_duration >= eff_max * 1.25 or silence_gap or speaker_transition:
                    should_break = True

            if should_break and current_chunk_segments:
                chunk_id = f"chunk_{chunk_idx:03d}"
                speakers = sorted(list({s.speaker_id for s in current_chunk_segments}))
                has_q = any(self._is_question(s.text) for s in current_chunk_segments)

                raw_chunk = RawSemanticChunk(
                    chunk_id=chunk_id,
                    start_time=current_chunk_segments[0].start,
                    end_time=current_chunk_segments[-1].end,
                    segments=list(current_chunk_segments),
                    has_question=has_q,
                    speaker_ids=speakers,
                )
                chunks.append(raw_chunk)
                chunk_idx += 1

                # Carry over overlap segments for narrative continuity
                if has_next and (eff_overlap_segs > 0 or (overlap_duration and overlap_duration > 0)):
                    if overlap_duration and overlap_duration > 0:
                        acc_dur = 0.0
                        overlap_seed = []
                        for s in reversed(current_chunk_segments):
                            acc_dur += (s.end - s.start)
                            overlap_seed.insert(0, s)
                            if acc_dur >= overlap_duration:
                                break
                        current_chunk_segments = list(overlap_seed) if len(overlap_seed) < len(current_chunk_segments) else []
                    else:
                        overlap_count = min(len(current_chunk_segments), eff_overlap_segs)
                        overlap_seed = current_chunk_segments[-overlap_count:]
                        current_chunk_segments = list(overlap_seed)
                else:
                    current_chunk_segments = []

                waiting_for_answer = False

            i += 1

        # Handle any trailing segments
        if current_chunk_segments:
            chunk_id = f"chunk_{chunk_idx:03d}"
            speakers = sorted(list({s.speaker_id for s in current_chunk_segments}))
            raw_chunk = RawSemanticChunk(
                chunk_id=chunk_id,
                start_time=current_chunk_segments[0].start,
                end_time=current_chunk_segments[-1].end,
                segments=current_chunk_segments,
                has_question=any(self._is_question(s.text) for s in current_chunk_segments),
                speaker_ids=speakers,
            )
            # If the last chunk is very small (< 15s) and previous chunk exists, merge with previous
            if chunks and raw_chunk.duration < 15.0:
                prev = chunks[-1]
                prev.end_time = raw_chunk.end_time
                prev.segments.extend(raw_chunk.segments)
                prev.full_text = " ".join(s.text.strip() for s in prev.segments)
                prev.duration = round(prev.end_time - prev.start_time, 3)
            else:
                chunks.append(raw_chunk)

        return chunks

semantic_chunker = SemanticChunker()
