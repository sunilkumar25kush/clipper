from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Optional
from app.schemas.highlight import (
    HighlightCategory,
    HighlightCandidate,
    HighlightDiscoveryRequest,
    HighlightDiscoveryResponse,
)
from app.services.storage import transcript_storage, candidate_storage
from app.services.highlight_discovery import highlight_discovery_engine

router = APIRouter(prefix="/api/v1/highlights", tags=["Highlight Discovery"])

@router.post("/discover", response_model=HighlightDiscoveryResponse, status_code=status.HTTP_200_OK)
async def discover_highlights(request: HighlightDiscoveryRequest):
    """
    Analyzes all semantic transcript chunks across the full-length video to uncover
    standalone highlight moments across 9 distinct content categories.
    """
    transcript = request.transcript
    if transcript is None and request.transcript_id:
        transcript = transcript_storage.get_transcript(request.transcript_id)

    if transcript is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transcript data is required. Provide either 'transcript' object or a valid 'transcript_id'.",
        )

    # Attach loaded transcript to request
    request.transcript = transcript

    try:
        response = highlight_discovery_engine.discover_highlights(request)
        return response
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Highlight discovery failed: {str(e)}",
        )

@router.get("/{project_id}", response_model=List[HighlightCandidate], status_code=status.HTTP_200_OK)
async def get_project_highlights(project_id: str):
    """
    Retrieves stored candidate moments for a project. Stored separately from rendered clips.
    """
    raw_candidates = candidate_storage.get_candidates(project_id)
    if not raw_candidates:
        return []
    try:
        return [HighlightCandidate.model_validate(c) for c in raw_candidates]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse stored highlight candidates: {str(e)}",
        )

@router.get("/categories/list", response_model=Dict[str, str], status_code=status.HTTP_200_OK)
async def get_highlight_categories():
    """
    Returns definitions of all 9 semantic highlight categories.
    """
    return {
        HighlightCategory.LIFE_LESSON.value: "Personal experiences with practical wisdom, advice about life, lessons from mistakes, personal growth insights.",
        HighlightCategory.MOTIVATIONAL.value: "Inspiring statements, overcoming adversity, discipline & consistency, mindset transformations.",
        HighlightCategory.FUNNY.value: "Genuine jokes, funny stories, unexpected humor, sarcasm, witty banter.",
        HighlightCategory.EDUCATIONAL.value: "Step-by-step explanations, technical frameworks, tutorials, actionable advice, useful concepts.",
        HighlightCategory.INTERESTING_FACT.value: "Surprising facts, uncommon scientific/historical trivia, unexpected statistics, counterintuitive discoveries.",
        HighlightCategory.ENTERTAINMENT.value: "Engaging stories, unexpected events, intense reactions, memorable high-energy banter.",
        HighlightCategory.IMPORTANT_INSIGHT.value: "Deep takeaways, nuanced perspectives, core thesis, critical warnings or principles.",
        HighlightCategory.STORYTELLING.value: "Personal stories with a clear narrative arc (setup, tension/conflict, unexpected twist, payoff/conclusion).",
        HighlightCategory.STRONG_OPINION.value: "Bold contrarian viewpoints, spicy takes, intellectual disagreements, thought-provoking debates.",
    }

