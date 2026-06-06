//! UDS Client for CLI communication with the server.
//!
//! This client connects to the UDS server and sends binary protocol commands.
//! It provides a high-level API for CLI commands.

use std::path::PathBuf;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixStream;
use tracing::debug;

use crate::protocol::{
    self, CallRequest, CallResponse, CommandId, EntityRequest, EntityResponse, InstancesResponse,
    ProtocolError, SearchRequest, SearchResponse, StatusCode, StatusResponse, SummaryRequest,
    SummaryResponse, TestRequest, TestResponse,
};

/// Client for communicating with the UDS server.
pub struct UdsClient {
    stream: UnixStream,
}

impl UdsClient {
    /// Connect to the UDS server.
    ///
    /// Returns `None` if the socket doesn't exist (server not running).
    pub async fn connect() -> Option<Self> {
        let socket_path = get_socket_path()?;

        // Check if socket file exists.
        if !std::path::Path::new(&socket_path).exists() {
            debug!(path = %socket_path, "uds-client: socket not found");
            return None;
        }

        match UnixStream::connect(&socket_path).await {
            Ok(stream) => {
                debug!(path = %socket_path, "uds-client: connected");
                Some(Self { stream })
            }
            Err(e) => {
                debug!(error = %e, path = %socket_path, "uds-client: connection failed");
                None
            }
        }
    }

    /// Check if the server is available (socket exists and can connect).
    pub async fn is_available() -> bool {
        let socket_path = match get_socket_path() {
            Some(path) => path,
            None => return false,
        };

        std::path::Path::new(&socket_path).exists()
    }

    /// Send a PING command to check server responsiveness.
    pub async fn ping(&mut self) -> Result<(), ProtocolError> {
        let request = protocol::encode_request(CommandId::Ping, &[]);
        self.stream.write_all(&request).await?;

        let (cmd, status, payload) = self.read_response().await?;

        if cmd != CommandId::Pong {
            return Err(ProtocolError::InvalidFrame(format!(
                "expected PONG, got {:?}",
                cmd
            )));
        }

        if status != StatusCode::Ok {
            let msg = String::from_utf8_lossy(&payload).to_string();
            return Err(ProtocolError::ServerError(status as u32, msg));
        }

        Ok(())
    }

    /// Get server status.
    pub async fn status(&mut self) -> Result<StatusResponse, ProtocolError> {
        let request = protocol::encode_request(CommandId::Status, &[]);
        self.stream.write_all(&request).await?;

        let (cmd, status, payload) = self.read_response().await?;

        if cmd != CommandId::Status {
            return Err(ProtocolError::InvalidFrame(format!(
                "expected Status response, got {:?}",
                cmd
            )));
        }

        if status != StatusCode::Ok {
            let msg = String::from_utf8_lossy(&payload).to_string();
            return Err(ProtocolError::ServerError(status as u32, msg));
        }

        serde_json::from_slice(&payload)
            .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))
    }

    /// List all instances.
    pub async fn instances(&mut self) -> Result<InstancesResponse, ProtocolError> {
        let request = protocol::encode_request(CommandId::Instances, &[]);
        self.stream.write_all(&request).await?;

        let (cmd, status, payload) = self.read_response().await?;

        if cmd != CommandId::Instances {
            return Err(ProtocolError::InvalidFrame(format!(
                "expected Instances response, got {:?}",
                cmd
            )));
        }

        if status != StatusCode::Ok {
            let msg = String::from_utf8_lossy(&payload).to_string();
            return Err(ProtocolError::ServerError(status as u32, msg));
        }

        serde_json::from_slice(&payload)
            .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))
    }

    /// Test instance connectivity.
    pub async fn test(&mut self, instance_id: &str) -> Result<TestResponse, ProtocolError> {
        let request_payload = serde_json::to_vec(&TestRequest {
            instance_id: instance_id.to_string(),
        })
        .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))?;

        let request = protocol::encode_request(CommandId::Test, &request_payload);
        self.stream.write_all(&request).await?;

        let (cmd, status, payload) = self.read_response().await?;

        if cmd != CommandId::Test {
            return Err(ProtocolError::InvalidFrame(format!(
                "expected Test response, got {:?}",
                cmd
            )));
        }

        if status != StatusCode::Ok {
            let msg = String::from_utf8_lossy(&payload).to_string();
            return Err(ProtocolError::ServerError(status as u32, msg));
        }

        serde_json::from_slice(&payload)
            .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))
    }

    /// Search entities.
    pub async fn search(
        &mut self,
        query: &str,
        domain: Option<&str>,
        state: Option<&str>,
        include_hidden: bool,
        limit: u32,
    ) -> Result<SearchResponse, ProtocolError> {
        let request_payload = serde_json::to_vec(&SearchRequest {
            query: query.to_string(),
            domain: domain.map(|s| s.to_string()),
            state: state.map(|s| s.to_string()),
            include_hidden,
            limit,
        })
        .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))?;

        let request = protocol::encode_request(CommandId::Search, &request_payload);
        self.stream.write_all(&request).await?;

        let (cmd, status, payload) = self.read_response().await?;

        if cmd != CommandId::Search {
            return Err(ProtocolError::InvalidFrame(format!(
                "expected Search response, got {:?}",
                cmd
            )));
        }

        if status != StatusCode::Ok {
            let msg = String::from_utf8_lossy(&payload).to_string();
            return Err(ProtocolError::ServerError(status as u32, msg));
        }

        serde_json::from_slice(&payload)
            .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))
    }

    /// Get entity details.
    pub async fn entity(
        &mut self,
        instance_id: &str,
        entity_id: &str,
    ) -> Result<EntityResponse, ProtocolError> {
        let request_payload = serde_json::to_vec(&EntityRequest {
            instance_id: instance_id.to_string(),
            entity_id: entity_id.to_string(),
        })
        .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))?;

        let request = protocol::encode_request(CommandId::Entity, &request_payload);
        self.stream.write_all(&request).await?;

        let (cmd, status, payload) = self.read_response().await?;

        if cmd != CommandId::Entity {
            return Err(ProtocolError::InvalidFrame(format!(
                "expected Entity response, got {:?}",
                cmd
            )));
        }

        if status != StatusCode::Ok {
            let msg = String::from_utf8_lossy(&payload).to_string();
            return Err(ProtocolError::ServerError(status as u32, msg));
        }

        serde_json::from_slice(&payload)
            .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))
    }

    /// Call a service.
    pub async fn call(
        &mut self,
        instance_id: &str,
        domain: &str,
        service: &str,
        entity_id: &str,
        data: Option<serde_json::Value>,
    ) -> Result<CallResponse, ProtocolError> {
        let request_payload = serde_json::to_vec(&CallRequest {
            instance_id: instance_id.to_string(),
            domain: domain.to_string(),
            service: service.to_string(),
            entity_id: entity_id.to_string(),
            data,
        })
        .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))?;

        let request = protocol::encode_request(CommandId::Call, &request_payload);
        self.stream.write_all(&request).await?;

        let (cmd, status, payload) = self.read_response().await?;

        if cmd != CommandId::Call {
            return Err(ProtocolError::InvalidFrame(format!(
                "expected Call response, got {:?}",
                cmd
            )));
        }

        if status != StatusCode::Ok {
            let msg = String::from_utf8_lossy(&payload).to_string();
            return Err(ProtocolError::ServerError(status as u32, msg));
        }

        serde_json::from_slice(&payload)
            .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))
    }

    /// Get instance summary.
    pub async fn summary(
        &mut self,
        instance_id: &str,
    ) -> Result<SummaryResponse, ProtocolError> {
        let request_payload = serde_json::to_vec(&SummaryRequest {
            instance_id: instance_id.to_string(),
        })
        .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))?;

        let request = protocol::encode_request(CommandId::Summary, &request_payload);
        self.stream.write_all(&request).await?;

        let (cmd, status, payload) = self.read_response().await?;

        if cmd != CommandId::Summary {
            return Err(ProtocolError::InvalidFrame(format!(
                "expected Summary response, got {:?}",
                cmd
            )));
        }

        if status != StatusCode::Ok {
            let msg = String::from_utf8_lossy(&payload).to_string();
            return Err(ProtocolError::ServerError(status as u32, msg));
        }

        serde_json::from_slice(&payload)
            .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))
    }

    /// Read a response frame from the server.
    async fn read_response(
        &mut self,
    ) -> Result<(CommandId, StatusCode, Vec<u8>), ProtocolError> {
        // Read response header (12 bytes).
        let mut header = [0u8; 12];
        self.stream.read_exact(&mut header).await?;

        let (cmd, status, payload_len) = protocol::decode_response_header(&header)?;
        protocol::validate_payload_size(payload_len as usize)?;

        // Read payload if present.
        let payload = if payload_len > 0 {
            let mut buf = vec![0u8; payload_len as usize];
            self.stream.read_exact(&mut buf).await?;
            buf
        } else {
            Vec::new()
        };

        Ok((cmd, status, payload))
    }
}

/// Get the socket path for CLI communication.
fn get_socket_path() -> Option<String> {
    let bus = std::env::var("TOKIMO_BUS_SOCKET").ok()?;
    let parent = PathBuf::from(&bus).parent()?.to_path_buf();
    let apps_dir = parent.join("apps");
    let path = apps_dir.join("tokimo-app-home-assistant.sock");
    Some(path.to_string_lossy().into_owned())
}
