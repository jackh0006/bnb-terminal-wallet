# Final tests — maintainer checklist (BNB Wallet)

Run these yourself before any release tag. Any FAIL blocks the release. Record results in `docs/RELEASE-REPORT-v1.0.3.md` (v1) or a new `docs/RELEASE-REPORT-v2.md` (v2, when it exists).

## A. Clean-checkout gates

```bash
git clone https://github.com/jackh0006/bnb-terminal-wallet.git
cd bnb-terminal-wallet && git checkout <branch>
npm ci --ignore-scripts
npm run verify            # must be green (lint + format + check + tests)
npm audit --omit=dev --audit-level=high --ignore-scripts   # expect 0 vulnerabilities
cd v2/rust
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
cd ../../v2 2>/dev/null || cd v2
flutter analyze && flutter test
```

## B. v1 terminal on BNB testnet (chain 97, faucet coins only)

1. Fresh checkout, `npm start`, create wallet, write down phrase on paper.
2. Import the same wallet on a second profile from phrase; addresses match.
3. Encrypted V3 vault: save, restart, restore with password; wrong password fails.
4. Receive: show QR, compare with checksummed address character by character.
5. Testnet transfer (tiny): review screen shows full recipient, amount, fee; send; confirm 1 confirmation in-app and on the explorer.
6. Kill the process mid-save (settings change); restart: previous file intact (atomic-write check).
7. `git archive` the tag, `sha256sum -c` the published checksums file.

## C. v2 GUI (only when FFI + signing are wired; currently NOT ready)

1. Cold device (airplane mode): create wallet, backup quiz passes, address QR shown.
2. Online device: watch-only add, build unsigned tx, animated QR shown.
3. Cold scans, decodes every field itself, user confirms, signed QR shown.
4. Online verifies signature + fields against the unsigned tx, broadcasts via Tor, tracks confirmations.
5. `aapt dump permissions` on the Cold release APK lists no `INTERNET`.
6. Packet capture in Private mode: no clear-text DNS, no non-Tor destination.
7. Settings → Delete all data → confirm word → storage scan shows no vault, keys, Tor state, caches, or logs.

## D. Release-day re-verification

- Every ✅ in README re-checked today; comparison cells re-checked with sources and dates.
- `docs/CLAIMS.md` complete: each claim points at a test name, document, or procedure.
- Version lockstep: `package.json` == `package-lock.json` == tag (e.g. `v1.0.3`).
- Draft release created by CI only; publish by hand after this checklist is all PASS.
