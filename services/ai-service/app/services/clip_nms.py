from typing import List
from app.schemas.clip import ClipCandidate

class TemporalNMS:
    """
    Temporal Non-Maximum Suppression (NMS) for video clip candidates.
    Eliminates redundant, highly overlapping, or duplicate clip proposals.
    """

    @staticmethod
    def compute_iou(start_a: float, end_a: float, start_b: float, end_b: float) -> float:
        intersection = max(0.0, min(end_a, end_b) - max(start_a, start_b))
        if intersection <= 0.0:
            return 0.0
        union = max(end_a, end_b) - min(start_a, start_b)
        if union <= 0.0:
            return 0.0
        return intersection / union

    @staticmethod
    def compute_overlap_ratio(start_a: float, end_a: float, start_b: float, end_b: float) -> float:
        intersection = max(0.0, min(end_a, end_b) - max(start_a, start_b))
        if intersection <= 0.0:
            return 0.0
        dur_a = max(0.01, end_a - start_a)
        dur_b = max(0.01, end_b - start_b)
        return intersection / min(dur_a, dur_b)

    @classmethod
    def filter_candidates(
        cls,
        candidates: List[ClipCandidate],
        iou_threshold: float = 0.15,
        overlap_threshold: float = 0.30,
        max_clips: int = 10,
    ) -> List[ClipCandidate]:
        """
        Suppresses overlapping candidates in favor of the higher-scoring clip.
        """
        if not candidates:
            return []

        # 1. Sort candidates descending by overall score, tie-breaking by hook score
        sorted_candidates = sorted(
            candidates,
            key=lambda c: (c.scores.overall, c.scores.hook, c.scores.engagement),
            reverse=True,
        )

        selected: List[ClipCandidate] = []

        for candidate in sorted_candidates:
            keep = True
            for accepted in selected:
                iou = cls.compute_iou(candidate.start, candidate.end, accepted.start, accepted.end)
                overlap = cls.compute_overlap_ratio(candidate.start, candidate.end, accepted.start, accepted.end)

                if iou > iou_threshold or overlap > overlap_threshold:
                    keep = False
                    break

            if keep:
                selected.append(candidate)
                if len(selected) >= max_clips:
                    break

        return selected

