// Connect to WebSocket server
const socket = io();

// Local State Copy
let localState = {
    printers: [],
    jobs: []
};
let msgCount = 0;

// --- SOCKET.IO EVENTS ---
socket.on('connect', () => {
    showToast('Connected', 'Live sync active with server.', 'success');
});

socket.on('state_update', (newState) => {
    localState = newState;
    renderPrinters();
    renderStudentJobs();
    renderLabJobs();
});

socket.on('notification', (data) => {
    const type = data.type || 'info';
    showToast(data.title, data.message, type);
    
    // Increment message counter if it's an SMS
    if(data.title === "SMS Sent") {
        msgCount++;
        document.getElementById('student-msg-badge').innerText = msgCount;
    }
});

// --- VIEW TOGGLING ---
function switchView(view) {
    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${view}-view`).classList.add('active');

    document.querySelectorAll('.dashboard').forEach(db => db.classList.remove('active'));
    document.getElementById(`${view}-dashboard`).classList.add('active');

    const title = document.getElementById('dashboard-title');
    const user = document.getElementById('user-name');
    if (view === 'student') {
        title.innerText = 'Student Dashboard';
        user.innerText = 'Welcome, Student';
    } else {
        title.innerText = 'Lab Person Dashboard';
        user.innerText = 'Admin User';
    }
}

// --- RENDERING PRINTERS ---
function renderPrinters() {
    const studentGrid = document.getElementById('student-printer-grid');
    const labGrid = document.getElementById('lab-printer-grid');
    
    studentGrid.innerHTML = '';
    labGrid.innerHTML = '';

    localState.printers.forEach(printer => {
        const isFree = printer.status === 'free';
        const statusClass = isFree ? 'status-free' : 'status-occupied';
        const iconClass = isFree ? 'fa-check-circle' : 'fa-ban';
        const statusText = isFree ? 'FREE' : 'OCCUPIED';
        const jobText = printer.currentJob ? `Job: ${printer.currentJob}` : 'Ready';

        const studentHTML = `
            <div class="printer-card ${statusClass}">
                <i class="fa-solid fa-cube printer-icon"></i>
                <div class="printer-name">${printer.name}</div>
                <div class="status-badge"><i class="fa-solid ${iconClass}"></i> ${statusText}</div>
                <div class="subtitle">${jobText}</div>
            </div>
        `;
        studentGrid.insertAdjacentHTML('beforeend', studentHTML);

        const labHTML = `
            <div class="printer-card ${statusClass} clickable-printer" onclick="togglePrinterStatus(${printer.id})">
                <i class="fa-solid fa-cube printer-icon"></i>
                <div class="printer-name">${printer.name}</div>
                <div class="status-badge"><i class="fa-solid ${iconClass}"></i> ${statusText}</div>
                <div class="subtitle">${jobText}</div>
            </div>
        `;
        labGrid.insertAdjacentHTML('beforeend', labHTML);
    });
}

function togglePrinterStatus(id) {
    // Send event to server
    socket.emit('toggle_printer', { id: id });
}

// --- JOB MANAGEMENT ---
function renderStudentJobs() {
    const tbody = document.getElementById('student-submissions-list');
    tbody.innerHTML = '';
    
    // In a real app, we'd filter by logged-in user. We show all for demo or just some.
    localState.jobs.slice(0, 5).forEach(job => {
        const badgeClass = `badge-${job.status}`;
        tbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td><strong>${job.id}</strong></td>
                <td>${job.file}</td>
                <td>${job.date}</td>
                <td><span class="status-badge ${badgeClass}">${job.status.toUpperCase()}</span></td>
            </tr>
        `);
    });
}

function renderLabJobs() {
    const tbody = document.getElementById('lab-job-queue');
    tbody.innerHTML = '';
    
    localState.jobs.forEach(job => {
        const badgeClass = `badge-${job.status}`;
        let actionBtn = '';
        
        if (job.status === 'pending') {
            actionBtn = `<button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="openReviewModal('${job.id}')">Review</button>`;
        } else if (job.status === 'approved') {
            actionBtn = `<button class="btn btn-success" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="assignPrinter('${job.id}')">Assign</button>`;
        } else {
            actionBtn = `<span class="subtitle">No Action</span>`;
        }

        tbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td><strong>${job.id}</strong></td>
                <td>${job.student}</td>
                <td>${job.file}</td>
                <td><span class="status-badge ${badgeClass}">${job.status.toUpperCase()}</span></td>
                <td>${actionBtn}</td>
            </tr>
        `);
    });
}

// --- UPLOAD FLOW (STUDENT) ---
function openUploadModal() { document.getElementById('upload-modal').classList.add('active'); }
function closeUploadModal() { document.getElementById('upload-modal').classList.remove('active'); }

function submitJob(event) {
    event.preventDefault();
    
    const name = document.getElementById('upload-name').value;
    const phone = document.getElementById('upload-phone').value;
    const fileInput = document.getElementById('upload-file');
    const fileName = fileInput.files.length > 0 ? fileInput.files[0].name : 'unknown.stl';
    
    socket.emit('submit_job', {
        student: name,
        phone: phone,
        file: fileName
    });
    
    closeUploadModal();
    document.getElementById('upload-form').reset();
}

// --- REVIEW FLOW (LAB PERSON) ---
let currentReviewJobId = null;

function openReviewModal(jobId) {
    currentReviewJobId = jobId;
    const job = localState.jobs.find(j => j.id === jobId);
    
    document.getElementById('review-job-id').innerText = jobId;
    document.getElementById('review-details').innerHTML = `
        <p><strong>Student:</strong> ${job.student}</p>
        <p><strong>Phone:</strong> ${job.phone}</p>
        <p><strong>File:</strong> ${job.file}</p>
        <div class="mt-4 p-4 border rounded" style="border: 1px dashed var(--card-border);">
            <p class="subtitle text-center"><i class="fa-solid fa-cube text-2xl mb-2"></i><br>3D Viewer Preview Placeholder</p>
        </div>
    `;
    
    document.getElementById('review-modal').classList.add('active');
}

function closeReviewModal() { 
    document.getElementById('review-modal').classList.remove('active'); 
    currentReviewJobId = null;
}

function decideJob(decision) {
    if (!currentReviewJobId) return;
    
    socket.emit('review_job', { id: currentReviewJobId, decision: decision });
    closeReviewModal();
}

function assignPrinter(jobId) {
    socket.emit('assign_printer', { id: jobId });
}

// --- NOTIFICATION SYSTEM ---
function showToast(title, message, type='primary') {
    const container = document.getElementById('toast-container');
    
    let icon = 'fa-info-circle';
    if(type === 'success') icon = 'fa-check-circle';
    if(type === 'danger') icon = 'fa-exclamation-circle';
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <i class="fa-solid ${icon} toast-icon" style="color: var(--${type})"></i>
        <div class="toast-content">
            <h4 style="color: var(--${type})">${title}</h4>
            <p>${message}</p>
        </div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}
