document.addEventListener('DOMContentLoaded', function() {
    const newInterviewBtn = document.getElementById('newInterviewBtn');
    const listenSummaryBtn = document.getElementById('listenSummaryBtn');
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const summaryPlayer = document.getElementById('summaryPlayer');

    initializeResults();

    if (newInterviewBtn) newInterviewBtn.addEventListener('click', startNewInterview);
    if (listenSummaryBtn) listenSummaryBtn.addEventListener('click', toggleSummaryAudio);
    if (downloadPdfBtn) downloadPdfBtn.addEventListener('click', downloadPdfReport);

    async function initializeResults() {
        await loadRealFeedback();
        handlePageRefresh();
    }

    function setScoreBar(scoreId, value) {
        const scoreBar = document.getElementById(scoreId);
        const percentage = Math.max(0, Math.min(100, (value / 10) * 100));
        scoreBar.style.width = percentage + '%';
        if (percentage >= 80) {
            scoreBar.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
        } else if (percentage >= 60) {
            scoreBar.style.background = 'linear-gradient(90deg, #eab308, #ca8a04)';
        } else {
            scoreBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
        }
    }

    function renderSummaryText(txt) {
        const summaryContent = document.getElementById('summaryContent');
        const safe = (txt || '').replace(/\n\n/g, '\n').split('\n').map(p => `<p>${p}</p>`).join('');
        summaryContent.innerHTML = `<div style="text-align:left;max-width:600px;margin:0 auto;">${safe}</div>`;
    }

    function extractSection(feedback, heading) {
        const h = heading.toLowerCase();
        const lines = (feedback || '').split('\n');
        let start = -1;
        for (let i = 0; i < lines.length; i++) {
            const s = lines[i].trim().toLowerCase();
            if (s.includes(h)) { start = i + 1; break; }
        }
        if (start < 0) return '';
        let out = [];
        for (let j = start; j < lines.length; j++) {
            const s = lines[j].trim().toLowerCase();
            const isNewHeading = /^(strengths|areas for improvement|improvements|question analysis|coding assessment|recommendations|next steps)\b/.test(s);
            if (isNewHeading) break;
            out.push(lines[j]);
        }
        return out.join('\n');
    }

    function renderSection(elId, content) {
        const el = document.getElementById(elId);
        const html = (content || '').trim() ? content.split('\n').map(line => {
            if (/^[-*]\s+/.test(line)) return `<li>${line.replace(/^[-*]\s+/, '')}</li>`;
            return `<p>${line}</p>`;
        }).join('') : '<p>No data available.</p>';
        if (html.includes('<li>')) el.innerHTML = `<ul>${html}</ul>`; else el.innerHTML = html;
    }

    async function loadRealFeedback() {
        try {
            const data = await API.getFeedback();
            if (!data.ok) throw new Error(data.error || 'Failed to generate feedback');

            document.getElementById('overallScore').textContent = '—';
            setScoreBar('communicationScore', 0);
            setScoreBar('technicalScore', 0);
            setScoreBar('problemSolvingScore', 0);
            setScoreBar('jobFitScore', 0);
            document.getElementById('communicationScoreText').textContent = '—/10';
            document.getElementById('technicalScoreText').textContent = '—/10';
            document.getElementById('problemSolvingScoreText').textContent = '—/10';
            document.getElementById('jobFitScoreText').textContent = '—/10';

            renderSummaryText(data.feedback || '');

            const strengths = extractSection(data.feedback, 'Strengths');
            const improvements = extractSection(data.feedback, 'Areas for Improvement');
            const questions = extractSection(data.feedback, 'Question Analysis');
            const coding = extractSection(data.feedback, 'Coding Assessment');
            renderSection('strengthsContent', strengths);
            renderSection('improvementsContent', improvements);
            renderSection('questionsContent', questions);
            renderSection('codingContent', coding);

            if (data.spoken_summary) {
                summaryPlayer.src = data.spoken_summary;
                setupAudioControls();
            }

            const fb = data.feedback || '';
            const scores = data.scores || {};
            function getRatingFromText(text, headingRegex, ratingRegex) {
                const m = (text || '').match(ratingRegex);
                if (m) {
                    const v = parseInt(m[1], 10);
                    if (!isNaN(v) && v >= 0 && v <= 10) return v;
                }
                return null;
            }
            const comm = scores.communication ?? getRatingFromText(fb, /communication\s*&\s*clarity/i, /communication\s*&\s*clarity[\s\S]*?rating:\s*(\d+)\/10/i);
            const tech = scores.technical ?? getRatingFromText(fb, /technical\s*depth\s*&\s*problem/i, /technical\s*depth\s*&\s*problem[\s\S]*?rating:\s*(\d+)\/10/i);
            const overall = scores.overall ?? getRatingFromText(fb, /overall\s*rating/i, /overall\s*rating[\s\S]*?overall:\s*(\d+)\/10/i);
            const jobFit = scores.job_fit ?? overall ?? null;
            const prob = scores.problem_solving ?? tech ?? null;

            if (comm != null) {
                setScoreBar('communicationScore', comm);
                document.getElementById('communicationScoreText').textContent = `${comm}/10`;
            }
            if (tech != null) {
                setScoreBar('technicalScore', tech);
                document.getElementById('technicalScoreText').textContent = `${tech}/10`;
            }
            if (prob != null) {
                setScoreBar('problemSolvingScore', prob);
                document.getElementById('problemSolvingScoreText').textContent = `${prob}/10`;
            }
            if (jobFit != null) {
                setScoreBar('jobFitScore', jobFit);
                document.getElementById('jobFitScoreText').textContent = `${jobFit}/10`;
            }
            if (overall != null) {
                document.getElementById('overallScore').textContent = `${overall}/10`;
            }
        } catch (e) {
            const summaryContent = document.getElementById('summaryContent');
            summaryContent.innerHTML = `<p>Failed to load feedback: ${e.message}</p>`;
        }
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    function setupAudioControls() {
        playPauseBtn.disabled = false;
        summaryPlayer.addEventListener('loadedmetadata', function() {
            document.getElementById('totalTime').textContent = formatTime(summaryPlayer.duration || 0);
        });
        summaryPlayer.addEventListener('timeupdate', function() {
            const ct = summaryPlayer.currentTime || 0;
            const dur = summaryPlayer.duration || 1;
            document.getElementById('currentTime').textContent = formatTime(ct);
            document.getElementById('audioProgress').style.width = ((ct / dur) * 100) + '%';
        });
        playPauseBtn.addEventListener('click', function() {
            const playIcon = document.getElementById('playIcon');
            const pauseIcon = document.getElementById('pauseIcon');
            if (summaryPlayer.paused) {
                summaryPlayer.play();
                playIcon.style.display = 'none';
                pauseIcon.style.display = 'block';
            } else {
                summaryPlayer.pause();
                playIcon.style.display = 'block';
                pauseIcon.style.display = 'none';
            }
        });
    }

    function toggleSummaryAudio() {
        if (playPauseBtn) playPauseBtn.click();
    }

    function downloadPdfReport() {
        const content = 'Interview Results Report\n\nYour interview feedback will be available in the application.';
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'interview_results_report.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function startNewInterview() {
        localStorage.clear();
        sessionStorage.clear();
        try {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(registrations => {
                    registrations.forEach(registration => registration.unregister());
                });
            }
        } catch (e) {}
        window.location.href = '/?reset=1';
    }

    function handlePageRefresh() {
        const urlParams = new URLSearchParams(window.location.search);
        const shouldReset = urlParams.get('reset') === '1';
        if (!shouldReset && !document.referrer.includes('/interview')) {}
    }
});

// **GLOBAL RESET FUNCTION** - Call this on any page refresh across the app
function resetInterviewSession() {
    console.log('Resetting interview session...');

    // Clear all interview-related data
    localStorage.clear();
    sessionStorage.clear();

    // Navigate back to login page
    window.location.href = '/';
}

// **Add global refresh handler to all pages**
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        resetInterviewSession();
    }
});

// **Handle browser refresh on any page**
window.addEventListener('beforeunload', function() {});

window.addEventListener('load', function() {});
