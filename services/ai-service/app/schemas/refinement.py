from typing import List, Optional, Any
from pydantic import BaseModel, Field, ConfigDict, model_validator
from app.schemas.transcript import TranscriptResponse

class RefinedBoundaryCandidate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    candidate_id: str = Field(..., description="Unique candidate ID")
    refined_start: float = Field(..., ge=0.0, description="Exact refined start timestamp in seconds")
    refined_end: float = Field(..., ge=0.0, description="Exact refined end timestamp in seconds")
    duration: float = Field(..., ge=0.0, description="Duration in seconds (refined_end - refined_start)")
    opening_context: str = Field(..., description="Description of the opening sentence / setup")
    closing_context: str = Field(..., description="Description of the closing sentence / takeaway")
    boundary_confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score of boundary refinement")
    needs_review: bool = Field(default=False, description="True if moment exceeds max_duration to preserve full context")
    review_reason: Optional[str] = Field(default=None, description="Explanation if marked for review")
    qa_bound: bool = Field(default=False, description="True if boundary was expanded backwards to include essential question")
    visual_aligned: bool = Field(default=False, description="True if boundaries were aligned to visual scene cuts")
    word_level_accurate: bool = True

    @model_validator(mode="after")
    def validate_duration(self) -> "RefinedBoundaryCandidate":
        if self.refined_end <= self.refined_start:
            raise ValueError(f"refined_end ({self.refined_end}) must be strictly greater than refined_start ({self.refined_start})")
        self.duration = round(self.refined_end - self.refined_start, 2)
        return self

class BoundaryRefinementRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    project_id: str = Field(..., description="ClipForge project identifier")
    candidates: List[Any] = Field(..., description="Candidates to refine (dict, HighlightCandidate, or ScoredCandidate)")
    transcript_id: Optional[str] = Field(default=None, description="Optional ID of stored transcript")
    transcript: Optional[TranscriptResponse] = Field(default=None, description="Direct TranscriptResponse object if provided")
    video_duration: float = Field(..., gt=0.0, description="Total video duration in seconds")
    min_duration: float = Field(default=15.0, ge=5.0, le=60.0, description="Minimum target duration in seconds")
    max_duration: float = Field(default=60.0, ge=15.0, le=180.0, description="Maximum target duration in seconds")
    scene_cut_timestamps: Optional[List[float]] = Field(default=None, description="Optional visual scene change cuts")

class BoundaryRefinementResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    project_id: str
    total_refined: int
    refined_candidates: List[RefinedBoundaryCandidate]
