/**
 * API Communication Module
 * Handles all backend API calls
 */

const API = {
  /**
   * Generic POST request helper
   */
  async postJSON(url, payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  },

  /**
   * Save interview context (resume + job description)
   */
  async setContext(resume, job) {
    return this.postJSON('/api/set_context', { resume, job });
  },

  /**
   * Start interview timer
   */
  async startInterview(minutes) {
    return this.postJSON('/api/start_interview', { minutes });
  },

  /**
   * Get next interview question
   */
  async getNextQuestion() {
    const res = await fetch('/api/next_question', { method: 'POST' });
    return res.json();
  },

  /**
   * Submit voice recording
   */
  async submitVoiceTurn(audioBlob) {
    const form = new FormData();
    const ext = (audioBlob.type || '').split('/')[1] || 'webm';
    const safeExt = ext.split(';')[0];
    form.append('audio', audioBlob, 'turn.' + safeExt);
    const res = await fetch('/api/voice_turn', { method: 'POST', body: form });
    return res.json();
  },

  /**
   * Get interview status
   */
  async getStatus() {
    const res = await fetch('/api/status');
    return res.json();
  },

  /**
   * Mark interview as finished
   */
  async finishInterview() {
    return this.postJSON('/api/finish', {});
  },

  /**
   * Generate feedback
   */
  async getFeedback() {
    const res = await fetch('/api/feedback', { method: 'POST' });
    return res.json();
  },

  /**
   * Set TTS voice
   */
  async setVoice(voice) {
    return this.postJSON('/api/set_voice', { voice });
  },

  /**
   * Get current TTS voice
   */
  async getVoice() {
    const res = await fetch('/api/get_voice');
    return res.json();
  },

  /**
   * Start coding window
   */
  async startCoding() {
    const res = await fetch('/api/start_coding', { method: 'POST' });
    return res.json();
  },

  /**
   * Submit code
   */
  async submitCode(code, lang = 'text') {
    return this.postJSON('/api/submit_code', { code, lang });
  },

  /**
   * Get coding status
   */
  async getCodingStatus() {
    const res = await fetch('/api/coding_status');
    return res.json();
  }
};
