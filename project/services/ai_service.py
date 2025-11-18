"""Gemini AI service for interview interactions."""
import os
import time
from google import genai
from google.genai import types
from google.genai.errors import ClientError
from google.genai.types import HttpOptions

from config.settings import PROJECT_ID, LOCATION, GEMINI_MODEL, USE_VERTEX, API_KEY, validate_config

validate_config()

# Initialize Gemini client
if USE_VERTEX == "1":
    genai_client = genai.Client(
        vertexai=True,
        project=PROJECT_ID,
        location=LOCATION,
        http_options=HttpOptions(api_version="v1"),
    )
    print("[GENAI] Using Vertex AI (v1) via ADC")
else:
    genai_client = genai.Client(api_key=API_KEY)
    print("[GENAI] Using AI Studio API key (v1beta)")

_last_calls = []  # Rate limiting tracker

class AIService:
    """Handles AI model interactions."""
    
    @staticmethod
    def _allow_call(max_per_min: int = 3) -> bool:
        """Rate limiting check."""
        if USE_VERTEX == "1":
            return True
        now = time.time()
        while _last_calls and now - _last_calls[0] > 60:
            _last_calls.pop(0)
        if len(_last_calls) >= max_per_min:
            return False
        _last_calls.append(now)
        return True
    
    @staticmethod
    def _debug_response(resp):
        """Debug Gemini response."""
        try:
            print(">>> GEMINI DEBUG >>>")
            print("text len:", len(getattr(resp, "text", "") or ""))
            for i, c in enumerate(getattr(resp, "candidates", []) or []):
                fr = getattr(c, "finish_reason", None)
                print(f"candidate[{i}].finish_reason:", fr)
            pf = getattr(resp, "prompt_feedback", None)
            if pf:
                print("prompt_feedback.block_reason:", getattr(pf, "block_reason", None))
            print("<<< END GEMINI DEBUG <<<")
        except Exception:
            pass
    
    @staticmethod
    def generate_content(prompt: str, temperature: float = 0.7, max_tokens: int = 1000) -> str:
        """Generate content using Gemini."""
        if not AIService._allow_call(2):
            return "Quick pause to avoid rate limits. Could you summarize your last point in one sentence?"
        
        attempts = [
            dict(temperature=temperature, max_output_tokens=max_tokens, contents=prompt),
            dict(temperature=0.2, max_output_tokens=300,
                 contents=prompt + "\n\nAnswer in one short, safe sentence only."),
        ]
        
        last_error = None
        for a in attempts:
            try:
                resp = genai_client.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=a["contents"],
                    config=types.GenerateContentConfig(
                        temperature=a["temperature"],
                        max_output_tokens=a["max_output_tokens"],
                    ),
                )
                AIService._debug_response(resp)
                txt = (getattr(resp, "text", "") or "").strip()
                if txt:
                    return txt
            except ClientError as e:
                last_error = e
                if "RESOURCE_EXHAUSTED" in str(e) or getattr(e, "status_code", None) == 429:
                    time.sleep(0.9)
                    continue
                break
            except Exception as e:
                last_error = e
                break
        
        if last_error:
            print("[LLM] error:", repr(last_error))
        return "Thanks. What was the biggest technical challenge you faced, and how did you handle it?"
