// Audio processing utilities for the interview
// Based on original working app.js implementation

let mediaStream = null;
let mediaRecorder = null;
let audioBlob = null;
let isRecording = false;
let vadActive = false;
let vadProcessor = null;
let vadInterval = null;

// Audio manager functions matching original app.js
const AudioManager = {
    isPlaying: false,
    currentPlayer: null,

    async unlockAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
    },

    async getMicrophone() {
        if (!mediaStream) {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
        }
        return mediaStream;
    },

    initVAD(onSpeechStart, onSpeechEnd) {
        if (vadProcessor) return Promise.resolve();

        return import('https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.7/dist/bundle.min.js').then(({ default: vad }) => {
            return vad.MicVAD.new({
                onSpeechStart: () => {
                    console.log('VAD: Speech started');
                    if (onSpeechStart) onSpeechStart();
                },
                onSpeechEnd: () => {
                    console.log('VAD: Speech ended');
                    if (onSpeechEnd) onSpeechEnd();
                },
                positiveSpeechThreshold: 0.5,
                negativeSpeechThreshold: 0.35,
                minSpeechFrames: 4,
                sampleRate: 16000
            }).then(vadInstance => {
                vadProcessor = vadInstance;
                console.log('VAD initialized');
                return vadProcessor;
            });
        });
    },

    startVAD() {
        if (vadProcessor && !vadActive) {
            vadProcessor.start();
            vadActive = true;
            console.log('VAD started');
        }
    },

    pauseVAD() {
        if (vadProcessor && vadActive) {
            vadProcessor.pause();
            vadActive = false;
            console.log('VAD paused');
        }
    },

    startRecording(audioStream, onStopCallback) {
        if (isRecording || (!audioStream && !mediaStream)) return;

        const stream = audioStream || mediaStream;
        if (!stream) {
            console.error('No audio stream available for recording');
            return;
        }

        try {
            // Reset previous blob
            audioBlob = null;

            mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ?
                         'audio/webm;codecs=opus' :
                         MediaRecorder.isTypeSupported('audio/webm') ?
                         'audio/webm' : 'audio/mpeg'
            });

            const chunks = [];
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunks.push(event.data);
                    console.log(`Received ${event.data.size} bytes of audio data`);
                }
            };

            mediaRecorder.onstop = () => {
                audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType });
                console.log('🎙️ Recording stopped, blob size:', audioBlob.size, 'type:', mediaRecorder.mimeType);
                isRecording = false;
                if (onStopCallback) onStopCallback();
            };

            mediaRecorder.onerror = (error) => {
                console.error('MediaRecorder error:', error);
                isRecording = false;
            };

            mediaRecorder.start(1000); // Collect data every 1000ms
            isRecording = true;
            console.log('🎙️ Recording started with mimeType:', mediaRecorder.mimeType);
        } catch (error) {
            console.error('Failed to start recording:', error);
            isRecording = false;
        }
    },

    stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            console.log('Recording stopped by user');
        }
    },

    getAudioBlob() {
        return audioBlob;
    },

    async playAudio(audioData) {
        return new Promise((resolve, reject) => {
            if (!audioData) {
                reject(new Error('No audio data'));
                return;
            }

            console.log('Playing audio, URL prefix:', audioData.substring(0, 50));

            if (this.currentPlayer) {
                try {
                    this.currentPlayer.pause();
                } catch (e) {
                    console.log('Error pausing previous audio:', e);
                }
            }

            const audio = document.getElementById('audioPlayer');
            if (!audio) {
                reject(new Error('Audio player element not found'));
                return;
            }

            this.currentPlayer = audio;
            this.isPlaying = true;

            audio.onended = () => {
                this.isPlaying = false;
                this.currentPlayer = null;
                console.log('Audio playback ended successfully');
                resolve();
            };

            audio.onerror = (error) => {
                this.isPlaying = false;
                this.currentPlayer = null;
                console.error('Audio playback error:', error);
                reject(error);
            };

            audio.oncanplay = () => {
                console.log('Audio can play, starting playback...');
            };

            audio.onloadeddata = () => {
                console.log('Audio loaded successfully, duration:', audio.duration);
            };

            audio.src = audioData;
            audio.volume = 0.8;

            audio.play().catch(error => {
                this.isPlaying = false;
                this.currentPlayer = null;
                console.error('Audio play failed:', error);
                reject(error);
            });
        });
    }
};

// Initialize audio system
document.addEventListener('DOMContentLoaded', function() {
    console.log('Audio processing module loaded');
});

let audioCtx = null; // Global audio context

// Export functions for compatibility
window.AudioManager = AudioManager;
window.unlockAudio = AudioManager.unlockAudio;
window.getMicrophone = AudioManager.getMicrophone;
