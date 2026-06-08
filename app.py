
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_from_directory
from flask_socketio import SocketIO, emit
from werkzeug.utils import secure_filename
import datetime
import secrets
import os
import time

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
# Secure secret key for sessions
app.config['SECRET_KEY'] = 'c28x9VbN$mP!qWz3rTyU&iOk' 
socketio = SocketIO(app, manage_session=False, async_mode='threading')

ADMIN_PASSWORD = 'L4b$M4n4g3r!9XqW2z'

state = {
    "printers": [
        {"id": 1, "name": "Printer 1 (Ender 3)", "status": "free", "currentJob": None},
        {"id": 2, "name": "Printer 2 (Prusa i3)", "status": "occupied", "currentJob": "#1023"},
        {"id": 3, "name": "Printer 3 (Resin)", "status": "free", "currentJob": None},
        {"id": 4, "name": "Printer 4 (Ultimaker)", "status": "occupied", "currentJob": "#1024"}
    ],
    "jobs": [
        {"id": "#1023", "student": "Alice Smith", "phone": "555-0101", "file": "gear_v2.stl", "status": "printing", "date": "2026-06-05"}
    ]
}

# --- ROUTES ---

@app.route('/', methods=['GET', 'POST'])
def student_login():
    if request.method == 'POST':
        session['student_name'] = request.form.get('name')
        session['student_phone'] = request.form.get('phone')
        return redirect(url_for('student_dashboard'))
    return render_template('index.html')

@app.route('/student')
def student_dashboard():
    if 'student_name' not in session:
        return redirect(url_for('student_login'))
    return render_template('student.html', name=session['student_name'])

@app.route('/admin_login', methods=['GET', 'POST'])
def admin_login():
    error = None
    if request.method == 'POST':
        password = request.form.get('password')
        if password == ADMIN_PASSWORD:
            session['is_admin'] = True
            return redirect(url_for('admin_dashboard'))
        else:
            error = "Invalid Password!"
    return render_template('admin_login.html', error=error)

@app.route('/admin')
def admin_dashboard():
    if not session.get('is_admin'):
        return redirect(url_for('admin_login'))
    return render_template('admin.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('student_login'))

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file and file.filename.lower().endswith('.stl'):
        filename = secure_filename(file.filename)
        safe_filename = f"{int(time.time())}_{filename}"
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], safe_filename))
        return jsonify({'success': True, 'filename': safe_filename}), 200
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# --- WEBSOCKETS ---

@socketio.on('connect')
def test_connect():
    emit('state_update', state)

@socketio.on('toggle_printer')
def handle_toggle_printer(data):
    printer_id = data.get('id')
    for p in state['printers']:
        if p['id'] == printer_id:
            if p['status'] == 'free':
                p['status'] = 'occupied'
                p['currentJob'] = '#Manual'
            else:
                p['status'] = 'free'
                p['currentJob'] = None
            break
    socketio.emit('state_update', state)

@socketio.on('submit_job')
def handle_submit_job(data):
    import random
    
    # We get name and phone from the Flask session via WebSocket context
    student_name = session.get('student_name', 'Unknown Student')
    student_phone = session.get('student_phone', 'No Phone')

    new_job = {
        "id": f"#{random.randint(1000, 9999)}",
        "student": student_name,
        "phone": student_phone,
        "file": data.get('original_name', data.get('file', 'unknown.stl')),
        "saved_file": data.get('file', ''),
        "status": "pending",
        "date": datetime.datetime.now().strftime("%Y-%m-%d")
    }
    state['jobs'].insert(0, new_job)
    socketio.emit('state_update', state)
    socketio.emit('notification', {"title": "New Job Submitted", "message": f"{student_name} uploaded a file.", "target": "admin"})

@socketio.on('review_job')
def handle_review_job(data):
    job_id = data.get('id')
    decision = data.get('decision')
    for job in state['jobs']:
        if job['id'] == job_id:
            job['status'] = decision
            msg = f"Your job {job_id} has been {decision.upper()}." 
            socketio.emit('notification', {"title": "SMS Sent", "message": msg, "target": "student", "specific_student": job['student']})
            break
    socketio.emit('state_update', state)

@socketio.on('send_custom_sms')
def handle_custom_sms(data):
    msg = data.get('message', '')
    job_id = data.get('job_id', '').strip()
    
    target_student = None
    if job_id:
        for job in state['jobs']:
            if job['id'] == job_id:
                target_student = job['student']
                break
        if not target_student:
            emit('notification', {"title": "Error", "message": f"Job {job_id} not found.", "type": "danger", "target": "admin"})
            return

    socketio.emit('notification', {"title": "Message", "message": msg, "target": "student", "specific_student": target_student})

@socketio.on('assign_printer')
def handle_assign_printer(data):
    job_id = data.get('id')
    free_printer = next((p for p in state['printers'] if p['status'] == 'free'), None)
    
    if not free_printer:
        emit('notification', {"title": "Error", "message": "No free printers available!", "type": "danger", "target": "admin"})
        return

    for job in state['jobs']:
        if job['id'] == job_id:
            job['status'] = 'printing'
            free_printer['status'] = 'occupied'
            free_printer['currentJob'] = job['id']
            socketio.emit('notification', {"title": "SMS Sent", "message": f"Your job {job_id} is now printing on {free_printer['name']}.", "target": "student", "specific_student": job['student']})
            break
    socketio.emit('state_update', state)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
