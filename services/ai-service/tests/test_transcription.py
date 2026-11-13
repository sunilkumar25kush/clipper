import os
import wave
import struct
import math
import tempfile
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.transcript import (
    WordTimestamp,
    TranscriptSegment,
    SpeakerTurn,
    TranscriptResponse,
    TranscriptionRequest,
)
from app.services.chunker import audio_chunker
from app.services.diarizer import diarization_service
from app.services.transcription import transcription_service
from app.services.storage import transcript_storage

client = TestClient(app)

def create_synthetic_wav(file_path: str, duration_seconds: float = 3.0, sample_rate: int = 16000):
    """Generates a valid 16kHz mono 16-bit PCM WAV file."""
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with wave.open(file_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        total_frames = int(duration_seconds * sample_rate)
        data = bytearray()
        for i in range(total_frames):
            # 440 Hz tone with varying amplitude
            sample = int(32767.0 * 0.4 * math.sin(2.0 * math.pi * 440.0 * (i / sample_rate)))
            data.extend(struct.pack("<h", sample))
        wf.writeframes(data)

@pytest.fixture(scope="session")
def test_audio_dir():
    temp_dir = tempfile.mkdtemp(prefix="clipforge_test_audio_")
    yield temp_dir
    # Cleanup
    import shutil
    shutil.rmtree(temp_dir, ignore_errors=True)

class TestHealthAndSystem:
    def test_health_check_endpoint(self):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "clipforge-ai-service"
        assert "whisper" in data
        assert "native_faster_whisper_available" in data["whisper"]

class TestTranscriptionPipeline:
    def test_short_audio_transcription(self, test_audio_dir):
        wav_path = os.path.join(test_audio_dir, "short_sample.wav")
        create_synthetic_wav(wav_path, duration_seconds=4.0)

        payload = {
            "audio_path": wav_path,
            "project_id": "proj_test_short_01",
            "language": "en",
            "enable_diarization": True,
        }

        response = client.post("/api/v1/transcribe", json=payload)
        assert response.status_code == 200
        data = response.json()

        # Validate with Pydantic
        transcript = TranscriptResponse.model_validate(data)
        assert transcript.project_id == "proj_test_short_01"
        assert transcript.language == "en"
        assert transcript.duration_seconds >= 3.9
        assert len(transcript.segments) > 0
        assert transcript.word_count > 0
        assert len(transcript.speakers_detected) > 0

        # Validate segment structure
        seg = transcript.segments[0]
        assert seg.start >= 0.0
        assert seg.end > seg.start
        assert len(seg.text) > 0
        assert seg.speaker_id.startswith("SPEAKER_")
        assert len(seg.words) > 0
        assert seg.words[0].probability >= 0.0

    def test_multilingual_audio_transcription(self, test_audio_dir):
        wav_path = os.path.join(test_audio_dir, "spanish_sample.wav")
        create_synthetic_wav(wav_path, duration_seconds=3.0)

        payload = {
            "audio_path": wav_path,
            "project_id": "proj_test_es_02",
            "language": "es",
        }

        response = client.post("/api/v1/transcribe", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["language"] == "es"
        assert data["project_id"] == "proj_test_es_02"

    def test_missing_audio_file_returns_404(self):
        payload = {
            "audio_path": "C:/non_existent_path/missing_file.wav",
            "project_id": "proj_missing_03",
        }
        response = client.post("/api/v1/transcribe", json=payload)
        assert response.status_code == 404
        assert "does not exist" in response.json()["detail"]

    def test_empty_audio_file_returns_400(self, test_audio_dir):
        empty_wav = os.path.join(test_audio_dir, "empty.wav")
        with open(empty_wav, "wb"):
            pass  # 0 bytes

        payload = {
            "audio_path": empty_wav,
            "project_id": "proj_empty_04",
        }
        response = client.post("/api/v1/transcribe", json=payload)
        assert response.status_code == 400
        assert "empty" in response.json()["detail"]

class TestLongAudioChunking:
    def test_long_audio_window_generation(self):
        # 1-hour audio (3600s) with 1800s window and 120s overlap
        windows = audio_chunker.generate_windows(3600.0, window_size=1800.0, overlap_size=120.0)
        assert len(windows) == 3
        assert windows[0] == (0.0, 1800.0)
        assert windows[1] == (1680.0, 3480.0)
        assert windows[2] == (3360.0, 3600.0)

    def test_merge_chunk_words_with_timestamps(self):
        # Window 1: 0 to 10s
        chunk1_words = [
            WordTimestamp(word="Welcome", start=1.0, end=1.5, probability=0.98),
            WordTimestamp(word="to", start=1.6, end=1.8, probability=0.99),
            WordTimestamp(word="ClipForge", start=1.9, end=2.5, probability=0.95),
            WordTimestamp(word="AI", start=2.6, end=3.0, probability=0.97),
        ]

        # Window 2 starts at offset 2.0s (overlap from 2.0s to 3.0s)
        # Raw timestamps relative to chunk 2:
        chunk2_words = [
            WordTimestamp(word="ClipForge", start=0.0, end=0.5, probability=0.94), # overlaps with 1.9-2.5
            WordTimestamp(word="AI", start=0.6, end=1.0, probability=0.96),        # overlaps with 2.6-3.0
            WordTimestamp(word="viral", start=1.2, end=1.8, probability=0.98),     # 3.2-3.8 global
            WordTimestamp(word="clips", start=1.9, end=2.4, probability=0.97),     # 3.9-4.4 global
        ]

        merged = audio_chunker.merge_chunk_words([
            (0.0, chunk1_words),
            (2.0, chunk2_words),
        ])

        # Verify no duplicate "ClipForge" or "AI" tokens from the overlap
        words_text = [w.word for w in merged]
        assert words_text.count("Welcome") == 1
        assert words_text.count("to") == 1
        assert words_text.count("ClipForge") == 1
        assert words_text.count("AI") == 1
        assert words_text.count("viral") == 1
        assert words_text.count("clips") == 1

        # Check global monotonicity
        for i in range(len(merged) - 1):
            assert merged[i].end <= merged[i + 1].start + 0.1

class TestSpeakerDiarization:
    def test_word_to_speaker_alignment(self):
        words = [
            WordTimestamp(word="Hello", start=1.0, end=1.5, probability=0.99),
            WordTimestamp(word="world", start=1.6, end=2.0, probability=0.98),
            WordTimestamp(word="Yes", start=3.5, end=4.0, probability=0.97),
            WordTimestamp(word="indeed", start=4.1, end=4.6, probability=0.96),
        ]

        speaker_turns = [
            SpeakerTurn(start=0.5, end=2.5, speaker_id="SPEAKER_00"),
            SpeakerTurn(start=3.0, end=5.0, speaker_id="SPEAKER_01"),
        ]

        segments = diarization_service.align_words_to_speakers(words, speaker_turns)
        assert len(segments) == 2
        assert segments[0].speaker_id == "SPEAKER_00"
        assert segments[0].text == "Hello world"
        assert segments[1].speaker_id == "SPEAKER_01"
        assert segments[1].text == "Yes indeed"

class TestTranscriptStorageAndRetrieval:
    def test_storage_and_retrieval_cycle(self, test_audio_dir):
        wav_path = os.path.join(test_audio_dir, "storage_test.wav")
        create_synthetic_wav(wav_path, duration_seconds=2.5)

        # 1. Transcribe
        req = TranscriptionRequest(audio_path=wav_path, project_id="proj_storage_cycle")
        result = transcription_service.transcribe_audio(req)
        saved_path = transcript_storage.save_transcript(result)
        assert os.path.exists(saved_path)

        # 2. Retrieve by ID
        fetched = client.get(f"/api/v1/transcripts/{result.id}")
        assert fetched.status_code == 200
        fetched_obj = TranscriptResponse.model_validate(fetched.json())
        assert fetched_obj.id == result.id
        assert fetched_obj.project_id == "proj_storage_cycle"

        # 3. List transcripts by Project ID
        list_res = client.get("/api/v1/projects/proj_storage_cycle/transcripts")
        assert list_res.status_code == 200
        summaries = list_res.json()
        assert len(summaries) >= 1
        assert summaries[0]["project_id"] == "proj_storage_cycle"

        # 4. Get Latest for Project
        latest_res = client.get("/api/v1/projects/proj_storage_cycle/transcripts/latest")
        assert latest_res.status_code == 200
        assert latest_res.json()["id"] == result.id

    def test_non_existent_transcript_returns_404(self):
        res = client.get("/api/v1/transcripts/non-existent-transcript-id")
        assert res.status_code == 404

