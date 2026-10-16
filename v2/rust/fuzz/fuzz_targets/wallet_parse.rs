#![no_main]

//! Arbitrary strings must never panic the amount parser or the address
//! classifier. Any return value is fine; crashes are not.

use libfuzzer_sys::fuzz_target;

fuzz_target!(|text: &str| {
    let _ = bnb_wallet_wallet::parse_amount(text, 18);
    let _ = bnb_wallet_wallet::classify_address(text);
    let _ = bnb_wallet_wallet::reject_zero_address(text);
    let _ = bnb_wallet_wallet::checksum_address(text);
});
