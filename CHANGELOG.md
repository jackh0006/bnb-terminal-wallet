# Changelog

All notable changes to this project are documented here.

## [1.0.3] — Safer local persistence and broadcast recovery

- Replaced direct settings and vault writes with atomic, owner-only replacements; an interrupted save no longer truncates the previous file.
- Refuse symbolic-link and oversized local JSON files before parsing them.
- Fix a transaction nonce before signing, compute its hash locally, and display that hash when broadcast status is uncertain. The RPC-returned hash must match.
- Corrected package metadata to match the next release tag.

## [1.0.1] — Repository quality and governance

- Added ESLint, Prettier, Husky pre-commit checks, and lint-staged safeguards.
- Added CodeQL, OpenSSF Scorecard, GitHub Actions dependency updates, and private-security reporting links.
- Added architecture, governance, maintainer, and support documentation.
- Improved installation and update documentation.

## [1.0.0] — Initial public release

- Non-custodial BNB Smart Chain wallet with local ethers v6 signing.
- BNB and configured BEP-20 transfers, receive QR, public address inspection, custom token list, and RPC verification.
- Mainnet/testnet switching, encrypted local V3-keystore vault option, BscScan history support, and security/release documentation.

## Release policy

Versions follow semantic versioning: breaking changes increment the major version, compatible features increment minor, and fixes increment patch. Releases are created from signed-off `vX.Y.Z` Git tags only after CI and the manual security checklist pass.
