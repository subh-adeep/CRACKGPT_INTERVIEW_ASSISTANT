"""Feedback generation service."""
import os
import re
from google.genai import types

from services.ai_service import genai_client, GEMINI_MODEL
from prompts.system_prompts import FEEDBACK_SYSTEM

class FeedbackService:
    """Handles feedback generation."""
    
    @staticmethod
    def generate_feedback(conversation: list, context: str) -> str:
        """Generate interview feedback from conversation."""
        if not conversation:
            return "No conversation captured. Please run an interview before requesting feedback."
        
        transcript_lines = []
        for turn in conversation:
            role = "Interviewer" if turn["role"] == "assistant" else "Candidate"
            text = (turn.get("text") or "").strip()
            if text:
                transcript_lines.append(f"{role}: {text}")
        transcript = "\n".join(transcript_lines)
        
        prompt = f"""{FEEDBACK_SYSTEM}

=== CONTEXT ===
{context if context else "(No resume/JD provided)"}

=== TRANSCRIPT (chronological) ===
{transcript}

Now produce the feedback in the required sections and headings.
"""
        
        model_name = os.getenv("GEMINI_FEEDBACK_MODEL", GEMINI_MODEL)
        try:
            resp = genai_client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(temperature=0.3, max_output_tokens=1200),
            )
            txt = (getattr(resp, "text", "") or "").strip()
            # Normalize feedback output header
            if txt:
                txt = re.sub(r'^(?:\s*AI\s*Feedback\s*[\r\n]+){1,}', 'AI Feedback\n\n', txt, flags=re.IGNORECASE)
                if not txt.lower().lstrip().startswith('ai feedback'):
                    txt = 'AI Feedback\n\n' + txt
            return txt or "Feedback generation returned empty text."
        except Exception as e:
            print("[FEEDBACK] error:", e)
            return f"Failed to generate feedback: {e}"
