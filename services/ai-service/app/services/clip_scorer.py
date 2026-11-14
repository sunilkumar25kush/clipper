import re
import math
import logging
from typing import List, Dict, Optional, Tuple, Set
from app.schemas.highlight import HighlightCandidate, HighlightCategory
from app.schemas.scoring import (
    ScoringDecision,
    CandidateScores,
    ScoredHighlightCandidate,
    ScoringRankingRequest,
    ScoringRankingResponse,
)

logger = logging.getLogger("clipforge.clip_scorer")

# Default category-specific scoring weight configurations (sum to 1.0)
DEFAULT_CATEGORY_WEIGHTS: Dict[HighlightCategory, Dict[str, float]] = {
    HighlightCategory.FUNNY: {
        "humor_quality": 0.35,
        "hook_strength": 0.20,
        "context": 0.20,
        "engagement": 0.15,
        "ending_quality": 0.10,
    },
    HighlightCategory.EDUCATIONAL: {
        "content_value": 0.30,
        "educational_value": 0.25,
        "context": 0.20,
        "hook_strength": 0.15,
        "ending_quality": 0.10,
    },
    HighlightCategory.MOTIVATIONAL: {
        "emotional_interest": 0.25,
        "content_value": 0.25,
        "hook_strength": 0.20,
        "ending_quality": 0.15,
        "context": 0.15,
    },
    HighlightCategory.LIFE_LESSON: {
        "content_value": 0.30,
        "context": 0.25,
        "standalone_quality": 0.20,
        "hook_strength": 0.15,
        "ending_quality": 0.10,
    },
    HighlightCategory.INTERESTING_FACT: {
        "content_value": 0.30,
        "educational_value": 0.25,
        "hook_strength": 0.20,
        "context": 0.15,
        "ending_quality": 0.10,
    },
    HighlightCategory.ENTERTAINMENT: {
        "engagement": 0.35,
        "hook_strength": 0.25,
        "storytelling_quality": 0.20,
        "context": 0.10,
        "ending_quality": 0.10,
    },
    HighlightCategory.IMPORTANT_INSIGHT: {
        "content_value": 0.35,
        "context": 0.25,
        "standalone_quality": 0.20,
        "hook_strength": 0.10,
        "ending_quality": 0.10,
    },
    HighlightCategory.STORYTELLING: {
        "storytelling_quality": 0.35,
        "hook_strength": 0.20,
        "ending_quality": 0.20,
        "context": 0.15,
        "emotional_interest": 0.10,
    },
    HighlightCategory.STRONG_OPINION: {
        "content_value": 0.30,
        "hook_strength": 0.25,
        "engagement": 0.20,
        "context": 0.15,
        "ending_quality": 0.10,
    },
}

# Discourse markers for substantive content evaluation
DANGLING_CONJUNCTIONS = re.compile(r"\b(and|or|but|because|so|yet|although|though|whereas|if|when)\s*$", re.IGNORECASE)
TERMINAL_PUNCTUATION = re.compile(r"[.!?…]\s*$")
FILLER_WORDS = set([
    "um", "uh", "like", "you", "know", "mean", "sort", "kind", "basically",
    "literally", "actually", "right", "yeah", "okay", "whatever", "totally",
    "huh", "yep", "wait", "oh"
])
SUBSTANTIVE_KEYWORDS = re.compile(
    r"\b(because|therefore|however|strategy|principle|mistake|lesson|rule|framework|result|"
    r"experience|learned|discovered|evidence|fact|truth|problem|solution|method|consistency|discipline|"
    r"technique|process|actionable|fundamentally|optimize|latency|index|foreign|query|brain|ripples|memory|sleep|sleeping)\b",
    re.IGNORECASE
)
HOOK_PATTERNS = [
    re.compile(r"\?$"),
    re.compile(r"^(why|how|what|who|when|where|never|always|the biggest|the single|most people|if you)\b", re.IGNORECASE),
    re.compile(r"\b(unpopular opinion|biggest mistake|secret to|truth about|nobody tells you)\b", re.IGNORECASE),
]

class ClipScoringEngine:
    """
    Evidence-based intelligent clip evaluation, scoring, gating, and ranking engine.
    Ensures candidates meet strict quality gates and evaluates 10 scoring dimensions
    deterministically using category-specific weights.
    """

    def __init__(self, weights: Optional[Dict[HighlightCategory, Dict[str, float]]] = None):
        self.weights = weights or DEFAULT_CATEGORY_WEIGHTS

    # ==========================================
    # Quality Gates (Hard Pass / Fail)
    # ==========================================

    def check_quality_gates(
        self,
        candidate: HighlightCandidate,
        video_duration: Optional[float] = None,
    ) -> List[str]:
        """
        Validates whether candidate passes all quality gates.
        Returns a list of specific failure reasons if any gate is breached.
        """
        rejection_reasons: List[str] = []

        # Gate 1: Transcript evidence is missing
        if not candidate.transcript_evidence:
            rejection_reasons.append("Missing transcript evidence: No spoken text citations provided.")
        else:
            total_evidence_text = " ".join(e.text for e in candidate.transcript_evidence).strip()
            if len(total_evidence_text) < 15:
                rejection_reasons.append("Transcript evidence too brief to support a standalone highlight.")

        # Gate 2: Timestamps are invalid
        if candidate.start_time < 0.0:
            rejection_reasons.append(f"Invalid start timestamp ({candidate.start_time}): Must be non-negative.")
        if candidate.end_time <= candidate.start_time:
            rejection_reasons.append(f"Invalid timestamp order: end ({candidate.end_time}) <= start ({candidate.start_time}).")
        
        duration = candidate.end_time - candidate.start_time
        if duration < 8.0:
            rejection_reasons.append(f"Clip duration ({duration:.1f}s) is too short to provide standalone context.")
        if video_duration is not None and candidate.end_time > video_duration + 2.0:
            rejection_reasons.append(f"Candidate end time ({candidate.end_time}s) exceeds video duration ({video_duration}s).")

        # Gate 3: Statement is incomplete (cut off mid-thought or ending in dangling conjunction)
        if candidate.transcript_evidence:
            last_text = candidate.transcript_evidence[-1].text.strip()
            if DANGLING_CONJUNCTIONS.search(last_text):
                rejection_reasons.append(f"Incomplete statement: Text ends with a dangling conjunction ('{last_text[-12:]}').")
            elif not TERMINAL_PUNCTUATION.search(last_text) and not last_text.endswith('"'):
                rejection_reasons.append("Incomplete thought: Last spoken evidence sentence lacks conclusive terminal punctuation.")

        # Gate 4: Insufficient context
        if not candidate.context_summary or len(candidate.context_summary.strip()) < 15:
            rejection_reasons.append("Insufficient context: Context summary does not explain setup, event, and resolution.")

        # Gate 5: Moment contains no meaningful content (empty text or pure filler/noise)
        full_text = " ".join(e.text for e in candidate.transcript_evidence).strip() if candidate.transcript_evidence else candidate.summary
        words = [w.lower() for w in re.findall(r"\b\w+\b", full_text)]
        if len(words) < 10:
            rejection_reasons.append(f"Insufficient spoken content: Contains only {len(words)} spoken words.")
        
        filler_count = sum(1 for w in words if w in FILLER_WORDS)
        substantive_count = len(SUBSTANTIVE_KEYWORDS.findall(full_text))

        # Rejection if words are predominantly filler words with zero substantive keywords
        if words and (filler_count / len(words) >= 0.35) and substantive_count == 0:
            rejection_reasons.append("Low substance: Spoken dialogue is dominated by filler words and lacks actionable content.")
        elif words and (filler_count / len(words)) > 0.60:
            rejection_reasons.append("Low substance: Spoken dialogue is dominated by filler words and lacks actionable content.")

        # Rejection if casual studio setup or mundane banter with no content value
        trivial_chatter = re.compile(r"\b(weather|microphone|pen|wire|turned on|is this on|check my)\b", re.IGNORECASE)
        if trivial_chatter.search(full_text) and substantive_count == 0:
            rejection_reasons.append("Irrelevant conversation: Casual studio chatter or mic check without viewer value.")

        # Gate 6: Assigned category unsupported
        if not isinstance(candidate.category, HighlightCategory):
            try:
                HighlightCategory(str(candidate.category))
            except Exception:
                rejection_reasons.append(f"Unsupported content category: '{candidate.category}'.")

        # Gate 7: Speech density / dead air check
        if candidate.transcript_evidence:
            evidence_span = sum(max(0.5, e.end - e.start) for e in candidate.transcript_evidence)
            if duration > 15.0 and (evidence_span / duration) < 0.35:
                rejection_reasons.append("Excessive silence: Spoken speech occupies less than 35% of the clip duration.")

        return rejection_reasons

    # ==========================================
    # 10 Dimension Deterministic Scoring
    # ==========================================

    def evaluate_dimensions(self, candidate: HighlightCandidate) -> CandidateScores:
        """
        Evaluates candidate across 10 distinct scoring dimensions deterministically.
        All scores are strictly bounded between 0.0 and 100.0.
        """
        evidence_text = " ".join(e.text for e in candidate.transcript_evidence) if candidate.transcript_evidence else candidate.summary
        words = re.findall(r"\b\w+\b", evidence_text)
        total_words = max(1, len(words))
        unique_words = len(set(w.lower() for w in words))

        # 1. Content Value (Lexical density, substantive arguments, low filler)
        lexical_richness = min(1.0, unique_words / total_words)
        substantive_hits = len(SUBSTANTIVE_KEYWORDS.findall(evidence_text))
        filler_penalty = max(0.0, (sum(1 for w in words if w.lower() in FILLER_WORDS) / total_words) * 40.0)
        content_val = max(20.0, min(100.0, 45.0 + (lexical_richness * 35.0) + min(25.0, substantive_hits * 5.0) - filler_penalty))

        # 2. Hook Strength (Opening pattern interrupt, question, bold assertion)
        hook_text = (candidate.hook or (candidate.transcript_evidence[0].text if candidate.transcript_evidence else "")).strip()
        hook_score = 65.0
        if any(pat.search(hook_text) for pat in HOOK_PATTERNS):
            hook_score += 20.0
        if 5 <= len(hook_text.split()) <= 25:
            hook_score += 10.0
        hook_strength = min(100.0, hook_score)

        # 3. Engagement Potential (Conversational dynamism, question presence, exclamation)
        has_question = "?" in evidence_text
        has_exclamation = "!" in evidence_text
        direct_address = bool(re.search(r"\b(you|we|let's|your|imagine)\b", evidence_text, re.IGNORECASE))
        engagement = min(100.0, 60.0 + (15.0 if has_question else 0.0) + (10.0 if has_exclamation else 0.0) + (15.0 if direct_address else 0.0))

        # 4. Context Completeness (Setup, event, resolution in context summary)
        ctx_text = (candidate.context_summary or "").lower()
        has_setup = any(k in ctx_text for k in ["setup", "speaker", "context", "before", "starts", "begins"])
        has_resolution = any(k in ctx_text for k in ["resolution", "lesson", "payoff", "conclusion", "result", "learned", "end", "solves", "explains"])
        ctx_score = 65.0
        if has_setup:
            ctx_score += 15.0
        if has_resolution:
            ctx_score += 20.0
        context_score = min(100.0, ctx_score)

        # 5. Emotional Interest (Vulnerability, enthusiasm, inspiration, conviction)
        emotional_keywords = re.compile(r"\b(pain|fail|failure|love|hate|scared|afraid|passion|fear|proud|dream|crying|excited|devastated|hardest)\b", re.IGNORECASE)
        emo_hits = len(emotional_keywords.findall(evidence_text))
        emotional_interest = min(100.0, 60.0 + min(35.0, emo_hits * 10.0))

        # 6. Educational Value (Actionable advice, step-by-step, frameworks, scientific facts)
        edu_keywords = re.compile(r"\b(step|framework|process|strategy|how to|technique|method|rule|formula|understand|because|first|second|solve|optimize|index|query|researchers|brain|memory|found)\b", re.IGNORECASE)
        edu_hits = len(edu_keywords.findall(evidence_text))
        educational_value = min(100.0, 55.0 + min(45.0, edu_hits * 9.0))

        # 7. Humor Quality (Jokes, irony, laughter tokens)
        humor_keywords = re.compile(r"\b(funny|laugh|joke|hilarious|ridiculous|cracked|haha|irony|crazy)\b", re.IGNORECASE)
        humor_hits = len(humor_keywords.findall(evidence_text))
        humor_quality = min(100.0, 45.0 + min(50.0, humor_hits * 15.0))

        # 8. Storytelling Quality (Narrative arc markers: setup -> conflict -> resolution)
        story_keywords = re.compile(r"\b(one day|started|suddenly|happened|next|then|finally|in the end|years ago)\b", re.IGNORECASE)
        story_hits = len(story_keywords.findall(evidence_text))
        storytelling_quality = min(100.0, 55.0 + min(40.0, story_hits * 9.0))

        # 9. Ending Quality (Terminal punctuation, conclusive wrap-up, satisfying payoff)
        last_sentence = candidate.transcript_evidence[-1].text.strip() if candidate.transcript_evidence else candidate.summary
        ends_cleanly = bool(TERMINAL_PUNCTUATION.search(last_sentence))
        conclusive_marker = bool(re.search(r"\b(that's why|in the end|the lesson|so|ultimately|matter)\b", last_sentence, re.IGNORECASE))
        ending_quality = min(100.0, 60.0 + (25.0 if ends_cleanly else 0.0) + (15.0 if conclusive_marker else 0.0))

        # 10. Standalone Clip Quality (Requires no outside context or visuals)
        has_dangling_reference = bool(re.search(r"^(as i said|like i showed earlier|on this slide|look at this)\b", evidence_text, re.IGNORECASE))
        standalone_quality = 85.0 if not has_dangling_reference else 50.0

        return CandidateScores(
            content_value=round(content_val, 1),
            hook_strength=round(hook_strength, 1),
            engagement=round(engagement, 1),
            context=round(context_score, 1),
            emotional_interest=round(emotional_interest, 1),
            educational_value=round(educational_value, 1),
            humor_quality=round(humor_quality, 1),
            storytelling_quality=round(storytelling_quality, 1),
            ending_quality=round(ending_quality, 1),
            standalone_quality=round(standalone_quality, 1),
        )

    # ==========================================
    # Category-Weighted Composite Scoring
    # ==========================================

    def compute_overall_score(
        self,
        candidate: HighlightCandidate,
        scores: CandidateScores,
        custom_weights: Optional[Dict[str, float]] = None,
    ) -> int:
        """
        Computes weighted overall composite score (0-100) using category-specific weights.
        """
        cat_weights = custom_weights or self.weights.get(candidate.category, self.weights[HighlightCategory.IMPORTANT_INSIGHT])
        total_weight = sum(cat_weights.values())
        if total_weight <= 0:
            total_weight = 1.0

        weighted_sum = 0.0
        scores_dict = {
            "content_value": scores.content_value,
            "hook_strength": scores.hook_strength,
            "engagement": scores.engagement,
            "context": scores.context,
            "emotional_interest": scores.emotional_interest,
            "educational_value": scores.educational_value,
            "humor_quality": scores.humor_quality,
            "storytelling_quality": scores.storytelling_quality,
            "ending_quality": scores.ending_quality,
            "standalone_quality": scores.standalone_quality,
        }

        for dim, weight in cat_weights.items():
            dim_score = scores_dict.get(dim, scores.content_value)
            weighted_sum += dim_score * weight

        composite = round(weighted_sum / total_weight)
        return max(0, min(100, composite))

    # ==========================================
    # Semantic Similarity & Diversity Check
    # ==========================================

    @staticmethod
    def compute_semantic_similarity(text_a: str, text_b: str) -> float:
        """Computes word-level Jaccard similarity between two texts."""
        tokens_a = set(re.findall(r"\b\w{3,}\b", text_a.lower()))
        tokens_b = set(re.findall(r"\b\w{3,}\b", text_b.lower()))
        if not tokens_a or not tokens_b:
            return 0.0
        intersection = len(tokens_a.intersection(tokens_b))
        union = len(tokens_a.union(tokens_b))
        return intersection / max(1, union)

    @staticmethod
    def compute_temporal_iou(start_a: float, end_a: float, start_b: float, end_b: float) -> float:
        intersection = max(0.0, min(end_a, end_b) - max(start_a, start_b))
        if intersection <= 0.0:
            return 0.0
        union = max(end_a, end_b) - min(start_a, start_b)
        return intersection / max(0.01, union)

    # ==========================================
    # Full Evaluation & Ranking Pipeline
    # ==========================================

    def evaluate_candidate(
        self,
        candidate: HighlightCandidate,
        video_duration: Optional[float] = None,
        custom_weights: Optional[Dict[str, float]] = None,
        custom_instructions: Optional[str] = None,
    ) -> ScoredHighlightCandidate:
        """
        Evaluates a single candidate: applies quality gates, computes dimension scores,
        calculates category-weighted score, and assigns decision.
        """
        rejection_reasons = self.check_quality_gates(candidate, video_duration)
        dim_scores = self.evaluate_dimensions(candidate)

        if rejection_reasons:
            # Quality gate breach: hard rejection regardless of high engagement
            raw_score = self.compute_overall_score(candidate, dim_scores, custom_weights)
            overall_score = min(raw_score, 45)
            decision = ScoringDecision.REJECTED
            explanation = f"Rejected by Quality Gates: {'; '.join(rejection_reasons)}"
        else:
            overall_score = self.compute_overall_score(candidate, dim_scores, custom_weights)

            # Boost score if candidate directly matches user custom instructions
            if custom_instructions:
                ci_words = set(re.findall(r"\w+", custom_instructions.lower()))
                cand_text = f"{candidate.title} {candidate.summary} {candidate.hook} {candidate.category.value}".lower()
                cand_words = set(re.findall(r"\w+", cand_text))
                overlap = ci_words.intersection(cand_words)
                meaningful_overlap = [w for w in overlap if len(w) > 3 and w not in {"with", "that", "this", "from", "have"}]
                if meaningful_overlap:
                    overall_score = min(98, overall_score + 10)

            if overall_score >= 85:
                decision = ScoringDecision.APPROVED
                explanation = "Excellent standalone highlight with compelling hook and complete context."
            elif overall_score >= 75:
                decision = ScoringDecision.APPROVED
                explanation = "Strong candidate moment with substantive insight and clean boundaries."
            elif overall_score >= 65:
                decision = ScoringDecision.REVIEW
                explanation = "Review candidate: moderate quality; secondary candidate option."
            else:
                decision = ScoringDecision.REJECTED
                rejection_reasons.append(f"Score ({overall_score}) is below quality threshold of 65.")
                explanation = "Rejected: Insufficient content density or narrative engagement."

        return ScoredHighlightCandidate(
            candidate_id=candidate.candidate_id,
            category=candidate.category,
            start_time=candidate.start_time,
            end_time=candidate.end_time,
            duration=round(candidate.end_time - candidate.start_time, 2),
            title=candidate.title,
            summary=candidate.summary,
            hook=candidate.hook,
            reason=candidate.reason,
            context_summary=candidate.context_summary,
            overall_score=overall_score,
            category_scores=dim_scores.to_category_scores_dict(),
            decision=decision,
            rejection_reasons=rejection_reasons,
            ranking_explanation=explanation,
            transcript_evidence=[e.model_dump() if hasattr(e, "model_dump") else e for e in candidate.transcript_evidence],
        )

    def evaluate_and_rank(self, request: ScoringRankingRequest) -> ScoringRankingResponse:
        """
        Evaluates, filters, deduplicates, and ranks all candidate highlights.
        Ensures topic, category, and temporal diversity.
        """
        evaluated: List[ScoredHighlightCandidate] = []
        for cand in request.candidates:
            weights_override = None
            if request.custom_weights and cand.category.value in request.custom_weights:
                weights_override = request.custom_weights[cand.category.value]
            scored = self.evaluate_candidate(
                cand,
                request.video_duration,
                weights_override,
                custom_instructions=request.custom_instructions,
            )
            evaluated.append(scored)

        # Separate approved/review from hard rejected
        valid_candidates = [c for c in evaluated if c.decision in (ScoringDecision.APPROVED, ScoringDecision.REVIEW) and c.overall_score >= request.min_overall_score]
        rejected_candidates = [c for c in evaluated if c not in valid_candidates]

        # Sort valid candidates by score descending, tie-breaking by hook and content
        valid_candidates.sort(
            key=lambda c: (
                c.overall_score,
                c.category_scores.get("hook_strength", 0),
                c.category_scores.get("content_value", 0),
            ),
            reverse=True,
        )

        # Diversity & Deduplication Selection
        selected: List[ScoredHighlightCandidate] = []
        category_counts: Dict[str, int] = {}

        for cand in valid_candidates:
            if len(selected) >= request.max_clips_to_select:
                break

            # Check 1: Temporal Overlap (NMS IoU)
            is_temporal_dup = False
            for accepted in selected:
                iou = self.compute_temporal_iou(cand.start_time, cand.end_time, accepted.start_time, accepted.end_time)
                if iou > request.temporal_iou_threshold:
                    is_temporal_dup = True
                    break

            if is_temporal_dup:
                cand.decision = ScoringDecision.REJECTED
                cand.rejection_reasons.append("Duplicate: Temporal IoU exceeds threshold with higher-scoring clip.")
                rejected_candidates.append(cand)
                continue

            # Check 2: Semantic Similarity Diversity (avoid 5 clips explaining the same idea)
            is_semantic_dup = False
            for accepted in selected:
                sim = self.compute_semantic_similarity(
                    f"{cand.title} {cand.summary} {cand.hook}",
                    f"{accepted.title} {accepted.summary} {accepted.hook}",
                )
                if sim > 0.48:
                    is_semantic_dup = True
                    break

            if is_semantic_dup:
                cand.decision = ScoringDecision.REJECTED
                cand.rejection_reasons.append("Semantic Duplicate: Topic overlap exceeds diversity threshold.")
                rejected_candidates.append(cand)
                continue

            # Passed all diversity checks
            category_counts[cand.category.value] = category_counts.get(cand.category.value, 0) + 1
            cand.rank = len(selected) + 1
            selected.append(cand)

        total_app = sum(1 for c in selected if c.decision == ScoringDecision.APPROVED)
        total_rev = sum(1 for c in selected if c.decision == ScoringDecision.REVIEW)

        return ScoringRankingResponse(
            project_id=request.project_id,
            total_evaluated=len(evaluated),
            total_approved=total_app,
            total_reviewed=total_rev,
            total_rejected=len(rejected_candidates),
            ranked_candidates=selected,
            rejected_candidates=rejected_candidates,
        )

clip_scoring_engine = ClipScoringEngine()
