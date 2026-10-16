//! Secret-key derivation and legacy transaction signing for BNB Wallet v2.
//!
//! Standards only: BIP-39 seed, BIP-32/BIP-44 path `m/44'/60'/0'/0/n`,
//! secp256k1 ECDSA with RFC 6979 nonces (via `k256`), Keccak-256 hashing,
//! RLP encoding, EIP-155 replay protection. Proven byte-for-byte against
//! `test/golden/*.json` (public dev vectors only).
//!
//! Secrets stay in [`DerivedSecret`], which zeroizes on drop and has no
//! `Clone`. Wrong passphrases yield different keys; nothing here touches
//! the network.

use bip32::{DerivationPath, XPrv};
use bip39::Mnemonic;
use sha3::{Digest, Keccak256};
use std::str::FromStr;
use thiserror::Error;
use zeroize::Zeroize;

use crate::{AddressError, checksum_address};

#[derive(Debug, Error, PartialEq, Eq)]
pub enum SignError {
    #[error("recovery phrase is invalid")]
    BadPhrase,
    #[error("derivation path is unsupported")]
    BadPath,
    #[error("address is malformed")]
    BadAddress(#[from] AddressError),
    #[error("value is not a valid uint")]
    BadValue,
    #[error("signing failed")]
    Signing,
}

/// A derived secp256k1 secret. Zeroized on drop, never cloned or logged.
pub struct DerivedSecret([u8; 32]);

/// A legacy (type-0) transaction to sign. All integer fields arrive as
/// decimal strings so no precision is lost before RLP encoding.
pub struct LegacyTx<'a> {
    pub chain_id: u64,
    pub nonce: u64,
    pub gas_price: &'a str,
    pub gas_limit: u64,
    /// 20-byte hex address (`0x`-prefixed).
    pub to: &'a str,
    /// Decimal uint256 string.
    pub value: &'a str,
    /// Raw calldata bytes (empty for plain BNB transfers).
    pub data: &'a [u8],
}

impl Drop for DerivedSecret {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

impl DerivedSecret {
    /// Derive account `index` of `m/44'/60'/0'/0/index` from a BIP-39 phrase.
    /// `passphrase` is the optional BIP-39 passphrase: losing it loses funds.
    pub fn derive(mnemonic: &str, passphrase: &str, index: u32) -> Result<Self, SignError> {
        let parsed = Mnemonic::parse(mnemonic).map_err(|_| SignError::BadPhrase)?;
        let seed = parsed.to_seed(passphrase);
        let path = DerivationPath::from_str(&format!("m/44'/60'/0'/0/{index}"))
            .map_err(|_| SignError::BadPath)?;
        let child = XPrv::derive_from_path(&seed, &path).map_err(|_| SignError::BadPath)?;
        Ok(Self(child.private_key().to_bytes().into()))
    }

    /// Raw secret bytes, for the signing call only. Never log or transmit.
    fn bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// EIP-55 address of this secret.
    pub fn address(&self) -> Result<String, SignError> {
        let signing = signing_key(self.bytes())?;
        let point = signing.verifying_key().to_sec1_point(false);
        let hash = Keccak256::digest(&point.as_bytes()[1..]);
        let lower = format!("0x{}", hex_of(&hash[12..]));
        checksum_address(&lower).map_err(SignError::BadAddress)
    }

    /// Sign a legacy transaction and return the RLP-encoded signed bytes.
    pub fn sign_legacy(&self, tx: &LegacyTx) -> Result<Vec<u8>, SignError> {
        let to_bytes = hex_to_20(tx.to)?;
        let signing = signing_key(self.bytes())?;
        let unsigned = rlp_list(&[
            &uint_rlp(tx.nonce as u128),
            &uint_rlp(dec_str(tx.gas_price)?),
            &uint_rlp(tx.gas_limit as u128),
            &to_bytes,
            &uint_rlp(dec_str(tx.value)?),
            tx.data,
            &uint_rlp(tx.chain_id as u128),
            &[],
            &[],
        ]);
        let hash = Keccak256::digest(&unsigned);
        let (sig, rec) = signing.sign_prehash_recoverable(&hash);
        let v = rec.is_y_odd() as u64 + tx.chain_id * 2 + 35;
        let raw = sig.to_bytes();
        Ok(rlp_list(&[
            &uint_rlp(tx.nonce as u128),
            &uint_rlp(dec_str(tx.gas_price)?),
            &uint_rlp(tx.gas_limit as u128),
            &to_bytes,
            &uint_rlp(dec_str(tx.value)?),
            tx.data,
            &uint_rlp(v as u128),
            &trim_zeros(&raw[..32]),
            &trim_zeros(&raw[32..]),
        ]))
    }
}

fn signing_key(secret: &[u8; 32]) -> Result<k256::ecdsa::SigningKey, SignError> {
    k256::ecdsa::SigningKey::from_bytes(secret.into()).map_err(|_| SignError::Signing)
}

fn dec_str(text: &str) -> Result<u128, SignError> {
    // Oracle values fit u128; anything larger is rejected here until a
    // full uint256 path is added alongside its own test vectors.
    text.parse::<u128>().map_err(|_| SignError::BadValue)
}

/// Minimal big-endian bytes of a u128 (empty for zero, per RLP).
fn uint_rlp(value: u128) -> Vec<u8> {
    if value == 0 {
        return Vec::new();
    }
    let bytes = value.to_be_bytes();
    let first = bytes.iter().position(|&b| b != 0).unwrap_or(15);
    bytes[first..].to_vec()
}

fn trim_zeros(bytes: &[u8]) -> Vec<u8> {
    let first = bytes
        .iter()
        .position(|&b| b != 0)
        .unwrap_or(bytes.len().saturating_sub(1));
    bytes[first..].to_vec()
}

fn hex_to_20(input: &str) -> Result<Vec<u8>, SignError> {
    let body = input
        .strip_prefix("0x")
        .or_else(|| input.strip_prefix("0X"))
        .ok_or(AddressError::Malformed)?;
    if body.len() != 40 {
        return Err(AddressError::Malformed.into());
    }
    (0..40)
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&body[i..i + 2], 16)
                .map_err(|_| SignError::BadAddress(AddressError::Malformed))
        })
        .collect()
}

fn hex_of(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

/// RLP-encode a list of already-formed items (each item is raw payload;
/// this wraps strings/lists with correct prefixes).
fn rlp_list(items: &[&[u8]]) -> Vec<u8> {
    let mut payload = Vec::new();
    for item in items {
        rlp_append(&mut payload, item);
    }
    let mut out = rlp_prefix(payload.len(), 0xc0);
    out.extend_from_slice(&payload);
    out
}

fn rlp_append(out: &mut Vec<u8>, item: &[u8]) {
    if item.len() == 1 && item[0] < 0x80 {
        out.push(item[0]);
    } else {
        out.extend_from_slice(&rlp_prefix(item.len(), 0x80));
        out.extend_from_slice(item);
    }
}

fn rlp_prefix(len: usize, base: u8) -> Vec<u8> {
    if len <= 55 {
        vec![base + len as u8]
    } else {
        let bytes = usize_be(len);
        let mut out = vec![base + 55 + bytes.len() as u8];
        out.extend_from_slice(&bytes);
        out
    }
}

fn usize_be(mut value: usize) -> Vec<u8> {
    let mut bytes = Vec::new();
    while value > 0 {
        bytes.push((value & 0xff) as u8);
        value >>= 8;
    }
    bytes.reverse();
    bytes
}

#[cfg(test)]
mod oracle_tests {
    use super::*;

    const PHRASE: &str = "test test test test test test test test test test test junk";
    const RAW_KEY_HEX: &str = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

    fn from_hex(text: &str) -> Vec<u8> {
        let body = text.strip_prefix("0x").unwrap_or(text);
        (0..body.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&body[i..i + 2], 16).unwrap())
            .collect()
    }

    fn to_hex(bytes: &[u8]) -> String {
        let mut out = String::from("0x");
        out.push_str(&hex_of(bytes));
        out
    }

    #[test]
    fn all_200_derivations_match_the_v1_oracle() {
        let raw = include_str!("../../../../../test/golden/derivations.json");
        let oracle: serde_json::Value = serde_json::from_str(raw).unwrap();
        let derivations = oracle["derivations"].as_array().unwrap();
        assert_eq!(derivations.len(), 200);
        for entry in derivations {
            let index = entry["index"].as_u64().unwrap() as u32;
            let secret = DerivedSecret::derive(PHRASE, "", index).unwrap();
            assert_eq!(
                secret.address().unwrap(),
                entry["address"].as_str().unwrap(),
                "mismatch at index {index}"
            );
        }
    }

    #[test]
    fn all_50_signed_transactions_match_the_v1_oracle() {
        let raw = include_str!("../../../../../test/golden/transactions.json");
        let oracle: serde_json::Value = serde_json::from_str(raw).unwrap();
        let txs = oracle["transactions"].as_array().unwrap();
        assert_eq!(txs.len(), 50);
        let secret_bytes = from_hex(RAW_KEY_HEX);
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&secret_bytes);
        let secret = DerivedSecret(arr);
        for entry in txs {
            let data = match entry["data"].as_str() {
                Some(hex) => from_hex(hex),
                None => Vec::new(),
            };
            // Leak the data vec into the tx struct lifetime: rebuild per case.
            let tx = LegacyTx {
                chain_id: entry["chainId"].as_u64().unwrap(),
                nonce: entry["nonce"].as_u64().unwrap(),
                gas_price: entry["gasPrice"].as_str().unwrap(),
                gas_limit: entry["gasLimit"].as_u64().unwrap(),
                to: entry["to"].as_str().unwrap(),
                value: entry["value"].as_str().unwrap(),
                data: &data,
            };
            let signed = secret.sign_legacy(&tx).unwrap();
            assert_eq!(
                to_hex(&signed),
                entry["signed"].as_str().unwrap().to_ascii_lowercase(),
                "mismatch at oracle index {}",
                entry["index"]
            );
        }
    }

    #[test]
    fn wrong_passphrase_derives_a_different_account() {
        let a = DerivedSecret::derive(PHRASE, "", 0)
            .unwrap()
            .address()
            .unwrap();
        let b = DerivedSecret::derive(PHRASE, "extra word", 0)
            .unwrap()
            .address()
            .unwrap();
        assert_eq!(a, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
        assert_ne!(a, b);
        assert!(DerivedSecret::derive("abandon abandon abandon", "", 0).is_err());
    }
}
