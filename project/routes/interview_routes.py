"""Main interview API routes."""
import os
import time
import hashlib
from flask import Blueprint, request, jsonify
import re

from models.interview_state import interview_state
from services.document_parser import extract_text
from services.speech_service import SpeechService
from services.ai_service import AIService
from services.feedback_service import FeedbackService
from prompts.system_prompts import SYSTEM_PROMPT
from config.settings import GEMINI_MODEL

interview_bp = Blueprint('interview', __name__)

def build_conversation_prompt(prompt_text: str) -> str:
    """Build full conversation prompt."""
    messages = [SYSTEM_PROMPT]
    if interview_state.context:
        messages.append(f"\n{interview_state.context}\n")
    messages.append("=== CONVERSATION ===")
    for turn in interview_state.conversation[-6:]:
        messages.append(f"{turn['role'].upper()}: {turn['text']}")
    messages.append(f"\n{prompt_text}")
    return "\n".join(messages)

@interview_bp.route('/api/set_context', methods=['POST'])
def set_context():
    """Set interview context (resume and job description)."""
    data = request.get_json(silent=True) or {}
    resume = data.get("resume", "")
    job = data.get("job", "")
    interview_state.context = f"=== RESUME ===\n{resume.strip()}\n\n=== JOB DESCRIPTION ===\n{job.strip()}"
    interview_state.conversation = []
    return jsonify({"ok": True, "message": "Context set."})

@interview_bp.route('/api/upload_documents', methods=['POST'])
def upload_documents():
    """Accept resume/job files and set context based on their contents.
    Attempts best-effort text extraction; falls back to filename and size.
    """
    try:
        resume_text = ""
        job_text = ""

        if 'resume' in request.files:
            f = request.files['resume']
            raw = f.read() or b""
            resume_text = extract_text(raw, getattr(f, 'filename', '')) or ""
            if not resume_text:
                resume_text = f"[Uploaded resume: {getattr(f, 'filename', 'unknown')} ({len(raw)} bytes)]"

        if 'job' in request.files:
            f = request.files['job']
            raw = f.read() or b""
            job_text = extract_text(raw, getattr(f, 'filename', '')) or ""
            if not job_text:
                job_text = f"[Uploaded job description: {getattr(f, 'filename', 'unknown')} ({len(raw)} bytes)]"

        interview_state.context = f"=== RESUME ===\n{resume_text.strip()}\n\n=== JOB DESCRIPTION ===\n{job_text.strip()}"
        interview_state.conversation = []

        return jsonify({
            "ok": True,
            "resume_bytes": len(resume_text.encode('utf-8', errors='ignore')) if resume_text else 0,
            "job_bytes": len(job_text.encode('utf-8', errors='ignore')) if job_text else 0
        }), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@interview_bp.route('/api/start_interview', methods=['POST'])
def start_interview():
    """Start the interview with specified duration."""
    try:
        data = request.get_json(silent=True) or {}
        minutes = int(data.get("minutes") or 15)
        interview_state.start_timer(minutes)
        return jsonify({"ok": True, "minutes": minutes}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

@interview_bp.route('/api/next_question', methods=['POST'])
def next_question():
    """Get the next interview question."""
    try:
        prompt = ("Start the interview with a warm greeting and your first question. Be brief."
                  if len(interview_state.conversation) == 0 else
                  "Ask the next relevant interview question. One sentence only.")
        
        if interview_state.time_up():
            interview_state.finished = True
            wrap = "Time is up. Thanks for the conversation — I'll prepare your feedback now."
            interview_state.conversation.append({"role": "assistant", "text": wrap})
            try:
                audio_url = SpeechService.synthesize_speech(wrap)
            except Exception:
                audio_url = None
            return jsonify({"ok": True, "question": wrap, "audio": audio_url, "finished": True}), 200
        
        full_prompt = build_conversation_prompt(prompt)
        question = (AIService.generate_content(full_prompt, max_tokens=400) or "").strip()
        if not question:
            question = "Could you tell me about your most recent project?"
        bad_short = (len(question.split()) < 5) or (re.match(r"^(thanks|sorry|okay|that'?s|fine)[^a-z]*\??$", question.lower().strip()) is not None)
        if bad_short:
            try:
                strict_prompt = build_conversation_prompt(
                    "Ask the next relevant interview question. One sentence only. Avoid filler words. End with '?'"
                )
                q2 = AIService.generate_content(strict_prompt, temperature=0.3, max_tokens=400)
                question = (q2 or question or "Could you tell me about your most recent project?").strip()
            except Exception:
                pass
        if (len(question.split()) < 5) or (re.match(r"^(thanks|sorry|okay|that'?s|fine)[^a-z]*\??$", question.lower().strip()) is not None):
            question = "Could you tell me about your most recent project?"
        if "?" not in question:
            question = question.rstrip(".! ") + "?"
        
        interview_state.conversation.append({"role": "assistant", "text": question})
        interview_state.last_question = question
        
        try:
            audio_url = SpeechService.synthesize_speech(question)
            interview_state.turn_counter += 1
            audio_id = None
            if audio_url:
                m = hashlib.sha1(audio_url.encode("utf-8")).hexdigest()
                interview_state.last_audio_sha1 = m
                audio_id = m
            return jsonify({
                "ok": True,
                "question": question,
                "audio": audio_url,
                "turn_id": interview_state.turn_counter,
                "audio_id": audio_id
            }), 200
        except Exception as e:
            print("[TTS] /api/next_question:", e)
            return jsonify({"ok": True, "question": question, "audio": None, "warn": str(e)}), 200
    
    except Exception as e:
        print(f"!!! ERROR in /api/next_question: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500

@interview_bp.route('/api/voice_turn', methods=['POST'])
def voice_turn():
    """Handle voice input from candidate."""
    try:
        if "audio" not in request.files:
            return jsonify({"ok": False, "stage": "upload", "error": "No audio file"}), 400
        
        blob = request.files["audio"]
        audio_bytes = blob.read() or b""
        print(f"[VOICE_TURN] upload bytes={len(audio_bytes)} name={getattr(blob, 'filename', '')}")
        if not audio_bytes:
            return jsonify({"ok": False, "stage": "upload", "error": "Empty audio upload"}), 400
        print("[VOICE_TURN] sha1=", hashlib.sha1(audio_bytes).hexdigest()[:12])
        
        # STT
        try:
            hint = getattr(blob, 'filename', None) or getattr(blob, 'mimetype', None) or None
            user_text = SpeechService.transcribe_audio(audio_bytes, filename_hint=hint)
        except Exception as e:
            print("[STT] exception:", e)
            user_text = ""
        
        print("[STT] transcript:", repr(user_text))
        if len(user_text) < 3:
            user_text = ""
        else:
            # Detect spelled-letter transcripts like "s u b o d h" and treat as empty
            toks = user_text.strip().split()
            single_letters = sum(1 for t in toks if len(t) == 1 and t.isalpha())
            if toks and single_letters >= max(4, int(0.6 * len(toks))):
                user_text = ""
        
        interview_state.conversation.append({"role": "user", "text": user_text})
        
        # Gap analysis removed
        
        if interview_state.time_up():
            interview_state.finished = True
            wrap = "Time is up. Thank you — I'll generate your feedback now."
            interview_state.conversation.append({"role": "assistant", "text": wrap})
            try:
                audio_url = SpeechService.synthesize_speech(wrap)
            except Exception:
                audio_url = None
            return jsonify({"ok": True, "user_text": user_text, "assistant_text": wrap,
                            "assistant_audio": audio_url, "finished": True}), 200
        
        try:
            lt = (user_text or "").strip().lower()
            force_next = (len(user_text) < 3) or ("next question" in lt) or ("go to next" in lt) or ("move on" in lt) or ("skip" in lt) or ("ask next" in lt)
            if force_next:
                prompt = build_conversation_prompt(
                    "Ask the next relevant interview question. One sentence only. End with '?'"
                )
                assistant_text = AIService.generate_content(prompt, temperature=0.3, max_tokens=400)
            else:
                prompt = build_conversation_prompt(
                    "Respond briefly to the candidate's answer and ask your next question. One sentence only."
                )
                assistant_text = AIService.generate_content(prompt, max_tokens=300)
        except Exception as e:
            print("[LLM] exception:", e)
            return jsonify({"ok": False, "stage": "llm", "error": str(e)}), 500
        
        assistant_text = (assistant_text or "").strip()
        if not assistant_text or ("?" not in assistant_text):
            try:
                prompt2 = build_conversation_prompt(
                    "Ask the next relevant interview question. One sentence only. End with '?'"
                )
                q = AIService.generate_content(prompt2, temperature=0.3, max_tokens=400)
                assistant_text = (q or assistant_text or "Could you tell me about your most recent project?").strip()
            except Exception:
                if not assistant_text:
                    assistant_text = "Could you tell me about your most recent project?"
        bad_short = (len(assistant_text.split()) < 5) or (re.match(r"^(thanks|sorry|okay|that'?s|fine)[^a-z]*\??$", assistant_text.lower().strip()) is not None)
        if bad_short:
            try:
                prompt3 = build_conversation_prompt(
                    "Ask a clear, specific interview question. One sentence only. Avoid filler words. End with '?'"
                )
                q2 = AIService.generate_content(prompt3, temperature=0.3, max_tokens=400)
                assistant_text = (q2 or assistant_text or "Could you tell me about your most recent project?").strip()
            except Exception:
                pass
        # Final guard: if still too short or filler, force a safe question
        if (len(assistant_text.split()) < 5) or (re.match(r"^(thanks|sorry|okay|that'?s|fine)[^a-z]*\??$", assistant_text.lower().strip()) is not None):
            assistant_text = "Could you tell me about your most recent project?"
        if "?" not in assistant_text:
            assistant_text = assistant_text.rstrip(".! ") + "?"
        
        interview_state.conversation.append({"role": "assistant", "text": assistant_text})
        try:
            interview_state.last_question = assistant_text
        except Exception:
            pass
        print("[LLM] reply:", repr(assistant_text))
        
        try:
            audio_url = SpeechService.synthesize_speech(assistant_text)
            interview_state.turn_counter += 1
            audio_id = None
            if audio_url:
                m = hashlib.sha1(audio_url.encode("utf-8")).hexdigest()
                interview_state.last_audio_sha1 = m
                audio_id = m
        except Exception as e:
            print("[TTS] exception:", e)
            return jsonify({"ok": False, "stage": "tts", "error": str(e)}), 500
        
        return jsonify({
            "ok": True,
            "user_text": user_text,
            "assistant_text": assistant_text,
            "assistant_audio": audio_url,
            "turn_id": interview_state.turn_counter,
            "audio_id": audio_id
        }), 200
    
    except Exception as e:
        print("[VOICE_TURN] unhandled:", e)
        return jsonify({"ok": False, "stage": "unknown", "error": str(e)}), 500

@interview_bp.route('/api/finish', methods=['POST'])
def finish():
    """Mark interview as finished."""
    interview_state.finished = True
    return jsonify({"ok": True, "message": "Interview marked finished."}), 200

@interview_bp.route('/api/status', methods=['GET'])
def status():
    """Get interview status."""
    coding_remaining = None
    if interview_state.coding_active and interview_state.coding_end_at:
        coding_remaining = max(0, interview_state.coding_end_at - int(time.time()))
    return jsonify({
        "ok": True,
        "remaining_sec": interview_state.remaining_seconds(),
        "finished": interview_state.finished or interview_state.time_up(),
        "coding_active": bool(interview_state.coding_active),
        "coding_remaining": coding_remaining
    }), 200

@interview_bp.route('/api/feedback', methods=['POST'])
def feedback():
    """Generate interview feedback."""
    try:
        feedback_text = FeedbackService.generate_feedback(
            interview_state.conversation,
            interview_state.context
        ).strip()
        
        try:
            os.makedirs("static/feedback", exist_ok=True)
            dt_str = time.strftime("%Y-%m-%d_%H-%M-%S", time.localtime())
            fname = f"feedback_{dt_str}.txt"
            fpath = os.path.join("static/feedback", fname)
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(feedback_text)
            saved = f"/feedback/{fname}"
        except Exception as e:
            print("[FEEDBACK] save error:", e)
            saved = None
        
        spoken_summary = None
        try:
            short_readout = feedback_text.split("\n\n", 1)[0][:600]
            spoken_summary = SpeechService.synthesize_speech(short_readout)
        except Exception as e:
            print("[FEEDBACK] TTS error:", e)
        
        import re
        def _extract_rating(text, heading, pattern):
            try:
                m = re.search(pattern, text, flags=re.IGNORECASE|re.DOTALL)
                if m:
                    v = int(m.group(1))
                    if 0 <= v <= 10:
                        return v
            except Exception:
                pass
            return None
        comm = _extract_rating(feedback_text, "Communication & Clarity", r"Communication\s*&\s*Clarity[\s\S]*?Rating:\s*(\d+)/10")
        tech = _extract_rating(feedback_text, "Technical Depth & Problem-Solving", r"Technical\s*Depth\s*&\s*Problem\s*-\s*Solving[\s\S]*?Rating:\s*(\d+)/10")
        overall = _extract_rating(feedback_text, "Overall Rating", r"Overall\s*Rating[\s\S]*?Overall:\s*(\d+)/10")
        scores = {
            "communication": comm,
            "technical": tech,
            "problem_solving": tech,
            "job_fit": overall,
            "overall": overall,
        }
        return jsonify({
            "ok": True,
            "feedback": feedback_text,
            "saved_path": saved,
            "spoken_summary": spoken_summary,
            "scores": scores
        }), 200
    except Exception as e:
        print("[/api/feedback] error:", e)
        return jsonify({"ok": False, "error": str(e)}), 500

@interview_bp.route('/api/set_voice', methods=['POST', 'GET'])
def set_voice():
    """Set TTS voice."""
    try:
        data = request.get_json(silent=True) or {}
        voice = data.get("voice") or request.args.get("voice") or request.form.get("voice")
        if not voice:
            return jsonify({"ok": False, "error": "Missing 'voice' in body"}), 400
        # Update config (you'll need to modify this to properly update the voice)
        from config import settings
        settings.VOICE_NAME = str(voice)
        print(f"[VOICE] set VOICE_NAME = {voice}")
        return jsonify({"ok": True, "voice": voice}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@interview_bp.route('/api/get_voice', methods=['GET'])
def get_voice():
    """Get current TTS voice."""
    from config import settings
    return jsonify({"ok": True, "voice": settings.VOICE_NAME}), 200

@interview_bp.route('/api/list_voices', methods=['GET'])
def list_voices():
    """List available Google Studio voices (names only)."""
    try:
        names = SpeechService.list_studio_voice_names()
        return jsonify({"ok": True, "voices": names}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
