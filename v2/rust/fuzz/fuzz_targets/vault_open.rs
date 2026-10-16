#![no_main]

//! Arbitrary bytes must never panic the vault parser, exhaust memory,
//! or accept a forged file. Any return value is fine; crashes are not.
//!
//! Note: only the open path is fuzzed. Sealing runs a 64 MiB Argon2id
//! derivation per call and would stall the fuzzer; round trips are
//! covered by unit tests instead.

use libfuzzer_sys::fuzz_target;

fuzz_target!(|bytes: &[u8]| {
    // Fixed wrong password: the parser must reject cleanly, never panic.
    let _ = bnb_wallet_vault::open(b"fuzz-wrong-password", bytes);
});
