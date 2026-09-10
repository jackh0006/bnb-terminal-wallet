# Changelog

All notable changes to this project are documented here.

## [1.0.1] — Repository quality and governance

- Added ESLint, Prettier, Husky pre-commit checks, and lint-staged safeguards.
- Added CodeQL, OpenSSF Scorecard, GitHub Actions dependency updates, and private-security reporting links.
- Added architecture, governance, maintainer, and support documentation.
- Improved installation and update documentation.

## [1.0.0] — Initial public release

- Non-custodial BNB Smart Chain terminal wallet with local ethers v6 signing.
- BNB and configured BEP-20 transfers, receive QR, public address inspection, custom token list, and RPC verification.
- Mainnet/testnet switching, encrypted local V3-keystore vault option, BscScan history support, and security/release documentation.

## Release policy

Versions follow semantic versioning: breaking changes increment the major version, compatible features increment minor, and fixes increment patch. Releases are created from signed-off `vX.Y.Z` Git tags only after CI and the manual security checklist pass.
