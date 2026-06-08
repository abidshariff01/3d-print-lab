import sqlite3
import os
import datetime
import random

from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, emit
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config['SECRET_KEY'] = 'c28x9VbN$mP!qWz3rTyU&iOk'
socketio = SocketIO(app, manage_session=False, async_mode='threading')

ADMIN_PASSWORD = 'L4b$M4n4g3r!9XqW2z'
DB_PATH = os.path.join(os.path.dirname(__file__), 'printlab.db')

# ─── DATABASE SETUP ───────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            department TEXT,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT UNIQUE NOT NULL,
            student_id INTEGER NOT NULL,
            file_name TEXT,
            material TEXT,
            layer_height TEXT,
            infill TEXT,
            notes TEXT,
            status TEXT DEFAULT 'pending',
            date TEXT DEFAULT (datetime('now')),
            printer_assigned TEXT,
            cost REAL,
            FOREIGN KEY (student_id) REFERENCES students(id)
        );
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            title TEXT,
            message TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (student_id) REFERENCES students(id)
        );
    ''')
    conn.commit()
    conn.close()

init_db()

# ─── PRINTER STATE ────────────────────────────────────────────────────────────

printers = [
    # ── FDM Printers ──────────────────────────────────────────────────────────
    {"id": 1, "name": "Creality Ender 3",   "type": "FDM", "model": "FDM · Cartesian",           "materials": "PLA only",                                 "max_size": "Max: 25×25×25 cm", "tag": "",             "status": "free", "currentJob": None},
    {"id": 2, "name": "Bambu Lab A1 Mini",  "type": "FDM", "model": "FDM · CoreXY",               "materials": "PLA only",                                 "max_size": "Max: 18×18×18 cm", "tag": "⚡ Fast Print", "status": "free", "currentJob": None},
    {"id": 3, "name": "Bambu Lab A1 Combo", "type": "FDM", "model": "FDM · CoreXY · Multi-Color", "materials": "PLA only",                                 "max_size": "Max: 25×25×25 cm", "tag": "⚡ Fast Print", "status": "free", "currentJob": None},
    {"id": 4, "name": "Create Bot F430",    "type": "FDM", "model": "FDM · Industrial",           "materials": "PEEK · ABS · TPU · PETG · Carbon Fibre",   "max_size": "Max: 30×25×30 cm", "tag": "🏭 Industrial", "status": "free", "currentJob": None},
    # ── SLA Printers ──────────────────────────────────────────────────────────
    {"id": 5, "name": "Phrozen Sonic",      "type": "SLA", "model": "SLA · Resin",                "materials": "Resin (Photopolymer)",                     "max_size": "Max: 18×15 cm",    "tag": "🔬 Resin",     "status": "free", "currentJob": None},
    {"id": 6, "name": "Mighty 14K",         "type": "SLA", "model": "SLA · Resin · 14K",          "materials": "Resin (Photopolymer)",                     "max_size": "Max: 18×15 cm",    "tag": "🔬 Resin",     "status": "free", "currentJob": None},
]


# ─── ROUTES ──────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    if session.get('student_id'):
        return redirect(url_for('student_dashboard'))
    return render_template('index.html')

@app.route('/api/login', methods=['POST'])
def do_login():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    conn = get_db()
    student = conn.execute('SELECT * FROM students WHERE email=?', (email,)).fetchone()
    conn.close()
    if student and check_password_hash(student['password_hash'], password):
        session['student_id'] = student['id']
        session['student_name'] = student['name']
        session['student_phone'] = student['phone'] or ''
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Invalid email or password'})

@app.route('/api/register', methods=['POST'])
def do_register():
    data = request.get_json()
    name = data.get('name', '').strip()
    username = data.get('username', '').strip()
    email = data.get('email', '').strip().lower()
    phone = data.get('phone', '').strip()
    department = data.get('department', '').strip()
    password = data.get('password', '')
    if not all([name, username, email, password]):
        return jsonify({'success': False, 'error': 'All fields are required'})
    conn = get_db()
    if conn.execute('SELECT id FROM students WHERE email=?', (email,)).fetchone():
        conn.close()
        return jsonify({'success': False, 'error': 'Email already registered'})
    if conn.execute('SELECT id FROM students WHERE username=?', (username,)).fetchone():
        conn.close()
        return jsonify({'success': False, 'error': 'Username already taken'})
    conn.execute('INSERT INTO students (name,username,email,phone,department,password_hash) VALUES (?,?,?,?,?,?)',
                 (name, username, email, phone, department, generate_password_hash(password)))
    conn.commit()
    student = conn.execute('SELECT * FROM students WHERE email=?', (email,)).fetchone()
    conn.close()
    session['student_id'] = student['id']
    session['student_name'] = student['name']
    session['student_phone'] = student['phone'] or ''
    return jsonify({'success': True})

@app.route('/student')
def student_dashboard():
    if not session.get('student_id'):
        return redirect(url_for('index'))
    conn = get_db()
    student = conn.execute('SELECT * FROM students WHERE id=?', (session['student_id'],)).fetchone()
    conn.close()
    if student is None:
        # Session is stale (DB was reset) — clear it and send back to login
        session.clear()
        return redirect(url_for('index'))
    return render_template('student.html', student=student)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

# ─── STUDENT API ──────────────────────────────────────────────────────────────

@app.route('/api/student/profile', methods=['GET', 'POST'])
def student_profile():
    sid = session.get('student_id')
    if not sid: return jsonify({'error': 'Unauthorized'}), 401
    conn = get_db()
    if request.method == 'POST':
        data = request.get_json()
        conn.execute('UPDATE students SET name=?,username=?,phone=?,department=? WHERE id=?',
                     (data.get('name'), data.get('username'), data.get('phone'), data.get('department'), sid))
        conn.commit()
        session['student_name'] = data.get('name')
        conn.close()
        return jsonify({'success': True})
    s = conn.execute('SELECT * FROM students WHERE id=?', (sid,)).fetchone()
    conn.close()
    return jsonify({'name': s['name'], 'username': s['username'], 'email': s['email'],
                    'phone': s['phone'] or '', 'department': s['department'] or ''})

@app.route('/api/student/change_password', methods=['POST'])
def change_password():
    sid = session.get('student_id')
    if not sid: return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    conn = get_db()
    s = conn.execute('SELECT * FROM students WHERE id=?', (sid,)).fetchone()
    if not check_password_hash(s['password_hash'], data.get('current_password', '')):
        conn.close()
        return jsonify({'success': False, 'error': 'Current password is incorrect'})
    conn.execute('UPDATE students SET password_hash=? WHERE id=?', (generate_password_hash(data.get('new_password', '')), sid))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/student/jobs')
def get_my_jobs():
    sid = session.get('student_id')
    if not sid: return jsonify({'error': 'Unauthorized'}), 401
    conn = get_db()
    jobs = conn.execute('SELECT * FROM jobs WHERE student_id=? ORDER BY date DESC', (sid,)).fetchall()
    conn.close()
    return jsonify([{'id': j['job_id'], 'file': j['file_name'], 'material': j['material'],
                     'status': j['status'], 'date': j['date'][:10],
                     'printer': j['printer_assigned'] or 'Not assigned'} for j in jobs])

@app.route('/api/student/jobs/submit', methods=['POST'])
def submit_job():
    sid = session.get('student_id')
    if not sid: return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    job_id = f"#{random.randint(1000, 9999)}"
    conn = get_db()
    while conn.execute('SELECT id FROM jobs WHERE job_id=?', (job_id,)).fetchone():
        job_id = f"#{random.randint(1000, 9999)}"
    conn.execute('INSERT INTO jobs (job_id,student_id,file_name,material,layer_height,infill,notes) VALUES (?,?,?,?,?,?,?)',
                 (job_id, sid, data.get('file', 'unknown.stl'), data.get('material', 'PLA'),
                  data.get('layer_height', '0.2mm'), data.get('infill', '20%'), data.get('notes', '')))
    conn.execute('INSERT INTO notifications (student_id,title,message) VALUES (?,?,?)',
                 (sid, 'Job Submitted', f"Your job {job_id} has been submitted and is awaiting review."))
    conn.commit()
    student = conn.execute('SELECT name FROM students WHERE id=?', (sid,)).fetchone()
    conn.close()
    socketio.emit('notification', {'title': 'New Job', 'message': f"{student['name']} submitted {data.get('file', 'a file')}", 'target': 'admin'})
    return jsonify({'success': True, 'job_id': job_id})

@app.route('/api/student/notifications')
def get_notifications():
    sid = session.get('student_id')
    if not sid: return jsonify({'error': 'Unauthorized'}), 401
    conn = get_db()
    notifs = conn.execute('SELECT * FROM notifications WHERE student_id=? ORDER BY created_at DESC', (sid,)).fetchall()
    conn.close()
    return jsonify([{'id': n['id'], 'title': n['title'], 'message': n['message'], 'time': n['created_at']} for n in notifs])

@app.route('/api/student/notifications/clear', methods=['POST'])
def clear_notifications():
    sid = session.get('student_id')
    if not sid: return jsonify({'error': 'Unauthorized'}), 401
    conn = get_db()
    conn.execute('DELETE FROM notifications WHERE student_id=?', (sid,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/printers')
def get_printers():
    return jsonify(printers)

# ─── ADMIN ───────────────────────────────────────────────────────────────────

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
    if not session.get('is_admin'): return jsonify({'error': 'Unauthorized'}), 401
    conn = get_db()
    rows = conn.execute('''SELECT j.*, s.name as student_name, s.phone as student_phone
                           FROM jobs j JOIN students s ON j.student_id=s.id
                           ORDER BY j.date DESC''').fetchall()
    conn.close()
    return jsonify([{'id': r['job_id'], 'student': r['student_name'], 'phone': r['student_phone'] or '',
                     'file': r['file_name'], 'material': r['material'], 'status': r['status'],
                     'date': r['date'][:10], 'printer': r['printer_assigned'] or 'Not assigned'} for r in rows])

@app.route('/api/admin/jobs/<job_id>/review', methods=['POST'])
def admin_review_job(job_id):
    if not session.get('is_admin'): return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    decision = data.get('decision')
    conn = get_db()
    conn.execute('UPDATE jobs SET status=? WHERE job_id=?', (decision, job_id))
    job = conn.execute('SELECT * FROM jobs WHERE job_id=?', (job_id,)).fetchone()
    conn.execute('INSERT INTO notifications (student_id,title,message) VALUES (?,?,?)',
                 (job['student_id'], 'Job Update', f"Your job {job_id} has been {decision.upper()}."))
    conn.commit()
    conn.close()
    socketio.emit('notification', {'title': 'Job Update', 'message': f"Job {job_id} has been {decision.upper()}.", 'target': 'student'})
    socketio.emit('jobs_updated')
    return jsonify({'success': True})

@app.route('/api/admin/jobs/<job_id>/assign', methods=['POST'])
def admin_assign_job(job_id):
    if not session.get('is_admin'): return jsonify({'error': 'Unauthorized'}), 401
    free_printer = next((p for p in printers if p['status'] == 'free'), None)
    if not free_printer: return jsonify({'error': 'No free printers'}), 400
    conn = get_db()
    conn.execute('UPDATE jobs SET status="printing", printer_assigned=? WHERE job_id=?', (free_printer['name'], job_id))
    job = conn.execute('SELECT * FROM jobs WHERE job_id=?', (job_id,)).fetchone()
    conn.execute('INSERT INTO notifications (student_id,title,message) VALUES (?,?,?)',
                 (job['student_id'], 'Printing Started', f"Your job {job_id} is now printing on {free_printer['name']}."))
    conn.commit()
    conn.close()
    free_printer['status'] = 'occupied'
    free_printer['currentJob'] = job_id
    socketio.emit('state_update', {'printers': printers})
    socketio.emit('jobs_updated')
    return jsonify({'success': True})

# ─── WEBSOCKETS ───────────────────────────────────────────────────────────────

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
