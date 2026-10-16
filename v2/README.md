# BNB Wallet v2

This is the Android and Linux GUI foundation for the offline-first rewrite. It is **not a wallet release**: it intentionally has no wallet creation, import, signing, vault, or network functionality. Do not enter a secret or send funds with it.

## Builds

```bash
flutter analyze
flutter test
flutter build linux
flutter build apk --flavor cold --debug
flutter build apk --flavor online --debug
```

`cold` has no `INTERNET` permission. `online` declares it for the future network crate. No release APK may be published until the Rust core, encrypted vault, signing tests, manifest test, reproducible-build procedure, and independent audit requirements are met.

The existing Node.js terminal wallet remains the only implemented wallet in this repository and is unaudited; use only low-value testnet funds.
