document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const interviewVideo = document.getElementById('interviewVideo');
    const overlay = document.getElementById('overlay');
    const audioPlayer = document.getElementById('audioPlayer');
    const finishBtn = document.getElementById('finishBtn');
    const timeRemaining = document.getElementById('timeRemaining');
    const statusText = document.getElementById('statusText');
    const soundIcon = document.getElementById('soundIcon');
    const audioLevel = document.getElementById('audioLevel');
    const audioBars = document.querySelectorAll('.audio-bar-compact');

    // Audio context for voice input
    let voiceAudioContext = null;
    let voiceMediaRecorder = null;
    let voiceAudioChunks = [];

    // Interview state
    let interviewStarted = false;
    let currentQuestion = null;
    let recording = false;
    let paused = false;
    let timerInterval = null;
    let remainingSeconds = 15 * 60; // 15 minutes default
    let audioContext = null;
    let analyser = null;
    let microphone = null;

    // Initialize interview
    initializeInterview();

    async function initializeInterview() {
        try {
            // Update status text
            statusText.textContent = 'Initializing...';

            overlay.style.display = 'none';
            statusText.textContent = 'Preparing interview...';

            try {
                // Start camera for interview with microphone access
                await startInterviewCamera();

                // Initialize audio monitoring for visual feedback
                initializeAudioMonitoring();

                // Initialize VAD for speech detection
                try {
                    console.log('Initializing Voice Activity Detection...');
                    await AudioManager.initVAD();
                    window.VAD_INITIALIZED = true;
                    console.log('VAD initialized successfully');
                } catch (error) {
                    console.warn('VAD initialization failed, audio features limited:', error);
                    window.VAD_INITIALIZED = false;
                }

                // Proceed with interview setup
                startInterviewSetup();
            } catch (innerError) {
                console.error('Failed to initialize audio/camera:', innerError);
                statusText.textContent = 'Media access failed';
            }

        } catch (error) {
            console.error('Failed to initialize interview:', error);
            statusText.textContent = 'Failed to start interview';
        }
    }

    async function startInterviewCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240 }, // Smaller for corner preview
                audio: true
            });

            interviewVideo.srcObject = stream;
            statusText.textContent = 'Camera ready';

            console.log('Camera started for interview');

        } catch (error) {
            console.error('Camera access failed:', error);
            statusText.textContent = 'Camera access required';
        }
    }

    async function startInterviewSetup() {
        try {
            // First, ensure we have context from uploaded documents
            await ensureContextIsLoaded();

            // Start interview timer
            const startResponse = await fetch('/api/start_interview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ minutes: 15 })
            });

            if (!startResponse.ok) {
                throw new Error('Failed to start interview timer');
            }

            console.log('Interview timer started successfully');

            // Start status polling
            startStatusPolling();

            // Get first question and start listening
            await getFirstQuestion();

        } catch (error) {
            console.error('Interview setup failed:', error);
            statusText.textContent = 'Failed to start interview';
        }
    }

    function startStatusPolling() {
        const statusInterval = setInterval(async () => {
            try {
                const statusResponse = await fetch('/api/status');
                const data = await statusResponse.json();

                if (data.ok) {
                    // Update timer
                    if (data.remaining_sec !== undefined) {
                        timeRemaining.textContent = formatTime(data.remaining_sec);

                        if (data.remaining_sec <= 0) {
                            clearInterval(statusInterval);
                            finishInterview();
                        }
                    }

                    // Handle coding status if needed
                    if (data.coding_active) {
                        const codingSec = data.coding_remaining || 0;
                        if (codingSec <= 0) {
                            // Handle coding time up
                        }
                    }
                }
            } catch (error) {
                console.error('Status polling error:', error);
            }
        }, 2000); // Poll every 2 seconds
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    async function ensureContextIsLoaded() {
        try {
            console.log('Ensuring interview context is loaded...');

            // Check if context exists by trying to get it from localStorage or session
            const storedDocuments = localStorage.getItem('uploadedDocuments');
            if (storedDocuments) {
                const docs = JSON.parse(storedDocuments);
                console.log('Found stored documents, setting context directly:', docs);

                // Set context directly using stored document content
                const resumeText = docs.resume ? docs.resume.content : '';
                const jobText = docs.job ? docs.job.content : '';

                // Use the set_context API to directly set the interview context
                const contextResponse = await fetch('/api/set_context', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        resume: resumeText,
                        job: jobText
                    })
                });

                if (contextResponse.ok) {
                    console.log('Context successfully set from stored documents');
                } else {
                    console.error('Failed to set context from stored documents');
                }
            } else {
                console.log('No stored documents found, context will be empty');
            }

        } catch (error) {
            console.error('Error ensuring context is loaded:', error);
        }
    }

    function initializeAudioMonitoring() {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;

            // Get microphone input - this should work since we already got permission in permissions page
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    microphone = audioContext.createMediaStreamSource(stream);
                    microphone.connect(analyser);

                    // Start monitoring audio levels immediately
                    console.log('Audio monitoring started');
                    monitorAudioLevels();
                })
                .catch(error => {
                    console.error('Microphone access failed in interview:', error);
                });

        } catch (error) {
            console.error('Audio monitoring setup failed:', error);
        }
    }

    function monitorAudioLevels() {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function updateAudioLevels() {
            if (analyser) {
                analyser.getByteFrequencyData(dataArray);

                // Calculate average volume
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;

                // Update UI
                audioLevel.textContent = Math.round(average);

                // Animate audio bars based on volume
                audioBars.forEach((bar, index) => {
                    const height = (average / 255) * 100; // Convert to percentage
                    const delay = index * 0.1; // Stagger animation

                    bar.style.height = `${Math.max(10, height)}%`; // Minimum height for small bars
                    bar.style.transition = `height 0.1s ease ${delay}s`;

                    // Color based on volume
                    if (average > 100) {
                        bar.style.background = '#ef4444'; // Red for loud
                    } else if (average > 50) {
                        bar.style.background = '#eab308'; // Yellow for medium
                    } else {
                        bar.style.background = '#22c55e'; // Green for quiet
                    }
                });

                requestAnimationFrame(updateAudioLevels);
            }
        }

        updateAudioLevels();
    }

    async function startInterview() {
        interviewStarted = true;
        console.log('Interview starting...');

        // Start timer
        startTimer();

        // Get first question after a short delay
        setTimeout(async () => {
            await getNextQuestion();
        }, 2000);

        // Auto-start first question simulation after 5 seconds if API fails
        setTimeout(() => {
            if (statusText.textContent !== 'AI speaking...') {
                console.log('API not responding, simulating AI speaking...');
                simulateAISpeaking();
            }
        }, 3000); // Reduced to 3 seconds for quicker feedback

        statusText.textContent = 'Listening...';
    }

    function startTimer() {
        timerInterval = setInterval(() => {
            remainingSeconds--;
            updateTimer();

            if (remainingSeconds <= 0) {
                finishInterview();
            }
        }, 1000);
    }

    function updateTimer() {
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        timeRemaining.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    async function getNextQuestion() {
        try {
            statusText.textContent = 'AI thinking...';

            const response = await fetch('/api/next_question', {
                method: 'POST'
            });

            if (response.ok) {
                const data = await response.json();
                currentQuestion = data.question;

                // Show sound visualization and update status
                showSoundVisualization();
                statusText.textContent = 'AI speaking...';

                // Play audio if available
                if (data.audio) {
                    try {
                        console.log('Playing AI TTS audio...');
                        AudioManager.unlockAudio().then(() => {
                            return AudioManager.playAudio(data.audio);
                        }).then(() => {
                            console.log('AI audio completed');
                            hideSoundVisualization();
                            statusText.textContent = 'Listening...';
                            listenTurn();
                        }).catch(error => {
                            console.error('TTS audio playback failed:', error);
                            hideSoundVisualization();
                            statusText.textContent = 'Listening...';
                            // Still try to listen even if audio fails
                            setTimeout(listenTurn, 1000);
                        });
                    } catch (error) {
                        console.error('TTS audio setup failed:', error);
                        hideSoundVisualization();
                        statusText.textContent = 'Listening...';
                        setTimeout(listenTurn, 1000);
                    }
                } else {
                    // No audio available, go directly to listening
                    hideSoundVisualization();
                    statusText.textContent = 'Listening...';
                    setTimeout(listenTurn, 500);
                }

                console.log('Question received');
            }
        } catch (error) {
            console.error('Failed to get question:', error);
            statusText.textContent = 'Connection error';
            hideSoundVisualization();
        }
    }

    function showSoundVisualization() {
        console.log('Showing sound visualization');
        soundIcon.style.display = 'block';
        soundIcon.style.opacity = '1';
        soundIcon.style.transform = 'translate(-50%, -50%) scale(1)';
    }

    function hideSoundVisualization() {
        console.log('Hiding sound visualization');
        soundIcon.style.display = 'none';
        soundIcon.style.opacity = '0';
    }

    // Real interview conversation functions based on original app.js
    let firstQBusy = false;

    async function getFirstQuestion() {
        if (firstQBusy) return;
        firstQBusy = true;

        try {
            const data = await getNextQuestionData();
            if (data.question) {
                showSoundVisualization();
                statusText.textContent = 'AI speaking...';
                currentQuestion = data.question;
                console.log('First question:', data.question);
            }

            if (data.audio && !AudioManager.isPlaying) {
                await AudioManager.playAudio(data.audio);
            }

            // Start listening when audio finishes
            if (!AudioManager.isPlaying) {
                listenTurn();
            } else {
                // Setup callback when audio finishes
                waitForAudioAndListen();
            }
        } catch (err) {
            console.error('Error getting first question:', err);
            statusText.textContent = 'Connection error';
        } finally {
            firstQBusy = false;
        }
    }

    function waitForAudioAndListen() {
        if (AudioManager.isPlaying) {
            setTimeout(waitForAudioAndListen, 100);
        } else {
            listenTurn();
        }
    }

    async function getNextQuestionData() {
        const response = await fetch('/api/next_question', { method: 'POST' });
        return response.json();
    }

    async function listenTurn() {
        if (AudioManager.isPlaying) return;

        try {
            console.log('🎤 Listening for user speech...');
            statusText.textContent = '🎤 Listening…';

            await AudioManager.unlockAudio();
            await AudioManager.getMicrophone();

            // Try VAD mode first
            if (window.VAD_AVAILABLE !== false) {
                if (!window.VAD_INITIALIZED) {
                    console.log('Initializing VAD...');
                    try {
                        await AudioManager.initVAD(
                            // onSpeechStart - start recording
                            () => {
                                console.log('User started speaking');
                                statusText.textContent = '🎙️ Recording…';
                                AudioManager.startRecording(null, onRecordingComplete);
                            },
                            // onSpeechEnd - stop recording
                            () => {
                                console.log('User stopped speaking');
                                setTimeout(() => {
                                    AudioManager.stopRecording();
                                }, 500);
                            }
                        );
                        window.VAD_INITIALIZED = true;
                        console.log('VAD initialized successfully');
                    } catch (vadError) {
                        console.warn('VAD initialization failed, falling back to manual mode:', vadError);
                        window.VAD_AVAILABLE = false;
                        // Fall through to manual mode
                    }
                }

                if (window.VAD_AVAILABLE !== false) {
                    console.log('Starting VAD listening...');
                    AudioManager.startVAD();
                    return; // VAD mode active
                }
            }

            // Manual speech detection mode (fallback)
            console.log('Using manual speech detection mode');
            statusText.textContent = '🎤 Listening… (manual mode)';
            // Start recording after a short delay and stop after timeout
            setTimeout(() => {
                statusText.textContent = '🎙️ Recording…';
                AudioManager.startRecording(null, onRecordingComplete);
                // Auto-stop recording after 5 seconds
                setTimeout(() => {
                    if (AudioManager.stopRecording) {
                        AudioManager.stopRecording();
                    }
                }, 5000);
            }, 1000);

        } catch (err) {
            console.error('Error in listenTurn:', err);
            // Try basic recording mode as last resort
            try {
                console.log('Falling back to basic recording mode...');
                statusText.textContent = '🎙️ Recording… (basic mode)';
                setTimeout(() => {
                    AudioManager.startRecording(null, onRecordingComplete);
                }, 500);
                setTimeout(() => {
                    AudioManager.stopRecording();
                }, 3000);
            } catch (fallbackError) {
                console.error('All recording modes failed:', fallbackError);
                statusText.textContent = 'Recording failed, please try again';
                setTimeout(() => {
                    listenTurn(); // Retry
                }, 2000);
            }
        }
    }

    async function onRecordingComplete() {
        AudioManager.pauseVAD();

        const audioBlob = AudioManager.getAudioBlob();
        if (!audioBlob) {
            console.log('No audio captured, listening again...');
            statusText.textContent = 'No audio, listening…';
            if (!AudioManager.isPlaying) setTimeout(listenTurn, 500);
            return;
        }

        try {
            console.log('Processing user response...');
            statusText.textContent = 'AI thinking…';

            // Send audio to backend for processing
            const data = await submitVoiceTurn(audioBlob);

            if (!data.ok) {
                console.error('Voice turn failed:', data.error);
                statusText.textContent = 'Connection error';
                if (!AudioManager.isPlaying) setTimeout(listenTurn, 500);
                return;
            }

            // Handle finished interview
            if (data.finished) {
                console.log('Interview finished');
                statusText.textContent = 'Interview completed';
                setTimeout(() => {
                    finishInterview();
                }, 2000);
                return;
            }

            // Show AI response
            if (data.assistant_text) {
                console.log('AI response:', data.assistant_text);
                currentQuestion = data.assistant_text;
            }

            if (data.assistant_audio && !AudioManager.isPlaying) {
                showSoundVisualization();
                statusText.textContent = 'AI speaking…';
                await AudioManager.playAudio(data.assistant_audio);
                waitForAudioAndListen();
            } else {
                if (!AudioManager.isPlaying) {
                    waitForAudioAndListen();
                }
            }
        } catch (err) {
            console.error('Error processing recording:', err);
            statusText.textContent = 'Connection error';
            if (!AudioManager.isPlaying) setTimeout(listenTurn, 500);
        }
    }

    async function submitVoiceTurn(audioBlob) {
        console.log('🎯 Submitting audio blob, size:', audioBlob.size, 'type:', audioBlob.type);

        if (!audioBlob || audioBlob.size === 0) {
            console.error('No audio blob to submit!');
            throw new Error('No audio data to submit');
        }

        const formData = new FormData();
        const ext = (audioBlob.type || '').split('/')[1] || 'webm';
        const safeExt = ext.split(';')[0];
        formData.append('audio', audioBlob, 'turn.' + safeExt);

        console.log('📡 Sending voice turn request to backend...');
        try {
            const response = await fetch('/api/voice_turn', {
                method: 'POST',
                body: formData
            });
            console.log('📡 Voice turn response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Voice turn request failed:', response.status, errorText);
                throw new Error(`Voice turn failed: ${response.status}`);
            }

            const result = await response.json();
            console.log('✅ Voice turn response:', result);
            return result;
        } catch (error) {
            console.error('❌ Voice turn network error:', error);
            throw error;
        }
    }

    function finishInterview() {
        if (timerInterval) {
            clearInterval(timerInterval);
        }

        // Stop camera
        if (interviewVideo.srcObject) {
            const tracks = interviewVideo.srcObject.getTracks();
            tracks.forEach(track => track.stop());
        }

        // Stop audio monitoring
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
        }

        // Navigate to results
        setTimeout(() => {
            window.location.href = '/results';
        }, 1000);
    }

    // Event listeners
    finishBtn.addEventListener('click', finishInterview);

    // Export functions for other modules
    window.showSoundVisualization = showSoundVisualization;
    window.hideSoundVisualization = hideSoundVisualization;
    window.finishInterview = finishInterview;

    // Handle page unload
    window.addEventListener('beforeunload', () => {
        if (interviewVideo.srcObject) {
            const tracks = interviewVideo.srcObject.getTracks();
            tracks.forEach(track => track.stop());
        }
        if (timerInterval) {
            clearInterval(timerInterval);
        }
    });
});
