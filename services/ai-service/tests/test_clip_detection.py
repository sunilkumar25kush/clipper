import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.transcript import TranscriptResponse, TranscriptSegment, WordTimestamp
from app.schemas.clip import (
    ClipCandidate,
    ClipCategory,
    ClipScores,
    ClipDetectionRequest,
    ClipDetectionResponse,
)
from app.services.boundary_optimizer import BoundaryOptimizer
from app.services.clip_nms import TemporalNMS
from app.services.clip_detector import clip_detection_engine
from app.services.storage import transcript_storage

client = TestClient(app)

def create_sample_transcript() -> TranscriptResponse:
    """Creates a sample multi-speaker transcript with known moments."""
    segments = [
        TranscriptSegment(
            start=0.0,
            end=6.5,
            text="Why do ninety percent of creators fail in their very first year?",
            speaker_id="speaker_0",
            words=[
                WordTimestamp(word="Why", start=0.0, end=0.4),
                WordTimestamp(word="do", start=0.45, end=0.6),
                WordTimestamp(word="ninety", start=0.65, end=1.1),
                WordTimestamp(word="percent", start=1.15, end=1.6),
                WordTimestamp(word="of", start=1.65, end=1.8),
                WordTimestamp(word="creators", start=1.85, end=2.4),
                WordTimestamp(word="fail", start=2.45, end=2.9),
                WordTimestamp(word="in", start=2.95, end=3.1),
                WordTimestamp(word="their", start=3.15, end=3.4),
                WordTimestamp(word="very", start=3.45, end=3.8),
                WordTimestamp(word="first", start=3.85, end=4.3),
                WordTimestamp(word="year?", start=4.35, end=5.2),
            ],
        ),
        TranscriptSegment(
            start=6.5,
            end=18.0,
            text="The single biggest mistake is building content without understanding the first three-second hook.",
            speaker_id="speaker_0",
            words=[
                WordTimestamp(word="The", start=6.5, end=6.7),
                WordTimestamp(word="single", start=6.75, end=7.1),
                WordTimestamp(word="biggest", start=7.15, end=7.6),
                WordTimestamp(word="mistake", start=7.65, end=8.1),
                WordTimestamp(word="is", start=8.15, end=8.3),
                WordTimestamp(word="building", start=8.35, end=8.8),
                WordTimestamp(word="content", start=8.85, end=9.4),
                WordTimestamp(word="without", start=9.45, end=9.9),
                WordTimestamp(word="understanding", start=9.95, end=10.7),
                WordTimestamp(word="the", start=10.75, end=10.9),
                WordTimestamp(word="first", start=10.95, end=11.3),
                WordTimestamp(word="three-second", start=11.35, end=12.1),
                WordTimestamp(word="hook.", start=12.15, end=12.8),
            ],
        ),
        TranscriptSegment(
            start=18.0,
            end=32.0,
            text="Here is the 3-step framework: pattern interrupt, emotional resonance, and a clear takeaway.",
            speaker_id="speaker_1",
            words=[
                WordTimestamp(word="Here", start=18.0, end=18.3),
                WordTimestamp(word="is", start=18.35, end=18.5),
                WordTimestamp(word="the", start=18.55, end=18.7),
                WordTimestamp(word="3-step", start=18.75, end=19.3),
                WordTimestamp(word="framework:", start=19.35, end=20.1),
                WordTimestamp(word="pattern", start=20.15, end=20.6),
                WordTimestamp(word="interrupt,", start=20.65, end=21.2),
                WordTimestamp(word="emotional", start=21.25, end=21.8),
                WordTimestamp(word="resonance,", start=21.85, end=22.5),
                WordTimestamp(word="and", start=22.55, end=22.7),
                WordTimestamp(word="a", start=22.75, end=22.8),
                WordTimestamp(word="clear", start=22.85, end=23.3),
                WordTimestamp(word="takeaway.", start=23.35, end=24.0),
            ],
        ),
        TranscriptSegment(
            start=32.0,
            end=45.0,
            text="If you master this rule, your audience retention doubles overnight.",
            speaker_id="speaker_1",
            words=[
                WordTimestamp(word="If", start=32.0, end=32.2),
                WordTimestamp(word="you", start=32.25, end=32.4),
                WordTimestamp(word="master", start=32.45, end=32.9),
                WordTimestamp(word="this", start=32.95, end=33.2),
                WordTimestamp(word="rule,", start=33.25, end=33.7),
                WordTimestamp(word="your", start=33.75, end=34.0),
                WordTimestamp(word="audience", start=34.05, end=34.6),
                WordTimestamp(word="retention", start=34.65, end=35.2),
                WordTimestamp(word="doubles", start=35.25, end=35.8),
                WordTimestamp(word="overnight.", start=35.85, end=36.6),
            ],
        ),
    ]
    return TranscriptResponse(
        id="test-transcript-sample",
        project_id="proj-test-123",
        language="en",
        duration_seconds=45.0,
        word_count=50,
        model_used="faster-whisper-test",
        speakers_detected=["speaker_0", "speaker_1"],
        segments=segments,
    )

# --- 1. Health & Metadata Tests ---

def test_health_reports_gemini():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "gemini" in data
    assert "primary_model" in data["gemini"]
    assert "has_api_key" in data["gemini"]

def test_get_categories():
    response = client.get("/api/v1/clips/categories")
    assert response.status_code == 200
    categories = response.json()
    expected_categories = [
        "funny", "educational", "important", "interesting",
        "motivational", "storytelling", "emotional",
        "strong_opinions", "potentially_viral"
    ]
    for cat in expected_categories:
        assert cat in categories

# --- 2. Schema & Scoring Tests ---

def test_clip_scores_composite_calculation():
    scores = ClipScores(hook=90, engagement=85, context=95)
    # Expected overall = round(0.30*90 + 0.40*85 + 0.30*95) = round(27 + 34 + 28.5) = round(89.5) = 90
    assert scores.overall in (89, 90)

def test_clip_candidate_rejects_invalid_timestamps():
    with pytest.raises(ValueError):
        ClipCandidate(
            start=25.0,
            end=10.0,  # Invalid: end < start
            title="Invalid Clip",
            category=ClipCategory.EDUCATIONAL,
            reason="Test reason with enough characters to pass validation",
            scores=ClipScores(hook=80, engagement=80, context=80, overall=80),
        )

# --- 3. Boundary Optimization Tests ---

def test_boundary_optimizer_snaps_words():
    transcript = create_sample_transcript()
    words = []
    for s in transcript.segments:
        if s.words:
            words.extend(s.words)

    # Raw start = 0.5 (near "do"), should snap back to sentence start "Why" (0.0) minus 120ms (clamped to 0.0)
    snapped_start, snapped_end = BoundaryOptimizer.optimize_boundaries(
        raw_start=0.5,
        raw_end=22.0,
        all_words=words,
        video_duration=45.0,
        min_duration=15.0,
        max_duration=35.0,
    )

    assert snapped_start == 0.0
    assert snapped_end > snapped_start
    assert (snapped_end - snapped_start) >= 15.0
    assert snapped_end <= 45.0

# --- 4. Temporal NMS Deduplication Tests ---

def test_temporal_nms_deduplication():
    c1 = ClipCandidate(
        start=0.0,
        end=25.0,
        title="High Scoring Clip",
        category=ClipCategory.EDUCATIONAL,
        reason="Primary high scoring selection reason here",
        scores=ClipScores(hook=95, engagement=92, context=90, overall=92),
    )
    # c2 overlaps heavily with c1 (start=2.0, end=24.0) with lower score
    c2 = ClipCandidate(
        start=2.0,
        end=24.0,
        title="Duplicate Overlapping Clip",
        category=ClipCategory.EDUCATIONAL,
        reason="Secondary duplicate moment selection reason",
        scores=ClipScores(hook=75, engagement=70, context=70, overall=72),
    )
    # c3 is completely non-overlapping (start=28.0, end=42.0)
    c3 = ClipCandidate(
        start=28.0,
        end=42.0,
        title="Distinct Second Clip",
        category=ClipCategory.MOTIVATIONAL,
        reason="Distinct non-overlapping moment selection reason",
        scores=ClipScores(hook=85, engagement=85, context=85, overall=85),
    )

    filtered = TemporalNMS.filter_candidates([c1, c2, c3], iou_threshold=0.15, max_clips=5)
    assert len(filtered) == 2
    assert filtered[0].title == "High Scoring Clip"
    assert filtered[1].title == "Distinct Second Clip"

# --- 5. Full Clip Detection API Flow Tests ---

def test_detect_clips_endpoint_success():
    transcript = create_sample_transcript()
    # Save transcript to storage
    transcript_storage.save_transcript(transcript)

    payload = {
        "transcript_id": transcript.id,
        "video_duration": 45.0,
        "min_duration": 15.0,
        "max_duration": 40.0,
        "max_clips": 5,
    }

    response = client.post("/api/v1/clips/detect", json=payload)
    if response.status_code != 200:
        print("ERROR RESPONSE:", response.json())
    assert response.status_code == 200
    data = response.json()

    assert data["video_duration"] == 45.0
    assert data["total_candidates_found"] >= 1
    assert len(data["clips"]) >= 1

    first_clip = data["clips"][0]
    assert "start" in first_clip
    assert "end" in first_clip
    assert "title" in first_clip
    assert "category" in first_clip
    assert "reason" in first_clip
    assert "scores" in first_clip

    # Validate output schema bounds
    assert first_clip["start"] >= 0.0
    assert first_clip["end"] <= 45.0
    assert first_clip["end"] > first_clip["start"]
    duration = first_clip["end"] - first_clip["start"]
    assert duration >= 15.0
    assert duration <= 40.0

    scores = first_clip["scores"]
    assert 0 <= scores["hook"] <= 100
    assert 0 <= scores["engagement"] <= 100
    assert 0 <= scores["context"] <= 100
    assert 0 <= scores["overall"] <= 100

def test_detect_clips_with_inline_transcript():
    transcript = create_sample_transcript()
    payload = {
        "transcript": transcript.model_dump(mode="json"),
        "video_duration": 45.0,
        "min_duration": 15.0,
        "max_duration": 30.0,
        "max_clips": 3,
        "target_categories": ["educational", "strong_opinions"],
    }

    response = client.post("/api/v1/clips/detect", json=payload)
    if response.status_code != 200:
        print("ERROR RESPONSE:", response.json())
    assert response.status_code == 200
    data = response.json()
    assert data["total_candidates_found"] >= 1
    for c in data["clips"]:
        assert c["category"] in ["educational", "strong_opinions"]

def test_detect_clips_rejects_invalid_durations():
    payload = {
        "video_duration": 30.0,
        "min_duration": 40.0,  # Invalid: min_duration > video_duration
        "max_duration": 50.0,
    }
    response = client.post("/api/v1/clips/detect", json=payload)
    assert response.status_code == 422  # Pydantic validation error

def test_detect_clips_handles_empty_transcript():
    empty_transcript = TranscriptResponse(
        id="empty-trans",
        project_id="proj-empty",
        language="en",
        duration_seconds=30.0,
        word_count=0,
        model_used="faster-whisper-test",
        speakers_detected=[],
        segments=[],
    )
    payload = {
        "transcript": empty_transcript.model_dump(mode="json"),
        "video_duration": 30.0,
        "min_duration": 15.0,
        "max_duration": 30.0,
    }
    response = client.post("/api/v1/clips/detect", json=payload)
    if response.status_code != 200:
        print("ERROR RESPONSE:", response.json())
    assert response.status_code == 200
    data = response.json()
    assert data["total_candidates_found"] == 0
    assert data["clips"] == []
