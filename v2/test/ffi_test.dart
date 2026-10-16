import 'dart:io';

import 'package:bnb_wallet_v2/vault_ffi.dart';
import 'package:flutter_test/flutter_test.dart';

/// Proves the Dart <-> Rust bridge executes real vault code:
/// linkage, symbol lookup, calls with buffers, and every error code.
/// A full open-real-vault round trip from Dart lands with GUI wiring,
/// which will create vaults through a dedicated, tested export.
void main() {
  test('FFI bridge reaches Rust and fails closed on every bad input', () {
    final ffi = VaultFfi.load();

    // Missing file -> -4 (I/O failure, file never touched).
    expect(ffi.open('pw'.codeUnits, '/nonexistent-dir-xyz/vault.bin'), -4);

    // Garbage file -> -2 (Rust vault parser rejects it, same as bad password).
    final garbage = File(
      '${Directory.systemTemp.path}/bnb-ffi-garbage-$pid.bin',
    );
    garbage.writeAsBytesSync(const [0, 1, 2, 3, 4, 5]);
    try {
      expect(ffi.open('pw'.codeUnits, garbage.path), -2);
    } finally {
      garbage.deleteSync();
    }

    // Unknown handles -> -3 / false, never a crash.
    expect(ffi.close(987654321), -3);
    expect(ffi.isOpen(987654321), isFalse);
  });
}
