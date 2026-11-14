import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.evaluation import (
    HumanClipReview,
    RejectionReasonEnum,
)
from app.evaluation.benchmark_dataset import create_all_benchmarks
from app.evaluation.human_review import human_review_store
from app.evaluation.evaluator import clip_evaluation_engine


class TestEvaluationAndRegression:

    def test_benchmark_dataset_covers_all_ten_genres(self):
        """Verifies that the benchmark dataset contains all 10 required content categories/genres."""
        benchmarks = create_all_benchmarks()
        assert len(benchmarks) == 10

        genres = [b.genre for b in benchmarks]
        assert "podcast" in genres
        assert "interview" in genres
        assert "motivational_speech" in genres
        assert "educational_lecture" in genres
        assert "comedy_conversation" in genres
        assert "business_strategy" in genres
        assert "technical_tutorial" in genres
        assert "storytelling" in genres
        assert "multi_speaker_roundtable" in genres
        assert "irrelevant_discussion" in genres

        # Check the noise-only benchmark
        noise_bm = next(b for b in benchmarks if b.genre == "irrelevant_discussion")
        assert noise_bm.is_noise_only is True
        assert len(noise_bm.ground_truth_moments) == 0

        # Check non-noise benchmarks have ground truth annotations
        for b in benchmarks:
            if not b.is_noise_only:
                assert len(b.ground_truth_moments) >= 1
                for gt in b.ground_truth_moments:
                    assert gt.true_end > gt.true_start
                    assert len(gt.core_quote) > 5

    def test_human_review_store_lifecycle(self, tmp_path):
        """Verifies human review recording, persistence, category correction, and metrics calculation."""
        # Test with custom temporary storage directory to prevent test pollution
        from app.evaluation.human_review import HumanReviewStore

        test_store = HumanReviewStore(storage_dir=str(tmp_path / "reviews"))

        r1 = HumanClipReview(
            review_id="rev_001",
            clip_id="clip_abc_1",
            project_id="test_proj_eval",
            is_good=True,
            rating=5,
            reviewer_id="lead_qa_reviewer",
            notes="Excellent hook and complete narrative ending.",
        )
        test_store.submit_review(r1)

        r2 = HumanClipReview(
            review_id="rev_002",
            clip_id="clip_abc_2",
            project_id="test_proj_eval",
            is_good=False,
            rating=2,
            rejection_reason=RejectionReasonEnum.CUT_TOO_EARLY,
            rejection_detail="Speaker was in the middle of concluding the main formula.",
            reviewer_id="lead_qa_reviewer",
            notes="Requires 2 more seconds of speech buffer.",
        )
        test_store.submit_review(r2)

        # Retrieve reviews
        reviews = test_store.get_project_reviews("test_proj_eval")
        assert len(reviews) == 2

        # Check metrics
        metrics = test_store.compute_human_metrics()
        assert metrics["total_reviews"] == 2
        assert metrics["approved_count"] == 1
        assert metrics["rejected_count"] == 1
        assert metrics["approval_rate"] == 0.5
        assert metrics["average_rating"] == 3.5
        assert "cut_too_early" in metrics["rejection_reasons_breakdown"]

    def test_automated_evaluation_run_and_regression_metrics(self):
        """Executes full benchmark evaluation across the 10 datasets and asserts quality regression standards."""
        report = clip_evaluation_engine.evaluate_benchmark_suite()

        assert report.total_benchmarks_evaluated == 10
        assert report.total_clips_generated >= 5

        # Critical quality gate: zero clips selected from the noise/irrelevant soundcheck video
        assert report.noise_video_false_positive_rate == 0.0

        # No duplicate clips allowed
        assert report.duplicate_selection_rate == 0.0

        # Precision and boundary accuracy standards
        assert report.overall_precision >= 0.70
        assert report.overall_boundary_iou >= 0.60
        assert report.overall_category_accuracy >= 0.70
        assert report.regression_passed is True

    def test_evaluation_api_endpoints(self):
        """Verifies HTTP API endpoints for human reviews and automated benchmark evaluation."""
        client = TestClient(app)

        # 1. POST /api/v1/evaluation/review
        review_payload = {
            "review_id": "api_rev_001",
            "clip_id": "clip_http_01",
            "project_id": "http_eval_proj",
            "is_good": True,
            "rating": 5,
            "reviewer_id": "api_test_qa",
            "notes": "Verified high content quality.",
        }
        res_post = client.post("/api/v1/evaluation/review", json=review_payload)
        assert res_post.status_code == 201
        data_post = res_post.json()
        assert data_post["review_id"] == "api_rev_001"
        assert data_post["is_good"] is True

        # 2. GET /api/v1/evaluation/reviews/{project_id}
        res_get = client.get("/api/v1/evaluation/reviews/http_eval_proj")
        assert res_get.status_code == 200
        data_get = res_get.json()
        assert data_get["project_id"] == "http_eval_proj"
        assert data_get["total_reviews"] >= 1

        # 3. GET /api/v1/evaluation/metrics
        res_metrics = client.get("/api/v1/evaluation/metrics")
        assert res_metrics.status_code == 200
        assert res_metrics.json()["status"] == "ok"
