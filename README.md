# 3D Printing Lab Management System

A full-stack web application for managing a 3D printing lab with separate Student and Admin dashboards, real-time printer status updates via WebSockets.

## Tech Stack
- **Backend:** Python / Flask / Flask-SocketIO
- **Real-time:** Socket.IO (WebSockets)
- **Frontend:** HTML, CSS, Vanilla JavaScript

## Features
- Student portal with login (name + phone)
- Live 3D printer status visible to students
- Admin portal with password authentication
- Lab admin can toggle printer status in real-time
- Job submission, review, approval/rejection workflow
- Toast notifications simulating SMS alerts

## Running Locally
```
pip install -r requirements.txt
python app.py
```

## Deployment
Deployed on Render using gunicorn + gevent for WebSocket support.
