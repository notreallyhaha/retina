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

from database import (
    init_sqlite_db, get_sqlite_connection, init_firebase, get_firestore_db,
    create_web_user, get_web_user, update_web_user, delete_web_user, list_web_users,
    create_attendance_record, query_attendance_records,
    create_session, delete_session
)

app = FastAPI(title="Face Recognition Clock API")

# --- Configuration ---
JWT_SECRET = os.environ.get("JWT_SECRET", "super-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

# --- CORS Middleware (allow Vercel frontend) ---
allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Helper function for recognition ---
def calculate_cosine_distance(source, test):
    """Calculates the mathematical distance between two face embeddings."""
    a = np.matmul(np.transpose(source), test)
    b = np.sum(np.multiply(source, source))
    c = np.sum(np.multiply(test, test))
    return 1 - (a / (np.sqrt(b) * np.sqrt(c)))


# --- Auth Dependency ---
async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract and validate JWT token, return user dict."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.replace("Bearer ", "")
    try:
        # Try Firebase Admin SDK verify first
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token["uid"]
        # Fetch from Firestore
        firestore_user = get_web_user(uid)
        if firestore_user:
            return firestore_user
        return {"id": uid, "firebase_uid": uid}
    except Exception:
        # Fallback to custom JWT
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(current_user: dict = Depends(get_current_user)):
    """Ensure current user is an admin."""
    if not current_user.get("isAdmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


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
        cursor.execute(
            "INSERT INTO users (name, face_encoding) VALUES (?, ?)",
            (email, embedding_json)
        )
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()

        return {
            "status": "success",
            "message": f"Successfully registered face for '{email}'!",
            "user_id": user_id
        }

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
            cooldown_seconds = 60

            cursor.execute(
                "SELECT timestamp FROM attendance_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1",
                (best_match_id,)
            )
            last_log = cursor.fetchone()

            can_log = True
            if last_log:
                last_log_time = datetime.strptime(last_log[0], "%Y-%m-%d %H:%M:%S")
                time_difference = (now - last_log_time).total_seconds()
                if time_difference < cooldown_seconds:
                    can_log = False

            if can_log:
                cursor.execute(
                    "INSERT INTO attendance_logs (user_id, timestamp) VALUES (?, ?)",
                    (best_match_id, now_str)
                )
                conn.commit()
                final_message = "Check-in logged successfully!"
                log_status = now_str
            else:
                final_message = "Welcome back!"
                log_status = "Skipped (Cooldown active)"

            conn.close()

            return {
                "status": "success",
                "message": final_message,
                "time_logged": log_status,
                "distance": round(lowest_distance, 3)
            }

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

        query = """
        SELECT attendance_logs.id, users.name, attendance_logs.timestamp
        FROM attendance_logs
        JOIN users ON attendance_logs.user_id = users.id
        ORDER BY attendance_logs.timestamp DESC
        """

        cursor.execute(query)
        logs = cursor.fetchall()
        conn.close()

        log_list = []
        for row in logs:
            log_list.append({
                "log_id": row["id"],
                "name": row["name"],
                "timestamp": row["timestamp"]
            })

        return {"status": "success", "total_logs": len(log_list), "data": log_list}

    except Exception as e:
        return {"status": "error", "message": str(e)}


# ============================================
# NEW WEB APP ENDPOINTS
# ============================================

# --- Auth Endpoints ---

@app.post("/api/auth/register")
async def api_register(body: Request):
    """Create Firebase Auth account + save to web_users."""
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

        # Create Firebase Auth user
        try:
            user_record = auth.create_user(
                email=email,
                password=password,
                display_name=f"{first_name} {last_name}"
            )
        except firebase_admin.auth.EmailAlreadyExistsError:
            raise HTTPException(status_code=409, detail="Email already registered")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Auth creation failed: {str(e)}")

        uid = user_record.uid

        # Save to Firestore web_users
        create_web_user(uid, {
            "firstName": first_name,
            "lastName": last_name,
            "email": email,
            "employeeId": "",
        })

        # Generate custom JWT for API access
        token = jwt.encode({
            "uid": uid,
            "email": email,
            "firstName": first_name,
            "lastName": last_name,
            "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)
        }, JWT_SECRET, algorithm=JWT_ALGORITHM)

        # Create session
        create_session(str(uuid.uuid4()), {
            "userId": uid,
            "token": token
        })

        return {
            "success": True,
            "token": token,
            "user": {
                "uid": uid,
                "email": email,
                "firstName": first_name,
                "lastName": last_name,
                "faceEnrolled": False,
                "employeeId": ""
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/auth/login")
async def api_login(body: Request):
    """Firebase Auth login → return JWT token."""
    try:
        data = await body.json()
        email = data.get("email", "").strip()
        password = data.get("password", "")

        if not email or not password:
            raise HTTPException(status_code=400, detail="Email and password required")

        # NOTE: Firebase Admin SDK doesn't support email/password sign-in directly.
        # The client must use Firebase Client SDK to get an ID token, then send it here.
        # For custom flow, we use the client-sent token.

        # If client sends Firebase ID token in a special field, verify it
        firebase_token = data.get("firebaseToken") or data.get("token")
        if firebase_token:
            try:
                decoded = auth.verify_id_token(firebase_token)
                uid = decoded["uid"]
            except Exception:
                raise HTTPException(status_code=401, detail="Invalid Firebase token")
        else:
            # Fallback: create a custom token (server-side login)
            # This is less secure but works for the custom flow
            raise HTTPException(
                status_code=400,
                detail="Login requires a Firebase ID token from the client SDK"
            )

        # Fetch user from Firestore
        user_data = get_web_user(uid)
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")

        # Generate custom API JWT
        token = jwt.encode({
            "uid": uid,
            "email": user_data.get("email", ""),
            "firstName": user_data.get("firstName", ""),
            "lastName": user_data.get("lastName", ""),
            "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)
        }, JWT_SECRET, algorithm=JWT_ALGORITHM)

        create_session(str(uuid.uuid4()), {
            "userId": uid,
            "token": token
        })

        return {
            "success": True,
            "token": token,
            "user": {
                "uid": uid,
                "email": user_data.get("email", ""),
                "firstName": user_data.get("firstName", ""),
                "lastName": user_data.get("lastName", ""),
                "faceEnrolled": user_data.get("faceEnrolled", False),
                "employeeId": user_data.get("employeeId", "")
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/auth/logout")
async def api_logout(authorization: Optional[str] = Header(None)):
    """Invalidate session."""
    try:
        if authorization and authorization.startswith("Bearer "):
            token = authorization.replace("Bearer ", "")
            # Delete any session with this token
            db = get_firestore_db()
            sessions = db.collection("web_sessions").where("token", "==", token).stream()
            for doc in sessions:
                delete_session(doc.id)
        return {"success": True, "message": "Logged out"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/auth/me")
async def api_get_me(current_user: dict = Depends(get_current_user)):
    """Get current user from JWT."""
    return {
        "success": True,
        "user": current_user
    }


# --- Face Registration Endpoint ---

@app.post("/api/register/face")
async def api_register_face(
    body: Request,
    current_user: dict = Depends(get_current_user)
):
    """Upload image → DeepFace extracts embedding → store in web_users."""
    try:
        data = await body.json()
        face_descriptors = data.get("faceDescriptors", [])
        average_descriptor = data.get("averageDescriptor")
        liveness_score = data.get("livenessScore", 0)

        if not face_descriptors and not average_descriptor:
            raise HTTPException(status_code=400, detail="No face descriptors provided")

        uid = current_user.get("id") or current_user.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="No user ID")

        # Update user in Firestore
        update_web_user(uid, {
            "faceEnrolled": True,
            "averageDescriptor": average_descriptor,
            "descriptors": face_descriptors,
            "livenessScore": liveness_score
        })

        return {
            "success": True,
            "message": "Face enrolled successfully",
            "employeeId": uid[:8].upper()
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Clock In/Out Endpoint ---

@app.post("/api/clock")
async def api_clock(
    body: Request,
    current_user: dict = Depends(get_current_user)
):
    """Upload image + GPS → DeepFace verifies face → log to web_attendance."""
    try:
        data = await body.json()
        clock_type = data.get("type", "IN")  # IN or OUT
        location = data.get("location")
        face_descriptor = data.get("faceDescriptor")
        proof_photo = data.get("proofPhoto")

        if not face_descriptor:
            raise HTTPException(status_code=400, detail="Face descriptor required")

        uid = current_user.get("id") or current_user.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="No user ID")

        user_data = get_web_user(uid)
        if not user_data or not user_data.get("faceEnrolled"):
            raise HTTPException(status_code=400, detail="Face not enrolled")

        # Verify face against stored descriptor
        stored_descriptor = user_data.get("averageDescriptor")
        if not stored_descriptor:
            raise HTTPException(status_code=400, detail="No face data stored")

        distance = calculate_cosine_distance(
            np.array(stored_descriptor),
            np.array(face_descriptor)
        )

        if distance >= 0.40:
            raise HTTPException(
                status_code=403,
                detail=f"Face verification failed (distance: {distance:.3f})"
            )

        # Log attendance
        employee_id = user_data.get("employeeId", uid[:8].upper())
        record = create_attendance_record({
            "userId": uid,
            "employeeId": employee_id,
            "type": clock_type.upper(),
            "location": location,
            "proofPhotoUrl": proof_photo
        })

        return {
            "success": True,
            "message": f"Clock {clock_type.upper()} logged",
            "recordId": record["docId"],
            "employeeId": employee_id,
            "name": f"{user_data.get('firstName', '')} {user_data.get('lastName', '')}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "distance": round(distance, 3)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Admin Endpoints ---

@app.get("/api/employees")
async def api_list_employees(admin: dict = Depends(require_admin)):
    """List all users from web_users. Admin only."""
    try:
        users = list_web_users(face_enrolled_only=False)
        result = []
        for u in users:
            result.append({
                "id": u.get("id"),
                "employeeId": u.get("employeeId", u.get("id", "")[:8].upper()),
                "name": f"{u.get('firstName', '')} {u.get('lastName', '')}",
                "email": u.get("email", ""),
                "faceEnrolled": u.get("faceEnrolled", False),
                "isAdmin": u.get("isAdmin", False),
                "createdAt": str(u.get("createdAt", ""))
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/employees/{employee_id}")
async def api_delete_employee(employee_id: str, admin: dict = Depends(require_admin)):
    """Delete user from Firebase Auth + remove from web_users. Admin only."""
    try:
        # Prevent admin from deleting themselves
        if employee_id == admin.get("id"):
            raise HTTPException(status_code=400, detail="Cannot delete your own account")
        # Delete from Firebase Auth
        try:
            auth.delete_user(employee_id)
        except Exception:
            pass  # User might not exist in Auth

        # Delete from Firestore
        delete_web_user(employee_id)

        return {"success": True, "message": "Employee deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/records")
async def api_records(
    employeeId: Optional[str] = None,
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    admin: dict = Depends(require_admin)
):
    """Query web_attendance with filters. Admin only."""
    try:
        records = query_attendance_records(
            employee_id=employeeId,
            start_date=startDate,
            end_date=endDate
        )

        result = []
        for r in records:
            result.append({
                "id": r.get("id"),
                "employeeId": r.get("employeeId", ""),
                "type": r.get("type", "IN"),
                "timestamp": r.get("timestamp", ""),
                "location": r.get("location"),
                "proofPhotoUrl": r.get("proofPhotoUrl")
            })

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/admin/bulk-upload")
async def api_bulk_upload(body: Request, admin: dict = Depends(require_admin)):
    """Upload multiple employees with face descriptors. Admin only."""
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
                    results.append({
                        "employeeId": employee_id or "unknown",
                        "success": False,
                        "error": "Name and Employee ID required"
                    })
                    continue

                if not face_descriptor:
                    results.append({
                        "employeeId": employee_id,
                        "success": False,
                        "error": "No face detected in photo"
                    })
                    continue

                # Create Auth user (generate random password)
                temp_password = uuid.uuid4().hex[:12] + "A1!"
                try:
                    user_record = auth.create_user(
                        email=email if email else f"{employee_id}@temp.local",
                        password=temp_password,
                        display_name=name
                    )
                except Exception as e:
                    results.append({
                        "employeeId": employee_id,
                        "success": False,
                        "error": str(e)
                    })
                    continue

                uid = user_record.uid

                # Save to Firestore
                name_parts = name.split(" ", 1)
                create_web_user(uid, {
                    "firstName": name_parts[0],
                    "lastName": name_parts[1] if len(name_parts) > 1 else "",
                    "email": email if email else f"{employee_id}@temp.local",
                    "employeeId": employee_id,
                })

                update_web_user(uid, {
                    "faceEnrolled": True,
                    "averageDescriptor": face_descriptor,
                    "descriptors": [face_descriptor]
                })

                results.append({
                    "employeeId": employee_id,
                    "success": True,
                    "uid": uid
                })

            except Exception as e:
                results.append({
                    "employeeId": emp.get("employeeId", "unknown"),
                    "success": False,
                    "error": str(e)
                })

        return {
            "success": True,
            "total": len(results),
            "successful": sum(1 for r in results if r["success"]),
            "results": results
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Startup Event
# ============================================

@app.on_event("startup")
async def startup_event():
    init_sqlite_db()
    init_firebase()
