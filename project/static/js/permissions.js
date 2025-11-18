document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const cameraStatus = document.getElementById('cameraStatus');
    const microphoneStatus = document.getElementById('microphoneStatus');
    const speakerStatus = document.getElementById('speakerStatus');
    const previewVideo = document.getElementById('previewVideo');
    const videoPlaceholder = document.getElementById('videoPlaceholder');
    const audioValue = document.getElementById('audioValue');
    const testAudioBtn = document.getElementById('testAudioBtn');
    const testVideoBtn = document.getElementById('testVideoBtn');
    const testFeedback = document.getElementById('testFeedback');
    const backBtn = document.getElementById('backBtn');
    const proceedBtn = document.getElementById('proceedBtn');

    let stream = null;
    let audioContext = null;
    let analyser = null;
    let microphone = null;
    let permissionsChecked = {
        camera: false,
        microphone: false,
        speaker: true
    };

    // Initialize
    checkPermissions();

    // Event listeners
    testAudioBtn.addEventListener('click', testAudioOutput);
    testVideoBtn.addEventListener('click', testVideoCapture);
    backBtn.addEventListener('click', () => window.location.href = '/');
    proceedBtn.addEventListener('click', proceedToInterview);

    // Functions
    async function checkPermissions() {
        try {
            // Check camera permission
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                    updateStatus(cameraStatus, 'granted', 'Camera access granted');
                    updateStatus(microphoneStatus, 'granted', 'Microphone access granted');
                    permissionsChecked.camera = true;
                    permissionsChecked.microphone = true;

                    // Start video preview
                    previewVideo.srcObject = stream;
                    previewVideo.style.display = 'block'; // Show the video element
                    videoPlaceholder.classList.add('active'); // Hide the placeholder

                    // Setup audio analysis
                    setupAudioAnalysis(stream);

                } catch (err) {
                    console.error('Media access error:', err);
                    if (err.name === 'NotAllowedError') {
                        updateStatus(cameraStatus, 'denied', 'Camera access denied');
                        updateStatus(microphoneStatus, 'denied', 'Microphone access denied');
                    } else if (err.name === 'NotFoundError') {
                        updateStatus(cameraStatus, 'error', 'No camera found');
                        updateStatus(microphoneStatus, 'error', 'No microphone found');
                    } else {
                        updateStatus(cameraStatus, 'error', 'Camera error: ' + err.message);
                        updateStatus(microphoneStatus, 'error', 'Microphone error: ' + err.message);
                    }
                }
            } else {
                updateStatus(cameraStatus, 'error', 'WebRTC not supported');
                updateStatus(microphoneStatus, 'error', 'WebRTC not supported');
            }

            // Speaker permission is always available (browsers don't require explicit permission)
            updateStatus(speakerStatus, 'available', 'Available');

            updateProceedButton();
        } catch (error) {
            console.error('Permission check failed:', error);
        }
    }

    function updateStatus(element, status, message) {
        element.className = `status ${status}`;
        element.textContent = message;
    }

    function setupAudioAnalysis(mediaStream) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(mediaStream);

            microphone.connect(analyser);
            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            function updateAudioLevel() {
                if (analyser) {
                    analyser.getByteFrequencyData(dataArray);
                    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                    audioValue.textContent = Math.round(average) + ' dB';
                    requestAnimationFrame(updateAudioLevel);
                }
            }

            updateAudioLevel();
        } catch (error) {
            console.error('Audio analysis setup failed:', error);
        }
    }

    async function testAudioOutput() {
        testAudioBtn.disabled = true;
        testAudioBtn.textContent = 'Playing...';

        try {
            // Try multiple approaches for audio playback
            await playTestSound();

        } catch (error) {
            console.error('Audio test failed:', error);
            showFeedback('❌ Audio playback failed. Please check your browser settings.', 'error');
            testAudioBtn.disabled = false;
            testAudioBtn.textContent = 'Test Audio';
        }
    }

    async function playTestSound() {
        return new Promise((resolve, reject) => {
            try {
                // First try using Web Speech API for natural voice
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance("hey there, are you able to hear me");
                    utterance.volume = 0.8; // Clear and audible volume
                    utterance.rate = 1.1; // Faster speech for natural flow
                    utterance.pitch = 1.3; // Higher pitch for more feminine voice

                    // Try to find a female voice if available
                    const voices = speechSynthesis.getVoices();
                    const femaleVoice = voices.find(voice =>
                        voice.name.toLowerCase().includes('female') ||
                        voice.name.toLowerCase().includes('woman') ||
                        voice.name.toLowerCase().includes('girl') ||
                        voice.name.toLowerCase().includes('karen') ||
                        voice.name.toLowerCase().includes('zira') ||
                        (voice.name.toLowerCase().includes('english') && voice.name.toLowerCase().includes('female'))
                    );

                    if (femaleVoice) {
                        utterance.voice = femaleVoice;
                        console.log('Using female voice:', femaleVoice.name);
                    }

                    utterance.onstart = () => {
                        console.log('Speech started with female voice');
                    };

                    utterance.onend = () => {
                        console.log('Speech completed');
                        showAudioConfirmationDialog();
                        resolve();
                    };

                    utterance.onerror = (error) => {
                        console.error('Speech synthesis failed, using beep:', error);
                        // Fallback to beep if speech fails
                        playBeepFallback().then(resolve).catch(reject);
                    };

                    // Some browsers need voices to be loaded first
                    if (speechSynthesis.getVoices().length === 0) {
                        speechSynthesis.addEventListener('voiceschanged', () => {
                            speechSynthesis.speak(utterance);
                        });
                    } else {
                        speechSynthesis.speak(utterance);
                    }

                } else {
                    // No speech synthesis, use beep fallback
                    playBeepFallback().then(resolve).catch(reject);
                }

            } catch (error) {
                console.error('Audio test error:', error);
                reject(error);
            }
        });
    }

    async function playBeepFallback() {
        return new Promise((resolve, reject) => {
            try {
                // Create an AudioContext for tone generation
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();

                // Create oscillator for more noticeable tone
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                // Configure louder, more noticeable beep (600Hz for 1.5 seconds)
                oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
                oscillator.type = 'sine';

                // Volume fade for smooth start/stop
                gainNode.gain.setValueAtTime(0, audioContext.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.1); // Louder
                gainNode.gain.setValueAtTime(0.5, audioContext.currentTime + 1.4); // Longer
                gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 1.5);

                // Play for 1.5 seconds
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 1.5);

                // After sound plays, show confirmation dialog
                setTimeout(() => {
                    showAudioConfirmationDialog();
                    resolve();

                    // Clean up
                    if (audioContext.state !== 'closed') {
                        audioContext.close();
                    }
                }, 1600);

            } catch (error) {
                console.error('Beep fallback failed:', error);
                reject(error);
            }
        });
    }

    function showAudioConfirmationDialog() {
        // Remove any existing confirmation
        const existingConfirm = document.getElementById('audioTestConfirmation');
        if (existingConfirm) {
            document.body.removeChild(existingConfirm);
        }

        const confirmDiv = document.createElement('div');
        confirmDiv.id = 'audioTestConfirmation';
        confirmDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 12px;
            padding: 2rem;
            z-index: 10001;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            text-align: center;
            max-width: 400px;
            width: 90%;
        `;

        confirmDiv.innerHTML = `
            <div style="font-size: 1.5rem; margin-bottom: 1rem;">🔊 Audio Test</div>
            <div style="margin-bottom: 1.5rem; color: #9ca3af;">
                Did you hear a beep sound just now? If yes, your speakers are working!
            </div>
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <button id="heardSoundBtn" style="background: #16a34a; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer;">Yes, I heard it!</button>
                <button id="noSoundBtn" style="background: #dc2626; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer;">No sound</button>
            </div>
        `;

        document.body.appendChild(confirmDiv);

        document.getElementById('heardSoundBtn').addEventListener('click', () => {
            document.body.removeChild(confirmDiv);
            showFeedback('🎵 Speaker test passed! Audio is working.', 'success');
            testAudioBtn.disabled = false;
            testAudioBtn.textContent = 'Test Audio';
        });

        document.getElementById('noSoundBtn').addEventListener('click', () => {
            document.body.removeChild(confirmDiv);
            showFeedback('❌ Speaker test failed. Check volume and speaker settings.', 'error');
            testAudioBtn.disabled = false;
            testAudioBtn.textContent = 'Test Audio';
        });
    }

    function showAudioConfirmation() {
        // Create a confirmation dialog
        const confirmationDiv = document.createElement('div');
        confirmationDiv.id = 'audioConfirmation';
        confirmationDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 12px;
            padding: 2rem;
            z-index: 10000;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            text-align: center;
            max-width: 400px;
            width: 90%;
        `;

        confirmationDiv.innerHTML = `
            <div style="font-size: 1.5rem; margin-bottom: 1rem;">🔊 Audio Test</div>
            <div style="margin-bottom: 1.5rem; color: #9ca3af;">
                Did you hear the test sound? A pleasant musical tone should have played for 2 seconds.
            </div>
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <button id="audioYesBtn" style="background: #16a34a; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer;">Yes, I heard it</button>
                <button id="audioNoBtn" style="background: #dc2626; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer;">No, didn't hear it</button>
            </div>
        `;

        document.body.appendChild(confirmationDiv);

        // Handle responses
        document.getElementById('audioYesBtn').addEventListener('click', () => {
            document.body.removeChild(confirmationDiv);
            showFeedback('🎵 Speaker test passed! Sound is working.', 'success');
            testAudioBtn.disabled = false;
            testAudioBtn.textContent = 'Test Audio';
        });

        document.getElementById('audioNoBtn').addEventListener('click', () => {
            document.body.removeChild(confirmationDiv);
            showFeedback('❌ Speaker test failed. Check your audio settings.', 'error');
            testAudioBtn.disabled = false;
            testAudioBtn.textContent = 'Test Audio';
        });
    }

    async function testVideoCapture() {
        testVideoBtn.disabled = true;
        testVideoBtn.textContent = 'Testing...';

        try {
            if (!stream) {
                throw new Error('No active video stream');
            }

            // Wait for video to be ready (up to 3 seconds)
            let attempts = 0;
            while (attempts < 30) {
                if (previewVideo.readyState >= 2 && previewVideo.videoWidth > 0 && previewVideo.videoHeight > 0) {
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }

            if (previewVideo.readyState < 2 || previewVideo.videoWidth === 0 || previewVideo.videoHeight === 0) {
                throw new Error('Video is not ready or camera feed is not available');
            }

            // Capture a frame to test video
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = Math.min(previewVideo.videoWidth, 640); // Limit size for performance
            canvas.height = Math.min(previewVideo.videoHeight, 480);

            ctx.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);

            // Test multiple pixels to detect if video is working
            const testPoints = [
                [0, 0], // top-left
                [canvas.width - 1, 0], // top-right
                [0, canvas.height - 1], // bottom-left
                [canvas.width / 2, canvas.height / 2] // center
            ];

            let hasContent = false;
            for (const [x, y] of testPoints) {
                const pixelData = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
                const brightness = (pixelData[0] + pixelData[1] + pixelData[2]) / 3;

                // If any pixel is not completely dark/black, consider it working
                if (brightness > 5) {
                    hasContent = true;
                    break;
                }
            }

            if (!hasContent) {
                throw new Error('Video feed appears to be dark/black - check lighting or camera positioning');
            }

            // Show success with video dimensions
            showFeedback(`📹 Camera test passed! (${previewVideo.videoWidth}x${previewVideo.videoHeight})`, 'success');

        } catch (error) {
            console.error('Video test failed:', error);
            showFeedback('❌ Video test failed: ' + error.message, 'error');
        } finally {
            testVideoBtn.disabled = false;
            testVideoBtn.textContent = 'Test Video';
        }
    }

    function showFeedback(message, type) {
        testFeedback.textContent = message;
        testFeedback.className = `test-feedback ${type}`;
        testFeedback.style.display = 'block';

        setTimeout(() => {
            testFeedback.style.display = 'none';
        }, 3000);
    }

    function updateProceedButton() {
        const canProceed = permissionsChecked.camera && permissionsChecked.microphone;
        proceedBtn.disabled = !canProceed;

        if (canProceed) {
            proceedBtn.textContent = 'Start Interview';
        } else {
            proceedBtn.textContent = 'Waiting for permissions...';
        }
    }

    async function proceedToInterview() {
        if (proceedBtn.disabled) return;

        try {
            // Get stored settings and start interview
            const settings = JSON.parse(localStorage.getItem('interviewSettings') || '{}');
            const duration = settings.duration || 15;
            const voice = settings.voice || 'en-IN-Neural2-B';

            // Set voice preference
            await fetch('/api/set_voice', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ voice: voice })
            });

            // Start interview
            const startResponse = await fetch('/api/start_interview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ minutes: duration })
            });

            if (!startResponse.ok) {
                throw new Error('Failed to start interview');
            }

            proceedBtn.disabled = true;
            proceedBtn.textContent = 'Starting...';

            // Clean up media stream
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }

            // Navigate to interview page
            window.location.href = '/interview';

        } catch (error) {
            console.error('Failed to proceed to interview:', error);
            alert('Failed to start interview. Please try again.');
            proceedBtn.disabled = false;
            proceedBtn.textContent = 'Start Interview';
        }
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        if (audioContext) {
            audioContext.close();
        }
    });

    // Initialize speaker status
    updateStatus(speakerStatus, 'available', 'Available');
});
