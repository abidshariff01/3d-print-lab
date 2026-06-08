const socket = io();
let localState = { printers: [], jobs: [] };
let msgCount = 0;
let messages = [];

socket.on('connect', () => { showToast('Connected', 'Live sync active with server.', 'success'); });

socket.on('state_update', (newState) => {
    localState = newState;
    renderPrinters();
    renderStudentJobs();
});

socket.on('notification', (data) => {
    if (data.target === 'student' || !data.target) {
        const myNameElement = document.getElementById('user-name');
        const myName = myNameElement ? myNameElement.innerText.replace('Welcome, ', '').trim() : '';
        
        if (data.specific_student && data.specific_student !== myName) {
            return; // Not meant for this student
        }
        
        showToast(data.title, data.message, data.type || 'info');
        messages.unshift({title: data.title, message: data.message, time: new Date().toLocaleTimeString()});
        if(data.title === "SMS Sent" || data.title === "Message") {
            msgCount++;
            document.getElementById('student-msg-badge').innerText = msgCount;
        }
    }
});

function renderPrinters() {
    const grid = document.getElementById('student-printer-grid');
    grid.innerHTML = '';
    localState.printers.forEach(printer => {
        const isFree = printer.status === 'free';
        const html = `
            <div class="printer-card ${isFree ? 'status-free' : 'status-occupied'}">
                <i class="fa-solid fa-cube printer-icon"></i>
                <div class="printer-name">${printer.name}</div>
                <div class="status-badge"><i class="fa-solid ${isFree ? 'fa-check-circle' : 'fa-ban'}"></i> ${isFree ? 'FREE' : 'OCCUPIED'}</div>
                <div class="subtitle">${printer.currentJob ? `Job: ${printer.currentJob}` : 'Ready'}</div>
            </div>
        `;
        grid.insertAdjacentHTML('beforeend', html);
    });
}

function renderStudentJobs() {
    const tbody = document.getElementById('student-submissions-list');
    tbody.innerHTML = '';
    localState.jobs.slice(0, 5).forEach(job => {
        tbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td><strong>${job.id}</strong></td>
                <td>${job.file}</td>
                <td>${job.date}</td>
                <td><span class="status-badge badge-${job.status}">${job.status.toUpperCase()}</span></td>
            </tr>
        `);
    });
}

function openUploadModal() { document.getElementById('upload-modal').classList.add('active'); }
function closeUploadModal() { document.getElementById('upload-modal').classList.remove('active'); }

async function submitJob(event) {
    event.preventDefault();
    
    const fileInput = document.getElementById('upload-file');
    if (!fileInput.files.length) return;
    
    const file = fileInput.files[0];
    if (!file.name.toLowerCase().endsWith('.stl')) {
        showToast('Invalid Format', 'Only .stl files are allowed!', 'danger');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/upload', { method: 'POST', body: formData });
        const result = await response.json();
        
        if (result.success) {
            socket.emit('submit_job', { file: result.filename, original_name: file.name });
            closeUploadModal();
            document.getElementById('upload-form').reset();
            showToast('Success', 'File submitted to lab.', 'success');
        } else {
            showToast('Error', result.error, 'danger');
        }
    } catch (err) {
        showToast('Error', 'Upload failed.', 'danger');
    }
}

function openMessagesModal() {
    msgCount = 0;
    document.getElementById('student-msg-badge').innerText = '0';
    const list = document.getElementById('messages-list');
    list.innerHTML = messages.map(m => `<div class="card" style="margin-bottom: 10px; padding: 10px;"><strong>${m.title}</strong> <span style="font-size: 0.8em; color: #888; float: right;">${m.time}</span><p style="margin-top: 5px;">${m.message}</p></div>`).join('');
    if(messages.length === 0) list.innerHTML = '<p>No messages yet.</p>';
    document.getElementById('messages-modal').classList.add('active');
}
function closeMessagesModal() { document.getElementById('messages-modal').classList.remove('active'); }

function openGuidelinesModal() { document.getElementById('guidelines-modal').classList.add('active'); }
function closeGuidelinesModal() { document.getElementById('guidelines-modal').classList.remove('active'); }

function showToast(title, message, type='primary') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa-solid fa-info-circle toast-icon" style="color: var(--${type})"></i>
                       <div class="toast-content"><h4 style="color: var(--${type})">${title}</h4><p>${message}</p></div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'fadeOut 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 5000);
}
