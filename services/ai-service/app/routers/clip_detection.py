from fastapi import APIRouter, HTTPException, status
from typing import List, Dict
from app.schemas.clip import ClipDetectionRequest, ClipDetectionResponse, ClipCategory
from app.services.clip_detector import clip_detection_engine

router = APIRouter(prefix="/api/v1/clips", tags=["Clip Detection"])

@router.post("/detect", response_model=ClipDetectionResponse, status_code=status.HTTP_200_OK)
async def detect_clips(request: ClipDetectionRequest):
    """
    Intelligently analyzes video transcript to detect, score, and optimize
    standalone high-impact short-form clips.
    """
    try:
        response = clip_detection_engine.detect_clips(request)
        return response
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Clip detection processing failed: {str(e)}",
        )

@router.get("/categories", response_model=Dict[str, str], status_code=status.HTTP_200_OK)
async def get_clip_categories():
    """
    Returns supported clip detection categories with their definitions.
    """
    return {
        ClipCategory.FUNNY.value: "Humorous exchanges, witty stories, or laughter",
        ClipCategory.EDUCATIONAL.value: "Actionable frameworks, tutorials, or practical advice",
        ClipCategory.IMPORTANT.value: "Critical warnings, key announcements, or core takeaways",
        ClipCategory.INTERESTING.value: "Intriguing facts, unusual insights, or curiosity hooks",
        ClipCategory.MOTIVATIONAL.value: "Inspirational stories, resilience, or discipline",
        ClipCategory.STORYTELLING.value: "Complete narrative arc with setup, conflict, and resolution",
        ClipCategory.EMOTIONAL.value: "Vulnerable, heartwarming, or deeply personal moments",
        ClipCategory.STRONG_OPINIONS.value: "Bold perspectives, spicy takes, or sharp debates",
        ClipCategory.POTENTIALLY_VIRAL.value: "High pattern interruption and compelling hooks",
    }

