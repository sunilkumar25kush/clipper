from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict, model_validator
from app.schemas.highlight import HighlightCandidate, HighlightCategory

class ScoringDecision(str, Enum):
    APPROVED = "approved"
    REVIEW = "review"
    REJECTED = "rejected"

class CandidateScores(BaseModel):
    model_config = ConfigDict(extra="ignore")

    content_value: float = Field(..., ge=0.0, le=100.0, description="Substantive value, density of actionable ideas or facts")
    hook_strength: float = Field(..., ge=0.0, le=100.0, description="Strength of the opening 3-5s pattern interrupt")
    engagement: float = Field(..., ge=0.0, le=100.0, description="Pacing, conversational dynamism, energy")
    context: float = Field(..., ge=0.0, le=100.0, description="Context completeness (setup, event, resolution)")
    emotional_interest: float = Field(default=70.0, ge=0.0, le=100.0, description="Vulnerability, inspiration, or intensity")
    educational_value: float = Field(default=70.0, ge=0.0, le=100.0, description="Actionable frameworks, explanations, clarity")
    humor_quality: float = Field(default=50.0, ge=0.0, le=100.0, description="Wit, punchline delivery, genuine humor")
    storytelling_quality: float = Field(default=70.0, ge=0.0, le=100.0, description="Narrative arc with setup, conflict, payoff")
    ending_quality: float = Field(default=75.0, ge=0.0, le=100.0, description="Conclusive, satisfying wrap-up without cutoff")
    standalone_quality: float = Field(default=80.0, ge=0.0, le=100.0, description="Self-contained comprehension for new viewers")

    def to_category_scores_dict(self) -> Dict[str, int]:
        """Converts key scoring dimensions to integer dictionary for UI presentation."""
        return {
            "content_value": round(self.content_value),
            "hook_strength": round(self.hook_strength),
            "context": round(self.context),
            "engagement": round(self.engagement),
            "emotional_interest": round(self.emotional_interest),
            "educational_value": round(self.educational_value),
            "humor_quality": round(self.humor_quality),
            "storytelling_quality": round(self.storytelling_quality),
            "ending_quality": round(self.ending_quality),
            "standalone_quality": round(self.standalone_quality),
        }

class ScoredHighlightCandidate(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    candidate_id: str
    category: HighlightCategory
    start_time: float
    end_time: float
    duration: float
    title: str
    summary: str
    hook: str
    reason: str
    context_summary: str
    overall_score: int = Field(..., ge=0, le=100, description="Weighted composite score")
    category_scores: Dict[str, int] = Field(default_factory=dict, description="Component dimension scores")
    decision: ScoringDecision = Field(..., description="approved, review, or rejected")
    rejection_reasons: List[str] = Field(default_factory=list, description="Quality gate failure explanations")
    ranking_explanation: str = Field(..., description="Justification of quality and standalone suitability")
    rank: Optional[int] = Field(default=None, description="Final rank order among selected clips")
    transcript_evidence: List[Any] = Field(default_factory=list)

class ScoringRankingRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    project_id: str = Field(..., description="ClipForge project identifier")
    candidates: List[HighlightCandidate] = Field(..., description="List of candidates to evaluate and rank")
    video_duration: Optional[float] = Field(default=None, description="Total video duration for boundary checks")
    max_clips_to_select: int = Field(default=10, ge=1, le=50, description="Maximum number of approved clips to select")
    min_overall_score: float = Field(default=65.0, ge=50.0, le=95.0, description="Scores below this are rejected")
    diversity_penalty: float = Field(default=0.20, ge=0.0, le=0.50, description="Penalty factor for near-duplicate semantic topics")
    temporal_iou_threshold: float = Field(default=0.15, ge=0.05, le=0.50, description="Maximum allowed temporal overlap IoU")
    custom_weights: Optional[Dict[str, Dict[str, float]]] = Field(default=None, description="Optional override weights per category")

class ScoringRankingResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    project_id: str
    total_evaluated: int
    total_approved: int
    total_reviewed: int
    total_rejected: int
    ranked_candidates: List[ScoredHighlightCandidate] = Field(default_factory=list)
    rejected_candidates: List[ScoredHighlightCandidate] = Field(default_factory=list)
