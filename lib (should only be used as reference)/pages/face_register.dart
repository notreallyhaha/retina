import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';
import 'home.dart'; // <-- WE NEED THIS TO FORCE THE ROUTE

class FaceRegistrationPage extends StatefulWidget {
  const FaceRegistrationPage({super.key});

  @override
  State<FaceRegistrationPage> createState() => _FaceRegistrationPageState();
}

class _FaceRegistrationPageState extends State<FaceRegistrationPage> {
  CameraController? _cameraController;
  bool _isCameraInitialized = false;
  bool _isRegistering = false;

  @override
  void initState() {
    super.initState();
    _initializeCamera();
  }

  Future<void> _initializeCamera() async {
    final cameras = await availableCameras();
    final frontCamera = cameras.firstWhere((c) => c.lensDirection == CameraLensDirection.front, orElse: () => cameras.first);

    _cameraController = CameraController(frontCamera, ResolutionPreset.medium, enableAudio: false);
    await _cameraController!.initialize();
    if (mounted) setState(() => _isCameraInitialized = true);
  }

  Future<void> _registerFace() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized) return;

    setState(() => _isRegistering = true);

    try {
      final XFile photo = await _cameraController!.takePicture();
      final user = FirebaseAuth.instance.currentUser;

      // UPDATED TO RAILWAY URL
      var uri = Uri.parse('https://retina-backend-production.up.railway.app/register');
      var request = http.MultipartRequest('POST', uri);

      request.fields['uid'] = user?.uid ?? 'unknown';
      request.fields['email'] = user?.email ?? 'unknown';
      request.files.add(await http.MultipartFile.fromPath('file', photo.path));

      var streamedResponse = await request.send().timeout(const Duration(seconds: 10));
      var response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        var result = jsonDecode(response.body);
        if (result['status'] == 'success') {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Face Registered Successfully!'), backgroundColor: Colors.green));

            // THE BULLDOZER FIX: Send them straight to Home
            Navigator.pushAndRemoveUntil(
              context,
              MaterialPageRoute(builder: (context) => const Home()),
                  (route) => false,
            );
          }
        } else {
          String errorMsg = result['message'] ?? 'Unknown error from server';
          if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $errorMsg'), backgroundColor: Colors.red));
        }
      } else {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Server Error: ${response.statusCode}'), backgroundColor: Colors.orange));
      }

    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Connection Error: Is Python running?'), backgroundColor: Colors.red));
    } finally {
      if (mounted) setState(() => _isRegistering = false);
    }
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text("REGISTER YOUR FACE", style: TextStyle(color: Color(0xFFC778FD), fontSize: 24, fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
            const Text("Look straight into the camera so we can recognize you next time.", textAlign: TextAlign.center, style: TextStyle(color: Colors.white70)),
            const SizedBox(height: 30),

            Container(
              margin: const EdgeInsets.symmetric(horizontal: 40),
              decoration: BoxDecoration(border: Border.all(color: const Color(0xFFC778FD), width: 3), borderRadius: BorderRadius.circular(15)),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: AspectRatio(
                  aspectRatio: 1,
                  child: _isCameraInitialized
                      ? CameraPreview(_cameraController!)
                      : const Center(child: CircularProgressIndicator(color: Color(0xFFC778FD))),
                ),
              ),
            ),

            const SizedBox(height: 40),
            _isRegistering
                ? const CircularProgressIndicator(color: Color(0xFFC778FD))
                : ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFC778FD),
                padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 15),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
              ),
              onPressed: _registerFace,
              child: const Text("CAPTURE & SAVE FACE", style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
            )
          ],
        ),
      ),
    );
  }
}