from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, model_validator, ConfigDict
from app.schemas.transcript import TranscriptResponse

class ClipCategory(str, Enum):
    FUNNY = "funny"
    EDUCATIONAL = "educational"
    IMPORTANT = "important"
    INTERESTING = "interesting"
    MOTIVATIONAL = "motivational"
    STORYTELLING = "storytelling"
    EMOTIONAL = "emotional"
    STRONG_OPINIONS = "strong_opinions"
    POTENTIALLY_VIRAL = "potentially_viral"

    @classmethod
    def _missing_(cls, value: object):
        if isinstance(value, str):
            norm = value.lower().strip().replace(" ", "_").replace("-", "_")
            for member in cls:
                if member.value == norm or member.name.lower() == norm:
                    return member
        return None

class ClipScores(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    hook: int = Field(..., ge=0, le=100, description="Strength of opening 3-5s hook (0-100)")
    engagement: int = Field(..., ge=0, le=100, description="Pacing, humor, emotion, or insight density (0-100)")
    context: int = Field(..., ge=0, le=100, description="Standalone narrative completeness (0-100)")
    overall: int = Field(..., ge=0, le=100, description="Composite transparent score (0-100)")

    @model_validator(mode="before")
    @classmethod
    def compute_or_validate_overall(cls, data: Any):
        if isinstance(data, dict):
            hook = data.get("hook", data.get("hookScore", data.get("hook_score", 0)))
            eng = data.get("engagement", data.get("engagementScore", data.get("engagement_score", 0)))
            ctx = data.get("context", data.get("contextScore", data.get("context_score", 0)))
            data["hook"] = hook
            data["engagement"] = eng
            data["context"] = ctx
            if "overall" not in data and "overallScore" not in data and "overall_score" not in data:
                data["overall"] = round(0.30 * hook + 0.40 * eng + 0.30 * ctx)
            else:
                data["overall"] = data.get("overall", data.get("overallScore", data.get("overall_score")))
        return data

class ClipCandidate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    start: float = Field(..., ge=0.0, description="Clip start timestamp in seconds")
    end: float = Field(..., gt=0.0, description="Clip end timestamp in seconds")
    title: str = Field(..., min_length=3, max_length=150, description="Engaging, descriptive clip title")
    category: ClipCategory = Field(..., description="Content category archetype")
    reason: str = Field(..., min_length=10, max_length=600, description="Explainable rationale for candidate selection")
    scores: ClipScores = Field(..., description="Multi-factor quality scores")

    @model_validator(mode="before")
    @classmethod
    def normalize_aliases(cls, data: Any):
        if isinstance(data, dict):
            if "start" not in data and "startTime" in data:
                data["start"] = data["startTime"]
            elif "start" not in data and "start_time" in data:
                data["start"] = data["start_time"]
            
            if "end" not in data and "endTime" in data:
                data["end"] = data["endTime"]
            elif "end" not in data and "end_time" in data:
                data["end"] = data["end_time"]

            if "reason" not in data and "selection_reason" in data:
                data["reason"] = data["selection_reason"]
            elif "reason" not in data and "selectionReason" in data:
                data["reason"] = data["selectionReason"]
        return data

    @model_validator(mode="after")
    def validate_clip_bounds(self) -> "ClipCandidate":
        if self.end <= self.start:
            raise ValueError(f"end ({self.end}) must be strictly greater than start ({self.start})")
        return self

    @property
    def duration(self) -> float:
        return round(self.end - self.start, 3)

class ClipDetectionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: Optional[str] = Field(None, description="Optional ClipForge project ID")
    transcript_id: Optional[str] = Field(None, description="Optional ID of saved transcript")
    transcript: Optional[TranscriptResponse] = Field(None, description="Direct transcript object if not stored on disk")
    video_duration: float = Field(..., gt=0.0, description="Total video duration in seconds")
    min_duration: float = Field(default=15.0, ge=10.0, le=120.0, description="Minimum clip duration in seconds")
    max_duration: float = Field(default=60.0, ge=15.0, le=180.0, description="Maximum clip duration in seconds")
    max_clips: int = Field(default=10, ge=1, le=50, description="Maximum candidates to return")
    target_categories: Optional[List[ClipCategory]] = Field(None, description="Optional category filters")
    scene_metadata: Optional[List[Dict[str, Any]]] = Field(None, description="Optional scene change or face detections")

    @model_validator(mode="after")
    def validate_durations(self) -> "ClipDetectionRequest":
        if self.max_duration <= self.min_duration:
            raise ValueError("max_duration must be strictly greater than min_duration")
        if self.min_duration > self.video_duration:
            raise ValueError("min_duration cannot exceed video_duration")
        return self

class ClipDetectionResponse(BaseModel):
    project_id: Optional[str] = None
    transcript_id: Optional[str] = None
    video_duration: float
    total_candidates_found: int
    clips: List[ClipCandidate]
    analyzed_windows_count: int = 1
