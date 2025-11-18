document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const loginBtn = document.getElementById('loginBtn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    // Initialize with demo credentials
    setupDemoLogin();

    // Event listeners
    loginBtn.addEventListener('click', handleLogin);

    // Functions
    function setupDemoLogin() {
        // Demo credentials are already set in HTML
        // This could be expanded for actual authentication logic
    }

    async function handleLogin() {
        // Simple demo login - in a real app, this would authenticate with a server
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            alert('Please enter both username and password');
            return;
        }

        // Show loading state
        loginBtn.disabled = true;
        loginBtn.textContent = 'Logging in...';

        try {
            // Store login state
            localStorage.setItem('userLoggedIn', 'true');
            localStorage.setItem('username', username);

            // Navigate to setup page
            window.location.href = '/setup';

        } catch (error) {
            console.error('Login failed:', error);
            alert('Login failed. Please try again.');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Login to Start Interview';
        }
    }

    // Check if already logged in
    const isLoggedIn = localStorage.getItem('userLoggedIn');
    if (isLoggedIn === 'true') {
        // User is already logged in, redirect to setup
        window.location.href = '/setup';
    }
});
