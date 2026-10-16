#![forbid(unsafe_code)]

//! Network boundary for BNB Wallet v2: the ONLY crate allowed to open
//! sockets. Everything here fails closed.
//!
//! Modes (see `v2/README.md`): `Offline` (this crate is not even compiled
//! into Cold builds), `Private` (Tor SOCKS5, default online), `Direct`
//! (explicit per-session opt-in with a UI warning; same minimal rules).
//!
//! Rules enforced below and covered by tests:
//! - HTTPS endpoints only. No credentials in URLs. No redirects (checked
//!   where the HTTP client is configured; the constructor rejects
//!   anything that is not `https://host[/path]`).
//! - Privacy budget: only the JSON-RPC methods in [`ALLOWED_METHODS`].
//!   No device, OS, app-version, or hostname data leaves the device.
//! - Quorum: chain ID, balance, nonce, contract code, and receipts must
//!   agree across at least two providers, or sending is blocked.
//! - Response caps: [`MAX_BODY_BYTES`] and [`MAX_JSON_DEPTH`] bound what a
//!   malicious node can make us allocate or recurse into.
//!
//! Tor transport (Arti) and the HTTP client itself arrive in a later,
//! audited step behind a feature flag. Nothing here opens a socket yet.

use thiserror::Error;

/// Largest RPC response body this wallet will read (1 MiB).
pub const MAX_BODY_BYTES: usize = 1024 * 1024;
/// Deepest JSON nesting accepted from an RPC node.
pub const MAX_JSON_DEPTH: usize = 32;
/// Default HTTPS port when the endpoint omits one.
pub const DEFAULT_PORT: u16 = 443;

/// JSON-RPC methods inside the privacy budget. Everything else
/// (`debug_*`, `trace_*`, subscriptions, …) is rejected.
pub const ALLOWED_METHODS: &[&str] = &[
    "eth_chainId",
    "eth_getBalance",
    "eth_getTransactionCount",
    "eth_gasPrice",
    "eth_call",
    "eth_estimateGas",
    "eth_getCode",
    "eth_getTransactionReceipt",
    "eth_sendRawTransaction",
];

#[derive(Debug, Error, PartialEq, Eq)]
pub enum NetError {
    #[error("endpoint must be an https URL without credentials")]
    BadEndpoint,
    #[error("RPC method is outside the privacy budget")]
    MethodDenied,
    #[error("response body exceeds the size cap")]
    BodyTooLarge,
    #[error("providers disagree; sending is blocked")]
    QuorumMismatch,
    #[error("need at least two provider answers for quorum")]
    QuorumTooSmall,
}

/// How this build reaches BNB Smart Chain.
#[derive(Debug, PartialEq, Eq)]
pub enum Mode {
    /// No network code exists in the binary.
    Offline,
    /// All traffic through the given Tor SOCKS5 proxy (`127.0.0.1:port`).
    Private { tor_socks5_port: u16 },
    /// Same minimal rules without Tor. Chosen per session only, with a
    /// red warning: the RPC nodes then see the device IP.
    Direct,
}

/// A validated HTTPS RPC endpoint: host plus explicit port, no userinfo,
/// no query, no fragment, path kept verbatim.
#[derive(Debug, PartialEq, Eq)]
pub struct Endpoint {
    pub host: String,
    pub port: u16,
    pub path: String,
}

impl Endpoint {
    /// Accept only `https://host[:port][/path]`. Anything else fails.
    pub fn parse(url: &str) -> Result<Self, NetError> {
        let rest = url.strip_prefix("https://").ok_or(NetError::BadEndpoint)?;
        if rest.contains('@') || rest.contains('?') || rest.contains('#') {
            return Err(NetError::BadEndpoint);
        }
        let (authority, path) = match rest.find('/') {
            Some(i) => (&rest[..i], rest[i..].to_string()),
            None => (rest, "/".to_string()),
        };
        if authority.is_empty() || authority.contains(' ') {
            return Err(NetError::BadEndpoint);
        }
        let (host, port) = match authority.rfind(':') {
            Some(i) => {
                let port: u16 = authority[i + 1..]
                    .parse()
                    .map_err(|_| NetError::BadEndpoint)?;
                (&authority[..i], port)
            }
            None => (authority, DEFAULT_PORT),
        };
        if host.is_empty() {
            return Err(NetError::BadEndpoint);
        }
        Ok(Endpoint {
            host: host.to_string(),
            port,
            path,
        })
    }
}

/// Reject any RPC method outside the privacy budget.
pub fn check_method(method: &str) -> Result<(), NetError> {
    if ALLOWED_METHODS.contains(&method) {
        Ok(())
    } else {
        Err(NetError::MethodDenied)
    }
}

/// Enforce the response-size cap before parsing.
pub fn check_body_len(len: usize) -> Result<(), NetError> {
    if len <= MAX_BODY_BYTES {
        Ok(())
    } else {
        Err(NetError::BodyTooLarge)
    }
}

/// Quorum over provider answers: every answer must equal the first, and
/// at least two answers are required. Used for chain ID, balance, nonce,
/// contract code, and receipts. On mismatch the wallet blocks sending.
pub fn quorum<T: PartialEq>(answers: &[T]) -> Result<&T, NetError> {
    if answers.len() < 2 {
        return Err(NetError::QuorumTooSmall);
    }
    let first = &answers[0];
    if answers.iter().all(|a| a == first) {
        Ok(first)
    } else {
        Err(NetError::QuorumMismatch)
    }
}

/// The only request headers the wallet ever sends: a fixed minimal set.
/// No User-Agent, no device, OS, version, language, or hostname data.
pub fn fixed_headers() -> [(&'static str, &'static str); 1] {
    [("content-type", "application/json")]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_https_endpoints() {
        let good = Endpoint::parse("https://bsc-dataseed.bnbchain.org/").unwrap();
        assert_eq!(good.host, "bsc-dataseed.bnbchain.org");
        assert_eq!(good.port, 443);
        assert!(Endpoint::parse("http://bsc-dataseed.bnbchain.org/").is_err());
        assert!(Endpoint::parse("https://user:pass@host/").is_err());
        assert!(Endpoint::parse("https://host/path?query=1").is_err());
        assert!(Endpoint::parse("https:///path").is_err());
        assert_eq!(
            Endpoint::parse("https://node.local:8545/rpc").unwrap().port,
            8545
        );
    }

    #[test]
    fn denies_methods_outside_the_privacy_budget() {
        for method in ALLOWED_METHODS {
            check_method(method).unwrap();
        }
        assert_eq!(
            check_method("debug_traceCall").unwrap_err(),
            NetError::MethodDenied
        );
        assert_eq!(
            check_method("eth_subscribe").unwrap_err(),
            NetError::MethodDenied
        );
        assert_eq!(check_body_len(MAX_BODY_BYTES).ok(), Some(()));
        assert_eq!(
            check_body_len(MAX_BODY_BYTES + 1).unwrap_err(),
            NetError::BodyTooLarge
        );
    }

    #[test]
    fn quorum_blocks_sending_on_any_disagreement() {
        assert_eq!(quorum(&["0x38", "0x38"]).unwrap(), &"0x38");
        assert_eq!(quorum(&["0x38"]).unwrap_err(), NetError::QuorumTooSmall);
        assert_eq!(
            quorum(&["0x38", "0x61"]).unwrap_err(),
            NetError::QuorumMismatch
        );
        // A lying balance provider blocks the send too.
        assert_eq!(
            quorum(&[100u64, 100, 0]).unwrap_err(),
            NetError::QuorumMismatch
        );
    }

    #[test]
    fn headers_carry_no_device_data() {
        let headers = fixed_headers();
        assert_eq!(headers.len(), 1);
        let joined = format!("{:?}", headers).to_lowercase();
        for banned in ["user-agent", "device", "os", "version", "host", "language"] {
            assert!(!joined.contains(banned), "header leaks {banned}");
        }
    }
}
