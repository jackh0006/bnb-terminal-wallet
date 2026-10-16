#![forbid(unsafe_code)]

//! Pure wallet helpers for BNB Wallet v2: strict amount parsing and
//! EIP-55 address checks. No network, no secrets, no floats.
//!
//! Secret handling (mnemonics, keys, signing) belongs in a later,
//! audited signing module proven against `test/golden/*.json`.

use sha3::{Digest, Keccak256};
use thiserror::Error;

pub const ZERO_ADDRESS: &str = "0x0000000000000000000000000000000000000000";

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AmountError {
    #[error("amount is empty")]
    Empty,
    #[error("amount has invalid characters")]
    InvalidCharacters,
    #[error("amount has more decimals than the token allows")]
    OverPrecision,
    #[error("amount is negative")]
    Negative,
    #[error("amount overflows uint256")]
    Overflow,
}

// 2^256 - 1 as a decimal string for the overflow check.
const UINT256_MAX: &str =
    "115792089237316195423570985008687907853269984665640564039457584007913129639935";

#[derive(Debug, PartialEq, Eq)]
pub enum AddressClass {
    /// All-lowercase input: usable, but show the checksummed form and a
    /// 'no checksum protection' notice.
    Lowercase,
    /// Correct EIP-55 checksum.
    Checksummed,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AddressError {
    #[error("address is malformed")]
    Malformed,
    #[error("address checksum does not match")]
    BadChecksum,
    #[error("address must never be the zero address")]
    ZeroAddress,
}

/// Parse a decimal amount string into base units (as a decimal string).
/// Strict: ASCII digits and at most one dot, no signs, no spaces,
/// no float math. `decimals` is the token's decimal count (e.g. 18).
pub fn parse_amount(text: &str, decimals: u8) -> Result<String, AmountError> {
    if text.is_empty() {
        return Err(AmountError::Empty);
    }
    if text.starts_with('-') || text.starts_with('+') {
        return Err(AmountError::Negative);
    }
    if !text.bytes().all(|b| b.is_ascii_digit() || b == b'.') || text == "." {
        return Err(AmountError::InvalidCharacters);
    }
    if text.bytes().filter(|&b| b == b'.').count() > 1 {
        return Err(AmountError::InvalidCharacters);
    }
    let (whole, frac) = match text.find('.') {
        Some(i) => (&text[..i], &text[i + 1..]),
        None => (text, ""),
    };
    if frac.len() > decimals as usize {
        return Err(AmountError::OverPrecision);
    }
    // Pad the fraction to the token decimals, then strip leading zeros of
    // the combined integer. Pure string math: no precision loss possible.
    let mut base = String::with_capacity(whole.len() + decimals as usize);
    base.push_str(if whole.is_empty() { "0" } else { whole });
    base.push_str(frac);
    for _ in frac.len()..decimals as usize {
        base.push('0');
    }
    let trimmed = base.trim_start_matches('0');
    let normalized = if trimmed.is_empty() { "0" } else { trimmed };
    if normalized.len() > UINT256_MAX.len()
        || (normalized.len() == UINT256_MAX.len() && normalized > UINT256_MAX)
    {
        return Err(AmountError::Overflow);
    }
    Ok(normalized.to_string())
}

/// EIP-55 checksummed form of a 20-byte hex address (any case input).
pub fn checksum_address(input: &str) -> Result<String, AddressError> {
    let hex = strip_hex(input)?;
    let lower = hex.to_ascii_lowercase();
    let hash = Keccak256::digest(lower.as_bytes());
    let mut out = String::with_capacity(42);
    out.push_str("0x");
    for (i, c) in lower.chars().enumerate() {
        let nibble = if i % 2 == 0 {
            hash[i / 2] >> 4
        } else {
            hash[i / 2] & 0x0f
        };
        if c.is_ascii_alphabetic() && nibble >= 8 {
            out.push(c.to_ascii_uppercase());
        } else {
            out.push(c);
        }
    }
    Ok(out)
}

/// Classify user-supplied address text. Mixed case with a bad checksum is
/// rejected. All-lowercase (or all-uppercase) is accepted with a
/// `Lowercase` notice so the UI shows the checksummed form.
pub fn classify_address(input: &str) -> Result<AddressClass, AddressError> {
    let _hex = strip_hex(input)?;
    if input
        .strip_prefix("0x")
        .or_else(|| input.strip_prefix("0X"))
        .is_none()
    {
        return Err(AddressError::Malformed);
    }
    let body = &input[2..];
    if body
        .chars()
        .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
    {
        return Ok(AddressClass::Lowercase);
    }
    if body
        .chars()
        .all(|c| c.is_ascii_digit() || ('A'..='F').contains(&c))
    {
        return Ok(AddressClass::Lowercase);
    }
    let expected = checksum_address(input)?;
    if expected[2..] == *body {
        Ok(AddressClass::Checksummed)
    } else {
        Err(AddressError::BadChecksum)
    }
}

/// Reject the zero address as a recipient. Call before any send.
pub fn reject_zero_address(input: &str) -> Result<(), AddressError> {
    let hex = strip_hex(input)?.to_ascii_lowercase();
    if hex == ZERO_ADDRESS[2..] {
        return Err(AddressError::ZeroAddress);
    }
    Ok(())
}

/// Address-poisoning hint: true when a new recipient shares its first and
/// last 4 hex chars with a known address but is not identical.
pub fn shares_affixes(known: &str, candidate: &str) -> bool {
    let (Ok(a), Ok(b)) = (
        strip_hex(known).map(|s| s.to_ascii_lowercase()),
        strip_hex(candidate).map(|s| s.to_ascii_lowercase()),
    ) else {
        return false;
    };
    a.len() == 40 && b.len() == 40 && a != b && a[..4] == b[..4] && a[36..] == b[36..]
}

fn strip_hex(input: &str) -> Result<&str, AddressError> {
    let body = input
        .strip_prefix("0x")
        .or_else(|| input.strip_prefix("0X"))
        .ok_or(AddressError::Malformed)?;
    if body.len() != 40 || !body.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(AddressError::Malformed);
    }
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksums_the_public_test_vector() {
        assert_eq!(
            checksum_address("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266").unwrap(),
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
        );
        assert_eq!(
            classify_address("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266").unwrap(),
            AddressClass::Checksummed
        );
        assert_eq!(
            classify_address("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266").unwrap(),
            AddressClass::Lowercase
        );
        // One checksum letter flipped: reject.
        assert_eq!(
            classify_address("0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266").unwrap_err(),
            AddressError::BadChecksum
        );
    }

    #[test]
    fn refuses_zero_address_and_malformed_input() {
        assert_eq!(
            reject_zero_address("0x0000000000000000000000000000000000000000").unwrap_err(),
            AddressError::ZeroAddress
        );
        reject_zero_address("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266").unwrap();
        assert!(classify_address("not an address").is_err());
        assert!(classify_address("0x1234").is_err());
    }

    #[test]
    fn parses_amounts_strictly_without_floats() {
        assert_eq!(parse_amount("0.02", 18).unwrap(), "20000000000000000");
        assert_eq!(parse_amount("1", 18).unwrap(), "1000000000000000000");
        assert_eq!(parse_amount("0", 18).unwrap(), "0");
        assert_eq!(
            parse_amount("0.0000000000000000001", 18).unwrap_err(),
            AmountError::OverPrecision
        );
        assert_eq!(parse_amount("-1", 18).unwrap_err(), AmountError::Negative);
        assert_eq!(
            parse_amount("1 000", 18).unwrap_err(),
            AmountError::InvalidCharacters
        );
        assert_eq!(
            parse_amount(
                "115792089237316195423570985008687907853269984665640564039457584007913129639936",
                0
            )
            .unwrap_err(),
            AmountError::Overflow
        );
    }

    #[test]
    fn flags_lookalike_recipients() {
        assert!(shares_affixes(
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "0xf39F00001aad88F6F4ce6aB8827279cfffb92266"
        ));
        assert!(!shares_affixes(
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
        ));
        assert!(!shares_affixes(
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "0x92292be85cc55f9c3ac36212487dabbd4b63fd14"
        ));
    }
}
