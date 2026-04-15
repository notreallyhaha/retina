import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/database_service.dart';
import 'dart:async';
import 'face_register.dart';
import 'home.dart';

// ==========================================
// 1. SIGN IN PAGE
// ==========================================
class Signin extends StatefulWidget {
  const Signin({super.key});
  @override
  State<Signin> createState() => _SigninState();
}

class _SigninState extends State<Signin> {
  final _userController = TextEditingController();
  final _passController = TextEditingController();
  bool _isLoginPasswordVisible = false;
  bool _isLoading = false;

  static const List<Color> brandGradient = [Color(0xFF5A7AFF), Color(0xFFC778FD), Color(0xFFF2709C)];

  Future<void> _login() async {
    setState(() => _isLoading = true);
    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: _userController.text.trim(),
        password: _passController.text.trim(),
      );
      if (mounted) {
        Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (context) => const Home()), (route) => false);
      }
    } on FirebaseAuthException catch (e) {
      if (mounted) _showSnackBar(e.message ?? 'Login Failed', Colors.redAccent);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showSnackBar(String message, Color color) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message, style: const TextStyle(fontWeight: FontWeight.bold)), backgroundColor: color, behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15))));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 30.0),
          child: Column(
            children: [
              // --- THE FIX: Swapped Icon for Retina Logo ---
              Image.asset(
                'asset/images/retina_logo.png',
                height: 80,
                fit: BoxFit.contain,
                errorBuilder: (context, error, stackTrace) => const Icon(Icons.lock_person_outlined, size: 80, color: Color(0xFFC778FD)),
              ),
              const SizedBox(height: 20),
              const SizedBox(height: 10),
              const Text("Sign in to access your dashboard", style: TextStyle(color: Colors.white54, fontSize: 14)),
              const SizedBox(height: 50),

              Container(
                padding: const EdgeInsets.all(25),
                decoration: BoxDecoration(color: const Color(0xFF151515), borderRadius: BorderRadius.circular(30), border: Border.all(color: Colors.white.withAlpha(15)), boxShadow: [BoxShadow(color: Colors.black.withAlpha(100), blurRadius: 20, spreadRadius: 5)]),
                child: Column(
                  children: [
                    _buildTextField("Email Address", Icons.email_outlined, _userController),
                    const SizedBox(height: 20),
                    _buildPasswordField("Password", Icons.lock_outline, _passController, _isLoginPasswordVisible, () => setState(() => _isLoginPasswordVisible = !_isLoginPasswordVisible)),
                    const SizedBox(height: 30),
                    _isLoading
                        ? const CircularProgressIndicator(color: Color(0xFFC778FD))
                        : _buildGradientButton("LOGIN", _login),
                  ],
                ),
              ),
              const SizedBox(height: 40),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text("Don't have an account? ", style: TextStyle(color: Colors.white54)),
                  GestureDetector(
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (context) => const SignUpPage())),
                    child: const Text("Sign Up", style: TextStyle(color: Color(0xFFC778FD), fontWeight: FontWeight.bold, letterSpacing: 1.0)),
                  ),
                ],
              )
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTextField(String hint, IconData icon, TextEditingController controller) {
    return TextField(
      controller: controller, style: const TextStyle(color: Colors.white, fontSize: 14),
      decoration: InputDecoration(
        prefixIcon: Icon(icon, color: Colors.white54, size: 20), hintText: hint, hintStyle: const TextStyle(color: Colors.white30),
        filled: true, fillColor: Colors.black.withAlpha(50),
        contentPadding: const EdgeInsets.symmetric(vertical: 18),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide(color: Colors.white.withAlpha(10))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: const BorderSide(color: Color(0xFFC778FD), width: 2)),
      ),
    );
  }

  Widget _buildPasswordField(String hint, IconData icon, TextEditingController controller, bool isVisible, VoidCallback onToggle) {
    return TextField(
      controller: controller, obscureText: !isVisible, style: const TextStyle(color: Colors.white, fontSize: 14),
      decoration: InputDecoration(
        prefixIcon: Icon(icon, color: Colors.white54, size: 20), hintText: hint, hintStyle: const TextStyle(color: Colors.white30),
        suffixIcon: IconButton(icon: Icon(isVisible ? Icons.visibility : Icons.visibility_off, color: Colors.white54, size: 20), onPressed: onToggle),
        filled: true, fillColor: Colors.black.withAlpha(50), contentPadding: const EdgeInsets.symmetric(vertical: 18),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide(color: Colors.white.withAlpha(10))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: const BorderSide(color: Color(0xFFC778FD), width: 2)),
      ),
    );
  }

  Widget _buildGradientButton(String text, VoidCallback onPressed) {
    return Container(
      width: double.infinity, height: 55,
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: const LinearGradient(colors: brandGradient), boxShadow: [BoxShadow(color: const Color(0xFFC778FD).withAlpha(80), blurRadius: 15, offset: const Offset(0, 5))]),
      child: ElevatedButton(onPressed: onPressed, style: ElevatedButton.styleFrom(backgroundColor: Colors.transparent, shadowColor: Colors.transparent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))), child: Text(text, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16, letterSpacing: 2.0))),
    );
  }
}

// ==========================================
// 2. SIGN UP PAGE
// ==========================================
class SignUpPage extends StatefulWidget {
  const SignUpPage({super.key});
  @override
  State<SignUpPage> createState() => _SignUpPageState();
}

class _SignUpPageState extends State<SignUpPage> {
  final _fName = TextEditingController();
  final _lName = TextEditingController();
  final _email = TextEditingController();
  final _pass = TextEditingController();
  final _confirmPass = TextEditingController();
  bool _isLoading = false;

  Future<void> _createAccount() async {
    if (_pass.text != _confirmPass.text) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: const Text('Passwords do not match!'), backgroundColor: Colors.orange, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15))));
      return;
    }
    setState(() => _isLoading = true);
    try {
      await FirebaseAuth.instance.createUserWithEmailAndPassword(email: _email.text.trim(), password: _pass.text.trim());
      await DatabaseService.saveUserProfile(_fName.text.trim(), _lName.text.trim(), _email.text.trim());
      if (mounted) Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => WelcomePage(firstName: _fName.text.trim())));
    } on FirebaseAuthException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message ?? 'Error'), backgroundColor: Colors.redAccent));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      appBar: AppBar(backgroundColor: Colors.transparent, elevation: 0, leading: IconButton(icon: const Icon(Icons.arrow_back_ios, color: Colors.white), onPressed: () => Navigator.pop(context))),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(30, 10, 30, 40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("CREATE\nACCOUNT", style: TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w900, height: 1.1, letterSpacing: 2.0)),
            const SizedBox(height: 10),
            const Text("Join Retina to start tracking your attendance.", style: TextStyle(color: Colors.white54, fontSize: 14)),
            const SizedBox(height: 40),

            Container(
              padding: const EdgeInsets.all(25),
              decoration: BoxDecoration(color: const Color(0xFF151515), borderRadius: BorderRadius.circular(30), border: Border.all(color: Colors.white.withAlpha(15))),
              child: Column(
                children: [
                  _buildRegField("First Name", Icons.person_outline, _fName),
                  const SizedBox(height: 15),
                  _buildRegField("Last Name", Icons.person_outline, _lName),
                  const SizedBox(height: 15),
                  _buildRegField("Email Address", Icons.email_outlined, _email),
                  const SizedBox(height: 15),
                  _buildRegField("Password", Icons.lock_outline, _pass, obscure: true),
                  const SizedBox(height: 15),
                  _buildRegField("Confirm Password", Icons.lock_outline, _confirmPass, obscure: true),
                  const SizedBox(height: 30),
                  _isLoading
                      ? const CircularProgressIndicator(color: Color(0xFFC778FD))
                      : Container(
                    width: double.infinity, height: 55,
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: const LinearGradient(colors: [Color(0xFF5A7AFF), Color(0xFFC778FD), Color(0xFFF2709C)])),
                    child: ElevatedButton(onPressed: _createAccount, style: ElevatedButton.styleFrom(backgroundColor: Colors.transparent, shadowColor: Colors.transparent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))), child: const Text("SIGN UP", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16, letterSpacing: 2.0))),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRegField(String hint, IconData icon, TextEditingController controller, {bool obscure = false}) {
    return TextField(
      controller: controller, obscureText: obscure, style: const TextStyle(color: Colors.white, fontSize: 14),
      decoration: InputDecoration(
        prefixIcon: Icon(icon, color: Colors.white54, size: 20), hintText: hint, hintStyle: const TextStyle(color: Colors.white30),
        filled: true, fillColor: Colors.black.withAlpha(50), contentPadding: const EdgeInsets.symmetric(vertical: 18),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide(color: Colors.white.withAlpha(10))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: const BorderSide(color: Color(0xFFC778FD), width: 2)),
      ),
    );
  }
}

// ==========================================
// 3. WELCOME PAGE
// ==========================================
class WelcomePage extends StatefulWidget {
  final String firstName;
  const WelcomePage({super.key, required this.firstName});
  @override
  State<WelcomePage> createState() => _WelcomePageState();
}

class _WelcomePageState extends State<WelcomePage> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  static const List<Color> brandGradient = [Color(0xFF5A7AFF), Color(0xFFC778FD), Color(0xFFF2709C)];

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 3));
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(_controller);
    _controller.forward();
    Timer(const Duration(seconds: 4), () {
      if (mounted) Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const FaceRegistrationPage()));
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: FadeTransition(
        opacity: _fadeAnimation,
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _buildGradientText("Welcome", 90, isScript: true),
              const SizedBox(height: 10),
              _buildGradientText(widget.firstName.toUpperCase(), 80, isBold: true),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGradientText(String text, double size, {bool isBold = false, bool isScript = false}) {
    return ShaderMask(
      blendMode: BlendMode.srcIn, shaderCallback: (bounds) => const LinearGradient(colors: brandGradient, begin: Alignment.centerLeft, end: Alignment.centerRight).createShader(bounds),
      child: Text(text, textAlign: TextAlign.center, style: TextStyle(fontSize: size, fontStyle: isScript ? FontStyle.italic : FontStyle.normal, fontWeight: isBold ? FontWeight.w900 : FontWeight.w200, letterSpacing: isBold ? -2.0 : 0, height: 0.9)),
    );
  }
}