 ## Team 18 ADSAI Project

- `GOOGLE_CLOUD_PROJECT`: the Google Console Project ID (used by STT/TTS and Vertex).
- `USE_VERTEX_AI`: set to `1` to use Vertex AI via ADC; keep `0` to use AI Studio API key.
- `GOOGLE_GENAI_API_KEY` (or `GOOGLE_API_KEY`): required if `USE_VERTEX_AI=0`.
- `VOICE_NAME`: pick any available voice (Studio/Neural2). UI dropdown includes common voices.

## Using Your Google Console Project ID (TTS, STT, Gemini)
- STT (Speech-to-Text v2):
  - Enable “Cloud Speech-to-Text API” for your Project ID in Google Console.
  - Credentials:
    - Vertex/ADC path: set `USE_VERTEX_AI=1` and configure ADC (see below).
    - AI Studio path: not used for STT; STT requires Cloud credentials (ADC or service account).
  - Code uses `projects/{PROJECT_ID}/locations/global/recognizers/_` (no manual recognizer setup needed).

- TTS (Cloud Text-to-Speech):
  - Enable “Cloud Text-to-Speech API” for your Project ID.
  - Same credential method as STT (ADC/service account).
  - `VOICE_NAME` can be set via the UI or `/api/set_voice`. Use `/api/list_voices` to discover Studio voices.

- Gemini 2.5 Flash Lite:
  - AI Studio route:
    - Create an API key in Google AI Studio.
    - Set `GOOGLE_GENAI_API_KEY` and keep `USE_VERTEX_AI=0`.
    - `GEMINI_MODEL=gemini-2.5-flash-lite`.
  - Vertex AI route:
    - Enable “Vertex AI API” for your Project ID.
    - Set `USE_VERTEX_AI=1` and configure ADC:
      - `gcloud auth application-default login` (user ADC), or
      - Service Account: download key JSON and set `GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\key.json`.
    - Ensure the service account has roles: `Vertex AI User` and access to TTS/STT if you use those.

## Running the App
- From the `project/` directory:
  - `python app.py`
- The server chooses an open port (default 8000). Open:
  - `http://localhost:8000/` — Home
  - `http://localhost:8000/setup` — Upload resume/job description
  - `http://localhost:8000/interview` — Run the interview
  - `http://localhost:8000/results` — View feedback

## Using the App
- On the Setup page, upload your resume and job description (or paste text).
- On the Interview page:
  - Choose a voice if desired.
  - Click “Start Conversation” or press Space to toggle.
  - Speak when prompted; the app listens and advances.
  - Use “Start Coding” to submit a snippet; the AI gives a short reflective follow-up.
  - Click “Finish Now” to generate feedback.
- Feedback is saved to `project/static/feedback/` and shown in the UI.

## Troubleshooting
- STT/TTS auth errors:
  - Verify `GOOGLE_CLOUD_PROJECT` and that APIs are enabled.
  - For Vertex: check `GOOGLE_APPLICATION_CREDENTIALS` or run `gcloud auth application-default login`.
- Transcoding errors ("pydub not installed" or “ffmpeg not found”):
  - Ensure `pydub` is installed via `pip`.
  - Ensure `ffmpeg` is installed and on PATH.
- Gemini rate limits:
  - The app implements simple rate limiting; if you see pauses, wait a moment and retry.

## Key Files
- Backend: `project/app.py`, `project/routes/*.py`
- Services: `project/services/ai_service.py`, `project/services/speech_service.py`
- Config: `project/config/settings.py` (reads `project/.env`)
- Frontend: `project/static/*`