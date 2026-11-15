import logging
from typing import List, Dict, Optional, Any
from app.schemas.pipeline import (
    PipelineProcessRequest,
    PipelineProcessResponse,
    PipelineClipOutput,
)
from app.schemas.transcript import (
    TranscriptionRequest,
    TranscriptResponse,
    TranscriptSegment,
    WordTimestamp,
)
from app.schemas.highlight import HighlightDiscoveryRequest, HighlightCategory
from app.schemas.scoring import ScoringRankingRequest
from app.schemas.refinement import BoundaryRefinementRequest
from app.services.transcription import transcription_service
from app.services.transcript_cleaner import transcript_cleaner
from app.services.transcript_intelligence import transcript_intelligence_engine
from app.services.highlight_discovery import highlight_discovery_engine
from app.services.clip_scorer import clip_scoring_engine
from app.services.boundary_refinement import intelligent_boundary_refiner
from app.services.youtube_signals import youtube_signal_service
from app.services.parts_segmentation import parts_segmentation_engine

logger = logging.getLogger("clipforge.pipeline_orchestrator")


class ContentIntelligencePipeline:
    """
    End-to-end Content Intelligence Pipeline orchestrating:
    1. Speech Transcription (Faster-Whisper / 16kHz WAV)
    2. Transcript Cleaning (artifact removal, loop collapsing, normalization)
    3. Semantic Discourse & Topic Modeling (chunking & argument mapping)
    4. Highlight Discovery across 9 value categories (whole-video comprehension)
    5. Deterministic Clip Scoring & Quality Gating (10 dimensions, category weights, NMS)
    6. Intelligent Boundary Refinement (sentence snapping, silence trimming, Q&A binding)
    7. Retention Signal Enrichment (legitimate OAuth metrics or safe AI potential)
    8. Strict zero-fabrication / zero-padding clip selection
    """

    def process(self, request: PipelineProcessRequest) -> PipelineProcessResponse:
        logger.info(
            f"[Pipeline] Starting Content Intelligence Pipeline for project '{request.project_id}' "
            f"(duration: {request.video_duration:.1f}s, target max clips: {request.max_clips})"
        )
        stages_completed: List[str] = []

        # -------------------------------------------------------------
        # 1. AUDIO EXTRACTION & TRANSCRIPTION
        # -------------------------------------------------------------
        if request.transcript:
            raw_transcript = request.transcript
            stages_completed.append("transcript_provided")
            logger.info(f"[Pipeline] Using provided transcript with {len(raw_transcript.segments)} segments.")
        elif request.audio_path:
            logger.info(f"[Pipeline] Running speech transcription on {request.audio_path}...")
            transcribe_req = TranscriptionRequest(
                audio_path=request.audio_path,
                project_id=request.project_id,
            )
            raw_transcript = transcription_service.transcribe_audio(transcribe_req)
            stages_completed.append("transcribed")
            logger.info(
                f"[Pipeline] Transcription complete: {len(raw_transcript.segments)} segments, "
                f"{raw_transcript.word_count} words."
            )
        else:
            raise ValueError("Neither 'transcript' nor 'audio_path' was provided in the pipeline request.")

        # -------------------------------------------------------------
        # 2. TRANSCRIPT CLEANING
        # -------------------------------------------------------------
        cleaned_transcript, cleaner_stats = transcript_cleaner.clean_transcript(raw_transcript)
        stages_completed.append("transcript_cleaned")
        logger.info(
            f"[Pipeline] Cleaned transcript: removed {cleaner_stats.artifacts_removed} artifacts, "
            f"{cleaner_stats.repetitions_collapsed} loops. Remaining segments: {len(cleaned_transcript.segments)}."
        )

        if not cleaned_transcript.segments or cleaned_transcript.word_count == 0:
            logger.warning(f"[Pipeline] Project '{request.project_id}' transcript contains no intelligible speech.")
            return PipelineProcessResponse(
                status="completed",
                project_id=request.project_id,
                video_duration=request.video_duration,
                clips_generated=0,
                message="No speech content identified in transcript.",
                clips=[],
                stages_completed=stages_completed,
            )

        # -------------------------------------------------------------
        # 3. SEMANTIC TOPIC & DISCOURSE MODELING
        # -------------------------------------------------------------
        intel_model = transcript_intelligence_engine.process_transcript_intelligence(cleaned_transcript)
        stages_completed.append("semantic_intelligence")
        logger.info(
            f"[Pipeline] Semantic intelligence built: {len(intel_model.chunks)} topic chunks, "
            f"{len(intel_model.global_topics)} main topics."
        )

        # -------------------------------------------------------------
        # 3B. SPECIALIZED GENERATION MODE: PARTS / SPLIT VIDEO
        # -------------------------------------------------------------
        if request.generation_mode and request.generation_mode.lower() in ("parts", "split_parts", "split_video_into_parts"):
            logger.info(f"[Pipeline] Processing video in PARTS mode for project '{request.project_id}'.")
            part_clips = parts_segmentation_engine.segment_into_parts(
                transcript=cleaned_transcript,
                video_duration=request.video_duration,
                video_title=request.video_title,
                custom_instructions=request.custom_instructions,
                target_min_duration=request.min_clip_duration or 45.0,
                target_max_duration=request.max_clip_duration or 300.0,
            )
            stages_completed.extend([
                "semantic_chunking",
                "parts_segmentation",
                "timeline_coverage_validated",
            ])
            return PipelineProcessResponse(
                status="completed",
                project_id=request.project_id,
                video_duration=request.video_duration,
                clips_generated=len(part_clips),
                message=(
                    f"Successfully segmented video into {len(part_clips)} sequential chronological parts covering the entire timeline."
                    if part_clips
                    else "Unable to divide video into meaningful chronological parts."
                ),
                clips=part_clips,
                stages_completed=stages_completed,
            )

        # -------------------------------------------------------------
        # 4. MULTI-CATEGORY HIGHLIGHT DISCOVERY
        # -------------------------------------------------------------
        discovery_req = HighlightDiscoveryRequest(
            project_id=request.project_id,
            transcript=cleaned_transcript,
            video_title=request.video_title,
            target_categories=request.target_categories,
            min_duration=request.min_clip_duration,
            max_duration=request.max_clip_duration,
            custom_instructions=request.custom_instructions,
        )
        discovery_res = highlight_discovery_engine.discover_highlights(discovery_req)
        stages_completed.append("highlight_discovery")
        logger.info(
            f"[Pipeline] Highlight discovery found {discovery_res.total_candidates} candidates across categories: "
            f"{discovery_res.categories_found}"
        )

        if not discovery_res.candidates:
            logger.info(f"[Pipeline] No highlight candidates discovered for project '{request.project_id}'.")
            return PipelineProcessResponse(
                status="completed",
                project_id=request.project_id,
                video_duration=request.video_duration,
                clips_generated=0,
                message="No sufficiently valuable moments were identified.",
                clips=[],
                stages_completed=stages_completed,
            )

        # -------------------------------------------------------------
        # 5. DETERMINISTIC CLIP SCORING & QUALITY GATING
        # -------------------------------------------------------------
        scoring_req = ScoringRankingRequest(
            project_id=request.project_id,
            candidates=discovery_res.candidates,
            video_duration=request.video_duration,
            max_clips_to_select=request.max_clips,
            min_overall_score=65.0,
            custom_instructions=request.custom_instructions,
        )
        scoring_res = clip_scoring_engine.evaluate_and_rank(scoring_req)
        stages_completed.append("quality_scoring")
        logger.info(
            f"[Pipeline] Scoring complete: {scoring_res.total_evaluated} evaluated, "
            f"{scoring_res.total_approved} approved, {scoring_res.total_reviewed} review, "
            f"{scoring_res.total_rejected} rejected. Selected: {len(scoring_res.ranked_candidates)}."
        )

        if not scoring_res.ranked_candidates:
            logger.info(f"[Pipeline] Zero candidates passed quality gates for project '{request.project_id}'.")
            return PipelineProcessResponse(
                status="completed",
                project_id=request.project_id,
                video_duration=request.video_duration,
                clips_generated=0,
                message="No candidate highlights satisfied the quality gating requirements.",
                clips=[],
                stages_completed=stages_completed,
            )

        # -------------------------------------------------------------
        # 6. INTELLIGENT CLIP BOUNDARY REFINEMENT
        # -------------------------------------------------------------
        refinement_req = BoundaryRefinementRequest(
            project_id=request.project_id,
            candidates=scoring_res.ranked_candidates,
            transcript=cleaned_transcript,
            video_duration=request.video_duration,
            min_duration=request.min_clip_duration,
            max_duration=request.max_clip_duration,
            scene_cut_timestamps=request.scene_cut_timestamps,
        )
        refinement_res = intelligent_boundary_refiner.refine_boundaries(refinement_req)
        stages_completed.append("boundary_refinement")
        logger.info(f"[Pipeline] Refined boundaries for {refinement_res.total_refined} candidates.")

        # -------------------------------------------------------------
        # 7. RETENTION SIGNAL ENRICHMENT
        # -------------------------------------------------------------
        retention_enriched = youtube_signal_service.enrich_candidates(
            candidates=refinement_res.refined_candidates,
            retention_report=request.retention_report,
        )
        stages_completed.append("retention_enrichment")
        retention_map = {r.candidate_id: r for r in retention_enriched}

        # -------------------------------------------------------------
        # 8. WORD SLICING & FINAL OUTPUT GENERATION
        # -------------------------------------------------------------
        scored_map = {c.candidate_id: c for c in scoring_res.ranked_candidates}

        # Flatten all word tokens from the cleaned transcript
        all_transcript_words: List[WordTimestamp] = []
        for seg in cleaned_transcript.segments:
            if seg.words:
                all_transcript_words.extend(seg.words)
            else:
                words = seg.text.split()
                if words:
                    step = (seg.end - seg.start) / len(words)
                    for i, w in enumerate(words):
                        all_transcript_words.append(
                            WordTimestamp(
                                word=w,
                                start=round(seg.start + i * step, 2),
                                end=round(seg.start + (i + 1) * step, 2),
                                probability=0.99,
                            )
                        )

        final_clips: List[PipelineClipOutput] = []

        for refined in refinement_res.refined_candidates:
            scored = scored_map.get(refined.candidate_id)
            if not scored:
                continue

            ret_info = retention_map.get(refined.candidate_id)

            # Slice words belonging specifically to this refined window [start - 0.15, end + 0.15]
            clip_words = [
                w for w in all_transcript_words
                if w.end >= (refined.refined_start - 0.15) and w.start <= (refined.refined_end + 0.15)
            ]

            # Construct clean subtitle text and ensure word timestamps are always populated
            if clip_words:
                subtitle_text = " ".join(w.word for w in clip_words)
            else:
                fallback_txt = f"{refined.opening_context} {refined.closing_context}".strip()
                if not fallback_txt:
                    fallback_txt = scored.title
                subtitle_text = fallback_txt
                # Synthesize word timestamps across clip duration so captions always render
                words_list = fallback_txt.split()
                if words_list:
                    dur = max(1.0, refined.refined_end - refined.refined_start)
                    step = dur / len(words_list)
                    for i, wrd in enumerate(words_list):
                        clip_words.append(
                            WordTimestamp(
                                word=wrd,
                                start=round(refined.refined_start + i * step, 2),
                                end=round(refined.refined_start + (i + 1) * step, 2),
                                probability=0.95,
                            )
                        )

            # Format clip title cleanly, incorporating project video title if provided
            title = scored.title
            if request.video_title and request.video_title.lower() not in title.lower():
                title = f"{request.video_title} - {title}"

            clip_output = PipelineClipOutput(
                candidate_id=refined.candidate_id,
                start=refined.refined_start,
                end=refined.refined_end,
                duration=refined.duration,
                title=title,
                category=scored.category.value,
                reason=scored.reason,
                scores=scored.category_scores,
                subtitle_text=subtitle_text,
                words=clip_words,
                needs_review=refined.needs_review,
                review_reason=refined.review_reason,
                qa_bound=refined.qa_bound,
                engagement_source=ret_info.engagement_source if ret_info else "ai_estimated_potential",
                retention_boost=ret_info.retention_boost if ret_info else 0.0,
            )
            final_clips.append(clip_output)

        # Enforce max_clips ceiling without padding
        final_clips = final_clips[:request.max_clips]

        return PipelineProcessResponse(
            status="completed",
            project_id=request.project_id,
            video_duration=request.video_duration,
            clips_generated=len(final_clips),
            message=(
                f"Successfully discovered, scored, and refined {len(final_clips)} high-value clip highlights."
                if final_clips
                else "No candidate highlights satisfied the quality gating requirements."
            ),
            clips=final_clips,
            stages_completed=stages_completed,
        )


pipeline_orchestrator = ContentIntelligencePipeline()
