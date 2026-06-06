//! Binary protocol for UDS communication between CLI (client) and Server (daemon).
//!
//! Frame format (similar to ADB):
//! - Request:  [4B command_id][4B payload_len][payload]
//! - Response: [4B command_id][4B status_code][4B payload_len][payload]

use serde::{Deserialize, Serialize};
use std::fmt;

// ── Error types ──────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum ProtocolError {
    Io(std::io::Error),
    InvalidFrame(String),
    PayloadTooLarge { size: usize, max: usize },
    UnknownCommand(u32),
    #[allow(dead_code)]
    ServerError(u32, String),
}

impl fmt::Display for ProtocolError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(e) => write!(f, "io error: {e}"),
            Self::InvalidFrame(msg) => write!(f, "invalid frame: {msg}"),
            Self::PayloadTooLarge { size, max } => {
                write!(f, "payload too large: {size} bytes (max {max})")
            }
            Self::UnknownCommand(id) => write!(f, "unknown command id: {id}"),
            Self::ServerError(status, msg) => {
                write!(f, "server error (status {status}): {msg}")
            }
        }
    }
}

impl std::error::Error for ProtocolError {}

impl From<std::io::Error> for ProtocolError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

// ── Constants ────────────────────────────────────────────────────────────────

/// Maximum payload size: 16 MB
const MAX_PAYLOAD_SIZE: usize = 16 * 1024 * 1024;

/// Protocol version (for future compatibility)
#[allow(dead_code)]
pub const PROTOCOL_VERSION: u32 = 1;

// ── Command IDs ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum CommandId {
    /// Server status
    Status = 0x01,
    /// List HA instances
    Instances = 0x02,
    /// Test instance connectivity
    Test = 0x03,
    /// Search entities
    Search = 0x04,
    /// Get entity details
    Entity = 0x05,
    /// Call HA service
    Call = 0x06,
    /// Instance summary
    Summary = 0x07,
    /// Heartbeat ping
    Ping = 0x10,
    /// Heartbeat pong (response only)
    Pong = 0x11,
}

impl CommandId {
    pub fn from_u32(value: u32) -> Result<Self, ProtocolError> {
        match value {
            0x01 => Ok(Self::Status),
            0x02 => Ok(Self::Instances),
            0x03 => Ok(Self::Test),
            0x04 => Ok(Self::Search),
            0x05 => Ok(Self::Entity),
            0x06 => Ok(Self::Call),
            0x07 => Ok(Self::Summary),
            0x10 => Ok(Self::Ping),
            0x11 => Ok(Self::Pong),
            _ => Err(ProtocolError::UnknownCommand(value)),
        }
    }
}

// ── Status codes ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum StatusCode {
    Ok = 0x00,
    BadRequest = 0x01,
    NotFound = 0x02,
    InternalError = 0x03,
}

// ── Request payloads ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct TestRequest {
    pub instance_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchRequest {
    pub query: String,
    pub domain: Option<String>,
    pub state: Option<String>,
    pub include_hidden: bool,
    pub limit: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EntityRequest {
    pub instance_id: String,
    pub entity_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CallRequest {
    pub instance_id: String,
    pub domain: String,
    pub service: String,
    pub entity_id: String,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SummaryRequest {
    pub instance_id: String,
}

// ── Response payloads ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct StatusResponse {
    pub uptime_secs: u64,
    pub instances_count: usize,
    pub memory_mb: u64,
    pub instances: Vec<InstanceStatus>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstanceStatus {
    pub id: String,
    pub name: String,
    pub status: String,
    pub entity_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstancesResponse {
    pub instances: Vec<InstanceInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstanceInfo {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub status: String,
    pub entity_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestResponse {
    pub success: bool,
    pub latency_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResponse {
    pub entities: Vec<EntitySearchResult>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EntitySearchResult {
    pub instance_id: String,
    pub entity_id: String,
    pub state: String,
    pub attributes: serde_json::Value,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EntityResponse {
    pub entity_id: String,
    pub state: String,
    pub attributes: serde_json::Value,
    pub display_name: Option<String>,
    pub custom_icon: Option<String>,
    pub hidden: bool,
    pub is_favorite: bool,
    pub last_changed: String,
    pub last_updated: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CallResponse {
    pub context_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SummaryResponse {
    pub unavailable_entities: Vec<UnavailableEntity>,
    pub domain_counts: Vec<DomainCount>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UnavailableEntity {
    pub entity_id: String,
    pub name: String,
    pub last_changed: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DomainCount {
    pub domain: String,
    pub on_count: u32,
    pub total_count: u32,
}

// ── Frame encoding/decoding ──────────────────────────────────────────────────

/// Encode a request frame.
pub fn encode_request(command_id: CommandId, payload: &[u8]) -> Vec<u8> {
    let mut frame = Vec::with_capacity(8 + payload.len());
    frame.extend_from_slice(&(command_id as u32).to_be_bytes());
    frame.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    frame.extend_from_slice(payload);
    frame
}

/// Encode a response frame.
pub fn encode_response(command_id: CommandId, status: StatusCode, payload: &[u8]) -> Vec<u8> {
    let mut frame = Vec::with_capacity(12 + payload.len());
    frame.extend_from_slice(&(command_id as u32).to_be_bytes());
    frame.extend_from_slice(&(status as u32).to_be_bytes());
    frame.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    frame.extend_from_slice(payload);
    frame
}

/// Decode a request frame header (8 bytes).
pub fn decode_request_header(buf: &[u8; 8]) -> Result<(CommandId, u32), ProtocolError> {
    let command_id = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]);
    let payload_len = u32::from_be_bytes([buf[4], buf[5], buf[6], buf[7]]);
    Ok((CommandId::from_u32(command_id)?, payload_len))
}

/// Decode a response frame header (12 bytes).
pub fn decode_response_header(buf: &[u8; 12]) -> Result<(CommandId, StatusCode, u32), ProtocolError> {
    let command_id = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]);
    let status_code = u32::from_be_bytes([buf[4], buf[5], buf[6], buf[7]]);
    let payload_len = u32::from_be_bytes([buf[8], buf[9], buf[10], buf[11]]);

    let status = match status_code {
        0x00 => StatusCode::Ok,
        0x01 => StatusCode::BadRequest,
        0x02 => StatusCode::NotFound,
        0x03 => StatusCode::InternalError,
        _ => return Err(ProtocolError::InvalidFrame(format!("unknown status code: {status_code}"))),
    };

    Ok((CommandId::from_u32(command_id)?, status, payload_len))
}

/// Validate payload size.
pub fn validate_payload_size(size: usize) -> Result<(), ProtocolError> {
    if size > MAX_PAYLOAD_SIZE {
        Err(ProtocolError::PayloadTooLarge {
            size,
            max: MAX_PAYLOAD_SIZE,
        })
    } else {
        Ok(())
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_request() {
        let payload = b"hello";
        let frame = encode_request(CommandId::Ping, payload);

        let (cmd, len) = decode_request_header(&frame[..8].try_into().unwrap()).unwrap();
        assert_eq!(cmd, CommandId::Ping);
        assert_eq!(len, 5);
        assert_eq!(&frame[8..], payload);
    }

    #[test]
    fn test_encode_decode_response() {
        let payload = b"world";
        let frame = encode_response(CommandId::Pong, StatusCode::Ok, payload);

        let (cmd, status, len) = decode_response_header(&frame[..12].try_into().unwrap()).unwrap();
        assert_eq!(cmd, CommandId::Pong);
        assert_eq!(status, StatusCode::Ok);
        assert_eq!(len, 5);
        assert_eq!(&frame[12..], payload);
    }

    #[test]
    fn test_command_id_roundtrip() {
        for id in [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x10, 0x11] {
            let cmd = CommandId::from_u32(id).unwrap();
            assert_eq!(cmd as u32, id);
        }
    }

    #[test]
    fn test_unknown_command() {
        assert!(CommandId::from_u32(0xFF).is_err());
    }

    #[test]
    fn test_payload_too_large() {
        assert!(validate_payload_size(MAX_PAYLOAD_SIZE).is_ok());
        assert!(validate_payload_size(MAX_PAYLOAD_SIZE + 1).is_err());
    }
}
