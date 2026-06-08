const socket = io();
let printerState = [];
let msgCount = 0;

// ─── SOCKET ───────────────────────────────────────────────────────────────────
socket.on('connect', () => showToast('Connected', 'Live sync active.'));
socket.on('state_update', (data) => { printerState = data.printers; renderPrinters(); });
socket.on('notification', (data) => {
    if (data.target === 'student' || !data.target) {
        showToast(data.title, data.message);
        msgCount++;
        const b = document.getElementById('notif-badge');
        b.textContent = msgCount; b.style.display = 'inline';
        // Reload notifications if on that page
        if (document.getElementById('page-notifications').classList.contains('active')) loadNotifications();
    }
});
socket.on('jobs_updated', () => {
    loadJobs();
    if (document.getElementById('page-dashboard').classList.contains('active')) loadDashboardData();
});

// ─── PAGE NAVIGATION ──────────────────────────────────────────────────────────
function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');
    document.querySelector(`[data-page="${name}"]`).classList.add('active');

    if (name === 'dashboard')     loadDashboardData();
    if (name === 'submissions')   loadJobs();
    if (name === 'notifications') loadNotifications();
    if (name === 'printers')      renderFullPrinters();
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function loadDashboardData() {
    const jobs = await fetchJobs();
    document.getElementById('stat-total').textContent    = jobs.length;
    document.getElementById('stat-pending').textContent  = jobs.filter(j => j.status === 'pending').length;
    document.getElementById('stat-printing').textContent = jobs.filter(j => j.status === 'printing').length;
    document.getElementById('stat-done').textContent     = jobs.filter(j => j.status === 'completed').length;

    const recent = document.getElementById('dash-recent-jobs');
    if (!jobs.length) { recent.innerHTML = '<p class="empty-state-sm">No submissions yet.</p>'; return; }
    recent.innerHTML = `<table class="data-table">
        <thead><tr><th>Job ID</th><th>File</th><th>Material</th><th>Status</th></tr></thead>
        <tbody>${jobs.slice(0, 5).map(j => `
            <tr>
                <td><strong>${j.id}</strong></td>
                <td>${j.file}</td>
                <td>${j.material}</td>
                <td><span class="status-pill s-${j.status}">${j.status.toUpperCase()}</span></td>
            </tr>`).join('')}
        </tbody>
    </table>`;
}

// ─── PRINTERS ────────────────────────────────────────────────────────────────
function renderPrinters() {
    const mini = document.getElementById('dash-printer-grid');
    if (!mini) return;
    mini.innerHTML = printerState.map(p => `
        <div class="printer-mini-card">
            <div><span class="printer-mini-dot ${p.status === 'free' ? 'dot-free' : 'dot-occ'}"></span>
                 <span class="printer-mini-status ${p.status === 'free' ? 'status-free-badge' : 'status-occ-badge'}">${p.status === 'free' ? 'FREE' : 'OCCUPIED'}</span>
            </div>
            <div class="printer-mini-name">${p.name}</div>
        </div>`).join('');
    renderFullPrinters();
}

function renderFullPrinters() {
    const grid = document.getElementById('full-printer-grid');
    if (!grid || !printerState.length) return;

    // Group by type
    const fdm = printerState.filter(p => p.type === 'FDM');
    const sla = printerState.filter(p => p.type === 'SLA');

    const renderCard = p => {
        const isFree = p.status === 'free';
        return `
        <div class="printer-full-card">
            <div class="printer-full-header">
                <div style="display:flex;align-items:center;gap:0.5rem">
                    <span class="printer-mini-dot ${isFree ? 'dot-free' : 'dot-occ'}"></span>
                    <span class="printer-full-name">${p.name}</span>
                    ${p.tag ? `<span style="font-size:0.72rem;background:#21262d;padding:0.15rem 0.5rem;border-radius:10px;color:#8b949e">${p.tag}</span>` : ''}
                </div>
                <span class="printer-mini-status ${isFree ? 'status-free-badge' : 'status-occ-badge'}">${isFree ? 'FREE' : 'OCCUPIED'}</span>
            </div>
            <div class="printer-full-model">${p.model}</div>
            <div class="printer-specs">
                <span style="color:#8b949e;font-size:0.8rem">🧵 ${p.materials}</span><br>
                <span style="color:#8b949e;font-size:0.8rem">📐 ${p.max_size}</span>
            </div>
            ${!isFree ? `<div style="margin-top:0.5rem;font-size:0.8rem;color:#f85149"><i class="fa-solid fa-ban"></i> Currently busy — Job ${p.currentJob || ''}</div>` : ''}
        </div>`;
    };

    let html = '';
    if (fdm.length) {
        html += `<div class="printer-type-label"><i class="fa-solid fa-industry"></i> FDM Printers</div>`;
        html += `<div class="printer-full-grid-inner">${fdm.map(renderCard).join('')}</div>`;
    }
    if (sla.length) {
        html += `<div class="printer-type-label" style="margin-top:1.5rem"><i class="fa-solid fa-flask"></i> SLA Resin Printers</div>`;
        html += `<div class="printer-full-grid-inner">${sla.map(renderCard).join('')}</div>`;
    }
    grid.innerHTML = html;
}


// ─── JOBS ────────────────────────────────────────────────────────────────────
async function fetchJobs() {
    const res = await fetch('/api/student/jobs');
    return await res.json();
}

async function loadJobs() {
    const jobs = await fetchJobs();
    const el = document.getElementById('submissions-content');
    if (!jobs.length) {
        el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-inbox" style="font-size:3rem;color:#30363d;margin-bottom:1rem"></i><p>No submissions yet. Upload your first design!</p></div>`;
        return;
    }
    el.innerHTML = `<table class="data-table">
        <thead><tr><th>Job ID</th><th>File</th><th>Material</th><th>Date</th><th>Printer</th><th>Status</th></tr></thead>
        <tbody>${jobs.map(j => `
            <tr>
                <td><strong>${j.id}</strong></td>
                <td>${j.file}</td>
                <td>${j.material}</td>
                <td>${j.date}</td>
                <td>${j.printer}</td>
                <td><span class="status-pill s-${j.status}">${j.status.toUpperCase()}</span></td>
            </tr>`).join('')}
        </tbody>
    </table>`;
}

// ─── UPLOAD ──────────────────────────────────────────────────────────────────
function handleFileSelect(input) {
    if (!input.files.length) return;
    const file = input.files[0];
    if (!file.name.toLowerCase().endsWith('.stl')) {
        showError('upload-error', 'Only .stl files are allowed!');
        input.value = '';
        return;
    }
    document.getElementById('file-name-display').textContent = file.name;
    document.getElementById('file-selected').style.display = 'block';
    if (!document.getElementById('job-project-name').value) document.getElementById('job-project-name').value = file.name;
    document.getElementById('upload-error').style.display = 'none';
}

// Drag and drop
const dz = document.getElementById('drop-zone');
if (dz) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = '#f97316'; });
    dz.addEventListener('dragleave', () => { dz.style.borderColor = '#30363d'; });
    dz.addEventListener('drop', e => {
        e.preventDefault(); dz.style.borderColor = '#30363d';
        const dt = e.dataTransfer;
        if (dt.files.length) { document.getElementById('stl-file').files = dt.files; handleFileSelect(document.getElementById('stl-file')); }
    });
}

async function submitJob() {
    const fileInput = document.getElementById('stl-file');
    if (!fileInput.files.length) return showError('upload-error', 'Please select an STL file first.');
    const fileName = fileInput.files[0].name;
    if (!fileName.toLowerCase().endsWith('.stl')) return showError('upload-error', 'Only .stl files are allowed!');

    const body = {
        file: document.getElementById('job-project-name').value || fileName,
        material: document.getElementById('job-material').value,
        layer_height: document.getElementById('job-layer').value,
        infill: document.getElementById('job-infill').value,
        notes: document.getElementById('job-notes').value
    };

    const res = await fetch('/api/student/jobs/submit', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) {
        showToast('Job Submitted', `Job ${data.job_id} submitted successfully!`);
        document.getElementById('stl-file').value = '';
        document.getElementById('file-selected').style.display = 'none';
        document.getElementById('job-project-name').value = '';
        document.getElementById('job-notes').value = '';
        showPage('submissions');
    } else {
        showError('upload-error', data.error || 'Submission failed.');
    }
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
async function loadNotifications() {
    const res = await fetch('/api/student/notifications');
    const notifs = await res.json();
    const el = document.getElementById('notif-content');
    const badge = document.getElementById('notif-badge');
    badge.style.display = 'none'; msgCount = 0;

    if (!notifs.length) {
        el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-bell-slash" style="font-size:3rem;color:#30363d;margin-bottom:1rem"></i><p>No notifications yet.</p></div>`;
        return;
    }
    el.innerHTML = notifs.map(n => `
        <div class="notif-item">
            <div class="notif-dot"></div>
            <div>
                <div class="notif-title">${n.title}</div>
                <div class="notif-msg">${n.message}</div>
                <div class="notif-time">${n.time}</div>
            </div>
        </div>`).join('');
}

async function clearNotifications() {
    await fetch('/api/student/notifications/clear', { method: 'POST' });
    loadNotifications();
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────
async function saveProfile() {
    const body = {
        name: document.getElementById('p-name').value,
        username: document.getElementById('p-username').value,
        phone: document.getElementById('p-phone').value,
        department: document.getElementById('p-dept').value
    };
    const res = await fetch('/api/student/profile', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    const data = await res.json();
    const msg = document.getElementById('profile-msg');
    msg.style.display = 'block';
    if (data.success) { msg.style.color = '#22c55e'; msg.textContent = '✓ Profile saved successfully.'; }
    else { msg.style.color = '#f85149'; msg.textContent = data.error || 'Failed to save.'; }
}

async function changePassword() {
    const body = {
        current_password: document.getElementById('p-curr-pass').value,
        new_password: document.getElementById('p-new-pass').value
    };
    if (!body.current_password || !body.new_password) {
        showPassMsg('Please fill in both password fields.', false); return;
    }
    const res = await fetch('/api/student/change_password', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    const data = await res.json();
    showPassMsg(data.success ? '✓ Password updated successfully.' : (data.error || 'Failed.'), data.success);
    if (data.success) { document.getElementById('p-curr-pass').value = ''; document.getElementById('p-new-pass').value = ''; }
}
function showPassMsg(msg, ok) {
    const el = document.getElementById('pass-msg');
    el.style.display = 'block'; el.style.color = ok ? '#22c55e' : '#f85149'; el.textContent = msg;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function showError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg; el.style.display = 'block';
}

function showToast(title, msg) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = `<div class="toast-title">${title}</div><div class="toast-msg">${msg}</div>`;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 5000);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
loadDashboardData();
fetch('/api/printers').then(r => r.json()).then(data => { printerState = data; renderPrinters(); });
