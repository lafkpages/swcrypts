use std::{fs::File, io::Read, path::PathBuf};

use aes_gcm::Aes256Gcm;
use mime_guess::MimeGuess;

use crate::{
    crypto::{
        CryptoError, encrypt_data,
        keys::{HmacSha256, encrypt_file_path},
    },
    files::file_is_entry_point,
    payloads::{FileMetadata, build_file_payload},
};

pub fn encrypt_file(
    file_path: PathBuf,
    cipher: &Aes256Gcm,
    file_paths_key: &HmacSha256,
) -> Result<(bool, Vec<u8>, String), CryptoError> {
    let mut file_data = Vec::new();
    File::open(&file_path)
        .unwrap()
        .read_to_end(&mut file_data)
        .unwrap();

    let mime_type = MimeGuess::from_path(&file_path)
        .first()
        .map(|m| m.to_string())
        .unwrap_or_default();

    let payload = build_file_payload(&FileMetadata { mime_type }, &file_data);

    let is_entrypoint = file_is_entry_point(&file_path);

    let encrypted_data = encrypt_data(&payload, cipher)?;
    let encrypted_path = encrypt_file_path(&file_path, file_paths_key);

    Ok((is_entrypoint, encrypted_data, encrypted_path))
}
