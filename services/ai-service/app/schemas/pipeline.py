from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from app.schemas.transcript import TranscriptResponse, WordTimestamp
from app.schemas.highlight import HighlightCategory
from app.schemas.youtube import YouTubePublicMetadata, YouTubeRetentionReport

class PipelineClipOutput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    candidate_id: str
    start: float = Field(..., ge=0.0)
    end: float = Field(..., ge=0.0)
    duration: float = Field(..., ge=0.0)
    title: str
    category: str
    reason: str
    scores: Dict[str, int]
    subtitle_text: str
    words: List[WordTimestamp] = Field(default_factory=list)
    part_number: Optional[int] = None
    description: Optional[str] = None
    main_topic: Optional[str] = None
    is_part: bool = False
    needs_review: bool = False
    review_reason: Optional[str] = None
    qa_bound: bool = False
    engagement_source: str = "ai_estimated_potential"
    retention_boost: float = 0.0

class PipelineProcessRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    project_id: str = Field(..., description="ClipForge project identifier")
    generation_mode: str = Field(default="highlights", description="'highlights' (default) or 'parts'")
    custom_instructions: Optional[str] = Field(default=None, max_length=2000, description="Optional user custom guidance for clip discovery")
    audio_path: Optional[str] = Field(default=None, description="Path to 16kHz WAV audio file for Whisper transcription")
    transcript: Optional[TranscriptResponse] = Field(default=None, description="Pre-existing transcript response if already transcribed")
    transcript_id: Optional[str] = Field(default=None, description="Persisted transcript UUID")
    video_duration: float = Field(..., gt=0.0, description="Total video duration in seconds")
    video_title: Optional[str] = Field(default=None, description="Title of the video")
    min_clip_duration: float = Field(default=15.0, ge=10.0, le=120.0, description="Minimum clip duration in seconds")
    max_clip_duration: float = Field(default=60.0, ge=15.0, le=180.0, description="Maximum clip duration in seconds")
    max_clips: int = Field(default=10, ge=1, le=50, description="Target clip count")
    target_categories: Optional[List[HighlightCategory]] = Field(default=None, description="Optional category filters")
    scene_cut_timestamps: Optional[List[float]] = Field(default=None, description="Visual scene transition timestamps")
    public_metadata: Optional[YouTubePublicMetadata] = None
    retention_report: Optional[YouTubeRetentionReport] = None
    user_channel_id: Optional[str] = None

class PipelineProcessResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: str = Field(default="completed", description="'completed' or 'error'")
    project_id: str
    video_duration: float
    clips_generated: int
    message: str
    clips: List[PipelineClipOutput] = Field(default_factory=list)
    stages_completed: List[str] = Field(default_factory=list)

