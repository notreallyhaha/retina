import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import '../models/attendance_record.dart';

class DatabaseService {
  static final FirebaseFirestore _db = FirebaseFirestore.instance;

  // Save User Profile to the Cloud
  static Future<void> saveUserProfile(String fName, String lName, String email) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    try {
      await _db.collection('users').doc(user.uid).set({
        'firstName': fName,
        'lastName': lName,
        'email': email,
        'company': 'AppCase Inc.',
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      debugPrint("✅ Profile saved to Cloud");
    } catch (e) {
      debugPrint("❌ Profile Save Error: $e");
    }
  }

  // --- NEW: Fetch First Name for Greetings ---
  static Future<String> getUserFirstName() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return "USER";
    try {
      final doc = await _db.collection('users').doc(user.uid).get();
      if (doc.exists && doc.data()!.containsKey('firstName')) {
        return doc.data()!['firstName'].toString().toUpperCase();
      }
    } catch (e) {
      debugPrint("Error fetching name: $e");
    }
    return user.email?.split('@')[0].toUpperCase() ?? "USER";
  }

  // Add Attendance Record
  static Future<void> addRecord(AttendanceRecord record) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    try {
      await _db.collection('users').doc(user.uid).collection('attendance').add(record.toMap());
      debugPrint("✅ Attendance Record synced!");
    } catch (e) {
      debugPrint("❌ Error adding record: $e");
    }
  }

  // Get Records
  static Future<List<AttendanceRecord>> getRecords() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return [];

    final snapshot = await _db
        .collection('users')
        .doc(user.uid)
        .collection('attendance')
        .orderBy('timestamp', descending: true)
        .get();

    return snapshot.docs.map((doc) => AttendanceRecord.fromMap(doc.data())).toList();
  }
}