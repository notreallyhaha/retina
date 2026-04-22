import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'dart:convert';
import 'dart:io';
import '../services/database_service.dart';
import '../models/attendance_record.dart';

class History extends StatefulWidget {
  const History({super.key});
  @override
  State<History> createState() => _HistoryState();
}

class _HistoryState extends State<History> {
  final List<Color> brandGradient = const [Color(0xFF5A7AFF), Color(0xFFC778FD), Color(0xFFF2709C)];

  Widget _buildDecodedImage(String imagePath) {
    if (imagePath.length > 1000) return Image.memory(base64Decode(imagePath), fit: BoxFit.cover);
    if (File(imagePath).existsSync()) return Image.file(File(imagePath), fit: BoxFit.cover);
    return Container(color: Colors.white12, child: const Icon(Icons.image_not_supported, color: Colors.white24));
  }

  void _showRecordPopup(BuildContext context, AttendanceRecord record) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1A1A1A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: BorderSide(color: Colors.white.withAlpha(20))),
        title: Text(record.shiftType, style: TextStyle(color: _getStatusColor(record.shiftType), fontWeight: FontWeight.bold, letterSpacing: 1)),
        content: Column(
          mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(borderRadius: BorderRadius.circular(15), child: SizedBox(height: 180, width: double.infinity, child: _buildDecodedImage(record.imagePath))),
            const SizedBox(height: 15),
            Text(DateFormat('MMMM d, yyyy - h:mm a').format(record.timestamp), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Row(children: [const Icon(Icons.business, size: 14, color: Colors.white54), const SizedBox(width: 5), Text(record.company, style: const TextStyle(color: Colors.white70))]),
            const SizedBox(height: 5),
            Row(children: [const Icon(Icons.location_on, size: 14, color: Colors.white54), const SizedBox(width: 5), Expanded(child: Text(record.location, style: const TextStyle(color: Colors.white70), overflow: TextOverflow.ellipsis))]),
          ],
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text("CLOSE", style: TextStyle(color: brandGradient[1], fontWeight: FontWeight.bold)))],
      ),
    );
  }

  Color _getStatusColor(String type) {
    if (type == 'LATE') return Colors.white;
    if (type == 'CLOCK OUT') return Colors.pinkAccent;
    if (type == 'OVERTIME') return Colors.blueAccent;
    return const Color(0xFF5A7AFF);
  }

  @override
  Widget build(BuildContext context) {
    // --- THE FIX: Smart check to see if it's safe to go back ---
    bool canGoBack = Navigator.canPop(context);

    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      body: SafeArea(
        child: FutureBuilder<List<AttendanceRecord>>(
          future: DatabaseService.getRecords(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) return const Center(child: CircularProgressIndicator(color: Color(0xFFC778FD)));

            final records = snapshot.data ?? [];
            int totalLate = records.where((r) => r.shiftType == "LATE").length;
            int totalPresent = records.map((r) => DateFormat('yyyy-MM-dd').format(r.timestamp)).toSet().length;
            int totalAbsent = (15 - totalPresent) < 0 ? 0 : (15 - totalPresent);

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(25, 20, 25, 10),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          if (canGoBack)
                            GestureDetector(
                              onTap: () => Navigator.pop(context),
                              child: const Padding(padding: EdgeInsets.only(right: 15), child: Icon(Icons.arrow_back_ios, color: Colors.white, size: 20)),
                            ),
                          ShaderMask(blendMode: BlendMode.srcIn, shaderCallback: (bounds) => LinearGradient(colors: brandGradient).createShader(bounds), child: const Text("RECORD", style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: 1.5))),
                        ],
                      ),
                      Text(DateFormat('MMMM d, yyyy').format(DateTime.now()), style: const TextStyle(color: Colors.white54, fontWeight: FontWeight.bold, fontSize: 11)),
                    ],
                  ),
                ),

                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 25, vertical: 15), padding: const EdgeInsets.symmetric(vertical: 25),
                  decoration: BoxDecoration(color: const Color(0xFF151515), borderRadius: BorderRadius.circular(40), border: Border.all(color: Colors.white.withAlpha(10))),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _buildStatColumn("PRESENT", totalPresent.toString(), const [Color(0xFF5A7AFF), Color(0xFFC778FD)]),
                      _buildStatColumn("ABSENT", totalAbsent.toString(), [Colors.redAccent, Colors.red]),
                      _buildStatColumn("LATE", totalLate.toString(), [Colors.white, Colors.white70]),
                    ],
                  ),
                ),

                const Padding(padding: EdgeInsets.fromLTRB(30, 10, 20, 10), child: Text("HISTORY", style: TextStyle(color: Color(0xFFC778FD), fontWeight: FontWeight.w900, fontSize: 11, letterSpacing: 2))),

                Expanded(
                  child: records.isEmpty
                      ? const Center(child: Text("No records found.", style: TextStyle(color: Colors.white54)))
                      : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 25, vertical: 10),
                    itemCount: records.length,
                    itemBuilder: (context, index) {
                      final record = records[index];
                      final timeStr = DateFormat('h:mm a').format(record.timestamp);
                      final isLateOrAbsent = record.shiftType == 'LATE' || record.shiftType == 'ABSENT';

                      return GestureDetector(
                        onTap: () => _showRecordPopup(context, record),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 15), padding: const EdgeInsets.all(15),
                          decoration: BoxDecoration(color: const Color(0xFF151515), borderRadius: BorderRadius.circular(30), border: Border.all(color: Colors.white.withAlpha(10))),
                          child: Row(
                            children: [
                              ClipRRect(borderRadius: BorderRadius.circular(20), child: SizedBox(height: 80, width: 80, child: _buildDecodedImage(record.imagePath))),
                              const SizedBox(width: 15),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(record.location, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis),
                                    Text(timeStr, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w900)),
                                    Text(record.shiftType, style: TextStyle(color: _getStatusColor(record.shiftType), fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1)),
                                    const SizedBox(height: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(vertical: 4), width: double.infinity,
                                      decoration: BoxDecoration(color: isLateOrAbsent ? Colors.red.withAlpha(50) : Colors.green.withAlpha(50), borderRadius: BorderRadius.circular(10)),
                                      child: Text(isLateOrAbsent ? "INCOMPLETE" : "COMPLETE", textAlign: TextAlign.center, style: TextStyle(color: isLateOrAbsent ? Colors.redAccent : Colors.green, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1)),
                                    )
                                  ],
                                ),
                              )
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 80),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildStatColumn(String label, String value, List<Color> colors) {
    return Column(
      children: [
        Text(label, style: const TextStyle(color: Colors.white54, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1)),
        ShaderMask(blendMode: BlendMode.srcIn, shaderCallback: (bounds) => LinearGradient(colors: colors, begin: Alignment.topCenter, end: Alignment.bottomCenter).createShader(bounds), child: Text(value, style: const TextStyle(fontSize: 45, fontWeight: FontWeight.w200, height: 1.1))),
      ],
    );
  }
}