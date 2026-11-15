from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
from typing import List, Optional
from datetime import datetime, timezone
from app.schemas.transcript import TranscriptResponse

class KeyMoment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    start_time: float = Field(..., ge=0.0, description="Start timestamp of the key moment in seconds")
    end_time: float = Field(..., ge=0.0, description="End timestamp of the key moment in seconds")
    speaker_id: Optional[str] = Field(default=None, description="Speaker identifier if available")
    statement_summary: str = Field(..., min_length=3, description="Concise summary of the key statement or insight")
    moment_type: Optional[str] = Field(
        default="statement",
        description="Type: statement, takeaway, story, example, question, answer, hook, insight"
    )
    importance_score: Optional[float] = Field(
        default=85.0,
        ge=0.0,
        le=100.0,
        description="Relevance or virality importance score between 0 and 100"
    )

    @field_validator("end_time")
    @classmethod
    def validate_end_after_start(cls, v: float, info) -> float:
        start = info.data.get("start_time")
        if start is not None and v < start:
            raise ValueError(f"end_time ({v}) must be greater than or equal to start_time ({start})")
        return v

class SemanticChunk(BaseModel):
    model_config = ConfigDict(extra="ignore")
    chunk_id: str = Field(..., description="Unique chunk identifier, e.g. chunk_001")
    start_time: float = Field(..., ge=0.0, description="Original video start timestamp in seconds")
    end_time: float = Field(..., ge=0.0, description="Original video end timestamp in seconds")
    main_topic: str = Field(..., min_length=2, description="Primary discussion topic of this section")
    subtopics: List[str] = Field(default_factory=list, description="Specific subtopics or concepts covered")
    summary: str = Field(..., min_length=5, description="Cohesive summary of the conversation section")
    speaker_intent: Optional[str] = Field(default=None, description="Speaker intent (educate, entertain, debate, share story)")
    main_argument: Optional[str] = Field(default=None, description="Core thesis or takeaway statement")
    emotional_context: Optional[str] = Field(default=None, description="Emotional tone: humorous, intense, reflective, motivational")
    key_moments: List[KeyMoment] = Field(default_factory=list, description="High-impact timestamped moments within this chunk")
    text: Optional[str] = Field(default=None, description="Cleaned spoken text within this chunk")

    @field_validator("end_time")
    @classmethod
    def validate_end_after_start(cls, v: float, info) -> float:
        start = info.data.get("start_time")
        if start is not None and v < start:
            raise ValueError(f"end_time ({v}) must be greater than or equal to start_time ({start})")
        return v

class TranscriptIntelligenceRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    project_id: str = Field(..., description="ClipForge project identifier")
    transcript_id: Optional[str] = Field(default=None, description="Persisted transcript UUID if available")
    transcript: Optional[TranscriptResponse] = Field(default=None, description="Direct transcript object if not stored on disk")
    video_title: Optional[str] = Field(default=None, description="Optional video title for context")
    language: Optional[str] = Field(default="en", description="Primary language code")
    min_chunk_duration: float = Field(default=45.0, ge=15.0, description="Minimum duration for a semantic chunk in seconds")
    max_chunk_duration: float = Field(default=240.0, le=600.0, description="Maximum duration for a semantic chunk in seconds")
    overlap_duration: float = Field(default=15.0, ge=0.0, description="Context overlap duration between chunks in seconds")

    @model_validator(mode="after")
    def validate_durations(self) -> "TranscriptIntelligenceRequest":
        if self.max_chunk_duration <= self.min_chunk_duration:
            raise ValueError(f"max_chunk_duration ({self.max_chunk_duration}) must be strictly greater than min_chunk_duration ({self.min_chunk_duration})")
        return self

class TranscriptIntelligenceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    project_id: str
    transcript_id: Optional[str] = None
    language: str
    total_duration: float
    total_words: int
    total_chunks: int
    global_topics: List[str] = Field(default_factory=list)
    global_summary: str = Field(default="")
    chunks: List[SemanticChunk] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
