import asyncio
from fastapi import APIRouter, HTTPException, BackgroundTasks, status
from typing import List
from app.schemas.transcript import (
    TranscriptionRequest,
    TranscriptResponse,
    TranscriptSummary,
)
from app.services.transcription import transcription_service
from app.services.storage import transcript_storage

router = APIRouter(prefix="/api/v1", tags=["Transcription"])

@router.post(
    "/transcribe",
    response_model=TranscriptResponse,
    status_code=status.HTTP_200_OK,
    summary="Transcribe audio file into timestamped words and speaker segments",
)
async def transcribe_audio(
    request: TranscriptionRequest,
    background_tasks: BackgroundTasks,
) -> TranscriptResponse:
    """
    Executes speech transcription on the provided 16kHz WAV or audio file.
    Detects language, timestamps words, aligns speaker diarization, and stores the transcript.
    """
    try:
        # Run CPU/GPU-intensive transcription in threadpool to avoid blocking asyncio event loop
        loop = asyncio.get_event_loop()
        result: TranscriptResponse = await loop.run_in_executor(
            None,
            transcription_service.transcribe_audio,
            request,
        )

        # Persist transcript in background
        background_tasks.add_task(transcript_storage.save_transcript, result)

        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcription failed: {str(e)}",
        )

@router.get(
    "/transcripts/{transcript_id}",
    response_model=TranscriptResponse,
    summary="Retrieve full structured transcript by transcript ID",
)
def get_transcript(transcript_id: str) -> TranscriptResponse:
    transcript = transcript_storage.get_transcript(transcript_id)
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transcript with ID '{transcript_id}' not found",
        )
    return transcript

@router.get(
    "/projects/{project_id}/transcripts",
    response_model=List[TranscriptSummary],
    summary="List all transcripts generated for a project",
)
def list_project_transcripts(project_id: str) -> List[TranscriptSummary]:
    return transcript_storage.get_transcripts_by_project(project_id)

@router.get(
    "/projects/{project_id}/transcripts/latest",
    response_model=TranscriptResponse,
    summary="Retrieve the latest transcript for a project",
)
def get_latest_project_transcript(project_id: str) -> TranscriptResponse:
    transcript = transcript_storage.get_latest_transcript_for_project(project_id)
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No transcripts found for project '{project_id}'",
        )
    return transcript

