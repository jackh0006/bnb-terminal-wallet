#![forbid(unsafe_code)]

//! Encrypted local-vault primitives for BNB Wallet v2.
//!
//! This format deliberately has a small surface: a password is stretched with
//! Argon2id and encrypts one opaque payload using XChaCha20-Poly1305. Header
//! bytes are authenticated, so parameters cannot be silently downgraded.

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    KeyInit, XChaCha20Poly1305, XNonce,
    aead::{Aead, Payload},
};
use rand::{RngCore, rngs::OsRng};
use thiserror::Error;
use zeroize::{Zeroize, Zeroizing};

const MAGIC: [u8; 8] = *b"BNBVL002";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 24;
const KEY_LEN: usize = 32;
const HEADER_LEN: usize = MAGIC.len() + 4 + 4 + SALT_LEN + NONCE_LEN;
pub const MIN_MEMORY_KIB: u32 = 65_536;
pub const MIN_ITERATIONS: u32 = 3;
const MAX_MEMORY_KIB: u32 = 524_288;
const MAX_ITERATIONS: u32 = 10;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum VaultError {
    #[error("vault data is malformed")]
    Malformed,
    #[error("vault uses unsupported or unsafe password parameters")]
    UnsafeParameters,
    #[error("vault authentication failed")]
    Authentication,
    #[error("password derivation failed")]
    Derivation,
}

/// A zeroizing secret payload. It intentionally has no `Clone` implementation.
pub struct SecretPayload(Zeroizing<Vec<u8>>);

impl SecretPayload {
    pub fn new(bytes: Vec<u8>) -> Self {
        Self(Zeroizing::new(bytes))
    }

    pub fn expose_for_core_only(&self) -> &[u8] {
        &self.0
    }
}

/// Encrypt `payload` using the fixed v2 Argon2id floor.
pub fn seal(password: &[u8], payload: SecretPayload) -> Result<Vec<u8>, VaultError> {
    let mut salt = [0u8; SALT_LEN];
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);
    seal_with_parameters(
        password,
        payload,
        MIN_MEMORY_KIB,
        MIN_ITERATIONS,
        salt,
        nonce,
    )
}

fn seal_with_parameters(
    password: &[u8],
    payload: SecretPayload,
    memory_kib: u32,
    iterations: u32,
    salt: [u8; SALT_LEN],
    nonce: [u8; NONCE_LEN],
) -> Result<Vec<u8>, VaultError> {
    validate_parameters(memory_kib, iterations)?;
    let mut header = Vec::with_capacity(HEADER_LEN);
    header.extend_from_slice(&MAGIC);
    header.extend_from_slice(&memory_kib.to_le_bytes());
    header.extend_from_slice(&iterations.to_le_bytes());
    header.extend_from_slice(&salt);
    header.extend_from_slice(&nonce);

    let mut key = derive_key(password, &salt, memory_kib, iterations)?;
    let cipher = XChaCha20Poly1305::new_from_slice(&key[..]).map_err(|_| VaultError::Derivation)?;
    let ciphertext = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: payload.expose_for_core_only(),
                aad: &header,
            },
        )
        .map_err(|_| VaultError::Authentication)?;
    key.zeroize();
    header.extend_from_slice(&ciphertext);
    Ok(header)
}

/// Open and authenticate a v2 vault. Authentication failures never reveal
/// whether the supplied password, ciphertext, or header was wrong.
pub fn open(password: &[u8], encoded: &[u8]) -> Result<SecretPayload, VaultError> {
    if encoded.len() < HEADER_LEN + 16 || encoded[..MAGIC.len()] != MAGIC {
        return Err(VaultError::Malformed);
    }
    let memory_offset = MAGIC.len();
    let iterations_offset = memory_offset + 4;
    let salt_offset = iterations_offset + 4;
    let nonce_offset = salt_offset + SALT_LEN;
    let memory_kib = u32::from_le_bytes(
        encoded[memory_offset..iterations_offset]
            .try_into()
            .map_err(|_| VaultError::Malformed)?,
    );
    let iterations = u32::from_le_bytes(
        encoded[iterations_offset..salt_offset]
            .try_into()
            .map_err(|_| VaultError::Malformed)?,
    );
    validate_parameters(memory_kib, iterations)?;
    let salt: [u8; SALT_LEN] = encoded[salt_offset..nonce_offset]
        .try_into()
        .map_err(|_| VaultError::Malformed)?;
    let nonce: [u8; NONCE_LEN] = encoded[nonce_offset..HEADER_LEN]
        .try_into()
        .map_err(|_| VaultError::Malformed)?;
    let mut key = derive_key(password, &salt, memory_kib, iterations)?;
    let cipher = XChaCha20Poly1305::new_from_slice(&key[..]).map_err(|_| VaultError::Derivation)?;
    let plaintext = cipher
        .decrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: &encoded[HEADER_LEN..],
                aad: &encoded[..HEADER_LEN],
            },
        )
        .map_err(|_| VaultError::Authentication)?;
    key.zeroize();
    Ok(SecretPayload::new(plaintext))
}

fn validate_parameters(memory_kib: u32, iterations: u32) -> Result<(), VaultError> {
    if !(MIN_MEMORY_KIB..=MAX_MEMORY_KIB).contains(&memory_kib)
        || !(MIN_ITERATIONS..=MAX_ITERATIONS).contains(&iterations)
    {
        return Err(VaultError::UnsafeParameters);
    }
    Ok(())
}

fn derive_key(
    password: &[u8],
    salt: &[u8; SALT_LEN],
    memory_kib: u32,
    iterations: u32,
) -> Result<Zeroizing<[u8; KEY_LEN]>, VaultError> {
    let params = Params::new(memory_kib, iterations, 1, Some(KEY_LEN))
        .map_err(|_| VaultError::Derivation)?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    argon
        .hash_password_into(password, salt, &mut *key)
        .map_err(|_| VaultError::Derivation)?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_round_trip_and_wrong_password() {
        let encoded = seal(
            b"correct horse battery staple",
            SecretPayload::new(b"test-only secret".to_vec()),
        )
        .unwrap();
        assert_eq!(
            open(b"correct horse battery staple", &encoded)
                .unwrap()
                .expose_for_core_only(),
            b"test-only secret"
        );
        assert!(matches!(
            open(b"wrong", &encoded),
            Err(VaultError::Authentication)
        ));
    }

    #[test]
    fn authenticated_ciphertext_and_header_mutations_fail() {
        let encoded = seal_with_parameters(
            b"password",
            SecretPayload::new(b"payload".to_vec()),
            MIN_MEMORY_KIB,
            MIN_ITERATIONS,
            [7; SALT_LEN],
            [9; NONCE_LEN],
        )
        .unwrap();
        // Representative bytes cover magic, work factors, salt, nonce, and
        // ciphertext. Poly1305 authenticates every ciphertext byte; testing
        // every byte here would repeat the intentionally expensive 64 MiB
        // Argon2id operation dozens of times.
        let protected_offsets = [
            0,
            MAGIC.len(),
            MAGIC.len() + 4,
            MAGIC.len() + 8,
            HEADER_LEN,
            encoded.len() - 1,
        ];
        for index in protected_offsets {
            let mut changed = encoded.clone();
            changed[index] ^= 1;
            assert!(
                open(b"password", &changed).is_err(),
                "byte {index} accepted"
            );
        }
    }

    #[test]
    fn rejects_downgrade_and_resource_exhaustion_parameters() {
        let mut encoded = seal(b"password", SecretPayload::new(b"payload".to_vec())).unwrap();
        encoded[MAGIC.len()..MAGIC.len() + 4].copy_from_slice(&(MIN_MEMORY_KIB - 1).to_le_bytes());
        assert!(matches!(
            open(b"password", &encoded),
            Err(VaultError::UnsafeParameters)
        ));
        encoded[MAGIC.len()..MAGIC.len() + 4].copy_from_slice(&(MAX_MEMORY_KIB + 1).to_le_bytes());
        assert!(matches!(
            open(b"password", &encoded),
            Err(VaultError::UnsafeParameters)
        ));
    }
}
