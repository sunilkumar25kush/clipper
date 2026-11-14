from fastapi import APIRouter, HTTPException, status
from typing import Dict, Any
from app.schemas.scoring import ScoringRankingRequest, ScoringRankingResponse
from app.services.clip_scorer import clip_scoring_engine, DEFAULT_CATEGORY_WEIGHTS

router = APIRouter(prefix="/api/v1/scoring", tags=["Clip Scoring & Ranking"])

@router.post("/evaluate", response_model=ScoringRankingResponse, status_code=status.HTTP_200_OK)
async def evaluate_and_rank_candidates(request: ScoringRankingRequest):
    """
    Evaluates candidate highlights against quality gates, calculates 10-dimensional
    category-specific weighted scores, and applies semantic/temporal diversity ranking.
    """
    try:
        response = clip_scoring_engine.evaluate_and_rank(request)
        return response
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Candidate scoring and ranking failed: {str(e)}",
        )

@router.get("/weights", response_model=Dict[str, Dict[str, float]], status_code=status.HTTP_200_OK)
async def get_scoring_weights():
    """
    Returns default scoring weight profiles across all 9 categories.
    """
    return {cat.value: weights for cat, weights in DEFAULT_CATEGORY_WEIGHTS.items()}

