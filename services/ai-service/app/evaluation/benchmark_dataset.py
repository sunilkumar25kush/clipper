import os
import json
from typing import List, Dict
from app.schemas.transcript import (
    TranscriptResponse,
    TranscriptSegment,
    WordTimestamp,
)
from app.schemas.highlight import HighlightCategory
from app.schemas.evaluation import GroundTruthMoment, BenchmarkVideoDataset

def _make_words(text: str, start: float, end: float) -> List[WordTimestamp]:
    words = text.split()
    if not words:
        return []
    step = (end - start) / len(words)
    res = []
    for i, w in enumerate(words):
        res.append(
            WordTimestamp(
                word=w,
                start=round(start + i * step, 2),
                end=round(start + (i + 1) * step, 2),
                probability=0.99,
            )
        )
    return res

def create_all_benchmarks() -> List[BenchmarkVideoDataset]:
    benchmarks: List[BenchmarkVideoDataset] = []

    # -------------------------------------------------------------
    # 1. PODCAST: Focus & Deep Work
    # -------------------------------------------------------------
    b1_segments = [
        TranscriptSegment(
            start=0.0,
            end=6.0,
            speaker_id="SPEAKER_00",
            text="Welcome back to The Mindful Creator. Today we're breaking down how top performers achieve intense mental focus.",
            words=_make_words("Welcome back to The Mindful Creator. Today we're breaking down how top performers achieve intense mental focus.", 0.0, 6.0),
        ),
        TranscriptSegment(
            start=7.0,
            end=22.0,
            speaker_id="SPEAKER_01",
            text="The single greatest threat to modern productivity is multitasking. When you switch contexts between tabs, your brain incurs a cognitive switching penalty that drains 40 percent of your mental energy.",
            words=_make_words("The single greatest threat to modern productivity is multitasking. When you switch contexts between tabs, your brain incurs a cognitive switching penalty that drains 40 percent of your mental energy.", 7.0, 22.0),
        ),
        TranscriptSegment(
            start=22.5,
            end=37.0,
            speaker_id="SPEAKER_01",
            text="If you want to produce elite creative work, you must block ninety uninterrupted minutes every morning with your phone in airplane mode in another room. That is the non-negotiable rule.",
            words=_make_words("If you want to produce elite creative work, you must block ninety uninterrupted minutes every morning with your phone in airplane mode in another room. That is the non-negotiable rule.", 22.5, 37.0),
        ),
        TranscriptSegment(
            start=38.0,
            end=48.0,
            speaker_id="SPEAKER_00",
            text="That completely changes how people should structure their calendar. Thanks for tuning in everyone.",
            words=_make_words("That completely changes how people should structure their calendar. Thanks for tuning in everyone.", 38.0, 48.0),
        ),
    ]
    all_w1 = [w for s in b1_segments for w in s.words]
    benchmarks.append(
        BenchmarkVideoDataset(
            benchmark_id="bm_01_podcast",
            title="The Deep Work Protocol for Creatives",
            genre="podcast",
            duration_seconds=50.0,
            transcript=TranscriptResponse(
                id="tr_bm_01",
                project_id="bm_01_podcast",
                language="en",
                language_confidence=0.99,
                duration_seconds=50.0,
                word_count=len(all_w1),
                model_used="faster-whisper/base",
                speakers_detected=["SPEAKER_00", "SPEAKER_01"],
                segments=b1_segments,
            ),
            ground_truth_moments=[
                GroundTruthMoment(
                    moment_id="gt_bm_01_01",
                    expected_category=HighlightCategory.LIFE_LESSON,
                    acceptable_categories=[HighlightCategory.IMPORTANT_INSIGHT, HighlightCategory.EDUCATIONAL],
                    true_start=7.0,
                    true_end=37.0,
                    min_acceptable_start=6.5,
                    max_acceptable_end=38.0,
                    core_quote="The single greatest threat to modern productivity is multitasking.",
                    summary="Multitasking drains 40% mental energy; 90-minute morning deep work blocks are essential.",
                )
            ],
        )
    )

    # -------------------------------------------------------------
    # 2. INTERVIEW: Founder Facing Bankruptcy
    # -------------------------------------------------------------
    b2_segments = [
        TranscriptSegment(
            start=0.0,
            end=5.0,
            speaker_id="SPEAKER_00",
            text="How close did you actually come to shutting down the entire company back in 2021?",
            words=_make_words("How close did you actually come to shutting down the entire company back in 2021?", 0.0, 5.0),
        ),
        TranscriptSegment(
            start=5.5,
            end=21.0,
            speaker_id="SPEAKER_01",
            text="We had eleven days of runway in the bank account, and our lead investor walked away on a Sunday evening. I sat in my parked car with tears in my eyes wondering how to face eighty employees the next morning.",
            words=_make_words("We had eleven days of runway in the bank account, and our lead investor walked away on a Sunday evening. I sat in my parked car with tears in my eyes wondering how to face eighty employees the next morning.", 5.5, 21.0),
        ),
        TranscriptSegment(
            start=21.5,
            end=38.0,
            speaker_id="SPEAKER_01",
            text="Instead of hiding the truth, I gathered everyone at nine am, laid out the numbers transparently, and asked if they would fight with me. Forty-two people deferred salary, we closed six enterprise deals in ten days, and survived.",
            words=_make_words("Instead of hiding the truth, I gathered everyone at nine am, laid out the numbers transparently, and asked if they would fight with me. Forty-two people deferred salary, we closed six enterprise deals in ten days, and survived.", 21.5, 38.0),
        ),
        TranscriptSegment(
            start=38.5,
            end=45.0,
            speaker_id="SPEAKER_00",
            text="Radical honesty was the exact catalyst that saved your business.",
            words=_make_words("Radical honesty was the exact catalyst that saved your business.", 38.5, 45.0),
        ),
    ]
    all_w2 = [w for s in b2_segments for w in s.words]
    benchmarks.append(
        BenchmarkVideoDataset(
            benchmark_id="bm_02_interview",
            title="Surviving 11 Days of Runway",
            genre="interview",
            duration_seconds=46.0,
            transcript=TranscriptResponse(
                id="tr_bm_02",
                project_id="bm_02_interview",
                language="en",
                language_confidence=0.99,
                duration_seconds=46.0,
                word_count=len(all_w2),
                model_used="faster-whisper/base",
                speakers_detected=["SPEAKER_00", "SPEAKER_01"],
                segments=b2_segments,
            ),
            ground_truth_moments=[
                GroundTruthMoment(
                    moment_id="gt_bm_02_01",
                    expected_category=HighlightCategory.STORYTELLING,
                    acceptable_categories=[HighlightCategory.LIFE_LESSON, HighlightCategory.IMPORTANT_INSIGHT],
                    true_start=0.0,
                    true_end=38.0,
                    min_acceptable_start=0.0,
                    max_acceptable_end=40.0,
                    core_quote="We had eleven days of runway in the bank account",
                    summary="How radical financial transparency with the team saved the company from imminent bankruptcy.",
                )
            ],
        )
    )

    # -------------------------------------------------------------
    # 3. MOTIVATIONAL: Discipline Over Emotion
    # -------------------------------------------------------------
    b3_segments = [
        TranscriptSegment(
            start=0.0,
            end=4.0,
            speaker_id="SPEAKER_00",
            text="Everyone wants success until they realize what daily sacrifice actually demands.",
            words=_make_words("Everyone wants success until they realize what daily sacrifice actually demands.", 0.0, 4.0),
        ),
        TranscriptSegment(
            start=4.5,
            end=18.0,
            speaker_id="SPEAKER_00",
            text="Motivation is a fickle emotional imposter. It visits when the sun is shining, but abandons you the moment pain, cold, and exhaustion kick in.",
            words=_make_words("Motivation is a fickle emotional imposter. It visits when the sun is shining, but abandons you the moment pain, cold, and exhaustion kick in.", 4.5, 18.0),
        ),
        TranscriptSegment(
            start=18.5,
            end=34.0,
            speaker_id="SPEAKER_00",
            text="Champions don't rely on how they feel. They rely on disciplined commitments made when their mind was clear. Do the work when you don't feel like it, and greatness becomes inevitable.",
            words=_make_words("Champions don't rely on how they feel. They rely on disciplined commitments made when their mind was clear. Do the work when you don't feel like it, and greatness becomes inevitable.", 18.5, 34.0),
        ),
    ]
    all_w3 = [w for s in b3_segments for w in s.words]
    benchmarks.append(
        BenchmarkVideoDataset(
            benchmark_id="bm_03_motivational",
            title="The Truth About Discipline",
            genre="motivational_speech",
            duration_seconds=36.0,
            transcript=TranscriptResponse(
                id="tr_bm_03",
                project_id="bm_03_motivational",
                language="en",
                language_confidence=0.99,
                duration_seconds=36.0,
                word_count=len(all_w3),
                model_used="faster-whisper/base",
                speakers_detected=["SPEAKER_00"],
                segments=b3_segments,
            ),
            ground_truth_moments=[
                GroundTruthMoment(
                    moment_id="gt_bm_03_01",
                    expected_category=HighlightCategory.MOTIVATIONAL,
                    acceptable_categories=[HighlightCategory.LIFE_LESSON, HighlightCategory.STRONG_OPINION],
                    true_start=4.5,
                    true_end=34.0,
                    min_acceptable_start=0.0,
                    max_acceptable_end=35.0,
                    core_quote="Motivation is a fickle emotional imposter.",
                    summary="Motivation is unreliable; unconditional discipline separates champions from wishful thinkers.",
                )
            ],
        )
    )

    # -------------------------------------------------------------
    # 4. EDUCATIONAL: Neurobiology of Memory
    # -------------------------------------------------------------
    b4_segments = [
        TranscriptSegment(
            start=0.0,
            end=5.0,
            speaker_id="SPEAKER_00",
            text="Today we are examining how the mammalian hippocampus consolidates short-term memories into permanent cortex storage.",
            words=_make_words("Today we are examining how the mammalian hippocampus consolidates short-term memories into permanent cortex storage.", 0.0, 5.0),
        ),
        TranscriptSegment(
            start=5.5,
            end=20.0,
            speaker_id="SPEAKER_00",
            text="The biological mechanism behind long-term potentiation requires active neural recall, not passive re-reading. When you force your brain to retrieve a concept, you trigger synaptic myelin wrapping that strengthens the neural pathway tenfold.",
            words=_make_words("The biological mechanism behind long-term potentiation requires active neural recall, not passive re-reading. When you force your brain to retrieve a concept, you trigger synaptic myelin wrapping that strengthens the neural pathway tenfold.", 5.5, 20.0),
        ),
        TranscriptSegment(
            start=20.5,
            end=35.0,
            speaker_id="SPEAKER_00",
            text="To maximize retention, apply spaced repetition intervals: test yourself at one day, three days, and seven days. This simple protocol boosts recall accuracy from twenty percent to over eighty-five percent.",
            words=_make_words("To maximize retention, apply spaced repetition intervals: test yourself at one day, three days, and seven days. This simple protocol boosts recall accuracy from twenty percent to over eighty-five percent.", 20.5, 35.0),
        ),
    ]
    all_w4 = [w for s in b4_segments for w in s.words]
    benchmarks.append(
        BenchmarkVideoDataset(
            benchmark_id="bm_04_educational",
            title="The Neuroscience of Active Recall",
            genre="educational_lecture",
            duration_seconds=36.0,
            transcript=TranscriptResponse(
                id="tr_bm_04",
                project_id="bm_04_educational",
                language="en",
                language_confidence=0.99,
                duration_seconds=36.0,
                word_count=len(all_w4),
                model_used="faster-whisper/base",
                speakers_detected=["SPEAKER_00"],
                segments=b4_segments,
            ),
            ground_truth_moments=[
                GroundTruthMoment(
                    moment_id="gt_bm_04_01",
                    expected_category=HighlightCategory.EDUCATIONAL,
                    acceptable_categories=[HighlightCategory.INTERESTING_FACT, HighlightCategory.IMPORTANT_INSIGHT],
                    true_start=5.5,
                    true_end=35.0,
                    min_acceptable_start=0.0,
                    max_acceptable_end=36.0,
                    core_quote="The biological mechanism behind long-term potentiation requires active neural recall",
                    summary="Active recall and spaced repetition strengthen synaptic pathways, lifting retention from 20% to 85%.",
                )
            ],
        )
    )

    # -------------------------------------------------------------
    # 5. COMEDY: Hilarious Coffee Order Story
    # -------------------------------------------------------------
    b5_segments = [
        TranscriptSegment(
            start=0.0,
            end=4.0,
            speaker_id="SPEAKER_00",
            text="I walked into one of those ultra-pretentious artisan coffee shops yesterday.",
            words=_make_words("I walked into one of those ultra-pretentious artisan coffee shops yesterday.", 0.0, 4.0),
        ),
        TranscriptSegment(
            start=4.5,
            end=16.0,
            speaker_id="SPEAKER_00",
            text="The barista had a monocle and looked at me like I insulted his ancestors when I asked for a normal drip coffee with whole milk.",
            words=_make_words("The barista had a monocle and looked at me like I insulted his ancestors when I asked for a normal drip coffee with whole milk.", 4.5, 16.0),
        ),
        TranscriptSegment(
            start=16.5,
            end=29.0,
            speaker_id="SPEAKER_00",
            text="He leaned across the counter and whispered, 'Sir, we only express ethically harvested rainwater poured over single-origin beans roasted by monks.' I told him, 'Brother, I just need caffeine so I don't cry at work!'",
            words=_make_words("He leaned across the counter and whispered, 'Sir, we only express ethically harvested rainwater poured over single-origin beans roasted by monks.' I told him, 'Brother, I just need caffeine so I don't cry at work!'", 16.5, 29.0),
        ),
        TranscriptSegment(
            start=29.5,
            end=34.0,
            speaker_id="SPEAKER_01",
            text="And then he charged you sixteen dollars!",
            words=_make_words("And then he charged you sixteen dollars!", 29.5, 34.0),
        ),
    ]
    all_w5 = [w for s in b5_segments for w in s.words]
    benchmarks.append(
        BenchmarkVideoDataset(
            benchmark_id="bm_05_comedy",
            title="The Pretentious Barista",
            genre="comedy_conversation",
            duration_seconds=35.0,
            transcript=TranscriptResponse(
                id="tr_bm_05",
                project_id="bm_05_comedy",
                language="en",
                language_confidence=0.99,
                duration_seconds=35.0,
                word_count=len(all_w5),
                model_used="faster-whisper/base",
                speakers_detected=["SPEAKER_00", "SPEAKER_01"],
                segments=b5_segments,
            ),
            ground_truth_moments=[
                GroundTruthMoment(
                    moment_id="gt_bm_05_01",
                    expected_category=HighlightCategory.FUNNY,
                    acceptable_categories=[HighlightCategory.ENTERTAINMENT, HighlightCategory.STORYTELLING, HighlightCategory.IMPORTANT_INSIGHT],
                    true_start=0.0,
                    true_end=34.0,
                    min_acceptable_start=0.0,
                    max_acceptable_end=35.0,
                    core_quote="Brother, I just need caffeine so I don't cry at work!",
                    summary="Humorous interaction with an ultra-pretentious artisan coffee barista demanding monk-roasted beans.",
                )
            ],
        )
    )

    # -------------------------------------------------------------
    # 6. BUSINESS: SaaS Pricing Power
    # -------------------------------------------------------------
    b6_segments = [
        TranscriptSegment(
            start=0.0,
            end=4.0,
            speaker_id="SPEAKER_00",
            text="Let's talk about the biggest pricing mistake bootstrapper founders make.",
            words=_make_words("Let's talk about the biggest pricing mistake bootstrapper founders make.", 0.0, 4.0),
        ),
        TranscriptSegment(
            start=4.5,
            end=18.0,
            speaker_id="SPEAKER_00",
            text="Undercharging kills more startups than bugs or competitors. If your software saves an enterprise fifty hours a month, charging forty-nine dollars signals low quality and attracts customer service nightmares.",
            words=_make_words("Undercharging kills more startups than bugs or competitors. If your software saves an enterprise fifty hours a month, charging forty-nine dollars signals low quality and attracts customer service nightmares.", 4.5, 18.0),
        ),
        TranscriptSegment(
            start=18.5,
            end=32.0,
            speaker_id="SPEAKER_00",
            text="Double your prices tomorrow. You will lose twenty percent of high-maintenance tire-kickers, keep eighty percent of serious buyers, and instantly double your net operating margin.",
            words=_make_words("Double your prices tomorrow. You will lose twenty percent of high-maintenance tire-kickers, keep eighty percent of serious buyers, and instantly double your net operating margin.", 18.5, 32.0),
        ),
    ]
    all_w6 = [w for s in b6_segments for w in s.words]
    benchmarks.append(
        BenchmarkVideoDataset(
            benchmark_id="bm_06_business",
            title="The Economics of Doubling Your Price",
            genre="business_strategy",
            duration_seconds=34.0,
            transcript=TranscriptResponse(
                id="tr_bm_06",
                project_id="bm_06_business",
                language="en",
                language_confidence=0.99,
                duration_seconds=34.0,
                word_count=len(all_w6),
                model_used="faster-whisper/base",
                speakers_detected=["SPEAKER_00"],
                segments=b6_segments,
            ),
            ground_truth_moments=[
                GroundTruthMoment(
                    moment_id="gt_bm_06_01",
                    expected_category=HighlightCategory.IMPORTANT_INSIGHT,
                    acceptable_categories=[HighlightCategory.EDUCATIONAL, HighlightCategory.STRONG_OPINION],
                    true_start=4.5,
                    true_end=32.0,
                    min_acceptable_start=0.0,
                    max_acceptable_end=33.0,
                    core_quote="Undercharging kills more startups than bugs or competitors.",
                    summary="Underpricing damages perception; doubling prices filters out high-churn users and expands margin.",
                )
            ],
        )
    )

    # -------------------------------------------------------------
    # 7. TECHNICAL TUTORIAL: Database Indexing Pitfalls
    # -------------------------------------------------------------
    b7_segments = [
        TranscriptSegment(
            start=0.0,
            end=4.0,
            speaker_id="SPEAKER_00",
            text="Here is why your database query suddenly takes five seconds on Postgres in production.",
            words=_make_words("Here is why your database query suddenly takes five seconds on Postgres in production.", 0.0, 4.0),
        ),
        TranscriptSegment(
            start=4.5,
            end=18.0,
            speaker_id="SPEAKER_00",
            text="Developers add B-Tree indexes on single columns, but when you write a WHERE clause combining tenant_id AND created_at, the planner performs a sequential table scan because composite indexing is missing.",
            words=_make_words("Developers add B-Tree indexes on single columns, but when you write a WHERE clause combining tenant_id AND created_at, the planner performs a sequential table scan because composite indexing is missing.", 4.5, 18.0),
        ),
        TranscriptSegment(
            start=18.5,
            end=33.0,
            speaker_id="SPEAKER_00",
            text="Always place the high-cardinality equality column first in the composite index, followed by the range sort column. That single adjustment turns sequential table scans into sub-millisecond index-only lookups.",
            words=_make_words("Always place the high-cardinality equality column first in the composite index, followed by the range sort column. That single adjustment turns sequential table scans into sub-millisecond index-only lookups.", 18.5, 33.0),
        ),
    ]
    all_w7 = [w for s in b7_segments for w in s.words]
    benchmarks.append(
        BenchmarkVideoDataset(
            benchmark_id="bm_07_technical",
            title="Fixing Slow Postgres Queries with Composite Indexes",
            genre="technical_tutorial",
            duration_seconds=35.0,
            transcript=TranscriptResponse(
                id="tr_bm_07",
                project_id="bm_07_technical",
                language="en",
                language_confidence=0.99,
                duration_seconds=35.0,
                word_count=len(all_w7),
                model_used="faster-whisper/base",
                speakers_detected=["SPEAKER_00"],
                segments=b7_segments,
            ),
            ground_truth_moments=[
                GroundTruthMoment(
                    moment_id="gt_bm_07_01",
                    expected_category=HighlightCategory.EDUCATIONAL,
                    acceptable_categories=[HighlightCategory.IMPORTANT_INSIGHT, HighlightCategory.ENTERTAINMENT],
                    true_start=4.5,
                    true_end=33.0,
                    min_acceptable_start=0.0,
                    max_acceptable_end=34.0,
                    core_quote="Always place the high-cardinality equality column first in the composite index",
                    summary="How composite indexing ordering prevents sequential table scans in high-concurrency databases.",
                )
            ],
        )
    )

    # -------------------------------------------------------------
    # 8. STORYTELLING: The Arctic Expedition Crisis
    # -------------------------------------------------------------
    b8_segments = [
        TranscriptSegment(
            start=0.0,
            end=5.0,
            speaker_id="SPEAKER_00",
            text="When the GPS battery froze at minus forty, we realized we were seventy miles off course.",
            words=_make_words("When the GPS battery froze at minus forty, we realized we were seventy miles off course.", 0.0, 5.0),
        ),
        TranscriptSegment(
            start=5.5,
            end=20.0,
            speaker_id="SPEAKER_00",
            text="The blizzard rolled in faster than the weather radio predicted, reducing visibility to less than six feet. The sled dog team stopped moving, and panic began setting in as our satellite beacon lost connection.",
            words=_make_words("The blizzard rolled in faster than the weather radio predicted, reducing visibility to less than six feet. The sled dog team stopped moving, and panic began setting in as our satellite beacon lost connection.", 5.5, 20.0),
        ),
        TranscriptSegment(
            start=20.5,
            end=37.0,
            speaker_id="SPEAKER_00",
            text="Instead of pushing forward blindly into ice crevasses, we dug a snow trench, clustered together for fourteen hours sharing body heat, and waited out the gale. That patience is the only reason I am alive to tell this story.",
            words=_make_words("Instead of pushing forward blindly into ice crevasses, we dug a snow trench, clustered together for fourteen hours sharing body heat, and waited out the gale. That patience is the only reason I am alive to tell this story.", 20.5, 37.0),
        ),
    ]
    all_w8 = [w for s in b8_segments for w in s.words]
    benchmarks.append(
        BenchmarkVideoDataset(
            benchmark_id="bm_08_storytelling",
            title="Survival at Minus Forty",
            genre="storytelling",
            duration_seconds=39.0,
            transcript=TranscriptResponse(
                id="tr_bm_08",
                project_id="bm_08_storytelling",
                language="en",
                language_confidence=0.99,
                duration_seconds=39.0,
                word_count=len(all_w8),
                model_used="faster-whisper/base",
                speakers_detected=["SPEAKER_00"],
                segments=b8_segments,
            ),
            ground_truth_moments=[
                GroundTruthMoment(
                    moment_id="gt_bm_08_01",
                    expected_category=HighlightCategory.STORYTELLING,
                    acceptable_categories=[HighlightCategory.ENTERTAINMENT, HighlightCategory.LIFE_LESSON],
                    true_start=0.0,
                    true_end=37.0,
                    min_acceptable_start=0.0,
                    max_acceptable_end=38.0,
                    core_quote="When the GPS battery froze at minus forty, we realized we were seventy miles off course.",
                    summary="How disciplined patience and snow shelter saved an Arctic expedition after navigational equipment failed.",
                )
            ],
        )
    )

    # -------------------------------------------------------------
    # 9. MULTI-SPEAKER ROUNDTABLE: Artificial Intelligence & Jobs
    # -------------------------------------------------------------
    b9_segments = [
        TranscriptSegment(
            start=0.0,
            end=6.0,
            speaker_id="SPEAKER_00",
            text="Let's debate the contrarian view: is generative AI actually destroying junior engineering careers?",
            words=_make_words("Let's debate the contrarian view: is generative AI actually destroying junior engineering careers?", 0.0, 6.0),
        ),
        TranscriptSegment(
            start=6.5,
            end=18.0,
            speaker_id="SPEAKER_01",
            text="It is not destroying careers; it is eradicating the copy-paste boilerplate work that nobody should have been doing in the first place.",
            words=_make_words("It is not destroying careers; it is eradicating the copy-paste boilerplate work that nobody should have been doing in the first place.", 6.5, 18.0),
        ),
        TranscriptSegment(
            start=18.5,
            end=32.0,
            speaker_id="SPEAKER_02",
            text="I disagree completely. If junior engineers don't write syntax and encounter debugging friction early on, they will never develop the mental architectural intuition required to become staff engineers.",
            words=_make_words("I disagree completely. If junior engineers don't write syntax and encounter debugging friction early on, they will never develop the mental architectural intuition required to become staff engineers.", 18.5, 32.0),
        ),
        TranscriptSegment(
            start=32.5,
            end=44.0,
            speaker_id="SPEAKER_03",
            text="The winners will be the engineers who treat AI like a hyper-fast junior intern while maintaining rigorous verification discipline.",
            words=_make_words("The winners will be the engineers who treat AI like a hyper-fast junior intern while maintaining rigorous verification discipline.", 32.5, 44.0),
        ),
    ]
    all_w9 = [w for s in b9_segments for w in s.words]
    benchmarks.append(
        BenchmarkVideoDataset(
            benchmark_id="bm_09_multispeaker",
            title="The Future of Software Engineers Debate",
            genre="multi_speaker_roundtable",
            duration_seconds=46.0,
            transcript=TranscriptResponse(
                id="tr_bm_09",
                project_id="bm_09_multispeaker",
                language="en",
                language_confidence=0.99,
                duration_seconds=46.0,
                word_count=len(all_w9),
                model_used="faster-whisper/base",
                speakers_detected=["SPEAKER_00", "SPEAKER_01", "SPEAKER_02", "SPEAKER_03"],
                segments=b9_segments,
            ),
            ground_truth_moments=[
                GroundTruthMoment(
                    moment_id="gt_bm_09_01",
                    expected_category=HighlightCategory.STRONG_OPINION,
                    acceptable_categories=[HighlightCategory.IMPORTANT_INSIGHT, HighlightCategory.MOTIVATIONAL],
                    true_start=0.0,
                    true_end=44.0,
                    min_acceptable_start=0.0,
                    max_acceptable_end=45.0,
                    core_quote="If junior engineers don't write syntax and encounter debugging friction early on",
                    summary="Debate between engineering leaders on whether AI code synthesis accelerates or stunts foundational engineering skills.",
                )
            ],
        )
    )

    # -------------------------------------------------------------
    # 10. NOISE & IRRELEVANT FILLER (Crucial for False-Positive Rate)
    # -------------------------------------------------------------
    b10_segments = [
        TranscriptSegment(
            start=0.0,
            end=6.0,
            speaker_id="SPEAKER_00",
            text="Testing, one two three, can you hear me through the headset? Let me check the audio levels here.",
            words=_make_words("Testing, one two three, can you hear me through the headset? Let me check the audio levels here.", 0.0, 6.0),
        ),
        TranscriptSegment(
            start=6.5,
            end=16.0,
            speaker_id="SPEAKER_01",
            text="Yeah, I hear you, but the green light is flashing. Hold on, let me grab a glass of water real quick before we start.",
            words=_make_words("Yeah, I hear you, but the green light is flashing. Hold on, let me grab a glass of water real quick before we start.", 6.5, 16.0),
        ),
        TranscriptSegment(
            start=16.5,
            end=28.0,
            speaker_id="SPEAKER_00",
            text="Sure take your time. Did you see that traffic on the freeway today? Man, it was crazy. Just cars everywhere.",
            words=_make_words("Sure take your time. Did you see that traffic on the freeway today? Man, it was crazy. Just cars everywhere.", 16.5, 28.0),
        ),
        TranscriptSegment(
            start=28.5,
            end=38.0,
            speaker_id="SPEAKER_01",
            text="Yeah totally, same thing every Tuesday. Anyway, let's see if we can get the air conditioner turned on.",
            words=_make_words("Yeah totally, same thing every Tuesday. Anyway, let's see if we can get the air conditioner turned on.", 28.5, 38.0),
        ),
    ]
    all_w10 = [w for s in b10_segments for w in s.words]
    benchmarks.append(
        BenchmarkVideoDataset(
            benchmark_id="bm_10_irrelevant_filler",
            title="Pre-Show Soundcheck & Traffic Banter",
            genre="irrelevant_discussion",
            duration_seconds=40.0,
            is_noise_only=True,
            transcript=TranscriptResponse(
                id="tr_bm_10",
                project_id="bm_10_irrelevant_filler",
                language="en",
                language_confidence=0.99,
                duration_seconds=40.0,
                word_count=len(all_w10),
                model_used="faster-whisper/base",
                speakers_detected=["SPEAKER_00", "SPEAKER_01"],
                segments=b10_segments,
            ),
            ground_truth_moments=[],  # Zero ground truth moments! Any clip selected here is a FALSE POSITIVE!
        )
    )

    return benchmarks
