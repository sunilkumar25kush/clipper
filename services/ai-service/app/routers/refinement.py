from fastapi import APIRouter, HTTPException, status
from app.schemas.refinement import (
    BoundaryRefinementRequest,
    BoundaryRefinementResponse,
)
from app.services.storage import transcript_storage
from app.services.boundary_refinement import intelligent_boundary_refiner

router = APIRouter(prefix="/api/v1/refinement", tags=["Boundary Refinement"])

@router.post("/refine", response_model=BoundaryRefinementResponse, status_code=status.HTTP_200_OK)
async def refine_boundaries(request: BoundaryRefinementRequest):
    """
    Intelligently refines candidate start and end timestamps using Whisper word-level
    timing, sentence boundary snapping, Q&A binding, and visual scene transition alignment.
    """
    # Load transcript from storage if needed
    if request.transcript is None and request.transcript_id:
        request.transcript = transcript_storage.get_transcript(request.transcript_id)

    try:
        response = intelligent_boundary_refiner.refine_all_candidates(request)
        return response
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Boundary refinement failed: {str(e)}",
        )

