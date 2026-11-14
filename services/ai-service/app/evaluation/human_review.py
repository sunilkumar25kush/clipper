import os
import json
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
from app.schemas.evaluation import HumanClipReview, RejectionReasonEnum

logger = logging.getLogger("clipforge.human_review")

class HumanReviewStore:
    """
    Manages persistent storage and querying of human evaluation reviews.
    Enables human-in-the-loop QA, category corrections, timestamp adjustments,
    and ground-truth dataset curation without relying solely on AI evaluations.
    """

    def __init__(self, storage_dir: Optional[str] = None):
        if storage_dir is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            storage_dir = os.path.join(base_dir, "data", "human_reviews")
        self.storage_dir = storage_dir
        os.makedirs(self.storage_dir, exist_ok=True)

    def _get_project_file(self, project_id: str) -> str:
        safe_id = "".join(c for c in project_id if c.isalnum() or c in ("-", "_"))
        return os.path.join(self.storage_dir, f"{safe_id}.json")

    def submit_review(self, review: HumanClipReview) -> HumanClipReview:
        """Saves or updates a human review for a clip."""
        filepath = self._get_project_file(review.project_id)
        existing_reviews: List[Dict[str, Any]] = []

        if os.path.exists(filepath):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    existing_reviews = json.load(f)
            except Exception as e:
                logger.warning(f"Failed to read existing reviews from {filepath}: {e}")

        # Replace review if already reviewed by this reviewer for this clip, otherwise append
        updated = False
        review_dict = review.model_dump(mode="json")
        for i, item in enumerate(existing_reviews):
            if item.get("clip_id") == review.clip_id and item.get("reviewer_id") == review.reviewer_id:
                existing_reviews[i] = review_dict
                updated = True
                break

        if not updated:
            existing_reviews.append(review_dict)

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(existing_reviews, f, indent=2)

        logger.info(f"Recorded human review {review.review_id} for clip {review.clip_id} in project {review.project_id}")
        return review

    def get_project_reviews(self, project_id: str) -> List[HumanClipReview]:
        """Retrieves all human reviews recorded for a specific project."""
        filepath = self._get_project_file(project_id)
        if not os.path.exists(filepath):
            return []

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            return [HumanClipReview.model_validate(item) for item in data]
        except Exception as e:
            logger.error(f"Error loading human reviews for project {project_id}: {e}")
            return []

    def get_all_reviews(self) -> List[HumanClipReview]:
        """Loads all human reviews across all projects in the store."""
        all_reviews: List[HumanClipReview] = []
        if not os.path.exists(self.storage_dir):
            return []

        for filename in os.listdir(self.storage_dir):
            if filename.endswith(".json"):
                fp = os.path.join(self.storage_dir, filename)
                try:
                    with open(fp, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        for item in data:
                            all_reviews.append(HumanClipReview.model_validate(item))
                except Exception as e:
                    logger.debug(f"Error reading review file {fp}: {e}")

        return all_reviews

    def compute_human_metrics(self) -> Dict[str, Any]:
        """Computes aggregate human approval rates and rejection reason distribution."""
        reviews = self.get_all_reviews()
        if not reviews:
            return {
                "total_reviews": 0,
                "approved_count": 0,
                "rejected_count": 0,
                "approval_rate": 0.0,
                "average_rating": 0.0,
                "rejection_reasons_breakdown": {},
            }

        total = len(reviews)
        approved = sum(1 for r in reviews if r.is_good)
        rejected = total - approved
        avg_rating = sum(r.rating for r in reviews) / total

        breakdown: Dict[str, int] = {}
        for r in reviews:
            if not r.is_good and r.rejection_reason:
                reason = r.rejection_reason.value if hasattr(r.rejection_reason, "value") else str(r.rejection_reason)
                breakdown[reason] = breakdown.get(reason, 0) + 1

        return {
            "total_reviews": total,
            "approved_count": approved,
            "rejected_count": rejected,
            "approval_rate": round(approved / total, 3),
            "average_rating": round(avg_rating, 2),
            "rejection_reasons_breakdown": breakdown,
        }

human_review_store = HumanReviewStore()

