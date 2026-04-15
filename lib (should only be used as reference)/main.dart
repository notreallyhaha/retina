import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:async';
import 'firebase_options.dart';
import 'services/database_service.dart'; // Needed to fetch the name

import 'pages/intro.dart';
import 'pages/home.dart';
import 'pages/signin.dart';

bool hasShownWelcome = false;

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  final prefs = await SharedPreferences.getInstance();
  final bool isFirstTime = prefs.getBool('isFirstTime') ?? true;
  runApp(MyApp(isFirstTime: isFirstTime));
}

class MyApp extends StatefulWidget {
  final bool isFirstTime;
  const MyApp({super.key, required this.isFirstTime});
  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _checkSessionTimeout();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _checkSessionTimeout();
    } else if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive || state == AppLifecycleState.detached) {
      _saveLastActiveTime();
    }
  }

  Future<void> _checkSessionTimeout() async {
    final prefs = await SharedPreferences.getInstance();
    final int? lastActiveTime = prefs.getInt('lastActive');
    if (lastActiveTime != null) {
      final lastActive = DateTime.fromMillisecondsSinceEpoch(lastActiveTime);
      if (DateTime.now().difference(lastActive).inHours >= 5) {
        await FirebaseAuth.instance.signOut();
        hasShownWelcome = false;
      }
    }
    _saveLastActiveTime();
  }

  Future<void> _saveLastActiveTime() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('lastActive', DateTime.now().millisecondsSinceEpoch);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(brightness: Brightness.dark),
      home: AuthGate(isFirstTime: widget.isFirstTime),
    );
  }
}

class AuthGate extends StatelessWidget {
  final bool isFirstTime;
  const AuthGate({super.key, required this.isFirstTime});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(backgroundColor: Colors.black, body: Center(child: CircularProgressIndicator()));
        }
        if (snapshot.hasData) {
          if (!hasShownWelcome) {
            hasShownWelcome = true;
            return const WelcomeBackFlow();
          }
          return const Home();
        }
        return isFirstTime ? const IntroPage() : const Signin();
      },
    );
  }
}

class WelcomeBackFlow extends StatefulWidget {
  const WelcomeBackFlow({super.key});
  @override
  State<WelcomeBackFlow> createState() => _WelcomeBackFlowState();
}

class _WelcomeBackFlowState extends State<WelcomeBackFlow> with SingleTickerProviderStateMixin {
  bool _showWelcome = true;
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  static const List<Color> brandGradient = [Color(0xFF5A7AFF), Color(0xFFC778FD), Color(0xFFF2709C)];

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 2));
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(_controller);
    _controller.forward();
    Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _showWelcome = false);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_showWelcome) return const Home();

    // Fetch the real First Name instead of the email
    return FutureBuilder<String>(
        future: DatabaseService.getUserFirstName(),
        builder: (context, snapshot) {
          final String displayName = snapshot.data ?? "USER";
          return Scaffold(
            backgroundColor: Colors.black,
            body: FadeTransition(
              opacity: _fadeAnimation,
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _buildGradientText("Welcome Back", 60, isScript: true),
                    const SizedBox(height: 10),
                    _buildGradientText(displayName, 60, isBold: true),
                  ],
                ),
              ),
            ),
          );
        }
    );
  }

  Widget _buildGradientText(String text, double size, {bool isBold = false, bool isScript = false}) {
    return ShaderMask(
      blendMode: BlendMode.srcIn,
      shaderCallback: (bounds) => const LinearGradient(colors: brandGradient).createShader(bounds),
      child: Text(text, textAlign: TextAlign.center, style: TextStyle(fontSize: size, fontStyle: isScript ? FontStyle.italic : FontStyle.normal, fontWeight: isBold ? FontWeight.w900 : FontWeight.w200, letterSpacing: isBold ? -2.0 : 0, height: 0.9)),
    );
  }
}