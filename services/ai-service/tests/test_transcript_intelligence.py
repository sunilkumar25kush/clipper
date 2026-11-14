import pytest
from typing import List
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.transcript import TranscriptResponse, TranscriptSegment, WordTimestamp
from app.schemas.intelligence import (
    KeyMoment,
    SemanticChunk,
    TranscriptIntelligenceRequest,
    TranscriptIntelligenceResponse,
)
from app.services.transcript_cleaner import transcript_cleaner
from app.services.semantic_chunker import semantic_chunker
from app.services.transcript_intelligence import transcript_intelligence_engine

client = TestClient(app)


# ==========================================
# Task 1 Tests: Clean Transcript
# ==========================================

def test_transcript_cleaner_removes_artifacts_and_loops():
    """Verify cleaner strips audio bracket tags, collapses loops, and filters empty segments."""
    dirty_segments = [
        TranscriptSegment(start=0.0, end=2.0, text="[Music playing]", speaker_id="speaker_0"),
        TranscriptSegment(start=2.0, end=4.5, text="   (Applause)   ", speaker_id="speaker_0"),
        TranscriptSegment(start=4.5, end=8.0, text="Hello and welcome back to the show. [applause]", speaker_id="speaker_0"),
        TranscriptSegment(
            start=8.0,
            end=14.0,
            text="Thank you. Thank you. Thank you. Thank you. Thank you. Today we talk about discipline.",
            speaker_id="speaker_1",
        ),
        # Malformed backwards timestamps
        TranscriptSegment(start=16.0, end=15.0, text="Invalid timestamps here", speaker_id="speaker_1"),
    ]

    cleaned = transcript_cleaner.clean_segments(dirty_segments)

    # Bracket-only segments must be dropped
    cleaned_texts = [s.text for s in cleaned]
    assert not any("[Music playing]" in t for t in cleaned_texts)
    assert not any("(Applause)" in t for t in cleaned_texts)

    # Segment with speech + bracket must have bracket stripped
    assert cleaned[0].text == "Hello and welcome back to the show."

    # Loop repetition must be collapsed
    assert "Today we talk about discipline" in cleaned[1].text
    assert cleaned[1].text.count("Thank you") <= 2

    # Backward timestamps must be fixed to monotonic start < end
    for seg in cleaned:
        assert seg.start < seg.end


# ==========================================
# Task 2 Tests: Semantic Chunking
# ==========================================

def test_semantic_chunker_respects_qa_and_discourse_boundaries():
    """Ensure chunking groups QA pairs, doesn't break questions from answers, and includes overlap."""
    segments = [
        TranscriptSegment(start=0.0, end=5.0, text="Let me ask you something fundamental. Why do startups fail?", speaker_id="Host"),
        TranscriptSegment(start=5.5, end=18.0, text="Startups fail almost exclusively because of running out of cash and premature scaling.", speaker_id="Guest"),
        TranscriptSegment(start=18.5, end=35.0, text="When you hire forty engineers before finding product-market fit, your burn rate destroys you.", speaker_id="Guest"),
        TranscriptSegment(start=36.0, end=55.0, text="Let's transition to the next topic. How should founders manage their hiring in year one?", speaker_id="Host"),
        TranscriptSegment(start=55.5, end=75.0, text="In year one, hire exclusively generalists who can write code and talk to customers directly.", speaker_id="Guest"),
    ]

    raw_chunks = semantic_chunker.chunk_transcript(
        segments=segments,
        max_duration=60.0,
        min_duration=20.0,
        overlap_duration=10.0,
    )

    assert len(raw_chunks) >= 2
    # First chunk must contain both the question and the explanation
    assert "Why do startups fail?" in raw_chunks[0].full_text
    assert "running out of cash" in raw_chunks[0].full_text

    # Timestamps must be preserved
    assert raw_chunks[0].start_time == 0.0
    assert raw_chunks[0].end_time > raw_chunks[0].start_time


# ==========================================
# Task 3, 4, 5 Tests: Long-Form Formats
# ==========================================

def _generate_synthetic_transcript(
    duration_seconds: float,
    topic_blocks: List[dict],
    project_id: str = "proj_test_intelligence",
) -> TranscriptResponse:
    """Helper to synthesize structured transcript responses of arbitrary length."""
    segments = []
    current_time = 0.0
    block_idx = 0
    seg_idx = 0

    while current_time < duration_seconds:
        block = topic_blocks[block_idx % len(topic_blocks)]
        sentences = block["sentences"]
        speaker = block["speaker"]
        sentence = sentences[seg_idx % len(sentences)]

        seg_dur = 4.0 + (seg_idx % 3) * 1.5
        seg_end = min(duration_seconds, round(current_time + seg_dur, 2))

        # create synthetic word timestamps
        words = sentence.split()
        word_dur = (seg_end - current_time) / max(1, len(words))
        word_ts = []
        w_curr = current_time
        for w in words:
            word_ts.append(WordTimestamp(word=w, start=round(w_curr, 2), end=round(w_curr + word_dur * 0.9, 2)))
            w_curr += word_dur

        segments.append(
            TranscriptSegment(
                start=round(current_time, 2),
                end=seg_end,
                text=sentence,
                speaker_id=speaker,
                words=word_ts,
            )
        )
        current_time = seg_end + 0.3
        seg_idx += 1
        if seg_idx % len(sentences) == 0:
            block_idx += 1

    return TranscriptResponse(
        id=f"tr_{int(duration_seconds)}s",
        project_id=project_id,
        duration_seconds=round(duration_seconds, 2),
        language="en",
        model_used="faster-whisper/base",
        segments=segments,
        raw_text=" ".join(s.text for s in segments),
        word_count=sum(len(s.text.split()) for s in segments),
    )


def test_10_minute_podcast():
    """Test 10-minute podcast transcript intelligence extraction."""
    blocks = [
        {
            "speaker": "Host",
            "sentences": [
                "Welcome to the Deep Dive podcast.",
                "Today we are discussing how morning routines shape creative output.",
                "Why is the first hour of your day so decisive for cognitive clarity?",
            ],
        },
        {
            "speaker": "Guest",
            "sentences": [
                "Cortisol levels naturally peak about thirty minutes after waking up.",
                "If you check your email immediately, you spike reactive stress into your bloodstream.",
                "Instead, hydrate, get natural sunlight in your eyes, and do sixty minutes of deep work.",
            ],
        },
        {
            "speaker": "Guest",
            "sentences": [
                "For example, let me tell you what happened when I changed this in 2021.",
                "My team shipped twice as many features because our mornings were distraction-free.",
                "The core takeaway is simple: protect your attention before giving it away to algorithms.",
            ],
        },
    ]

    transcript = _generate_synthetic_transcript(600.0, blocks)
    response = transcript_intelligence_engine.analyze_transcript(
        transcript=transcript,
        video_title="The Power of Morning Routines",
        max_chunk_duration=180.0,
        min_chunk_duration=45.0,
    )

    # Pydantic validation verification
    assert isinstance(response, TranscriptIntelligenceResponse)
    assert response.total_chunks >= 3
    assert response.total_duration == 600.0
    assert len(response.global_topics) > 0
    assert response.global_summary != ""

    for chunk in response.chunks:
        assert chunk.start_time < chunk.end_time
        assert len(chunk.main_topic) > 0
        assert len(chunk.summary) > 0
        assert len(chunk.key_moments) > 0
        for km in chunk.key_moments:
            # Key moment must fit within chunk boundaries
            assert km.start_time >= chunk.start_time
            assert km.end_time <= chunk.end_time
            assert km.start_time <= km.end_time
            assert km.importance_score >= 0.0


def test_30_minute_podcast():
    """Test 30-minute podcast handling with chronologically ordered semantic chunks."""
    blocks = [
        {"speaker": "Speaker_A", "sentences": ["Building scalable microservices requires disciplined domain modeling.", "You cannot just split code arbitrarily."]},
        {"speaker": "Speaker_B", "sentences": ["We learned this the hard way at Netflix.", "Network latency and partial failure modes will break you."]},
        {"speaker": "Speaker_A", "sentences": ["What are the best practices for distributed transactions?", "Saga patterns or two-phase commit?"]},
        {"speaker": "Speaker_B", "sentences": ["Two-phase commit is an anti-pattern across cloud regions.", "Use event-driven choreography with idempotent consumers."]},
    ]

    transcript = _generate_synthetic_transcript(1800.0, blocks)
    response = transcript_intelligence_engine.analyze_transcript(
        transcript=transcript,
        video_title="Distributed Systems at Scale",
        max_chunk_duration=240.0,
        min_chunk_duration=60.0,
    )

    assert response.total_chunks >= 6
    # Verify chronological order
    for i in range(len(response.chunks) - 1):
        assert response.chunks[i].start_time <= response.chunks[i + 1].start_time


def test_1_hour_podcast():
    """Test 1-hour podcast processing efficiency and coverage."""
    blocks = [
        {"speaker": "Interviewer", "sentences": ["Let us explore the history of artificial intelligence.", "From rule-based expert systems to deep transformers."]},
        {"speaker": "Professor", "sentences": ["In 1956 at Dartmouth, the founders assumed intelligence was a summer research project.", "It took seventy years to realize compute and scale were the answer."]},
        {"speaker": "Interviewer", "sentences": ["Where do you see agentic reasoning evolving over the next decade?", "Can LLMs truly plan autonomously?"]},
        {"speaker": "Professor", "sentences": ["System 2 deliberate reasoning with tree search is the future.", "Generative next-token prediction alone is insufficient for long-horizon robotics."]},
    ]

    transcript = _generate_synthetic_transcript(3600.0, blocks)
    response = transcript_intelligence_engine.analyze_transcript(
        transcript=transcript,
        video_title="The Evolution and Future of AI",
        max_chunk_duration=300.0,
        min_chunk_duration=60.0,
    )

    assert response.total_chunks >= 10
    assert response.total_words > 3000
    assert "ai" in " ".join(response.global_topics).lower() or len(response.global_topics) >= 3


def test_multi_speaker_interview():
    """Test interview with multiple speakers preserving speaker IDs and dialogue context."""
    blocks = [
        {"speaker": "Tim", "sentences": ["Welcome, Lex. What is the hardest engineering problem in humanoid robotics today?"]},
        {"speaker": "Lex", "sentences": ["Actuator density and real-time tactile feedback.", "Humans take for granted the incredible compliance in human muscles and tendons."]},
        {"speaker": "Elon", "sentences": ["I agree with Lex. Electric motors need custom planetary gearboxes with high torque efficiency."]},
    ]

    transcript = _generate_synthetic_transcript(300.0, blocks)
    response = transcript_intelligence_engine.analyze_transcript(
        transcript=transcript,
        video_title="Robotics and Engineering Panel",
    )

    # Speakers must be identified in key moments
    all_speakers = {km.speaker_id for chunk in response.chunks for km in chunk.key_moments if km.speaker_id}
    assert len(all_speakers.intersection({"Tim", "Lex", "Elon"})) > 0


def test_educational_lecture():
    """Test lecture format extracting structured takeaways, explanations, and core arguments."""
    blocks = [
        {
            "speaker": "Professor",
            "sentences": [
                "Today's lecture is on thermodynamic entropy and information theory.",
                "Claude Shannon demonstrated that information is mathematically equivalent to entropy.",
                "Let us define the fundamental equation: H equals negative sum of P log P.",
                "The core takeaway is that uncertainty is measurable and compressible.",
                "For example, in English text, the letter E appears far more frequently than the letter Z.",
            ],
        }
    ]

    transcript = _generate_synthetic_transcript(400.0, blocks)
    response = transcript_intelligence_engine.analyze_transcript(
        transcript=transcript,
        video_title="Information Theory Lecture 1",
    )

    # Check that takeaways or insights are surfaced
    moment_types = {km.moment_type for chunk in response.chunks for km in chunk.key_moments}
    assert any(t in moment_types for t in ["takeaway", "insight", "statement", "example"])


def test_multilingual_conversation():
    """Test multilingual (Hindi / Hinglish / English) speech transcript understanding."""
    segments = [
        TranscriptSegment(
            start=0.0,
            end=6.0,
            text="Aaj ke episode me hum baat karenge content creation ke biggest secrets ke baare me.",
            speaker_id="Host",
        ),
        TranscriptSegment(
            start=6.2,
            end=16.0,
            text="Agar aap daily consistent nahi ho, toh algorithm kabhi aapko push nahi karega. Consistency is key.",
            speaker_id="Guest",
        ),
        TranscriptSegment(
            start=16.5,
            end=28.0,
            text="Main hamesha bolta hoon: pehle 100 videos bina views ki chinta kiye upload karo. Tab jaake improvement aayegi.",
            speaker_id="Guest",
        ),
        TranscriptSegment(
            start=28.5,
            end=38.0,
            text="Yeh baat bilkul sach hai. What is your advice for someone who has zero equipment?",
            speaker_id="Host",
        ),
        TranscriptSegment(
            start=38.5,
            end=50.0,
            text="Smartphone camera aur natural window light se start karo, expensive gear ki shuruat me koi zarurat nahi hai.",
            speaker_id="Guest",
        ),
    ]

    transcript = TranscriptResponse(
        id="tr_multilingual_test",
        project_id="proj_multi",
        duration_seconds=50.0,
        language="hi",
        model_used="faster-whisper/base",
        segments=segments,
        raw_text=" ".join(s.text for s in segments),
        word_count=sum(len(s.text.split()) for s in segments),
    )

    response = transcript_intelligence_engine.analyze_transcript(
        transcript=transcript,
        video_title="Content Creation Hinglish Masterclass",
        min_chunk_duration=20.0,
        max_chunk_duration=60.0,
    )

    assert response.language == "hi"
    assert len(response.chunks) >= 1
    assert any("start" in chunk.text.lower() or "video" in chunk.text.lower() for chunk in response.chunks)


def test_no_meaningful_sections_skipped():
    """Assert that chunks cover the spoken timeline from beginning to end without omissions."""
    blocks = [
        {"speaker": "Speaker_1", "sentences": ["Segment one discusses point alpha.", "Alpha is foundational."]},
        {"speaker": "Speaker_2", "sentences": ["Segment two discusses point beta.", "Beta builds on alpha."]},
        {"speaker": "Speaker_1", "sentences": ["Segment three discusses point gamma.", "Gamma completes the triangle."]},
    ]

    transcript = _generate_synthetic_transcript(300.0, blocks)
    response = transcript_intelligence_engine.analyze_transcript(
        transcript=transcript,
        min_chunk_duration=40.0,
        max_chunk_duration=120.0,
    )

    # First chunk starts at 0.0
    assert response.chunks[0].start_time == 0.0
    # Final chunk reaches the end of dialogue
    assert response.chunks[-1].end_time >= 280.0

    # Ensure adjacent chunks maintain continuity (chunks touch or overlap)
    for i in range(len(response.chunks) - 1):
        assert response.chunks[i + 1].start_time <= response.chunks[i].end_time


# ==========================================
# FastAPI Router Tests
# ==========================================

def test_api_clean_endpoint():
    """Verify POST /api/v1/intelligence/clean endpoint."""
    payload = [
        {"start": 0.0, "end": 3.0, "text": "[Music] Welcome everyone!", "speaker_id": "speaker_0"},
        {"start": 3.0, "end": 6.0, "text": "   (applause)   ", "speaker_id": "speaker_0"},
    ]
    resp = client.post("/api/v1/intelligence/clean", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["text"] == "Welcome everyone!"


def test_api_analyze_endpoint():
    """Verify POST /api/v1/intelligence/analyze endpoint."""
    blocks = [
        {"speaker": "Host", "sentences": ["Why do creators burn out?", "The relentless pace."]},
        {"speaker": "Guest", "sentences": ["Because they sprint a marathon.", "Schedule rest as deliberately as work."]},
    ]
    tr = _generate_synthetic_transcript(120.0, blocks)
    req = {
        "project_id": "proj_api_test",
        "video_title": "Preventing Creator Burnout",
        "min_chunk_duration": 30.0,
        "max_chunk_duration": 90.0,
        "transcript": tr.model_dump(mode="json"),
    }
    resp = client.post("/api/v1/intelligence/analyze", json=req)
    assert resp.status_code == 200
    data = resp.json()
    assert data["project_id"] == "proj_api_test"
    assert data["total_chunks"] >= 1
    assert len(data["chunks"]) >= 1
    assert "key_moments" in data["chunks"][0]
