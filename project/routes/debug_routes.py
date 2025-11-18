"""Debug and testing routes."""
import traceback
from flask import Blueprint, request, jsonify

from services.ai_service import AIService, genai_client, GEMINI_MODEL, USE_VERTEX
from google.genai import types

debug_bp = Blueprint('debug', __name__)

@debug_bp.route('/api/debug_gemini', methods=['GET'])
def debug_gemini():
    """Test Gemini connection."""
    try:
        resp = genai_client.models.generate_content(
            model=GEMINI_MODEL,
            contents="Say OK.",
            config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=10),
        )
        txt = (getattr(resp, "text", "") or "").strip()
        return jsonify({
            "ok": True,
            "model": GEMINI_MODEL,
            "text": txt,
            "mode": "vertex" if USE_VERTEX == "1" else "aistudio"
        }), 200
    except Exception as e:
        return jsonify({"ok": False, "model": GEMINI_MODEL, "error": str(e)}), 500

# Gap analysis endpoints removed
