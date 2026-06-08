from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, emit
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import datetime
import os
import random

app = Flask(__name__)
app.config['SECRET_KEY'] = 'c28x9VbN$mP!qWz3rTyU&iOk'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///printlab.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
socketio = SocketIO(app, manage_session=False, async_mode='threading')

ADMIN_PASSWORD = 'L4b$M4n4g3r!9XqW2z'

# ─── DATABASE MODELS ───────────────────────────────────────────────────────────

class Student(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(100), nullable=False)
    username   = db.Column(db.String(50),  unique=True, nullable=False)
    email      = db.Column(db.String(120), unique=True, nullable=False)
    phone      = db.Column(db.String(20))
    department = db.Column(db.String(100))
    password_hash = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

class Job(db.Model):
    id          = db.Column(db.Integer, primary_key=True)
    job_id      = db.Column(db.String(20), unique=True, nullable=False)
    student_id  = db.Column(db.Integer, db.ForeignKey('student.id'), nullable=False)
    student     = db.relationship('Student', backref='jobs')
    file_name   = db.Column(db.String(200))
    material    = db.Column(db.String(50))
    layer_height= db.Column(db.String(50))
    infill      = db.Column(db.String(20))
    notes       = db.Column(db.Text)
    status      = db.Column(db.String(20), default='pending')
    date        = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    printer_assigned = db.Column(db.String(100))
    cost        = db.Column(db.Float)

class Notification(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('student.id'), nullable=False)
    title      = db.Column(db.String(100))
    message    = db.Column(db.Text)
    read       = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

# ─── PRINTER STATE (in-memory, volatile) ───────────────────────────────────────

printers = [
    {"id": 1, "name": "Printer 1", "model": "Ender 3 Pro · FDM", "materials": "PLA · ABS · PETG", "max_size": "Max: 220×220×250mm", "status": "free", "currentJob": None},
    {"id": 2, "name": "Printer 2", "model": "Bambu X1C · Multi material", "materials": "PLA · PETG · ABS · TPU", "max_size": "Max: 256×256×256mm", "status": "free", "currentJob": None},
    {"id": 3, "name": "Printer 3", "model": "Ender 5 Plus · FDM", "materials": "PLA · PETG · ABS", "max_size": "Max: 350×350×400mm", "status": "free", "currentJob": None},
    {"id": 4, "name": "Printer 4", "model": "Prusa i3 MK3 · FDM", "materials": "PLA · ABS · PETG · TPU", "max_size": "Max: 250×210×210mm", "status": "free", "currentJob": None}
]

with app.app_context():
    db.create_all()

# ─── STUDENT AUTH ROUTES ───────────────────────────────────────────────────────

@app.route('/')
def index():
    if session.get('student_id'):
        return redirect(url_for('student_dashboard'))
    return render_template('index.html')

@app.route('/api/login', methods=['POST'])
def do_login():
    data     = request.get_json()
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')
    student  = Student.query.filter_by(email=email).first()
    if student and check_password_hash(student.password_hash, password):
        session['student_id']    = student.id
        session['student_name']  = student.name
        session['student_phone'] = student.phone or ''
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Invalid email or password'})

@app.route('/api/register', methods=['POST'])
def do_register():
    data       = request.get_json()
    name       = data.get('name', '').strip()
    username   = data.get('username', '').strip()
    email      = data.get('email', '').strip().lower()
    phone      = data.get('phone', '').strip()
    department = data.get('department', '').strip()
    password   = data.get('password', '')

    if not all([name, username, email, password]):
        return jsonify({'success': False, 'error': 'All fields are required'})
    if Student.query.filter_by(email=email).first():
        return jsonify({'success': False, 'error': 'Email already registered'})
    if Student.query.filter_by(username=username).first():
        return jsonify({'success': False, 'error': 'Username already taken'})

    student = Student(name=name, username=username, email=email,
                      phone=phone, department=department,
                      password_hash=generate_password_hash(password))
    db.session.add(student)
    db.session.commit()
    session['student_id']    = student.id
    session['student_name']  = student.name
    session['student_phone'] = student.phone or ''
    return jsonify({'success': True})

@app.route('/student')
def student_dashboard():
    if not session.get('student_id'):
        return redirect(url_for('index'))
    student = Student.query.get(session['student_id'])
    return render_template('student.html', student=student)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

# ─── STUDENT API ───────────────────────────────────────────────────────────────

@app.route('/api/student/profile', methods=['GET', 'POST'])
def student_profile():
    if not session.get('student_id'):
        return jsonify({'error': 'Unauthorized'}), 401
    student = Student.query.get(session['student_id'])
    if request.method == 'POST':
        data = request.get_json()
        student.name       = data.get('name', student.name)
        student.username   = data.get('username', student.username)
        student.phone      = data.get('phone', student.phone)
        student.department = data.get('department', student.department)
        db.session.commit()
        session['student_name'] = student.name
        return jsonify({'success': True})
    return jsonify({'name': student.name, 'username': student.username,
                    'email': student.email, 'phone': student.phone or '',
                    'department': student.department or ''})

@app.route('/api/student/change_password', methods=['POST'])
def change_password():
    if not session.get('student_id'):
        return jsonify({'error': 'Unauthorized'}), 401
    student = Student.query.get(session['student_id'])
    data = request.get_json()
    if not check_password_hash(student.password_hash, data.get('current_password', '')):
        return jsonify({'success': False, 'error': 'Current password is incorrect'})
    student.password_hash = generate_password_hash(data.get('new_password', ''))
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/student/jobs')
def get_my_jobs():
    if not session.get('student_id'):
        return jsonify({'error': 'Unauthorized'}), 401
    jobs = Job.query.filter_by(student_id=session['student_id']).order_by(Job.date.desc()).all()
    return jsonify([{'id': j.job_id, 'file': j.file_name, 'material': j.material,
                     'status': j.status, 'date': j.date.strftime('%Y-%m-%d'),
                     'printer': j.printer_assigned or 'Not assigned'} for j in jobs])

@app.route('/api/student/jobs/submit', methods=['POST'])
def submit_job():
    if not session.get('student_id'):
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    job_id = f"#{random.randint(1000, 9999)}"
    while Job.query.filter_by(job_id=job_id).first():
        job_id = f"#{random.randint(1000, 9999)}"
    job = Job(job_id=job_id, student_id=session['student_id'],
              file_name=data.get('file', 'unknown.stl'),
              material=data.get('material', 'PLA'),
              layer_height=data.get('layer_height', '0.2mm (Standard)'),
              infill=data.get('infill', '20%'),
              notes=data.get('notes', ''))
    db.session.add(job)

    notif = Notification(student_id=session['student_id'],
                         title='Job Submitted',
                         message=f"Your job {job_id} ({data.get('file', '')}) has been submitted and is awaiting review.")
    db.session.add(notif)
    db.session.commit()

    student = Student.query.get(session['student_id'])
    socketio.emit('notification', {'title': 'New Job Submitted',
                                   'message': f"{student.name} uploaded {data.get('file', 'a file')}.",
                                   'target': 'admin'})
    return jsonify({'success': True, 'job_id': job_id})

@app.route('/api/student/notifications')
def get_notifications():
    if not session.get('student_id'):
        return jsonify({'error': 'Unauthorized'}), 401
    notifs = Notification.query.filter_by(student_id=session['student_id']).order_by(Notification.created_at.desc()).all()
    return jsonify([{'id': n.id, 'title': n.title, 'message': n.message,
                     'read': n.read, 'time': n.created_at.strftime('%b %d, %Y %H:%M')} for n in notifs])

@app.route('/api/student/notifications/clear', methods=['POST'])
def clear_notifications():
    if not session.get('student_id'):
        return jsonify({'error': 'Unauthorized'}), 401
    Notification.query.filter_by(student_id=session['student_id']).delete()
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/printers')
def get_printers():
    return jsonify(printers)

# ─── ADMIN ROUTES ──────────────────────────────────────────────────────────────

@app.route('/admin_login', methods=['GET', 'POST'])
def admin_login():
    error = None
    if request.method == 'POST':
        if request.form.get('password') == ADMIN_PASSWORD:
            session['is_admin'] = True
            return redirect(url_for('admin_dashboard'))
        error = 'Invalid Password!'
    return render_template('admin_login.html', error=error)

@app.route('/admin')
def admin_dashboard():
    if not session.get('is_admin'):
        return redirect(url_for('admin_login'))
    return render_template('admin.html')

@app.route('/api/admin/jobs')
def admin_get_jobs():
    if not session.get('is_admin'):
        return jsonify({'error': 'Unauthorized'}), 401
    jobs = Job.query.order_by(Job.date.desc()).all()
    return jsonify([{'id': j.job_id, 'student': j.student.name,
                     'phone': j.student.phone or '', 'file': j.file_name,
                     'material': j.material, 'status': j.status,
                     'date': j.date.strftime('%Y-%m-%d'),
                     'printer': j.printer_assigned or 'Not assigned'} for j in jobs])

@app.route('/api/admin/jobs/<job_id>/review', methods=['POST'])
def admin_review_job(job_id):
    if not session.get('is_admin'):
        return jsonify({'error': 'Unauthorized'}), 401
    job = Job.query.filter_by(job_id=job_id).first_or_404()
    data = request.get_json()
    job.status = data.get('decision')
    msg = f"Your job {job_id} has been {job.status.upper()}."
    notif = Notification(student_id=job.student_id, title='Job Update', message=msg)
    db.session.add(notif)
    db.session.commit()
    socketio.emit('notification', {'title': 'Job Update', 'message': msg, 'target': 'student'})
    socketio.emit('jobs_updated')
    return jsonify({'success': True})

@app.route('/api/admin/jobs/<job_id>/assign', methods=['POST'])
def admin_assign_job(job_id):
    if not session.get('is_admin'):
        return jsonify({'error': 'Unauthorized'}), 401
    job = Job.query.filter_by(job_id=job_id).first_or_404()
    free_printer = next((p for p in printers if p['status'] == 'free'), None)
    if not free_printer:
        return jsonify({'error': 'No free printers'}), 400
    job.status = 'printing'
    job.printer_assigned = free_printer['name']
    free_printer['status'] = 'occupied'
    free_printer['currentJob'] = job_id
    msg = f"Your job {job_id} is now printing on {free_printer['name']}."
    notif = Notification(student_id=job.student_id, title='Printing Started', message=msg)
    db.session.add(notif)
    db.session.commit()
    socketio.emit('state_update', {'printers': printers})
    socketio.emit('notification', {'title': 'Printing Started', 'message': msg, 'target': 'student'})
    socketio.emit('jobs_updated')
    return jsonify({'success': True})

# ─── WEBSOCKETS ────────────────────────────────────────────────────────────────

@socketio.on('connect')
def on_connect():
    emit('state_update', {'printers': printers})

@socketio.on('toggle_printer')
def handle_toggle_printer(data):
    pid = data.get('id')
    for p in printers:
        if p['id'] == pid:
            p['status'] = 'occupied' if p['status'] == 'free' else 'free'
            p['currentJob'] = '#Manual' if p['status'] == 'occupied' else None
            break
    socketio.emit('state_update', {'printers': printers})

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
