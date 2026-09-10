use aes_gcm::Aes256Gcm;
use aes_gcm::aead::{Aead, consts::U12};

pub mod keys;
pub mod salt;

#[derive(Debug)]
pub enum CryptoError {
    InvalidData,
    InvalidKey,
    Encryption,
    Decryption,
}

pub fn encrypt_data(data: &[u8], cipher: &Aes256Gcm) -> Result<Vec<u8>, CryptoError> {
    let mut iv = [0u8; 12];
    rand::fill(&mut iv);

    let nonce = aes_gcm::Nonce::<U12>::try_from(&iv[..]).expect("nonce is 12 bytes");
    // `encrypt` returns ciphertext || 16-byte auth tag, which is exactly the
    // layout WebCrypto's AES-GCM produces, so the output is byte-compatible.
    let ciphertext = cipher
        .encrypt(&nonce, data)
        .map_err(|_| CryptoError::Encryption)?;

    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&iv);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

pub fn decrypt_data(data: &[u8], cipher: &Aes256Gcm) -> Result<Vec<u8>, CryptoError> {
    if data.len() < 12 {
        return Err(CryptoError::InvalidData);
    }

    let nonce = aes_gcm::Nonce::<U12>::try_from(&data[..12]).expect("nonce is 12 bytes");
    cipher
        .decrypt(&nonce, &data[12..])
        .map_err(|_| CryptoError::Decryption)
}
