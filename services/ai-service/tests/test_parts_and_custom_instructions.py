import pytest
from app.schemas.transcript import (
    TranscriptResponse,
    TranscriptSegment,
    WordTimestamp,
)
from app.schemas.pipeline import PipelineProcessRequest
from app.schemas.highlight import HighlightDiscoveryRequest, HighlightCategory, HighlightCandidate, TranscriptEvidence
from app.schemas.scoring import ScoringRankingRequest
from app.services.parts_segmentation import parts_segmentation_engine
from app.services.pipeline_orchestrator import pipeline_orchestrator
from app.services.highlight_discovery import highlight_discovery_engine
from app.services.clip_scorer import clip_scoring_engine


def make_test_transcript(num_segments: int = 15, duration_per_seg: float = 30.0) -> TranscriptResponse:
    segments = []
    total_words = 0
    sample_dialogues = [
        "Welcome everyone to today's masterclass on scaling AI architectures.",
        "Let's dive into the core bottleneck: memory bandwidth and compute efficiency.",
        "Here is the key insight: never prematurely optimize before profiling.",
        "Now let me tell you a hilarious story about our first server meltdown.",
        "Everyone thought the building was on fire because of the smoke machine.",
        "The lesson here is simple: always verify your staging environment.",
        "Moving on to step two: understanding distributed consensus protocols.",
        "Raft and Paxos solve this by having leader elections with quorum voting.",
        "Notice how fault tolerance is achieved even during network partitions.",
        "Here is an interesting fact: the term bug originated from a literal moth in 1947.",
        "Grace Hopper found it in the Mark II computer at Harvard University.",
        "Discipline always beats motivation when building something difficult.",
        "Wake up every single day and write tests before shipping code to production.",
        "In conclusion, keep your architecture clean, simple, and maintainable.",
        "Thank you all for listening, and see you in the next episode.",
    ]
    for i in range(num_segments):
        start = i * duration_per_seg
        end = (i + 1) * duration_per_seg
        text = sample_dialogues[i % len(sample_dialogues)]
        words = text.split()
        total_words += len(words)
        step = (end - start) / len(words)
        word_objs = [
            WordTimestamp(
                word=w,
                start=round(start + j * step, 2),
                end=round(start + (j + 1) * step, 2),
                probability=0.99,
            )
            for j, w in enumerate(words)
        ]
        segments.append(
            TranscriptSegment(
                id=i,
                start=start,
                end=end,
                text=text,
                speaker="SPEAKER_01" if i % 2 == 0 else "SPEAKER_02",
                words=word_objs,
            )
        )
    return TranscriptResponse(
        id="tr_test_parts",
        project_id="test_proj_parts",
        language="en",
        language_confidence=0.99,
        duration_seconds=num_segments * duration_per_seg,
        word_count=total_words,
        model_used="faster-whisper-medium",
        speakers_detected=["SPEAKER_01", "SPEAKER_02"],
        segments=segments,
    )


def test_parts_segmentation_full_timeline_coverage():
    """Verify parts mode covers the entire timeline from 0.0s to video_duration with zero gaps."""
    transcript = make_test_transcript(num_segments=10, duration_per_seg=30.0)
    video_dur = 300.0

    parts = parts_segmentation_engine.segment_into_parts(
        transcript=transcript,
        video_duration=video_dur,
        video_title="Mastering AI Architecture",
        custom_instructions="Focus on deep technical explanations",
        target_min_duration=45.0,
        target_max_duration=120.0,
    )

    assert len(parts) >= 2, "Should segment into multiple parts"
    assert parts[0].start == 0.0, "First part must start at 0.0s"
    assert parts[-1].end == video_dur, f"Final part must end at {video_dur}s"

    # Verify chronological sequence and continuity (no gaps)
    for i in range(len(parts)):
        part = parts[i]
        assert part.is_part is True
        assert part.part_number == i + 1
        assert f"Part {i + 1}" in part.title
        assert "Mastering AI Architecture" in part.title
        assert part.category == "PART"
        assert part.duration == round(part.end - part.start, 2)

        # Check contiguous boundaries
        if i > 0:
            assert abs(part.start - parts[i - 1].end) < 0.01, f"Gap or overlap between part {i} and {i+1}"


def test_pipeline_orchestrator_parts_mode_execution():
    """Verify end-to-end pipeline execution in PARTS mode."""
    transcript = make_test_transcript(num_segments=8, duration_per_seg=30.0)
    req = PipelineProcessRequest(
        project_id="parts_proj_001",
        transcript=transcript,
        video_duration=240.0,
        video_title="Deep Dive Episode 1",
        generation_mode="parts",
        custom_instructions="Prioritize system architecture",
    )

    resp = pipeline_orchestrator.process(req)
    assert resp.status == "completed"
    assert resp.clips_generated > 0
    assert "parts_segmentation" in resp.stages_completed
    assert "timeline_coverage_validated" in resp.stages_completed

    # Check each part
    for idx, clip in enumerate(resp.clips):
        assert clip.is_part is True
        assert clip.part_number == idx + 1
        assert f"Part {idx + 1}" in clip.title


def test_custom_instructions_highlight_discovery_prioritization():
    """Verify custom instructions boost matching category in highlight discovery."""
    transcript = make_test_transcript(num_segments=10, duration_per_seg=30.0)

    # Ask specifically for funny moments
    req_funny = HighlightDiscoveryRequest(
        project_id="test_custom_funny",
        transcript=transcript,
        video_title="Tech Talk & Banter",
        custom_instructions="Find the hilarious funny moments, jokes and humorous stories",
    )
    res_funny = highlight_discovery_engine.discover_highlights(req_funny)
    funny_candidates = [c for c in res_funny.candidates if c.category == HighlightCategory.FUNNY]
    assert len(funny_candidates) > 0, "Should discover funny candidates when requested"


def test_custom_instructions_scoring_boost():
    """Verify clip scorer applies an instruction alignment boost when candidate matches user instructions."""
    candidates = [
        HighlightCandidate(
            candidate_id="cand_funny_1",
            category=HighlightCategory.FUNNY,
            start_time=90.0,
            end_time=140.0,
            title="Hilarious Server Meltdown",
            summary="A funny story about smoke machines causing chaos",
            hook="Everyone thought the building was on fire",
            reason="Unexpected comedy and laughter in tech",
            context_summary="Speaker describes the incident from setup to comedic resolution.",
            transcript_evidence=[
                TranscriptEvidence(start=90.0, end=110.0, text="Now let me tell you a hilarious story about our first server meltdown.")
            ],
            confidence_score=85.0,
        ),
        HighlightCandidate(
            candidate_id="cand_edu_1",
            category=HighlightCategory.EDUCATIONAL,
            start_time=0.0,
            end_time=50.0,
            title="AI Architecture Scaling",
            summary="Technical breakdown of compute efficiency",
            hook="Let's dive into memory bandwidth",
            reason="Deep technical explanation of hardware bottlenecks",
            context_summary="Complete overview of system architectures.",
            transcript_evidence=[
                TranscriptEvidence(start=0.0, end=30.0, text="Let's dive into the core bottleneck: memory bandwidth and compute efficiency.")
            ],
            confidence_score=85.0,
        ),
    ]

    # Without custom instructions
    req_neutral = ScoringRankingRequest(
        project_id="test_score_neutral",
        candidates=candidates,
        video_duration=200.0,
        max_clips_to_select=5,
    )
    res_neutral = clip_scoring_engine.evaluate_and_rank(req_neutral)
    neutral_funny = next((c for c in res_neutral.ranked_candidates if c.candidate_id == "cand_funny_1"), None)

    # With funny custom instructions
    req_funny = ScoringRankingRequest(
        project_id="test_score_funny",
        candidates=candidates,
        video_duration=200.0,
        max_clips_to_select=5,
        custom_instructions="I want funny comedy moments and jokes",
    )
    res_funny = clip_scoring_engine.evaluate_and_rank(req_funny)
    boosted_funny = next((c for c in res_funny.ranked_candidates if c.candidate_id == "cand_funny_1"), None)

    assert neutral_funny is not None
    assert boosted_funny is not None
    assert boosted_funny.overall_score >= neutral_funny.overall_score, "Score should be boosted when matching user instructions"


def test_dynamic_clip_limit_no_artificial_3_clip_clamp():
    """Verify that requests requesting 10 clips can discover and return more than 3 clips if content qualifies."""
    transcript = make_test_transcript(num_segments=15, duration_per_seg=30.0)
    req = PipelineProcessRequest(
        project_id="proj_many_clips",
        transcript=transcript,
        video_duration=450.0,
        video_title="Comprehensive Engineering Keynote",
        max_clips=10,
        generation_mode="highlights",
    )

    resp = pipeline_orchestrator.process(req)
    assert resp.status == "completed"
    # Should not be clamped to 3!
    assert resp.clips_generated > 3, f"Expected more than 3 clips on a 450s diverse video, got {resp.clips_generated}"
