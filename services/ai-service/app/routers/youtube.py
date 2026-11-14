from fastapi import APIRouter, HTTPException, status
from typing import Dict, Any, List
from app.schemas.youtube import (
    YouTubePublicMetadata,
    YouTubeRetentionReport,
    YouTubeEnrichmentRequest,
    YouTubeEnrichmentResponse,
)
from app.services.youtube_signals import youtube_signal_service

router = APIRouter(prefix="/api/v1/youtube", tags=["YouTube Signals & Retention"])

@router.post("/metadata", response_model=YouTubePublicMetadata, status_code=status.HTTP_200_OK)
async def parse_public_metadata(payload: Dict[str, Any]):
    """
    Parses and sanitizes public YouTube metadata, gracefully handling missing or hidden statistics.
    """
    try:
        return youtube_signal_service.parse_public_metadata(payload)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse public metadata: {str(e)}",
        )

@router.post("/retention/map", response_model=YouTubeRetentionReport, status_code=status.HTTP_200_OK)
async def map_retention_data(payload: Dict[str, Any]):
    """
    Maps authorized YouTube Analytics audience retention ratios to video timeline seconds.
    Enforces strict OAuth channel ownership.
    """
    try:
        video_id = str(payload.get("video_id", "unknown"))
        raw_rows = payload.get("rows", [])
        duration = float(payload.get("video_duration", 60.0))
        is_auth = bool(payload.get("is_authorized", False))
        auth_channel = payload.get("authenticated_channel_id")
        video_channel = payload.get("video_channel_id")

        return youtube_signal_service.map_retention_data(
            video_id=video_id,
            raw_rows=raw_rows,
            video_duration=duration,
            is_authorized=is_auth,
            authenticated_channel_id=auth_channel,
            video_channel_id=video_channel,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to map retention data: {str(e)}",
        )

@router.post("/enrich-candidates", response_model=YouTubeEnrichmentResponse, status_code=status.HTTP_200_OK)
async def enrich_candidates(request: YouTubeEnrichmentRequest):
    """
    Combines verified retention evidence with candidate highlights.
    Safely falls back to AI-estimated potential when retention is unavailable.
    """
    try:
        return youtube_signal_service.process_enrichment_request(request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to enrich candidates: {str(e)}",
        )
