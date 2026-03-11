// Auth Logic

// Redirect to dashboard if already logged in (only on login page)
var loginForm = document.getElementById('loginForm');
if (loginForm) {
    var token = localStorage.getItem('token');
    var role = localStorage.getItem('role');
    if (token && role) {
        window.location.replace(role === 'faculty' ? 'faculty.html' : 'student.html');
    }
}

// Login Form handler
if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var errorMsg = document.getElementById('errorMsg');
        var loginBtn = document.getElementById('loginBtn');
        var username = document.getElementById('username').value.trim();
        var password = document.getElementById('password').value.trim();

        if (!username || !password) {
            errorMsg.textContent = 'Please enter both username and password';
            errorMsg.classList.add('show');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="spinner"></span> Signing in...';
        errorMsg.classList.remove('show');

        fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password })
        })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                if (!result.ok) throw new Error(result.data.error || 'Login failed');

                localStorage.setItem('token', result.data.token);
                localStorage.setItem('role', result.data.role);
                localStorage.setItem('userName', result.data.name);
                localStorage.setItem('userId', result.data.userId);

                window.location.href = result.data.role === 'faculty' ? 'faculty.html' : 'student.html';
            })
            .catch(function (err) {
                errorMsg.textContent = err.message;
                errorMsg.classList.add('show');
                loginBtn.disabled = false;
                loginBtn.textContent = 'Sign In';
            });
    });
}

// Get auth header
function getAuthHeaders() {
    return { 'x-auth-token': localStorage.getItem('token') || '' };
}

// Logout
function logout() {
    var token = localStorage.getItem('token') || '';
    localStorage.clear();
    window.location.replace('index.html');
    fetch('/api/logout', { method: 'POST', headers: { 'x-auth-token': token } }).catch(function () { });
}

// Auth guard — only checks localStorage, used on protected pages
function requireAuth(requiredRole) {
    var token = localStorage.getItem('token');
    var role = localStorage.getItem('role');
    if (!token || !role) {
        localStorage.clear();
        window.location.replace('index.html');
        return false;
    }
    if (requiredRole && role !== requiredRole) {
        localStorage.clear();
        window.location.replace('index.html');
        return false;
    }
    return true;
}

// Toast notification
function showToast(message, type) {
    type = type || 'success';
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = '<p>' + message + '</p>';
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('show'); });
    setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () { toast.remove(); }, 400);
    }, 3000);
}
