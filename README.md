# BNB Terminal Wallet

[![Node 20+](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js)](https://nodejs.org/) [![ethers v6](https://img.shields.io/badge/ethers-v6-2535a0)](https://docs.ethers.org/v6/) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A local, non-custodial terminal wallet for BNB Smart Chain. It creates or imports standard EVM wallets, displays BNB and configured BEP-20 assets, and signs BNB/BEP-20 transfers locally.

> **Security notice:** this is unaudited open-source software. Do not use it for large sums. A professional independent security audit is recommended before relying on it with real funds or any production/custodial workflow.

Screenshots/GIF placeholder: add a redacted terminal capture at `docs/screenshot-placeholder.png` before publishing; do not include real addresses or transaction data.

## Features

- BIP-39 wallet creation and BIP-44 (`m/44'/60'/0'/0/0`) import through ethers v6
- Private key, phrase, standard Ethereum V3 keystore, and optional encrypted-local-vault restore
- Standard V3 encrypted keystore persistence is opt-in, password protected, and kept in an owner-only local file; public profiles never include secrets
- Mainnet (56) and testnet (97) switching, with chain-ID checks before use
- BNB, USDT, BUSD, USDC, and an address-based configurable token list in `tokens.json`
- Balance display, receive QR code, address inspection, BscScan activity lookup, gas-speed choices, transfer simulation, review, and confirmation tracking
- Recipient checksum validation, zero-address rejection, balance/gas checks, and no automatic rebroadcast after an uncertain RPC result

Hardware-wallet support is not currently implemented. Do not enter a hardware-wallet recovery phrase into this application; use the device's official software until an explicit signer integration is audited.

## Architecture

`src/index.js` owns terminal interaction, validation, local signing, and RPC access. `ethers` performs all wallet derivation, encryption, ABI encoding, fee estimation, and signing. `tokens.json` is the reviewed built-in token allowlist. `.bnb-terminal-wallet.json` stores only public preferences/profiles; `.bnb-terminal-wallet-vault.json` is optional encrypted keystore data and is ignored by Git.

The RPC receives public reads and signed transaction broadcasts, never mnemonics, private keys, or vault passwords. BscScan is queried only when you opt in by supplying `BSCSCAN_API_KEY` for history.

## Quick Start

### One-command install

Linux/macOS/WSL with Node.js 20+:

```bash
git clone https://github.com/jackh0006/bnb-terminal-wallet.git && cd bnb-terminal-wallet && bash install.sh && npm start
```

`install.sh` checks the Node.js version, installs locked dependencies, and creates a private local `.env` from `.env.example` when needed. It never creates, imports, or uploads a wallet.

### Manual install

```bash
git clone https://github.com/jackh0006/bnb-terminal-wallet.git
cd bnb-terminal-wallet
npm ci
cp .env.example .env
npm start
```

`npm run dev` is an alias for `npm start`. Fill in only optional values in `.env`; it is ignored by Git. `BSCSCAN_API_KEY` enables history. `BNB_RPC_URL` chooses a session RPC. Custom RPCs must use HTTPS and report the selected BSC chain ID.

### Updating

```bash
git pull --ff-only
npm ci
npm start
```

## Safe operation

Verify recipient and token contract independently. Transfers are irreversible. Keep BNB for gas, including when sending a token. Use testnet and a low-value wallet before any real transfer. A timeout after broadcast may mean the transaction reached the network—check the explorer and account nonce before retrying.

Never place a real phrase, private key, password, keystore, or API credential in an issue, test fixture, shell history, or repository. Tests use only public deterministic development-account values.

## Development and releases

```bash
npm run verify
npm run audit
```

CI runs syntax checking and unit tests on Node 20 and 22. Dependabot checks npm dependencies weekly. Pushing a version tag such as `v1.0.0` creates a GitHub Release with generated notes after verification passes.

Before release: review `git diff`, run verification/audit, test create/import/balances and a testnet transfer manually, confirm no secret files are staged, and validate configured token addresses against authoritative sources. See [CHANGELOG.md](CHANGELOG.md) for version notes.

## Known limitations

This is a Node.js CLI, not the requested React/Vite graphical dashboard; migration should be a separately reviewed change so existing terminal workflows remain intact. Transaction history covers normal transactions only and needs a BscScan API key. No hardware signer, automated Playwright flow, or professional audit is included. Public RPC providers can link requests to IP addresses and public account activity.

See [SECURITY.md](SECURITY.md) for the threat model and disclosure process, and [CONTRIBUTING.md](CONTRIBUTING.md) to contribute.

## Credits

Author: Jack Hudson

GitHub: https://github.com/jackh0006

Email: jackh109867@gmail.com

Repo: https://github.com/jackh0006/bnb-terminal-wallet

## Donate and Support

If this project saves you time please consider supporting its development. All donations go toward server costs and keeping this project free and open source.

Bitcoin: bc1q8t0fn2yrsy4lh3m0pz34uj27t8vxjeavkjym83

DOGE: D6ZdMQ7mHGGmuH9prpZ2zjpnG5Q3WVRDtC

Ethereum: 0xdad428900a4359be8f76b3062df34211582e09eb

USDT (ERC20): 0xdad428900a4359be8f76b3062df34211582e09eb

TRX: TMpb6RNTuGNM1eTakm9kjds1mRTPYYJesf

USDT (TRC20): TMpb6RNTuGNM1eTakm9kjds1mRTPYYJesf

BNB: 0xdad428900a4359be8f76b3062df34211582e09eb

USDT (BEP20): 0xdad428900a4359be8f76b3062df34211582e09eb

SOL: BDCCrRez1yD1RpkAtiqKKDk3BfxPD8P7nkL26jCYrzgL

USDT (SPL): BDCCrRez1yD1RpkAtiqKKDk3BfxPD8P7nkL26jCYrzgL

USDC (SPL): BDCCrRez1yD1RpkAtiqKKDk3BfxPD8P7nkL26jCYrzgL

XRP: rNUAhaATFLvosdu9m9M95bupRBtZ8eqpj9

TON: UQCu6-3yGyQ5dzvcCxr2gobuvx5ddbS9EC690qtey92P5_wX

LTC: ltc1q2gs89cfy3mumr7gu9w0zl9rllf80q67m5rmma8
