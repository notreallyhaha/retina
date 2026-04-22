# Face Recognition Clock In/Out System

A face recognition-based attendance system that allows users to clock in/out using facial recognition. Built with React + Node.js, designed to be wrapped into a mobile app later.

## Features

- **Face Registration**: Users can register their face via self-service or admin bulk upload
- **Clock In/Out**: Face verification with timestamp, GPS location, and photo proof
- **Admin Dashboard**: Manage employees and view attendance records
- **Mobile-Ready**: Responsive design, compatible with Capacitor/Electron for app wrapping

## Project Structure

```
face-recognition-clock/
├── client/          # React frontend (Vite)
├── server/          # Node.js + Express backend
├── uploads/         # Stored photos (faces & proof)
└── database.json    # JSON database
```

## Quick Start

### 1. Install Dependencies

```bash
# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

### 2. Start the Application

Open two terminals:

```bash
# Terminal 1: Start backend server (port 5000)
cd server
npm start

# Terminal 2: Start frontend dev server (port 3000)
cd client
npm run dev
```

Access the app at: **http://localhost:3000**

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/employees | Get all registered employees |
| POST | /api/register | Register new user with face descriptor |
| POST | /api/clock | Clock in/out with face verification |
| GET | /api/records | Get attendance records |
| POST | /api/admin/bulk-upload | Bulk upload employees |
| DELETE | /api/employees/:id | Delete an employee |

## Usage Flow

1. **Register**: Go to Register page, enter details, capture face photo
2. **Clock In/Out**: Go to Clock page, select type, capture photo for verification
3. **Admin**: View employees, upload bulk employees, check attendance records

## Mobile App Wrapping

To convert to a mobile app using Capacitor:

```bash
cd client
npm install @capacitor/core @capacitor/cli
npx cap init
npx cap add android  # or ios
npx cap sync
```

## Tech Stack

- **Frontend**: React 18, Vite, React Router, face-api.js
- **Backend**: Node.js, Express
- **Database**: JSON file storage (easily upgradable to SQLite/PostgreSQL)
- **Face Recognition**: face-api.js (client-side)

## Notes

- Camera and location permissions are required
- Face recognition threshold is set to 0.6 (adjustable in server/faceRecognition.js)
- Proof photos are stored in uploads/proof/ folder
- All face processing happens in the browser for better privacy
