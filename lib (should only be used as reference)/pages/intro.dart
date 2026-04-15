import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart'; // Added this
import 'signin.dart';
import 'package:firebase_auth/firebase_auth.dart';

class IntroPage extends StatefulWidget {
  const IntroPage({super.key});

  @override
  State<IntroPage> createState() => _IntroPageState();
}

class _IntroPageState extends State<IntroPage> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  final List<Color> brandGradient = [
    const Color(0xFF5A7AFF),
    const Color(0xFFC778FD),
    const Color(0xFFF2709C),
  ];

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  // --- UPDATED THIS FUNCTION TO BE ASYNC ---
  void _onNextPressed() async {
    if (_currentPage < 2) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    } else {
      // 1. Save the flag so they never see the Intro again
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('isFirstTime', false);

      // 2. Navigate to Signin (Replacement prevents going back to Intro)
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const Signin()),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView(
                controller: _pageController,
                onPageChanged: (int page) {
                  setState(() => _currentPage = page);
                },
                children: [
                  _buildIntroSlide(
                    imageName: '1.png',
                    titleWidget: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('EFFORTLESS\nATTENDANCE',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 38,
                                fontWeight: FontWeight.w900,
                                height: 1.1)),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.baseline,
                          textBaseline: TextBaseline.alphabetic,
                          children: [
                            const Text('WITH ',
                                style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 38,
                                    fontWeight: FontWeight.w900)),
                            _buildGradientText('RETINA', 45),
                          ],
                        ),
                      ],
                    ),
                    description: 'Track attendance using face recognition—no cards, no manual logs.',
                  ),
                  _buildIntroSlide(
                    imageName: '2.png',
                    titleWidget: const Text(
                      'FAST &\nCONTACTLESS\nCHECK-IN',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 38,
                        fontWeight: FontWeight.w900,
                        height: 1.1,
                      ),
                    ),
                    description: 'Just look at the camera and you\'re in. Save time and avoid queues.',
                  ),
                  _buildIntroSlide(
                    imageName: '3.png',
                    titleWidget: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text("LET'S GET YOU",
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 38,
                                fontWeight: FontWeight.w900,
                                height: 1.1)),
                        _buildGradientText('STARTED', 45),
                      ],
                    ),
                    description: 'Just look at the camera and you\'re in. Save time and avoid queues.',
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 30.0, vertical: 30),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(3, (index) => _buildIndicator(index)),
                  ),
                  const SizedBox(height: 30),
                  Container(
                    width: double.infinity,
                    height: 55,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(30),
                      gradient: LinearGradient(
                        colors: brandGradient,
                        begin: Alignment.centerLeft,
                        end: Alignment.centerRight,
                      ),
                    ),
                    child: ElevatedButton(
                      onPressed: _onNextPressed,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.transparent,
                        shadowColor: Colors.transparent,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
                      ),
                      child: Text(
                        _currentPage == 2 ? 'GET STARTED' : 'NEXT',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGradientText(String text, double size) {
    return ShaderMask(
      blendMode: BlendMode.srcIn,
      shaderCallback: (bounds) => LinearGradient(
        colors: brandGradient,
      ).createShader(Rect.fromLTWH(0, 0, bounds.width, bounds.height)),
      child: Text(text,
          style: TextStyle(fontSize: size, fontWeight: FontWeight.w900)),
    );
  }

  Widget _buildIntroSlide({required String imageName, required Widget titleWidget, required String description}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 5,
          child: Center(
            child: Image.asset(
              'image/$imageName',
              fit: BoxFit.contain,
              filterQuality: FilterQuality.high,
              width: MediaQuery.of(context).size.width * 0.9,
            ),
          ),
        ),
        Expanded(
          flex: 4,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 30.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                titleWidget,
                const SizedBox(height: 20),
                Text(
                  description,
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 16, height: 1.5),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildIndicator(int index) {
    bool isActive = _currentPage == index;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      margin: const EdgeInsets.symmetric(horizontal: 4),
      height: 8,
      width: isActive ? 24 : 8,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(4),
        gradient: isActive ? LinearGradient(colors: brandGradient) : null,
        color: isActive ? null : Colors.white24,
      ),
    );
  }
}