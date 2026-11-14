import pytest
from typing import List
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.transcript import TranscriptResponse, TranscriptSegment, WordTimestamp
from app.schemas.highlight import (
    HighlightCategory,
    HighlightCandidate,
    HighlightDiscoveryRequest,
    HighlightDiscoveryResponse,
)
from app.services.highlight_discovery import highlight_discovery_engine
from app.services.storage import candidate_storage

client = TestClient(app)

def _build_test_transcript(
    segments_data: List[dict],
    project_id: str = "proj_highlight_test",
    duration: Optional[float] = None,
) -> TranscriptResponse:
    segments: List[TranscriptSegment] = []
    total_dur = 0.0
    for s in segments_data:
        start = float(s["start"])
        end = float(s["end"])
        total_dur = max(total_dur, end)
        words = [
            WordTimestamp(word=w, start=round(start + idx * 0.3, 2), end=round(start + (idx + 1) * 0.3, 2))
            for idx, w in enumerate(s["text"].split())
        ]
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
        duration_seconds=round(duration or total_dur, 2),
        language="en",
        model_used="faster-whisper/base",
        segments=segments,
        raw_text=" ".join(s["text"] for s in segments_data),
        word_count=sum(len(s["text"].split()) for s in segments_data),
    )


# ==========================================
# Category Tests (9 Categories)
# ==========================================

def test_discover_life_lesson():
    """Identify personal experiences, life advice, lessons learned from mistakes."""
    data = [
        {"start": 0.0, "end": 10.0, "text": "When I was twenty-four, I made the biggest mistake of my career by ignoring customer feedback.", "speaker": "Founder"},
        {"start": 10.5, "end": 22.0, "text": "We built features nobody wanted and burnt half a million dollars in twelve months.", "speaker": "Founder"},
        {"start": 22.5, "end": 35.0, "text": "Looking back, that experience taught me the most valuable life advice: fall in love with the problem, not your solution.", "speaker": "Founder"},
        {"start": 35.5, "end": 48.0, "text": "In hindsight, that painful failure was the foundation of all my future wisdom.", "speaker": "Founder"},
    ]
    tr = _build_test_transcript(data, project_id="proj_life_lesson")
    req = HighlightDiscoveryRequest(
        project_id="proj_life_lesson",
        transcript=tr,
        target_categories=[HighlightCategory.LIFE_LESSON],
        min_duration=20.0,
        max_duration=60.0,
    )
    res = highlight_discovery_engine.discover_highlights(req)
    assert res.total_candidates >= 1
    cand = res.candidates[0]
    assert cand.category == HighlightCategory.LIFE_LESSON
    assert "mistake" in cand.summary.lower() or "lesson" in cand.summary.lower() or "problem" in cand.summary.lower()
    assert cand.start_time == 0.0
    assert cand.end_time >= 35.0


def test_discover_motivational():
    """Identify inspiring statements, overcoming adversity, discipline, and mindset."""
    data = [
        {"start": 0.0, "end": 12.0, "text": "Everyone wants the prize, but nobody wants the relentless daily discipline.", "speaker": "Athlete"},
        {"start": 12.5, "end": 26.0, "text": "When your alarm goes off at five in the morning and it's freezing, your mindset decides who you become.", "speaker": "Athlete"},
        {"start": 26.5, "end": 42.0, "text": "You have to push through the exhaustion because consistency beats talent every single day.", "speaker": "Athlete"},
        {"start": 42.5, "end": 55.0, "text": "Never give up when it gets painful, because failure is not an option if you keep going.", "speaker": "Athlete"},
    ]
    tr = _build_test_transcript(data, project_id="proj_motivational")
    req = HighlightDiscoveryRequest(
        project_id="proj_motivational",
        transcript=tr,
        target_categories=[HighlightCategory.MOTIVATIONAL],
        min_duration=20.0,
        max_duration=60.0,
    )
    res = highlight_discovery_engine.discover_highlights(req)
    assert res.total_candidates >= 1
    assert res.candidates[0].category == HighlightCategory.MOTIVATIONAL


def test_discover_funny_banter():
    """Identify genuine humor, unexpected laughter, and witty stories."""
    data = [
        {"start": 0.0, "end": 8.0, "text": "So I walked into the wrong board meeting wearing mismatched neon shoes.", "speaker": "Comedian"},
        {"start": 8.5, "end": 18.0, "text": "The funny thing is everyone thought it was a bold fashion statement from Silicon Valley.", "speaker": "Comedian"},
        {"start": 18.5, "end": 30.0, "text": "I was laughing so hard I could barely speak. The CEO said he loved my disruptive aesthetic.", "speaker": "Comedian"},
        {"start": 30.5, "end": 42.0, "text": "It was completely ridiculous and cracked me up for the rest of the week.", "speaker": "Comedian"},
    ]
    tr = _build_test_transcript(data, project_id="proj_funny")
    req = HighlightDiscoveryRequest(
        project_id="proj_funny",
        transcript=tr,
        target_categories=[HighlightCategory.FUNNY],
        min_duration=15.0,
        max_duration=60.0,
    )
    res = highlight_discovery_engine.discover_highlights(req)
    assert res.total_candidates >= 1
    assert res.candidates[0].category == HighlightCategory.FUNNY


def test_discover_educational_concept():
    """Identify step-by-step explanations, frameworks, technical knowledge."""
    data = [
        {"start": 0.0, "end": 10.0, "text": "Here is the step by step framework for optimizing your database query execution.", "speaker": "Engineer"},
        {"start": 10.5, "end": 22.0, "text": "First you need to inspect the query plan and identify unindexed foreign key lookups.", "speaker": "Engineer"},
        {"start": 22.5, "end": 34.0, "text": "Secondly, introduce a composite index matching the exact cardinality of your filter clauses.", "speaker": "Engineer"},
        {"start": 34.5, "end": 48.0, "text": "This actionable technique reduces table scan latency by ninety-five percent.", "speaker": "Engineer"},
    ]
    tr = _build_test_transcript(data, project_id="proj_educational")
    req = HighlightDiscoveryRequest(
        project_id="proj_educational",
        transcript=tr,
        target_categories=[HighlightCategory.EDUCATIONAL],
        min_duration=20.0,
        max_duration=60.0,
    )
    res = highlight_discovery_engine.discover_highlights(req)
    assert res.total_candidates >= 1
    assert res.candidates[0].category == HighlightCategory.EDUCATIONAL


def test_discover_interesting_facts():
    """Identify surprising facts, uncommon scientific/historical discoveries."""
    data = [
        {"start": 0.0, "end": 10.0, "text": "Did you know that honey found in ancient Egyptian tombs never spoils?", "speaker": "Scientist"},
        {"start": 10.5, "end": 22.0, "text": "Researchers found that because of its low moisture content and acidic pH, bacteria cannot survive in it.", "speaker": "Scientist"},
        {"start": 22.5, "end": 36.0, "text": "Archaeologists actually tasted three-thousand-year-old honey, and the fascinating thing is it tasted completely fresh.", "speaker": "Scientist"},
        {"start": 36.5, "end": 48.0, "text": "Studies show this natural antimicrobial property is virtually unique in the biological world.", "speaker": "Scientist"},
    ]
    tr = _build_test_transcript(data, project_id="proj_facts")
    req = HighlightDiscoveryRequest(
        project_id="proj_facts",
        transcript=tr,
        target_categories=[HighlightCategory.INTERESTING_FACT],
        min_duration=20.0,
        max_duration=60.0,
    )
    res = highlight_discovery_engine.discover_highlights(req)
    assert res.total_candidates >= 1
    assert res.candidates[0].category == HighlightCategory.INTERESTING_FACT


def test_discover_entertainment_moments():
    """Identify engaging stories, wild unexpected reactions, memorable events."""
    data = [
        {"start": 0.0, "end": 12.0, "text": "Out of nowhere, the entire stage lighting rig collapsed during live broadcast.", "speaker": "Host"},
        {"start": 12.5, "end": 24.0, "text": "It was complete wild chaos. The crowd was screaming, and the drummer kept playing like nothing happened.", "speaker": "Host"},
        {"start": 24.5, "end": 38.0, "text": "You will not believe how crazy it looked on live national television.", "speaker": "Host"},
        {"start": 38.5, "end": 50.0, "text": "It became an instant viral moment that everyone in the country was talking about.", "speaker": "Host"},
    ]
    tr = _build_test_transcript(data, project_id="proj_entertainment")
    req = HighlightDiscoveryRequest(
        project_id="proj_entertainment",
        transcript=tr,
        target_categories=[HighlightCategory.ENTERTAINMENT],
        min_duration=20.0,
        max_duration=60.0,
    )
    res = highlight_discovery_engine.discover_highlights(req)
    assert res.total_candidates >= 1
    assert res.candidates[0].category == HighlightCategory.ENTERTAINMENT


def test_discover_important_insights():
    """Identify key takeaways, core thesis, and high-signal principles."""
    data = [
        {"start": 0.0, "end": 10.0, "text": "The single biggest differentiator between good products and great products is speed.", "speaker": "Executive"},
        {"start": 10.5, "end": 22.0, "text": "The core takeaway is that high iteration velocity compounds over time.", "speaker": "Executive"},
        {"start": 22.5, "end": 35.0, "text": "When you ship twice as fast as your competitors, you get twice as many feedback loops.", "speaker": "Executive"},
        {"start": 35.5, "end": 46.0, "text": "That is the fundamental leverage point in modern technology.", "speaker": "Executive"},
    ]
    tr = _build_test_transcript(data, project_id="proj_insights")
    req = HighlightDiscoveryRequest(
        project_id="proj_insights",
        transcript=tr,
        target_categories=[HighlightCategory.IMPORTANT_INSIGHT],
        min_duration=20.0,
        max_duration=60.0,
    )
    res = highlight_discovery_engine.discover_highlights(req)
    assert res.total_candidates >= 1
    assert res.candidates[0].category == HighlightCategory.IMPORTANT_INSIGHT


def test_discover_storytelling_arc():
    """Identify narrative arc: setup, tension, turning point, resolution."""
    data = [
        {"start": 0.0, "end": 12.0, "text": "Let me tell you a story about what happened when our submarine lost power in deep water.", "speaker": "Captain"},
        {"start": 12.5, "end": 25.0, "text": "The main generators went completely silent, and the emergency lights flashed red.", "speaker": "Captain"},
        {"start": 25.5, "end": 38.0, "text": "What happened next was a junior engineer manually recalibrated the oxygen valves in complete pitch blackness.", "speaker": "Captain"},
        {"start": 38.5, "end": 52.0, "text": "In the end, that quick thinking saved the lives of every single sailor on board.", "speaker": "Captain"},
    ]
    tr = _build_test_transcript(data, project_id="proj_storytelling")
    req = HighlightDiscoveryRequest(
        project_id="proj_storytelling",
        transcript=tr,
        target_categories=[HighlightCategory.STORYTELLING],
        min_duration=20.0,
        max_duration=60.0,
    )
    res = highlight_discovery_engine.discover_highlights(req)
    assert res.total_candidates >= 1
    assert res.candidates[0].category == HighlightCategory.STORYTELLING


def test_discover_strong_opinions_and_debates():
    """Identify spicy takes, contrarian arguments, and disagreements."""
    data = [
        {"start": 0.0, "end": 11.0, "text": "I completely disagree with the idea that working sixty hours a week is required for success.", "speaker": "Author"},
        {"start": 11.5, "end": 24.0, "text": "It is total nonsense promoted by burnout culture that confuses movement with real progress.", "speaker": "Author"},
        {"start": 24.5, "end": 38.0, "text": "My contrarian take is that twenty focused hours will always outperform sixty frantic hours.", "speaker": "Author"},
        {"start": 38.5, "end": 50.0, "text": "People are completely wrong about work ethic when they ignore intellectual clarity.", "speaker": "Author"},
    ]
    tr = _build_test_transcript(data, project_id="proj_opinions")
    req = HighlightDiscoveryRequest(
        project_id="proj_opinions",
        transcript=tr,
        target_categories=[HighlightCategory.STRONG_OPINION],
        min_duration=20.0,
        max_duration=60.0,
    )
    res = highlight_discovery_engine.discover_highlights(req)
    assert res.total_candidates >= 1
    assert res.candidates[0].category == HighlightCategory.STRONG_OPINION


# ==========================================
# Context Sufficiency & Rule Tests
# ==========================================

def test_context_sufficiency_rule():
    """
    Ensure the engine does NOT cut an isolated phrase (e.g. 'That was the biggest mistake'),
    but includes the necessary surrounding setup, error, and lesson.
    """
    data = [
        {"start": 10.0, "end": 16.0, "text": "In 2018, our company was growing thirty percent month over month.", "speaker": "Founder"},
        {"start": 16.5, "end": 22.0, "text": "That was when I made the biggest mistake of my life.", "speaker": "Founder"},
        {"start": 22.5, "end": 32.0, "text": "I refused to hire senior managers because I had an ego about doing everything myself.", "speaker": "Founder"},
        {"start": 32.5, "end": 44.0, "text": "The entire executive team burnt out, and we lost eighty percent of our valuation.", "speaker": "Founder"},
        {"start": 44.5, "end": 56.0, "text": "The lesson I learned is that humility and delegation are the only ways to scale.", "speaker": "Founder"},
    ]
    tr = _build_test_transcript(data, project_id="proj_context_test")
    req = HighlightDiscoveryRequest(
        project_id="proj_context_test",
        transcript=tr,
        min_duration=30.0,
        max_duration=60.0,
    )
    res = highlight_discovery_engine.discover_highlights(req)
    assert res.total_candidates >= 1
    cand = res.candidates[0]

    # Must NOT be just the single 5-second sentence
    assert cand.duration >= 30.0
    assert cand.start_time <= 16.5
    assert cand.end_time >= 44.0
    # Must have context summary explaining setup and payoff
    assert len(cand.context_summary) > 10


def test_full_video_coverage():
    """Verify that highlight discovery evaluates the whole video (including late sections), not just the beginning."""
    data = [
        {"start": 0.0, "end": 30.0, "text": "Early video section discussing opening introductions and preliminary notes.", "speaker": "Host"},
        {"start": 30.5, "end": 60.0, "text": "Middle transition point with general discussion.", "speaker": "Host"},
        {"start": 1800.0, "end": 1830.0, "text": "At minute thirty, the biggest mistake of my entire life happened when we launched.", "speaker": "Guest"},
        {"start": 1830.5, "end": 1860.0, "text": "Looking back, that painful failure taught me life advice that changed everything.", "speaker": "Guest"},
    ]
    tr = _build_test_transcript(data, project_id="proj_late_video", duration=1860.0)
    req = HighlightDiscoveryRequest(
        project_id="proj_late_video",
        transcript=tr,
        min_duration=25.0,
        max_duration=70.0,
    )
    res = highlight_discovery_engine.discover_highlights(req)

    # Discovered candidates must include moments from the late section (t > 1800s)
    late_candidates = [c for c in res.candidates if c.start_time >= 1800.0]
    assert len(late_candidates) >= 1
    assert late_candidates[0].end_time <= 1860.0


def test_transcript_evidence_accuracy():
    """Verify that transcript evidence quotes match timestamps and text from actual transcript."""
    data = [
        {"start": 50.0, "end": 62.0, "text": "First you need to inspect the query plan and identify unindexed foreign key lookups.", "speaker": "Dev"},
        {"start": 62.5, "end": 75.0, "text": "Secondly, introduce a composite index matching the exact cardinality of your filter clauses.", "speaker": "Dev"},
        {"start": 75.5, "end": 90.0, "text": "This actionable technique fundamentally works to eliminate full table scans.", "speaker": "Dev"},
    ]
    tr = _build_test_transcript(data, project_id="proj_evidence_test", duration=100.0)
    req = HighlightDiscoveryRequest(
        project_id="proj_evidence_test",
        transcript=tr,
        min_duration=25.0,
        max_duration=60.0,
    )
    res = highlight_discovery_engine.discover_highlights(req)
    assert res.total_candidates >= 1
    cand = res.candidates[0]
    assert len(cand.transcript_evidence) >= 1
    for ev in cand.transcript_evidence:
        assert ev.start >= cand.start_time
        assert ev.end <= cand.end_time
        assert any(ev.text in s["text"] for s in data)


def test_separate_candidate_storage():
    """Verify candidate storage saves and retrieves candidate moments independently."""
    cand = HighlightCandidate(
        candidate_id="cand_test_storage_01",
        category=HighlightCategory.LIFE_LESSON,
        start_time=10.0,
        end_time=35.0,
        title="Test Life Lesson",
        summary="A valuable life lesson on discipline.",
        hook="Why discipline matters.",
        reason="Provides practical wisdom.",
        context_summary="Speaker reflects on their twenties.",
        transcript_evidence=[],
    )
    saved_path = candidate_storage.save_candidates("proj_storage_test", [cand])
    assert saved_path.endswith("proj_storage_test.json")

    loaded = candidate_storage.get_candidates("proj_storage_test")
    assert len(loaded) == 1
    assert loaded[0]["candidate_id"] == "cand_test_storage_01"
    assert loaded[0]["category"] == "life_lesson"


# ==========================================
# FastAPI Router Endpoints Test
# ==========================================

def test_api_highlight_endpoints():
    """Test POST /api/v1/highlights/discover and GET /api/v1/highlights/{project_id}."""
    data = [
        {"start": 0.0, "end": 15.0, "text": "Did you know that honey found in ancient Egyptian tombs never spoils?", "speaker": "Speaker"},
        {"start": 15.5, "end": 32.0, "text": "Researchers found that because of low moisture, bacteria cannot survive in it.", "speaker": "Speaker"},
        {"start": 32.5, "end": 45.0, "text": "Studies show this is virtually unique in the biological world.", "speaker": "Speaker"},
    ]
    tr = _build_test_transcript(data, project_id="proj_api_highlights")
    req = {
        "project_id": "proj_api_highlights",
        "video_title": "Ancient Food Mysteries",
        "transcript": tr.model_dump(mode="json"),
        "min_duration": 20.0,
        "max_duration": 60.0,
    }

    # Discover
    resp = client.post("/api/v1/highlights/discover", json=req)
    assert resp.status_code == 200
    res_data = resp.json()
    assert res_data["project_id"] == "proj_api_highlights"
    assert res_data["total_candidates"] >= 1
    assert len(res_data["candidates"]) >= 1

    # Retrieve from storage
    get_resp = client.get("/api/v1/highlights/proj_api_highlights")
    assert get_resp.status_code == 200
    stored_candidates = get_resp.json()
    assert len(stored_candidates) >= 1
    assert stored_candidates[0]["candidate_id"] == res_data["candidates"][0]["candidate_id"]

    # Categories list
    cat_resp = client.get("/api/v1/highlights/categories/list")
    assert cat_resp.status_code == 200
    cats = cat_resp.json()
    assert "life_lesson" in cats
    assert "motivational" in cats
    assert "funny" in cats
    assert "educational" in cats
    assert "interesting_fact" in cats
    assert "entertainment" in cats
    assert "important_insight" in cats
    assert "storytelling" in cats
    assert "strong_opinion" in cats
