const socket = io();
let localState = { printers: [], jobs: [] };

// ─── SOCKETS ──────────────────────────────────────────────────────────────────
socket.on('connect', () => { showToast('Connected', 'Live sync active with server.', 'success'); });

socket.on('state_update', (newState) => {
    if (newState && newState.printers) {
        localState.printers = newState.printers;
        renderMiniPrinters();
        if (document.getElementById('page-printers').classList.contains('active')) renderFullPrinters();
    }
});

socket.on('jobs_updated', () => {
    loadJobs();
});

socket.on('notification', (data) => {
    if (data.target === 'admin' || !data.target) {
        showToast(data.title, data.message, data.type || 'info');
        loadJobs();
    }
});

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const pageEl = document.getElementById('page-' + name);
    if (pageEl) pageEl.classList.add('active');
    
    const navItem = document.querySelector(`[data-page="${name}"]`);
    if (navItem) navItem.classList.add('active');

    if (name === 'dashboard')   loadDashboardData();
    if (name === 'queue')       loadJobs();
    if (name === 'printers')    renderFullPrinters();
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function loadDashboardData() {
    const jobs = localState.jobs;
    document.getElementById('stat-total').textContent = jobs.length;
    document.getElementById('stat-pending').textContent = jobs.filter(j => j.status === 'pending').length;
    document.getElementById('stat-printing').textContent = jobs.filter(j => j.status === 'printing').length;
    document.getElementById('stat-done').textContent = jobs.filter(j => j.status === 'completed').length;

    renderMiniPrinters();

    const recent = document.getElementById('dash-recent-jobs');
    if (!jobs.length) { recent.innerHTML = '<p class="empty-state-sm">No submissions yet.</p>'; return; }
    
    recent.innerHTML = `<table class="data-table">
        <thead><tr><th>Job ID</th><th>Student</th><th>File</th><th>Status</th></tr></thead>
        <tbody>${jobs.slice(0, 5).map(j => `
            <tr>
                <td><strong>${j.id}</strong></td>
                <td>${j.student}</td>
                <td>${j.file}</td>
                <td><span class="status-pill s-${j.status}">${j.status.toUpperCase()}</span></td>
            </tr>`).join('')}
        </tbody>
    </table>`;
}

function renderMiniPrinters() {
    const mini = document.getElementById('dash-printer-grid');
    if (!mini) return;
    mini.innerHTML = localState.printers.map(p => `
        <div class="printer-mini-card">
            <div><span class="printer-mini-dot ${p.status === 'free' ? 'dot-free' : 'dot-occ'}"></span>
                 <span class="printer-mini-status ${p.status === 'free' ? 'status-free-badge' : 'status-occ-badge'}">${p.status === 'free' ? 'FREE' : 'OCCUPIED'}</span>
            </div>
            <div class="printer-mini-name">${p.name}</div>
        </div>`).join('');
}

// ─── PRINTERS ────────────────────────────────────────────────────────────────
function renderFullPrinters() {
    const grid = document.getElementById('full-printer-grid');
    if (!grid || !localState.printers.length) return;

    const fdm = localState.printers.filter(p => p.type === 'FDM');
    const sla = localState.printers.filter(p => p.type === 'SLA');

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
            <button class="btn-orange-full-printer" onclick="togglePrinterStatus(${p.id})">
                <i class="fa-solid fa-rotate"></i> Change Status Manually
            </button>
            ${!isFree ? `<div style="margin-top:0.5rem;font-size:0.8rem;color:#f85149"><i class="fa-solid fa-ban"></i> Busy with Job ${p.currentJob || ''}</div>` : ''}
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

function togglePrinterStatus(id) { socket.emit('toggle_printer', { id: id }); }

// ─── SUBMISSIONS QUEUE ───────────────────────────────────────────────────────
function renderLabJobs() {
    const tbody = document.getElementById('lab-job-queue');
    if (!tbody) return;
    tbody.innerHTML = '';
    localState.jobs.forEach(job => {
        let actionBtn = '';
        if (job.status === 'pending') {
            actionBtn = `<button class="btn-orange-sm" onclick="openReviewModal('${job.id}')"><i class="fa-solid fa-magnifying-glass"></i> Review</button>`;
        } else if (job.status === 'approved') {
            actionBtn = `<button class="btn-orange-sm" style="background:#22c55e" onclick="assignPrinter('${job.id}')"><i class="fa-solid fa-play"></i> Start Print</button>`;
        } else if (job.status === 'printing') {
            actionBtn = `<button class="btn-orange-sm" style="background:#3b82f6" onclick="openCompleteModal('${job.id}')"><i class="fa-solid fa-check-double"></i> Complete</button>`;
        } else {
            actionBtn = `<span style="color:#8b949e;font-size:0.85rem">No Action</span>`;
        }
        tbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td><strong>${job.id}</strong></td>
                <td>${job.student}</td>
                <td>${job.file}</td>
                <td>${job.material}</td>
                <td><span class="status-pill s-${job.status}">${job.status.toUpperCase()}</span></td>
                <td>${actionBtn}</td>
            </tr>
        `);
    });
}

async function loadJobs() {
    try {
        const res = await fetch('/api/admin/jobs');
        if (res.status === 200) {
            localState.jobs = await res.json();
            renderLabJobs();
            if (document.getElementById('page-dashboard').classList.contains('active')) loadDashboardData();
        }
    } catch (err) {
        console.error("Error loading admin jobs:", err);
    }
}

// ─── MODALS & ACTIONS ────────────────────────────────────────────────────────
let currentReviewJobId = null;
function openReviewModal(jobId) {
    currentReviewJobId = jobId;
    const job = localState.jobs.find(j => j.id === jobId);
    if (!job) return;
    document.getElementById('review-job-id').innerText = jobId;
    let fileLink = job.saved_file 
        ? `<a href="/uploads/${job.saved_file}" target="_blank" class="btn-download"><i class="fa-solid fa-download"></i> Download STL</a>` 
        : '<span style="color:#f85149">No file uploaded</span>';
        
    document.getElementById('review-details').innerHTML = `
        <div style="display:flex; flex-direction:column; gap:0.6rem">
            <p><strong>Student:</strong> ${job.student} (${job.phone || 'No phone'})</p>
            <p><strong>File Name:</strong> ${job.file}</p>
            <p><strong>Material:</strong> ${job.material}</p>
            <p><strong>Notes / Requested:</strong></p>
            <div style="background:#0d1117; padding:0.6rem; border-radius:6px; font-size:0.85rem; border:1px solid #21262d; white-space:pre-wrap">${job.notes || 'None'}</div>
            <div style="margin-top:0.5rem">${fileLink}</div>
        </div>
    `;
    document.getElementById('review-comment').value = '';
    document.getElementById('review-modal').classList.add('active');
}
function closeReviewModal() { document.getElementById('review-modal').classList.remove('active'); currentReviewJobId = null; }

async function decideJob(decision) {
    if (!currentReviewJobId) return;
    const comment = document.getElementById('review-comment').value.trim();
    if (decision === 'rejected' && !comment) {
        alert("Please write a rejection reason commenting on what is wrong in the design.");
        return;
    }
    try {
        const res = await fetch(`/api/admin/jobs/${encodeURIComponent(currentReviewJobId)}/review`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ decision: decision, comment: comment })
        });
        const data = await res.json();
        if (data.success) {
            closeReviewModal();
            loadJobs();
            showToast('Success', `Job ${currentReviewJobId} has been ${decision}.`, 'success');
        } else {
            showToast('Error', data.error || 'Failed to submit decision', 'danger');
        }
    } catch (err) {
        showToast('Error', 'Network error reviewing job', 'danger');
    }
}

async function assignPrinter(jobId) {
    try {
        const res = await fetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/assign`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'}
        });
        const data = await res.json();
        if (data.success) {
            loadJobs();
            showToast('Success', `Printer assigned. Printing started for job ${jobId}.`, 'success');
        } else {
            showToast('Error', data.error || 'Failed to assign printer', 'danger');
        }
    } catch (err) {
        showToast('Error', 'Network error assigning printer', 'danger');
    }
}

// Complete Modal Actions
let currentCompleteJobId = null;
function openCompleteModal(jobId) {
    currentCompleteJobId = jobId;
    document.getElementById('complete-job-id').textContent = jobId;
    document.getElementById('complete-cost').value = '';
    document.getElementById('complete-modal').classList.add('active');
}
function closeCompleteModal() {
    document.getElementById('complete-modal').classList.remove('active');
    currentCompleteJobId = null;
}
async function submitCompleteJob() {
    if (!currentCompleteJobId) return;
    const cost = document.getElementById('complete-cost').value;
    if (!cost) { alert("Please enter the amount to be paid."); return; }
    try {
        const res = await fetch(`/api/admin/jobs/${encodeURIComponent(currentCompleteJobId)}/complete`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ cost: cost })
        });
        const data = await res.json();
        if (data.success) {
            closeCompleteModal();
            loadJobs();
            showToast('Success', `Job ${currentCompleteJobId} completed. SMS notification sent.`, 'success');
        } else {
            showToast('Error', data.error || 'Failed to complete job', 'danger');
        }
    } catch (err) {
        showToast('Error', 'Network error completing job', 'danger');
    }
}

// SMS tools
function openSmsModal() { showPage('sms'); }
function sendSms(event) {
    event.preventDefault();
    const msg = document.getElementById('sms-message').value;
    const jobId = document.getElementById('sms-job-id').value;
    socket.emit('send_custom_sms', { message: msg, job_id: jobId });
    document.getElementById('sms-form').reset();
    showToast('Success', jobId ? `SMS targeted to job ${jobId}.` : 'SMS broadcasted to all students.', 'success');
}

// Toast Notifications Helper
function showToast(title, message, type='primary') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa-solid fa-info-circle toast-icon" style="color: var(--${type})"></i>
                       <div class="toast-content"><h4 style="color: var(--${type})">${title}</h4><p>${message}</p></div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'fadeOut 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 5000);
}

// ─── INITIALIZATION ───────────────────────────────────────────────────────────
loadJobs();
fetch('/api/printers').then(r => r.json()).then(data => {
    localState.printers = data;
    renderMiniPrinters();
});
showPage('dashboard');
