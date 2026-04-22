import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/database_service.dart';
import '../main.dart'; // To access MyApp or push replacement

class Menu extends StatelessWidget {
  const Menu({super.key});

  final List<Color> brandGradient = const [Color(0xFF5A7AFF), Color(0xFFC778FD), Color(0xFFF2709C)];

  void _logout(BuildContext context) async {
    await FirebaseAuth.instance.signOut();
    // Clear the stack and push back to main initialization
    if (context.mounted) {
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (context) => const MyApp(isFirstTime: false)),
            (route) => false,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    final email = user?.email ?? "No Email Linked";

    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      body: SafeArea(
        child: FutureBuilder<String>(
            future: DatabaseService.getUserFirstName(),
            builder: (context, snapshot) {
              final String name = snapshot.data ?? "Loading...";

              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 25.0, vertical: 20.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text("PROFILE", style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
                    const SizedBox(height: 30),

                    // Profile Card
                    Container(
                      padding: const EdgeInsets.all(25),
                      decoration: BoxDecoration(color: const Color(0xFF151515), borderRadius: BorderRadius.circular(30), border: Border.all(color: Colors.white.withAlpha(10))),
                      child: Row(
                        children: [
                          Container(
                            height: 70, width: 70,
                            decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: brandGradient)),
                            child: const Icon(Icons.person, color: Colors.white, size: 35),
                          ),
                          const SizedBox(width: 20),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(name, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                                const SizedBox(height: 5),
                                Text(email, style: const TextStyle(color: Colors.white54, fontSize: 12), overflow: TextOverflow.ellipsis),
                              ],
                            ),
                          )
                        ],
                      ),
                    ),

                    const SizedBox(height: 40),
                    const Text("SETTINGS", style: TextStyle(color: Color(0xFFC778FD), fontWeight: FontWeight.w900, fontSize: 11, letterSpacing: 2)),
                    const SizedBox(height: 15),

                    _buildMenuOption(Icons.security, "Security & Privacy"),
                    _buildMenuOption(Icons.notifications_none, "Notifications"),
                    _buildMenuOption(Icons.help_outline, "Help & Support"),

                    const Spacer(),

                    // Logout Button
                    GestureDetector(
                      onTap: () => _logout(context),
                      child: Container(
                        width: double.infinity, height: 55,
                        decoration: BoxDecoration(color: Colors.redAccent.withAlpha(30), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.redAccent.withAlpha(50))),
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.logout, color: Colors.redAccent, size: 20),
                            SizedBox(width: 10),
                            Text("LOG OUT", style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 80),
                  ],
                ),
              );
            }
        ),
      ),
    );
  }

  Widget _buildMenuOption(IconData icon, String title) {
    return Container(
      margin: const EdgeInsets.only(bottom: 15), padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
      decoration: BoxDecoration(color: const Color(0xFF151515), borderRadius: BorderRadius.circular(20)),
      child: Row(
        children: [
          Icon(icon, color: Colors.white54, size: 20),
          const SizedBox(width: 15),
          Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          const Spacer(),
          const Icon(Icons.arrow_forward_ios, color: Colors.white24, size: 14),
        ],
      ),
    );
  }
}