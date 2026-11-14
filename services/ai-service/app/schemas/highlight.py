from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
from datetime import datetime, timezone
from app.schemas.transcript import TranscriptResponse

class HighlightCategory(str, Enum):
    LIFE_LESSON = "life_lesson"
    MOTIVATIONAL = "motivational"
    FUNNY = "funny"
    EDUCATIONAL = "educational"
    INTERESTING_FACT = "interesting_fact"
    ENTERTAINMENT = "entertainment"
    IMPORTANT_INSIGHT = "important_insight"
    STORYTELLING = "storytelling"
    STRONG_OPINION = "strong_opinion"

    @classmethod
    def _missing_(cls, value: object):
        if isinstance(value, str):
            norm = value.lower().strip().replace(" ", "_").replace("-", "_")
            # Map common plural or compound variations
            alias_map = {
                "life_lessons": cls.LIFE_LESSON,
                "life_lesson": cls.LIFE_LESSON,
                "motivational": cls.MOTIVATIONAL,
                "motivation": cls.MOTIVATIONAL,
                "funny": cls.FUNNY,
                "humor": cls.FUNNY,
                "jokes": cls.FUNNY,
                "educational": cls.EDUCATIONAL,
                "education": cls.EDUCATIONAL,
                "interesting_facts": cls.INTERESTING_FACT,
                "interesting_fact": cls.INTERESTING_FACT,
                "facts": cls.INTERESTING_FACT,
                "entertainment": cls.ENTERTAINMENT,
                "entertaining": cls.ENTERTAINMENT,
                "important_insights": cls.IMPORTANT_INSIGHT,
                "important_insight": cls.IMPORTANT_INSIGHT,
                "insights": cls.IMPORTANT_INSIGHT,
                "important": cls.IMPORTANT_INSIGHT,
                "storytelling": cls.STORYTELLING,
                "story": cls.STORYTELLING,
                "stories": cls.STORYTELLING,
                "strong_opinions": cls.STRONG_OPINION,
                "strong_opinion": cls.STRONG_OPINION,
                "strong_opinions_and_debates": cls.STRONG_OPINION,
                "debates": cls.STRONG_OPINION,
            }
            if norm in alias_map:
                return alias_map[norm]
            for member in cls:
                if member.value == norm or member.name.lower() == norm:
                    return member
        return None

class TranscriptEvidence(BaseModel):
    model_config = ConfigDict(extra="ignore")
    start: float = Field(..., ge=0.0, description="Start timestamp of quotation in seconds")
    end: float = Field(..., ge=0.0, description="End timestamp of quotation in seconds")
    text: str = Field(..., min_length=2, description="Exact spoken transcript quote")

    @field_validator("end")
    @classmethod
    def validate_end_after_start(cls, v: float, info) -> float:
        start = info.data.get("start")
        if start is not None and v < start:
            raise ValueError(f"evidence end ({v}) cannot be before start ({start})")
        return v

class HighlightCandidate(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    candidate_id: str = Field(..., description="Unique highlight candidate ID")
    category: HighlightCategory = Field(..., description="One of the 9 semantic content categories")
    start_time: float = Field(..., ge=0.0, description="Exact start time in seconds")
    end_time: float = Field(..., ge=0.0, description="Exact end time in seconds")
    title: str = Field(..., min_length=3, description="Punchy, engaging highlight title")
    summary: str = Field(..., min_length=5, description="Cohesive summary of the moment")
    hook: str = Field(..., min_length=3, description="Opening hook or attention grabber")
    reason: str = Field(..., min_length=5, description="Detailed explanation of why this moment is valuable")
    transcript_evidence: List[TranscriptEvidence] = Field(
        default_factory=list,
        description="Direct quotes from the transcript proving the candidate content"
    )
    context_summary: str = Field(
        ...,
        min_length=5,
        description="Explanation of the surrounding setup, event, and resolution ensuring standalone context"
    )
    duration: Optional[float] = Field(None, description="Duration in seconds")
    confidence_score: float = Field(default=85.0, ge=0.0, le=100.0, description="Relevance and standalone quality score")
    is_standalone: bool = Field(default=True, description="True if moment requires no outside knowledge to understand")

    @model_validator(mode="after")
    def validate_bounds_and_compute_duration(self) -> "HighlightCandidate":
        if self.end_time <= self.start_time:
            raise ValueError(f"end_time ({self.end_time}) must be strictly greater than start_time ({self.start_time})")
        computed = round(self.end_time - self.start_time, 2)
        if self.duration is None:
            self.duration = computed
        return self

class HighlightDiscoveryRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    project_id: str = Field(..., description="ClipForge project identifier")
    transcript_id: Optional[str] = Field(default=None, description="Optional ID of saved transcript")
    transcript: Optional[TranscriptResponse] = Field(default=None, description="Direct transcript object if available")
    video_title: Optional[str] = Field(default=None, description="Optional title of the video for contextual framing")
    target_categories: Optional[List[HighlightCategory]] = Field(
        default=None,
        description="Filter for specific categories, or None to discover across all 9"
    )
    min_duration: float = Field(default=15.0, ge=10.0, le=120.0, description="Minimum clip duration in seconds")
    max_duration: float = Field(default=90.0, ge=20.0, le=300.0, description="Maximum clip duration in seconds")
    min_confidence: float = Field(default=70.0, ge=0.0, le=100.0, description="Minimum candidate quality threshold")

    @field_validator("max_duration")
    @classmethod
    def validate_max_duration(cls, v: float, info) -> float:
        min_d = info.data.get("min_duration")
        if min_d is not None and v <= min_d:
            raise ValueError(f"max_duration ({v}) must be strictly greater than min_duration ({min_d})")
        return v

class HighlightDiscoveryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    project_id: str
    total_candidates: int
    categories_found: Dict[str, int] = Field(default_factory=dict)
    candidates: List[HighlightCandidate] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
