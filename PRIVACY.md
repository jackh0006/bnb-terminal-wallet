# SPDX-License-Identifier: MIT

# BNB Terminal Wallet — Privacy Policy

Keys stay on your machine. This document says exactly what leaves it.

## What stays local (never uploaded)

- Private keys, recovery phrases, keystore passwords, vault passwords.
  They are typed into hidden prompts and live only in process memory,
  an owner-only local vault file (`.bnb-terminal-wallet-vault.json`),
  or an opt-in encrypted V3 keystore you explicitly save.
- Preferences and address labels (`.bnb-terminal-wallet.json`).

## What leaves the device (public chain data only)

- **RPC endpoint** (`BNB_RPC_URL` or default): receives your IP, the
  addresses you query, balances/nonces requested, and signed transactions
  you choose to broadcast. It never receives keys or passwords. Use HTTPS
  RPCs only; a malicious RPC can lie about balances or censor broadcasts.
- **BscScan API** (only if you set `BSCSCAN_API_KEY`): receives the address
  whose public history you request, plus your API key. No key material.

## Permissions and files

- No analytics, no telemetry, no ads, no auto-update pings.
- `.env` is Git-ignored; never commit it. `tokens.json` is a public token
  allowlist, not secrets.

## Backups and deletion

- Back up recovery phrases on paper, offline, before funding an address.
- Delete the vault file to remove local secrets; there is no remote copy,
  so no remote wipe exists. Chain history is public forever.

Contact for privacy questions: see `SECURITY.md`.
