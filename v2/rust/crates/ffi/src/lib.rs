//! C-ABI boundary for Flutter: opaque vault handles only.
//!
//! Dart NEVER receives secrets — only `i64` handles and status codes.
//! Negative returns are errors: `-1` bad pointer, `-2` wrong password
//! or unreadable vault (deliberately indistinguishable), `-3` unknown
//! handle, `-4` file read failure.
//!
//! The two `unsafe` blocks below only build borrowed slices from
//! caller-provided pointers inside the call; each has a SAFETY comment.

use bnb_wallet_vault::SecretPayload;
use std::collections::HashMap;
use std::slice;
use std::sync::{Mutex, OnceLock};

/// Open vault payloads live only here, inside Rust. Dropped (zeroized)
/// by [`bnb_vault_close`].
static OPEN: OnceLock<Mutex<HashMap<i64, SecretPayload>>> = OnceLock::new();
static NEXT: OnceLock<Mutex<i64>> = OnceLock::new();

fn open_map() -> &'static Mutex<HashMap<i64, SecretPayload>> {
    OPEN.get_or_init(|| Mutex::new(HashMap::new()))
}

fn next_handle() -> i64 {
    let mut next = NEXT.get_or_init(|| Mutex::new(1)).lock().unwrap();
    let handle = *next;
    *next += 1;
    handle
}

/// Open a vault file with a password. Returns a handle, or a negative
/// error code. Authentication and I/O failures stay distinguishable
/// only as file-vs-vault errors; wrong password and corrupt vault both
/// return `-2` so callers learn nothing about which failed.
///
/// # Safety
///
/// `password_ptr`/`password_len` and `path_ptr`/`path_len` must describe
/// valid readable memory for the duration of the call. Null pointers
/// return `-1` instead of crashing.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bnb_vault_open(
    password_ptr: *const u8,
    password_len: usize,
    path_ptr: *const u8,
    path_len: usize,
) -> i64 {
    if password_ptr.is_null() || path_ptr.is_null() {
        return -1;
    }
    // SAFETY: null-checked above; slices are borrowed for this call only
    // and never outlive it.
    let password = unsafe { slice::from_raw_parts(password_ptr, password_len) };
    let path = unsafe { slice::from_raw_parts(path_ptr, path_len) };
    let path = match std::str::from_utf8(path) {
        Ok(path) => path,
        Err(_) => return -1,
    };
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(_) => return -4,
    };
    match bnb_wallet_vault::open(password, &bytes) {
        Ok(payload) => {
            let handle = next_handle();
            open_map().lock().unwrap().insert(handle, payload);
            handle
        }
        Err(_) => -2,
    }
}

/// Close a handle and zeroize its secrets. `0` on success, `-3` when the
/// handle is unknown.
#[unsafe(no_mangle)]
pub extern "C" fn bnb_vault_close(handle: i64) -> i32 {
    match open_map().lock().unwrap().remove(&handle) {
        Some(_) => 0,
        None => -3,
    }
}

/// `1` while the handle is open, `0` otherwise. Dart polls status here —
/// never secret bytes.
#[unsafe(no_mangle)]
pub extern "C" fn bnb_vault_is_open(handle: i64) -> i32 {
    i32::from(open_map().lock().unwrap().contains_key(&handle))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CString;

    fn test_vault_bytes() -> Vec<u8> {
        bnb_wallet_vault::seal(b"test-password", SecretPayload::new(b"test-only".to_vec())).unwrap()
    }

    #[test]
    fn open_status_close_round_trip_zeroizes() {
        let dir = std::env::temp_dir();
        let file = dir.join(format!("bnb-ffi-{}.vault", std::process::id()));
        std::fs::write(&file, test_vault_bytes()).unwrap();
        let path = CString::new(file.to_string_lossy().into_owned()).unwrap();
        let password = b"test-password";
        // SAFETY: test-owned pointers, valid for each call.
        let handle = unsafe {
            bnb_vault_open(
                password.as_ptr(),
                password.len(),
                path.as_ptr().cast::<u8>(),
                path.as_bytes().len(),
            )
        };
        assert!(handle > 0);
        assert_eq!(bnb_vault_is_open(handle), 1);
        assert_eq!(bnb_vault_close(handle), 0);
        assert_eq!(bnb_vault_is_open(handle), 0);
        assert_eq!(bnb_vault_close(handle), -3);
        std::fs::remove_file(&file).ok();
    }

    #[test]
    fn wrong_password_and_bad_pointers_fail_closed() {
        let dir = std::env::temp_dir();
        let file = dir.join(format!("bnb-ffi-bad-{}.vault", std::process::id()));
        std::fs::write(&file, test_vault_bytes()).unwrap();
        let path = CString::new(file.to_string_lossy().into_owned()).unwrap();
        let wrong = b"wrong-password";
        // SAFETY: test-owned pointers, valid for each call.
        let denied = unsafe {
            bnb_vault_open(
                wrong.as_ptr(),
                wrong.len(),
                path.as_ptr().cast::<u8>(),
                path.as_bytes().len(),
            )
        };
        assert_eq!(denied, -2);
        // SAFETY: null pointers by construction; must return -1, not crash.
        assert_eq!(
            unsafe { bnb_vault_open(std::ptr::null(), 0, path.as_ptr().cast::<u8>(), 1) },
            -1
        );
        assert_eq!(bnb_vault_is_open(9_999_999), 0);
        std::fs::remove_file(&file).ok();
    }
}
