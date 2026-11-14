import re
import logging
from typing import List, Optional, Tuple, Any, Dict
from app.schemas.transcript import TranscriptResponse, TranscriptSegment, WordTimestamp
from app.schemas.refinement import (
    RefinedBoundaryCandidate,
    BoundaryRefinementRequest,
    BoundaryRefinementResponse,
)

logger = logging.getLogger("clipforge.boundary_refinement")

TERMINAL_PUNCTUATION = re.compile(r"[.!?…]\s*$")
QUESTION_ENDING = re.compile(r"\?\s*$")

class IntelligentBoundaryRefiner:
    """
    Intelligent Boundary Refinement Engine that fine-tunes AI clip start/end timestamps.
    Preserves complete narrative thoughts, snaps to exact Whisper words, trims silence,
    binds Q&A pairs, and aligns to visual scene transitions.
    """

    PRE_ROLL_ACOUSTIC_BUFFER = 0.10   # 100ms speech onset lead-in
    POST_ROLL_ACOUSTIC_BUFFER = 0.18  # 180ms speech decay trail
    SCENE_CUT_TOLERANCE = 0.45        # Max delta to snap to visual shot boundary

    def _collect_all_words(self, segments: List[TranscriptSegment]) -> List[WordTimestamp]:
        """Flattens all word timestamps from segments in chronological order."""
        words: List[WordTimestamp] = []
        for s in segments:
            if s.words:
                words.extend(s.words)
            else:
                # Synthesize word approximation if segment lacks word timestamps
                seg_words = s.text.split()
                if seg_words:
                    dur_per_word = max(0.1, (s.end - s.start) / len(seg_words))
                    curr = s.start
                    for w in seg_words:
                        words.append(
                            WordTimestamp(
                                word=w,
                                start=round(curr, 2),
                                end=round(min(s.end, curr + dur_per_word * 0.9), 2),
                            )
                        )
                        curr += dur_per_word
        return sorted(words, key=lambda w: w.start)

    def _find_sentence_start_segment(
        self,
        raw_start: float,
        segments: List[TranscriptSegment],
    ) -> Tuple[int, bool]:
        """
        Locates the appropriate opening segment for the candidate.
        Includes backward Q&A binding if opening sentence is an answer to a question.
        Returns (segment_index, is_qa_bound).
        """
        start_idx = 0
        for i, s in enumerate(segments):
            if s.start <= raw_start <= s.end:
                start_idx = i
                break
            elif s.start > raw_start:
                if i > 0 and segments[i - 1].end < raw_start:
                    if TERMINAL_PUNCTUATION.search(segments[i - 1].text.strip()):
                        start_idx = i
                    else:
                        start_idx = i - 1
                else:
                    start_idx = max(0, i - 1)
                break

        # Check Q&A Binding:
        # If opening segment is answering a question, check preceding segment
        qa_bound = False
        if start_idx > 0:
            cur_text = segments[start_idx].text.strip()
            prev_seg = segments[start_idx - 1]
            prev_text = prev_seg.text.strip()

            # Indicators that current segment is an answer to a preceding question
            is_answer_indicator = bool(re.match(r"^(because|so|well|the reason is|my advice is|i think|absolutely|startups fail|we realized)\b", cur_text, re.IGNORECASE))
            prev_is_question = QUESTION_ENDING.search(prev_text) or bool(re.match(r"^(why|how|what|who|where|when|can you|could you)\b", prev_text, re.IGNORECASE))

            if prev_is_question or (is_answer_indicator and (prev_seg.speaker_id != segments[start_idx].speaker_id or prev_text.endswith("?"))):
                start_idx = start_idx - 1
                qa_bound = True

        return start_idx, qa_bound

    def _find_sentence_end_segment(
        self,
        start_seg_idx: int,
        raw_end: float,
        segments: List[TranscriptSegment],
        min_dur: float,
        max_dur: float,
    ) -> Tuple[int, bool, Optional[str]]:
        """
        Locates the concluding sentence segment ensuring the complete thought is preserved.
        Returns (end_segment_index, needs_review, review_reason).
        """
        start_time = segments[start_seg_idx].start
        target_end_idx = start_seg_idx

        # Find initial segment covering raw_end
        for i in range(start_seg_idx, len(segments)):
            s = segments[i]
            if s.start <= raw_end <= s.end:
                target_end_idx = i
                break
            elif s.end > raw_end:
                target_end_idx = i
                break

        # Search forward for terminal punctuation to prevent mid-sentence cutoff
        optimal_end_idx = target_end_idx
        found_terminal = False

        for k in range(target_end_idx, min(len(segments), target_end_idx + 4)):
            s_text = segments[k].text.strip()
            if TERMINAL_PUNCTUATION.search(s_text):
                optimal_end_idx = k
                found_terminal = True
                break

        if not found_terminal:
            # Fall back to target_end_idx
            optimal_end_idx = target_end_idx

        # Check duration constraint
        refined_end_time = segments[optimal_end_idx].end
        cur_duration = refined_end_time - start_time

        needs_review = False
        review_reason = None

        if cur_duration > max_dur:
            # NEVER destroy context to fit max_duration. Mark for review instead.
            needs_review = True
            review_reason = f"Candidate duration ({cur_duration:.1f}s) exceeds target max ({max_dur:.1f}s) to preserve complete sentence conclusion without mid-thought cutoff."

        return optimal_end_idx, needs_review, review_reason

    def _snap_words_and_trim_silence(
        self,
        start_seg: TranscriptSegment,
        end_seg: TranscriptSegment,
        all_words: List[WordTimestamp],
        video_duration: float,
    ) -> Tuple[float, float, bool]:
        """
        Snaps start and end to exact first and last word timestamps,
        trimming dead air and silence between sentences.
        """
        word_level_accurate = False

        # Filter words within segment bounds
        seg_words = [w for w in all_words if w.end >= start_seg.start and w.start <= end_seg.end]
        if seg_words:
            first_word = seg_words[0]
            last_word = seg_words[-1]

            # Acoustic lead-in buffer (avoid speech clipping, but trim dead silence)
            snapped_start = max(0.0, first_word.start - self.PRE_ROLL_ACOUSTIC_BUFFER)
            snapped_end = min(video_duration, last_word.end + self.POST_ROLL_ACOUSTIC_BUFFER)
            word_level_accurate = True
        else:
            snapped_start = max(0.0, start_seg.start)
            snapped_end = min(video_duration, end_seg.end)

        return round(snapped_start, 2), round(snapped_end, 2), word_level_accurate

    def _align_to_visual_cuts(
        self,
        start_time: float,
        end_time: float,
        scene_cuts: Optional[List[float]],
    ) -> Tuple[float, float, bool]:
        """
        Aligns boundaries to visual shot transitions when within tolerance.
        Prevents jarring mid-camera transition cuts.
        """
        if not scene_cuts:
            return start_time, end_time, False

        aligned_start = start_time
        aligned_end = end_time
        visual_aligned = False

        for cut in scene_cuts:
            if abs(cut - start_time) <= self.SCENE_CUT_TOLERANCE:
                aligned_start = cut
                visual_aligned = True
            if abs(cut - end_time) <= self.SCENE_CUT_TOLERANCE:
                aligned_end = cut
                visual_aligned = True

        return round(aligned_start, 2), round(aligned_end, 2), visual_aligned

    def refine_candidate(
        self,
        candidate_id: str,
        raw_start: float,
        raw_end: float,
        segments: List[TranscriptSegment],
        all_words: List[WordTimestamp],
        video_duration: float,
        min_duration: float = 15.0,
        max_duration: float = 60.0,
        scene_cuts: Optional[List[float]] = None,
    ) -> RefinedBoundaryCandidate:
        """
        Refines a single candidate moment to exact millisecond sentence and word boundaries.
        """
        if not segments:
            # Fallback if transcript empty
            s_clean = max(0.0, min(raw_start, video_duration - 1.0))
            e_clean = min(video_duration, max(raw_end, s_clean + min_duration))
            return RefinedBoundaryCandidate(
                candidate_id=candidate_id,
                refined_start=round(s_clean, 2),
                refined_end=round(e_clean, 2),
                duration=round(e_clean - s_clean, 2),
                opening_context="Opening boundary.",
                closing_context="Closing boundary.",
                boundary_confidence=0.70,
                word_level_accurate=False,
            )

        # 1. Identify opening sentence segment (with Q&A binding if necessary)
        start_seg_idx, qa_bound = self._find_sentence_start_segment(raw_start, segments)
        start_seg = segments[start_seg_idx]

        # 2. Identify closing sentence segment (preserving full sentence without cutting)
        end_seg_idx, needs_review, review_reason = self._find_sentence_end_segment(
            start_seg_idx=start_seg_idx,
            raw_end=raw_end,
            segments=segments,
            min_dur=min_duration,
            max_dur=max_duration,
        )
        end_seg = segments[end_seg_idx]

        # 3. Word-level snapping and silence trimming
        snapped_start, snapped_end, word_accurate = self._snap_words_and_trim_silence(
            start_seg=start_seg,
            end_seg=end_seg,
            all_words=all_words,
            video_duration=video_duration,
        )

        # 4. Visual scene cut alignment (optional)
        final_start, final_end, visual_aligned = self._align_to_visual_cuts(
            start_time=snapped_start,
            end_time=snapped_end,
            scene_cuts=scene_cuts,
        )

        # 5. Sanitize duration and bounds against video bounds
        final_start = max(0.0, min(final_start, video_duration - 2.0))
        final_end = min(video_duration, max(final_end, final_start + 1.0))
        duration = round(final_end - final_start, 2)

        # 6. Context summaries
        opening_summary = f"Opens cleanly at [{start_seg.speaker_id}]: \"{start_seg.text[:55]}...\""
        closing_summary = f"Concludes fully at [{end_seg.speaker_id}]: \"{end_seg.text[:55]}...\""

        # 7. Confidence score
        confidence = 0.95
        if not word_accurate:
            confidence -= 0.10
        if needs_review:
            confidence -= 0.05
        if qa_bound:
            confidence += 0.02
        if visual_aligned:
            confidence += 0.02

        confidence = round(max(0.60, min(0.99, confidence)), 2)

        return RefinedBoundaryCandidate(
            candidate_id=candidate_id,
            refined_start=final_start,
            refined_end=final_end,
            duration=duration,
            opening_context=opening_summary,
            closing_context=closing_summary,
            boundary_confidence=confidence,
            needs_review=needs_review,
            review_reason=review_reason,
            qa_bound=qa_bound,
            visual_aligned=visual_aligned,
            word_level_accurate=word_accurate,
        )

    def refine_all_candidates(
        self,
        request: BoundaryRefinementRequest,
    ) -> BoundaryRefinementResponse:
        """
        Executes boundary refinement across a batch of candidates for a project.
        """
        transcript: Optional[TranscriptResponse] = request.transcript
        if isinstance(transcript, dict):
            try:
                transcript = TranscriptResponse.model_validate(transcript)
            except Exception as e:
                logger.warning(f"Failed to validate transcript dict: {e}")
        segments = transcript.segments if transcript else []
        all_words = self._collect_all_words(segments) if segments else []

        refined_list: List[RefinedBoundaryCandidate] = []
        for cand in request.candidates:
            # Extract attributes from dict or Pydantic object
            if hasattr(cand, "candidate_id"):
                c_id = cand.candidate_id
                r_start = getattr(cand, "start_time", getattr(cand, "start", 0.0))
                r_end = getattr(cand, "end_time", getattr(cand, "end", r_start + 15.0))
            elif isinstance(cand, dict):
                c_id = str(cand.get("candidate_id", "cand_001"))
                r_start = float(cand.get("start_time", cand.get("start", 0.0)))
                r_end = float(cand.get("end_time", cand.get("end", r_start + 15.0)))
            else:
                continue

            refined = self.refine_candidate(
                candidate_id=c_id,
                raw_start=r_start,
                raw_end=r_end,
                segments=segments,
                all_words=all_words,
                video_duration=request.video_duration,
                min_duration=request.min_duration,
                max_duration=request.max_duration,
                scene_cuts=request.scene_cut_timestamps,
            )
            refined_list.append(refined)

        return BoundaryRefinementResponse(
            project_id=request.project_id,
            total_refined=len(refined_list),
            refined_candidates=refined_list,
        )

    refine_boundaries = refine_all_candidates

intelligent_boundary_refiner = IntelligentBoundaryRefiner()
