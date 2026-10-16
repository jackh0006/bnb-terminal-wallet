//! OS protections for BNB Wallet v2: refuse root, kill core dumps.
//!
//! This is the ONE crate allowed `unsafe`, and every block carries a
//! SAFETY comment plus a test. All other crates keep
//! `#![forbid(unsafe_code)]`.

use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum HardenError {
    #[error("refusing to run as root")]
    IsRoot,
}

/// True when running as uid 0. The CLI refuses to start in that case.
pub fn is_root() -> bool {
    // SAFETY: getuid takes no arguments and only returns the caller uid.
    unsafe { libc::getuid() == 0 }
}

/// Best effort: no core dumps (RLIMIT_CORE=0) and, on Linux, no ptrace
/// dumps (PR_SET_DUMPABLE=0). Returns what was actually achieved so the
/// caller can warn when protection is unavailable.
pub fn lock_down() -> Lockdown {
    let mut out = Lockdown {
        core_dumps_off: false,
        dumpable_off: false,
    };
    // SAFETY: setrlimit reads a plain-data struct we fully initialize;
    // prctl receives integer arguments only. Neither retains memory.
    unsafe {
        let zero = libc::rlimit {
            rlim_cur: 0,
            rlim_max: 0,
        };
        if libc::setrlimit(libc::RLIMIT_CORE, &zero) == 0 {
            out.core_dumps_off = true;
        }
        #[cfg(target_os = "linux")]
        if libc::prctl(libc::PR_SET_DUMPABLE, 0, 0, 0, 0) == 0 {
            out.dumpable_off = true;
        }
    }
    out
}

#[derive(Debug, PartialEq, Eq)]
pub struct Lockdown {
    pub core_dumps_off: bool,
    pub dumpable_off: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_privilege_state_consistently() {
        // SAFETY: same reasoning as is_root; test-only read.
        let expected = unsafe { libc::getuid() } == 0;
        assert_eq!(is_root(), expected);
    }

    #[test]
    fn core_dumps_can_be_disabled() {
        let done = lock_down();
        assert!(done.core_dumps_off);
    }
}
