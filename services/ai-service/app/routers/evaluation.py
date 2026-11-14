from fastapi import APIRouter, HTTPException, status
from app.schemas.evaluation import (
    HumanClipReview,
    EvaluationReport,
)
from app.evaluation.human_review import human_review_store
from app.evaluation.evaluator import clip_evaluation_engine

router = APIRouter(prefix="/api/v1/evaluation", tags=["Evaluation & Quality QA"])

@router.post("/review", response_model=HumanClipReview, status_code=status.HTTP_201_CREATED)
async def submit_human_review(review: HumanClipReview):
    """
    Records a human QA review for an AI-generated clip.
    Allows human reviewers to mark clips as good or irrelevant,
    correct categories, adjust start/end boundaries, and explain rejection reasons.
    """
    try:
        saved = human_review_store.submit_review(review)
        return saved
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record human review: {str(e)}",
        )

@router.get("/reviews/{project_id}")
async def get_project_human_reviews(project_id: str):
    """Retrieves all human evaluation reviews submitted for a specific project."""
    reviews = human_review_store.get_project_reviews(project_id)
    return {"project_id": project_id, "total_reviews": len(reviews), "reviews": reviews}

@router.post("/benchmark/run", response_model=EvaluationReport, status_code=status.HTTP_200_OK)
async def run_benchmark_evaluation():
    """
    Executes the automated benchmark evaluation framework across the 10 standardized
    content genres (podcasts, interviews, motivational speeches, lectures, comedy, etc.)
    and returns comprehensive Precision, Recall, Boundary IoU, and False Positive rates.
    """
    try:
        report = clip_evaluation_engine.evaluate_benchmark_suite()
        return report
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Automated benchmark evaluation failed: {str(e)}",
        )

@router.get("/metrics")
async def get_human_and_system_metrics():
    """Returns aggregated human approval metrics and rejection reason breakdown."""
    human_metrics = human_review_store.compute_human_metrics()
    return {
        "status": "ok",
        "human_metrics": human_metrics,
    }
