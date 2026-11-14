import pytest
from typing import List, Dict, Any
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.highlight import HighlightCandidate, HighlightCategory, TranscriptEvidence
from app.schemas.scoring import (
    ScoringDecision,
    CandidateScores,
    ScoredHighlightCandidate,
    ScoringRankingRequest,
    ScoringRankingResponse,
)
from app.services.clip_scorer import clip_scoring_engine, DEFAULT_CATEGORY_WEIGHTS

client = TestClient(app)

def _make_candidate(
    candidate_id: str,
    category: HighlightCategory,
    start: float,
    end: float,
    title: str,
    summary: str,
    hook: str,
    reason: str,
    context: str,
    evidence_text: str,
) -> HighlightCandidate:
    ev = [
        TranscriptEvidence(
            start=start,
            end=end,
            text=evidence_text,
        )
    ]
    return HighlightCandidate(
        candidate_id=candidate_id,
        category=category,
        start_time=start,
        end_time=end,
        title=title,
        summary=summary,
        hook=hook,
        reason=reason,
        context_summary=context,
        transcript_evidence=ev,
    )


# ==========================================
# 1. High-Quality vs Boring vs Random Dialogue
# ==========================================

def test_high_quality_moment_scores_excellent():
    """High-quality moment with setup, contrarian hook, and substantive lesson achieves 85+ (approved)."""
    cand = _make_candidate(
        candidate_id="cand_high_01",
        category=HighlightCategory.LIFE_LESSON,
        start=10.0,
        end=45.0,
        title="The Fatal Mistake Every First-Time Founder Makes",
        summary="A profound personal breakdown of how ignoring distribution destroyed an early startup, offering actionable advice for future founders.",
        hook="Why do ninety percent of founders build products nobody ever uses?",
        reason="Provides exceptional real-world wisdom and practical business lessons.",
        context="The speaker provides the early setup of rapid feature building, the painful conflict of running out of money, and the final resolution of prioritizing distribution.",
        evidence_text="Why do ninety percent of founders build products nobody uses? When we started, we wrote code for twelve months without talking to a single customer. That was the most painful mistake of my life because we burnt our savings. The lesson I learned is that distribution must precede development.",
    )

    scored = clip_scoring_engine.evaluate_candidate(cand)
    assert scored.overall_score >= 85
    assert scored.decision == ScoringDecision.APPROVED
    assert len(scored.rejection_reasons) == 0
    assert scored.category_scores["content_value"] >= 80
    assert scored.category_scores["hook_strength"] >= 85
    assert scored.category_scores["context"] >= 85


def test_boring_conversation_scores_low_and_rejected():
    """Boring, mundane conversational filler receives low scores (< 65) and is rejected."""
    cand = _make_candidate(
        candidate_id="cand_boring_01",
        category=HighlightCategory.LIFE_LESSON,
        start=100.0,
        end=130.0,
        title="Talking About The Weather Yesterday",
        summary="Casual discussion about the temperature in the studio.",
        hook="Yeah like you know it was sort of hot.",
        reason="Just some general casual conversation.",
        context="Brief banter between speakers with no clear resolution.",
        evidence_text="Yeah like you know basically it was sort of hot yesterday, right? Yeah totally, I mean like whatever, you know.",
    )

    scored = clip_scoring_engine.evaluate_candidate(cand)
    assert scored.overall_score < 65
    assert scored.decision == ScoringDecision.REJECTED
    assert any("threshold" in r.lower() or "substance" in r.lower() for r in scored.rejection_reasons)


def test_random_dialogue_without_substance():
    """Random dialogue without coherent structure or takeaway fails quality gates or scores below 65."""
    cand = _make_candidate(
        candidate_id="cand_random_01",
        category=HighlightCategory.EDUCATIONAL,
        start=50.0,
        end=75.0,
        title="Random Chatter",
        summary="Unconnected fragments of speech.",
        hook="Let me check my pen.",
        reason="Random words.",
        context="No setup or resolution present.",
        evidence_text="Where is my pen? Oh wait, is this microphone turned on? Um, yeah, maybe check the wire right there.",
    )

    scored = clip_scoring_engine.evaluate_candidate(cand)
    assert scored.decision == ScoringDecision.REJECTED


# ==========================================
# 2. Category-Specific Scoring Weights
# ==========================================

def test_funny_moment_utilizes_humor_weighting():
    """Funny moment with genuine humor and witty punchline achieves high overall score through humor weights."""
    cand = _make_candidate(
        candidate_id="cand_funny_01",
        category=HighlightCategory.FUNNY,
        start=20.0,
        end=50.0,
        title="Hilarious Boardroom Wardrobe Malfunction",
        summary="A hilarious story about walking into an ultra-serious corporate meeting wearing mismatched neon sneakers.",
        hook="What is the most ridiculous thing you can wear to pitch Sequoia Capital?",
        reason="Genuine humor and funny storytelling that cracked everyone up.",
        context="The speaker establishes the setup of rushing to the pitch, the hilarious reaction when the investors stared at his shoes, and the witty resolution that followed.",
        evidence_text="What is the most ridiculous thing you can wear to pitch Sequoia Capital? I walked in wearing mismatched neon sneakers! The funny thing is everyone was laughing so hard we closed the round in five minutes! It was completely hilarious and ridiculous.",
    )

    scored = clip_scoring_engine.evaluate_candidate(cand)
    assert scored.overall_score >= 80
    assert scored.decision == ScoringDecision.APPROVED
    assert scored.category_scores["humor_quality"] >= 75


def test_educational_moment_utilizes_educational_weighting():
    """Educational moment evaluated on actionable frameworks, clarity, and technical steps."""
    cand = _make_candidate(
        candidate_id="cand_edu_01",
        category=HighlightCategory.EDUCATIONAL,
        start=10.0,
        end=45.0,
        title="Step-by-Step Database Optimization Framework",
        summary="A concrete technical framework explaining how to identify unindexed lookups and introduce composite indexes.",
        hook="How do top engineering teams cut query latency by ninety percent?",
        reason="Provides actionable, step-by-step engineering clarity.",
        context="Context sets up the production slowdown problem, details the two-step indexing framework, and concludes with the measurable resolution.",
        evidence_text="How do top engineering teams cut query latency by ninety percent? First you need to inspect the query plan and identify unindexed foreign keys. Secondly, introduce a composite index matching your filter clauses. This actionable technique fundamentally solves full table scans.",
    )

    scored = clip_scoring_engine.evaluate_candidate(cand)
    assert scored.overall_score >= 85
    assert scored.decision == ScoringDecision.APPROVED
    assert scored.category_scores["educational_value"] >= 80
    assert scored.category_scores["content_value"] >= 80


# ==========================================
# 3. Quality Gate Enforcements
# ==========================================

def test_quality_gate_rejects_missing_transcript_evidence():
    """Candidate with empty transcript evidence must be rejected by Quality Gates."""
    cand = HighlightCandidate(
        candidate_id="cand_gate_no_ev",
        category=HighlightCategory.LIFE_LESSON,
        start_time=10.0,
        end_time=35.0,
        title="Missing Evidence Clip",
        summary="Valid summary text here.",
        hook="Valid hook text here?",
        reason="Valid reason text here.",
        context_summary="Speaker explains the setup and resolution cleanly.",
        transcript_evidence=[],  # MISSING EVIDENCE
    )

    scored = clip_scoring_engine.evaluate_candidate(cand)
    assert scored.decision == ScoringDecision.REJECTED
    assert any("evidence" in r.lower() for r in scored.rejection_reasons)


def test_quality_gate_rejects_invalid_timestamps():
    """Candidate with end <= start or duration < 8s is rejected."""
    cand = HighlightCandidate(
        candidate_id="cand_gate_bad_time",
        category=HighlightCategory.MOTIVATIONAL,
        start_time=20.0,
        end_time=25.0,  # 5s duration is too short for standalone clip
        title="Too Short Clip",
        summary="A short motivational phrase.",
        hook="Never quit ever.",
        reason="Good motivation.",
        context_summary="Context summary is provided here.",
        transcript_evidence=[TranscriptEvidence(start=20.0, end=25.0, text="Never give up on your goals.")],
    )

    scored = clip_scoring_engine.evaluate_candidate(cand)
    assert scored.decision == ScoringDecision.REJECTED
    assert any("too short" in r.lower() for r in scored.rejection_reasons)


def test_quality_gate_rejects_incomplete_statement_cutoff():
    """Candidate ending with a dangling conjunction (e.g. 'and', 'because') is rejected."""
    cand = _make_candidate(
        candidate_id="cand_gate_cutoff",
        category=HighlightCategory.EDUCATIONAL,
        start=10.0,
        end=35.0,
        title="Incomplete Cutoff Clip",
        summary="Explanation of programming.",
        hook="Why clean code matters.",
        reason="Explains architecture.",
        context="Setup and problem explained.",
        evidence_text="You should write modular functions because when the codebase grows large and",  # DANGLING 'and'
    )

    scored = clip_scoring_engine.evaluate_candidate(cand)
    assert scored.decision == ScoringDecision.REJECTED
    assert any("dangling conjunction" in r.lower() or "incomplete" in r.lower() for r in scored.rejection_reasons)


# ==========================================
# 4. Diversity, Overlap NMS, and Quota Selection
# ==========================================

def test_temporal_overlap_nms_rejects_duplicate_time_window():
    """When two candidates have temporal IoU > 0.15, only the higher-scoring one is accepted."""
    c1 = _make_candidate(
        candidate_id="c_top",
        category=HighlightCategory.IMPORTANT_INSIGHT,
        start=10.0,
        end=40.0,
        title="High Scoring Core Principle",
        summary="The fundamental law of compounding effort.",
        hook="Why does daily consistency beat intermittent intensity?",
        reason="Outstanding high-signal insight with complete context.",
        context="Setup, core argument, and concluding resolution provided.",
        evidence_text="Why does daily consistency beat intensity? When you execute every day for five years, the compounding advantage is impossible to catch. That's why consistency wins.",
    )

    # c2 overlaps almost entirely with c1 (start=12.0, end=42.0)
    c2 = _make_candidate(
        candidate_id="c_dup",
        category=HighlightCategory.IMPORTANT_INSIGHT,
        start=12.0,
        end=42.0,
        title="Overlapping Duplicate Principle",
        summary="Consistency beats intensity explanation.",
        hook="Daily consistency beats intensity.",
        reason="Secondary insight.",
        context="Similar context.",
        evidence_text="When you execute every day for five years, the compounding advantage is impossible to catch. That's why consistency wins.",
    )

    req = ScoringRankingRequest(
        project_id="proj_nms_test",
        candidates=[c1, c2],
        max_clips_to_select=5,
    )
    res = clip_scoring_engine.evaluate_and_rank(req)

    # Only 1 candidate accepted into ranked list
    assert res.total_approved == 1
    assert len(res.ranked_candidates) == 1
    assert res.ranked_candidates[0].candidate_id == "c_top"

    # Overlapping duplicate is marked rejected with duplicate reason
    dup_rejections = [c for c in res.rejected_candidates if c.candidate_id == "c_dup"]
    assert len(dup_rejections) == 1
    assert any("temporal iou" in r.lower() for r in dup_rejections[0].rejection_reasons)


def test_semantic_diversity_rejects_near_duplicate_topics():
    """Avoid returning multiple clips that explain the identical concept even at different timestamps."""
    c1 = _make_candidate(
        candidate_id="c_sem_1",
        category=HighlightCategory.MOTIVATIONAL,
        start=10.0,
        end=35.0,
        title="Daily Consistency Beats Talent",
        summary="Explanation of why daily consistency and discipline always outperform raw talent.",
        hook="Why consistency beats talent every single day?",
        reason="High motivational clarity.",
        context="Setup, disciplined execution, and final resolution.",
        evidence_text="Why consistency beats talent every single day? Because talent without discipline will always burn out early. Consistency creates momentum.",
    )

    c2 = _make_candidate(
        candidate_id="c_sem_2",
        category=HighlightCategory.MOTIVATIONAL,
        start=500.0,
        end=525.0,
        title="Daily Consistency Beats Talent In Life",
        summary="Explanation of why daily consistency and discipline always outperform raw talent.",
        hook="Why consistency beats talent every single day?",
        reason="High motivational clarity.",
        context="Setup, disciplined execution, and final resolution.",
        evidence_text="Why consistency beats talent every single day? Because talent without discipline will always burn out early. Consistency creates momentum.",
    )

    req = ScoringRankingRequest(
        project_id="proj_sem_test",
        candidates=[c1, c2],
        max_clips_to_select=5,
    )
    res = clip_scoring_engine.evaluate_and_rank(req)

    assert len(res.ranked_candidates) == 1
    assert any("semantic duplicate" in r.lower() for c in res.rejected_candidates for r in c.rejection_reasons)


def test_never_pads_quota_with_weak_or_rejected_candidates():
    """System returns fewer clips when quality is insufficient, never padding quota with weak candidates."""
    good_cand = _make_candidate(
        candidate_id="c_good",
        category=HighlightCategory.EDUCATIONAL,
        start=10.0,
        end=40.0,
        title="Superb Technical Architecture Insight",
        summary="Detailed explanation of event-driven choreography vs orchestration in cloud systems.",
        hook="How should distributed systems manage cross-service transactions?",
        reason="Exceptional technical clarity.",
        context="Full setup, failure modes, and resolution provided.",
        evidence_text="How should distributed systems manage cross-service transactions? Use event-driven choreography with idempotent message consumers. This eliminates distributed deadlocks.",
    )

    bad_cand_1 = _make_candidate(
        candidate_id="c_bad_1",
        category=HighlightCategory.EDUCATIONAL,
        start=100.0,
        end=125.0,
        title="Boring Chat",
        summary="Chat about weather.",
        hook="Yeah so like whatever.",
        reason="Filler talk.",
        context="No setup.",
        evidence_text="Um yeah like you know, whatever right, basically cool.",
    )

    bad_cand_2 = _make_candidate(
        candidate_id="c_bad_2",
        category=HighlightCategory.EDUCATIONAL,
        start=200.0,
        end=225.0,
        title="More Filler",
        summary="More empty chat.",
        hook="Like okay.",
        reason="More filler.",
        context="No resolution.",
        evidence_text="Yeah, right, like totally man, uh huh.",
    )

    req = ScoringRankingRequest(
        project_id="proj_quota_test",
        candidates=[good_cand, bad_cand_1, bad_cand_2],
        max_clips_to_select=10,  # User requested up to 10
        min_overall_score=65.0,
    )
    res = clip_scoring_engine.evaluate_and_rank(req)

    # Must return ONLY the 1 good candidate, NOT 10!
    assert len(res.ranked_candidates) == 1
    assert res.ranked_candidates[0].candidate_id == "c_good"
    assert res.total_rejected == 2


# ==========================================
# 5. FastAPI Scoring Router Tests
# ==========================================

def test_api_scoring_evaluate_endpoint():
    """Verify POST /api/v1/scoring/evaluate endpoint."""
    cand = _make_candidate(
        candidate_id="c_api_01",
        category=HighlightCategory.INTERESTING_FACT,
        start=30.0,
        end=65.0,
        title="Fascinating Neuroscience Fact About Memory",
        summary="Surprising explanation of how the brain consolidates memories during deep sleep phases.",
        hook="Did you know your brain replays daily events ten times faster while sleeping?",
        reason="Uncommon neuroscience fact with scientific backing.",
        context="Sets up the research question, shares the surprising discovery, and explains the biological payoff.",
        evidence_text="Did you know your brain replays daily events ten times faster while sleeping? Researchers found that hippocampal ripples compress hours of experience into milliseconds. That's how long-term memory fundamentally forms.",
    )

    payload = {
        "project_id": "proj_api_scoring",
        "candidates": [cand.model_dump(mode="json")],
        "max_clips_to_select": 5,
        "min_overall_score": 65.0,
    }

    resp = client.post("/api/v1/scoring/evaluate", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["project_id"] == "proj_api_scoring"
    assert data["total_evaluated"] == 1
    assert len(data["ranked_candidates"]) == 1

    first = data["ranked_candidates"][0]
    assert first["candidate_id"] == "c_api_01"
    assert first["overall_score"] >= 80
    assert first["decision"] == "approved"
    assert "content_value" in first["category_scores"]
    assert "hook_strength" in first["category_scores"]
    assert "ranking_explanation" in first


def test_api_scoring_weights_endpoint():
    """Verify GET /api/v1/scoring/weights endpoint."""
    resp = client.get("/api/v1/scoring/weights")
    assert resp.status_code == 200
    weights = resp.json()
    assert "funny" in weights
    assert "educational" in weights
    assert "motivational" in weights
    assert "life_lesson" in weights
    assert "humor_quality" in weights["funny"]
    assert "educational_value" in weights["educational"]

