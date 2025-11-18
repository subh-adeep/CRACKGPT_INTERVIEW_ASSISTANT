"""Speech-to-Text and Text-to-Speech services."""
import base64
from google.cloud import speech_v2
from google.cloud import texttospeech

from config.settings import PROJECT_ID, LANG_STT, LANG_TTS, VOICE_NAME

# Initialize clients
stt_client = speech_v2.SpeechClient()
tts_client = texttospeech.TextToSpeechClient()

class SpeechService:
    """Handles STT and TTS operations."""
    
    @staticmethod
    def transcribe_audio(audio_bytes: bytes) -> str:
        """Transcribe audio bytes to text using Google Speech-to-Text."""
        recognizer_path = f"projects/{PROJECT_ID}/locations/global/recognizers/_"
        config = speech_v2.RecognitionConfig(
            auto_decoding_config=speech_v2.AutoDetectDecodingConfig(),
            language_codes=[LANG_STT],
            model="latest_long",
            features=speech_v2.RecognitionFeatures(
                enable_automatic_punctuation=True,
                enable_word_time_offsets=False,
            ),
        )
        req = speech_v2.RecognizeRequest(
            recognizer=recognizer_path,
            config=config,
            content=audio_bytes,
        )
        
        stt_resp = stt_client.recognize(request=req)
        
        if not stt_resp.results:
            raise ValueError("No speech detected")
        
        return stt_resp.results[0].alternatives[0].transcript.strip()
    
    @staticmethod
    def synthesize_speech(text: str, voice_name: str = VOICE_NAME) -> str:
        """Synthesize text to speech and return base64-encoded MP3."""
        text = (text or "").strip()
        if not text:
            raise RuntimeError("TTS input text is empty")
        
        input_text = texttospeech.SynthesisInput(text=text)
        audio_conf = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=1.1,
            pitch=2.5,
        )
        
        candidates = [
            {"language_code": LANG_TTS, "name": voice_name},
            {"language_code": LANG_TTS, "name": None},
            {"language_code": "en-US", "name": "en-US-Neural2-C"},
            {"language_code": "en-US", "name": None},
        ]
        
        last_err = None
        for c in candidates:
            try:
                voice = texttospeech.VoiceSelectionParams(
                    language_code=c["language_code"], name=c["name"]
                ) if c["name"] else texttospeech.VoiceSelectionParams(
                    language_code=c["language_code"]
                )
                resp = tts_client.synthesize_speech(
                    input=input_text, voice=voice, audio_config=audio_conf
                )
                size = len(getattr(resp, "audio_content", b"") or b"")
                print(f"[TTS] tried {c} -> bytes={size}")
                if size:
                    b64 = base64.b64encode(resp.audio_content).decode("utf-8")
                    return f"data:audio/mp3;base64,{b64}"
                else:
                    print(f"[TTS] Empty audio with voice {c}")
            except Exception as e:
                last_err = e
                print(f"[TTS] Exception for {c}: {e}")
        
        raise RuntimeError(f"TTS produced no audio. last_err={last_err}")
