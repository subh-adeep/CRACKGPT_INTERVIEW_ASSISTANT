document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const resumeBtn = document.getElementById('resumeBtn');
    const jobBtn = document.getElementById('jobBtn');
    const resumeFile = document.getElementById('resumeFile');
    const jobFile = document.getElementById('jobFile');
    const resumeFileName = document.getElementById('resumeFileName');
    const jobFileName = document.getElementById('jobFileName');
    const jobCategory = document.getElementById('jobCategory');
    const jobRole = document.getElementById('jobRole');
    const startInterviewBtn = document.getElementById('startInterview');

    let jobCategories = {};
    let selectedResume = null;
    let selectedJob = null;
    let interviewSettings = {
        duration: 15,
        voice: 'en-IN-Neural2-B'
    };

    // Load job categories
    fetch('/job_categories.json')
        .then(response => response.json())
        .then(data => {
            jobCategories = data.categories;
            populateJobCategories();
        })
        .catch(error => {
            console.error('Failed to load job categories:', error);
        });

    // File upload handlers
    resumeBtn.addEventListener('click', () => {
        resumeFile.click();
    });

    jobBtn.addEventListener('click', () => {
        jobFile.click();
    });

    resumeFile.addEventListener('change', handleFileSelect.bind(null, 'resume'));
    jobFile.addEventListener('change', handleFileSelect.bind(null, 'job'));

    // Form change handlers
    jobCategory.addEventListener('change', handleCategoryChange);
    ['duration', 'voice'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateSettings);
    });

    // Start interview handler
    startInterviewBtn.addEventListener('click', startInterview);

    // Functions
    function populateJobCategories() {
        const select = document.getElementById('jobCategory');
        select.innerHTML = '<option value="">Select a category...</option>';

        jobCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.name;
            option.textContent = category.name;
            select.appendChild(option);
        });
    }

    function handleFileSelect(type, event) {
        const file = event.target.files[0];
        if (!file) return;

        const displayName = type === 'resume' ? resumeFileName : jobFileName;

        // Validate file type
        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().match(/\.(pdf|docx?)$/)) {
            alert(`Please select a valid PDF or Word document for ${type === 'resume' ? 'your resume' : 'job description'}.`);
            event.target.value = '';
            return;
        }

        // Update display
        displayName.textContent = file.name;
        displayName.style.color = '#10b981';

        // Store file reference
        if (type === 'resume') {
            selectedResume = file;
        } else {
            selectedJob = file;
        }

        checkFormValidity();
    }

    function handleCategoryChange(event) {
        const categoryName = event.target.value;
        const roleSelect = document.getElementById('jobRole');

        if (!categoryName) {
            roleSelect.innerHTML = '<option value="">Select a role...</option>';
            roleSelect.disabled = true;
            return;
        }

        const category = jobCategories.find(cat => cat.name === categoryName);
        if (category) {
            roleSelect.innerHTML = '<option value="">Select a role...</option>';
            category.roles.forEach(role => {
                const option = document.createElement('option');
                option.value = role;
                option.textContent = role;
                roleSelect.appendChild(option);
            });
            roleSelect.disabled = false;
        }

        checkFormValidity();
    }

    function updateSettings(event) {
        const { id, value } = event.target;
        interviewSettings[id] = id === 'duration' ? parseInt(value) : value;
        localStorage.setItem('interviewSettings', JSON.stringify(interviewSettings));
    }

    function checkFormValidity() {
        const hasResume = selectedResume !== null;
        const hasJob = selectedJob !== null;
        const hasCategory = jobCategory.value !== '';
        const hasRole = jobRole.value !== '';

        const isValid = (hasResume || hasJob) && hasCategory && hasRole;
        startInterviewBtn.disabled = !isValid;

        if (isValid) {
            startInterviewBtn.classList.remove('disabled');
        } else {
            startInterviewBtn.classList.add('disabled');
        }
    }

    async function startInterview() {
        if (startInterviewBtn.disabled) return;

        try {
            // Show loading state
            startInterviewBtn.disabled = true;
            startInterviewBtn.textContent = 'Processing...';

            // Upload documents and set context
            const formData = new FormData();
            if (selectedResume) {
                formData.append('resume', selectedResume);
            }
            if (selectedJob) {
                formData.append('job', selectedJob);
            }

            const uploadResponse = await fetch('/api/upload_documents', {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to upload documents');
            }

            // Store interview settings
            const settingsData = {
                duration: interviewSettings.duration,
                voice: interviewSettings.voice,
                category: jobCategory.value,
                role: jobRole.value
            };

            localStorage.setItem('interviewSettings', JSON.stringify(settingsData));

            // Navigate to permissions page
            window.location.href = '/permissions';

        } catch (error) {
            console.error('Error starting interview:', error);
            alert('Failed to start interview. Please try again.');
            startInterviewBtn.disabled = false;
            startInterviewBtn.textContent = 'Start Interview';
        }
    }

    // Initialize form
    checkFormValidity();

    // Load stored settings
    const storedSettings = localStorage.getItem('interviewSettings');
    if (storedSettings) {
        try {
            const settings = JSON.parse(storedSettings);
            Object.assign(interviewSettings, settings);
            document.getElementById('duration').value = settings.duration || 15;
            document.getElementById('voice').value = settings.voice || 'en-IN-Neural2-B';
        } catch (e) {
            console.error('Failed to load stored settings:', e);
        }
    }
});
