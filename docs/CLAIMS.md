# Claims and evidence — BNB Wallet

A claim without evidence must be removed. Marks: ✅ proven · 🚧 planned · ❌ not available. Checked 2026-10-16.

| Claim                                                       | Status                   | Evidence                                                                                       |
| ----------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| Keys never leave the device (v1)                            | ✅                       | `src/index.js` RPC layer sends reads + signed txs only; `test/standards.test.js` signs locally |
| No account, email, or KYC                                   | ✅                       | No signup code exists; `PRIVACY.md`                                                            |
| No telemetry, ads, analytics                                | ✅                       | `test/privacy-budget.test.js`; dependency list has no analytics SDKs                           |
| Encrypted at rest (Argon2id + XChaCha20-Poly1305, v2 vault) | ✅ code, 🚧 integration  | `cargo test -p bnb-wallet-vault` (round-trip, tamper, bounds)                                  |
| Cold build has no internet permission                       | 🚧 release check pending | `test/manifest.test.js` parses manifests; `aapt` check on Cold release APK still pending       |
| Tor private mode hides IP from RPC nodes                    | 🚧 not implemented       | `v2/README.md` network plan; no `net` crate yet                                                |
| Reproducible builds                                         | 🚧                       | No double-build comparison recorded                                                            |
| Independently audited                                       | ❌                       | No report linked; see `docs/AUDIT-PACKAGE.md` for scope when ready                             |
| Hardware wallet is stronger for large amounts               | ✅ (standing guidance)   | README comparison table; `SECURITY.md`                                                         |
