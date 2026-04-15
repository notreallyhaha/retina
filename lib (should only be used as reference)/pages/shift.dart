import 'dart:async';
import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:camera/camera.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';
import '../services/database_service.dart';
import '../models/attendance_record.dart';
import 'history.dart';

class Shift extends StatefulWidget {
  const Shift({super.key});
  @override
  State<Shift> createState() => _ShiftState();
}

class _ShiftState extends State<Shift> {
  String _currentTime = "";
  String _currentLocation = "Locating...";
  late Timer _timer;
  Timer? _autoScanTimer;
  CameraController? _cameraController;
  bool _isCameraInitialized = false;
  bool _isDetecting = false;

  String _selectedShiftType = "CLOCK IN";
  final List<String> _shiftOptions = ["CLOCK IN", "CLOCK OUT", "OVERTIME"];
  final String _selectedCompany = "AppCase Inc.";
  final List<Color> brandGradient = const [Color(0xFF5A7AFF), Color(0xFFC778FD), Color(0xFFF2709C)];

  @override
  void initState() {
    super.initState();
    _loadCurrentLocation();
    _updateTime();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) { if (mounted) _updateTime(); });
    _initializeLiveCamera();
  }

  void _showModernToast(String message, Color bgColor) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)), backgroundColor: bgColor, behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)), margin: const EdgeInsets.all(20), elevation: 10, duration: const Duration(seconds: 2)));
  }

  Future<void> _initializeLiveCamera() async {
    try {
      final cameras = await availableCameras();
      final frontCamera = cameras.firstWhere((c) => c.lensDirection == CameraLensDirection.front, orElse: () => cameras.first);
      _cameraController = CameraController(frontCamera, ResolutionPreset.medium, enableAudio: false);
      await _cameraController!.initialize();
      if (!mounted) return;
      setState(() { _isCameraInitialized = true; });
      _autoScanTimer = Timer.periodic(const Duration(seconds: 3), (timer) { _scanFaceInBackground(); });
    } catch (e) { debugPrint("Camera Error: $e"); }
  }

  Future<void> _scanFaceInBackground() async {
    if (_isDetecting || _cameraController == null || !_cameraController!.value.isInitialized) return;
    setState(() { _isDetecting = true; });

    try {
      final XFile photo = await _cameraController!.takePicture();
      final user = FirebaseAuth.instance.currentUser;

      // UPDATED TO RAILWAY URL
      var uri = Uri.parse('https://retina-backend-production.up.railway.app/recognize');
      var request = http.MultipartRequest('POST', uri);
      request.fields['email'] = user?.email ?? 'unknown';
      request.files.add(await http.MultipartFile.fromPath('file', photo.path));

      var streamedResponse = await request.send().timeout(const Duration(seconds: 5));
      var response = await http.Response.fromStream(streamedResponse);
      var result = jsonDecode(response.body);

      if (result['status'] == 'success') {
        _autoScanTimer?.cancel();
        final List<int> imageBytes = await File(photo.path).readAsBytes();
        final String base64Image = base64Encode(imageBytes);

        String finalShiftType = _selectedShiftType;
        if (finalShiftType == "CLOCK IN" && DateTime.now().hour >= 9) finalShiftType = "LATE";

        final record = AttendanceRecord(id: '', imagePath: base64Image, timestamp: DateTime.now(), company: _selectedCompany, shiftType: finalShiftType, location: _currentLocation);
        await DatabaseService.addRecord(record);

        _showModernToast("SUCCESS: ${result['message']}", Colors.green);
        if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (context) => const History()));
      } else {
        _showModernToast(result['message'], Colors.orange);
      }
    } on TimeoutException catch (_) {
      _showModernToast("Server Timeout! Is Python running?", Colors.redAccent);
    } catch (e) {
      _showModernToast("Connection Error!", Colors.red);
    } finally {
      if (mounted) setState(() { _isDetecting = false; });
    }
  }

  Future<void> _loadCurrentLocation() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) { setState(() { _currentLocation = "GPS Disabled"; }); return; }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) { setState(() { _currentLocation = "Permission Denied"; }); return; }
      }

      Position? position = await Geolocator.getLastKnownPosition();

      try {
        position = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.low, timeLimit: const Duration(seconds: 3));
      } catch (e) {
        // Fallback catch
      }

      if (position != null) {
        List<Placemark> placemarks = await placemarkFromCoordinates(position.latitude, position.longitude);
        setState(() { _currentLocation = "${placemarks[0].name ?? ''}, ${placemarks[0].locality}"; });
      } else {
        setState(() { _currentLocation = "Manila, Philippines (Simulated)"; });
      }
    } catch (e) {
      setState(() { _currentLocation = "Location Unavailable"; });
    }
  }

  void _updateTime() { setState(() { _currentTime = DateFormat('h:mm a').format(DateTime.now()); }); }

  @override
  void dispose() {
    _timer.cancel();
    _autoScanTimer?.cancel();
    _cameraController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0D0D),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
              child: Row(
                children: [
                  IconButton(icon: const Icon(Icons.arrow_back_ios, color: Colors.white, size: 22), onPressed: () => Navigator.pop(context)),
                  const Spacer(),
                  const Text("LIVE SCAN", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2.0)),
                  const Spacer(),
                  const SizedBox(width: 40),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 30),
              decoration: BoxDecoration(boxShadow: [BoxShadow(color: brandGradient[1].withAlpha(40), blurRadius: 40, spreadRadius: 5)], border: Border.all(color: _isDetecting ? brandGradient[1] : Colors.white24, width: 3), borderRadius: BorderRadius.circular(30)),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(27),
                child: AspectRatio(
                  aspectRatio: 3/4,
                  child: _isCameraInitialized ? CameraPreview(_cameraController!) : Container(color: Colors.grey[900], child: const Center(child: CircularProgressIndicator(color: Color(0xFFC778FD)))),
                ),
              ),
            ),
            const SizedBox(height: 30),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(_isDetecting ? Icons.radar : Icons.face, color: _isDetecting ? brandGradient[1] : Colors.white54, size: 20),
                const SizedBox(width: 10),
                Text(_isDetecting ? "ANALYZING BIOMETRICS..." : "ALIGN FACE IN FRAME", style: TextStyle(color: _isDetecting ? brandGradient[1] : Colors.white54, fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 2.0)),
              ],
            ),
            const Spacer(),
            Container(
              padding: const EdgeInsets.fromLTRB(30, 30, 30, 40),
              decoration: BoxDecoration(color: Colors.white.withAlpha(10), borderRadius: const BorderRadius.only(topLeft: Radius.circular(40), topRight: Radius.circular(40))),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(child: _buildBorderedField(Icons.location_on, _currentLocation)),
                      const SizedBox(width: 15),
                      Expanded(child: _buildBorderedField(Icons.business, _selectedCompany)),
                    ],
                  ),
                  const SizedBox(height: 15),
                  Row(
                    children: [
                      Expanded(child: _buildBorderedField(Icons.access_time, _currentTime)),
                      const SizedBox(width: 15),
                      Expanded(child: _buildDropdownField()),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBorderedField(IconData icon, String text) {
    return Container(
      height: 45, padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(color: Colors.black.withAlpha(100), borderRadius: BorderRadius.circular(15), border: Border.all(color: Colors.white12)),
      child: Row(
        children: [
          Icon(icon, color: brandGradient[0], size: 16),
          const SizedBox(width: 8),
          Expanded(child: Text(text.toUpperCase(), style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
  }

  Widget _buildDropdownField() {
    return Container(
      height: 45, padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(color: Colors.black.withAlpha(100), borderRadius: BorderRadius.circular(15), border: Border.all(color: Colors.white12)),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _selectedShiftType, dropdownColor: const Color(0xFF1A1A1A), isExpanded: true,
          icon: const Icon(Icons.arrow_drop_down, color: Colors.white70),
          items: _shiftOptions.map((String value) { return DropdownMenuItem<String>(value: value, child: Text(value, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold))); }).toList(),
          onChanged: (val) => setState(() => _selectedShiftType = val!),
        ),
      ),
    );
  }
}