from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone

class WordTimestamp(BaseModel):
    model_config = ConfigDict(extra="ignore")
    word: str = Field(..., description="The spoken word token")
    start: float = Field(..., ge=0.0, description="Start time in seconds")
    end: float = Field(..., ge=0.0, description="End time in seconds")
    probability: float = Field(default=1.0, ge=0.0, le=1.0, description="Confidence score between 0 and 1")

class TranscriptSegment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    start: float = Field(..., ge=0.0, description="Start timestamp of the segment in seconds")
    end: float = Field(..., ge=0.0, description="End timestamp of the segment in seconds")
    text: str = Field(..., description="Segment full text transcription")
    speaker_id: str = Field(default="SPEAKER_00", description="Assigned speaker label (SPEAKER_00, SPEAKER_01)")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Average confidence of words in segment")
    words: List[WordTimestamp] = Field(default_factory=list, description="Word-level timestamp tokens")

class SpeakerTurn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    start: float = Field(..., ge=0.0)
    end: float = Field(..., ge=0.0)
    speaker_id: str

class TranscriptionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    audio_path: str = Field(..., description="Absolute path to 16kHz WAV or audio file")
    project_id: str = Field(..., description="ClipForge project identifier")
    language: Optional[str] = Field(default=None, description="ISO 639-1 language code or None for auto-detection")
    enable_diarization: bool = Field(default=True, description="Whether to perform speaker diarization")
    num_speakers: Optional[int] = Field(default=None, description="Expected number of speakers if known")
    model_size: Optional[str] = Field(default=None, description="Override default model size (tiny, base, small, large-v3-turbo)")
    chunk_long_audio: bool = Field(default=True, description="Enable sliding window chunking for long audio")

class TranscriptResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(..., description="Unique transcript UUID")
    project_id: str = Field(..., description="Associated project UUID")
    language: str = Field(..., description="Detected or specified language code")
    language_confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Language identification probability")
    duration_seconds: float = Field(..., ge=0.0, description="Total audio duration in seconds")
    word_count: int = Field(..., ge=0, description="Total word count in transcription")
    model_used: str = Field(..., description="Whisper model identifier used")
    speakers_detected: List[str] = Field(default_factory=list, description="List of unique speaker IDs identified")
    segments: List[TranscriptSegment] = Field(..., description="Sequential timestamped dialogue segments")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TranscriptSummary(BaseModel):
    id: str
    project_id: str
    language: str
    duration_seconds: float
    segment_count: int
    word_count: int
    created_at: datetime
