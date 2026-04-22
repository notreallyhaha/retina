from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import cv2
import numpy as np
import io
from PIL import Image
from deepface import DeepFace
import json
from datetime import datetime, timedelta, timezone
from typing import Optional
import firebase_admin
from firebase_admin import auth, firestore
import base64
import uuid
import os
import jwt
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from zoneinfo import ZoneInfo

PH_TZ = ZoneInfo("Asia/Manila")

from database import (
    init_sqlite_db, get_sqlite_connection, init_firebase, get_firestore_db,
    create_web_user, get_web_user, update_web_user, delete_web_user, list_web_users,
    create_attendance_record, query_attendance_records,
    create_session, delete_session,
    create_manual_entry, get_occupied_slots
)

app = FastAPI(title="Face Recognition Clock API")

JWT_SECRET = os.environ.get("JWT_SECRET", "super-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"

# APScheduler — jobs persist in SQLite so auto-outs survive server restarts
_jobstores = {"default": SQLAlchemyJobStore(url="sqlite:///scheduler.db")}
scheduler = AsyncIOScheduler(jobstores=_jobstores, timezone=PH_TZ)

allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def calculate_cosine_distance(source, test):
    a = np.matmul(np.transpose(source), test)
    b = np.sum(np.multiply(source, source))
    c = np.sum(np.multiply(test, test))
    return 1 - (a / (np.sqrt(b) * np.sqrt(c)))

def base64_to_cv2(b64_str: str):
    """Decode a base64 data URL or raw base64 string into a BGR cv2 image."""
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]
    img_bytes = base64.b64decode(b64_str)
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image")
    return img

async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.replace("Bearer ", "")
    try:
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token["uid"]
        firestore_user = get_web_user(uid)
        if firestore_user:
            return firestore_user
        return {"id": uid, "firebase_uid": uid}
    except Exception:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")

async def require_admin(current_user: dict = Depends(get_current_user)):
    uid = current_user.get("id") or current_user.get("uid")
    if uid:
        # Always re-check Firestore — JWT isAdmin can be stale
        fresh = get_web_user(uid)
        if fresh and fresh.get("isAdmin"):
            return fresh
    raise HTTPException(status_code=403, detail="Admin access required")


# ============================================
# EXISTING ENDPOINTS (Android app compatibility)
# ============================================

@app.get("/")
def read_root():
    return {"message": "Face Recognition Clock API is live!"}

@app.post("/register")
async def register_face(uid: str = Form(...), email: str = Form(...), file: UploadFile = File(...)):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    frame = np.array(image)
    frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
    try:
        results = DeepFace.represent(img_path=frame_bgr, model_name="Facenet", enforce_detection=True)
        embedding = results[0]["embedding"]
        embedding_json = json.dumps(embedding)
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO users (name, face_encoding) VALUES (?, ?)", (email, embedding_json))
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        return {"status": "success", "message": f"Successfully registered face for '{email}'!", "user_id": user_id}
    except ValueError:
        return {"status": "error", "message": "No face detected. Please ensure good lighting."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/recognize")
async def recognize_face(email: str = Form(...), file: UploadFile = File(...)):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        frame = np.array(image)
        frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        results = DeepFace.represent(img_path=frame_bgr, model_name="Facenet", enforce_detection=True)
        new_embedding = results[0]["embedding"]
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, face_encoding FROM users")
        users = cursor.fetchall()
        best_match_name = "Unknown"
        best_match_id = None
        lowest_distance = 100
        for user in users:
            db_embedding = json.loads(user["face_encoding"])
            distance = calculate_cosine_distance(db_embedding, new_embedding)
            if distance < 0.40 and distance < lowest_distance:
                lowest_distance = distance
                best_match_name = user["name"]
                best_match_id = user["id"]
        if best_match_name != "Unknown":
            if best_match_name.lower() != email.lower():
                conn.close()
                return {"status": "error", "message": "Face does not match the logged-in account!"}
            now = datetime.now()
            now_str = now.strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("SELECT timestamp FROM attendance_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1", (best_match_id,))
            last_log = cursor.fetchone()
            can_log = True
            if last_log:
                last_log_time = datetime.strptime(last_log[0], "%Y-%m-%d %H:%M:%S")
                if (now - last_log_time).total_seconds() < 60:
                    can_log = False
            if can_log:
                cursor.execute("INSERT INTO attendance_logs (user_id, timestamp) VALUES (?, ?)", (best_match_id, now_str))
                conn.commit()
                final_message = "Check-in logged successfully!"
                log_status = now_str
            else:
                final_message = "Welcome back!"
                log_status = "Skipped (Cooldown active)"
            conn.close()
            return {"status": "success", "message": final_message, "time_logged": log_status, "distance": round(lowest_distance, 3)}
        conn.close()
        return {"status": "error", "message": "Face not recognized in database."}
    except ValueError:
        return {"status": "error", "message": "No face detected."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/logs")
def get_attendance_logs():
    try:
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT attendance_logs.id, users.name, attendance_logs.timestamp
            FROM attendance_logs
            JOIN users ON attendance_logs.user_id = users.id
            ORDER BY attendance_logs.timestamp DESC
        """)
        logs = cursor.fetchall()
        conn.close()
        return {"status": "success", "total_logs": len(logs), "data": [{"log_id": r["id"], "name": r["name"], "timestamp": r["timestamp"]} for r in logs]}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ============================================
# NEW WEB APP ENDPOINTS
# ============================================

@app.post("/api/auth/register")
async def api_register(body: Request):
    try:
        data = await body.json()
        email = data.get("email", "").strip()
        password = data.get("password", "")
        first_name = data.get("firstName", "").strip()
        last_name = data.get("lastName", "").strip()
        if not all([email, password, first_name, last_name]):
            raise HTTPException(status_code=400, detail="All fields are required")
        if len(password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        try:
            user_record = auth.create_user(email=email, password=password, display_name=f"{first_name} {last_name}")
        except firebase_admin.auth.EmailAlreadyExistsError:
            raise HTTPException(status_code=409, detail="Email already registered")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Auth creation failed: {str(e)}")
        uid = user_record.uid
        create_web_user(uid, {"firstName": first_name, "lastName": last_name, "email": email, "employeeId": ""})
        token = jwt.encode({
            "uid": uid, "email": email, "firstName": first_name, "lastName": last_name,
            "isAdmin": False,
        }, JWT_SECRET, algorithm=JWT_ALGORITHM)
        create_session(str(uuid.uuid4()), {"userId": uid, "token": token})
        return {"success": True, "token": token, "user": {"uid": uid, "email": email, "firstName": first_name, "lastName": last_name, "faceEnrolled": False, "employeeId": "", "isAdmin": False}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/auth/login")
async def api_login(body: Request):
    try:
        data = await body.json()
        email = data.get("email", "").strip()
        password = data.get("password", "")
        if not email or not password:
            raise HTTPException(status_code=400, detail="Email and password required")
        firebase_token = data.get("firebaseToken") or data.get("token")
        if firebase_token:
            try:
                decoded = auth.verify_id_token(firebase_token)
                uid = decoded["uid"]
            except Exception:
                raise HTTPException(status_code=401, detail="Invalid Firebase token")
        else:
            raise HTTPException(status_code=400, detail="Login requires a Firebase ID token from the client SDK")
        user_data = get_web_user(uid)
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
        is_admin = user_data.get("isAdmin", False)
        token = jwt.encode({
            "uid": uid, "email": user_data.get("email", ""), "firstName": user_data.get("firstName", ""),
            "lastName": user_data.get("lastName", ""), "isAdmin": is_admin,
        }, JWT_SECRET, algorithm=JWT_ALGORITHM)
        create_session(str(uuid.uuid4()), {"userId": uid, "token": token})
        return {
            "success": True, "token": token, "user": {
                "uid": uid, "email": user_data.get("email", ""),
                "firstName": user_data.get("firstName", ""), "lastName": user_data.get("lastName", ""),
                "faceEnrolled": user_data.get("faceEnrolled", False),
                "employeeId": user_data.get("employeeId", ""),
                "isAdmin": is_admin,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auth/logout")
async def api_logout(authorization: Optional[str] = Header(None)):
    try:
        if authorization and authorization.startswith("Bearer "):
            token = authorization.replace("Bearer ", "")
            db = get_firestore_db()
            sessions = db.collection("web_sessions").where("token", "==", token).stream()
            for doc in sessions:
                delete_session(doc.id)
        return {"success": True, "message": "Logged out"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/auth/me")
async def api_get_me(current_user: dict = Depends(get_current_user)):
    """Always re-fetches from Firestore so faceEnrolled is fresh."""
    uid = current_user.get("id") or current_user.get("uid")
    if uid:
        fresh = get_web_user(uid)
        if fresh:
            return {"success": True, "user": fresh}
    return {"success": True, "user": current_user}


# --- Face Registration — DeepFace (Facenet) server-side ---

@app.post("/api/register/face")
async def api_register_face(body: Request, current_user: dict = Depends(get_current_user)):
    """Receive 3 face images → run DeepFace Facenet on each → store embeddings in Firestore."""
    try:
        data = await body.json()
        face_images = data.get("faceImages", [])
        if not face_images:
            raise HTTPException(status_code=400, detail="No face images provided")
        if len(face_images) > 5:
            raise HTTPException(status_code=400, detail="Too many images (max 5)")
        uid = current_user.get("id") or current_user.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="No user ID")

        embeddings = []
        for i, img_b64 in enumerate(face_images):
            try:
                img_bgr = base64_to_cv2(img_b64)
                results = DeepFace.represent(
                    img_path=img_bgr,
                    model_name="Facenet",
                    enforce_detection=True,
                    detector_backend="opencv",
                )
                embedding = [float(v) for v in results[0]["embedding"]]
                embeddings.append(embedding)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Sample {i + 1}: could not extract face — {str(e)}")

        # Serialize to JSON strings — Firestore does not allow nested arrays
        serialized = [json.dumps(emb) for emb in embeddings]
        update_web_user(uid, {
            "faceEnrolled": True,
            "descriptors": serialized,
            "averageDescriptor": None,
        })

        return {
            "success": True,
            "message": f"Face enrolled successfully ({len(embeddings)}/3 samples stored)",
            "employeeId": str(uid[:8].upper()),
            "samplesStored": len(embeddings),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Auto clock-out job (runs via APScheduler) ---

def _auto_clock_out(uid: str, in_record_id: str):
    """Called by APScheduler 15 hours after an IN. Writes an auto OUT if still clocked in."""
    try:
        db = get_firestore_db()
        # Check the very last record — if it's still the same IN, write auto-OUT
        docs = list(
            db.collection("web_users").document(uid).collection("attendance")
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
            .limit(1)
            .stream()
        )
        if not docs:
            return
        last = docs[0].to_dict()
        last_type = last.get("type", "")
        last_id = docs[0].id
        # Only auto-out if still clocked in (last record is IN or IN_OVERTIME)
        if last_type not in ("IN", "IN_OVERTIME"):
            return
        user_data = get_web_user(uid)
        if not user_data:
            return
        employee_id = user_data.get("employeeId", uid[:8].upper())
        create_attendance_record({
            "userId": uid,
            "employeeId": str(employee_id),
            "type": "OUT",
            "location": None,
            "proofPhotoUrl": None,
            "status": "auto",
            "distance": None,
        })
        print(f"[AUTO-OUT] User {uid} auto clocked out after 15h (triggered by {in_record_id})")
    except Exception as e:
        print(f"[AUTO-OUT ERROR] {e}")


def _schedule_auto_out(uid: str, record_id: str, in_time: datetime):
    """Schedule an auto-OUT job 15 hours after in_time. Replaces any existing job for this user."""
    job_id = f"auto_out_{uid}"
    # Remove previous job for this user if any (e.g. if they re-clocked somehow)
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    run_at = in_time + timedelta(hours=15)
    scheduler.add_job(
        _auto_clock_out,
        trigger="date",
        run_date=run_at,
        args=[uid, record_id],
        id=job_id,
        replace_existing=True,
    )
    print(f"[SCHEDULER] Auto-OUT scheduled for {uid} at {run_at.isoformat()}")


def _cancel_auto_out(uid: str):
    """Cancel a pending auto-OUT job when user manually clocks out."""
    job_id = f"auto_out_{uid}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        print(f"[SCHEDULER] Auto-OUT cancelled for {uid} (manual clock-out)")


def _ph_day_start(dt: datetime) -> datetime:
    """Return midnight PH time for the given datetime."""
    ph_dt = dt.astimezone(PH_TZ)
    return ph_dt.replace(hour=0, minute=0, second=0, microsecond=0)


# --- Clock In/Out — DeepFace (Facenet) server-side verification ---

@app.post("/api/clock")
async def api_clock(body: Request, current_user: dict = Depends(get_current_user)):
    """Receive proof photo → DeepFace Facenet → compare against stored embeddings → log attendance."""
    try:
        data = await body.json()
        clock_type_requested = data.get("type", "IN").upper()
        location = data.get("location")
        proof_photo = data.get("proofPhoto")
        if not proof_photo:
            raise HTTPException(status_code=400, detail="Proof photo required")

        uid = current_user.get("id") or current_user.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="No user ID")

        user_data = get_web_user(uid)
        if not user_data or not user_data.get("faceEnrolled"):
            raise HTTPException(status_code=400, detail="Face not enrolled")

        stored_descriptors = user_data.get("descriptors", [])
        if not stored_descriptors:
            raise HTTPException(status_code=400, detail="No face data stored — please re-enroll")

        parsed_descriptors = [
            json.loads(d) if isinstance(d, str) else d
            for d in stored_descriptors
        ]

        employee_id = user_data.get("employeeId", uid[:8].upper())
        full_name = f"{user_data.get('firstName', '')} {user_data.get('lastName', '')}"
        now_utc = datetime.now(timezone.utc)

        # --- Fetch recent records to enforce business rules ---
        db = get_firestore_db()
        recent_docs = list(
            db.collection("web_users").document(uid).collection("attendance")
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
            .limit(20)
            .stream()
        )
        records = [{"id": d.id, **d.to_dict()} for d in recent_docs]
        last = records[0] if records else None
        last_type = last.get("type", "") if last else None
        last_ts = last.get("timestamp") if last else None
        if last_ts and hasattr(last_ts, "astimezone"):
            last_ts_utc = last_ts.astimezone(timezone.utc)
        elif last_ts:
            last_ts_utc = datetime.fromisoformat(str(last_ts).replace("Z", "+00:00"))
        else:
            last_ts_utc = None

        # --- 1-hour lock: prevent clocking out too soon after clocking in ---
        if clock_type_requested == "OUT":
            if last_type not in ("IN", "IN_OVERTIME"):
                raise HTTPException(status_code=400, detail="You are not clocked in.")
            if last_ts_utc:
                elapsed = (now_utc - last_ts_utc).total_seconds()
                if elapsed < 60:
                    remaining = int(60 - elapsed)
                    mins = remaining // 60
                    secs = remaining % 60
                    raise HTTPException(
                        status_code=400,
                        detail=f"Too soon to clock out. Please wait {mins}m {secs}s more."
                    )

        # --- Determine final clock type for IN ---
        final_clock_type = clock_type_requested
        if clock_type_requested == "IN":
            if last_type in ("IN", "IN_OVERTIME"):
                raise HTTPException(status_code=400, detail="You are already clocked in.")
            # Check if there's already an IN today (PH time) → overtime
            ph_today_start = _ph_day_start(now_utc)
            ph_today_start_utc = ph_today_start.astimezone(timezone.utc)
            has_in_today = any(
                r.get("type") in ("IN", "IN_OVERTIME") and
                r.get("timestamp") and
                (r["timestamp"].astimezone(timezone.utc) if hasattr(r["timestamp"], "astimezone")
                 else datetime.fromisoformat(str(r["timestamp"]).replace("Z", "+00:00"))) >= ph_today_start_utc
                for r in records
            )
            if has_in_today:
                final_clock_type = "IN_OVERTIME"

        # --- Face verification ---
        try:
            img_bgr = base64_to_cv2(proof_photo)
            results = DeepFace.represent(
                img_path=img_bgr,
                model_name="Facenet",
                enforce_detection=True,
                detector_backend="opencv",
            )
            live_embedding = [float(v) for v in results[0]["embedding"]]
        except Exception:
            return {
                "success": True, "matched": False, "status": "pending",
                "employeeId": str(employee_id),
                "name": str(full_name), "timestamp": now_utc.isoformat(),
                "distance": None, "message": "Face not detected — request approval if needed",
                "clockType": final_clock_type,
            }

        live_vec = np.array(live_embedding)
        best_distance = min(
            calculate_cosine_distance(np.array(ref), live_vec)
            for ref in parsed_descriptors
        )

        matched = bool(best_distance < 0.40)
        distance_float = round(float(best_distance), 3)

        if matched:
            record = create_attendance_record({
                "userId": str(uid), "employeeId": str(employee_id),
                "type": final_clock_type, "location": location,
                "proofPhotoUrl": proof_photo, "status": "matched", "distance": distance_float,
            })
            record_id = str(record["docId"])

            if final_clock_type in ("IN", "IN_OVERTIME"):
                # Schedule auto clock-out 15 hours from now
                _schedule_auto_out(uid, record_id, now_utc)
            elif final_clock_type == "OUT":
                # Cancel any pending auto clock-out
                _cancel_auto_out(uid)

            return {
                "success": True, "matched": True, "status": "matched",
                "recordId": record_id, "employeeId": str(employee_id),
                "name": str(full_name), "timestamp": now_utc.isoformat(),
                "distance": distance_float,
                "clockType": final_clock_type,
                "message": f"Clock {final_clock_type} logged",
            }
        else:
            return {
                "success": True, "matched": False, "status": "pending",
                "employeeId": str(employee_id),
                "name": str(full_name), "timestamp": now_utc.isoformat(),
                "distance": distance_float,
                "clockType": final_clock_type,
                "message": "Face did not match — request approval if needed",
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/api/clock/last")
async def api_clock_last(current_user: dict = Depends(get_current_user)):
    """Return the user's most recent attendance record for auto IN/OUT detection."""
    try:
        uid = current_user.get("id") or current_user.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="No user ID")
        db = get_firestore_db()
        docs = (
            db.collection("web_users").document(uid).collection("attendance")
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
            .limit(1)
            .stream()
        )
        for doc in docs:
            data = doc.to_dict()
            ts = data.get("timestamp")
            ts_str = ts.isoformat() if hasattr(ts, "isoformat") else (str(ts) if ts else None)
            # Calculate 1-hour lock remaining seconds
            lock_remaining = 0
            rec_type = str(data.get("type", "IN"))
            if rec_type in ("IN", "IN_OVERTIME") and ts:
                ts_utc = ts.astimezone(timezone.utc) if hasattr(ts, "astimezone") else datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                elapsed = (datetime.now(timezone.utc) - ts_utc).total_seconds()
                lock_remaining = max(0, int(60 - elapsed))
            return {"success": True, "record": {
                "id": str(doc.id), "type": rec_type,
                "status": str(data.get("status", "matched")), "timestamp": ts_str,
                "lockRemainingSeconds": lock_remaining,
            }}
        return {"success": True, "record": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clock/request-approval")
async def api_clock_request_approval(body: Request, current_user: dict = Depends(get_current_user)):
    try:
        data = await body.json()
        uid = current_user.get("id") or current_user.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="No user ID")
        user_data = get_web_user(uid)
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
        employee_id = user_data.get("employeeId", uid[:8].upper())
        clock_type = str(data.get("type", "IN")).upper()
        location = data.get("location")
        proof_photo = data.get("proofPhoto")

        # --- Re-derive final clock type (same logic as /api/clock) ---
        if clock_type == "IN":
            now_utc = datetime.now(timezone.utc)
            db = get_firestore_db()
            recent_docs = list(
                db.collection("web_users").document(uid).collection("attendance")
                .order_by("timestamp", direction=firestore.Query.DESCENDING)
                .limit(20)
                .stream()
            )
            records = [{"id": d.id, **d.to_dict()} for d in recent_docs]
            ph_today_start = _ph_day_start(now_utc)
            ph_today_start_utc = ph_today_start.astimezone(timezone.utc)
            has_in_today = any(
                r.get("type") in ("IN", "IN_OVERTIME") and
                r.get("timestamp") and
                (r["timestamp"].astimezone(timezone.utc) if hasattr(r["timestamp"], "astimezone")
                 else datetime.fromisoformat(str(r["timestamp"]).replace("Z", "+00:00"))) >= ph_today_start_utc
                for r in records
            )
            if has_in_today:
                clock_type = "IN_OVERTIME"

        record = create_attendance_record({
            "userId": str(uid), "employeeId": str(employee_id),
            "type": clock_type, "location": location,
            "proofPhotoUrl": proof_photo, "status": "pending", "distance": data.get("distance"),
        })
        return {"success": True, "recordId": str(record["docId"])}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clock/approve/{record_id}")
async def api_clock_approve(record_id: str, admin: dict = Depends(require_admin)):
    """Admin approves a pending clock record."""
    try:
        db = get_firestore_db()
        docs = db.collection_group("attendance").where("recordId", "==", record_id).stream()
        for doc in docs:
            doc.reference.update({
                "status": "approved", "approvedBy": admin.get("id"),
                "approvedAt": firestore.SERVER_TIMESTAMP,
            })
            return {"success": True, "message": "Record approved"}
        raise HTTPException(status_code=404, detail="Record not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clock/pending")
async def api_clock_pending(admin: dict = Depends(require_admin)):
    """List all pending clock records. Admin only."""
    try:
        db = get_firestore_db()
        docs = (
            db.collection_group("attendance")
            .where("status", "==", "pending")
            .stream()
        )
        results = []
        for doc in docs:
            data = doc.to_dict()
            ts = data.get("timestamp")
            results.append({
                "id": str(doc.id), "userId": data.get("userId"),
                "employeeId": data.get("employeeId"), "type": data.get("type"),
                "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                "distance": data.get("distance"), "location": data.get("location"),
                "proofPhotoUrl": data.get("proofPhotoUrl"),
                "clockInTime": data.get("clockInTime"), "clockOutTime": data.get("clockOutTime"),
                "clockOutNextDay": data.get("clockOutNextDay", False),
                "manualDate": data.get("manualDate"),
                "clockInProofUrl": data.get("clockInProofUrl"),
                "clockOutProofUrl": data.get("clockOutProofUrl"),
                "clockInNote": data.get("clockInNote"),
                "clockOutNote": data.get("clockOutNote"),
            })
        return {"success": True, "records": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/my-records")
async def api_my_records(current_user: dict = Depends(get_current_user)):
    """Return the current user's own attendance records."""
    try:
        uid = current_user.get("id") or current_user.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="No user ID")
        records = query_attendance_records(user_id=str(uid))
        result = []
        for r in records[:50]:
            ts = r.get("timestamp", "")
            ts_str = ts.isoformat() if hasattr(ts, "isoformat") else (str(ts) if ts else "")
            result.append({
                "id": str(r.get("id", "")),
                "type": str(r.get("type", "IN")),
                "status": str(r.get("status", "matched")),
                "timestamp": ts_str,
                "location": r.get("location"),
                "manualDate": r.get("manualDate"),
                "recordId": r.get("recordId"),
                "clockInTime": r.get("clockInTime"),
                "clockOutTime": r.get("clockOutTime"),
                "clockOutNextDay": r.get("clockOutNextDay", False),
                "clockInProofType": r.get("clockInProofType"),
                "clockInProofUrl": r.get("clockInProofUrl"),
                "clockInNote": r.get("clockInNote"),
                "clockOutProofType": r.get("clockOutProofType"),
                "clockOutProofUrl": r.get("clockOutProofUrl"),
                "clockOutNote": r.get("clockOutNote"),
                "proofPhotoUrl": r.get("proofPhotoUrl"),
            })
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/employees")
async def api_list_employees(admin: dict = Depends(require_admin)):
    try:
        users = list_web_users(face_enrolled_only=False)
        result = []
        for u in users:
            result.append({
                "id": u.get("id"),
                "employeeId": u.get("employeeId", u.get("id", "")[:8].upper()),
                "name": f"{u.get('firstName', '')} {u.get('lastName', '')}",
                "email": u.get("email", ""), "faceEnrolled": u.get("faceEnrolled", False),
                "isAdmin": u.get("isAdmin", False), "createdAt": str(u.get("createdAt", ""))
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/employees/{employee_id}")
async def api_delete_employee(employee_id: str, admin: dict = Depends(require_admin)):
    try:
        if employee_id == admin.get("id"):
            raise HTTPException(status_code=400, detail="Cannot delete your own account")

        # 1. Delete from Firebase Auth — raise explicitly so failures aren't silent
        try:
            auth.delete_user(employee_id)
        except firebase_admin.auth.UserNotFoundError:
            pass  # Already gone from Auth — safe to continue
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Auth deletion failed: {str(e)}")

        # 2. Delete attendance subcollection (Firestore does NOT cascade-delete subcollections)
        db = get_firestore_db()
        attendance_ref = db.collection("web_users").document(employee_id).collection("attendance")
        batch_size = 100
        while True:
            docs = list(attendance_ref.limit(batch_size).stream())
            if not docs:
                break
            batch = db.batch()
            for doc in docs:
                batch.delete(doc.reference)
            batch.commit()

        # 3. Delete the web_users profile document
        delete_web_user(employee_id)

        return {"success": True, "message": "Employee deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/employees/{uid}")
async def api_update_employee(uid: str, body: Request, admin: dict = Depends(require_admin)):
    try:
        data = await body.json()
        if uid == admin.get("id") and data.get("isAdmin") is False:
            raise HTTPException(status_code=400, detail="Cannot revoke your own admin access")
        update_web_user(uid, {"isAdmin": data.get("isAdmin", False)})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/clock/{record_id}")
async def api_reject_record_legacy(record_id: str, admin: dict = Depends(require_admin)):
    """Legacy — kept for backwards compat, now sets status=rejected instead of deleting."""
    try:
        db = get_firestore_db()
        docs = list(db.collection_group("attendance").where("recordId", "==", record_id).stream())
        if not docs:
            raise HTTPException(status_code=404, detail="Record not found")
        for doc in docs:
            doc.reference.update({
                "status": "rejected",
                "rejectedBy": admin.get("id"),
                "rejectedAt": firestore.SERVER_TIMESTAMP,
                "rejectionNote": "",
            })
        return {"success": True, "message": "Record rejected"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clock/reject/{record_id}")
async def api_reject_record(record_id: str, body: Request, admin: dict = Depends(require_admin)):
    """Reject a pending clock record — marks as rejected, does NOT delete."""
    try:
        data = await body.json()
        note = data.get("note", "")
        db = get_firestore_db()
        docs = list(db.collection_group("attendance").where("recordId", "==", record_id).stream())
        if not docs:
            raise HTTPException(status_code=404, detail="Record not found")
        for doc in docs:
            doc.reference.update({
                "status": "rejected",
                "rejectedBy": admin.get("id"),
                "rejectedAt": firestore.SERVER_TIMESTAMP,
                "rejectionNote": note,
            })
        return {"success": True, "message": "Record rejected"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/api/records")
async def api_records(
    employeeId: Optional[str] = None, userId: Optional[str] = None,
    startDate: Optional[str] = None, endDate: Optional[str] = None,
    admin: dict = Depends(require_admin)
):
    try:
        # Prefer userId (direct subcollection — no composite index needed)
        # Fall back to employeeId (collection_group — needs Firestore index)
        records = query_attendance_records(
            user_id=userId if userId else None,
            employee_id=employeeId if not userId else None,
            start_date=startDate,
            end_date=endDate,
        )
        result = []
        for r in records:
            ts = r.get("timestamp", "")
            ts_str = ts.isoformat() if hasattr(ts, "isoformat") else (str(ts) if ts else "")
            result.append({
                "id": r.get("id"),
                "employeeId": r.get("employeeId", ""),
                "type": r.get("type", "IN"),
                "status": r.get("status", "matched"),
                "timestamp": ts_str,
                "location": r.get("location"),
                "proofPhotoUrl": r.get("proofPhotoUrl"),
                "manualDate": r.get("manualDate"),
                "clockInTime": r.get("clockInTime"),
                "clockOutTime": r.get("clockOutTime"),
                "clockOutNextDay": r.get("clockOutNextDay", False),
                "clockInProofUrl": r.get("clockInProofUrl"),
                "clockOutProofUrl": r.get("clockOutProofUrl"),
                "clockInNote": r.get("clockInNote"),
                "clockOutNote": r.get("clockOutNote"),
                "distance": r.get("distance"),
                "rejectionNote": r.get("rejectionNote"),
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/admin/bulk-upload")
async def api_bulk_upload(body: Request, admin: dict = Depends(require_admin)):
    try:
        data = await body.json()
        employees = data.get("employees", [])
        if not employees:
            raise HTTPException(status_code=400, detail="No employees provided")
        results = []
        for emp in employees:
            try:
                name = emp.get("name", "").strip()
                employee_id = emp.get("employeeId", "").strip()
                email = emp.get("email", "").strip()
                face_descriptor = emp.get("faceDescriptor")
                if not name or not employee_id:
                    results.append({"employeeId": employee_id or "unknown", "success": False, "error": "Name and Employee ID required"})
                    continue
                if not face_descriptor:
                    results.append({"employeeId": employee_id, "success": False, "error": "No face detected in photo"})
                    continue
                temp_password = uuid.uuid4().hex[:12] + "A1!"
                try:
                    user_record = auth.create_user(email=email if email else f"{employee_id}@temp.local", password=temp_password, display_name=name)
                except Exception as e:
                    results.append({"employeeId": employee_id, "success": False, "error": str(e)})
                    continue
                uid = user_record.uid
                name_parts = name.split(" ", 1)
                create_web_user(uid, {"firstName": name_parts[0], "lastName": name_parts[1] if len(name_parts) > 1 else "", "email": email if email else f"{employee_id}@temp.local", "employeeId": employee_id})
                update_web_user(uid, {"faceEnrolled": True, "averageDescriptor": face_descriptor, "descriptors": [face_descriptor]})
                results.append({"employeeId": employee_id, "success": True, "uid": uid})
            except Exception as e:
                results.append({"employeeId": emp.get("employeeId", "unknown"), "success": False, "error": str(e)})
        return {"success": True, "total": len(results), "successful": sum(1 for r in results if r["success"]), "results": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Startup Event
# ============================================


# ─────────────────────────────────────────────
# TIMESHEET: occupied slots + manual entry
# ─────────────────────────────────────────────

@app.get("/api/clock/occupied")
async def api_occupied_slots(date: str, current_user: dict = Depends(get_current_user)):
    """Return occupied time ranges for the current user on a given date (YYYY-MM-DD, PH time)."""
    try:
        uid = current_user.get("id") or current_user.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="No user ID")
        slots = get_occupied_slots(str(uid), date)
        return {"success": True, "date": date, "slots": slots}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clock/manual")
async def api_clock_manual(body: Request, current_user: dict = Depends(get_current_user)):
    """Submit a manual clock entry for admin approval.
    
    Accepts JSON:
    {
        manualDate: "2025-04-19"        # PH date YYYY-MM-DD
        clockInTime: "09:00"
        clockOutTime: "17:00"
        clockOutNextDay: false            # true if clock out is next calendar day
        clockInProofType: "photo"        # or "note"
        clockInProofUrl: "data:..."      # base64 photo OR null
        clockInNote: "..."               # text note OR null
        clockOutProofType: "photo"       # or "note"
        clockOutProofUrl: "data:..."
        clockOutNote: "..."
    }
    """
    try:
        data = await body.json()
        uid = current_user.get("id") or current_user.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="No user ID")

        user_data = get_web_user(uid)
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")

        employee_id = user_data.get("employeeId", uid[:8].upper())
        manual_date = data.get("manualDate")
        clock_in = data.get("clockInTime", "")
        clock_out = data.get("clockOutTime", "")
        clock_out_next_day = data.get("clockOutNextDay", False)

        if not manual_date or not clock_in or not clock_out:
            raise HTTPException(status_code=400, detail="manualDate, clockInTime, clockOutTime are required")

        # Validate max 15 hours
        from datetime import datetime as dt
        fmt = "%H:%M"
        try:
            in_t = dt.strptime(clock_in, fmt)
            out_t = dt.strptime(clock_out, fmt)
            if clock_out_next_day:
                out_t = out_t + timedelta(days=1)
            duration_hrs = (out_t - in_t).total_seconds() / 3600
            if duration_hrs <= 0:
                raise HTTPException(status_code=400, detail="Clock out must be after clock in")
            if duration_hrs > 15:
                raise HTTPException(status_code=400, detail="Shift cannot exceed 15 hours")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid time format — use HH:MM")

        # Check for overlaps with existing shifts
        existing = get_occupied_slots(str(uid), manual_date)
        in_min = int(clock_in.split(":")[0]) * 60 + int(clock_in.split(":")[1])
        out_min = int(clock_out.split(":")[0]) * 60 + int(clock_out.split(":")[1])
        if clock_out_next_day:
            out_min += 1440
        for slot in existing:
            s_parts = slot["start"].split(":")
            e_parts = slot["end"].split(":")
            if len(s_parts) < 2 or len(e_parts) < 2:
                continue
            s_min = int(s_parts[0]) * 60 + int(s_parts[1])
            e_min = int(e_parts[0]) * 60 + int(e_parts[1])
            # Overlap check
            if in_min < e_min and out_min > s_min:
                raise HTTPException(
                    status_code=400,
                    detail=f"Time range overlaps with existing shift {slot['start']}–{slot['end']}"
                )

        record = create_manual_entry({
            "userId": str(uid),
            "employeeId": str(employee_id),
            "manualDate": manual_date,
            "clockInTime": clock_in,
            "clockOutTime": clock_out,
            "clockOutNextDay": clock_out_next_day,
            "clockInProofType": data.get("clockInProofType", "photo"),
            "clockInProofUrl": data.get("clockInProofUrl"),
            "clockInNote": data.get("clockInNote"),
            "clockOutProofType": data.get("clockOutProofType", "photo"),
            "clockOutProofUrl": data.get("clockOutProofUrl"),
            "clockOutNote": data.get("clockOutNote"),
        })

        return {
            "success": True,
            "recordId": record["docId"],
            "message": "Manual entry submitted for admin approval",
            "status": "pending_manual",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ─────────────────────────────────────────────
# OVERTIME endpoints
# ─────────────────────────────────────────────

@app.get("/api/clock/ot")
async def api_get_ot(date: str, current_user: dict = Depends(get_current_user)):
    """Return the OT record for a user on a given date if any."""
    try:
        uid = current_user.get("id") or current_user.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="No user ID")
        db = get_firestore_db()
        docs = list(
            db.collection("web_users").document(uid).collection("attendance")
            .where("type", "==", "OT_MANUAL")
            .where("manualDate", "==", date)
            .limit(1)
            .stream()
        )
        if not docs:
            return {"success": True, "record": None}
        d = docs[0].to_dict()
        ts = d.get("submittedAt")
        d["submittedAt"] = ts.isoformat() if hasattr(ts, "isoformat") else str(ts) if ts else None
        return {"success": True, "record": {"id": docs[0].id, **d}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clock/overtime")
async def api_clock_overtime(body: Request, current_user: dict = Depends(get_current_user)):
    """Submit or update an overtime entry for a past shift day."""
    try:
        data = await body.json()
        uid = current_user.get("id") or current_user.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="No user ID")
        user_data = get_web_user(uid)
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
        employee_id = user_data.get("employeeId", uid[:8].upper())
        manual_date = data.get("manualDate")
        clock_in = data.get("clockInTime", "")
        clock_out = data.get("clockOutTime", "")
        clock_out_next_day = data.get("clockOutNextDay", False)
        record_id = data.get("recordId")

        if not manual_date or not clock_in or not clock_out:
            raise HTTPException(status_code=400, detail="manualDate, clockInTime, clockOutTime required")

        from datetime import datetime as dt
        fmt = "%H:%M"
        try:
            in_t = dt.strptime(clock_in, fmt)
            out_t = dt.strptime(clock_out, fmt)
            if clock_out_next_day:
                out_t = out_t + timedelta(days=1)
            duration_hrs = (out_t - in_t).total_seconds() / 3600
            if duration_hrs <= 0:
                raise HTTPException(status_code=400, detail="Clock out must be after clock in")
            if duration_hrs > 15:
                raise HTTPException(status_code=400, detail="OT shift cannot exceed 15 hours")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid time format — use HH:MM")

        db = get_firestore_db()
        is_edit = bool(record_id)

        if is_edit:
            # Check it's still pending before allowing edit
            doc_ref = db.collection("web_users").document(uid).collection("attendance").document(record_id)
            doc = doc_ref.get()
            if not doc.exists:
                raise HTTPException(status_code=404, detail="OT record not found")
            existing = doc.to_dict()
            if existing.get("status") != "pending_ot":
                raise HTTPException(status_code=400, detail="Cannot edit — OT record already approved")
            doc_ref.update({
                "clockInTime": clock_in,
                "clockOutTime": clock_out,
                "clockOutNextDay": clock_out_next_day,
                "clockInProofType": data.get("clockInProofType", "photo"),
                "clockInProofUrl": data.get("clockInProofUrl"),
                "clockInNote": data.get("clockInNote"),
                "clockOutProofType": data.get("clockOutProofType", "photo"),
                "clockOutProofUrl": data.get("clockOutProofUrl"),
                "clockOutNote": data.get("clockOutNote"),
                "updatedAt": firestore.SERVER_TIMESTAMP,
            })
            return {"success": True, "recordId": record_id, "message": "OT entry updated"}
        else:
            doc_id = str(uuid.uuid4())
            db.collection("web_users").document(uid).collection("attendance").document(doc_id).set({
                "recordId": doc_id,
                "userId": str(uid),
                "employeeId": str(employee_id),
                "type": "OT_MANUAL",
                "status": "pending_ot",
                "manualDate": manual_date,
                "clockInTime": clock_in,
                "clockOutTime": clock_out,
                "clockOutNextDay": clock_out_next_day,
                "clockInProofType": data.get("clockInProofType", "photo"),
                "clockInProofUrl": data.get("clockInProofUrl"),
                "clockInNote": data.get("clockInNote"),
                "clockOutProofType": data.get("clockOutProofType", "photo"),
                "clockOutProofUrl": data.get("clockOutProofUrl"),
                "clockOutNote": data.get("clockOutNote"),
                'timestamp': firestore.SERVER_TIMESTAMP,
                "submittedAt": firestore.SERVER_TIMESTAMP,
            })
            return {"success": True, "recordId": doc_id, "message": "OT entry submitted for approval", "status": "pending_ot"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clock/manual/edit")
async def api_clock_manual_edit(body: Request, current_user: dict = Depends(get_current_user)):
    """Edit a pending manual shift entry."""
    try:
        data = await body.json()
        uid = current_user.get("id") or current_user.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="No user ID")
        record_id = data.get("recordId")
        if not record_id:
            raise HTTPException(status_code=400, detail="recordId required")
        db = get_firestore_db()
        doc_ref = db.collection("web_users").document(uid).collection("attendance").document(record_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Record not found")
        existing = doc.to_dict()
        if existing.get("status") != "pending_manual":
            raise HTTPException(status_code=400, detail="Cannot edit — record already approved")

        clock_in = data.get("clockInTime", "")
        clock_out = data.get("clockOutTime", "")
        clock_out_next_day = data.get("clockOutNextDay", False)
        from datetime import datetime as dt
        try:
            in_t = dt.strptime(clock_in, "%H:%M")
            out_t = dt.strptime(clock_out, "%H:%M")
            if clock_out_next_day: out_t = out_t + timedelta(days=1)
            duration_hrs = (out_t - in_t).total_seconds() / 3600
            if duration_hrs <= 0: raise HTTPException(status_code=400, detail="Clock out must be after clock in")
            if duration_hrs > 15: raise HTTPException(status_code=400, detail="Max 15 hours")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid time format")

        doc_ref.update({
            "clockInTime": clock_in,
            "clockOutTime": clock_out,
            "clockOutNextDay": clock_out_next_day,
            "clockInProofType": data.get("clockInProofType", "photo"),
            "clockInProofUrl": data.get("clockInProofUrl"),
            "clockInNote": data.get("clockInNote"),
            "clockOutProofType": data.get("clockOutProofType", "photo"),
            "clockOutProofUrl": data.get("clockOutProofUrl"),
            "clockOutNote": data.get("clockOutNote"),
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
        return {"success": True, "recordId": record_id, "message": "Entry updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.on_event("startup")
async def startup_event():
    init_sqlite_db()
    init_firebase()
    scheduler.start()
    print("APScheduler started.")
    # Warm up DeepFace Facenet model so first request isn't slow
    try:
        dummy = np.zeros((100, 100, 3), dtype=np.uint8)
        DeepFace.represent(img_path=dummy, model_name="Facenet", enforce_detection=False)
        print("DeepFace Facenet model warmed up.")
    except Exception as e:
        print(f"DeepFace warmup failed (non-critical): {e}")