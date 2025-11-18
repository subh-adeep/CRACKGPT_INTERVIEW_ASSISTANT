"""Coding window API routes."""
import time
from flask import Blueprint, request, jsonify

from models.interview_state import interview_state
from services.speech_service import SpeechService
from services.ai_service import AIService
from config.settings import CODING_EXPIRES_AFTER_SEC

coding_bp = Blueprint('coding', __name__)

@coding_bp.route('/api/start_coding', methods=['POST'])
def start_coding():
    """Start the coding window."""
    if interview_state.finished or interview_state.time_up():
        return jsonify({"ok": False, "error": "Interview already finished."}), 400
    
    now = int(time.time())
    if interview_state.coding_active and interview_state.coding_end_at:
        # already active: return remaining
        return jsonify({"ok": True, "coding_active": True,
                        "remaining_sec": max(0, interview_state.coding_end_at - now)}), 200
    
    interview_state.coding_active = True
    interview_state.coding_end_at = now + CODING_EXPIRES_AFTER_SEC
    interview_state.pause_timer()
    return jsonify({"ok": True, "coding_active": True,
                    "remaining_sec": CODING_EXPIRES_AFTER_SEC}), 200

@coding_bp.route('/api/submit_code', methods=['POST'])
def submit_code():
    """Submit code from coding window."""
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    lang = data.get("lang", "text")
    interview_state.coding_submission = {"code": code, "lang": lang, "time": int(time.time())}
    
    # close coding window & resume main timer
    interview_state.coding_active = False
    interview_state.coding_end_at = None
    interview_state.resume_timer()
    
    # Make the submission visible to feedback
    interview_state.conversation.append({"role": "user", "text": f"[Coding submission attached: {len(code)} chars]"})
    
    # Generate brief acknowledgement + reflective follow-up
    try:
        snippet = code[:800]
        prompt = f"""
You are an interviewing engineer. The candidate just submitted code.

Goal (STRICT):
1) Give a short, positive acknowledgement (max 1 sentence).
2) Look at the code and *briefly* mention the approach you see (e.g., "I see you're using a hash map..." or "...using two pointers.").
3) Ask ONE reflective follow-up about *that* approach (e.g., "Why did you choose that?" or "What's the complexity of this method?").
4) Do NOT provide a solution or say if it's "correct". Keep the total response under 50 words.

Context:
{interview_state.context if interview_state.context else "(No context)"}

Recent conversation (last few turns):
{chr(10).join(f"{'Interviewer' if t['role']=='assistant' else 'Candidate'}: {t['text']}" for t in interview_state.conversation[-6:])}

Candidate submission (truncated):
"""
        assistant_text = AIService.generate_content(prompt + snippet, temperature=0.4, max_tokens=120)
        if not assistant_text:
            assistant_text = "Nice work — most of your approach looks sensible. Briefly explain your complexity and any edge cases you considered."
    except Exception as e:
        print("[SUBMIT_CODE] LLM error:", e)
        assistant_text = "Nice work — most of your approach looks sensible. Why did you choose this approach over alternatives?"
    
    # record and TTS
    interview_state.conversation.append({"role": "assistant", "text": assistant_text})
    interview_state.last_question = assistant_text
    
    audio_url = None
    try:
        audio_url = SpeechService.synthesize_speech(assistant_text)
    except Exception as e:
        print("[SUBMIT_CODE] TTS error:", e)
    
    return jsonify({
        "ok": True,
        "message": "Code received.",
        "assistant_text": assistant_text,
        "assistant_audio": audio_url
    }), 200

@coding_bp.route('/api/coding_status', methods=['GET'])
def coding_status():
    """Get coding window status."""
    now = int(time.time())
    if interview_state.coding_active and interview_state.coding_end_at:
        remaining = max(0, interview_state.coding_end_at - now)
        if remaining == 0:
            # auto-close & resume main timer
            interview_state.coding_active = False
            interview_state.coding_end_at = None
            interview_state.resume_timer()
            
            # LLM: brief encouragement + reflective follow-up
            try:
                prompt = f"""
You are an interviewing engineer. The 5-minute coding window ended (timeout).

Goal (STRICT):
1) Short, kind acknowledgement (max 1 sentence).
2) Ask ONE reflective follow-up (max 1 sentence) about complexity/edge cases/improvements.
3) No solutions. < 60 words total.

Context:
{interview_state.context if interview_state.context else "(No context)"}

Recent conversation (last few turns):
{chr(10).join(f"{'Interviewer' if t['role']=='assistant' else 'Candidate'}: {t['text']}" for t in interview_state.conversation[-6:])}
"""
                follow = AIService.generate_content(prompt, temperature=0.4, max_tokens=90)
                if not follow:
                    follow = "Time's up — thanks for attempting it. In brief, what's the complexity and which edge cases would you test?"
            except Exception as e:
                print("[CODING_STATUS] LLM error:", e)
                follow = "Time's up — thanks for attempting it. What complexity do you expect and which edge cases would you test?"
            
            interview_state.conversation.append({"role": "assistant", "text": follow})
            interview_state.last_question = follow
            
            audio_url = None
            try:
                audio_url = SpeechService.synthesize_speech(follow)
            except Exception as e:
                print("[CODING_STATUS] TTS error:", e)
            
            return jsonify({"ok": True, "coding_active": False, "timed_out": True,
                            "assistant_text": follow, "assistant_audio": audio_url}), 200
        
        return jsonify({"ok": True, "coding_active": True, "remaining_sec": remaining}), 200
    
    return jsonify({"ok": True, "coding_active": False}), 200
