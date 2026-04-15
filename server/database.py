import sqlite3
import firebase_admin
from firebase_admin import credentials, firestore

# --- SQLite (Android app) ---

def init_sqlite_db():
    conn = sqlite3.connect("retina.db")
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            face_encoding TEXT NOT NULL
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')

    conn.commit()
    conn.close()
    print("SQLite initialized: 'retina.db' is ready.")


def get_sqlite_connection():
    conn = sqlite3.connect("retina.db")
    conn.row_factory = sqlite3.Row
    return conn


# --- Firestore (Web app) ---

_db = None

def init_firebase():
    global _db
    import os, json, base64
    cred_json = os.environ.get("FIREBASE_CREDENTIALS")
    if cred_json:
        try:
            # Try as base64-encoded string
            cred_bytes = base64.b64decode(cred_json)
            cred_dict = json.loads(cred_bytes)
            cred = credentials.Certificate(cred_dict)
        except Exception:
            # Try as raw JSON string
            try:
                cred_dict = json.loads(cred_json)
                cred = credentials.Certificate(cred_dict)
            except Exception:
                # Try as file path
                cred = credentials.Certificate(cred_json)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        _db = firestore.client()
        print("Firebase Admin SDK initialized successfully.")
    else:
        print("WARNING: FIREBASE_CREDENTIALS env var not set. Firestore endpoints will fail.")


def get_firestore_db():
    global _db
    if _db is None:
        init_firebase()
    return _db


# --- Firestore helper functions ---

def create_web_user(uid: str, data: dict) -> dict:
    """Create a web_users document."""
    db = get_firestore_db()
    user_ref = db.collection("web_users").document(uid)
    user_data = {
        "firstName": data.get("firstName", ""),
        "lastName": data.get("lastName", ""),
        "email": data.get("email", ""),
        "employeeId": data.get("employeeId", ""),
        "faceEnrolled": False,
        "isAdmin": False,
        "averageDescriptor": None,
        "descriptors": [],
        "createdAt": firestore.SERVER_TIMESTAMP
    }
    user_ref.set(user_data)
    return {"success": True, "uid": uid}


def get_web_user(uid: str) -> dict | None:
    """Get a web_users document."""
    db = get_firestore_db()
    doc = db.collection("web_users").document(uid).get()
    if doc.exists:
        return {"id": doc.id, **doc.to_dict()}
    return None


def update_web_user(uid: str, data: dict) -> dict:
    """Update a web_users document."""
    db = get_firestore_db()
    db.collection("web_users").document(uid).update(data)
    return {"success": True}


def delete_web_user(uid: str) -> dict:
    """Delete a web_users document."""
    db = get_firestore_db()
    db.collection("web_users").document(uid).delete()
    return {"success": True}


def list_web_users(face_enrolled_only: bool = True) -> list:
    """List all web_users documents."""
    db = get_firestore_db()
    if face_enrolled_only:
        docs = db.collection("web_users").where("faceEnrolled", "==", True).stream()
    else:
        docs = db.collection("web_users").stream()
    users = []
    for doc in docs:
        users.append({"id": doc.id, **doc.to_dict()})
    return users


def create_attendance_record(data: dict) -> dict:
    """Create a web_attendance document."""
    db = get_firestore_db()
    doc_ref = db.collection("web_attendance").add({
        "userId": data.get("userId"),
        "employeeId": data.get("employeeId"),
        "type": data.get("type", "IN"),
        "timestamp": firestore.SERVER_TIMESTAMP,
        "location": data.get("location"),
        "proofPhotoUrl": data.get("proofPhotoUrl"),
    })
    return {"success": True, "docId": doc_ref[1].id}


def query_attendance_records(employee_id: str = None, start_date: str = None, end_date: str = None) -> list:
    """Query web_attendance documents."""
    db = get_firestore_db()
    query = db.collection("web_attendance")

    if employee_id:
        query = query.where("employeeId", "==", employee_id)

    docs = query.order_by("timestamp", direction=firestore.Query.DESCENDING).stream()
    records = []
    for doc in docs:
        data = doc.to_dict()
        # Handle server timestamp
        ts = data.get("timestamp")
        if hasattr(ts, 'isoformat'):
            data["timestamp"] = ts.isoformat()
        records.append({"id": doc.id, **data})

    # Client-side date filtering (Firestore doesn't support range + equality on different fields easily)
    if start_date or end_date:
        from datetime import datetime
        filtered = []
        for r in records:
            try:
                ts_str = r.get("timestamp", "")
                # Handle various timestamp formats
                if "T" in ts_str:
                    ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                else:
                    ts = datetime.strptime(ts_str[:19], "%Y-%m-%d %H:%M:%S")
                
                if start_date:
                    start = datetime.strptime(start_date, "%Y-%m-%d")
                    if ts < start:
                        continue
                if end_date:
                    end = datetime.strptime(end_date, "%Y-%m-%d")
                    end = end.replace(hour=23, minute=59, second=59)
                    if ts > end:
                        continue
                filtered.append(r)
            except Exception:
                filtered.append(r)  # Include if parsing fails
        return filtered

    return records


def create_session(session_id: str, data: dict) -> dict:
    """Create a web_sessions document."""
    db = get_firestore_db()
    db.collection("web_sessions").document(session_id).set({
        "userId": data.get("userId"),
        "token": data.get("token"),
        "createdAt": firestore.SERVER_TIMESTAMP
    })
    return {"success": True}


def delete_session(session_id: str) -> dict:
    """Delete a web_sessions document."""
    db = get_firestore_db()
    db.collection("web_sessions").document(session_id).delete()
    return {"success": True}
