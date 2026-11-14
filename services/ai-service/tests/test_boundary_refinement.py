import pytest
from typing import List, Optional
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.transcript import TranscriptResponse, TranscriptSegment, WordTimestamp
from app.schemas.refinement import (
    RefinedBoundaryCandidate,
    BoundaryRefinementRequest,
    BoundaryRefinementResponse,
)
from app.services.boundary_refinement import intelligent_boundary_refiner

client = TestClient(app)

def _build_transcript_with_words(
    segments_spec: List[dict],
    video_dur: float,
    project_id: str = "proj_refine_test",
) -> TranscriptResponse:
    segments: List[TranscriptSegment] = []
    for s in segments_spec:
        start = float(s["start"])
        end = float(s["end"])
        words = []
        tokens = s["text"].split()
        if tokens:
            dur_per_word = (end - start) / len(tokens)
            curr = start
            for t in tokens:
                words.append(
                    WordTimestamp(
                        word=t,
                        start=round(curr, 2),
                        end=round(curr + dur_per_word * 0.85, 2),
                    )
                )
                curr += dur_per_word
        segments.append(
            TranscriptSegment(
                start=start,
                end=end,
                text=s["text"],
                speaker_id=s.get("speaker", "SPEAKER_00"),
                words=words,
            )
        )

    return TranscriptResponse(
        id=f"tr_{project_id}",
        project_id=project_id,
        duration_seconds=video_dur,
        language="en",
        model_used="faster-whisper/base",
        segments=segments,
        raw_text=" ".join(s["text"] for s in segments_spec),
        word_count=sum(len(s["text"].split()) for s in segments_spec),
    )


# ==========================================
# 1. Sentence Beginning & Ending Refinements
# ==========================================

def test_sentence_beginning_no_mid_sentence_cut():
    """If candidate raw_start is mid-sentence, refiner snaps back to first word of the sentence."""
    spec = [
        {"start": 0.0, "end": 12.0, "text": "In 2020, we launched our company with three engineers and zero revenue.", "speaker": "Speaker_0"},
        {"start": 12.5, "end": 28.0, "text": "The hardest lesson we learned was that distribution always beats product quality.", "speaker": "Speaker_0"},
    ]
    tr = _build_transcript_with_words(spec, video_dur=30.0)

    # Raw start is at 18.0s (in the middle of the second sentence)
    req = BoundaryRefinementRequest(
        project_id="proj_start_test",
        candidates=[{"candidate_id": "c1", "start": 18.0, "end": 27.5}],
        transcript=tr,
        video_duration=30.0,
        min_duration=10.0,
        max_duration=30.0,
    )
    res = intelligent_boundary_refiner.refine_all_candidates(req)
    assert res.total_refined == 1
    cand = res.refined_candidates[0]

    # Must snap back to sentence start (~12.5s) instead of beginning at 18.0s
    assert cand.refined_start <= 12.5
    assert cand.refined_start >= 12.3
    assert cand.refined_end >= 27.0


def test_sentence_ending_no_mid_sentence_cut():
    """If candidate raw_end is mid-sentence, refiner extends forward to terminal punctuation."""
    spec = [
        {"start": 0.0, "end": 10.0, "text": "Why do startups run out of money?", "speaker": "Host"},
        {"start": 10.5, "end": 18.0, "text": "They hire too fast before product-market fit.", "speaker": "Guest"},
        {"start": 18.5, "end": 30.0, "text": "When your payroll outpaces your monthly recurring revenue, bankruptcy is inevitable.", "speaker": "Guest"},
    ]
    tr = _build_transcript_with_words(spec, video_dur=35.0)

    # Raw end is at 22.0s (cutting off 'bankruptcy is inevitable.')
    req = BoundaryRefinementRequest(
        project_id="proj_end_test",
        candidates=[{"candidate_id": "c2", "start": 10.5, "end": 22.0}],
        transcript=tr,
        video_duration=35.0,
        min_duration=10.0,
        max_duration=35.0,
    )
    res = intelligent_boundary_refiner.refine_all_candidates(req)
    cand = res.refined_candidates[0]

    # Must include the complete conclusion up to 30.0s
    assert cand.refined_end >= 29.5
    assert "concludes" in cand.closing_context.lower()


# ==========================================
# 2. Q&A Binding
# ==========================================

def test_qa_binding_includes_question():
    """When an approved answer needs the question to make sense, refiner binds start to the question."""
    spec = [
        {"start": 5.0, "end": 11.0, "text": "What is the single biggest secret to viral retention on YouTube?", "speaker": "Host"},
        {"start": 11.5, "end": 26.0, "text": "Because the algorithm prioritizes watch time, you must deliver payoff in the first five seconds.", "speaker": "Creator"},
        {"start": 26.5, "end": 38.0, "text": "If you hold their attention past twenty seconds, your retention curve flattens out completely.", "speaker": "Creator"},
    ]
    tr = _build_transcript_with_words(spec, video_dur=45.0)

    # Candidate starts at 11.5s (just the answer starting with 'Because...')
    req = BoundaryRefinementRequest(
        project_id="proj_qa_test",
        candidates=[{"candidate_id": "c_qa", "start": 11.5, "end": 37.0}],
        transcript=tr,
        video_duration=45.0,
        min_duration=15.0,
        max_duration=45.0,
    )
    res = intelligent_boundary_refiner.refine_all_candidates(req)
    cand = res.refined_candidates[0]

    # Q&A binding must expand back to host's question (5.0s)
    assert cand.qa_bound is True
    assert cand.refined_start <= 5.1
    assert cand.refined_end >= 37.0


# ==========================================
# 3. Long Storytelling & Context Preservation
# ==========================================

def test_long_storytelling_preserves_context_over_duration():
    """Never destroy context just to satisfy duration limit; mark needs_review rather than cutting."""
    spec = [
        {"start": 0.0, "end": 15.0, "text": "Let me tell you the story of how our submarine lost power in the Atlantic.", "speaker": "Captain"},
        {"start": 15.5, "end": 35.0, "text": "The main diesel generators shut down, and we were descending rapidly through dark water.", "speaker": "Captain"},
        {"start": 35.5, "end": 55.0, "text": "Our chief engineer manually navigated the flooded compartment with a manual hand crank.", "speaker": "Captain"},
        {"start": 55.5, "end": 78.0, "text": "In the end, that brave decision restored our ballast tanks and saved every single life on board.", "speaker": "Captain"},
    ]
    tr = _build_transcript_with_words(spec, video_dur=85.0)

    # Max duration configured as 50.0s, but complete story takes ~78s
    req = BoundaryRefinementRequest(
        project_id="proj_story_test",
        candidates=[{"candidate_id": "c_story", "start": 0.0, "end": 75.0}],
        transcript=tr,
        video_duration=85.0,
        min_duration=20.0,
        max_duration=50.0,  # Strict target max
    )
    res = intelligent_boundary_refiner.refine_all_candidates(req)
    cand = res.refined_candidates[0]

    # Story MUST NOT be cut off at 50s; complete ending must be preserved
    assert cand.refined_end >= 77.0
    assert cand.duration > 50.0
    # Must be flagged for review with clear explanation
    assert cand.needs_review is True
    assert "exceeds" in cand.review_reason.lower()


# ==========================================
# 4. Natural Pauses & Silence Trimming
# ==========================================

def test_silence_trimming_avoids_dead_air():
    """Long gap of dead air between sentences is trimmed so clip starts cleanly at speech onset."""
    spec = [
        {"start": 0.0, "end": 5.0, "text": "First introductory remark.", "speaker": "Host"},
        # 4 seconds of dead silence between 5.0 and 9.0
        {"start": 9.0, "end": 22.0, "text": "The core thesis is that focus compounds exponentially.", "speaker": "Guest"},
    ]
    tr = _build_transcript_with_words(spec, video_dur=25.0)

    # Raw start lands at 6.0s (in dead silence)
    req = BoundaryRefinementRequest(
        project_id="proj_silence_test",
        candidates=[{"candidate_id": "c_silence", "start": 6.0, "end": 21.0}],
        transcript=tr,
        video_duration=25.0,
        min_duration=10.0,
        max_duration=30.0,
    )
    res = intelligent_boundary_refiner.refine_all_candidates(req)
    cand = res.refined_candidates[0]

    # Must start near speech onset (~8.9s) rather than 6.0s dead silence
    assert cand.refined_start >= 8.8
    assert cand.refined_start <= 9.1


# ==========================================
# 5. Visual Scene Cut Alignment
# ==========================================

def test_scene_cut_visual_alignment():
    """When a scene cut timestamp is within tolerance, refiner aligns boundary to the visual transition."""
    spec = [
        {"start": 10.0, "end": 25.0, "text": "Here is the practical technique for doubling your read speed.", "speaker": "Teacher"},
        {"start": 25.5, "end": 40.0, "text": "Practice peripheral vision tracking for twenty minutes every morning.", "speaker": "Teacher"},
    ]
    tr = _build_transcript_with_words(spec, video_dur=45.0)

    # Scene cut occurs at 9.8s (near speech onset at 10.0s)
    scene_cuts = [9.8, 40.2]

    req = BoundaryRefinementRequest(
        project_id="proj_visual_test",
        candidates=[{"candidate_id": "c_vis", "start": 10.0, "end": 39.5}],
        transcript=tr,
        video_duration=45.0,
        min_duration=15.0,
        max_duration=45.0,
        scene_cut_timestamps=scene_cuts,
    )
    res = intelligent_boundary_refiner.refine_all_candidates(req)
    cand = res.refined_candidates[0]

    assert cand.visual_aligned is True
    assert cand.refined_start == 9.8


# ==========================================
# 6. Bounds Validation
# ==========================================

def test_timestamps_bounded_by_video_duration():
    """Refined timestamps must strictly stay within 0.0 and video_duration."""
    spec = [
        {"start": 50.0, "end": 60.0, "text": "Final concluding statement.", "speaker": "Speaker"},
    ]
    tr = _build_transcript_with_words(spec, video_dur=60.0)

    req = BoundaryRefinementRequest(
        project_id="proj_bounds_test",
        candidates=[{"candidate_id": "c_bounds", "start": 48.0, "end": 65.0}],
        transcript=tr,
        video_duration=60.0,
    )
    res = intelligent_boundary_refiner.refine_all_candidates(req)
    cand = res.refined_candidates[0]

    assert cand.refined_start >= 0.0
    assert cand.refined_end <= 60.0


# ==========================================
# 7. FastAPI Refinement Router Test
# ==========================================

def test_api_refinement_endpoint():
    """Verify POST /api/v1/refinement/refine endpoint."""
    spec = [
        {"start": 0.0, "end": 8.0, "text": "Why do ninety percent of creators fail in year one?", "speaker": "Host"},
        {"start": 8.5, "end": 25.0, "text": "They build without distribution. Focus on audience before product.", "speaker": "Expert"},
    ]
    tr = _build_transcript_with_words(spec, video_dur=30.0)

    payload = {
        "project_id": "proj_api_refine",
        "candidates": [{"candidate_id": "c_api", "start": 8.5, "end": 24.0}],
        "transcript": tr.model_dump(mode="json"),
        "video_duration": 30.0,
        "min_duration": 10.0,
        "max_duration": 30.0,
    }

    resp = client.post("/api/v1/refinement/refine", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["project_id"] == "proj_api_refine"
    assert data["total_refined"] == 1
    first = data["refined_candidates"][0]
    assert first["candidate_id"] == "c_api"
    assert first["qa_bound"] is True
    assert first["refined_start"] <= 0.1
    assert first["refined_end"] >= 24.5
    assert first["boundary_confidence"] >= 0.85
    assert "opening_context" in first
    assert "closing_context" in first

