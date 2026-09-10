# Architecture and trust boundaries

The terminal UI, wallet lifecycle, validation, transaction preview, and error handling live in `src/index.js`. `ethers` is the only component deriving keys, encrypting V3 keystores, ABI-encoding BEP-20 transfers, estimating fees, and signing transactions.

## Data boundaries

| Data                                            | Location / recipient                                   | Safeguard                                                            |
| ----------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| Mnemonic, private key, keystore password        | Process memory; optional user-requested screen display | Never intentionally persisted, logged, or sent to RPC/explorer       |
| Optional encrypted vault                        | Local ignored file                                     | Ethers V3 encrypted keystore; owner-only permissions where supported |
| Public address, balances, transaction broadcast | Selected RPC                                           | HTTPS URL validation and selected-chain ID verification              |
| Transaction history                             | BscScan only when API key is configured                | Public address only; no signing secret included                      |

## Security invariants

- Do not introduce custom cryptography or non-ethers signing paths.
- Never add secrets, wallet files, API keys, or sensitive test fixtures to Git.
- A transfer requires a checksummed recipient, non-zero amount, selected-chain verification, balance/gas checks, preview, and final confirmation.
- A timeout after broadcast is ambiguous; users must inspect the explorer and nonce before retrying.

See [SECURITY.md](../SECURITY.md) for threats outside these controls.
