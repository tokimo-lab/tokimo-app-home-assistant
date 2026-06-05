//! CLI entrypoints for Home Assistant.
//!
//! All commands go through the main server HTTP proxy (`/api/apps/home-assistant/...`)
//! because live entity state and device registry are in-memory on the server side.

use anyhow::Context;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokimo_bus_cli::{Credentials, TokimoAuthArgs};
use uuid::Uuid;

// ── Response DTOs (minimal, matching server JSON shape) ──────────────────────

#[derive(Deserialize)]
struct InstanceInfo {
    id: Uuid,
    name: String,
    base_url: String,
    status: serde_json::Value,
}

#[derive(Deserialize)]
struct EntityListItem {
    entity_id: String,
    state: String,
    attributes: serde_json::Value,
    display_name: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct EntityDetail {
    entity_id: String,
    state: String,
    attributes: serde_json::Value,
    display_name: Option<String>,
    custom_icon: Option<String>,
    hidden: bool,
    is_favorite: bool,
    device: Option<DeviceMeta>,
    last_changed: String,
    last_updated: String,
}

#[derive(Deserialize, Serialize)]
struct DeviceMeta {
    manufacturer: Option<String>,
    model: Option<String>,
    sw_version: Option<String>,
    serial_number: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct ServiceCallResp {
    operation_id: Uuid,
}

#[derive(Deserialize, Serialize)]
struct UnavailableEntityRef {
    entity_id: String,
    name: String,
    last_changed: String,
}

#[derive(Deserialize, Serialize)]
struct DomainCount {
    domain: String,
    on_count: u32,
    total_count: u32,
}

#[derive(Deserialize, Serialize)]
struct InstanceSummary {
    unavailable_entities: Vec<UnavailableEntityRef>,
    domain_counts: Vec<DomainCount>,
}

#[derive(Deserialize)]
struct TestResp {
    ok: bool,
    version: Option<String>,
    error: Option<String>,
}

// ── Init ─────────────────────────────────────────────────────────────────────

/// Resolve credentials → return (base_url, token).
/// CLI goes through HTTP API; no DB connection needed.
async fn init(auth: &TokimoAuthArgs) -> anyhow::Result<(String, String)> {
    let credentials = Credentials::resolve(auth).context("resolve credentials failed")?;
    let base_url = std::env::var("TOKIMO_SERVER_URL").unwrap_or_else(|_| "http://localhost:5678".to_string());
    Ok((base_url, credentials.token))
}

/// Build an HTTP client with the auth header pre-set.
fn api_client(token: &str) -> Client {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::AUTHORIZATION,
        format!("Bearer {token}").parse().expect("valid header"),
    );
    Client::builder()
        .default_headers(headers)
        .build()
        .expect("build client")
}

const API: &str = "/api/apps/home-assistant";

// ── Dispatch ─────────────────────────────────────────────────────────────────

pub async fn run(auth: TokimoAuthArgs, command: crate::Command) -> anyhow::Result<()> {
    match command {
        crate::Command::Status => run_status(auth).await,
        crate::Command::Instances => run_instances(auth).await,
        crate::Command::Test { id } => run_test(auth, id).await,
        crate::Command::Search {
            instance_id,
            query,
            domain,
            state,
            include_hidden,
            limit,
            raw,
        } => run_search(auth, instance_id, query, domain, state, include_hidden, limit, raw).await,
        crate::Command::Entity {
            instance_id,
            entity_id,
            raw,
        } => run_entity(auth, instance_id, entity_id, raw).await,
        crate::Command::Call {
            instance_id,
            domain,
            service,
            entity_id,
            data,
        } => run_call(auth, instance_id, domain, service, entity_id, data).await,
        crate::Command::Summary { instance_id, raw } => run_summary(auth, instance_id, raw).await,
    }
}

// ── status ───────────────────────────────────────────────────────────────────

/// Authenticate, list instances, print connection status + domain stats.
pub async fn run_status(auth: TokimoAuthArgs) -> anyhow::Result<()> {
    let (base_url, token) = init(&auth).await?;
    let client = api_client(&token);

    let instances: Vec<InstanceInfo> = client
        .get(format!("{base_url}{API}/instances"))
        .send()
        .await
        .context("request instances")?
        .error_for_status()
        .context("instances request failed")?
        .json()
        .await
        .context("parse instances")?;

    if instances.is_empty() {
        println!("No Home Assistant instances configured.");
        println!("Use the app UI to add an instance first.");
        return Ok(());
    }

    println!("🏠 Home Assistant CLI — {} instance(s)\n", instances.len());

    for inst in &instances {
        let status_str = format_status(&inst.status);
        println!("  Instance: {} ({})", inst.name, inst.id);
        println!("  Status:   {status_str}");
        println!("  URL:      {}", inst.base_url);

        // Fetch domain summary
        match client
            .get(format!("{base_url}{API}/instances/{}/summary", inst.id))
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(summary) = resp.json::<InstanceSummary>().await
                    && !summary.domain_counts.is_empty()
                {
                    println!("\n  Domains:");
                    for dc in &summary.domain_counts {
                        println!("    {:<20} {} entities", dc.domain, dc.total_count);
                    }
                }
            }
            _ => {}
        }
        println!();
    }

    Ok(())
}

// ── instances ────────────────────────────────────────────────────────────────

/// List all HA instances.
pub async fn run_instances(auth: TokimoAuthArgs) -> anyhow::Result<()> {
    let (base_url, token) = init(&auth).await?;
    let client = api_client(&token);

    let instances: Vec<InstanceInfo> = client
        .get(format!("{base_url}{API}/instances"))
        .send()
        .await
        .context("request instances")?
        .error_for_status()
        .context("instances request failed")?
        .json()
        .await
        .context("parse instances")?;

    if instances.is_empty() {
        println!("No instances configured.");
        return Ok(());
    }

    println!("{:<38} {:<25} {:<40} Status", "ID", "Name", "URL");
    println!("{}", "-".repeat(120));
    for inst in &instances {
        let status_str = format_status(&inst.status);
        println!("{:<38} {:<25} {:<40} {}", inst.id, inst.name, inst.base_url, status_str);
    }

    Ok(())
}

// ── test ─────────────────────────────────────────────────────────────────────

/// Test connectivity to an HA instance.
pub async fn run_test(auth: TokimoAuthArgs, instance_id: Uuid) -> anyhow::Result<()> {
    let (base_url, token) = init(&auth).await?;
    let client = api_client(&token);

    let resp: TestResp = client
        .post(format!("{base_url}{API}/instances/{instance_id}/test"))
        .send()
        .await
        .context("request test")?
        .error_for_status()
        .context("test request failed")?
        .json()
        .await
        .context("parse test response")?;

    if resp.ok {
        println!(
            "✅ Connected to Home Assistant {}",
            resp.version.as_deref().unwrap_or("(unknown version)")
        );
    } else {
        println!(
            "❌ Connection failed: {}",
            resp.error.as_deref().unwrap_or("unknown error")
        );
    }

    Ok(())
}

// ── search ───────────────────────────────────────────────────────────────────

/// Search entities by entity_id / friendly_name, with optional domain and state filters.
pub async fn run_search(
    auth: TokimoAuthArgs,
    instance_id: Uuid,
    query: String,
    domain: Option<String>,
    state: Option<String>,
    include_hidden: bool,
    limit: u32,
    raw: bool,
) -> anyhow::Result<()> {
    let (base_url, token) = init(&auth).await?;
    let client = api_client(&token);

    let url = if include_hidden {
        format!("{base_url}{API}/instances/{instance_id}/entities?include_hidden=true")
    } else {
        format!("{base_url}{API}/instances/{instance_id}/entities")
    };

    let entities: Vec<EntityListItem> = client
        .get(&url)
        .send()
        .await
        .context("request entities")?
        .error_for_status()
        .context("entities request failed")?
        .json()
        .await
        .context("parse entities")?;

    let query_lower = query.to_lowercase();
    let domain_filter: Option<Vec<String>> = domain.map(|d| d.split(',').map(|s| s.trim().to_lowercase()).collect());
    let state_filter: Option<Vec<String>> = state.map(|s| s.split(',').map(|s| s.trim().to_lowercase()).collect());

    let mut results: Vec<&EntityListItem> = entities
        .iter()
        .filter(|e| {
            // Match query against entity_id or friendly_name
            let friendly = e.attributes.get("friendly_name").and_then(|v| v.as_str()).unwrap_or("");
            let display = e.display_name.as_deref().unwrap_or("");
            let matches_query = e.entity_id.to_lowercase().contains(&query_lower)
                || friendly.to_lowercase().contains(&query_lower)
                || display.to_lowercase().contains(&query_lower);

            let matches_domain = domain_filter
                .as_ref()
                .map(|ds| {
                    let ed = e.entity_id.split('.').next().unwrap_or("");
                    ds.iter().any(|d| d == ed)
                })
                .unwrap_or(true);

            let matches_state = state_filter
                .as_ref()
                .map(|ss| ss.iter().any(|s| s == &e.state.to_lowercase()))
                .unwrap_or(true);

            matches_query && matches_domain && matches_state
        })
        .collect();

    results.truncate(limit as usize);

    if raw {
        let json_out: Vec<serde_json::Value> = results
            .iter()
            .map(|e| {
                serde_json::json!({
                    "entity_id": e.entity_id,
                    "state": e.state,
                    "attributes": e.attributes,
                    "display_name": e.display_name,
                })
            })
            .collect();
        println!("{}", serde_json::to_string_pretty(&json_out)?);
        return Ok(());
    }

    if results.is_empty() {
        println!("No entities found matching \"{query}\".");
        return Ok(());
    }

    let noun = if results.len() == 1 { "entity" } else { "entities" };
    println!("🔍 Found {} {noun} matching \"{query}\":\n", results.len());
    println!("  {:<40} {:<12} {:<15} Friendly Name", "Entity ID", "State", "Domain");
    println!("  {}", "-".repeat(100));

    for e in &results {
        let domain_str = e.entity_id.split('.').next().unwrap_or("?");
        let friendly = e
            .attributes
            .get("friendly_name")
            .and_then(|v| v.as_str())
            .unwrap_or("-");
        println!(
            "  {:<40} {:<12} {:<15} {}",
            truncate(&e.entity_id, 40),
            truncate(&e.state, 12),
            domain_str,
            truncate(friendly, 30)
        );
    }

    Ok(())
}

// ── entity ───────────────────────────────────────────────────────────────────

/// Show detailed info for a single entity (including device metadata).
pub async fn run_entity(auth: TokimoAuthArgs, instance_id: Uuid, entity_id: String, raw: bool) -> anyhow::Result<()> {
    let (base_url, token) = init(&auth).await?;
    let client = api_client(&token);

    let entity: EntityDetail = client
        .get(format!("{base_url}{API}/instances/{instance_id}/entities/{entity_id}"))
        .send()
        .await
        .context("request entity")?
        .error_for_status()
        .context("entity request failed")?
        .json()
        .await
        .context("parse entity")?;

    if raw {
        println!("{}", serde_json::to_string_pretty(&entity)?);
        return Ok(());
    }

    let domain = entity_id.split('.').next().unwrap_or("unknown");
    let icon = domain_icon(domain);

    println!("{icon} {entity_id}");
    println!("  State:       {}", entity.state);
    if let Some(ref name) = entity.display_name {
        println!("  Name:        {name}");
    }
    if let Some(friendly) = entity.attributes.get("friendly_name").and_then(|v| v.as_str()) {
        println!("  Friendly:    {friendly}");
    }
    println!("  Domain:      {domain}");

    // Attributes
    if let Some(obj) = entity.attributes.as_object() {
        let skip = ["friendly_name", "supported_features", "supported_color_modes", "icon"];
        let mut printed_header = false;
        for (k, v) in obj {
            if skip.contains(&k.as_str()) {
                continue;
            }
            if !printed_header {
                println!("\n  Attributes:");
                printed_header = true;
            }
            let val = match v {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Array(arr) => {
                    let items: Vec<String> = arr
                        .iter()
                        .map(|item| match item {
                            serde_json::Value::String(s) => s.clone(),
                            other => other.to_string(),
                        })
                        .collect();
                    format!("[{}]", items.join(", "))
                }
                other => other.to_string(),
            };
            println!("    {:<22} {}", k, val);
        }
    }

    // Device metadata
    if let Some(ref device) = entity.device {
        println!("\n  Device:");
        if let Some(ref mfr) = device.manufacturer {
            println!("    Manufacturer:  {mfr}");
        }
        if let Some(ref model) = device.model {
            println!("    Model:         {model}");
        }
        if let Some(ref sw) = device.sw_version {
            println!("    SW Version:    {sw}");
        }
        if let Some(ref serial) = device.serial_number {
            println!("    Serial:        {serial}");
        }
        if let Some(ref name) = device.name {
            println!("    Name:          {name}");
        }
    }

    // Display overrides
    let has_display =
        entity.display_name.is_some() || entity.custom_icon.is_some() || entity.hidden || entity.is_favorite;
    if has_display {
        println!("\n  Display:");
        if let Some(ref name) = entity.display_name {
            println!("    Name:          {name}");
        }
        if let Some(ref icon) = entity.custom_icon {
            println!("    Icon:          {icon}");
        }
        if entity.is_favorite {
            println!("    Favorite:      Yes");
        }
        if entity.hidden {
            println!("    Hidden:        Yes");
        }
    }

    println!("\n  Last Changed:  {}", format_date_local(&entity.last_changed));
    println!("  Last Updated:  {}", format_date_local(&entity.last_updated));
    println!("  Entity ID:     {entity_id}");

    Ok(())
}

// ── call ─────────────────────────────────────────────────────────────────────

/// Call a Home Assistant service (e.g. light.turn_on, lock.lock).
pub async fn run_call(
    auth: TokimoAuthArgs,
    instance_id: Uuid,
    domain: String,
    service: String,
    entity_id: String,
    data: Option<String>,
) -> anyhow::Result<()> {
    let (base_url, token) = init(&auth).await?;
    let client = api_client(&token);

    let mut body: serde_json::Value = if let Some(ref d) = data {
        serde_json::from_str(d).context("parse --data JSON")?
    } else {
        serde_json::json!({})
    };

    // Inject entity_id into the body
    if let Some(obj) = body.as_object_mut() {
        obj.insert("entity_id".to_string(), serde_json::Value::String(entity_id.clone()));
    }

    let resp: ServiceCallResp = client
        .post(format!(
            "{base_url}{API}/instances/{instance_id}/services/{domain}/{service}"
        ))
        .json(&serde_json::json!({
            "target": { "entity_id": entity_id },
            "data": body,
        }))
        .send()
        .await
        .context("request service call")?
        .error_for_status()
        .context("service call failed")?
        .json()
        .await
        .context("parse service response")?;

    println!("✅ Service called: {domain}.{service} → {entity_id}");
    println!("   Operation ID: {}", resp.operation_id);

    Ok(())
}

// ── summary ──────────────────────────────────────────────────────────────────

/// Show instance summary: unavailable entities + domain distribution.
pub async fn run_summary(auth: TokimoAuthArgs, instance_id: Uuid, raw: bool) -> anyhow::Result<()> {
    let (base_url, token) = init(&auth).await?;
    let client = api_client(&token);

    let summary: InstanceSummary = client
        .get(format!("{base_url}{API}/instances/{instance_id}/summary"))
        .send()
        .await
        .context("request summary")?
        .error_for_status()
        .context("summary request failed")?
        .json()
        .await
        .context("parse summary")?;

    if raw {
        println!("{}", serde_json::to_string_pretty(&summary)?);
        return Ok(());
    }

    // Instance name
    let instances: Vec<InstanceInfo> = client
        .get(format!("{base_url}{API}/instances"))
        .send()
        .await
        .context("request instances")?
        .error_for_status()?
        .json()
        .await?;
    let inst_name = instances
        .iter()
        .find(|i| i.id == instance_id)
        .map(|i| i.name.as_str())
        .unwrap_or("Unknown");

    println!("📊 Instance Summary: {inst_name}\n");

    // Unavailable entities
    if !summary.unavailable_entities.is_empty() {
        println!("  ⚠️  Unavailable entities ({}):", summary.unavailable_entities.len());
        for ue in &summary.unavailable_entities {
            println!("    - {:<45} ({})", ue.entity_id, format_date_local(&ue.last_changed));
        }
        println!();
    }

    // Domain distribution
    if !summary.domain_counts.is_empty() {
        let total: u32 = summary.domain_counts.iter().map(|d| d.total_count).sum();
        println!("  Domain distribution:");
        for dc in &summary.domain_counts {
            println!("    {:<20} {:>4}", dc.domain, dc.total_count);
        }
        println!("    {}", "-".repeat(26));
        println!("    {:<20} {:>4}", "Total", total);
    }

    Ok(())
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn format_status(status: &serde_json::Value) -> String {
    match status {
        serde_json::Value::String(s) => match s.as_str() {
            "connected" => "✅ Connected".to_string(),
            "connecting" => "⏳ Connecting".to_string(),
            other => format!("❓ {other}"),
        },
        serde_json::Value::Object(obj) => {
            if let Some(serde_json::Value::String(err)) = obj.get("error") {
                format!("❌ Error: {err}")
            } else if let Some(serde_json::Value::String(since)) = obj.get("disconnected") {
                format!("⚠️  Disconnected since {since}")
            } else {
                format!("{status}")
            }
        }
        _ => format!("{status}"),
    }
}

fn domain_icon(domain: &str) -> &'static str {
    match domain {
        "light" => "💡",
        "switch" => "🔌",
        "sensor" => "📡",
        "binary_sensor" => "🔘",
        "climate" => "🌡️",
        "cover" => "🪟",
        "fan" => "🌀",
        "lock" => "🔒",
        "media_player" => "🎵",
        "vacuum" => "🤖",
        "camera" => "📷",
        "scene" => "🎬",
        "script" => "📜",
        "automation" => "⚡",
        _ => "🔹",
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let end = s
            .char_indices()
            .nth(max - 1)
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(s.len());
        format!("{}…", &s[..end])
    }
}

fn format_date_local(date_str: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(date_str)
        .map(|dt| dt.with_timezone(&chrono::Local).format("%Y-%m-%d %H:%M").to_string())
        .unwrap_or_else(|_| date_str.get(..16).unwrap_or(date_str).replace('T', " "))
}
