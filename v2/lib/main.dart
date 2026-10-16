import 'package:flutter/material.dart';

void main() => runApp(const BnbWalletApp());

class BnbWalletApp extends StatelessWidget {
  const BnbWalletApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'BNB Wallet',
    debugShowCheckedModeBanner: false,
    themeMode: ThemeMode.system,
    theme: _theme(Brightness.light),
    darkTheme: _theme(Brightness.dark),
    home: const WelcomePage(),
  );

  ThemeData _theme(Brightness brightness) => ThemeData(
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xfff0b90b),
      brightness: brightness,
    ),
    useMaterial3: true,
    scaffoldBackgroundColor: brightness == Brightness.dark
        ? const Color(0xff111111)
        : null,
  );
}

class WelcomePage extends StatelessWidget {
  const WelcomePage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const SizedBox(height: 36),
              Icon(
                Icons.shield_outlined,
                size: 64,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(height: 20),
              Text(
                'BNB Wallet',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.displaySmall,
              ),
              const SizedBox(height: 12),
              Text(
                'Offline-first wallet for BNB Smart Chain',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 36),
              const _StatusCard(),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: () => _developmentNotice(context),
                icon: const Icon(Icons.construction_outlined),
                label: const Text('View development status'),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => _safetyGuide(context),
                icon: const Icon(Icons.menu_book_outlined),
                label: const Text('Read the safety guide'),
              ),
              const SizedBox(height: 28),
              Text(
                'What this app never does',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              const _Promise(
                icon: Icons.person_off_outlined,
                text: 'No accounts, ads, analytics, or tracking.',
              ),
              const _Promise(
                icon: Icons.cloud_off_outlined,
                text:
                    'The Cold Android flavor declares no internet permission.',
              ),
              const _Promise(
                icon: Icons.warning_amber_outlined,
                text: 'It does not create, import, display, or transmit wallet secrets yet.',
              ),
            ],
          ),
        ),
      ),
    ),
  );

  void _developmentNotice(BuildContext context) => showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Not ready for funds'),
      content: const Text(
        'The graphical v2 app is under development. Its Rust cryptographic core, encrypted vault, QR signer, network layer, and independent audit are not complete. Do not enter a recovery phrase or send funds with this app.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('I understand'),
        ),
      ],
    ),
  );

  void _safetyGuide(BuildContext context) => showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Seven golden rules'),
      content: const SingleChildScrollView(
        child: Text(
          '1. Never share recovery words or private keys.\n\n2. Keep paper backups offline.\n\n3. Verify every address and network.\n\n4. Test with a tiny amount first.\n\n5. Use a hardware wallet for large amounts.\n\n6. Download only verified releases.\n\n7. If anything feels rushed or secret, stop.',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close'),
        ),
      ],
    ),
  );
}

class _StatusCard extends StatelessWidget {
  const _StatusCard();

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.info_outline,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(width: 10),
              Text(
                'Honest status',
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Text(
            'v2 GUI foundation only — not a usable wallet and not independently audited.',
          ),
        ],
      ),
    ),
  );
}

class _Promise extends StatelessWidget {
  const _Promise({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 7),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 21),
        const SizedBox(width: 12),
        Expanded(child: Text(text)),
      ],
    ),
  );
}
