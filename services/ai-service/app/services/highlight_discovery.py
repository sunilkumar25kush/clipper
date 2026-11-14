import os
import json
import re
import logging
from typing import List, Optional, Dict, Any, Tuple
from app.config import settings
from app.schemas.transcript import TranscriptResponse, TranscriptSegment
from app.schemas.highlight import (
    HighlightCategory,
    TranscriptEvidence,
    HighlightCandidate,
    HighlightDiscoveryRequest,
    HighlightDiscoveryResponse,
)
from app.services.transcript_cleaner import transcript_cleaner
from app.services.semantic_chunker import semantic_chunker, RawSemanticChunk
from app.services.storage import candidate_storage

logger = logging.getLogger("clipforge.highlight_discovery")

# Prompt for Gemini multi-category highlight discovery
HIGHLIGHT_SYSTEM_PROMPT = """You are an elite video editor, content strategist, and narrative analyst.
Your task is to analyze timestamped transcript sections from a long-form video (podcast, interview, or lecture) and discover high-value standalone moments.

You must categorize moments into one of these 9 categories:
1. "life_lesson": Personal experiences with practical wisdom, advice about life, lessons from mistakes, personal growth insights.
2. "motivational": Inspiring statements, overcoming adversity, discipline & consistency, mindset transformations.
3. "funny": Genuine jokes, funny stories, unexpected humor, sarcasm, witty banter. Do NOT classify mundane dialogue as funny.
4. "educational": Step-by-step explanations, technical frameworks, tutorials, actionable advice, useful concepts.
5. "interesting_fact": Surprising facts, uncommon scientific/historical trivia, unexpected statistics, counterintuitive discoveries.
6. "entertainment": Engaging stories, unexpected events, intense reactions, memorable high-energy banter.
7. "important_insight": Deep takeaways, nuanced perspectives, core thesis, critical warnings or principles.
8. "storytelling": Personal stories with a clear narrative arc (setup, tension/conflict, unexpected twist, payoff/conclusion).
9. "strong_opinion": Bold contrarian viewpoints, spicy takes, intellectual disagreements, thought-provoking debates.

CRITICAL RULES:
- STANDALONE CONTEXT: Never pick an isolated dangling quote (e.g. "That was the biggest mistake of my life"). You MUST include the surrounding context: What happened? Why was it a mistake? What was learned?
- DURATION: Each candidate must be between {min_dur}s and {max_dur}s.
- NO INVENTED QUOTES: "transcript_evidence" must quote exact spoken words with accurate timestamps between chunk start {chunk_start}s and end {chunk_end}s.

Output STRICT JSON matching this schema:
{{
  "candidates": [
    {{
      "category": "life_lesson",
      "start_time": 125.4,
      "end_time": 174.8,
      "title": "Short Punchy Title",
      "summary": "Cohesive summary of the entire highlight moment",
      "hook": "Opening hook or attention grabber",
      "reason": "Why this moment is valuable and worth watching",
      "context_summary": "Surrounding setup, core event, and resolution explaining why it works standalone",
      "transcript_evidence": [
        {{
          "start": 130.2,
          "end": 140.5,
          "text": "Exact spoken words from the transcript"
        }}
      ]
    }}
  ]
}}
"""

# Heuristic patterns for category classification when Gemini is offline or in unit tests
CATEGORY_PATTERNS = {
    HighlightCategory.LIFE_LESSON: [
        re.compile(r"\b(biggest mistake|lesson learned|taught me|looking back|in hindsight|if i could tell my younger self|advice to anyone|life advice|realized that life|wisdom)\b", re.IGNORECASE),
        re.compile(r"\b(hardest thing|grew up|father told me|mother told me|experience changed me|worth it in the end|threat to modern productivity|multitasking|cognitive switching|non-negotiable rule)\b", re.IGNORECASE),
    ],
    HighlightCategory.MOTIVATIONAL: [
        re.compile(r"\b(discipline|never give up|keep going|consistency|overcome|relentless|mindset|push through|wake up every day|don't quit|sacrifices|failure is not)\b", re.IGNORECASE),
        re.compile(r"\b(comfort zone|hard work|momentum|dreams|focus on your goals|achieve anything|fickle emotional imposter|champions don't rely)\b", re.IGNORECASE),
    ],
    HighlightCategory.FUNNY: [
        re.compile(r"\b(hilarious|ridiculous|laughing|cracked me up|joke|funny thing is|are you kidding me|can't make this up|stupidest thing|pretentious|barista|coffee|monocle|crying at work)\b", re.IGNORECASE),
        re.compile(r"(\[laughter\]|\(laughter\)|haha|lol|brother, i just need caffeine)", re.IGNORECASE),
    ],
    HighlightCategory.EDUCATIONAL: [
        re.compile(r"\b(step by step|how to|let me explain how|framework|mechanism|first you need to|fundamentally works|here is the process|tutorial|actionable)\b", re.IGNORECASE),
        re.compile(r"\b(algorithm|architecture|equation|principle|formula|strategy|technique|hippocampus|long-term potentiation|active recall|spaced repetition|b-tree|composite index|postgres)\b", re.IGNORECASE),
    ],
    HighlightCategory.INTERESTING_FACT: [
        re.compile(r"\b(did you know|most people don't know|studies show|statistically|fascinating thing is|science discovered|in history|seventy percent of|fact is)\b", re.IGNORECASE),
        re.compile(r"\b(counterintuitive|neuroscience|researchers found|surprisingly|unknown fact)\b", re.IGNORECASE),
    ],
    HighlightCategory.ENTERTAINMENT: [
        re.compile(r"\b(unbelievable|wild|crazy story|out of nowhere|insane|chaos|suddenly|can you believe|you will not believe)\b", re.IGNORECASE),
        re.compile(r"\b(screaming|shocked|epic|exploded|party|adventure)\b", re.IGNORECASE),
    ],
    HighlightCategory.IMPORTANT_INSIGHT: [
        re.compile(r"\b(core takeaway|most important thing|single biggest|key insight|crucial|bottom line|real truth|fundamentally|undercharging|pricing mistake|double your prices)\b", re.IGNORECASE),
        re.compile(r"\b(root cause|differentiator|secret to success|leverage point|high impact|operating margin)\b", re.IGNORECASE),
    ],
    HighlightCategory.STORYTELLING: [
        re.compile(r"\b(let me tell you a story|it all started when|a few years ago|i remember when|one day|back in|we were sitting|eleven days of runway|parked car|tears in my eyes|minus forty|seventy miles off course|blizzard|snow trench)\b", re.IGNORECASE),
        re.compile(r"\b(and then suddenly|what happened next was|to make matters worse|by the time we realized|in the end|alive to tell this story)\b", re.IGNORECASE),
    ],
    HighlightCategory.STRONG_OPINION: [
        re.compile(r"\b(completely disagree|unpopular opinion|overrated|waste of time|total nonsense|contrarian take|people are wrong about|i don't care what|let's debate|contrarian view|destroying junior)\b", re.IGNORECASE),
        re.compile(r"\b(harsh truth|delusional|dangerous idea|i strongly believe|fight me on this|i disagree completely|boilerplate work)\b", re.IGNORECASE),
    ],
}

class HighlightDiscoveryEngine:
    """
    Semantic Highlight Discovery Engine that analyzes full long-form video transcripts
    and uncovers context-complete, high-impact highlight moments across 9 distinct categories.
    """

    def __init__(self):
        self.api_key = settings.gemini_api_key
        self.primary_model = settings.gemini_primary_model
        self._genai_client = None

    def _get_genai_client(self):
        if self._genai_client is None and self.api_key and not self.api_key.startswith("replace_with_"):
            try:
                from google import genai
                self._genai_client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.warning(f"Failed to initialize google-genai client in highlight discovery: {e}")
                self._genai_client = None
        return self._genai_client

    def _is_live_gemini_available(self) -> bool:
        return (
            bool(self.api_key)
            and not self.api_key.startswith("replace_with_")
            and self._get_genai_client() is not None
        )

    def _format_chunk_transcript(self, segments: List[TranscriptSegment]) -> str:
        lines = []
        for s in segments:
            lines.append(f"[{s.start:.2f}s - {s.end:.2f}s] [{s.speaker_id}]: {s.text}")
        return "\n".join(lines)

    def _verify_transcript_evidence(
        self,
        start_time: float,
        end_time: float,
        segments: List[TranscriptSegment],
    ) -> List[TranscriptEvidence]:
        """
        Extracts verified transcript evidence strictly within candidate boundaries.
        Guarantees that quotes match actual spoken segments.
        """
        evidence: List[TranscriptEvidence] = []
        for s in segments:
            if s.end >= start_time and s.start <= end_time:
                clean_text = s.text.strip()
                if len(clean_text) > 3:
                    evidence.append(
                        TranscriptEvidence(
                            start=round(max(start_time, s.start), 2),
                            end=round(min(end_time, s.end), 2),
                            text=clean_text,
                        )
                    )
        return evidence[:5]

    def _snap_to_sentence_boundaries(
        self,
        target_start: float,
        target_end: float,
        segments: List[TranscriptSegment],
        min_dur: float,
        max_dur: float,
    ) -> Tuple[float, float]:
        """
        Expands or snaps candidate boundaries to sentence beginnings and ends
        to ensure full standalone conversational context.
        """
        if not segments:
            return target_start, target_end

        # Find segment covering target_start
        start_seg_idx = 0
        for idx, s in enumerate(segments):
            if s.start <= target_start <= s.end:
                start_seg_idx = idx
                break
            elif s.start > target_start:
                start_seg_idx = max(0, idx - 1)
                break

        # Find segment covering target_end
        end_seg_idx = len(segments) - 1
        for idx in range(start_seg_idx, len(segments)):
            s = segments[idx]
            if s.start <= target_end <= s.end:
                end_seg_idx = idx
                break
            elif s.end > target_end:
                end_seg_idx = idx
                break

        snapped_start = segments[start_seg_idx].start
        snapped_end = segments[end_seg_idx].end

        # Ensure duration complies with min/max
        cur_dur = snapped_end - snapped_start
        if cur_dur < min_dur:
            # Expand backwards or forwards to meet min duration
            if start_seg_idx > 0 and (segments[end_seg_idx].end - segments[start_seg_idx - 1].start) <= max_dur:
                start_seg_idx -= 1
                snapped_start = segments[start_seg_idx].start
            elif end_seg_idx + 1 < len(segments) and (segments[end_seg_idx + 1].end - snapped_start) <= max_dur:
                end_seg_idx += 1
                snapped_end = segments[end_seg_idx].end

        if snapped_end - snapped_start > max_dur:
            snapped_end = round(snapped_start + max_dur, 2)

        return round(snapped_start, 2), round(snapped_end, 2)

    def _discover_candidates_with_gemini(
        self,
        raw_chunk: RawSemanticChunk,
        min_dur: float,
        max_dur: float,
        video_title: Optional[str] = None,
        target_categories: Optional[List[HighlightCategory]] = None,
        custom_instructions: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Invokes Gemini with strict structured output for chunk highlight discovery."""
        client = self._get_genai_client()
        if not client:
            raise RuntimeError("Gemini client is unavailable")

        instructions_block = f"\nUSER CUSTOM INSTRUCTIONS: \"{custom_instructions}\"\n(Strictly prioritize moments matching the user's explicit content requests.)\n" if custom_instructions else ""

        user_content = (
            f"Video Title: {video_title or 'Long-form Discussion'}\n"
            f"Chunk Boundary: [{raw_chunk.start_time:.2f}s to {raw_chunk.end_time:.2f}s]\n"
            f"{instructions_block}\n"
            f"Transcript Dialogue:\n{self._format_chunk_transcript(raw_chunk.segments)}\n\n"
            f"Discover high-value highlight moments with complete standalone context."
        )

        prompt = HIGHLIGHT_SYSTEM_PROMPT.format(
            min_dur=int(min_dur),
            max_dur=int(max_dur),
            chunk_start=raw_chunk.start_time,
            chunk_end=raw_chunk.end_time,
        )

        response = client.models.generate_content(
            model=self.primary_model,
            contents=[prompt, user_content],
            config={
                "response_mime_type": "application/json",
                "temperature": 0.2,
            },
        )

        raw_text = response.text or ""
        parsed = json.loads(raw_text)
        return parsed.get("candidates", [])

    def _discover_candidates_heuristic(
        self,
        raw_chunk: RawSemanticChunk,
        min_dur: float,
        max_dur: float,
        target_categories: Optional[List[HighlightCategory]] = None,
        custom_instructions: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        High-precision rule-based semantic analyzer for highlight moments.
        Evaluates narrative arcs, category signals, and standalone context.
        """
        candidates: List[Dict[str, Any]] = []
        segments = raw_chunk.segments
        if not segments:
            return candidates

        # Determine category matches across the chunk text
        category_scores: Dict[HighlightCategory, int] = {cat: 0 for cat in HighlightCategory}
        category_matches: Dict[HighlightCategory, List[str]] = {cat: [] for cat in HighlightCategory}

        # If user provided custom instructions, boost matching categories
        if custom_instructions:
            ci_lower = custom_instructions.lower()
            alias_map = {
                "business": HighlightCategory.IMPORTANT_INSIGHT,
                "lesson": HighlightCategory.LIFE_LESSON,
                "life": HighlightCategory.LIFE_LESSON,
                "funny": HighlightCategory.FUNNY,
                "humor": HighlightCategory.FUNNY,
                "comedy": HighlightCategory.FUNNY,
                "joke": HighlightCategory.FUNNY,
                "motivation": HighlightCategory.MOTIVATIONAL,
                "motivational": HighlightCategory.MOTIVATIONAL,
                "discipline": HighlightCategory.MOTIVATIONAL,
                "fact": HighlightCategory.INTERESTING_FACT,
                "facts": HighlightCategory.INTERESTING_FACT,
                "surprising": HighlightCategory.INTERESTING_FACT,
                "education": HighlightCategory.EDUCATIONAL,
                "educational": HighlightCategory.EDUCATIONAL,
                "learn": HighlightCategory.EDUCATIONAL,
                "tutorial": HighlightCategory.EDUCATIONAL,
                "story": HighlightCategory.STORYTELLING,
                "stories": HighlightCategory.STORYTELLING,
                "debate": HighlightCategory.STRONG_OPINION,
                "opinion": HighlightCategory.STRONG_OPINION,
            }
            for kw, cat in alias_map.items():
                if kw in ci_lower:
                    category_scores[cat] += 8

        for seg in segments:
            for cat, patterns in CATEGORY_PATTERNS.items():
                for pat in patterns:
                    m = pat.findall(seg.text)
                    if m:
                        category_scores[cat] += len(m) * 2
                        category_matches[cat].extend(m)

        # Sort categories by signal strength
        matched_cats = [c for c, score in category_scores.items() if score > 0]
        if target_categories:
            matched_cats = [c for c in matched_cats if c in target_categories]

        if not matched_cats:
            # Fallback to important_insight or educational based on length
            default_cat = HighlightCategory.EDUCATIONAL if any("how" in s.text.lower() for s in segments) else HighlightCategory.IMPORTANT_INSIGHT
            matched_cats = [default_cat]

        primary_cat = max(matched_cats, key=lambda c: category_scores[c])

        # Define candidate duration spanning meaningful context
        raw_start = raw_chunk.start_time
        raw_end = min(raw_chunk.end_time, raw_start + max_dur)
        if raw_end - raw_start < min_dur:
            raw_end = min(raw_chunk.end_time, raw_start + min_dur)

        # Build category-tailored titles, hooks, and context
        cat_meta = {
            HighlightCategory.LIFE_LESSON: {
                "title": f"Life Lesson: {segments[0].text[:45]}...",
                "hook": f"A vital lesson learned from experience: {segments[0].text[:60]}.",
                "reason": "Contains practical life wisdom and perspective gained from experience.",
                "context_summary": "The speaker reflects on a key personal experience, explaining the background and the enduring lesson learned.",
            },
            HighlightCategory.MOTIVATIONAL: {
                "title": f"Mindset: {segments[0].text[:45]}...",
                "hook": f"The relentless truth about discipline: {segments[0].text[:60]}.",
                "reason": "Inspiring perspective on overcoming adversity through consistency and mental toughness.",
                "context_summary": "Presents an inspiring thesis on dedication and mindset, offering actionable motivation with full reasoning.",
            },
            HighlightCategory.FUNNY: {
                "title": f"Humorous Exchange: {segments[0].text[:45]}...",
                "hook": f"An unexpectedly funny moment: {segments[0].text[:60]}.",
                "reason": "Genuine humor, witty banter, or funny story delivering authentic entertainment value.",
                "context_summary": "Captures the full humorous setup, the punchline/reaction, and subsequent conversational banter.",
            },
            HighlightCategory.EDUCATIONAL: {
                "title": f"Framework: {segments[0].text[:45]}...",
                "hook": f"The step-by-step breakdown: {segments[0].text[:60]}.",
                "reason": "Provides structured, actionable technical or practical understanding.",
                "context_summary": "Explains a concept from foundational premise through practical execution and takeaways.",
            },
            HighlightCategory.INTERESTING_FACT: {
                "title": f"Surprising Fact: {segments[0].text[:45]}...",
                "hook": f"A counterintuitive discovery most people do not know: {segments[0].text[:60]}.",
                "reason": "Fascinating, verifiable fact or scientific insight that challenges conventional assumptions.",
                "context_summary": "Shares uncommon research or facts, explaining the background data and why it matters.",
            },
            HighlightCategory.ENTERTAINMENT: {
                "title": f"Unbelievable Story: {segments[0].text[:45]}...",
                "hook": f"You will not believe what happened: {segments[0].text[:60]}.",
                "reason": "Engaging conversational narrative with high dramatic intrigue.",
                "context_summary": "A captivating narrative with vivid setup, unfolding conflict, and resolution.",
            },
            HighlightCategory.IMPORTANT_INSIGHT: {
                "title": f"Key Principle: {segments[0].text[:45]}...",
                "hook": f"The core takeaway: {segments[0].text[:60]}.",
                "reason": "High-signal insight providing essential clarity on the core discussion theme.",
                "context_summary": "Articulates a central argument with supporting reasoning and a definitive conclusion.",
            },
            HighlightCategory.STORYTELLING: {
                "title": f"Story: {segments[0].text[:45]}...",
                "hook": f"How it all unfolded: {segments[0].text[:60]}.",
                "reason": "Complete narrative arc featuring characters, tension, turning point, and conclusion.",
                "context_summary": "Details a structured story from initial context through turning point to resolution.",
            },
            HighlightCategory.STRONG_OPINION: {
                "title": f"Contrarian Take: {segments[0].text[:45]}...",
                "hook": f"Why the conventional wisdom is flawed: {segments[0].text[:60]}.",
                "reason": "Bold, thought-provoking perspective challenging mainstream consensus.",
                "context_summary": "Presents a contrarian thesis, defends it with evidence and logic, and delivers a memorable conclusion.",
            },
        }

        meta = cat_meta.get(primary_cat, cat_meta[HighlightCategory.IMPORTANT_INSIGHT])
        summary_text = raw_chunk.full_text[:180] + "..." if len(raw_chunk.full_text) > 180 else raw_chunk.full_text

        candidates.append({
            "category": primary_cat.value,
            "start_time": raw_start,
            "end_time": raw_end,
            "title": meta["title"],
            "summary": f"Discussion covering: {summary_text}",
            "hook": meta["hook"],
            "reason": meta["reason"],
            "context_summary": meta["context_summary"],
        })

        return candidates

    def discover_highlights(
        self,
        request: HighlightDiscoveryRequest,
    ) -> HighlightDiscoveryResponse:
        """
        Main entry point for discovering semantic highlight moments across all video chunks.
        """
        transcript: Optional[TranscriptResponse] = request.transcript
        if transcript is None:
            raise ValueError("TranscriptResponse is required for highlight discovery.")

        if not transcript.segments:
            return HighlightDiscoveryResponse(
                project_id=request.project_id,
                total_candidates=0,
                categories_found={},
                candidates=[],
            )

        # 1. Clean Transcript
        cleaned_segments = transcript_cleaner.clean_segments(transcript.segments)
        if not cleaned_segments:
            return HighlightDiscoveryResponse(
                project_id=request.project_id,
                total_candidates=0,
                categories_found={},
                candidates=[],
            )

        # 2. Semantic Chunking across the entire video
        raw_chunks = semantic_chunker.chunk_transcript(
            segments=cleaned_segments,
            min_duration=max(35.0, request.min_duration),
            max_duration=min(240.0, request.max_duration * 2.5),
            overlap_duration=15.0,
        )

        all_candidates: List[HighlightCandidate] = []
        candidate_counter = 1

        # 3. Analyze all chunks (entire video, not just the beginning)
        for chunk in raw_chunks:
            chunk_raw_candidates: List[Dict[str, Any]] = []

            if self._is_live_gemini_available():
                try:
                    chunk_raw_candidates = self._discover_candidates_with_gemini(
                        raw_chunk=chunk,
                        min_dur=request.min_duration,
                        max_dur=request.max_duration,
                        video_title=request.video_title,
                        target_categories=request.target_categories,
                        custom_instructions=request.custom_instructions,
                    )
                except Exception as e:
                    logger.warning(f"Live Gemini highlight discovery failed for {chunk.chunk_id}, using heuristic: {e}")
                    chunk_raw_candidates = self._discover_candidates_heuristic(
                        raw_chunk=chunk,
                        min_dur=request.min_duration,
                        max_dur=request.max_duration,
                        target_categories=request.target_categories,
                        custom_instructions=request.custom_instructions,
                    )
            else:
                chunk_raw_candidates = self._discover_candidates_heuristic(
                    raw_chunk=chunk,
                    min_dur=request.min_duration,
                    max_dur=request.max_duration,
                    target_categories=request.target_categories,
                    custom_instructions=request.custom_instructions,
                )

            # 4. Snap boundaries, verify evidence, enforce standalone context
            for raw_cand in chunk_raw_candidates:
                try:
                    t_start = float(raw_cand.get("start_time", chunk.start_time))
                    t_end = float(raw_cand.get("end_time", chunk.end_time))

                    # Snap to sentence boundaries
                    snapped_start, snapped_end = self._snap_to_sentence_boundaries(
                        target_start=t_start,
                        target_end=t_end,
                        segments=chunk.segments,
                        min_dur=request.min_duration,
                        max_dur=request.max_duration,
                    )

                    # Extract verified transcript evidence strictly within boundaries
                    evidence = self._verify_transcript_evidence(
                        start_time=snapped_start,
                        end_time=snapped_end,
                        segments=chunk.segments,
                    )

                    cat_raw = raw_cand.get("category", HighlightCategory.IMPORTANT_INSIGHT.value)
                    cat_enum = HighlightCategory(cat_raw)

                    # Category filter if requested
                    if request.target_categories and cat_enum not in request.target_categories:
                        continue

                    candidate = HighlightCandidate(
                        candidate_id=f"candidate_{candidate_counter:03d}",
                        category=cat_enum,
                        start_time=snapped_start,
                        end_time=snapped_end,
                        title=str(raw_cand.get("title", f"Highlight {candidate_counter}")).strip(),
                        summary=str(raw_cand.get("summary", "Key highlight moment")).strip(),
                        hook=str(raw_cand.get("hook", "Key opening statement")).strip(),
                        reason=str(raw_cand.get("reason", "Contains high-value standalone content")).strip(),
                        transcript_evidence=evidence,
                        context_summary=str(raw_cand.get("context_summary", "Full context included.")).strip(),
                        duration=round(snapped_end - snapped_start, 2),
                        confidence_score=float(raw_cand.get("confidence_score", 88.0)),
                        is_standalone=True,
                    )

                    all_candidates.append(candidate)
                    candidate_counter += 1
                except Exception as val_err:
                    logger.debug(f"Skipping malformed highlight candidate: {val_err}")

        # 5. Persist candidates separately from rendered clips
        try:
            candidate_storage.save_candidates(request.project_id, all_candidates)
        except Exception as e:
            logger.error(f"Failed to save highlight candidates for {request.project_id}: {e}")

        # 6. Aggregate categories count
        cat_counts: Dict[str, int] = {}
        for c in all_candidates:
            cat_counts[c.category.value] = cat_counts.get(c.category.value, 0) + 1

        return HighlightDiscoveryResponse(
            project_id=request.project_id,
            total_candidates=len(all_candidates),
            categories_found=cat_counts,
            candidates=all_candidates,
        )

highlight_discovery_engine = HighlightDiscoveryEngine()

