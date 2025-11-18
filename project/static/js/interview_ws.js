// WebSocket connection for real-time interview communication
let socket = null;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];

document.addEventListener('DOMContentLoaded', function() {
    initializeWebSocket();
});

function initializeWebSocket() {
    // Initialize Socket.IO connection
    socket = io();

    socket.on('connect', function() {
        console.log('Connected to server via Socket.IO');
    });

    socket.on('disconnect', function() {
        console.log('Disconnected from server');
    });

    socket.on('audio_response', function(data) {
        console.log('Received audio response:', data);
        handleAudioResponse(data);
    });

    socket.on('text_response', function(data) {
        console.log('Received text response:', data);
        handleTextResponse(data);
    });

    socket.on('interview_finished', function(data) {
        console.log('Interview finished');
        finishInterview();
    });

    socket.on('error', function(error) {
        console.error('Socket error:', error);
    });
}

function handleAudioResponse(data) {
    if (data.audio_url) {
        // Play the AI response audio
        const audioPlayer = document.getElementById('audioPlayer');
        if (audioPlayer) {
            audioPlayer.src = data.audio_url;
            audioPlayer.play().catch(e => console.error('Audio playback failed:', e));
        }
    }
}

function handleTextResponse(data) {
    if (data.text) {
        // Show text response in UI
        console.log('AI response:', data.text);
        // You could add text display here if needed
    }
}

function startRecording() {
    if (isRecording) return;

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function(stream) {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = function(event) {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = function() {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });

                // Send audio to server via WebSocket
                if (socket && socket.connected) {
                    socket.emit('audio_input', audioBlob);
                } else {
                    // Fallback to API call
                    sendVoiceInput(audioBlob);
                }
            };

            mediaRecorder.start();
            isRecording = true;
            console.log('Recording started');
        })
        .catch(function(error) {
            console.error('Error accessing microphone:', error);
        });
}

function stopRecording() {
    if (!isRecording) return;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    isRecording = false;
    console.log('Recording stopped');
}

function sendVoiceInput(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');

    fetch('/api/voice_turn', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        console.log('Voice input response:', data);
        if (data.assistant_audio) {
            handleAudioResponse({ audio_url: data.assistant_audio });
        }
        if (data.assistant_text) {
            handleTextResponse({ text: data.assistant_text });
        }
        if (data.finished) {
            finishInterview();
        }
    })
    .catch(error => {
        console.error('Voice input failed:', error);
    });
}

// Export functions for use in other modules
window.startRecording = startRecording;
window.stopRecording = stopRecording;
