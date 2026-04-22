import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import '../services/database_service.dart';
import '../models/attendance_record.dart';
import 'history.dart';
import 'calendar.dart';
import 'menu.dart';
import 'shift.dart';

class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  int _currentIndex = 0;
  final List<Color> brandGradient = const [Color(0xFF5A7AFF), Color(0xFFC778FD), Color(0xFFF2709C)];

  Widget _getBody() {
    switch (_currentIndex) {
      case 0: return const _HomeContent();
      case 1: return const History();
      case 2: return const Calendar();
      case 3: return const Menu();
      default: return const _HomeContent();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      body: _getBody(),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      floatingActionButton: Container(
        height: 65, width: 65,
        decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: brandGradient), boxShadow: [BoxShadow(color: brandGradient[1].withAlpha(80), blurRadius: 20, offset: const Offset(0, 5))]),
        child: FloatingActionButton(
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (context) => const Shift())),
          backgroundColor: Colors.transparent, elevation: 0,
          child: const Icon(Icons.document_scanner_outlined, size: 30, color: Colors.white),
        ),
      ),
      bottomNavigationBar: BottomAppBar(
        color: const Color(0xFF121212), shape: const CircularNotchedRectangle(), notchMargin: 10,
        child: SizedBox(
          height: 60,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              IconButton(icon: Icon(Icons.dashboard_rounded, color: _currentIndex == 0 ? Colors.white : Colors.white30), onPressed: () => setState(() => _currentIndex = 0)),
              IconButton(icon: Icon(Icons.history_rounded, color: _currentIndex == 1 ? Colors.white : Colors.white30), onPressed: () => setState(() => _currentIndex = 1)),
              const SizedBox(width: 40),
              IconButton(icon: Icon(Icons.calendar_month_rounded, color: _currentIndex == 2 ? Colors.white : Colors.white30), onPressed: () => setState(() => _currentIndex = 2)),
              IconButton(icon: Icon(Icons.person_rounded, color: _currentIndex == 3 ? Colors.white : Colors.white30), onPressed: () => setState(() => _currentIndex = 3)),
            ],
          ),
        ),
      ),
    );
  }
}

// --- THE FIX: ISOLATED QUOTE WIDGET (Stops the whole screen from refreshing) ---
class FadingQuote extends StatefulWidget {
  const FadingQuote({super.key});
  @override
  State<FadingQuote> createState() => _FadingQuoteState();
}

class _FadingQuoteState extends State<FadingQuote> {
  Timer? _quoteTimer;
  int _quoteIndex = 0;
  final List<String> _quotes = [
    "Push yourself, no one else is going to do it.", "Great things never come from comfort zones.",
    "Success doesn’t just find you. Go get it.", "Dream bigger. Do bigger.",
    "Don’t stop when tired. Stop when done.", "Wake up with determination.",
    "Do something today your future self will thank you for.", "Little things make big days.",
    "Hard does not mean impossible.", "Make today your masterpiece."
  ];

  @override
  void initState() {
    super.initState();
    _quoteTimer = Timer.periodic(const Duration(seconds: 15), (timer) {
      if (mounted) setState(() { _quoteIndex = (_quoteIndex + 1) % _quotes.length; });
    });
  }

  @override
  void dispose() {
    _quoteTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(seconds: 1),
      transitionBuilder: (Widget child, Animation<double> animation) => FadeTransition(opacity: animation, child: child),
      child: Text("\"${_quotes[_quoteIndex]}\"", key: ValueKey<int>(_quoteIndex), style: const TextStyle(color: Colors.white54, fontStyle: FontStyle.italic, fontSize: 13, height: 1.4)),
    );
  }
}

class _HomeContent extends StatefulWidget {
  const _HomeContent();
  @override
  State<_HomeContent> createState() => _HomeContentState();
}

class _HomeContentState extends State<_HomeContent> {
  // Using initState to load data once so it never flashes!
  late Future<List<dynamic>> _dashboardData;

  @override
  void initState() {
    super.initState();
    _dashboardData = Future.wait([DatabaseService.getUserFirstName(), DatabaseService.getRecords()]);
  }

  String _getTimeGreeting() {
    var hour = DateTime.now().hour;
    if (hour < 12) return "MORNING!! ";
    if (hour < 17) return "GOODAFT!! ";
    return "EVENING!! ";
  }

  void _showRecordPopup(BuildContext context, AttendanceRecord record) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1A1A1A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: BorderSide(color: Colors.white.withAlpha(20))),
        title: Text(record.shiftType, style: TextStyle(color: record.shiftType == 'LATE' || record.shiftType == 'ABSENT' ? Colors.orange : Colors.green, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
        content: Column(
          mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(borderRadius: BorderRadius.circular(15), child: SizedBox(height: 180, width: double.infinity, child: _buildDecodedImage(record.imagePath))),
            const SizedBox(height: 15),
            Text("Date: ${DateFormat('MMMM d, yyyy - h:mm a').format(record.timestamp)}", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            const SizedBox(height: 5),
            Text("Company: ${record.company}", style: const TextStyle(color: Colors.white70)),
            const SizedBox(height: 5),
            Text("Location: ${record.location}", style: const TextStyle(color: Colors.white70)),
          ],
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text("CLOSE", style: TextStyle(color: Color(0xFFC778FD))))],
      ),
    );
  }

  Widget _buildDecodedImage(String imagePath) {
    if (imagePath.length > 1000) return Image.memory(base64Decode(imagePath), fit: BoxFit.cover);
    if (File(imagePath).existsSync()) return Image.file(File(imagePath), fit: BoxFit.cover);
    return Container(color: Colors.white12, child: const Icon(Icons.person, color: Colors.white24));
  }

  @override
  Widget build(BuildContext context) {
    final List<Color> brandGradient = const [Color(0xFF5A7AFF), Color(0xFFC778FD), Color(0xFFF2709C)];

    return FutureBuilder(
      future: _dashboardData,
      builder: (context, AsyncSnapshot<List<dynamic>> snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) return const Center(child: CircularProgressIndicator(color: Color(0xFFC778FD)));

        final String firstName = snapshot.data?[0] ?? "USER";
        final List<AttendanceRecord> records = snapshot.data?[1] ?? [];

        Set<String> uniqueDays = records.map((r) => DateFormat('yyyy-MM-dd').format(r.timestamp)).toSet();
        int totalAttendedDays = uniqueDays.length;
        double percentage = (totalAttendedDays / 15).clamp(0.0, 1.0);
        int displayPercent = (percentage * 100).toInt();
        int totalLates = records.where((r) => r.shiftType == "LATE").length;

        return Scaffold(
          backgroundColor: Colors.transparent,
          appBar: AppBar(
            backgroundColor: Colors.transparent, elevation: 0, leadingWidth: 140,
            leading: Padding(padding: const EdgeInsets.only(left: 20.0), child: Image.asset('asset/images/retina_logo.png', fit: BoxFit.contain, alignment: Alignment.centerLeft, errorBuilder: (c, e, s) => const Icon(Icons.remove_red_eye, color: Colors.white24))),
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 25.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 20),
                Row(children: [
                  _buildGradientText(_getTimeGreeting(), 32, brandGradient, true),
                  Expanded(child: _buildGradientText(firstName, 32, brandGradient, false)),
                ]),
                const SizedBox(height: 10),

                // --- INSERTING THE ISOLATED QUOTE WIDGET HERE ---
                const FadingQuote(),

                const SizedBox(height: 35),
                Container(
                  padding: const EdgeInsets.all(25),
                  decoration: BoxDecoration(color: const Color(0xFF151515), borderRadius: BorderRadius.circular(40), border: Border.all(color: Colors.white.withAlpha(10))),
                  child: Row(
                    children: [
                      Stack(
                        alignment: Alignment.center,
                        children: [
                          SizedBox(height: 90, width: 90, child: CircularProgressIndicator(value: percentage, strokeWidth: 10, strokeCap: StrokeCap.round, backgroundColor: Colors.white.withAlpha(15), valueColor: AlwaysStoppedAnimation<Color>(brandGradient[1]))),
                          Text("$displayPercent%", style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                        ],
                      ),
                      const SizedBox(width: 25),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text("TRACKING", style: TextStyle(color: Colors.white54, fontSize: 10, letterSpacing: 2.0, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 5),
                            Text("Target: $totalAttendedDays/15", style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 8),
                            Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: Colors.orange.withAlpha(30), borderRadius: BorderRadius.circular(10)), child: Text("Lates Logged: $totalLates", style: const TextStyle(color: Colors.orange, fontSize: 11, fontWeight: FontWeight.bold))),
                          ],
                        ),
                      )
                    ],
                  ),
                ),
                const SizedBox(height: 40),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text("RECENT ACTIVITY", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12, letterSpacing: 1.5)),
                    GestureDetector(onTap: () => Navigator.push(context, MaterialPageRoute(builder: (context) => const History())), child: _buildGradientText("SEE ALL", 12, brandGradient, true)),
                  ],
                ),
                const SizedBox(height: 20),

                records.isEmpty
                    ? const Padding(padding: EdgeInsets.symmetric(vertical: 40), child: Center(child: Text('No attendance records yet.\nTap the camera to start!', textAlign: TextAlign.center, style: TextStyle(color: Colors.white54, fontSize: 16))))
                    : ListView.separated(
                  shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
                  itemCount: records.length > 3 ? 3 : records.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 15),
                  itemBuilder: (context, index) => GestureDetector(onTap: () => _showRecordPopup(context, records[index]), child: _buildHistoryItem(records[index])),
                ),
                const SizedBox(height: 120),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildHistoryItem(AttendanceRecord record) {
    final timeStr = DateFormat('h:mm a').format(record.timestamp);
    Color statusColor = Colors.green;
    if (record.shiftType == 'LATE') statusColor = Colors.orange;
    if (record.shiftType == 'CLOCK OUT') statusColor = Colors.pinkAccent;
    if (record.shiftType == 'OVERTIME') statusColor = Colors.blueAccent;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: const Color(0xFF151515), borderRadius: BorderRadius.circular(30), border: Border.all(color: Colors.white.withAlpha(10))),
      child: Row(
        children: [
          ClipRRect(borderRadius: BorderRadius.circular(20), child: SizedBox(height: 55, width: 55, child: _buildDecodedImage(record.imagePath))),
          const SizedBox(width: 15),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(record.location, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis),
                const SizedBox(height: 3),
                Text(timeStr, style: const TextStyle(color: Colors.white54, fontSize: 12)),
                const SizedBox(height: 3),
                Text(record.shiftType, style: TextStyle(color: statusColor, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.0)),
              ],
            ),
          ),
          const Icon(Icons.arrow_forward_ios, color: Colors.white24, size: 14),
        ],
      ),
    );
  }

  Widget _buildGradientText(String text, double size, List<Color> colors, bool bold) {
    return ShaderMask(blendMode: BlendMode.srcIn, shaderCallback: (bounds) => LinearGradient(colors: colors).createShader(bounds), child: Text(text, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: size, fontWeight: bold ? FontWeight.w900 : FontWeight.w300, letterSpacing: bold ? 1.0 : 0.0)));
  }
}