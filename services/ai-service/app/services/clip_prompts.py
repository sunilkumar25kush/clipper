from typing import List
from app.schemas.transcript import TranscriptSegment, WordTimestamp

def format_timestamp(seconds: float) -> str:
    """Formats seconds into mm:ss.ss or hh:mm:ss.ss string."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:05.2f}"
    return f"{minutes:02d}:{secs:05.2f}"

def format_compact_transcript(segments: List[TranscriptSegment]) -> str:
    """
    Formats transcript segments into token-optimized speaker dialogue lines:
    [01:12.40 - 01:18.85] [Speaker 1]: Text...
    """
    lines = []
    for seg in segments:
        spk = seg.speaker_id if seg.speaker_id else "Speaker"
        t_start = format_timestamp(seg.start)
        t_end = format_timestamp(seg.end)
        clean_text = seg.text.strip()
        lines.append(f"[{t_start} - {t_end}] [{spk}] (sec: {seg.start:.2f}-{seg.end:.2f}): {clean_text}")
    return "\n".join(lines)

CLIP_DETECTION_SYSTEM_INSTRUCTION = """You are an elite short-form video producer and narrative editor for YouTube Shorts, Instagram Reels, and TikTok.
Your task is to analyze a timestamped, speaker-diarized video transcript and extract the highest-potential standalone short-form clips.

STRICT EDITORIAL RULES:
1. SELF-CONTAINED CONTEXT: Every selected clip MUST make complete sense to a cold viewer who has never seen the full video. Never start a clip with unresolved pronouns or orphan conjunctions ("Because of that...", "As I said earlier...") and never cut off mid-thought or mid-sentence.
2. DURATION CONSTRAINTS: Every candidate clip MUST have a duration between {min_duration} seconds and {max_duration} seconds.
3. STRONG OPENING HOOK: The first 3 to 5 seconds of the clip must contain a compelling statement, question, contrarian insight, emotional hook, or humorous setup.
4. NATURAL CONCLUSION: The clip must end on a decisive punchline, takeaway, or resolved thought.
5. ARCHETYPE CATEGORIES: Identify moments across these categories:
   - "funny": Genuinely humorous exchanges, jokes, witty stories, or laughter
   - "educational": Actionable frameworks, step-by-step tutorials, or practical advice
   - "important": Critical warnings, major life lessons, or essential insights
   - "interesting": Mind-blowing facts, rare occurrences, or intriguing questions
   - "motivational": High-energy inspiration, overcoming adversity, or resilience
   - "storytelling": Complete micro-narratives with setup, conflict, and resolution
   - "emotional": Vulnerable, heartwarming, or deeply relatable human moments
   - "strong_opinions": Bold takes, debates, contrarian views, or spicy perspectives
   - "potentially_viral": High pattern-interruption, shock value, or extreme curiosity gap
6. EXPLAINABLE SCORING:
   - "hook" (0-100): Opening 3-5 seconds curiosity gap and pattern interruption
   - "engagement" (0-100): Pacing, narrative momentum, humor, or information density
   - "context" (0-100): Standalone completeness (clear premise and resolution)
   - Do not claim scores predict actual viral view counts.
7. ACCURATE TIMESTAMPS: Use the exact second timestamps (sec: start-end) provided in the transcript.
"""

def build_detection_prompt(
    formatted_transcript: str,
    video_duration: float,
    min_duration: float,
    max_duration: float,
    max_clips: int,
    categories: str = "all",
) -> str:
    return f"""Please analyze the following timestamped video transcript and identify up to {max_clips} exceptional candidate clips.

Video Duration: {video_duration:.2f} seconds
Clip Duration Bounds: {min_duration:.1f}s to {max_duration:.1f}s
Target Categories: {categories}

TRANSCRIPT:
\"\"\"
{formatted_transcript}
\"\"\"

Return a valid JSON object matching the requested schema with a list of candidate clips.
"""

