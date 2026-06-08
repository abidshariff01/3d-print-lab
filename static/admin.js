const socket = io();
let localState = { printers: [], jobs: [] };

socket.on('connect', () => { showToast('Connected', 'Live sync active with server.', 'success'); });

socket.on('state_update', (newState) => {
    localState = newState;
    renderPrinters();
    renderLabJobs();
});

socket.on('notification', (data) => {
    if (data.target === 'admin' || !data.target) {
        showToast(data.title, data.message, data.type || 'info');
    }
});

function renderPrinters() {
    const grid = document.getElementById('lab-printer-grid');
    grid.innerHTML = '';
    localState.printers.forEach(printer => {
        const isFree = printer.status === 'free';
        const html = `
            <div class="printer-card ${isFree ? 'status-free' : 'status-occupied'} clickable-printer" onclick="togglePrinterStatus(${printer.id})">
                <i class="fa-solid fa-cube printer-icon"></i>
                <div class="printer-name">${printer.name}</div>
                <div class="status-badge"><i class="fa-solid ${isFree ? 'fa-check-circle' : 'fa-ban'}"></i> ${isFree ? 'FREE' : 'OCCUPIED'}</div>
                <div class="subtitle">${printer.currentJob ? `Job: ${printer.currentJob}` : 'Ready'}</div>
            </div>
        `;
        grid.insertAdjacentHTML('beforeend', html);
    });
}

function togglePrinterStatus(id) { socket.emit('toggle_printer', { id: id }); }

function renderLabJobs() {
    const tbody = document.getElementById('lab-job-queue');
    tbody.innerHTML = '';
    localState.jobs.forEach(job => {
        let actionBtn = job.status === 'pending' ? `<button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="openReviewModal('${job.id}')">Review</button>` :
                        job.status === 'approved' ? `<button class="btn btn-success" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="assignPrinter('${job.id}')">Assign</button>` : `<span class="subtitle">No Action</span>`;
        tbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td><strong>${job.id}</strong></td>
                <td>${job.student}</td>
                <td>${job.file}</td>
                <td><span class="status-badge badge-${job.status}">${job.status.toUpperCase()}</span></td>
                <td>${actionBtn}</td>
            </tr>
        `);
    });
}

let currentReviewJobId = null;
function openReviewModal(jobId) {
    currentReviewJobId = jobId;
    const job = localState.jobs.find(j => j.id === jobId);
    document.getElementById('review-job-id').innerText = jobId;
    let fileLink = job.saved_file ? `<a href="/uploads/${job.saved_file}" target="_blank" class="btn btn-primary" style="margin-left: 10px; padding: 2px 8px; font-size: 0.8rem; text-decoration: none;"><i class="fa-solid fa-download"></i> Download</a>` : '';
    document.getElementById('review-details').innerHTML = `<p><strong>Student:</strong> ${job.student}</p><p style="margin-top: 10px;"><strong>File:</strong> ${job.file} ${fileLink}</p>`;
    document.getElementById('review-modal').classList.add('active');
}

function openSmsModal() { document.getElementById('sms-modal').classList.add('active'); }
function closeSmsModal() { document.getElementById('sms-modal').classList.remove('active'); }
function sendSms(event) {
    event.preventDefault();
    const msg = document.getElementById('sms-message').value;
    const jobId = document.getElementById('sms-job-id').value;
    socket.emit('send_custom_sms', { message: msg, job_id: jobId });
    closeSmsModal();
    document.getElementById('sms-form').reset();
    showToast('Success', jobId ? `SMS targeted to job ${jobId}.` : 'SMS broadcasted to all students.', 'success');
}
function closeReviewModal() { document.getElementById('review-modal').classList.remove('active'); currentReviewJobId = null; }
function decideJob(decision) { if (currentReviewJobId) { socket.emit('review_job', { id: currentReviewJobId, decision: decision }); closeReviewModal(); } }
function assignPrinter(jobId) { socket.emit('assign_printer', { id: jobId }); }

function showToast(title, message, type='primary') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa-solid fa-info-circle toast-icon" style="color: var(--${type})"></i>
                       <div class="toast-content"><h4 style="color: var(--${type})">${title}</h4><p>${message}</p></div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'fadeOut 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 5000);
}
