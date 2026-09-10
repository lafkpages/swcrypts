use serde::{Deserialize, Serialize};

pub const PAYLOAD_VERSION: PayloadVersion = PayloadVersion { major: 1, minor: 0 };

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PayloadVersion {
    pub major: u8,
    pub minor: u8,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileMetadata {
    #[serde(rename = "mimeType")]
    pub mime_type: String,
}

pub struct DecodedPayload {
    pub metadata: FileMetadata,
    pub content: Vec<u8>,
}

pub fn build_file_payload(metadata: &FileMetadata, file_data: &[u8]) -> Vec<u8> {
    let encoded_metadata = serde_json::to_vec(metadata).expect("metadata serializes");

    let mut payload = Vec::with_capacity(6 + encoded_metadata.len() + file_data.len());
    payload.push(PAYLOAD_VERSION.major);
    payload.push(PAYLOAD_VERSION.minor);
    payload.extend_from_slice(&(encoded_metadata.len() as u32).to_be_bytes());
    payload.extend_from_slice(&encoded_metadata);
    payload.extend_from_slice(file_data);
    payload
}

#[derive(Debug)]
pub enum DecodeError {
    TooShort,
    InvalidJson,
    InvalidMetadata,
}

pub fn decode_file_payload(payload: &[u8]) -> Result<DecodedPayload, DecodeError> {
    if payload.len() < 6 {
        return Err(DecodeError::TooShort);
    }

    let metadata_len =
        u32::from_be_bytes([payload[2], payload[3], payload[4], payload[5]]) as usize;
    let content_start = 6 + metadata_len;
    if payload.len() < content_start {
        return Err(DecodeError::TooShort);
    }

    let metadata: FileMetadata = serde_json::from_slice(&payload[6..content_start])
        .map_err(|_| DecodeError::InvalidMetadata)?;
    if metadata.mime_type.is_empty() {
        return Err(DecodeError::InvalidMetadata);
    }

    Ok(DecodedPayload {
        metadata,
        content: payload[content_start..].to_vec(),
    })
}
