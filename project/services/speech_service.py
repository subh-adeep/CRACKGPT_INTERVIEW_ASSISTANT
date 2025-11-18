# speech_service.py
"""Speech-to-Text and Text-to-Speech services (robust, with transcoding)."""

import base64
import io
import logging
import os
import tempfile
from typing import Optional, List

from google.cloud import speech_v2
from google.cloud import texttospeech

# Optional dependency used for robust transcoding
try:
    from pydub import AudioSegment
except Exception:
    AudioSegment = None

# Local project settings (your existing config)
from config.settings import PROJECT_ID, LANG_STT, LANG_TTS, VOICE_NAME

# Initialize clients
stt_client = speech_v2.SpeechClient()
tts_client = texttospeech.TextToSpeechClient()

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class TranscodeError(RuntimeError):
    pass


def detect_audio_signature_prefix(b: bytes) -> str:
    if not b:
        return "empty"
    head = b[:64]
    if head.startswith(b"data:"):
        return "data-uri"
    if head.startswith(b"ID3") or head[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "mp3"
    if head[:4] == b"RIFF":
        return "wav"
    if head[:4] == b"OggS":
        return "ogg"
    if b"OpusHead" in head:
        return "opus"
    if b"\x1A\x45\xDF\xA3" in head:
        return "webm"
    if b"ftyp" in head:
        return "mp4"
    return "unknown"


def transcode_to_wav_bytes(
    input_bytes: bytes,
    format_hint: Optional[str] = None,
    target_rate: int = 16000,
) -> bytes:
    """
    Convert mp3/webm/ogg/opus/other -> 16-bit PCM WAV bytes (mono, target_rate).
    Requires pydub + ffmpeg available.

    Raises TranscodeError if conversion fails.
    """
    if AudioSegment is None:
        raise TranscodeError("pydub not installed; install pydub and ensure ffmpeg is on PATH")

    if not input_bytes:
        raise TranscodeError("Empty audio bytes")

    # If this is a data URI, decode it first
    if input_bytes.startswith(b"data:"):
        try:
            header, b64 = input_bytes.split(b",", 1)
            input_bytes = base64.b64decode(b64)
        except Exception as e:
            raise TranscodeError(f"Invalid data URI: {e}")

    buf = io.BytesIO(input_bytes)
    # Try autodetect; pydub uses ffmpeg to detect format.
    try:
        audio = AudioSegment.from_file(buf, format=format_hint)
    except Exception:
        last_exc = None
        audio = None
        fmt_candidates = [format_hint, "webm", "ogg", "mp3", "mp4", "wav"]
        ext_map = {"webm": ".webm", "ogg": ".ogg", "mp3": ".mp3", "mp4": ".mp4", "wav": ".wav"}
        for fmt in fmt_candidates:
            if not fmt:
                continue
            try:
                audio = AudioSegment.from_file(io.BytesIO(input_bytes), format=fmt)
                break
            except Exception as e:
                last_exc = e
                audio = None
        if audio is None:
            try:
                suffix = ext_map.get(format_hint or "", ".bin")
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    tmp.write(input_bytes)
                    tmp_path = tmp.name
                try:
                    if format_hint:
                        audio = AudioSegment.from_file(tmp_path, format=format_hint)
                    else:
                        audio = AudioSegment.from_file(tmp_path)
                finally:
                    try:
                        os.remove(tmp_path)
                    except Exception:
                        pass
            except Exception as e:
                last_exc = e
        if audio is None:
            raise TranscodeError(f"Transcode autodetect failed: {last_exc}")

    # Normalize: mono, target_rate, 16-bit samples
    audio = audio.set_frame_rate(target_rate).set_channels(1).set_sample_width(2)
    out = io.BytesIO()
    audio.export(out, format="wav")
    return out.getvalue()


class SpeechService:
    """Handles STT and TTS operations with defensive handling."""

    # Maximum raw bytes we'll accept for immediate in-memory STT (avoid huge payloads)
    MAX_IN_MEMORY_BYTES = 6 * 1024 * 1024  # 6 MB (adjust as needed)

    @staticmethod
    def transcribe_audio(audio_bytes: bytes, filename_hint: Optional[str] = None) -> str:
        """
        Transcribe audio bytes to text using Google Speech-to-Text.
        - Accepts browser blobs (webm/ogg/opus) and will transcode them to WAV PCM first.
        - Returns trimmed transcript string.
        - Raises ValueError or TranscodeError with explanatory messages on failure.
        """
        if not audio_bytes:
            raise ValueError("Empty audio bytes provided to transcribe_audio")

        sig = detect_audio_signature_prefix(audio_bytes)
        logger.info("transcribe_audio: signature=%s filename_hint=%s size=%d", sig, filename_hint, len(audio_bytes))

        fmt_hint = None
        if filename_hint:
            n = str(filename_hint).lower()
            if "webm" in n:
                fmt_hint = "webm"
            elif "ogg" in n:
                fmt_hint = "ogg"
            elif "mp3" in n:
                fmt_hint = "mp3"
            elif "wav" in n:
                fmt_hint = "wav"
            elif "mp4" in n or "m4a" in n:
                fmt_hint = "mp4"
        if not fmt_hint:
            if sig == "opus":
                fmt_hint = "ogg"
            elif sig in ("webm", "ogg", "mp3", "mp4"):
                fmt_hint = sig

        should_transcode = sig in ("webm", "ogg", "mp3", "opus", "mp4", "data-uri", "unknown")
        wav_bytes = audio_bytes

        if should_transcode:
            try:
                wav_bytes = transcode_to_wav_bytes(audio_bytes, format_hint=fmt_hint, target_rate=16000)
                logger.info("transcribe_audio: transcoded -> wav bytes=%d", len(wav_bytes))
            except TranscodeError as e:
                logger.exception("STT transcode error")
                wav_bytes = audio_bytes

        # safety check for extremely large payloads
        if len(wav_bytes) > SpeechService.MAX_IN_MEMORY_BYTES:
            # Suggest using longrunning_recognize with GCS for large files
            raise ValueError("Audio too large for synchronous transcription; upload to GCS and use longrunning_recognize")

        # Build STT request
        recognizer_path = f"projects/{PROJECT_ID}/locations/global/recognizers/_"
        config = speech_v2.RecognitionConfig(
            # Given we provide WAV PCM, auto-detect is still safe; the API will adapt.
            auto_decoding_config=speech_v2.AutoDetectDecodingConfig(),
            language_codes=[LANG_STT],
            model="latest_short",
            features=speech_v2.RecognitionFeatures(
                enable_automatic_punctuation=True,
                enable_word_time_offsets=False,
            ),
        )

        req = speech_v2.RecognizeRequest(
            recognizer=recognizer_path,
            config=config,
            content=wav_bytes,
        )

        try:
            stt_resp = stt_client.recognize(request=req)
        except Exception as e:
            logger.exception("STT API error")
            # include a short, helpful message
            raise RuntimeError(f"Speech-to-text request failed: {e}")

        if not stt_resp.results:
            raise ValueError("No speech detected (STT returned no results)")

        # Return the top alternative transcript
        transcript = stt_resp.results[0].alternatives[0].transcript.strip()
        return transcript

    @staticmethod
    def synthesize_speech(text: str, voice_name: str = VOICE_NAME, max_attempts: int = 3) -> str:
        """
        Synthesize text -> base64 MP3 data URI.
        Retries a few times with fallback voice options.
        """
        text = (text or "").strip()
        if not text:
            raise RuntimeError("TTS input text is empty")

        if len(text) > 3000:
            text = text[:3000]

        # Google TTS only

        input_text = texttospeech.SynthesisInput(text=text)
        audio_conf = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=1.0,
            pitch=0.0,
        )

        candidates = [
            {"language_code": LANG_TTS, "name": voice_name},
        ]

        # Add runtime Studio fallbacks discovered from account
        studio_names = [n for n in SpeechService.list_studio_voice_names() if n and n != voice_name]
        for n in studio_names[:5]:
            candidates.append({"language_code": LANG_TTS, "name": n})

        last_err = None
        attempts = 0
        for c in candidates:
            attempts += 1
            try:
                voice = texttospeech.VoiceSelectionParams(
                    language_code=c["language_code"], name=c["name"]
                ) if c["name"] else texttospeech.VoiceSelectionParams(language_code=c["language_code"])
                resp = tts_client.synthesize_speech(input=input_text, voice=voice, audio_config=audio_conf)
                audio_content = getattr(resp, "audio_content", b"") or b""
                if audio_content:
                    b64 = base64.b64encode(audio_content).decode("utf-8")
                    return f"data:audio/mp3;base64,{b64}"
            except Exception as e:
                last_err = e
                if attempts < max_attempts:
                    continue

        raise RuntimeError(f"TTS produced no audio after tries. last_err={last_err}")

    @staticmethod
    def list_studio_voice_names() -> List[str]:
        try:
            resp = tts_client.list_voices()
            names = []
            for v in getattr(resp, "voices", []) or []:
                name = getattr(v, "name", "") or ""
                if "Studio" in name:
                    # If language is specified, prefer matching LANG_TTS
                    try:
                        langs = [str(x) for x in getattr(v, "language_codes", []) or []]
                    except Exception:
                        langs = []
                    if not langs or LANG_TTS in langs:
                        names.append(name)
            return names
        except Exception:
            return []

    # Optional convenience: wrapper to take form-file uploads (Flask/Werkzeug FileStorage)
    @staticmethod
    def transcribe_file_storage(file_storage) -> str:
        """
        Convenience wrapper for Flask's request.files['audio'] objects.
        Detects data: URIs and handles reading bytes then calling transcribe_audio.
        """
        raw = file_storage.read() if hasattr(file_storage, "read") else b""
        return SpeechService.transcribe_audio(raw, filename_hint=getattr(file_storage, "filename", None))


# --------------------
# Minimal unit-style tests for format detection (no external APIs)
# These run if you execute this module directly and do not call cloud APIs.
if __name__ == "__main__":
    # Simple smoke tests for detect_audio_signature_prefix
    samples = {
        b"": "empty",
        b"ID3\x03\x00": "mp3",
        b"RIFF\x00\x00\x00\x00WAVE": "wav",
        b"OggS\x00\x02": "ogg",
        b"OpusHead\x01": "opus",
        b"data:audio/mp3;base64,AAA": "data-uri",
    }
    all_ok = True
    for s, expected in samples.items():
        got = detect_audio_signature_prefix(s)
        print("sig:", s[:12], "->", got, "(expected:", expected, ")")
        if got != expected:
            print("  !!! mismatch")
            all_ok = False
    if all_ok:
        print("signature sniff tests passed")
    else:
        raise SystemExit("signature tests failed")
