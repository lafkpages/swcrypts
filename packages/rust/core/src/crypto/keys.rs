use std::path::Path;

use aes_gcm::{Aes256Gcm, KeyInit};

use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::constants::PBKDF2_ITERATIONS;
use crate::crypto::CryptoError;

/// The PBKDF2 output — the Rust equivalent of the TS lib's `hashedPassword`
/// `Uint8Array`. `Aes256Gcm` is opaque (its key bytes can't be read back out),
/// so we keep the raw bytes and derive handles from them on demand.
#[derive(Clone)]
pub struct HashedPassword([u8; 32]);

impl HashedPassword {
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// Reusable AES-256-GCM handle (TS: `importKey("raw", ..., "AES-GCM")`).
    pub fn cipher(&self) -> Result<Aes256Gcm, CryptoError> {
        Aes256Gcm::new_from_slice(&self.0).map_err(|_| CryptoError::InvalidKey)
    }
}

pub fn hash_password(password: &str, salt: &[u8]) -> HashedPassword {
    let mut key = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<sha2::Sha256>(password.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);

    HashedPassword(key)
}

/// HMAC-SHA256 handle used to blind file paths (TS: the HMAC `CryptoKey`).
pub type HmacSha256 = Hmac<Sha256>;

/// Derives the file-paths key via HKDF-SHA256 over the hashed password.
///
/// Parameters must match the TS lib byte-for-byte: empty salt, info
/// `"swcrypts-paths"`, 64-byte output.
pub fn derive_file_paths_key(hashed_password: &HashedPassword) -> Result<HmacSha256, CryptoError> {
    // `None` salt == empty salt, matching `salt: new Uint8Array(0)` in TS.
    let hk = Hkdf::<Sha256>::new(None, hashed_password.as_bytes());

    let mut okm = [0u8; 64];
    // `expand` only fails if the output exceeds 255 * hash_len — unreachable
    // for 64 bytes with SHA-256, but the API is fallible.
    hk.expand(b"swcrypts-paths", &mut okm)
        .map_err(|_| CryptoError::InvalidKey)?;

    // HMAC accepts keys of any length, so this can't actually fail
    // (unlike AES, which requires exactly 32 bytes).
    HmacSha256::new_from_slice(&okm).map_err(|_| CryptoError::InvalidKey)
}

/// Blinds a file path to its HMAC-hex `.enc` filename.
pub fn encrypt_file_path(file_path: &Path, key: &HmacSha256) -> String {
    // `Hmac` consumes itself on `finalize`, so clone the handle to keep the
    // original usable across calls.
    let mut mac = key.clone();
    // TS encodes the path string as UTF-8; `as_encoded_bytes` gives the raw
    // OS bytes, which are UTF-8 for any path that round-trips through the
    // TS lib anyway.
    Mac::update(&mut mac, file_path.as_os_str().as_encoded_bytes());

    format!(
        "{}.swcrypts.enc",
        hex::encode(Mac::finalize(mac).into_bytes())
    )
}
