# Reproducible builds — BNB Wallet v2

Status: 🚧 baseline recorded, double-build comparison not yet run.

## Baselines (2026-10-16, `chore/account-hardening`)

| Artifact                                             | SHA-256                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `build/linux/x64/release/bundle/bnb_wallet_v2`       | `3477fafeec002c19b239af896701b63c3638ee1313727d5635bfc20a1b48ce30` |
| `build/linux/x64/release/bundle/lib/libapp.so`       | `891959520a10720ee45f99d76d59c6804dcb7b5e9c4f48075cbb80492197b12e` |
| `build/app/outputs/flutter-apk/app-cold-release.apk` | `17c98e10214c3b20ac11c39a5866c817d6c5c38a71c6d3990f87669e171a1d6a` |

Toolchains: rustc 1.98.1 (pinned in `v2/rust/rust-toolchain.toml`), Flutter 3.47.6 stable (revision 5fc346839b). Rust deps vendored via `Cargo.lock`; Flutter deps via `pubspec.lock`.

## Procedure (maintainer)

1. Fresh container with the pinned toolchains above.
2. `git checkout <tag-or-commit> && git status --short` (must be clean).
3. `cd v2/rust && cargo build --locked --release` (after FFI/CLI exist); `cd ../.. && cd v2 && flutter build linux && flutter build apk --flavor cold --release`.
4. `sha256sum` each artifact; compare with the table. Bit-identical: record PASS with dates. Different: record FAIL, diff the inputs (timestamps, paths, toolchain drift), and track the cause here — do not claim reproducible until two builds match.

## Known non-determinism sources (to eliminate)

- Flutter/Gradle embed absolute paths and timestamps unless pinned inside a container (pending: pinned build container with fixed `SOURCE_DATE_EPOCH`).
- APK signatures differ per signing key by design; compare unsigned bundles or document the key used.
