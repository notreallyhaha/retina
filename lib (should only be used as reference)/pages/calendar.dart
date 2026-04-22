import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/database_service.dart';
import '../models/attendance_record.dart';

class Calendar extends StatefulWidget {
  const Calendar({super.key});
  @override
  State<Calendar> createState() => _CalendarState();
}

class _CalendarState extends State<Calendar> {
  final List<Color> brandGradient = const [Color(0xFF5A7AFF), Color(0xFFC778FD)];
  final DateTime now = DateTime.now();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: FutureBuilder<List<AttendanceRecord>>(
          future: DatabaseService.getRecords(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) return const Center(child: CircularProgressIndicator(color: Color(0xFFC778FD)));

            final records = snapshot.data ?? [];
            final todayStr = DateFormat('yyyy-MM-dd').format(now);
            final yesterdayStr = DateFormat('yyyy-MM-dd').format(now.subtract(const Duration(days: 1)));

            final todayRecords = records.where((r) => DateFormat('yyyy-MM-dd').format(r.timestamp) == todayStr).toList();
            final yesterdayRecords = records.where((r) => DateFormat('yyyy-MM-dd').format(r.timestamp) == yesterdayStr).toList();

            return SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.arrow_back_ios, color: Colors.white, size: 20),
                      const SizedBox(width: 15),
                      ShaderMask(blendMode: BlendMode.srcIn, shaderCallback: (bounds) => LinearGradient(colors: brandGradient).createShader(bounds), child: Text("${DateFormat('MMMM').format(now).toUpperCase()} ${now.year}", style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: 1.5))),
                    ],
                  ),
                  const SizedBox(height: 30),
                  _buildCustomCalendar(records),
                  const SizedBox(height: 40),
                  const Text("TODAY", style: TextStyle(color: Color(0xFF5A7AFF), fontWeight: FontWeight.w900, letterSpacing: 1.5)),
                  const SizedBox(height: 10),
                  ...todayRecords.map((r) => _buildDayLogBox(r)),
                  if (todayRecords.isEmpty) const Text("No logs today.", style: TextStyle(color: Colors.white24)),
                  const SizedBox(height: 30),
                  const Text("YESTERDAY", style: TextStyle(color: Color(0xFF5A7AFF), fontWeight: FontWeight.w900, letterSpacing: 1.5)),
                  const SizedBox(height: 10),
                  ...yesterdayRecords.map((r) => _buildDayLogBox(r)),
                  if (yesterdayRecords.isEmpty) const Text("No logs yesterday.", style: TextStyle(color: Colors.white24)),
                  const SizedBox(height: 80),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildCustomCalendar(List<AttendanceRecord> records) {
    int daysInMonth = DateUtils.getDaysInMonth(now.year, now.month);
    DateTime firstDay = DateTime(now.year, now.month, 1);
    int startWeekday = firstDay.weekday % 7;

    List<String> weekDays = ["S", "M", "T", "W", "TH", "F", "S"];

    return Column(
      children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: weekDays.map((d) => Text(d, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold))).toList()),
        const SizedBox(height: 15),
        GridView.builder(
          shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), itemCount: daysInMonth + startWeekday,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7, childAspectRatio: 1.2),
          itemBuilder: (context, index) {
            if (index < startWeekday) return const SizedBox();

            int day = index - startWeekday + 1;
            String dateStr = DateFormat('yyyy-MM-dd').format(DateTime(now.year, now.month, day));

            bool hasRecord = records.any((r) => DateFormat('yyyy-MM-dd').format(r.timestamp) == dateStr);
            bool isLate = records.any((r) => DateFormat('yyyy-MM-dd').format(r.timestamp) == dateStr && r.shiftType == 'LATE');

            // --- THE FIX: Is this cell exactly "Today"? ---
            bool isToday = (day == now.day);

            BoxDecoration decoration = const BoxDecoration();
            Color textColor = Colors.white;

            if (hasRecord) {
              decoration = BoxDecoration(gradient: isLate ? null : LinearGradient(colors: brandGradient), color: isLate ? Colors.redAccent : null, borderRadius: BorderRadius.circular(20));
            } else if (isToday) {
              // --- THE HIGHLIGHT: Low Opacity Highlight for Today ---
              decoration = BoxDecoration(color: Colors.white.withAlpha(25), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white24));
              textColor = const Color(0xFFC778FD); // Give today's text a pop of color
            }

            return Container(
              margin: const EdgeInsets.all(4), decoration: decoration,
              child: Center(child: Text(day.toString(), style: TextStyle(color: textColor, fontWeight: hasRecord || isToday ? FontWeight.bold : FontWeight.normal))),
            );
          },
        ),
      ],
    );
  }

  Widget _buildDayLogBox(AttendanceRecord record) {
    Color typeColor = record.shiftType == 'CLOCK IN' ? const Color(0xFFC778FD) : (record.shiftType == 'CLOCK OUT' ? Colors.pinkAccent : Colors.orange);
    return Container(
      margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
      decoration: BoxDecoration(color: const Color(0xFF1A1A1A), borderRadius: BorderRadius.circular(25), border: Border.all(color: Colors.white.withAlpha(15))),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          SizedBox(width: 70, child: Text(record.shiftType.replaceFirst(" ", "\n"), style: TextStyle(color: typeColor, fontWeight: FontWeight.w900, fontSize: 12, height: 1.1))),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(DateFormat('MMMM d').format(record.timestamp).toUpperCase(), style: const TextStyle(color: Colors.white54, fontWeight: FontWeight.bold, fontSize: 12)),
              Text(DateFormat('h:mm a').format(record.timestamp), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)),
            ],
          )
        ],
      ),
    );
  }
}