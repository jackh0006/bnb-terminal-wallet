import 'package:bnb_wallet_v2/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('development build never offers wallet-secret entry', (
    tester,
  ) async {
    await tester.pumpWidget(const BnbWalletApp());

    expect(find.text('BNB Wallet'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.textContaining(
        'does not create, import, display, or transmit wallet secrets',
      ),
      200,
    );
    expect(
      find.textContaining(
        'does not create, import, display, or transmit wallet secrets',
      ),
      findsOneWidget,
    );
    expect(find.text('Create wallet'), findsNothing);
    expect(find.text('Import recovery phrase'), findsNothing);
  });

  testWidgets('development status warns that funds must not be used', (
    tester,
  ) async {
    await tester.pumpWidget(const BnbWalletApp());
    await tester.tap(find.text('View development status'));
    await tester.pumpAndSettle();

    expect(find.text('Not ready for funds'), findsOneWidget);
    expect(
      find.textContaining('Do not enter a recovery phrase'),
      findsOneWidget,
    );
  });
}
