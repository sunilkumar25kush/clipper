import os
import json
import re
import hashlib
import logging
from typing import List, Optional, Dict, Any
from app.config import settings
from app.schemas.transcript import TranscriptResponse, TranscriptSegment
from app.schemas.intelligence import (
    KeyMoment,
    SemanticChunk,
    TranscriptIntelligenceRequest,
    TranscriptIntelligenceResponse,
)
from app.services.transcript_cleaner import transcript_cleaner
from app.services.semantic_chunker import semantic_chunker, RawSemanticChunk

logger = logging.getLogger("clipforge.transcript_intelligence")

INTELLIGENCE_SYSTEM_PROMPT = """You are an expert NLP dialogue analyst and content strategist.
Your task is to analyze a timestamped transcript chunk from a podcast, interview, or video and extract deep semantic intelligence.

Analyze the spoken dialogue and output strictly valid JSON matching this schema:
{
  "main_topic": "Short 2-5 word overarching topic of this discussion",
  "subtopics": ["keyword1", "keyword2", "keyword3"],
  "summary": "Cohesive 2-3 sentence overview of what was discussed, argued, or demonstrated",
  "speaker_intent": "Core purpose (e.g. educate on habits, debate AI safety, share personal failure)",
  "main_argument": "Primary thesis, contrarian claim, or central message",
  "emotional_context": "Dominant emotional tone (e.g. inspiring, humorous, intense, reflective)",
  "key_moments": [
    {
      "start_time": 12.5,
      "end_time": 28.0,
      "speaker_id": "SPEAKER_00",
      "statement_summary": "Explains why daily consistency outperforms occasional intensity",
      "moment_type": "takeaway",
      "importance_score": 92.0
    }
  ]
}

STRICT INSTRUCTIONS:
1. "start_time" and "end_time" of each key moment MUST fall within the chunk's boundaries ({chunk_start}s to {chunk_end}s) and correspond to actual spoken statements.
2. "moment_type" must be one of: "takeaway", "hook", "story", "example", "question", "answer", "insight".
3. Do not invent statements that do not exist in the transcript.
4. If a question is asked and answered, capture the insight or answer as a key moment.
"""

class TranscriptIntelligenceEngine:
    """
    NLP and AI Intelligence Engine that understands the semantic meaning, topics,
    speaker arguments, and key moments across long-form video transcripts.
    """

    def __init__(self):
        self.api_key = settings.gemini_api_key
        self.primary_model = settings.gemini_primary_model
        self._genai_client = None
        self._cache: Dict[str, Dict[str, Any]] = {}

    def _get_genai_client(self):
        if self._genai_client is None:
            if self.api_key and not self.api_key.startswith("replace_with_"):
                try:
                    from google import genai
                    self._genai_client = genai.Client(api_key=self.api_key)
                except Exception as e:
                    logger.warning(f"Failed to initialize google-genai client in intelligence engine: {e}")
                    self._genai_client = None
        return self._genai_client

    def _is_live_gemini_available(self) -> bool:
        return (
            bool(self.api_key)
            and not self.api_key.startswith("replace_with_")
            and self._get_genai_client() is not None
        )

    def _format_chunk_transcript(self, segments: List[TranscriptSegment]) -> str:
        """Formats segments into token-dense timestamped dialogue."""
        lines = []
        for s in segments:
            lines.append(f"[{s.start:.2f}s - {s.end:.2f}s] [{s.speaker_id}]: {s.text}")
        return "\n".join(lines)

    def _hash_text(self, text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]

    def _analyze_chunk_with_gemini(
        self,
        raw_chunk: RawSemanticChunk,
        video_title: Optional[str] = None,
        language: str = "en",
    ) -> Dict[str, Any]:
        """Calls Gemini with strict structured output for chunk intelligence."""
        client = self._get_genai_client()
        if not client:
            raise RuntimeError("Gemini client unavailable")

        cache_key = self._hash_text(raw_chunk.full_text)
        if cache_key in self._cache:
            return self._cache[cache_key]

        formatted_dialogue = self._format_chunk_transcript(raw_chunk.segments)
        system_instruction = INTELLIGENCE_SYSTEM_PROMPT.format(
            chunk_start=raw_chunk.start_time,
            chunk_end=raw_chunk.end_time,
        )

        user_prompt = f"""VIDEO CONTEXT:
Title: "{video_title or 'Discussion'}"
Language: "{language}"
Chunk Time Bounds: {raw_chunk.start_time:.2f}s to {raw_chunk.end_time:.2f}s

TRANSCRIPT:
\"\"\"
{formatted_dialogue}
\"\"\"

Analyze this dialogue and return the requested JSON object."""

        from google.genai import types

        response = client.models.generate_content(
            model=self.primary_model,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                temperature=0.2,
                max_output_tokens=2048,
            ),
        )

        parsed = json.loads(response.text)
        self._cache[cache_key] = parsed
        return parsed

    def _analyze_chunk_heuristic(
        self,
        raw_chunk: RawSemanticChunk,
        video_title: Optional[str] = None,
        language: str = "en",
    ) -> Dict[str, Any]:
        """
        Deterministic, rule-based NLP analysis for offline environments and testing.
        Extracts salient statements, questions, arguments, and topics.
        """
        text = raw_chunk.full_text
        words = text.split()

        # Extract dominant keywords (excluding common stop words)
        stop_words = {
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with",
            "is", "was", "are", "were", "be", "been", "have", "has", "had", "do", "does",
            "i", "you", "he", "she", "it", "we", "they", "this", "that", "there", "what",
            "which", "who", "when", "where", "why", "how", "all", "any", "both", "each",
            "just", "so", "like", "know", "mean", "really", "going", "think", "about"
        }
        filtered_words = [re.sub(r"[^\w]", "", w.lower()) for w in words if len(w) > 3]
        filtered_words = [w for w in filtered_words if w and w not in stop_words]

        # Determine main topic and subtopics
        freq: Dict[str, int] = {}
        for w in filtered_words:
            freq[w] = freq.get(w, 0) + 1
        sorted_keywords = sorted(freq.keys(), key=lambda k: freq[k], reverse=True)

        if sorted_keywords:
            main_topic = f"{sorted_keywords[0].title()} Discussion"
            subtopics = sorted_keywords[1:5]
        else:
            main_topic = video_title or "Key Conversation"
            subtopics = ["insights", "perspective"]

        # Emotional context heuristic
        lower_text = text.lower()
        if any(w in lower_text for w in ["funny", "laugh", "joke", "crazy", "hilarious"]):
            emotion = "Humorous & Entertaining"
        elif any(w in lower_text for w in ["challenge", "struggle", "pain", "hard", "difficult"]):
            emotion = "Vulnerable & Reflective"
        elif any(w in lower_text for w in ["win", "success", "goal", "achieve", "discipline"]):
            emotion = "Motivational & High-Energy"
        elif any(w in lower_text for w in ["learn", "step", "method", "system", "understand"]):
            emotion = "Educational & Pragmatic"
        else:
            emotion = "Conversational & Thoughtful"

        # Key moments extraction from salient segments
        key_moments = []
        for seg in raw_chunk.segments:
            seg_text = seg.text.strip()
            # Prioritize questions or decisive statements
            is_question = seg_text.endswith("?")
            has_insight = any(w in seg_text.lower() for w in ["because", "secret", "never", "always", "important", "remember", "reason"])

            if is_question or has_insight or len(seg_text.split()) >= 10:
                moment_type = "question" if is_question else ("insight" if has_insight else "statement")
                first_sentence = re.split(r"[.!?]", seg_text)[0].strip()
                summary = first_sentence if len(first_sentence) > 5 else seg_text[:60]

                key_moments.append({
                    "start_time": seg.start,
                    "end_time": seg.end,
                    "speaker_id": seg.speaker_id,
                    "statement_summary": summary[:120],
                    "moment_type": moment_type,
                    "importance_score": 90.0 if (has_insight or is_question) else 82.0,
                })

            if len(key_moments) >= 3:
                break

        # Fallback if no moments met criteria
        if not key_moments and raw_chunk.segments:
            first_seg = raw_chunk.segments[0]
            key_moments.append({
                "start_time": first_seg.start,
                "end_time": first_seg.end,
                "speaker_id": first_seg.speaker_id,
                "statement_summary": first_seg.text[:100],
                "moment_type": "statement",
                "importance_score": 85.0,
            })

        summary = f"Discussion focusing on {main_topic.lower()}. The speaker articulates key concepts and perspectives across the segment."
        if raw_chunk.has_question:
            summary += " Key questions are raised and addressed."

        return {
            "main_topic": main_topic,
            "subtopics": subtopics,
            "summary": summary,
            "speaker_intent": "Inform and share insights with the listener",
            "main_argument": f"{main_topic} requires focused understanding and deliberate execution.",
            "emotional_context": emotion,
            "key_moments": key_moments,
        }

    def analyze_transcript(
        self,
        transcript: TranscriptResponse,
        video_title: Optional[str] = None,
        max_chunk_duration: float = 240.0,
        min_chunk_duration: float = 40.0,
        overlap_duration: float = 15.0,
        project_id: Optional[str] = None,
    ) -> TranscriptIntelligenceResponse:
        """Convenience method matching the router and test interface."""
        req = TranscriptIntelligenceRequest(
            project_id=project_id or transcript.project_id,
            transcript_id=transcript.id,
            video_title=video_title,
            language=transcript.language,
            max_chunk_duration=max_chunk_duration,
            min_chunk_duration=min_chunk_duration,
            overlap_duration=overlap_duration,
        )
        return self.process_transcript_intelligence(transcript=transcript, request=req)

    def process_transcript_intelligence(
        self,
        transcript: TranscriptResponse,
        request: Optional[TranscriptIntelligenceRequest] = None,
    ) -> TranscriptIntelligenceResponse:
        """
        Executes end-to-end transcript intelligence processing:
        1. Transcript Cleaning & Validation
        2. Semantic Chunking
        3. Topic Understanding & Key Moment Extraction
        4. Global Aggregation & Structured Validation
        """
        if not transcript or not transcript.segments:
            return TranscriptIntelligenceResponse(
                project_id=transcript.project_id if transcript else "unknown",
                transcript_id=transcript.id if transcript else None,
                language=transcript.language if transcript else "en",
                total_duration=0.0,
                total_words=0,
                total_chunks=0,
                global_topics=[],
                global_summary="Empty transcript provided",
                chunks=[],
            )

        # 1. Clean Transcript
        cleaned_segments = transcript_cleaner.clean_segments(transcript.segments)
        if not cleaned_segments:
            return TranscriptIntelligenceResponse(
                project_id=transcript.project_id,
                transcript_id=transcript.id,
                language=transcript.language,
                total_duration=transcript.duration_seconds,
                total_words=0,
                total_chunks=0,
                global_topics=[],
                global_summary="Transcript contained no valid spoken segments after cleaning",
                chunks=[],
            )

        # 2. Semantic Chunking
        min_dur = request.min_chunk_duration if request else 40.0
        max_dur = request.max_chunk_duration if request else 240.0
        semantic_chunker.min_chunk_duration = min_dur
        semantic_chunker.max_chunk_duration = max_dur

        raw_chunks = semantic_chunker.chunk_transcript(cleaned_segments)

        # 3. Analyze each semantic chunk
        analyzed_chunks: List[SemanticChunk] = []
        global_topics_set = set()
        video_title = request.video_title if request else None
        lang = transcript.language or (request.language if request else "en")

        for chunk in raw_chunks:
            chunk_data: Optional[Dict[str, Any]] = None

            if self._is_live_gemini_available():
                try:
                    chunk_data = self._analyze_chunk_with_gemini(
                        raw_chunk=chunk,
                        video_title=video_title,
                        language=lang,
                    )
                except Exception as e:
                    logger.warning(f"Live Gemini chunk analysis failed for {chunk.chunk_id}, using heuristic: {e}")
                    chunk_data = self._analyze_chunk_heuristic(
                        raw_chunk=chunk,
                        video_title=video_title,
                        language=lang,
                    )
            else:
                chunk_data = self._analyze_chunk_heuristic(
                    raw_chunk=chunk,
                    video_title=video_title,
                    language=lang,
                )

            # Sanitize and validate key moments
            valid_moments: List[KeyMoment] = []
            raw_moments = chunk_data.get("key_moments", [])
            for m in raw_moments:
                try:
                    m_start = max(chunk.start_time, float(m.get("start_time", chunk.start_time)))
                    m_end = min(chunk.end_time, max(m_start + 0.5, float(m.get("end_time", chunk.end_time))))
                    km = KeyMoment(
                        start_time=round(m_start, 3),
                        end_time=round(m_end, 3),
                        speaker_id=m.get("speaker_id") or chunk.speaker_ids[0] if chunk.speaker_ids else None,
                        statement_summary=str(m.get("statement_summary", "Key statement")).strip(),
                        moment_type=str(m.get("moment_type", "statement")),
                        importance_score=float(m.get("importance_score", 85.0)),
                    )
                    valid_moments.append(km)
                except Exception as val_err:
                    logger.debug(f"Skipping malformed key moment: {val_err}")

            semantic_chunk = SemanticChunk(
                chunk_id=chunk.chunk_id,
                start_time=chunk.start_time,
                end_time=chunk.end_time,
                main_topic=chunk_data.get("main_topic", "Discussion Point"),
                subtopics=chunk_data.get("subtopics", []),
                summary=chunk_data.get("summary", "Conversational discussion"),
                speaker_intent=chunk_data.get("speaker_intent"),
                main_argument=chunk_data.get("main_argument"),
                emotional_context=chunk_data.get("emotional_context"),
                key_moments=valid_moments,
                text=chunk.full_text,
            )
            analyzed_chunks.append(semantic_chunk)
            global_topics_set.add(semantic_chunk.main_topic)
            for st in semantic_chunk.subtopics:
                global_topics_set.add(st)

        # 4. Global Synthesis
        total_words = sum(len(s.text.split()) for s in cleaned_segments)
        global_topics = sorted(list(global_topics_set))[:10]
        global_summary = (
            f"Multi-topic dialogue spanning {len(analyzed_chunks)} conversation sections. "
            f"Core themes include {', '.join(global_topics[:4])}."
        )

        proj_id = request.project_id if (request and request.project_id) else transcript.project_id

        return TranscriptIntelligenceResponse(
            project_id=proj_id,
            transcript_id=transcript.id,
            language=lang,
            total_duration=transcript.duration_seconds,
            total_words=total_words,
            total_chunks=len(analyzed_chunks),
            global_topics=global_topics,
            global_summary=global_summary,
            chunks=analyzed_chunks,
        )

transcript_intelligence_engine = TranscriptIntelligenceEngine()
