import logging
from typing import Optional, Any
from app.config import settings

logger = logging.getLogger("clipforge.model_manager")

# Ensure PyAV compatibility with faster-whisper across all PyAV versions
try:
    import av
    _orig_av_open = av.open

    def _patched_av_open(*args, **kwargs):
        kwargs.pop("metadata_errors", None)
        return _orig_av_open(*args, **kwargs)

    av.open = _patched_av_open
except Exception as e:
    logger.debug(f"PyAV patch skipped: {e}")

class ModelManager:
    """
    Singleton manager for Whisper and Pyannote AI models.
    Prevents repeated loading into RAM and provides hardware-accelerated configuration.
    """
    _instance: Optional["ModelManager"] = None
    _whisper_models: dict[str, Any] = {}
    _is_faster_whisper_available: Optional[bool] = None

    def __new__(cls) -> "ModelManager":
        if cls._instance is None:
            cls._instance = super(ModelManager, cls).__new__(cls)
            cls._instance._whisper_models = {}
            cls._instance._is_faster_whisper_available = None
        return cls._instance

    def is_faster_whisper_supported(self) -> bool:
        if self._is_faster_whisper_available is not None:
            return self._is_faster_whisper_available

        if settings.whisper_backend == "mock":
            self._is_faster_whisper_available = False
            return False

        try:
            from faster_whisper import WhisperModel  # noqa: F401
            self._is_faster_whisper_available = True
            logger.info("faster-whisper native backend is available and active.")
        except Exception as e:
            logger.warning(
                f"faster-whisper is not available or native binary loading was blocked ({e}). "
                "Operating in fallback transcription mode."
            )
            self._is_faster_whisper_available = False

        return self._is_faster_whisper_available

    def get_whisper_model(self, model_size: Optional[str] = None) -> Any:
        target_size = model_size or settings.whisper_model

        if not self.is_faster_whisper_supported():
            return None

        if target_size in self._whisper_models:
            return self._whisper_models[target_size]

        from faster_whisper import WhisperModel

        device = settings.whisper_device
        if device == "auto":
            try:
                import torch
                device = "cuda" if torch.cuda.is_available() else "cpu"
            except ImportError:
                device = "cpu"

        compute_type = settings.whisper_compute_type
        if device == "cpu" and compute_type == "float16":
            compute_type = "int8"  # float16 not supported on standard CPU

        logger.info(f"Loading Whisper model '{target_size}' on device='{device}', compute_type='{compute_type}'...")
        
        try:
            model = WhisperModel(
                target_size,
                device=device,
                compute_type=compute_type,
                cpu_threads=settings.max_workers,
            )
            self._whisper_models[target_size] = model
            logger.info(f"Successfully loaded Whisper model '{target_size}' on device='{device}'.")
            return model
        except Exception as e:
            if device != "cpu":
                logger.warning(f"Device '{device}' failed ({e}). Automatically falling back to CPU with int8...")
                try:
                    model = WhisperModel(
                        target_size,
                        device="cpu",
                        compute_type="int8",
                        cpu_threads=settings.max_workers,
                    )
                    self._whisper_models[target_size] = model
                    logger.info(f"Successfully loaded Whisper model '{target_size}' on CPU.")
                    return model
                except Exception as cpu_err:
                    logger.error(f"CPU fallback for WhisperModel '{target_size}' also failed: {cpu_err}")
                    raise cpu_err
            logger.error(f"Failed to load WhisperModel '{target_size}': {e}")
            raise

    def unload_models(self) -> None:
        """Unload cached models to free system memory."""
        self._whisper_models.clear()
        logger.info("All cached AI models unloaded from memory.")

model_manager = ModelManager()

