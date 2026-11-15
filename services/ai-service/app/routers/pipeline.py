from fastapi import APIRouter, HTTPException, status
from starlette.concurrency import run_in_threadpool
from app.schemas.pipeline import (
    PipelineProcessRequest,
    PipelineProcessResponse,
)
from app.services.storage import transcript_storage
from app.services.pipeline_orchestrator import pipeline_orchestrator

router = APIRouter(prefix="/api/v1/pipeline", tags=["Pipeline Orchestrator"])


@router.post("/process", response_model=PipelineProcessResponse, status_code=status.HTTP_200_OK)
async def process_pipeline(request: PipelineProcessRequest):
    """
    Executes the end-to-end intelligent content clipping pipeline:
    1. Speech Transcription (if audio_path provided)
    2. Transcript Cleaning (deduplication, audio tag removal, timestamp validation)
    3. Semantic Discourse & Topic Modeling (adaptive chunking, key argument extraction)
    4. Highlight Discovery across 9 value categories
    5. Deterministic Clip Scoring & Quality Gating (10 dimensions, category weights, NMS)
    6. Intelligent Boundary Refinement (sentence snapping, silence trimming, Q&A binding)
    7. Retention Signal Enrichment (legitimate OAuth metrics or safe AI potential)
    8. Strict zero-fabrication / zero-padding clip selection
    """
    # Load transcript from storage if needed
    if request.transcript is None and request.transcript_id:
        request.transcript = transcript_storage.get_transcript(request.transcript_id)

    try:
        response = await run_in_threadpool(pipeline_orchestrator.process, request)
        return response
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except FileNotFoundError as fe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(fe),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Content Intelligence Pipeline failed: {str(e)}",
        )

