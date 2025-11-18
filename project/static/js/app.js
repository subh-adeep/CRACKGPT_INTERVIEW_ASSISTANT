/**
 * Main Application
 * Orchestrates all modules and UI interactions
 */

// Global state
let running = false;
let lastTurnIdPlayed = 0;
let lastAudioIdPlayed = null;
let firstQBusy = false;

// DOM elements
const logEl = document.getElementById('log');
const toggleBtn = document.getElementById('toggle');
const resumeEl = document.getElementById('resume');
const jobEl = document.getElementById('job');
const countdownEl = document.getElementById('countdown');
const codeArea = document.getElementById('codeArea');
const codingTimerLbl = document.getElementById('codingTimer');
const submitCodeBtn = document.getElementById('submitCode');

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  AudioManager.init();
  setupEventListeners();
  initializeVoiceSelector();
});

/**
 * Add message to conversation log
 */
function addMsg(role, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'user' : role === 'status' ? 'status' : 'assistant');
  div.textContent = (role === 'user' ? 'You: ' : role === 'status' ? '⏱ ' : 'Assistant: ') + text;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Context save
  document.getElementById('saveCtx').onclick = async () => {
    try {
      const data = await API.setContext(resumeEl.value || '', jobEl.value || '');
      addMsg('assistant', data.ok ? 'Context saved.' : (data.error || 'Failed to set context.'));
    } catch (e) {
      addMsg('assistant', 'Failed to set context: ' + e.message);
    }
  };

  // First question
  document.getElementById('firstQ').onclick = async () => {
    if (firstQBusy) return;
    firstQBusy = true;
    document.getElementById('firstQ').disabled = true;

    try {
      const data = await API.getNextQuestion();
      if (data.ok) {
        if (data.question) addMsg('assistant', data.question);
        if (data.audio && data.audio_id !== lastAudioIdPlayed) {
          lastAudioIdPlayed = data.audio_id;
          await AudioManager.playAudio(data.audio);
          lastTurnIdPlayed = data.turn_id || lastTurnIdPlayed;
        }
        if (running && !AudioManager.isPlaying) listenTurn();
      } else {
        addMsg('assistant', data.error || 'Failed to generate question.');
      }
    } catch (e) {
      addMsg('assistant', 'Failed to request question: ' + e.message);
    } finally {
      firstQBusy = false;
      document.getElementById('firstQ').disabled = false;
    }
  };

  // Toggle conversation
  toggleBtn.onclick = () => running ? stopConversation() : startConversation();

  // Finish interview
  document.getElementById('finishNow').onclick = async () => {
    try {
      await API.finishInterview();
      stopConversation();
      addMsg('assistant', 'Interview ended. Generating feedback…');
      await generateFeedback();
    } catch (e) {
      addMsg('assistant', 'Failed to finish: ' + e.message);
    }
  };

  // Keyboard shortcut (Space)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;

    const t = e.target;
    const typing = (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) ||
                   document.activeElement === codeArea ||
                   CodingManager.isActive();

    if (typing) return;
    e.preventDefault();
    running ? stopConversation() : startConversation();
  });

  // Coding buttons
  setupCodingListeners();
}

/**
 * Setup coding-related listeners
 */
function setupCodingListeners() {
  document.getElementById('startCoding').onclick = async () => {
    try {
      const data = await API.startCoding();
      if (!data.ok) {
        addMsg('assistant', data.error || 'Failed to start coding');
        return;
      }

      addMsg('assistant', `Coding window started. You have ${TimerManager.formatTime(data.remaining_sec)}. Main timer paused.`);
      
      CodingManager.setActive(true);
      CodingManager.startCountdown(
        data.remaining_sec || 300,
        (sec) => {
          codingTimerLbl.textContent = '🧩 ' + TimerManager.formatTime(sec);
        },
        async () => {
          addMsg('assistant', 'Coding time ended. Auto-submitting...');
          codingTimerLbl.textContent = '🧩 0:00';
          
          try {
            const statusData = await API.getCodingStatus();
            if (statusData.ok && statusData.timed_out) {
              if (statusData.assistant_text) addMsg('assistant', statusData.assistant_text);
              if (statusData.assistant_audio) await AudioManager.playAudio(statusData.assistant_audio);
              submitCodeBtn.disabled = true;
              running = true;
              listenTurn();
            }
          } catch (e) {
            running = true;
            listenTurn();
          }
        }
      );

      submitCodeBtn.disabled = false;
      codeArea?.focus();
      stopListening();
      running = false;
    } catch (e) {
      addMsg('assistant', 'Failed to initiate coding: ' + e.message);
    }
  };

  submitCodeBtn.onclick = async () => {
    try {
      const code = codeArea.value || '';
      const data = await API.submitCode(code, 'text');
      
      if (!data.ok) {
        addMsg('assistant', data.error || 'Failed to submit code');
        return;
      }

      if (data.assistant_text) addMsg('assistant', data.assistant_text);
      if (data.assistant_audio) await AudioManager.playAudio(data.assistant_audio);

      CodingManager.stopCountdown();
      CodingManager.setActive(false);
      submitCodeBtn.disabled = true;
      codingTimerLbl.textContent = '🧩 —:—';

      running = true;
      if (!AudioManager.isPlaying) listenTurn();
    } catch (e) {
      addMsg('assistant', 'Submit failed: ' + e.message);
    }
  };
}

/**
 * Initialize voice selector
 */
async function initializeVoiceSelector() {
  const voiceSelect = document.getElementById('voiceSelect');
  if (!voiceSelect) return;

  // Load current voice
  try {
    const data = await API.getVoice();
    if (data.ok && data.voice) voiceSelect.value = data.voice;
  } catch (e) {
    console.error('Failed to load voice setting:', e);
  }

  // Handle voice change
  voiceSelect.onchange = async () => {
    try {
      const data = await API.setVoice(voiceSelect.value);
      addMsg('assistant', data.ok ? `Voice set to ${data.voice}` : (data.error || 'Failed to set voice'));
    } catch (e) {
      addMsg('assistant', 'Failed to set voice: ' + e.message);
    }
  };
}

/**
 * Start conversation loop
 */
async function startConversation() {
  if (CodingManager.isActive()) return;
  if (TimerManager.finished) TimerManager.reset();

  running = true;
  toggleBtn.textContent = '⏸️ Stop Conversation';

  await AudioManager.unlockAudio();

  // Start interview timer
  try {
    const minutes = parseInt(document.getElementById('duration').value || '15', 10);
    await API.startInterview(minutes);
    
    TimerManager.startStatusPolling(
      (data) => {
        countdownEl.textContent = `⏳ ${TimerManager.formatTime(data.remaining_sec)}`;
      },
      async () => {
        stopConversation();
        addMsg('assistant', 'Time is up. Generating feedback…');
        await generateFeedback();
      }
    );
  } catch (e) {
    addMsg('assistant', 'Failed to start timer: ' + e.message);
    return;
  }

  // Ask first question if no conversation yet
  const hasAssistantMsg = [...logEl.children].some(n => n.classList.contains('assistant'));
  if (!hasAssistantMsg) {
    document.getElementById('firstQ').click();
  } else if (!AudioManager.isPlaying) {
    listenTurn();
  }
}

/**
 * Stop conversation loop
 */
function stopConversation() {
  running = false;
  toggleBtn.textContent = '▶️ Start Conversation';
  stopListening();
}

/**
 * Listen for user speech
 */
async function listenTurn() {
  if (!running || AudioManager.isPlaying) return;

  try {
    await AudioManager.getMicrophone();
    addMsg('status', '🎤 Listening… speak now');

    await AudioManager.initVAD(
      // onSpeechStart
      () => {
        AudioManager.startRecording(null, onRecordingStop);
      },
      // onSpeechEnd
      () => {
        setTimeout(() => {
          AudioManager.stopRecording();
        }, 500);
      }
    );

    AudioManager.startVAD();
  } catch (e) {
    addMsg('assistant', e.message);
  }
}

/**
 * Stop listening
 */
function stopListening() {
  AudioManager.pauseVAD();
  AudioManager.stopRecording();
}

/**
 * Handle recording stop
 */
async function onRecordingStop() {
  AudioManager.pauseVAD();

  const audioBlob = AudioManager.getAudioBlob();
  if (!audioBlob) {
    addMsg('status', 'No audio captured, listening again...');
    if (running && !AudioManager.isPlaying) setTimeout(listenTurn, 500);
    return;
  }

  try {
    const data = await API.submitVoiceTurn(audioBlob);

    if (!data.ok) {
      addMsg('assistant', data.error || 'Voice turn failed.');
      if (running && !AudioManager.isPlaying) setTimeout(listenTurn, 500);
      return;
    }

    // Handle finished interview
    if (data.finished) {
      TimerManager.finished = true;
      if (data.user_text) addMsg('user', data.user_text);
      if (data.assistant_text) addMsg('assistant', data.assistant_text);
      if (data.assistant_audio) await AudioManager.playAudio(data.assistant_audio);
      stopConversation();
      addMsg('assistant', 'Generating feedback…');
      await generateFeedback();
      return;
    }

    // Display conversation
    if (data.user_text) addMsg('user', data.user_text);
    if (data.assistant_text) addMsg('assistant', data.assistant_text);
    
    // Play audio response
    if (data.assistant_audio && data.audio_id !== lastAudioIdPlayed) {
      lastAudioIdPlayed = data.audio_id;
      await AudioManager.playAudio(data.assistant_audio);
      lastTurnIdPlayed = data.turn_id || lastTurnIdPlayed;
    }

    // Continue listening
    if (running && !AudioManager.isPlaying) setTimeout(listenTurn, 300);
  } catch (err) {
    addMsg('assistant', 'Error processing audio: ' + err.message);
    if (running && !AudioManager.isPlaying) setTimeout(listenTurn, 500);
  }
}

/**
 * Generate and display feedback
 */
async function generateFeedback() {
  try {
    const data = await API.getFeedback();
    if (data.ok) {
      addMsg('assistant', '📋 Feedback ready. See below:');
      addMsg('assistant', data.feedback);
      if (data.spoken_summary) await AudioManager.playAudio(data.spoken_summary);
    } else {
      addMsg('assistant', data.error || 'Failed to generate feedback.');
    }
  } catch (e) {
    addMsg('assistant', 'Failed to fetch feedback: ' + e.message);
  }
}
