from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal, Optional
import os

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "ClipForge AI Service"
    env: str = "development"
    port: int = 8000
    host: str = "0.0.0.0"
    
    # Whisper compute configuration
    whisper_model: str = "large-v3-turbo"
    whisper_device: Literal["cpu", "cuda", "auto"] = "auto"
    whisper_compute_type: Literal["int8", "float16", "float32", "default"] = "int8"
    whisper_beam_size: int = 5
    whisper_vad_filter: bool = True
    whisper_backend: Literal["faster-whisper", "mock", "auto"] = "mock" if os.name == "nt" else "auto"
    
    # Long-video chunking thresholds (in seconds)
    chunk_threshold_seconds: float = 1800.0  # 30 minutes
    chunk_window_seconds: float = 1800.0     # 30 minutes window
    chunk_overlap_seconds: float = 120.0     # 2 minutes overlap
    
    # Storage
    transcript_storage_dir: str = os.path.join(os.path.dirname(__file__), "..", "data", "transcripts")
    
    # Gemini AI Configuration
    gemini_api_key: Optional[str] = os.environ.get("GEMINI_API_KEY")
    gemini_primary_model: str = "gemini-3.5-flash"
    gemini_pro_model: str = "gemini-3.5-flash"
    gemini_max_output_tokens: int = 8192
    gemini_temperature: float = 0.2
    gemini_request_timeout_seconds: int = 120

    # Clip Detection Defaults
    min_clip_duration_seconds: float = 15.0
    max_clip_duration_seconds: float = 60.0
    max_clips_to_generate: int = 10
    nms_iou_threshold: float = 0.15
    nms_overlap_threshold: float = 0.30

    # Performance & Concurrency
    max_workers: int = 2
    task_timeout_seconds: int = 600

settings = Settings()
