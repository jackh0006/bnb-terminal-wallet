# Security policy

## Reporting a vulnerability

Do not use a public issue. Send a private report to **jackh109867@gmail.com** or use the repository's private vulnerability-reporting feature. Include affected version, minimal safe reproduction, impact, and remediation ideas. Never include a mnemonic, private key, password, keystore, API key, or sensitive transaction data. Maintainers should acknowledge reports within 7 days and coordinate a fix before disclosure.

## Threat model and safeguards

The wallet is non-custodial: ethers generates/derives and signs locally. Secrets are hidden at prompts, held in process memory, never deliberately logged, and never placed in RPC/explorer requests. Public settings have owner-only file permissions where supported. Optional persisted wallets are encrypted standard Ethereum V3 keystores behind a user-provided password and are Git-ignored. The application uses ethers rather than custom cryptography, checks BSC chain IDs, requires HTTPS custom RPC URLs, checksum-validates addresses, blocks the zero address, simulates transfers, and checks asset and gas balances before confirmation.

This does **not** protect against a compromised host, keylogger, malicious dependency/update, screen recording, weak/reused vault password, a malicious RPC that lies about non-consensus data, phishing, clipboard replacement, physical access, or user error. A public blockchain is not private: RPCs can observe IP/public requests and transactions are permanent. Encryption at rest cannot protect a wallet unlocked on an infected machine.

## Operational guidance

Use a dedicated low-value wallet, verify transaction details independently, protect offline backups, and prefer a trusted/self-operated RPC. Never import a hardware-wallet recovery phrase into this app. Before real-fund use, commission an independent audit covering key lifecycle, keystore handling, dependency supply chain, terminal UI/confirmation behavior, RPC trust boundaries, and transaction construction.
