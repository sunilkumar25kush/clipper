import logging
from typing import List, Optional
from app.schemas.transcript import WordTimestamp, TranscriptSegment, SpeakerTurn

logger = logging.getLogger("clipforge.diarizer")

class DiarizationService:
    """
    Performs speaker diarization and aligns speaker turns with word-level timestamps.
    """

    def align_words_to_speakers(
        self,
        words: List[WordTimestamp],
        speaker_turns: List[SpeakerTurn],
        default_speaker: str = "SPEAKER_00",
    ) -> List[TranscriptSegment]:
        """
        Assign each word to the speaker turn with the greatest temporal overlap.
        Groups consecutive words from the same speaker into coherent TranscriptSegment objects.
        """
        if not words:
            return []

        if not speaker_turns:
            # Single speaker fallback
            full_text = " ".join(w.word.strip() for w in words)
            avg_conf = sum(w.probability for w in words) / max(len(words), 1)
            return [
                TranscriptSegment(
                    start=words[0].start,
                    end=words[-1].end,
                    text=full_text,
                    speaker_id=default_speaker,
                    confidence=round(avg_conf, 3),
                    words=words,
                )
            ]

        # 1. Assign each word to best speaker turn
        annotated_words: List[tuple[WordTimestamp, str]] = []
        for word in words:
            best_speaker = default_speaker
            max_overlap = 0.0

            for turn in speaker_turns:
                # Calculate temporal intersection
                overlap_start = max(word.start, turn.start)
                overlap_end = min(word.end, turn.end)
                overlap = max(0.0, overlap_end - overlap_start)

                if overlap > max_overlap:
                    max_overlap = overlap
                    best_speaker = turn.speaker_id

            # If word fell in between turns, find closest turn
            if max_overlap == 0.0:
                closest_turn = min(
                    speaker_turns,
                    key=lambda t: min(abs(word.start - t.end), abs(word.end - t.start)),
                )
                best_speaker = closest_turn.speaker_id

            annotated_words.append((word, best_speaker))

        # 2. Group consecutive words sharing the same speaker into segments
        segments: List[TranscriptSegment] = []
        current_speaker: Optional[str] = None
        current_words: List[WordTimestamp] = []

        for word, speaker in annotated_words:
            # Check for speaker boundary or prolonged pause (> 2.5 seconds)
            pause_detected = current_words and (word.start - current_words[-1].end > 2.5)
            
            if current_speaker is None:
                current_speaker = speaker
                current_words.append(word)
            elif current_speaker == speaker and not pause_detected:
                current_words.append(word)
            else:
                # Flush segment
                segment_text = " ".join(w.word.strip() for w in current_words)
                avg_prob = sum(w.probability for w in current_words) / max(len(current_words), 1)
                segments.append(
                    TranscriptSegment(
                        start=current_words[0].start,
                        end=current_words[-1].end,
                        text=segment_text,
                        speaker_id=current_speaker,
                        confidence=round(avg_prob, 3),
                        words=list(current_words),
                    )
                )
                current_speaker = speaker
                current_words = [word]

        # Flush final group
        if current_words and current_speaker is not None:
            segment_text = " ".join(w.word.strip() for w in current_words)
            avg_prob = sum(w.probability for w in current_words) / max(len(current_words), 1)
            segments.append(
                TranscriptSegment(
                    start=current_words[0].start,
                    end=current_words[-1].end,
                    text=segment_text,
                    speaker_id=current_speaker,
                    confidence=round(avg_prob, 3),
                    words=list(current_words),
                )
            )

        return segments

    def estimate_speaker_turns_from_energy(
        self,
        words: List[WordTimestamp],
        num_speakers: Optional[int] = None,
    ) -> List[SpeakerTurn]:
        """
        Energy/pause heuristic turn estimator when heavy Pyannote torch models are disabled.
        Alternates speakers after conversational pauses (> 1.2s silence).
        """
        if not words:
            return []

        turns: List[SpeakerTurn] = []
        target_speakers = num_speakers or 2
        speaker_idx = 0

        turn_start = words[0].start
        last_end = words[0].end

        for i in range(1, len(words)):
            word = words[i]
            pause_duration = word.start - last_end

            # Natural dialogue pause threshold
            if pause_duration >= 1.2:
                turns.append(
                    SpeakerTurn(
                        start=turn_start,
                        end=last_end,
                        speaker_id=f"SPEAKER_{speaker_idx % target_speakers:02d}",
                    )
                )
                speaker_idx += 1
                turn_start = word.start

            last_end = word.end

        # Append final turn
        turns.append(
            SpeakerTurn(
                start=turn_start,
                end=last_end,
                speaker_id=f"SPEAKER_{speaker_idx % target_speakers:02d}",
            )
        )

        return turns

diarization_service = DiarizationService()

