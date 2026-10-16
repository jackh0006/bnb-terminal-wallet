# Audit package — BNB Wallet

Author/maintainer: jackh0006 <jackh109867@gmail.com>. Branch under review: `chore/account-hardening`. Status: **unaudited development foundation — not a wallet release**.

## Scope for the auditor

1. Vault format (`v2/rust/crates/vault/src/lib.rs`): Argon2id parameters and floor/ceiling checks, XChaCha20-Poly1305 envelope, header AAD, atomic owner-only writes, zeroization and auto-lock API.
2. Key lifecycle and signing (`v2/rust/crates/wallet/`): BIP-39 parsing, BIP-44 derivation `m/44'/60'/0'/0/n`, EIP-55 handling, strict amount parsing, legacy EIP-155 signing, zero-address and lookalike-recipient guards.
3. v1 terminal wallet (`src/index.js`, `src/storage.js`): local signing, RPC layer, uncertain-broadcast handling, encrypted V3 vault option.
4. Android manifests and flavors (`v2/android/`): Cold must carry no `INTERNET` permission; Online declares it.
5. Build and release pipeline (`.github/workflows/`, `docs/RELEASE-REPORT-v1.0.3.md`): tag/version gate, canonical assets, checksums.
6. Explicitly out of scope (not built yet): FFI bridge, full GUI wiring, QR air-gap flow, `net`/Tor crate, Flatpak/AppImage packaging, fuzz corpus, CI provenance. These are listed as 🚧 and must not be audited as if present.

## Threat model (summary)

Defends against: file theft (encrypted at rest), network observers (Tor private mode, planned), RPC dishonesty (chain-ID checks, quorum planned, hash comparison), address mistakes (checksum, zero-address, lookalike warnings), uncertain broadcasts (no auto-rebroadcast). Does NOT defend against: device malware, coercion, fake app copies, lost phrases, blockchain publicity. See `SECURITY.md` and `PRIVACY.md`.

## Build instructions

```bash
git clone https://github.com/jackh0006/bnb-terminal-wallet.git
cd bnb-terminal-wallet && git checkout chore/account-hardening
npm ci --ignore-scripts && npm run verify
npm audit --omit=dev --audit-level=high --ignore-scripts
cd v2/rust && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
cd ../.. && cd v2 && flutter analyze && flutter test && flutter build linux
```

## Test vectors

- `test/golden/derivations.json`: 200 accounts from the public dev phrase `test test ... junk`, path `m/44'/60'/0'/0/0..199`.
- `test/golden/transactions.json`: 50 legacy type-0 signed transactions (chains 56/97) from the public dev key `0xac09...`. v2 standardizes on legacy type-0; ethers v6 defaults to type-1 for identical fields (documented deviation, not a defect).
- Rust oracle tests re-derive all 250 vectors at test time. No live phrases, keys, passwords, RPC keys, or funds anywhere in fixtures.

## Known issues (do not re-report these)

- Unaudited; no fuzzing run yet; no reproducible-build proof; no hardware signer.
- JavaScript cannot reliably erase secrets from memory (v1 limitation).
- Cold release APK not yet verified to carry no `INTERNET` (debug builds always add it; release check pending).
- `npm run audit` fails under user-level `allow-scripts` npm configs with `EALLOWSCRIPTS`; the direct advisory command passes with 0 vulnerabilities.

## Contact

Private vulnerability reporting via GitHub Security Advisories or jackh109867@gmail.com. Never include phrases, keys, passwords, or keystores. Safe harbor for good-faith research; no bounty amounts promised.
