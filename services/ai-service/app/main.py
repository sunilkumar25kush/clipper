import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import transcription, clip_detection, intelligence, highlight, scoring, refinement, youtube, pipeline, evaluation
from app.services.model_manager import model_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("clipforge.ai_service")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.app_name} on {settings.host}:{settings.port}...")
    yield
    logger.info(f"Shutting down {settings.app_name}...")
    model_manager.unload_models()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="ClipForge AI Service: faster-whisper speech transcription and intelligent Gemini clip detection",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transcription.router)
app.include_router(clip_detection.router)
app.include_router(intelligence.router)
app.include_router(highlight.router)
app.include_router(scoring.router)
app.include_router(refinement.router)
app.include_router(youtube.router)
app.include_router(pipeline.router)
app.include_router(evaluation.router)

@app.get("/health", tags=["System"])
def health_check():
    has_gemini = bool(settings.gemini_api_key and not settings.gemini_api_key.startswith("replace_with_"))
    return {
        "status": "ok",
        "service": "clipforge-ai-service",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "whisper": {
            "model": settings.whisper_model,
            "device": settings.whisper_device,
            "compute_type": settings.whisper_compute_type,
            "native_faster_whisper_available": model_manager.is_faster_whisper_supported(),
        },
        "gemini": {
            "primary_model": settings.gemini_primary_model,
            "pro_model": settings.gemini_pro_model,
            "has_api_key": has_gemini,
        },
    }
