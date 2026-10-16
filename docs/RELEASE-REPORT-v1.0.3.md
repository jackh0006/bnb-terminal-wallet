# Release report: v1.0.3

Status: **not released**. This document records the code gate for the Node.js terminal wallet patch; it is not an independent audit.

## Included changes

- Atomic, owner-only local JSON writes for public settings and encrypted V3 vault data.
- Refusal of symlinked and oversized local JSON files.
- Local transaction hash calculation before RPC broadcast, with a mismatch check and an actionable uncertain-broadcast message.
- Package/tag version alignment for `v1.0.3`.

## Required gate

Run from a clean checkout with Node.js 20 or 22:

```bash
npm ci --ignore-scripts
npm run verify
npm run audit
```

If a container sets a user-level `allow-scripts` value, `npm run audit` may
fail with `EALLOWSCRIPTS` before checking advisories. In that case use the
equivalent advisory check directly: `npm audit --omit=dev --audit-level=high
--ignore-scripts` (0 vulnerabilities on 2026-10-16).

Also manually create/import a low-value testnet wallet, save and restore an encrypted V3 vault, send a testnet transaction, and verify the release archive checksum.

## Known limitations

This remains an unaudited Node.js CLI. JavaScript cannot guarantee memory erasure. It has no cold/offline signer, Tor routing, hardware-wallet support, reproducible-build proof, or independent audit. Do not use it for large sums. The Rust/Flutter offline-first design in the build pack is a future major-version project, not a claim made by this release.
