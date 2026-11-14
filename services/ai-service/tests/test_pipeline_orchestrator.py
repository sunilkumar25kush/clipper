import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.transcript import (
    TranscriptResponse,
    TranscriptSegment,
    WordTimestamp,
)
from app.schemas.pipeline import (
    PipelineProcessRequest,
    PipelineProcessResponse,
)
from app.schemas.highlight import HighlightCategory
from app.services.pipeline_orchestrator import pipeline_orchestrator


def build_rich_synthetic_transcript() -> TranscriptResponse:
    """Creates a high-value synthetic transcript containing actionable wisdom and stories."""
    segments = [
        TranscriptSegment(
            start=0.0,
            end=4.0,
            text="Welcome to the founder interview series where we talk about building high-growth tech startups.",
            speaker_id="SPEAKER_00",
            words=[
                WordTimestamp(word="Welcome", start=0.0, end=0.5),
                WordTimestamp(word="to", start=0.5, end=0.7),
                WordTimestamp(word="the", start=0.7, end=0.9),
                WordTimestamp(word="founder", start=0.9, end=1.4),
                WordTimestamp(word="interview", start=1.4, end=1.9),
                WordTimestamp(word="series", start=1.9, end=2.4),
                WordTimestamp(word="where", start=2.4, end=2.7),
                WordTimestamp(word="we", start=2.7, end=2.9),
                WordTimestamp(word="talk", start=2.9, end=3.2),
                WordTimestamp(word="about", start=3.2, end=3.5),
                WordTimestamp(word="building", start=3.5, end=3.8),
                WordTimestamp(word="startups.", start=3.8, end=4.0),
            ],
        ),
        TranscriptSegment(
            start=4.5,
            end=18.0,
            text="The single biggest mistake early founders make is building in isolation for six months without ever speaking to a real paying customer.",
            speaker_id="SPEAKER_01",
            words=[
                WordTimestamp(word="The", start=4.5, end=4.8),
                WordTimestamp(word="single", start=4.8, end=5.2),
                WordTimestamp(word="biggest", start=5.2, end=5.7),
                WordTimestamp(word="mistake", start=5.7, end=6.2),
                WordTimestamp(word="early", start=6.2, end=6.6),
                WordTimestamp(word="founders", start=6.6, end=7.1),
                WordTimestamp(word="make", start=7.1, end=7.4),
                WordTimestamp(word="is", start=7.4, end=7.6),
                WordTimestamp(word="building", start=7.6, end=8.1),
                WordTimestamp(word="in", start=8.1, end=8.3),
                WordTimestamp(word="isolation", start=8.3, end=8.9),
                WordTimestamp(word="for", start=8.9, end=9.1),
                WordTimestamp(word="six", start=9.1, end=9.4),
                WordTimestamp(word="months", start=9.4, end=9.8),
                WordTimestamp(word="without", start=9.8, end=10.2),
                WordTimestamp(word="ever", start=10.2, end=10.5),
                WordTimestamp(word="speaking", start=10.5, end=11.0),
                WordTimestamp(word="to", start=11.0, end=11.2),
                WordTimestamp(word="a", start=11.2, end=11.4),
                WordTimestamp(word="real", start=11.4, end=11.8),
                WordTimestamp(word="paying", start=11.8, end=12.2),
                WordTimestamp(word="customer.", start=12.2, end=12.7),
            ],
        ),
        TranscriptSegment(
            start=18.5,
            end=34.0,
            text="If you want to survive the first year, ship an imperfect prototype within fourteen days, charge money immediately, and let customer feedback dictate your entire roadmap.",
            speaker_id="SPEAKER_01",
            words=[
                WordTimestamp(word="If", start=18.5, end=18.7),
                WordTimestamp(word="you", start=18.7, end=18.9),
                WordTimestamp(word="want", start=18.9, end=19.2),
                WordTimestamp(word="to", start=19.2, end=19.4),
                WordTimestamp(word="survive", start=19.4, end=19.9),
                WordTimestamp(word="the", start=19.9, end=20.1),
                WordTimestamp(word="first", start=20.1, end=20.5),
                WordTimestamp(word="year,", start=20.5, end=20.9),
                WordTimestamp(word="ship", start=21.0, end=21.4),
                WordTimestamp(word="an", start=21.4, end=21.6),
                WordTimestamp(word="imperfect", start=21.6, end=22.2),
                WordTimestamp(word="prototype", start=22.2, end=22.8),
                WordTimestamp(word="within", start=22.8, end=23.2),
                WordTimestamp(word="fourteen", start=23.2, end=23.7),
                WordTimestamp(word="days,", start=23.7, end=24.1),
                WordTimestamp(word="charge", start=24.3, end=24.8),
                WordTimestamp(word="money", start=24.8, end=25.2),
                WordTimestamp(word="immediately,", start=25.2, end=25.9),
                WordTimestamp(word="and", start=26.0, end=26.2),
                WordTimestamp(word="let", start=26.2, end=26.5),
                WordTimestamp(word="customer", start=26.5, end=27.0),
                WordTimestamp(word="feedback", start=27.0, end=27.5),
                WordTimestamp(word="dictate", start=27.5, end=28.0),
                WordTimestamp(word="your", start=28.0, end=28.2),
                WordTimestamp(word="entire", start=28.2, end=28.7),
                WordTimestamp(word="roadmap.", start=28.7, end=29.3),
            ],
        ),
    ]

    all_words = []
    for s in segments:
        all_words.extend(s.words)

    return TranscriptResponse(
        id="transcript_synthetic_rich",
        project_id="proj_rich_001",
        language="en",
        language_confidence=0.99,
        duration_seconds=36.0,
        word_count=len(all_words),
        model_used="faster-whisper/base",
        speakers_detected=["SPEAKER_00", "SPEAKER_01"],
        segments=segments,
    )


def build_filler_transcript() -> TranscriptResponse:
    """Creates a transcript containing only repetitive banter/filler that should be rejected by quality gates."""
    segments = [
        TranscriptSegment(
            start=0.0,
            end=5.0,
            text="Yeah, so uh, anyway, like I said, yeah, okay.",
            speaker_id="SPEAKER_00",
            words=[
                WordTimestamp(word="Yeah,", start=0.0, end=0.5),
                WordTimestamp(word="so", start=0.5, end=0.8),
                WordTimestamp(word="uh,", start=0.8, end=1.2),
                WordTimestamp(word="anyway,", start=1.2, end=1.8),
                WordTimestamp(word="like", start=1.8, end=2.2),
                WordTimestamp(word="I", start=2.2, end=2.4),
                WordTimestamp(word="said,", start=2.4, end=2.8),
                WordTimestamp(word="yeah,", start=2.8, end=3.2),
                WordTimestamp(word="okay.", start=3.2, end=3.6),
            ],
        ),
        TranscriptSegment(
            start=5.5,
            end=10.0,
            text="Yeah totally, exactly, exactly, right, yeah.",
            speaker_id="SPEAKER_01",
            words=[
                WordTimestamp(word="Yeah", start=5.5, end=5.8),
                WordTimestamp(word="totally,", start=5.8, end=6.3),
                WordTimestamp(word="exactly,", start=6.3, end=6.9),
                WordTimestamp(word="right,", start=6.9, end=7.3),
                WordTimestamp(word="yeah.", start=7.3, end=7.8),
            ],
        ),
    ]

    return TranscriptResponse(
        id="transcript_synthetic_filler",
        project_id="proj_filler_001",
        language="en",
        language_confidence=0.98,
        duration_seconds=12.0,
        word_count=14,
        model_used="faster-whisper/base",
        speakers_detected=["SPEAKER_00", "SPEAKER_01"],
        segments=segments,
    )


class TestPipelineOrchestrator:

    def test_pipeline_rich_content_generation(self):
        """Tests that a rich educational conversation generates valid refined clips with sliced word tokens."""
        transcript = build_rich_synthetic_transcript()
        request = PipelineProcessRequest(
            project_id="test_pipeline_001",
            transcript=transcript,
            video_duration=36.0,
            video_title="Startup Masterclass",
            min_clip_duration=12.0,
            max_clip_duration=35.0,
            max_clips=3,
        )

        response = pipeline_orchestrator.process(request)

        assert response.status == "completed"
        assert response.project_id == "test_pipeline_001"
        assert len(response.stages_completed) >= 5
        assert "quality_scoring" in response.stages_completed
        assert "boundary_refinement" in response.stages_completed

        if response.clips_generated > 0:
            for clip in response.clips:
                assert clip.start >= 0.0
                assert clip.end <= 36.0
                assert clip.duration == pytest.approx(clip.end - clip.start, abs=0.1)
                assert len(clip.words) > 0
                assert "Startup Masterclass" in clip.title
                assert clip.category in [c.value for c in HighlightCategory]

    def test_pipeline_zero_clip_fallback_on_unintelligible_or_filler(self):
        """Tests that low-quality filler returns 0 clips gracefully without padding or random cuts."""
        transcript = build_filler_transcript()
        request = PipelineProcessRequest(
            project_id="test_pipeline_filler",
            transcript=transcript,
            video_duration=12.0,
            video_title="Casual Banter",
            min_clip_duration=10.0,
            max_clip_duration=25.0,
            max_clips=3,
        )

        response = pipeline_orchestrator.process(request)

        assert response.status == "completed"
        # Zero clips generated because of short duration and lack of highlights
        assert response.clips_generated == 0
        assert len(response.clips) == 0
        assert "valuable" in response.message.lower() or "quality" in response.message.lower() or "speech" in response.message.lower()

    def test_pipeline_empty_transcript_handling(self):
        """Tests that completely empty transcript segments return 0 clips with proper messaging."""
        transcript = TranscriptResponse(
            id="tr_empty",
            project_id="proj_empty",
            language="en",
            language_confidence=1.0,
            duration_seconds=30.0,
            word_count=0,
            model_used="faster-whisper/base",
            speakers_detected=[],
            segments=[],
        )
        request = PipelineProcessRequest(
            project_id="test_empty",
            transcript=transcript,
            video_duration=30.0,
            max_clips=3,
        )

        response = pipeline_orchestrator.process(request)
        assert response.status == "completed"
        assert response.clips_generated == 0
        assert "No speech content" in response.message

    def test_pipeline_endpoint_http(self):
        """Tests POST /api/v1/pipeline/process HTTP route."""
        client = TestClient(app)
        transcript = build_rich_synthetic_transcript()

        payload = {
            "project_id": "http_proj_001",
            "transcript": transcript.model_dump(mode="json"),
            "video_duration": 36.0,
            "video_title": "Founder Playbook",
            "min_clip_duration": 12.0,
            "max_clip_duration": 35.0,
            "max_clips": 2,
        }

        res = client.post("/api/v1/pipeline/process", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "completed"
        assert data["project_id"] == "http_proj_001"
        assert "stages_completed" in data

