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

`cold` has no `INTERNET` permission — proven on the 2026-10-16 release build: `aapt dump permissions` lists no `INTERNET` (45.2 MB `app-cold-release.apk`). `online` declares it for the future network crate. The GUI is still development-only with no wallet function: no release may be published until the Rust core, encrypted vault, signing tests, manifest test, reproducible-build procedure, and independent audit requirements are met.

## Network modes (planned, not implemented)

- **Offline (Cold):** no network code is compiled in. Nothing leaves the device.
- **Private (Online default):** all RPC traffic through embedded Tor; HTTPS only; fixed minimal headers; no device data; two-provider quorum. Hides your IP from RPC nodes and queries from the ISP.
- **Direct (Online opt-in, per session, red warning):** same minimal HTTPS + quorum rules without Tor, for places where Tor is blocked or too slow. Your IP is then visible to RPC nodes.

Honest limits: the blockchain itself is public; RPC nodes see the addresses you query; without Tor the ISP sees the server you contact; malware on the device defeats any wallet. Tor availability and bridge status will be re-checked against current Arti docs during implementation.

The existing Node.js terminal wallet remains the only implemented wallet in this repository and is unaudited; use only low-value testnet funds.
