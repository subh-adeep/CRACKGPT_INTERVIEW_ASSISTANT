// Coding challenge functionality for interview interface
// Integrated with backend coding API routes

document.addEventListener('DOMContentLoaded', function() {
    console.log('Coding challenge module loaded');

    // DOM Elements
    const codingToggle = document.getElementById('codingToggle');
    const codingToggleBtn = document.getElementById('codingToggleBtn');
    const codingPanel = document.getElementById('codingPanel');
    const codingCloseBtn = document.getElementById('codingCloseBtn');
    const startCodingBtn = document.getElementById('startCodingBtn');
    const submitCodeBtn = document.getElementById('submitCodeBtn');
    const codingInput = document.getElementById('codingInput');
    const codingTimer = document.getElementById('codingTimer');

    // State variables
    let codingActive = false;
    let codingInterval = null;
    let codingRemainingSeconds = 0;

    // Initialize coding panel
    initializeCodingPanel();

    function initializeCodingPanel() {
        console.log('Initializing coding panel...');

        // Check if elements exist
        if (!codingToggle) {
            console.error('codingToggle element not found!');
            return;
        }
        if (!codingToggleBtn) {
            console.error('codingToggleBtn element not found!');
            return;
        }
        if (!codingPanel) {
            console.error('codingPanel element not found!');
            return;
        }

        console.log('All coding elements found successfully')

        // Toggle button click handler
        codingToggleBtn.addEventListener('click', function(e) {
            console.log('Coding toggle button clicked!');
            toggleCodingPanel();
        });

        // Close button click handler
        codingCloseBtn.addEventListener('click', closeCodingPanel);

        // Start coding button
        startCodingBtn.addEventListener('click', startCodingChallenge);

        // Submit code button
        submitCodeBtn.addEventListener('click', submitCodeSolution);

        // Close panel when clicking outside (optional)
        codingPanel.addEventListener('click', function(e) {
            if (e.target === codingPanel) {
                closeCodingPanel();
            }
        });

        // Close panel with Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && codingPanel.classList.contains('show')) {
                closeCodingPanel();
            }
        });

        // Initial state check
        checkCodingStatus();
    }

    function toggleCodingPanel() {
        console.log('toggleCodingPanel called, current show state:', codingPanel.classList.contains('show'));
        if (codingPanel.classList.contains('show')) {
            closeCodingPanel();
        } else {
            openCodingPanel();
        }
    }

    function openCodingPanel() {
        console.log('Opening coding panel...');
        codingPanel.classList.add('show');
        codingToggleBtn.style.borderColor = '#60a5fa';
        console.log('Panel should now be visible');
        checkCodingStatus();
    }

    function closeCodingPanel() {
        console.log('Closing coding panel...');
        codingPanel.classList.remove('show');
        codingToggleBtn.style.borderColor = '#334155';
        console.log('Panel should now be hidden');
    }

    async function checkCodingStatus() {
        try {
            const response = await fetch('/api/coding_status');
            const data = await response.json();

            if (response.ok) {
                updateCodingUI(data);
            }
        } catch (error) {
            console.error('Error checking coding status:', error);
        }
    }

    function updateCodingUI(data) {
        const wasActive = codingActive;
        codingActive = data.coding_active;

        if (codingActive) {
            // Coding is active
            document.body.classList.add('coding-active');
            codingPanel.classList.add('coding-active');
            startCodingBtn.disabled = true;
            startCodingBtn.textContent = 'Coding Active';
            submitCodeBtn.disabled = false;

            if (data.remaining_sec !== undefined) {
                codingRemainingSeconds = data.remaining_sec;
                startCodingTimer();
            }

            // Show yellow border/indicator
            codingToggleBtn.style.borderColor = '#fbbf24';
            codingToggleBtn.querySelector('svg').style.color = '#fbbf24';
        } else {
            // Coding is not active
            document.body.classList.remove('coding-active');
            codingPanel.classList.remove('coding-active');
            startCodingBtn.disabled = false;
            startCodingBtn.textContent = 'Start Coding';
            submitCodeBtn.disabled = true;
            stopCodingTimer();

            // Hide coding challenge text if it ended
            if (wasActive && !codingActive && data.assistant_text) {
                // Could show the challenge ended message
                console.log('Coding challenge ended:', data.assistant_text);
                // You might want to display this in the interview status
            }

            codingToggleBtn.style.borderColor = '#334155';
            codingToggleBtn.querySelector('svg').style.color = '#94a3b8';
            codingTimer.textContent = '00:00';
        }
    }

    async function startCodingChallenge() {
        console.log('Starting coding challenge...');
        startCodingBtn.disabled = true;
        startCodingBtn.textContent = 'Starting...';

        try {
            const response = await fetch('/api/start_coding', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const data = await response.json();

            if (response.ok && data.ok) {
                console.log('Coding challenge started successfully');
                updateCodingUI(data);
                codingInput.focus();
                showNotification('Coding challenge started! You have 5 minutes.', 'info');
            } else {
                throw new Error(data.error || 'Failed to start coding challenge');
            }
        } catch (error) {
            console.error('Error starting coding challenge:', error);
            startCodingBtn.disabled = false;
            startCodingBtn.textContent = 'Start Coding';
            showNotification('Failed to start coding challenge. Please try again.', 'error');
        }
    }

    async function submitCodeSolution() {
        const code = codingInput.value.trim();

        if (!code) {
            showNotification('Please enter some code before submitting.', 'warning');
            return;
        }

        console.log('Submitting code solution...');
        submitCodeBtn.disabled = true;
        submitCodeBtn.textContent = 'Submitting...';

        try {
            const response = await fetch('/api/submit_code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code: code,
                    lang: 'text' // Could be enhanced to detect language
                })
            });

            const data = await response.json();

            if (response.ok && data.ok) {
                console.log('Code submitted successfully');
                updateCodingUI({ coding_active: false });
                codingInput.value = ''; // Clear the code
                showNotification('Code submitted successfully! Returning to interview.', 'success');

                // The AI response will come through normal conversation flow
                if (data.assistant_text) {
                    console.log('AI feedback:', data.assistant_text);
                }
            } else {
                throw new Error(data.error || 'Failed to submit code');
            }
        } catch (error) {
            console.error('Error submitting code:', error);
            showNotification('Failed to submit code. Please try again.', 'error');
            submitCodeBtn.disabled = false;
            submitCodeBtn.textContent = 'Submit Code';
        }
    }

    function startCodingTimer() {
        stopCodingTimer(); // Clear any existing timer

        codingInterval = setInterval(async () => {
            codingRemainingSeconds--;

            if (codingRemainingSeconds <= 0) {
                stopCodingTimer();
                console.log('Coding time is up!');
                // Auto-check status to get the timeout message
                checkCodingStatus();
                return;
            }

            updateCodingTimerDisplay();
        }, 1000);

        updateCodingTimerDisplay();
    }

    function stopCodingTimer() {
        if (codingInterval) {
            clearInterval(codingInterval);
            codingInterval = null;
        }
    }

    function updateCodingTimerDisplay() {
        const minutes = Math.floor(codingRemainingSeconds / 60);
        const seconds = codingRemainingSeconds % 60;
        codingTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function showNotification(message, type = 'info') {
        // Simple notification - you could integrate with a proper notification system
        console.log(`[${type.toUpperCase()}] ${message}`);

        // For now, just update the status temporarily
        // In a real implementation, you'd use a toast notification library
        const originalStatus = document.getElementById('statusText').textContent;
        document.getElementById('statusText').textContent = message;

        setTimeout(() => {
            document.getElementById('statusText').textContent = originalStatus;
        }, 3000);
    }

    // Fallback initialization - try to force coding button to work
    setTimeout(() => {
        console.log('Coding module fallback check...');

        const codingToggleBtn = document.getElementById('codingToggleBtn');
        const codingPanel = document.getElementById('codingPanel');

        if (codingToggleBtn && !codingToggleBtn.dataset.listenerAttached) {
            console.log('Attaching fallback coding button listener...');
            codingToggleBtn.addEventListener('click', () => {
                console.log('Fallback: Coding button clicked!');
                if (codingPanel) {
                    const isVisible = codingPanel.classList.contains('show');
                    console.log(`Panel visibility: ${isVisible} -> ${!isVisible}`);
                    if (isVisible) {
                        closeCodingPanel();
                    } else {
                        openCodingPanel();
                    }
                } else {
                    console.error('Fallback: codingPanel not found!');
                }
            });
            codingToggleBtn.dataset.listenerAttached = 'true';
            console.log('Fallback listener attached successfully');
        } else if (codingToggleBtn) {
            console.log('Fallback: Coding button listener already attached');
        } else {
            console.error('Fallback: codingToggleBtn not found!');
        }

        // Test that panel exists and can be shown
        if (codingPanel) {
            console.log('Coding panel element found, CSS should work...');
        } else {
            console.error('Coding panel element not found! HTML issue.');
        }
    }, 1000); // Give main init 1 second, then apply fallback

    // Export functions for potential external use
    window.CodingManager = {
        openPanel: openCodingPanel,
        closePanel: closeCodingPanel,
        checkStatus: checkCodingStatus
    };

    console.log('Coding challenge module initialized successfully');
});
