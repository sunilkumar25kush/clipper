from fastapi import APIRouter, HTTPException, status
from starlette.concurrency import run_in_threadpool
from typing import List, Optional
from app.schemas.transcript import TranscriptResponse, TranscriptSegment
from app.schemas.intelligence import (
    TranscriptIntelligenceRequest,
    TranscriptIntelligenceResponse,
    SemanticChunk,
)
from app.services.storage import TranscriptStorage
from app.services.transcript_cleaner import transcript_cleaner
from app.services.semantic_chunker import semantic_chunker
from app.services.transcript_intelligence import transcript_intelligence_engine

router = APIRouter(prefix="/api/v1/intelligence", tags=["Transcript Intelligence"])
storage = TranscriptStorage()

@router.post("/analyze", response_model=TranscriptIntelligenceResponse, status_code=status.HTTP_200_OK)
async def analyze_transcript_intelligence(request: TranscriptIntelligenceRequest):
    """
    Analyzes full-length video transcripts using semantic topic modeling, discourse
    segmentation, and key moment extraction (Task 1 to Task 5).
    """
    transcript: Optional[TranscriptResponse] = request.transcript

    # If transcript not provided directly, load from storage via transcript_id
    if transcript is None and request.transcript_id:
        transcript = storage.get_transcript(request.transcript_id)

    if transcript is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transcript data is required. Provide either 'transcript' object or a valid 'transcript_id'.",
        )

    try:
        response = await run_in_threadpool(
            transcript_intelligence_engine.analyze_transcript,
            transcript=transcript,
            video_title=request.video_title,
            max_chunk_duration=request.max_chunk_duration,
            min_chunk_duration=request.min_chunk_duration,
            overlap_duration=request.overlap_duration,
            project_id=request.project_id,
        )
        return response
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcript intelligence analysis failed: {str(e)}",
        )

@router.post("/clean", response_model=List[TranscriptSegment], status_code=status.HTTP_200_OK)
async def clean_transcript_segments(segments: List[TranscriptSegment]):
    """
    Cleans raw Whisper transcript segments by stripping non-speech artifacts,
    collapsing hallucinations/loops, and enforcing monotonic timestamps.
    """
    try:
        return transcript_cleaner.clean_segments(segments)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to clean transcript segments: {str(e)}",
        )
