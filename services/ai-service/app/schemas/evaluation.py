from enum import Enum
from typing import List, Optional, Dict, Any, Tuple
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone
from app.schemas.transcript import TranscriptResponse
from app.schemas.highlight import HighlightCategory

class RejectionReasonEnum(str, Enum):
    NOT_VALUABLE = "not_valuable"
    WRONG_CATEGORY = "wrong_category"
    CUT_TOO_EARLY = "cut_too_early"
    CUT_TOO_LATE = "cut_too_late"
    BORING_HOOK = "boring_hook"
    INCOMPLETE_CONTEXT = "incomplete_context"
    UNNATURAL_ENDING = "unnatural_ending"
    DUPLICATE = "duplicate"
    HALLUCINATED_OR_DISAGREES = "hallucinated_or_disagrees"
    OTHER = "other"

class GroundTruthMoment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    moment_id: str
    expected_category: HighlightCategory
    acceptable_categories: List[HighlightCategory] = Field(default_factory=list)
    true_start: float = Field(..., ge=0.0)
    true_end: float = Field(..., ge=0.0)
    summary: str
    core_quote: str
    human_approval: bool = True
    min_acceptable_start: Optional[float] = None
    max_acceptable_end: Optional[float] = None

class BenchmarkVideoDataset(BaseModel):
    model_config = ConfigDict(extra="ignore")

    benchmark_id: str
    title: str
    genre: str
    duration_seconds: float = Field(..., gt=0.0)
    transcript: TranscriptResponse
    ground_truth_moments: List[GroundTruthMoment] = Field(default_factory=list)
    is_noise_only: bool = False

class HumanClipReview(BaseModel):
    model_config = ConfigDict(extra="ignore")

    review_id: str
    clip_id: str
    project_id: str
    is_good: bool
    rating: int = Field(default=4, ge=1, le=5, description="1 to 5 star rating")
    corrected_category: Optional[str] = None
    corrected_start: Optional[float] = None
    corrected_end: Optional[float] = None
    rejection_reason: Optional[RejectionReasonEnum] = None
    rejection_detail: Optional[str] = None
    reviewer_id: str = "reviewer_qa"
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EvaluationMetricResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    category: str
    total_ground_truth: int = 0
    total_predicted: int = 0
    true_positives: int = 0
    false_positives: int = 0
    false_negatives: int = 0
    precision: float = 0.0
    recall: float = 0.0
    f1_score: float = 0.0
    category_accuracy: float = 0.0
    average_boundary_iou: float = 0.0
    average_edge_delta_seconds: float = 0.0
    duplicate_rate: float = 0.0
    human_approval_rate: float = 0.0

class EvaluationReport(BaseModel):
    model_config = ConfigDict(extra="ignore")

    evaluated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    total_benchmarks_evaluated: int
    total_clips_generated: int
    overall_precision: float
    overall_recall: float
    overall_f1: float
    overall_category_accuracy: float
    overall_boundary_iou: float
    noise_video_false_positive_rate: float
    duplicate_selection_rate: float
    human_approval_rate: float
    category_metrics: Dict[str, EvaluationMetricResult] = Field(default_factory=dict)
    failure_cases: List[Dict[str, Any]] = Field(default_factory=list)
    regression_passed: bool = True
