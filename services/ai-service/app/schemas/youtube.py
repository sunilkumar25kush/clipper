from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict, field_validator

class YouTubePublicMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")

    video_id: str = Field(..., description="YouTube 11-character video ID")
    title: str = Field(..., description="Public video title")
    description: Optional[str] = Field(default="", description="Public video description")
    view_count: Optional[int] = Field(default=None, ge=0, description="Total public view count if available")
    like_count: Optional[int] = Field(default=None, ge=0, description="Public like count if not hidden")
    comment_count: Optional[int] = Field(default=None, ge=0, description="Public comment count if available")
    duration_seconds: float = Field(..., gt=0.0, description="Duration in seconds")
    channel_id: Optional[str] = Field(default=None, description="YouTube Channel ID")
    channel_title: Optional[str] = Field(default=None, description="YouTube Channel display title")
    published_at: Optional[str] = Field(default=None, description="ISO publication timestamp")

class RetentionDataPoint(BaseModel):
    model_config = ConfigDict(extra="ignore")

    elapsed_time_ratio: float = Field(..., ge=0.0, le=1.0, description="Normalized point in video (0.0 to 1.0)")
    timestamp_seconds: float = Field(..., ge=0.0, description="Exact timestamp in video seconds")
    audience_watch_ratio: float = Field(..., ge=0.0, description="Absolute fraction of viewers watching (can exceed 1.0 for rewatches)")
    relative_retention_performance: float = Field(default=1.0, description="Performance relative to YouTube average for similar length videos")
    is_peak: bool = Field(default=False, description="True if retention is significantly above local baseline")
    is_rewatch: bool = Field(default=False, description="True if audienceWatchRatio > 1.0 indicating repeated viewing")
    is_dropoff: bool = Field(default=False, description="True if retention drops sharply at this point")

class RetentionInterval(BaseModel):
    model_config = ConfigDict(extra="ignore")

    start_time: float = Field(..., ge=0.0)
    end_time: float = Field(..., ge=0.0)
    average_ratio: float
    peak_ratio: float
    interval_type: str = Field(..., description="peak, rewatch, or dropoff")

    @field_validator("end_time")
    @classmethod
    def validate_end_after_start(cls, v: float, info) -> float:
        start = info.data.get("start_time")
        if start is not None and v < start:
            raise ValueError(f"end_time ({v}) cannot be before start_time ({start})")
        return v

class YouTubeRetentionReport(BaseModel):
    model_config = ConfigDict(extra="ignore")

    video_id: str
    is_authorized: bool = Field(..., description="True if authenticated user owns the video channel and has valid access")
    data_source: str = Field(default="unavailable", description="'youtube_analytics_api' or 'unavailable'")
    total_data_points: int = 0
    average_retention: float = 0.0
    retention_points: List[RetentionDataPoint] = Field(default_factory=list)
    peak_intervals: List[RetentionInterval] = Field(default_factory=list)
    rewatch_intervals: List[RetentionInterval] = Field(default_factory=list)
    dropoff_intervals: List[RetentionInterval] = Field(default_factory=list)

class RetentionEnrichedCandidate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    candidate_id: str
    start_time: float
    end_time: float
    retention_boost: float = Field(default=0.0, description="Calculated score adjustment based on verified retention signals")
    has_retention_peak: bool = Field(default=False, description="True if candidate overlaps a verified retention peak")
    has_rewatch_spike: bool = Field(default=False, description="True if candidate overlaps a verified audience rewatch section")
    overlaps_dropoff: bool = Field(default=False, description="True if candidate coincides with significant audience drop-off")
    engagement_source: str = Field(
        default="ai_estimated_potential",
        description="'youtube_analytics_retention' when authorized retention is used, or 'ai_estimated_potential' as fallback"
    )
    retention_explanation: str = Field(..., description="Transparent factual explanation of retention signals")

class YouTubeEnrichmentRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    project_id: str
    video_id: str
    video_duration: float
    candidates: List[Any] = Field(..., description="List of HighlightCandidate or ScoredHighlightCandidate objects")
    public_metadata: Optional[YouTubePublicMetadata] = None
    retention_report: Optional[YouTubeRetentionReport] = None
    user_channel_id: Optional[str] = None

class YouTubeEnrichmentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    project_id: str
    video_id: str
    retention_available: bool
    engagement_label: str
    enriched_candidates: List[RetentionEnrichedCandidate] = Field(default_factory=list)
