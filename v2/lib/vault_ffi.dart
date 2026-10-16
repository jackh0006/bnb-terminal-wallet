import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';

/// C-ABI bindings to the Rust vault boundary (`bnb-wallet-ffi`).
///
/// The contract, enforced by tests on both sides:
/// - Dart receives only `int` handles and integer status codes.
/// - Secrets (passwords, vault bytes) cross as call-scoped buffers that
///   are zeroed immediately after the call, and are never stored,
///   logged, or displayed by Dart.
/// - Negative returns are errors: -1 bad pointer, -2 wrong password or
///   unreadable vault, -3 unknown handle, -4 file read failure.
class VaultFfi {
  VaultFfi._(this._lib);

  final DynamicLibrary _lib;
  late final _open = _lib
      .lookupFunction<
        Int64 Function(Pointer<Uint8>, IntPtr, Pointer<Uint8>, IntPtr),
        int Function(Pointer<Uint8>, int, Pointer<Uint8>, int)
      >('bnb_vault_open');
  late final _close = _lib
      .lookupFunction<Int32 Function(Int64), int Function(int)>(
        'bnb_vault_close',
      );
  late final _isOpen = _lib
      .lookupFunction<Int32 Function(Int64), int Function(int)>(
        'bnb_vault_is_open',
      );

  /// Loads `rust/target/release/libbnb_wallet_ffi.so` (Linux taste builds).
  /// Throws [UnsupportedError] on other platforms until they are packaged.
  factory VaultFfi.load() {
    if (!Platform.isLinux) {
      throw UnsupportedError('VaultFfi is packaged for Linux only so far');
    }
    const soPath = 'rust/target/release/libbnb_wallet_ffi.so';
    if (!File(soPath).existsSync()) {
      throw StateError(
        'Missing $soPath: build it with '
        '`cargo build -p bnb-wallet-ffi --release` inside v2/rust.',
      );
    }
    return VaultFfi._(DynamicLibrary.open(soPath));
  }

  int open(List<int> password, String path) {
    final pw = _SecretBuf.fromList(password);
    final file = _SecretBuf.fromList(path.codeUnits);
    try {
      return _open(pw.pointer, pw.length, file.pointer, file.length);
    } finally {
      pw.dispose();
      file.dispose();
    }
  }

  int close(int handle) => _close(handle);
  bool isOpen(int handle) => _isOpen(handle) == 1;
}

/// Call-scoped native buffer that zeroes itself on dispose.
class _SecretBuf {
  _SecretBuf(this.pointer, this.length);

  final Pointer<Uint8> pointer;
  final int length;

  factory _SecretBuf.fromList(List<int> bytes) {
    final pointer = calloc<Uint8>(bytes.length);
    pointer.asTypedList(bytes.length).setAll(0, bytes);
    return _SecretBuf(pointer, bytes.length);
  }

  void dispose() {
    for (var i = 0; i < length; i++) {
      pointer[i] = 0;
    }
    calloc.free(pointer);
  }
}
