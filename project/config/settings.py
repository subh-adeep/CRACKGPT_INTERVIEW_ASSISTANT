import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)

# Google Cloud Configuration
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "aids-476019")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
USE_VERTEX = os.getenv("USE_VERTEX_AI", "0")

# Speech Configuration
LANG_STT = "en-IN"
LANG_TTS = os.getenv("GOOGLE_TTS_LANGUAGE", "en-US")
VOICE_NAME = os.getenv("VOICE_NAME", "en-US-Studio-Q")

# Coding Window Configuration
CODING_EXPIRES_AFTER_SEC = 5 * 60  # 5 minutes

# API Configuration
API_KEY = os.getenv("GOOGLE_GENAI_API_KEY") or os.getenv("GOOGLE_API_KEY")

def validate_config():
    """Validate required configuration."""
    if USE_VERTEX != "1" and not API_KEY:
        raise RuntimeError("Set GOOGLE_GENAI_API_KEY/GOOGLE_API_KEY or set USE_VERTEX_AI=1 with ADC.")
