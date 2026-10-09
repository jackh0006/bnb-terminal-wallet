# SPDX-License-Identifier: MIT

# AGENTS.md — AI contributor guide for bnb-terminal-wallet

Real money is at stake. Be conservative, be honest, never improvise.

## Hard rules

1. **Keys never leave the device.** Signing stays in `ethers` locally.
   The only network calls allowed are: public RPC reads + signed broadcasts
   (`src/index.js` RPC layer) and opt-in BscScan history (address + API key
   only). Never add analytics, telemetry, auto-update, or any new exfil path.
2. **No custom crypto.** `ethers v6` only for derivation, encryption (V3
   keystore), ABI encoding, and signing. Never invent KDFs or protocols.
3. **Hidden prompts only** for keys/phrases/passwords (`mask: '*'`).
   Never `console.log` secrets; tests use only the public Hardhat/Anvil
   vectors (`test test ... junk`, `0xac09...`).
4. **Fail closed.** Uncertain RPC results are never auto-rebroadcast;
   checksum/zero-address/balance checks stay mandatory.
5. **No hype.** Never `unhackable / CIA-grade / zero bugs / guaranteed
profit`. The README security notice (unaudited, no large sums) stays.
6. **Version lockstep.** `package.json` == `package-lock.json` version;
   releases cut only by tag via `.github/workflows/release.yml` with the
   canonical asset names. Never hand-edit tags or rewrite releases.

## Workflow

- `npm run verify` (lint + format + check + tests) must stay green; add a
  test with every behavior change.
- End every answer with: files changed, how to run the tests, open risks.
  If you cannot follow a rule, stop and ask the human.
