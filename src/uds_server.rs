//! UDS Server for CLI communication.
//!
//! This server listens on a dedicated UDS socket and handles binary protocol
//! requests from CLI clients. It provides fast access to in-memory state
//! without requiring database or HA connections.

use std::sync::Arc;
use std::time::Instant;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixListener;
use tracing::{debug, error, info, warn};

use crate::handlers::AppCtx;
use crate::protocol::{
    self, CommandId, ProtocolError, StatusCode,
};

/// Start the UDS server for CLI communication.
///
/// Listens on `$DATA_LOCAL_PATH/apps/tokimo-app-home-assistant.sock`
/// and spawns a task for each incoming connection.
pub async fn spawn(ctx: Arc<AppCtx>) -> anyhow::Result<()> {
    let socket_path = get_socket_path()?;

    // Remove stale socket file if it exists.
    let _ = std::fs::remove_file(&socket_path);

    // Ensure parent directory exists.
    if let Some(parent) = std::path::Path::new(&socket_path).parent() {
        std::fs::create_dir_all(parent)?;
    }

    let listener = UnixListener::bind(&socket_path)?;
    info!(path = %socket_path, "uds-server: listening for CLI connections");

    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _addr)) => {
                    let ctx = Arc::clone(&ctx);
                    tokio::spawn(async move {
                        if let Err(e) = handle_connection(stream, ctx).await {
                            debug!(error = %e, "uds-server: connection error");
                        }
                    });
                }
                Err(e) => {
                    error!(error = %e, "uds-server: accept error");
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                }
            }
        }
    });

    Ok(())
}

/// Get the socket path for CLI communication.
fn get_socket_path() -> anyhow::Result<String> {
    let bus = std::env::var("TOKIMO_BUS_SOCKET")
        .map_err(|_| anyhow::anyhow!("TOKIMO_BUS_SOCKET not set"))?;
    let parent = std::path::PathBuf::from(&bus)
        .parent()
        .ok_or_else(|| anyhow::anyhow!("TOKIMO_BUS_SOCKET has no parent"))?
        .to_path_buf();
    let apps_dir = parent.join("apps");
    let path = apps_dir.join("tokimo-app-home-assistant.sock");
    Ok(path.to_string_lossy().into_owned())
}

/// Handle a single CLI connection.
async fn handle_connection(
    mut stream: tokio::net::UnixStream,
    ctx: Arc<AppCtx>,
) -> Result<(), ProtocolError> {
    loop {
        // Read request header (8 bytes).
        let mut header = [0u8; 8];
        match stream.read_exact(&mut header).await {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                // Client disconnected.
                return Ok(());
            }
            Err(e) => return Err(ProtocolError::Io(e)),
        }

        let (command_id, payload_len) = protocol::decode_request_header(&header)?;
        protocol::validate_payload_size(payload_len as usize)?;

        // Read payload if present.
        let payload = if payload_len > 0 {
            let mut buf = vec![0u8; payload_len as usize];
            stream.read_exact(&mut buf).await?;
            buf
        } else {
            Vec::new()
        };

        debug!(command = ?command_id, payload_len, "uds-server: received command");

        // Route command and get response.
        let (status, response_payload) = match route_command(command_id, &payload, &ctx).await {
            Ok(payload) => (StatusCode::Ok, payload),
            Err(e) => {
                warn!(error = %e, command = ?command_id, "uds-server: command failed");
                let error_msg = e.to_string().into_bytes();
                (StatusCode::InternalError, error_msg)
            }
        };

        // Send response.
        let response = protocol::encode_response(command_id, status, &response_payload);
        stream.write_all(&response).await?;
    }
}

/// Route a command to the appropriate handler.
async fn route_command(
    command_id: CommandId,
    payload: &[u8],
    ctx: &Arc<AppCtx>,
) -> Result<Vec<u8>, ProtocolError> {
    match command_id {
        CommandId::Ping => Ok(b"PONG".to_vec()),

        CommandId::Status => {
            let response = handlers::handle_status(ctx).await?;
            Ok(serde_json::to_vec(&response).unwrap_or_default())
        }

        CommandId::Instances => {
            let response = handlers::handle_instances(ctx).await?;
            Ok(serde_json::to_vec(&response).unwrap_or_default())
        }

        CommandId::Test => {
            let request: protocol::TestRequest = serde_json::from_slice(payload)
                .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))?;
            let response = handlers::handle_test(ctx, request).await?;
            Ok(serde_json::to_vec(&response).unwrap_or_default())
        }

        CommandId::Search => {
            let request: protocol::SearchRequest = serde_json::from_slice(payload)
                .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))?;
            let response = handlers::handle_search(ctx, request).await?;
            Ok(serde_json::to_vec(&response).unwrap_or_default())
        }

        CommandId::Entity => {
            let request: protocol::EntityRequest = serde_json::from_slice(payload)
                .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))?;
            let response = handlers::handle_entity(ctx, request).await?;
            Ok(serde_json::to_vec(&response).unwrap_or_default())
        }

        CommandId::Call => {
            let request: protocol::CallRequest = serde_json::from_slice(payload)
                .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))?;
            let response = handlers::handle_call(ctx, request).await?;
            Ok(serde_json::to_vec(&response).unwrap_or_default())
        }

        CommandId::Summary => {
            let request: protocol::SummaryRequest = serde_json::from_slice(payload)
                .map_err(|e| ProtocolError::InvalidFrame(e.to_string()))?;
            let response = handlers::handle_summary(ctx, request).await?;
            Ok(serde_json::to_vec(&response).unwrap_or_default())
        }

        CommandId::Pong => {
            Err(ProtocolError::InvalidFrame("PONG is a response-only command".into()))
        }
    }
}

// ── Command handlers ─────────────────────────────────────────────────────────

mod handlers {
    use super::*;
    use crate::protocol::*;
    use std::collections::HashMap;

    pub async fn handle_status(ctx: &AppCtx) -> Result<StatusResponse, ProtocolError> {
        let instances = ctx.conn_pool.instances.iter()
            .map(|entry| {
                let id = entry.key().to_string();
                let instance = entry.value();
                let status = instance.status.try_read()
                    .map(|s| format!("{:?}", *s))
                    .unwrap_or_else(|_| "unknown".to_string());
                let entity_count = instance.store.states.len();
                InstanceStatus {
                    id: id.clone(),
                    name: id, // TODO: get name from config
                    status,
                    entity_count,
                }
            })
            .collect();

        Ok(StatusResponse {
            uptime_secs: 0, // TODO: track uptime
            instances_count: ctx.conn_pool.instances.len(),
            memory_mb: 0, // TODO: track memory
            instances,
        })
    }

    pub async fn handle_instances(ctx: &AppCtx) -> Result<InstancesResponse, ProtocolError> {
        let instances = ctx.conn_pool.instances.iter()
            .map(|entry| {
                let id = entry.key().to_string();
                let instance = entry.value();
                let status = instance.status.try_read()
                    .map(|s| format!("{:?}", *s))
                    .unwrap_or_else(|_| "unknown".to_string());
                let entity_count = instance.store.states.len();
                InstanceInfo {
                    id: id.clone(),
                    name: id, // TODO: get name from config
                    base_url: String::new(), // TODO: get from config
                    status,
                    entity_count,
                }
            })
            .collect();

        Ok(InstancesResponse { instances })
    }

    pub async fn handle_test(
        ctx: &AppCtx,
        request: TestRequest,
    ) -> Result<TestResponse, ProtocolError> {
        let instance_id = uuid::Uuid::parse_str(&request.instance_id)
            .map_err(|e| ProtocolError::InvalidFrame(format!("invalid instance_id: {e}")))?;

        let start = Instant::now();

        let instance = ctx.conn_pool.instances.get(&instance_id)
            .ok_or_else(|| ProtocolError::InvalidFrame(format!("instance not found: {instance_id}")))?;

        // Check if instance is connected by reading status.
        let status = instance.value().status.try_read()
            .map(|s| format!("{:?}", *s))
            .unwrap_or_else(|_| "unknown".to_string());

        let latency_ms = start.elapsed().as_millis() as u64;
        let success = status.contains("Connected");

        Ok(TestResponse {
            success,
            latency_ms,
            error: if success { None } else { Some(status) },
        })
    }

    pub async fn handle_search(
        ctx: &AppCtx,
        request: SearchRequest,
    ) -> Result<SearchResponse, ProtocolError> {
        let mut results = Vec::new();
        let query_lower = request.query.to_lowercase();

        for entry in ctx.conn_pool.instances.iter() {
            let instance_id = entry.key().to_string();
            let instance = entry.value();

            for entity in instance.store.states.iter() {
                let entity_id = &entity.entity_id;
                let state = &entity.state;

                // Match by entity_id or friendly_name attribute.
                let friendly_name = entity.attributes.get("friendly_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                let matches_query = entity_id.to_lowercase().contains(&query_lower)
                    || friendly_name.to_lowercase().contains(&query_lower);

                if !matches_query {
                    continue;
                }

                // Filter by domain if specified.
                if let Some(ref domain) = request.domain {
                    if !entity_id.starts_with(domain) {
                        continue;
                    }
                }

                // Filter by state if specified.
                if let Some(ref state_filter) = request.state {
                    if state != state_filter {
                        continue;
                    }
                }

                // Get display name from override cache if available.
                let display_name = instance.override_cache.get(entity_id)
                    .and_then(|o| o.display_name.clone());

                results.push(EntitySearchResult {
                    instance_id: instance_id.clone(),
                    entity_id: entity_id.clone(),
                    state: state.clone(),
                    attributes: entity.attributes.clone(),
                    display_name,
                });

                if results.len() >= request.limit as usize {
                    return Ok(SearchResponse { entities: results });
                }
            }
        }

        Ok(SearchResponse { entities: results })
    }

    pub async fn handle_entity(
        ctx: &AppCtx,
        request: EntityRequest,
    ) -> Result<EntityResponse, ProtocolError> {
        let instance_id = uuid::Uuid::parse_str(&request.instance_id)
            .map_err(|e| ProtocolError::InvalidFrame(format!("invalid instance_id: {e}")))?;

        let instance = ctx.conn_pool.instances.get(&instance_id)
            .ok_or_else(|| ProtocolError::InvalidFrame(format!("instance not found: {instance_id}")))?;

        let entity = instance.store.states.get(&request.entity_id)
            .ok_or_else(|| ProtocolError::InvalidFrame(format!("entity not found: {}", request.entity_id)))?;

        let override_data = instance.override_cache.get(&request.entity_id);

        Ok(EntityResponse {
            entity_id: entity.entity_id.clone(),
            state: entity.state.clone(),
            attributes: entity.attributes.clone(),
            display_name: override_data.as_ref().and_then(|o| o.display_name.clone()),
            custom_icon: override_data.as_ref().and_then(|o| o.custom_icon.clone()),
            hidden: override_data.as_ref().map(|o| o.hidden).unwrap_or(false),
            is_favorite: override_data.as_ref().map(|o| o.is_favorite).unwrap_or(false),
            last_changed: entity.last_changed.clone(),
            last_updated: entity.last_updated.clone(),
        })
    }

    pub async fn handle_call(
        ctx: &AppCtx,
        request: CallRequest,
    ) -> Result<CallResponse, ProtocolError> {
        let instance_id = uuid::Uuid::parse_str(&request.instance_id)
            .map_err(|e| ProtocolError::InvalidFrame(format!("invalid instance_id: {e}")))?;

        let instance = ctx.conn_pool.instances.get(&instance_id)
            .ok_or_else(|| ProtocolError::InvalidFrame(format!("instance not found: {instance_id}")))?;

        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();

        let cmd = crate::state::WsCmd {
            domain: request.domain,
            service: request.service,
            entity_id: request.entity_id,
            data: request.data.unwrap_or(serde_json::Value::Object(serde_json::Map::new())),
            reply: reply_tx,
        };

        // Send command through the WS channel.
        instance.value().ws_cmd_tx.send(cmd).await
            .map_err(|_| ProtocolError::InvalidFrame("failed to send command to WS supervisor".into()))?;

        // Wait for response.
        let result = reply_rx.await
            .map_err(|_| ProtocolError::InvalidFrame("WS supervisor dropped reply".into()))?;

        match result {
            Ok(value) => {
                // Extract context_id from the response.
                let context_id = value.get("context")
                    .and_then(|c| c.get("id"))
                    .and_then(|id| id.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                Ok(CallResponse { context_id })
            }
            Err(e) => Err(ProtocolError::InvalidFrame(format!("service call failed: {e}"))),
        }
    }

    pub async fn handle_summary(
        ctx: &AppCtx,
        request: SummaryRequest,
    ) -> Result<SummaryResponse, ProtocolError> {
        let instance_id = uuid::Uuid::parse_str(&request.instance_id)
            .map_err(|e| ProtocolError::InvalidFrame(format!("invalid instance_id: {e}")))?;

        let instance = ctx.conn_pool.instances.get(&instance_id)
            .ok_or_else(|| ProtocolError::InvalidFrame(format!("instance not found: {instance_id}")))?;

        let mut unavailable_entities = Vec::new();
        let mut domain_counts: HashMap<String, (u32, u32)> = HashMap::new();

        for entity in instance.store.states.iter() {
            let domain = entity.entity_id.split('.').next().unwrap_or("unknown");

            let entry = domain_counts.entry(domain.to_string()).or_insert((0, 0));
            entry.1 += 1; // total_count

            if entity.state == "unavailable" {
                unavailable_entities.push(UnavailableEntity {
                    entity_id: entity.entity_id.clone(),
                    name: entity.attributes.get("friendly_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    last_changed: entity.last_changed.clone(),
                });
            } else if entity.state == "on" {
                entry.0 += 1; // on_count
            }
        }

        let domain_counts = domain_counts.into_iter()
            .map(|(domain, (on_count, total_count))| DomainCount {
                domain,
                on_count,
                total_count,
            })
            .collect();

        Ok(SummaryResponse {
            unavailable_entities,
            domain_counts,
        })
    }
}
