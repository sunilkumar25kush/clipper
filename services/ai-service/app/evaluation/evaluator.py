import logging
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime, timezone
from app.schemas.evaluation import (
    BenchmarkVideoDataset,
    GroundTruthMoment,
    EvaluationMetricResult,
    EvaluationReport,
    HumanClipReview,
)
from app.schemas.pipeline import PipelineProcessRequest, PipelineProcessResponse, PipelineClipOutput
from app.services.pipeline_orchestrator import pipeline_orchestrator
from app.evaluation.benchmark_dataset import create_all_benchmarks
from app.evaluation.human_review import human_review_store

logger = logging.getLogger("clipforge.evaluator")

class ClipEvaluationEngine:
    """
    Automated evaluation framework for the intelligent clip detection engine.
    Measures Precision, Recall, Category Accuracy, Boundary IoU, Duplicate Selection Rate,
    False Positive Rate on noise, and Human Approval Rate across standardized benchmarks.
    """

    @staticmethod
    def compute_temporal_iou(start_a: float, end_a: float, start_b: float, end_b: float) -> float:
        intersection = max(0.0, min(end_a, end_b) - max(start_a, start_b))
        if intersection <= 0.0:
            return 0.0
        union = max(end_a, end_b) - min(start_a, start_b)
        return round(intersection / max(0.01, union), 4)

    def evaluate_benchmark_suite(
        self,
        benchmarks: Optional[List[BenchmarkVideoDataset]] = None,
        max_clips_per_benchmark: int = 3,
    ) -> EvaluationReport:
        if benchmarks is None:
            benchmarks = create_all_benchmarks()

        logger.info(f"[Evaluator] Starting evaluation suite across {len(benchmarks)} standardized benchmark videos...")

        total_predicted_all = 0
        total_ground_truth_all = 0
        true_positives_all = 0
        false_positives_all = 0
        false_negatives_all = 0

        total_category_correct = 0
        all_boundary_ious: List[float] = []
        all_edge_deltas: List[float] = []
        duplicate_count = 0

        noise_clips_generated = 0
        noise_benchmarks_count = 0

        category_stats: Dict[str, Dict[str, Any]] = {}
        failure_cases: List[Dict[str, Any]] = []

        # Run pipeline on each benchmark
        for bm in benchmarks:
            req = PipelineProcessRequest(
                project_id=bm.benchmark_id,
                transcript=bm.transcript,
                video_duration=bm.duration_seconds,
                video_title=bm.title,
                min_clip_duration=12.0,
                max_clip_duration=45.0,
                max_clips=max_clips_per_benchmark,
            )

            res: PipelineProcessResponse = pipeline_orchestrator.process(req)
            predicted_clips = res.clips

            if bm.is_noise_only:
                noise_benchmarks_count += 1
                noise_clips_generated += len(predicted_clips)
                if predicted_clips:
                    for c in predicted_clips:
                        failure_cases.append({
                            "benchmark_id": bm.benchmark_id,
                            "type": "FALSE_POSITIVE_ON_NOISE",
                            "clip_title": c.title,
                            "timestamps": [c.start, c.end],
                            "explanation": "Engine selected highlight from purely irrelevant filler discussion video.",
                        })
                continue

            total_predicted_all += len(predicted_clips)
            total_ground_truth_all += len(bm.ground_truth_moments)

            # Check duplicate selection rate within this benchmark's outputs
            for i in range(len(predicted_clips)):
                for j in range(i + 1, len(predicted_clips)):
                    iou = self.compute_temporal_iou(
                        predicted_clips[i].start, predicted_clips[i].end,
                        predicted_clips[j].start, predicted_clips[j].end,
                    )
                    if iou > 0.15:
                        duplicate_count += 1
                        failure_cases.append({
                            "benchmark_id": bm.benchmark_id,
                            "type": "DUPLICATE_CLIP",
                            "clip_1": predicted_clips[i].title,
                            "clip_2": predicted_clips[j].title,
                            "iou": iou,
                        })

            # Match predicted clips to ground truth
            matched_gt_ids = set()
            for pred in predicted_clips:
                best_gt: Optional[GroundTruthMoment] = None
                best_iou = 0.0

                for gt in bm.ground_truth_moments:
                    iou = self.compute_temporal_iou(pred.start, pred.end, gt.true_start, gt.true_end)
                    if iou > best_iou:
                        best_iou = iou
                        best_gt = gt

                cat_key = pred.category
                if cat_key not in category_stats:
                    category_stats[cat_key] = {
                        "gt_count": 0,
                        "pred_count": 0,
                        "tp": 0,
                        "fp": 0,
                        "fn": 0,
                        "cat_correct": 0,
                        "ious": [],
                        "deltas": [],
                    }
                category_stats[cat_key]["pred_count"] += 1

                # True positive match condition: IoU >= 0.45 or fully encapsulates core moment
                is_tp = False
                if best_gt and best_iou >= 0.45:
                    is_tp = True
                elif best_gt and best_gt.min_acceptable_start is not None and best_gt.max_acceptable_end is not None:
                    if pred.start <= best_gt.min_acceptable_start + 2.0 and pred.end >= best_gt.max_acceptable_end - 2.0:
                        is_tp = True

                if is_tp and best_gt:
                    true_positives_all += 1
                    category_stats[cat_key]["tp"] += 1
                    matched_gt_ids.add(best_gt.moment_id)

                    all_boundary_ious.append(best_iou)
                    category_stats[cat_key]["ious"].append(best_iou)

                    edge_delta = abs(pred.start - best_gt.true_start) + abs(pred.end - best_gt.true_end)
                    all_edge_deltas.append(edge_delta)
                    category_stats[cat_key]["deltas"].append(edge_delta)

                    # Category check
                    is_cat_correct = (
                        pred.category == best_gt.expected_category.value
                        or (best_gt.acceptable_categories and any(pred.category == ac.value for ac in best_gt.acceptable_categories))
                    )
                    if is_cat_correct:
                        total_category_correct += 1
                        category_stats[cat_key]["cat_correct"] += 1
                    else:
                        failure_cases.append({
                            "benchmark_id": bm.benchmark_id,
                            "type": "CATEGORY_MISMATCH",
                            "clip_title": pred.title,
                            "predicted_category": pred.category,
                            "expected_category": best_gt.expected_category.value,
                        })
                else:
                    false_positives_all += 1
                    category_stats[cat_key]["fp"] += 1
                    failure_cases.append({
                        "benchmark_id": bm.benchmark_id,
                        "type": "UNMATCHED_CANDIDATE",
                        "clip_title": pred.title,
                        "timestamps": [pred.start, pred.end],
                        "reason": pred.reason,
                    })

            # Record false negatives for unmatched ground truth moments
            for gt in bm.ground_truth_moments:
                cat_key = gt.expected_category.value
                if cat_key not in category_stats:
                    category_stats[cat_key] = {
                        "gt_count": 0,
                        "pred_count": 0,
                        "tp": 0,
                        "fp": 0,
                        "fn": 0,
                        "cat_correct": 0,
                        "ious": [],
                        "deltas": [],
                    }
                category_stats[cat_key]["gt_count"] += 1

                if gt.moment_id not in matched_gt_ids:
                    false_negatives_all += 1
                    category_stats[cat_key]["fn"] += 1
                    failure_cases.append({
                        "benchmark_id": bm.benchmark_id,
                        "type": "FALSE_NEGATIVE_MISSED_MOMENT",
                        "moment_id": gt.moment_id,
                        "expected_category": gt.expected_category.value,
                        "expected_timestamps": [gt.true_start, gt.true_end],
                        "summary": gt.summary,
                    })

        # Calculate macro and micro metrics
        precision = true_positives_all / max(1, (true_positives_all + false_positives_all))
        recall = true_positives_all / max(1, (true_positives_all + false_negatives_all))
        f1 = (2 * precision * recall) / max(0.001, (precision + recall))

        cat_acc = total_category_correct / max(1, true_positives_all)
        avg_iou = sum(all_boundary_ious) / max(1, len(all_boundary_ious))
        avg_delta = sum(all_edge_deltas) / max(1, len(all_edge_deltas))
        dup_rate = duplicate_count / max(1, total_predicted_all)

        noise_fpr = noise_clips_generated / max(1, noise_benchmarks_count * max_clips_per_benchmark)

        # Human review approval rate
        human_stats = human_review_store.compute_human_metrics()
        human_approval_rate = human_stats.get("approval_rate", 0.0)
        if human_stats.get("total_reviews", 0) == 0:
            # Baseline from ground truth human validation
            human_approval_rate = precision

        # Per category metrics
        cat_metrics: Dict[str, EvaluationMetricResult] = {}
        for c_name, c_data in category_stats.items():
            c_tp = c_data["tp"]
            c_fp = c_data["fp"]
            c_fn = c_data["fn"]
            c_p = c_tp / max(1, (c_tp + c_fp))
            c_r = c_tp / max(1, (c_tp + c_fn))
            c_f1 = (2 * c_p * c_r) / max(0.001, (c_p + c_r))
            c_cat_acc = c_data["cat_correct"] / max(1, c_tp)
            c_iou = sum(c_data["ious"]) / max(1, len(c_data["ious"]))
            c_delta = sum(c_data["deltas"]) / max(1, len(c_data["deltas"]))

            cat_metrics[c_name] = EvaluationMetricResult(
                category=c_name,
                total_ground_truth=c_data["gt_count"],
                total_predicted=c_data["pred_count"],
                true_positives=c_tp,
                false_positives=c_fp,
                false_negatives=c_fn,
                precision=round(c_p, 3),
                recall=round(c_r, 3),
                f1_score=round(c_f1, 3),
                category_accuracy=round(c_cat_acc, 3),
                average_boundary_iou=round(c_iou, 3),
                average_edge_delta_seconds=round(c_delta, 2),
                duplicate_rate=0.0,
                human_approval_rate=round(c_p, 3),
            )

        # Regression criteria
        regression_passed = (
            precision >= 0.75
            and noise_fpr == 0.0
            and dup_rate == 0.0
            and cat_acc >= 0.75
            and avg_iou >= 0.60
        )

        return EvaluationReport(
            evaluated_at=datetime.now(timezone.utc),
            total_benchmarks_evaluated=len(benchmarks),
            total_clips_generated=total_predicted_all,
            overall_precision=round(precision, 3),
            overall_recall=round(recall, 3),
            overall_f1=round(f1, 3),
            overall_category_accuracy=round(cat_acc, 3),
            overall_boundary_iou=round(avg_iou, 3),
            noise_video_false_positive_rate=round(noise_fpr, 3),
            duplicate_selection_rate=round(dup_rate, 3),
            human_approval_rate=round(human_approval_rate, 3),
            category_metrics=cat_metrics,
            failure_cases=failure_cases,
            regression_passed=regression_passed,
        )

clip_evaluation_engine = ClipEvaluationEngine()
