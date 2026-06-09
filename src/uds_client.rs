//! UDS Client for CLI communication with the server.
//!
//! This client connects to the UDS server and sends binary protocol commands.
//! It provides a high-level API for CLI commands.

use std::time::Duration;

use tokimo_bus_protocol::transport::BusStream;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tracing::debug;

use crate::protocol::{
    self, CallRequest, CallResponse, CommandId, EntityRequest, EntityResponse, InstancesResponse, ProtocolError,
    SearchRequest, SearchResponse, StatusCode, StatusResponse, SummaryRequest, SummaryResponse, TestRequest,
    TestResponse,
};

/// Client for communicating with the IPC server.
pub struct UdsClient {
    stream: BusStream,
}

impl UdsClient {
    /// Connect to the IPC server.
    ///
    /// Returns `None` when the server is not running. Because a filesystem
    /// `.exists()` precheck is meaningless for Windows Named Pipes and
    /// [`BusStream::connect`] retries for ~5s, the connect is wrapped in a short
    /// timeout: any timeout or error maps to `None`, letting the CLI fall back
    /// to direct HTTP mode quickly and cross-platform.
    pub async fn connect() -> Option<Self> {
        let socket = match crate::uds_server::cli_socket() {
            Ok(socket) => socket,
            Err(e) => {
                debug!(error = %e, "uds-client: cannot resolve socket address");
                return None;
            }
        };

        match tokio::time::timeout(Duration::from_millis(300), BusStream::connect(&socket)).await {
            Ok(Ok(stream)) => {
                debug!(socket = %socket.display_name(), "uds-client: connected");
                Some(Self { stream })
            }
            Ok(Err(e)) => {
                debug!(error = %e, socket = %socket.display_name(), "uds-client: connection failed");
                None
            }
            Err(_) => {
                debug!(socket = %socket.display_name(), "uds-client: connection timed out (server not running)");
                None
            }
        }
    }

    /// Check if the server is available (can connect within the timeout).
    #[allow(dead_code)]
    pub async fn is_available() -> bool {
        Self::connect().await.is_some()
    }

    /// Send a PING command to check server responsiveness.
    #[allow(dead_code)]
    pub async fn ping(&mut self) -> Result<(), ProtocolError> {
        let request = protocol::encode_request(CommandId::Ping, &[]);
        self.stream.write_all(&request).await?;

        let (cmd, status, payload) = self.read_response().await?;

        if cmd != CommandId::Pong {
            return Err(ProtocolError::InvalidFrame(format!("expected PONG, got {:?}", cmd)));
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

        serde_json::from_slice(&payload).map_err(|e| ProtocolError::InvalidFrame(e.to_string()))
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

        serde_json::from_slice(&payload).map_err(|e| ProtocolError::InvalidFrame(e.to_string()))
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

        serde_json::from_slice(&payload).map_err(|e| ProtocolError::InvalidFrame(e.to_string()))
    }

    /// Search entities.
    pub async fn search(
        &mut self,
        instance_id: &str,
        query: &str,
        domain: Option<&str>,
        state: Option<&str>,
        include_hidden: bool,
        limit: u32,
    ) -> Result<SearchResponse, ProtocolError> {
        let request_payload = serde_json::to_vec(&SearchRequest {
            instance_id: instance_id.to_string(),
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

        serde_json::from_slice(&payload).map_err(|e| ProtocolError::InvalidFrame(e.to_string()))
    }

    /// Get entity details.
    pub async fn entity(&mut self, instance_id: &str, entity_id: &str) -> Result<EntityResponse, ProtocolError> {
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

        serde_json::from_slice(&payload).map_err(|e| ProtocolError::InvalidFrame(e.to_string()))
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

        serde_json::from_slice(&payload).map_err(|e| ProtocolError::InvalidFrame(e.to_string()))
    }

    /// Get instance summary.
    pub async fn summary(&mut self, instance_id: &str) -> Result<SummaryResponse, ProtocolError> {
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

        serde_json::from_slice(&payload).map_err(|e| ProtocolError::InvalidFrame(e.to_string()))
    }

    /// Read a response frame from the server.
    async fn read_response(&mut self) -> Result<(CommandId, StatusCode, Vec<u8>), ProtocolError> {
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
