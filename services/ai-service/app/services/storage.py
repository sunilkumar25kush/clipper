import os
import re
import json
import logging
from datetime import datetime, timezone
from typing import Optional, List
from app.config import settings
from app.schemas.transcript import TranscriptResponse, TranscriptSummary

logger = logging.getLogger("clipforge.storage")

class TranscriptStorage:
    """
    Persistence layer for structured transcript JSON documents.
    """
    def __init__(self, storage_dir: str = settings.transcript_storage_dir):
        self.storage_dir = os.path.abspath(storage_dir)
        os.makedirs(self.storage_dir, exist_ok=True)

    def _get_file_path(self, transcript_id: str) -> str:
        safe_id = re.sub(r"[^\w\-.]", "_", os.path.basename(transcript_id))
        path = os.path.abspath(os.path.join(self.storage_dir, f"{safe_id}.json"))
        if not path.startswith(self.storage_dir):
            raise ValueError(f"Path traversal detected: {transcript_id}")
        return path

    def save_transcript(self, transcript: TranscriptResponse) -> str:
        """Saves transcript response to JSON file."""
        file_path = self._get_file_path(transcript.id)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(transcript.model_dump_json(indent=2))
        logger.info(f"Saved transcript {transcript.id} for project {transcript.project_id}")
        return file_path

    def get_transcript(self, transcript_id: str) -> Optional[TranscriptResponse]:
        """Retrieves transcript by ID."""
        file_path = self._get_file_path(transcript_id)
        if not os.path.exists(file_path):
            return None

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return TranscriptResponse.model_validate(data)
        except Exception as e:
            logger.error(f"Error reading transcript file {file_path}: {e}")
            return None

    def get_transcripts_by_project(self, project_id: str) -> List[TranscriptSummary]:
        """Lists summaries of all transcripts associated with a given project ID."""
        summaries: List[TranscriptSummary] = []
        if not os.path.exists(self.storage_dir):
            return summaries

        for fname in os.listdir(self.storage_dir):
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(self.storage_dir, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if data.get("project_id") == project_id:
                    summaries.append(
                        TranscriptSummary(
                            id=data["id"],
                            project_id=data["project_id"],
                            language=data.get("language", "en"),
                            duration_seconds=data.get("duration_seconds", 0.0),
                            segment_count=len(data.get("segments", [])),
                            word_count=data.get("word_count", 0),
                            created_at=data.get("created_at"),
                        )
                    )
            except Exception:
                continue

        def get_sort_key(s: TranscriptSummary) -> float:
            if isinstance(s.created_at, datetime):
                dt = s.created_at if s.created_at.tzinfo else s.created_at.replace(tzinfo=timezone.utc)
                return dt.timestamp()
            return 0.0

        return sorted(summaries, key=get_sort_key, reverse=True)

    def get_latest_transcript_for_project(self, project_id: str) -> Optional[TranscriptResponse]:
        """Retrieves the most recent transcript for a given project."""
        summaries = self.get_transcripts_by_project(project_id)
        if not summaries:
            return None
        return self.get_transcript(summaries[0].id)

transcript_storage = TranscriptStorage()

class CandidateStorage:
    """
    Dedicated storage layer for discovered highlight candidates.
    Stored independently from rendered clips and raw video assets.
    """
    def __init__(self, storage_dir: str = settings.candidate_storage_dir):
        self.storage_dir = os.path.abspath(storage_dir)
        os.makedirs(self.storage_dir, exist_ok=True)

    def _get_file_path(self, project_id: str) -> str:
        safe_id = re.sub(r"[^\w\-.]", "_", os.path.basename(project_id))
        path = os.path.abspath(os.path.join(self.storage_dir, f"{safe_id}.json"))
        if not path.startswith(self.storage_dir):
            raise ValueError(f"Path traversal detected: {project_id}")
        return path

    def save_candidates(self, project_id: str, candidates: list) -> str:
        """Saves discovered highlight candidates to disk as JSON."""
        file_path = self._get_file_path(project_id)
        data = [c.model_dump(mode="json") if hasattr(c, "model_dump") else c for c in candidates]
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump({"project_id": project_id, "total": len(candidates), "candidates": data}, f, indent=2)
        logger.info(f"Saved {len(candidates)} highlight candidates for project {project_id}")
        return file_path

    def get_candidates(self, project_id: str) -> list:
        """Retrieves saved highlight candidates for a project."""
        file_path = self._get_file_path(project_id)
        if not os.path.exists(file_path):
            return []
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("candidates", [])
        except Exception as e:
            logger.error(f"Error reading candidates from {file_path}: {e}")
            return []

candidate_storage = CandidateStorage()

