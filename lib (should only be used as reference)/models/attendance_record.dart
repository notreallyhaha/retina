class AttendanceRecord {
  final String id;
  final String imagePath;
  final DateTime timestamp;
  final String company;
  final String shiftType;
  final String location;

  AttendanceRecord({
    required this.id,
    required this.imagePath,
    required this.timestamp,
    required this.company,
    required this.shiftType,
    required this.location,
  });

  // 1. Convert an AttendanceRecord object into a Map to send to Firestore
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'imagePath': imagePath,
      'timestamp': timestamp.toIso8601String(), // Store as a string for easy reading
      'company': company,
      'shiftType': shiftType,
      'location': location,
    };
  }

  // 2. Create an AttendanceRecord object from a Firestore Map
  factory AttendanceRecord.fromMap(Map<String, dynamic> map) {
    return AttendanceRecord(
      id: map['id'] ?? '',
      imagePath: map['imagePath'] ?? '',
      timestamp: DateTime.parse(map['timestamp']),
      company: map['company'] ?? '',
      shiftType: map['shiftType'] ?? '',
      location: map['location'] ?? '',
    );
  }
}