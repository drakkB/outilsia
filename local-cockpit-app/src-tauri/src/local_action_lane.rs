use crate::local_mcp_http::{
    allowed_loopback_host as allowed_host, allowed_loopback_origin as allowed_origin,
    bearer_authorized as authorized, build_json_response, canonical_sha256, constant_time_eq,
    read_request, sha256_bytes, tiny_response, HttpRequest, JsonResponsePolicy,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tiny_http::Server;

pub(crate) const ACTION_LANE_SCHEMA: &str = "outilsia.local_action_lane.v0";
pub(crate) const ACTION_LANE_CONTRACT_VERSION: &str = "2026-07-28-native-consent-v1";
pub(crate) const ACTION_RECEIPT_SCHEMA: &str = "outilsia.local_action_receipt.v0";
const ACTION_LANE_START_SCHEMA: &str = "outilsia.local_action_lane_start.v0";
const ACTION_APPROVAL_SCHEMA: &str = "outilsia.local_action_approval.v1";
const ACTION_REJECTION_SCHEMA: &str = "outilsia.local_action_rejection.v1";
const MCP_PROTOCOL_VERSION: &str = "2025-11-25";
const MCP_SERVER_VERSION: &str = "0.1.0";
const MCP_PATH: &str = "/mcp";
const DEFAULT_SESSION_TTL_SECONDS: u64 = 15 * 60;
const MIN_SESSION_TTL_SECONDS: u64 = 60;
const MAX_SESSION_TTL_SECONDS: u64 = 30 * 60;
const CAPABILITY_TTL_MS: u128 = 2 * 60 * 1000;
const MAX_REQUEST_BYTES: usize = 64 * 1024;
const MAX_REQUESTS_PER_SESSION: usize = 48;
const MAX_HTTP_REQUESTS_PER_SESSION: usize = 360;
const MAX_MODELS: usize = 96;
const MAX_EXPORT_BYTES: usize = 2 * 1024 * 1024;
const ACTION_TOOL_NAMES: [&str; 5] = [
    "outilsia_prepare_model_install",
    "outilsia_prepare_benchmark",
    "outilsia_prepare_report_export",
    "outilsia_get_action_request",
    "outilsia_cancel_action_request",
];

static LOCAL_ACTION_LANE: OnceLock<Mutex<Option<ActionLaneRuntime>>> = OnceLock::new();

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ActionLaneClient {
    id: String,
    label: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ActionModelSnapshot {
    model: String,
    runtime: String,
    installed: bool,
    estimated_download_gb: Option<f64>,
    estimated_upper_gb: Option<f64>,
    required_free_gb: Option<f64>,
    benchmark_timeout_seconds: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ActionExportSnapshot {
    format: String,
    filename: String,
    destination: String,
    content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct StartLocalActionLaneRequest {
    schema: String,
    client: ActionLaneClient,
    allowed_models: Vec<ActionModelSnapshot>,
    export_snapshot: Option<ActionExportSnapshot>,
    ttl_seconds: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ApproveLocalActionRequest {
    pub(crate) schema: String,
    pub(crate) request_id: String,
    pub(crate) plan_sha256: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct RejectLocalActionRequest {
    pub(crate) schema: String,
    pub(crate) request_id: String,
    pub(crate) plan_sha256: String,
    pub(crate) reason: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum NativeActionConfirmationKind {
    Approval,
    Execution,
    Rejection,
}

#[derive(Debug, Clone)]
pub(crate) struct NativeActionConfirmationPrompt {
    pub(crate) title: String,
    pub(crate) message: String,
    pub(crate) confirm_label: String,
    pub(crate) cancel_label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct LocalActionLaneStart {
    schema: String,
    contract_version: String,
    running: bool,
    base_url: String,
    mcp_url: String,
    mcp_protocol_version: String,
    mcp_server_version: String,
    mcp_tools: Vec<String>,
    token: String,
    session_id: String,
    client_id: String,
    client_label: String,
    expires_at_ms: u128,
    ttl_seconds: u64,
    bind: String,
    enabled_by_default: bool,
    token_persisted: bool,
    queue_persisted: bool,
    actions_execute_over_mcp: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct LocalActionLaneStatus {
    schema: String,
    contract_version: String,
    running: bool,
    base_url: String,
    mcp_url: String,
    mcp_protocol_version: String,
    mcp_server_version: String,
    mcp_tools: Vec<String>,
    session_id: String,
    client_id: String,
    client_label: String,
    expires_at_ms: u128,
    bind: String,
    enabled_by_default: bool,
    token_exposed: bool,
    token_persisted: bool,
    queue_persisted: bool,
    actions_execute_over_mcp: bool,
    pending_requests: usize,
    executing_request_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct LocalActionRequestView {
    schema: String,
    contract_version: String,
    request_id: String,
    session_id: String,
    client_id: String,
    client_label: String,
    action: String,
    state: String,
    created_at_ms: u128,
    updated_at_ms: u128,
    plan: Value,
    plan_sha256: String,
    human_decision: String,
    decision_channel: String,
    execution_confirmation_channel: String,
    capability_expires_at_ms: Option<u128>,
    capability_consumed: bool,
    result: Option<Value>,
    privacy: Value,
}

#[derive(Debug, Clone)]
struct FrozenModel {
    model: String,
    runtime: String,
    installed: bool,
    estimated_download_gb: Option<f64>,
    estimated_upper_gb: Option<f64>,
    required_free_gb: Option<f64>,
    benchmark_timeout_seconds: u64,
}

#[derive(Debug, Clone)]
struct FrozenExport {
    format: String,
    filename: String,
    destination: String,
    content: String,
    content_sha256: String,
}

struct ValidatedStartRequest {
    client_id: String,
    client_label: String,
    models: HashMap<String, FrozenModel>,
    export: Option<FrozenExport>,
    ttl_seconds: u64,
}

#[derive(Debug, Clone)]
struct ActionCapability {
    capability_id: String,
    capability_secret_sha256: String,
    plan_sha256: String,
    session_id: String,
    client_id: String,
    issued_at_ms: u128,
    expires_at_ms: u128,
    consumed_at_ms: Option<u128>,
}

#[derive(Debug, Clone)]
struct StoredActionRequest {
    request_id: String,
    session_id: String,
    client_id: String,
    client_label: String,
    action: String,
    state: String,
    created_at_ms: u128,
    updated_at_ms: u128,
    plan: Value,
    plan_sha256: String,
    human_decision: String,
    decision_channel: String,
    execution_confirmation_channel: String,
    capability: Option<ActionCapability>,
    result: Option<Value>,
}

struct ActionLaneRuntime {
    shutdown: Arc<AtomicBool>,
    alive: Arc<AtomicBool>,
    base_url: String,
    session_id: String,
    client_id: String,
    client_label: String,
    expires_at_ms: u128,
    models: HashMap<String, FrozenModel>,
    export: Option<FrozenExport>,
    requests: Vec<StoredActionRequest>,
    executing_request_id: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) enum LocalActionExecution {
    Install {
        request_id: String,
        plan_sha256: String,
        model: String,
        runtime: String,
        timeout_seconds: u64,
        required_free_gb: Option<f64>,
    },
    Benchmark {
        request_id: String,
        plan_sha256: String,
        model: String,
        runtime: String,
        timeout_seconds: u64,
    },
    Export {
        request_id: String,
        plan_sha256: String,
        format: String,
        filename: String,
        destination: String,
        content: String,
        content_sha256: String,
    },
}

impl LocalActionExecution {
    pub(crate) fn request_id(&self) -> &str {
        match self {
            Self::Install { request_id, .. }
            | Self::Benchmark { request_id, .. }
            | Self::Export { request_id, .. } => request_id,
        }
    }

    pub(crate) fn plan_sha256(&self) -> &str {
        match self {
            Self::Install { plan_sha256, .. }
            | Self::Benchmark { plan_sha256, .. }
            | Self::Export { plan_sha256, .. } => plan_sha256,
        }
    }
}

fn lane_state() -> &'static Mutex<Option<ActionLaneRuntime>> {
    LOCAL_ACTION_LANE.get_or_init(|| Mutex::new(None))
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn random_hex(bytes_len: usize) -> Result<String, String> {
    let mut bytes = vec![0_u8; bytes_len];
    getrandom::fill(&mut bytes)
        .map_err(|error| format!("Generation aleatoire locale impossible: {error}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn safe_identifier(value: &str, label: &str, max_len: usize) -> Result<String, String> {
    let clean = value.trim();
    if clean.is_empty()
        || clean.len() > max_len
        || !clean
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err(format!("{label} invalide."));
    }
    Ok(clean.to_string())
}

fn normalized_runtime(value: &str) -> Result<String, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "native" | "ollama" | "windows" | "linux" => Ok("native".to_string()),
        "wsl" | "ollama-wsl" => Ok("wsl".to_string()),
        _ => Err("Runtime local non autorise.".to_string()),
    }
}

fn finite_optional(value: Option<f64>, label: &str, max: f64) -> Result<Option<f64>, String> {
    match value {
        Some(number) if number.is_finite() && number >= 0.0 && number <= max => Ok(Some(number)),
        Some(_) => Err(format!("{label} invalide.")),
        None => Ok(None),
    }
}

fn model_key(model: &str, runtime: &str) -> String {
    format!("{}::{runtime}", model.trim().to_ascii_lowercase())
}

fn validate_filename(value: &str) -> Result<String, String> {
    let clean = value.trim();
    if clean.is_empty()
        || clean.len() > 120
        || clean.contains('/')
        || clean.contains('\\')
        || clean.contains("..")
        || !clean.ends_with(".md")
        || !clean
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err("Nom de fichier export invalide.".to_string());
    }
    Ok(clean.to_string())
}

fn validate_start_request(
    request: StartLocalActionLaneRequest,
) -> Result<ValidatedStartRequest, String> {
    if request.schema != ACTION_LANE_START_SCHEMA {
        return Err("Contrat de demarrage Action Lane invalide.".to_string());
    }
    let client_id = safe_identifier(&request.client.id, "Identifiant client", 80)?;
    let client_label = request
        .client
        .label
        .trim()
        .chars()
        .take(100)
        .collect::<String>();
    if client_label.is_empty() {
        return Err("Libelle client requis.".to_string());
    }
    if request.allowed_models.len() > MAX_MODELS {
        return Err("Trop de modeles dans le snapshot Action Lane.".to_string());
    }
    let mut models = HashMap::new();
    for candidate in request.allowed_models {
        let model = crate::validate_ollama_model_ref(&candidate.model)?;
        let runtime = normalized_runtime(&candidate.runtime)?;
        let estimated_download_gb =
            finite_optional(candidate.estimated_download_gb, "Taille estimee", 2_048.0)?;
        let estimated_upper_gb =
            finite_optional(candidate.estimated_upper_gb, "Taille haute", 2_048.0)?;
        let required_free_gb =
            finite_optional(candidate.required_free_gb, "Espace requis", 4_096.0)?;
        let benchmark_timeout_seconds = candidate
            .benchmark_timeout_seconds
            .unwrap_or(45)
            .clamp(5, 180);
        let key = model_key(&model, &runtime);
        if models.contains_key(&key) {
            return Err("Modele duplique dans le snapshot Action Lane.".to_string());
        }
        models.insert(
            key,
            FrozenModel {
                model,
                runtime,
                installed: candidate.installed,
                estimated_download_gb,
                estimated_upper_gb,
                required_free_gb,
                benchmark_timeout_seconds,
            },
        );
    }
    let export = request
        .export_snapshot
        .map(|snapshot| {
            if snapshot.format.trim() != "markdown" {
                return Err("Seul l'export Markdown est autorise en v0.".to_string());
            }
            let filename = validate_filename(&snapshot.filename)?;
            let destination = match snapshot.destination.trim() {
                "app_data" => "app_data".to_string(),
                "downloads" => "downloads".to_string(),
                _ => return Err("Destination export non autorisee.".to_string()),
            };
            if snapshot.content.is_empty() || snapshot.content.len() > MAX_EXPORT_BYTES {
                return Err("Contenu export absent ou trop volumineux.".to_string());
            }
            let content_sha256 = sha256_bytes(snapshot.content.as_bytes());
            Ok(FrozenExport {
                format: "markdown".to_string(),
                filename,
                destination,
                content: snapshot.content,
                content_sha256,
            })
        })
        .transpose()?;
    let ttl_seconds = request
        .ttl_seconds
        .unwrap_or(DEFAULT_SESSION_TTL_SECONDS)
        .clamp(MIN_SESSION_TTL_SECONDS, MAX_SESSION_TTL_SECONDS);
    Ok(ValidatedStartRequest {
        client_id,
        client_label,
        models,
        export,
        ttl_seconds,
    })
}

fn stop_runtime(runtime: &ActionLaneRuntime) {
    runtime.shutdown.store(true, Ordering::SeqCst);
}

fn terminal_state(state: &str) -> bool {
    matches!(
        state,
        "completed" | "failed" | "rejected" | "cancelled" | "expired"
    )
}

fn expire_capabilities(runtime: &mut ActionLaneRuntime, now: u128) {
    for request in &mut runtime.requests {
        if request.state == "approved"
            && request
                .capability
                .as_ref()
                .is_some_and(|capability| now >= capability.expires_at_ms)
        {
            request.state = "expired".to_string();
            request.updated_at_ms = now;
            request.human_decision = "capability_expired".to_string();
            request.decision_channel = "system_timeout".to_string();
            request.execution_confirmation_channel = "none".to_string();
        }
    }
}

fn stop_current_lane() -> Result<bool, String> {
    let mut guard = lane_state()
        .lock()
        .map_err(|_| "Etat Action Lane indisponible.".to_string())?;
    if let Some(runtime) = guard.as_ref() {
        stop_runtime(runtime);
        *guard = None;
        return Ok(true);
    }
    Ok(false)
}

fn stop_current_lane_if_idle() -> Result<bool, String> {
    let mut guard = lane_state()
        .lock()
        .map_err(|_| "Etat Action Lane indisponible.".to_string())?;
    if let Some(runtime) = guard.as_ref() {
        if runtime.executing_request_id.is_some() {
            return Err(
                "Une action locale est en cours. Attends son recu final avant d'arreter la session."
                    .to_string(),
            );
        }
        stop_runtime(runtime);
        *guard = None;
        return Ok(true);
    }
    Ok(false)
}

fn request_view(request: &StoredActionRequest) -> LocalActionRequestView {
    LocalActionRequestView {
        schema: "outilsia.local_action_request.v0".to_string(),
        contract_version: ACTION_LANE_CONTRACT_VERSION.to_string(),
        request_id: request.request_id.clone(),
        session_id: request.session_id.clone(),
        client_id: request.client_id.clone(),
        client_label: request.client_label.clone(),
        action: request.action.clone(),
        state: request.state.clone(),
        created_at_ms: request.created_at_ms,
        updated_at_ms: request.updated_at_ms,
        plan: request.plan.clone(),
        plan_sha256: request.plan_sha256.clone(),
        human_decision: request.human_decision.clone(),
        decision_channel: request.decision_channel.clone(),
        execution_confirmation_channel: request.execution_confirmation_channel.clone(),
        capability_expires_at_ms: request
            .capability
            .as_ref()
            .map(|capability| capability.expires_at_ms),
        capability_consumed: request
            .capability
            .as_ref()
            .is_some_and(|capability| capability.consumed_at_ms.is_some()),
        result: request.result.clone(),
        privacy: json!({
            "queue_persisted": false,
            "capability_secret_exposed": false,
            "raw_prompt_exposed": false,
            "raw_model_output_exposed": false,
            "export_content_exposed": false,
            "credentials_exposed": false
        }),
    }
}

fn status_snapshot() -> Result<LocalActionLaneStatus, String> {
    let mut guard = lane_state()
        .lock()
        .map_err(|_| "Etat Action Lane indisponible.".to_string())?;
    let now = unix_ms();
    let execution_in_progress = guard
        .as_ref()
        .is_some_and(|runtime| runtime.executing_request_id.is_some());
    let running = guard
        .as_ref()
        .map(|runtime| {
            execution_in_progress
                || (runtime.alive.load(Ordering::SeqCst)
                    && !runtime.shutdown.load(Ordering::SeqCst)
                    && now < runtime.expires_at_ms)
        })
        .unwrap_or(false);
    if !running {
        if let Some(runtime) = guard.as_ref() {
            stop_runtime(runtime);
        }
        *guard = None;
    } else if let Some(runtime) = guard.as_mut() {
        expire_capabilities(runtime, now);
    }
    let runtime = guard.as_ref();
    let base_url = runtime
        .map(|value| value.base_url.clone())
        .unwrap_or_default();
    Ok(LocalActionLaneStatus {
        schema: ACTION_LANE_SCHEMA.to_string(),
        contract_version: ACTION_LANE_CONTRACT_VERSION.to_string(),
        running,
        mcp_url: if base_url.is_empty() {
            String::new()
        } else {
            format!("{base_url}{MCP_PATH}")
        },
        base_url,
        mcp_protocol_version: MCP_PROTOCOL_VERSION.to_string(),
        mcp_server_version: MCP_SERVER_VERSION.to_string(),
        mcp_tools: ACTION_TOOL_NAMES
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
        session_id: runtime
            .map(|value| value.session_id.clone())
            .unwrap_or_default(),
        client_id: runtime
            .map(|value| value.client_id.clone())
            .unwrap_or_default(),
        client_label: runtime
            .map(|value| value.client_label.clone())
            .unwrap_or_default(),
        expires_at_ms: runtime.map(|value| value.expires_at_ms).unwrap_or_default(),
        bind: "127.0.0.1".to_string(),
        enabled_by_default: false,
        token_exposed: false,
        token_persisted: false,
        queue_persisted: false,
        actions_execute_over_mcp: false,
        pending_requests: runtime
            .map(|value| {
                value
                    .requests
                    .iter()
                    .filter(|request| !terminal_state(&request.state))
                    .count()
            })
            .unwrap_or_default(),
        executing_request_id: runtime.and_then(|value| value.executing_request_id.clone()),
    })
}

#[tauri::command]
pub(crate) fn start_local_action_lane(
    request: StartLocalActionLaneRequest,
) -> Result<LocalActionLaneStart, String> {
    let ValidatedStartRequest {
        client_id,
        client_label,
        models,
        export,
        ttl_seconds,
    } = validate_start_request(request)?;
    let server = Server::http(("127.0.0.1", 0))
        .map_err(|error| format!("Ouverture Action Lane impossible: {error}"))?;
    let port = server
        .server_addr()
        .to_ip()
        .ok_or_else(|| "Adresse TCP Action Lane indisponible.".to_string())?
        .port();
    let base_url = format!("http://127.0.0.1:{port}");
    let mcp_url = format!("{base_url}{MCP_PATH}");
    let token = random_hex(32)?;
    let session_id = format!("als-{}", random_hex(12)?);
    let expires_at_ms = unix_ms() + u128::from(ttl_seconds) * 1000;
    let shutdown = Arc::new(AtomicBool::new(false));
    let alive = Arc::new(AtomicBool::new(false));

    stop_current_lane_if_idle()?;
    {
        let mut guard = lane_state()
            .lock()
            .map_err(|_| "Etat Action Lane indisponible.".to_string())?;
        *guard = Some(ActionLaneRuntime {
            shutdown: Arc::clone(&shutdown),
            alive: Arc::clone(&alive),
            base_url: base_url.clone(),
            session_id: session_id.clone(),
            client_id: client_id.clone(),
            client_label: client_label.clone(),
            expires_at_ms,
            models,
            export,
            requests: Vec::new(),
            executing_request_id: None,
        });
    }

    let server_token = token.clone();
    let server_session_id = session_id.clone();
    let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
    thread::spawn(move || {
        alive.store(true, Ordering::SeqCst);
        let _ = ready_sender.send(());
        serve_lane(
            server,
            server_token,
            server_session_id,
            expires_at_ms,
            shutdown,
            &alive,
        );
        alive.store(false, Ordering::SeqCst);
    });
    if ready_receiver.recv_timeout(Duration::from_secs(1)).is_err() {
        stop_current_lane()?;
        return Err("Demarrage Action Lane non confirme.".to_string());
    }

    Ok(LocalActionLaneStart {
        schema: ACTION_LANE_SCHEMA.to_string(),
        contract_version: ACTION_LANE_CONTRACT_VERSION.to_string(),
        running: true,
        base_url,
        mcp_url,
        mcp_protocol_version: MCP_PROTOCOL_VERSION.to_string(),
        mcp_server_version: MCP_SERVER_VERSION.to_string(),
        mcp_tools: ACTION_TOOL_NAMES
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
        token,
        session_id,
        client_id,
        client_label,
        expires_at_ms,
        ttl_seconds,
        bind: "127.0.0.1".to_string(),
        enabled_by_default: false,
        token_persisted: false,
        queue_persisted: false,
        actions_execute_over_mcp: false,
    })
}

#[tauri::command]
pub(crate) fn stop_local_action_lane() -> Result<LocalActionLaneStatus, String> {
    stop_current_lane_if_idle()?;
    status_snapshot()
}

#[tauri::command]
pub(crate) fn get_local_action_lane_status() -> Result<LocalActionLaneStatus, String> {
    status_snapshot()
}

#[tauri::command]
pub(crate) fn list_local_action_requests() -> Result<Vec<LocalActionRequestView>, String> {
    let mut guard = lane_state()
        .lock()
        .map_err(|_| "Etat Action Lane indisponible.".to_string())?;
    let runtime = guard
        .as_mut()
        .ok_or_else(|| "Action Lane arretee.".to_string())?;
    expire_capabilities(runtime, unix_ms());
    Ok(runtime.requests.iter().rev().map(request_view).collect())
}

fn native_action_target_summary(stored: &StoredActionRequest) -> Result<String, String> {
    let target = stored
        .plan
        .get("target")
        .ok_or_else(|| "Cible d'action absente.".to_string())?;
    match stored.action.as_str() {
        "install_model" | "benchmark_model" => {
            let model = target
                .get("model")
                .and_then(Value::as_str)
                .ok_or_else(|| "Modele du plan absent.".to_string())?;
            let runtime = match target.get("runtime").and_then(Value::as_str) {
                Some("wsl") => "Ollama WSL",
                Some("native") => "Ollama Windows/Linux natif",
                _ => return Err("Runtime du plan invalide.".to_string()),
            };
            Ok(format!("Modele : {model}\nRuntime : {runtime}"))
        }
        "export_report" => {
            let filename = target
                .get("filename")
                .and_then(Value::as_str)
                .ok_or_else(|| "Nom du rapport absent.".to_string())?;
            let destination = match target.get("destination").and_then(Value::as_str) {
                Some("downloads") => "Telechargements / OutilsIA",
                Some("app_data") => "Dossier securise OutilsIA",
                _ => return Err("Destination export invalide.".to_string()),
            };
            let content_sha256 = target
                .get("content_sha256")
                .and_then(Value::as_str)
                .filter(|value| is_sha256(value))
                .ok_or_else(|| "Empreinte du rapport invalide.".to_string())?;
            Ok(format!(
                "Fichier : {filename}\nDestination : {destination}\nContenu SHA-256 : {content_sha256}"
            ))
        }
        _ => Err("Action locale non autorisee.".to_string()),
    }
}

pub(crate) fn local_action_native_confirmation_prompt(
    request_id: &str,
    plan_sha256: &str,
    kind: NativeActionConfirmationKind,
) -> Result<NativeActionConfirmationPrompt, String> {
    if !is_sha256(plan_sha256) {
        return Err("Empreinte de plan invalide.".to_string());
    }
    let mut guard = lane_state()
        .lock()
        .map_err(|_| "Etat Action Lane indisponible.".to_string())?;
    let runtime = guard
        .as_mut()
        .ok_or_else(|| "Action Lane arretee.".to_string())?;
    expire_capabilities(runtime, unix_ms());
    let stored = runtime
        .requests
        .iter()
        .find(|stored| stored.request_id == request_id)
        .ok_or_else(|| "Demande Action Lane introuvable.".to_string())?;
    if !constant_time_eq(&stored.plan_sha256, plan_sha256) {
        return Err("Le plan affiche a ete modifie ou remplace.".to_string());
    }
    match kind {
        NativeActionConfirmationKind::Approval if stored.state != "awaiting_human" => {
            return Err(format!(
                "Demande non approuvable dans l'etat {}.",
                stored.state
            ));
        }
        NativeActionConfirmationKind::Execution if stored.state != "approved" => {
            return Err(format!(
                "Demande non executable dans l'etat {}.",
                stored.state
            ));
        }
        NativeActionConfirmationKind::Rejection
            if !matches!(stored.state.as_str(), "awaiting_human" | "approved") =>
        {
            return Err(format!(
                "Demande non refusable dans l'etat {}.",
                stored.state
            ));
        }
        _ => {}
    }
    let action = match stored.action.as_str() {
        "install_model" => "Installer un modele Ollama",
        "benchmark_model" => "Benchmarker un modele installe",
        "export_report" => "Exporter le rapport fige",
        _ => return Err("Action locale non autorisee.".to_string()),
    };
    let target = native_action_target_summary(stored)?;
    let (title, consequence, confirm_label) = match kind {
        NativeActionConfirmationKind::Approval => (
            "Autorisation systeme OutilsIA",
            "Ce plan exact sera autorise pendant 2 minutes. Il ne sera pas encore execute.",
            "Autoriser 2 min",
        ),
        NativeActionConfirmationKind::Execution => (
            "Derniere confirmation systeme",
            "La capacite sera consommee une seule fois et l'action demarrera immediatement.",
            "Executer maintenant",
        ),
        NativeActionConfirmationKind::Rejection => (
            "Refus systeme OutilsIA",
            "La demande sera refusee et toute capacite associee sera revoquee.",
            "Refuser et revoquer",
        ),
    };
    Ok(NativeActionConfirmationPrompt {
        title: title.to_string(),
        message: format!(
            "{action}\n\n{target}\n\nPlan SHA-256 :\n{}\n\n{consequence}\n\nCette decision est recue par une boite de dialogue du systeme, hors de la page web.",
            stored.plan_sha256
        ),
        confirm_label: confirm_label.to_string(),
        cancel_label: "Annuler".to_string(),
    })
}

pub(crate) fn approve_local_action_request_after_native_dialog(
    request: ApproveLocalActionRequest,
    evidence: NativeActionConfirmationKind,
) -> Result<LocalActionRequestView, String> {
    if request.schema != ACTION_APPROVAL_SCHEMA
        || evidence != NativeActionConfirmationKind::Approval
    {
        return Err("Confirmation systeme d'autorisation requise.".to_string());
    }
    if !is_sha256(&request.plan_sha256) {
        return Err("Empreinte de plan invalide.".to_string());
    }
    let now = unix_ms();
    let mut guard = lane_state()
        .lock()
        .map_err(|_| "Etat Action Lane indisponible.".to_string())?;
    let runtime = guard
        .as_mut()
        .ok_or_else(|| "Action Lane arretee.".to_string())?;
    expire_capabilities(runtime, now);
    let stored = runtime
        .requests
        .iter_mut()
        .find(|stored| stored.request_id == request.request_id)
        .ok_or_else(|| "Demande Action Lane introuvable.".to_string())?;
    if stored.state != "awaiting_human" {
        return Err(format!(
            "Demande non approuvable dans l'etat {}.",
            stored.state
        ));
    }
    if !constant_time_eq(&stored.plan_sha256, &request.plan_sha256) {
        return Err("Le plan affiche a ete modifie ou remplace.".to_string());
    }
    let capability_secret = random_hex(32)?;
    stored.capability = Some(ActionCapability {
        capability_id: format!("cap-{}", random_hex(12)?),
        capability_secret_sha256: sha256_bytes(capability_secret.as_bytes()),
        plan_sha256: stored.plan_sha256.clone(),
        session_id: stored.session_id.clone(),
        client_id: stored.client_id.clone(),
        issued_at_ms: now,
        expires_at_ms: now + CAPABILITY_TTL_MS,
        consumed_at_ms: None,
    });
    stored.state = "approved".to_string();
    stored.human_decision = "explicitly_approved_in_native_ui".to_string();
    stored.decision_channel = "os_native_dialog".to_string();
    stored.execution_confirmation_channel = "none".to_string();
    stored.updated_at_ms = now;
    Ok(request_view(stored))
}

pub(crate) fn reject_local_action_request_after_native_dialog(
    request: RejectLocalActionRequest,
    evidence: NativeActionConfirmationKind,
) -> Result<Value, String> {
    if request.schema != ACTION_REJECTION_SCHEMA
        || evidence != NativeActionConfirmationKind::Rejection
    {
        return Err("Confirmation systeme de refus requise.".to_string());
    }
    if !is_sha256(&request.plan_sha256) {
        return Err("Empreinte de plan invalide.".to_string());
    }
    let now = unix_ms();
    let mut guard = lane_state()
        .lock()
        .map_err(|_| "Etat Action Lane indisponible.".to_string())?;
    let runtime = guard
        .as_mut()
        .ok_or_else(|| "Action Lane arretee.".to_string())?;
    let stored = runtime
        .requests
        .iter_mut()
        .find(|stored| stored.request_id == request.request_id)
        .ok_or_else(|| "Demande Action Lane introuvable.".to_string())?;
    if !matches!(stored.state.as_str(), "awaiting_human" | "approved") {
        return Err(format!(
            "Demande non refusable dans l'etat {}.",
            stored.state
        ));
    }
    if !constant_time_eq(&stored.plan_sha256, &request.plan_sha256) {
        return Err("Le plan affiche a ete modifie ou remplace.".to_string());
    }
    stored.state = "rejected".to_string();
    stored.human_decision = "explicitly_rejected_in_native_ui".to_string();
    stored.decision_channel = "os_native_dialog".to_string();
    stored.execution_confirmation_channel = "none".to_string();
    stored.capability = None;
    stored.updated_at_ms = now;
    stored.result = Some(json!({
        "success": false,
        "reason": request.reason.unwrap_or_else(|| "human_rejected".to_string()).chars().take(160).collect::<String>()
    }));
    let view = request_view(stored);
    Ok(json!({
        "request": view,
        "receipt": build_receipt(stored, false, 0)?
    }))
}

pub(crate) fn begin_local_action_execution(
    request_id: &str,
    plan_sha256: &str,
    evidence: NativeActionConfirmationKind,
) -> Result<LocalActionExecution, String> {
    if evidence != NativeActionConfirmationKind::Execution {
        return Err("Confirmation systeme d'execution requise.".to_string());
    }
    let now = unix_ms();
    let mut guard = lane_state()
        .lock()
        .map_err(|_| "Etat Action Lane indisponible.".to_string())?;
    let runtime = guard
        .as_mut()
        .ok_or_else(|| "Action Lane arretee.".to_string())?;
    expire_capabilities(runtime, now);
    if let Some(active) = runtime.executing_request_id.as_deref() {
        return Err(format!("Une action locale est deja en cours: {active}."));
    }
    let request_index = runtime
        .requests
        .iter()
        .position(|stored| stored.request_id == request_id)
        .ok_or_else(|| "Demande Action Lane introuvable.".to_string())?;
    let execution = {
        let stored = &runtime.requests[request_index];
        if stored.state != "approved" {
            return Err(format!(
                "Demande non executable dans l'etat {}.",
                stored.state
            ));
        }
        if !is_sha256(plan_sha256) || !constant_time_eq(&stored.plan_sha256, plan_sha256) {
            return Err("Empreinte de plan refusee.".to_string());
        }
        let capability = stored
            .capability
            .as_ref()
            .ok_or_else(|| "Capacite locale absente.".to_string())?;
        if capability.consumed_at_ms.is_some() {
            return Err("Capacite locale deja consommee.".to_string());
        }
        if now >= capability.expires_at_ms {
            return Err("Capacite locale expiree.".to_string());
        }
        if !constant_time_eq(&capability.plan_sha256, &stored.plan_sha256)
            || capability.session_id != runtime.session_id
            || capability.client_id != runtime.client_id
            || !is_sha256(&capability.capability_secret_sha256)
            || capability.capability_id.is_empty()
            || capability.issued_at_ms > now
        {
            return Err("Liaison de capacite locale invalide.".to_string());
        }

        let target = stored
            .plan
            .get("target")
            .ok_or_else(|| "Cible d'action absente.".to_string())?;
        match stored.action.as_str() {
            "install_model" => LocalActionExecution::Install {
                request_id: stored.request_id.clone(),
                plan_sha256: stored.plan_sha256.clone(),
                model: target
                    .get("model")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "Modele du plan absent.".to_string())?
                    .to_string(),
                runtime: target
                    .get("runtime")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "Runtime du plan absent.".to_string())?
                    .to_string(),
                timeout_seconds: stored
                    .plan
                    .pointer("/limits/timeout_seconds")
                    .and_then(Value::as_u64)
                    .unwrap_or(1800),
                required_free_gb: stored
                    .plan
                    .pointer("/preflight/required_free_gb")
                    .and_then(Value::as_f64),
            },
            "benchmark_model" => LocalActionExecution::Benchmark {
                request_id: stored.request_id.clone(),
                plan_sha256: stored.plan_sha256.clone(),
                model: target
                    .get("model")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "Modele du plan absent.".to_string())?
                    .to_string(),
                runtime: target
                    .get("runtime")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "Runtime du plan absent.".to_string())?
                    .to_string(),
                timeout_seconds: stored
                    .plan
                    .pointer("/limits/timeout_seconds")
                    .and_then(Value::as_u64)
                    .unwrap_or(45),
            },
            "export_report" => {
                let export = runtime
                    .export
                    .as_ref()
                    .ok_or_else(|| "Snapshot export indisponible.".to_string())?;
                if target.get("content_sha256").and_then(Value::as_str)
                    != Some(export.content_sha256.as_str())
                {
                    return Err("Le contenu export ne correspond plus au plan.".to_string());
                }
                LocalActionExecution::Export {
                    request_id: stored.request_id.clone(),
                    plan_sha256: stored.plan_sha256.clone(),
                    format: export.format.clone(),
                    filename: export.filename.clone(),
                    destination: export.destination.clone(),
                    content: export.content.clone(),
                    content_sha256: export.content_sha256.clone(),
                }
            }
            _ => return Err("Action locale non autorisee.".to_string()),
        }
    };

    let stored = &mut runtime.requests[request_index];
    stored
        .capability
        .as_mut()
        .ok_or_else(|| "Capacite locale absente.".to_string())?
        .consumed_at_ms = Some(now);
    stored.state = "executing".to_string();
    stored.execution_confirmation_channel = "os_native_dialog".to_string();
    stored.updated_at_ms = now;
    runtime.executing_request_id = Some(stored.request_id.clone());
    Ok(execution)
}

pub(crate) fn finish_local_action_execution(
    request_id: &str,
    success: bool,
    elapsed_ms: u128,
    result: Value,
) -> Result<(LocalActionRequestView, Value), String> {
    let now = unix_ms();
    let mut guard = lane_state()
        .lock()
        .map_err(|_| "Etat Action Lane indisponible.".to_string())?;
    let runtime = guard
        .as_mut()
        .ok_or_else(|| "Action Lane arretee.".to_string())?;
    if runtime.executing_request_id.as_deref() != Some(request_id) {
        return Err("Action en cours incoherente.".to_string());
    }
    let stored = runtime
        .requests
        .iter_mut()
        .find(|stored| stored.request_id == request_id)
        .ok_or_else(|| "Demande Action Lane introuvable.".to_string())?;
    if stored.state != "executing" {
        return Err("Action locale non marquee en execution.".to_string());
    }
    stored.state = if success { "completed" } else { "failed" }.to_string();
    stored.updated_at_ms = now;
    stored.result = Some(sanitize_execution_result(&stored.action, success, result));
    runtime.executing_request_id = None;
    let receipt = build_receipt(stored, true, elapsed_ms)?;
    Ok((request_view(stored), receipt))
}

fn sanitize_execution_result(action: &str, success: bool, result: Value) -> Value {
    let mut clean = Map::new();
    clean.insert("success".to_string(), Value::Bool(success));
    match action {
        "install_model" => {
            clean.insert(
                "model".to_string(),
                result.get("model").cloned().unwrap_or(Value::Null),
            );
            clean.insert(
                "elapsed_ms".to_string(),
                result.get("elapsed_ms").cloned().unwrap_or(Value::Null),
            );
        }
        "benchmark_model" => {
            for key in [
                "model",
                "elapsed_ms",
                "estimated_tokens_per_second",
                "measurement_source",
                "runtime_gpu_offload_percent",
                "runtime_processor",
            ] {
                clean.insert(
                    key.to_string(),
                    result.get(key).cloned().unwrap_or(Value::Null),
                );
            }
        }
        "export_report" => {
            for key in [
                "format",
                "filename",
                "destination",
                "content_sha256",
                "bytes_written",
            ] {
                clean.insert(
                    key.to_string(),
                    result.get(key).cloned().unwrap_or(Value::Null),
                );
            }
        }
        _ => {}
    }
    Value::Object(clean)
}

fn build_receipt(
    request: &StoredActionRequest,
    execution_started: bool,
    elapsed_ms: u128,
) -> Result<Value, String> {
    let capability = request.capability.as_ref();
    let target = request.plan.get("target").cloned().unwrap_or(Value::Null);
    let target_claims = match request.action.as_str() {
        "install_model" | "benchmark_model" => json!({
            "model": target.get("model").cloned().unwrap_or(Value::Null),
            "runtime": target.get("runtime").cloned().unwrap_or(Value::Null)
        }),
        "export_report" => json!({
            "format": target.get("format").cloned().unwrap_or(Value::Null),
            "filename": target.get("filename").cloned().unwrap_or(Value::Null),
            "destination": target.get("destination").cloned().unwrap_or(Value::Null),
            "content_sha256": target.get("content_sha256").cloned().unwrap_or(Value::Null)
        }),
        _ => Value::Null,
    };
    let success = request
        .result
        .as_ref()
        .and_then(|value| value.get("success"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let mut receipt = json!({
        "schema": ACTION_RECEIPT_SCHEMA,
        "contract_version": ACTION_LANE_CONTRACT_VERSION,
        "receipt_id": format!("lar-{}", random_hex(12)?),
        "request_id": request.request_id,
        "session_id_sha256": sha256_bytes(request.session_id.as_bytes()),
        "client_id": request.client_id,
        "action": request.action,
        "state": request.state,
        "plan_sha256": request.plan_sha256,
        "target": target_claims,
        "capability": {
            "issued": capability.is_some(),
            "issued_at_ms": capability.map(|value| value.issued_at_ms),
            "expires_at_ms": capability.map(|value| value.expires_at_ms),
            "consumed_at_ms": capability.and_then(|value| value.consumed_at_ms),
            "secret_stored": false,
            "secret_exposed": false
        },
        "human_decision": {
            "status": request.human_decision,
            "channel": request.decision_channel,
            "native_ui": request.decision_channel == "os_native_dialog"
        },
        "execution": {
            "started": execution_started,
            "success": success,
            "elapsed_ms": elapsed_ms,
            "confirmation_channel": request.execution_confirmation_channel,
            "native_ui_confirmed": request.execution_confirmation_channel == "os_native_dialog"
        },
        "result": request.result.clone().unwrap_or(Value::Null),
        "privacy": {
            "raw_source_stored": false,
            "raw_prompt_stored": false,
            "raw_model_output_stored": false,
            "credentials_stored": false,
            "export_content_stored": false,
            "capability_secret_stored": false
        }
    });
    let digest = canonical_sha256(&receipt);
    receipt["integrity"] = json!({
        "algorithm": "SHA-256",
        "canonicalization": "recursive-key-sort-json-v1",
        "scope": "canonical_document_without_integrity",
        "digest": digest
    });
    Ok(receipt)
}

fn prepare_action(
    session_id: &str,
    tool_name: &str,
    arguments: &Value,
) -> Result<LocalActionRequestView, String> {
    let arguments = arguments
        .as_object()
        .ok_or_else(|| "Arguments d'action requis.".to_string())?;
    let snapshot = {
        let guard = lane_state()
            .lock()
            .map_err(|_| "Etat Action Lane indisponible.".to_string())?;
        let runtime = guard
            .as_ref()
            .ok_or_else(|| "Action Lane arretee.".to_string())?;
        if runtime.session_id != session_id || unix_ms() >= runtime.expires_at_ms {
            return Err("Session Action Lane invalide ou expiree.".to_string());
        }
        if runtime.requests.len() >= MAX_REQUESTS_PER_SESSION {
            return Err("File Action Lane pleine.".to_string());
        }
        (
            runtime.client_id.clone(),
            runtime.client_label.clone(),
            runtime.models.clone(),
            runtime.export.clone(),
        )
    };
    let (client_id, client_label, models, export) = snapshot;
    let now = unix_ms();
    let (action, plan) = match tool_name {
        "outilsia_prepare_model_install" => {
            reject_unknown_arguments(arguments, &["model", "runtime"])?;
            let selected = select_model(arguments, &models, false)?;
            if selected.installed {
                return Err(
                    "Ce modele etait deja installe dans le snapshot fige au demarrage.".to_string(),
                );
            }
            (
                "install_model".to_string(),
                json!({
                    "schema": "outilsia.local_action_plan.v0",
                    "contract_version": ACTION_LANE_CONTRACT_VERSION,
                    "action": "install_model",
                    "target": {
                        "model": selected.model,
                        "runtime": selected.runtime
                    },
                    "preflight": {
                        "snapshot_source": "frozen_at_lane_start",
                        "snapshot_model_installed": false,
                        "live_probes_run_during_prepare": false,
                        "native_preflight_required_before_execution": true,
                        "runtime_ready": null,
                        "model_already_installed": null,
                        "storage_free_gb": null,
                        "storage_scope": null,
                        "storage_source": null,
                        "storage_path_exposed": false,
                        "estimated_download_gb": selected.estimated_download_gb,
                        "estimated_upper_gb": selected.estimated_upper_gb,
                        "required_free_gb": selected.required_free_gb,
                        "storage_warning": true
                    },
                    "effects": ["download_model_layers", "write_ollama_model_store"],
                    "limits": {
                        "timeout_seconds": 1800,
                        "shell_exposed": false,
                        "arbitrary_url_exposed": false,
                        "arbitrary_path_exposed": false
                    },
                    "consent": {
                        "human_required": true,
                        "client_cannot_approve": true,
                        "capability_ttl_seconds": 120,
                        "one_use": true
                    }
                }),
            )
        }
        "outilsia_prepare_benchmark" => {
            reject_unknown_arguments(arguments, &["model", "runtime"])?;
            let selected = select_model(arguments, &models, true)?;
            if !selected.installed {
                return Err(
                    "Le benchmark exige un modele present dans le snapshot fige au demarrage."
                        .to_string(),
                );
            }
            (
                "benchmark_model".to_string(),
                json!({
                    "schema": "outilsia.local_action_plan.v0",
                    "contract_version": ACTION_LANE_CONTRACT_VERSION,
                    "action": "benchmark_model",
                    "target": {
                        "model": selected.model,
                        "runtime": selected.runtime,
                        "protocol": "outilsia.local_action_benchmark.v1",
                        "prompt_profile": "fixed_short_french_v1"
                    },
                    "preflight": {
                        "snapshot_source": "frozen_at_lane_start",
                        "snapshot_model_installed": true,
                        "live_probes_run_during_prepare": false,
                        "native_installed_check_required_before_execution": true
                    },
                    "effects": ["load_model", "run_fixed_benchmark", "measure_generation"],
                    "limits": {
                        "timeout_seconds": selected.benchmark_timeout_seconds,
                        "downloads": 0,
                        "prompt_from_client": false,
                        "raw_output_returned_to_client": false
                    },
                    "consent": {
                        "human_required": true,
                        "client_cannot_approve": true,
                        "capability_ttl_seconds": 120,
                        "one_use": true
                    }
                }),
            )
        }
        "outilsia_prepare_report_export" => {
            reject_unknown_arguments(arguments, &["format"])?;
            if arguments
                .get("format")
                .and_then(Value::as_str)
                .is_some_and(|value| value != "markdown")
            {
                return Err("Seul le format markdown est autorise en v0.".to_string());
            }
            let selected =
                export.ok_or_else(|| "Aucun rapport fige dans l'application.".to_string())?;
            (
                "export_report".to_string(),
                json!({
                    "schema": "outilsia.local_action_plan.v0",
                    "contract_version": ACTION_LANE_CONTRACT_VERSION,
                    "action": "export_report",
                    "target": {
                        "format": selected.format,
                        "filename": selected.filename,
                        "destination": selected.destination,
                        "content_sha256": selected.content_sha256
                    },
                    "effects": ["write_one_markdown_file"],
                    "limits": {
                        "bytes": selected.content.len(),
                        "destination_chosen_in_app": true,
                        "path_from_client": false,
                        "content_from_client": false
                    },
                    "consent": {
                        "human_required": true,
                        "client_cannot_approve": true,
                        "capability_ttl_seconds": 120,
                        "one_use": true
                    }
                }),
            )
        }
        _ => return Err("Outil Action Lane inconnu.".to_string()),
    };
    let plan_sha256 = canonical_sha256(&plan);
    let stored = StoredActionRequest {
        request_id: format!("larq-{}", random_hex(12)?),
        session_id: session_id.to_string(),
        client_id,
        client_label,
        action,
        state: "awaiting_human".to_string(),
        created_at_ms: now,
        updated_at_ms: now,
        plan,
        plan_sha256,
        human_decision: "not_recorded".to_string(),
        decision_channel: "none".to_string(),
        execution_confirmation_channel: "none".to_string(),
        capability: None,
        result: None,
    };
    let view = request_view(&stored);
    let mut guard = lane_state()
        .lock()
        .map_err(|_| "Etat Action Lane indisponible.".to_string())?;
    let runtime = guard
        .as_mut()
        .ok_or_else(|| "Action Lane arretee.".to_string())?;
    if runtime.session_id != session_id || unix_ms() >= runtime.expires_at_ms {
        return Err("Session Action Lane remplacee pendant le preflight.".to_string());
    }
    runtime.requests.push(stored);
    Ok(view)
}

fn reject_unknown_arguments(
    arguments: &Map<String, Value>,
    allowed: &[&str],
) -> Result<(), String> {
    let allowed = allowed.iter().copied().collect::<HashSet<_>>();
    if arguments.keys().any(|key| !allowed.contains(key.as_str())) {
        return Err("Argument non autorise dans le plan Action Lane.".to_string());
    }
    Ok(())
}

fn select_model(
    arguments: &Map<String, Value>,
    models: &HashMap<String, FrozenModel>,
    must_be_installed: bool,
) -> Result<FrozenModel, String> {
    let model = crate::validate_ollama_model_ref(
        arguments
            .get("model")
            .and_then(Value::as_str)
            .ok_or_else(|| "Modele requis.".to_string())?,
    )?;
    let requested_runtime = arguments
        .get("runtime")
        .and_then(Value::as_str)
        .map(normalized_runtime)
        .transpose()?;
    let mut matches = models
        .values()
        .filter(|candidate| candidate.model.eq_ignore_ascii_case(&model))
        .filter(|candidate| {
            requested_runtime
                .as_ref()
                .is_none_or(|runtime| &candidate.runtime == runtime)
        })
        .filter(|candidate| !must_be_installed || candidate.installed)
        .cloned()
        .collect::<Vec<_>>();
    if matches.len() != 1 {
        return Err(if matches.is_empty() {
            "Modele absent du snapshot autorise par l'application.".to_string()
        } else {
            "Runtime requis car ce modele existe dans plusieurs runtimes.".to_string()
        });
    }
    Ok(matches.remove(0))
}

fn get_request_for_client(
    session_id: &str,
    request_id: &str,
) -> Result<LocalActionRequestView, String> {
    let mut guard = lane_state()
        .lock()
        .map_err(|_| "Etat Action Lane indisponible.".to_string())?;
    let runtime = guard
        .as_mut()
        .ok_or_else(|| "Action Lane arretee.".to_string())?;
    if runtime.session_id != session_id {
        return Err("Session Action Lane invalide.".to_string());
    }
    expire_capabilities(runtime, unix_ms());
    runtime
        .requests
        .iter()
        .find(|request| request.request_id == request_id)
        .map(request_view)
        .ok_or_else(|| "Demande Action Lane introuvable.".to_string())
}

fn cancel_request_for_client(
    session_id: &str,
    request_id: &str,
) -> Result<LocalActionRequestView, String> {
    let mut guard = lane_state()
        .lock()
        .map_err(|_| "Etat Action Lane indisponible.".to_string())?;
    let runtime = guard
        .as_mut()
        .ok_or_else(|| "Action Lane arretee.".to_string())?;
    if runtime.session_id != session_id {
        return Err("Session Action Lane invalide.".to_string());
    }
    let stored = runtime
        .requests
        .iter_mut()
        .find(|request| request.request_id == request_id)
        .ok_or_else(|| "Demande Action Lane introuvable.".to_string())?;
    if !matches!(stored.state.as_str(), "awaiting_human" | "approved") {
        return Err(format!(
            "Demande non annulable dans l'etat {}.",
            stored.state
        ));
    }
    stored.state = "cancelled".to_string();
    stored.human_decision = "cancelled_by_requesting_client".to_string();
    stored.decision_channel = "mcp_requesting_client".to_string();
    stored.execution_confirmation_channel = "none".to_string();
    stored.capability = None;
    stored.updated_at_ms = unix_ms();
    Ok(request_view(stored))
}

fn serve_lane(
    server: Server,
    token: String,
    session_id: String,
    expires_at_ms: u128,
    shutdown: Arc<AtomicBool>,
    alive: &Arc<AtomicBool>,
) {
    let mut request_count = 0_usize;
    while !shutdown.load(Ordering::SeqCst) && unix_ms() < expires_at_ms {
        match server.recv_timeout(Duration::from_millis(50)) {
            Ok(Some(mut request)) => {
                request_count += 1;
                let response = if !request
                    .remote_addr()
                    .is_some_and(|peer| peer.ip().is_loopback())
                {
                    json_response(403, "Forbidden", &json!({"error": "loopback_only"}), false)
                } else if request_count > MAX_HTTP_REQUESTS_PER_SESSION {
                    json_response(
                        429,
                        "Too Many Requests",
                        &json!({"error": "session_request_limit"}),
                        false,
                    )
                } else {
                    match read_request(&mut request, MAX_REQUEST_BYTES) {
                        Ok(request) => {
                            response_for_request(&request, &token, &session_id, expires_at_ms)
                        }
                        Err(error) => {
                            json_response(400, "Bad Request", &json!({"error": error}), false)
                        }
                    }
                };
                let _ = request.respond(tiny_response(response));
            }
            Ok(None) => {}
            Err(_) => thread::sleep(Duration::from_millis(25)),
        }
    }
    alive.store(false, Ordering::SeqCst);
}

fn response_for_request(
    request: &HttpRequest,
    token: &str,
    session_id: &str,
    expires_at_ms: u128,
) -> Vec<u8> {
    if !request
        .headers
        .get("host")
        .is_some_and(|value| allowed_host(value))
    {
        return json_response(
            421,
            "Misdirected Request",
            &json!({"error": "loopback_host_required"}),
            false,
        );
    }
    if request
        .headers
        .get("origin")
        .is_some_and(|value| !allowed_origin(value))
    {
        return json_response(
            403,
            "Forbidden",
            &json!({"error": "origin_not_allowed"}),
            false,
        );
    }
    if request.path.contains('?') {
        return json_response(
            400,
            "Bad Request",
            &json!({"error": "query_parameters_forbidden"}),
            false,
        );
    }
    if request.path == "/v1/health" && request.method == "GET" {
        return json_response(
            200,
            "OK",
            &json!({
                "schema": "outilsia.local_action_lane_health.v0",
                "status": "ready",
                "bind": "127.0.0.1",
                "actions_execute_over_mcp": false,
                "expires_at_ms": expires_at_ms
            }),
            false,
        );
    }
    if request.path != MCP_PATH {
        return json_response(
            404,
            "Not Found",
            &json!({"error": "endpoint_not_found"}),
            false,
        );
    }
    if request.method != "POST" {
        return json_response(
            405,
            "Method Not Allowed",
            &json!({"error": "streamable_http_post_required"}),
            false,
        );
    }
    if !authorized(request, token) {
        return json_response(
            401,
            "Unauthorized",
            &json!({"error": "bearer_token_required"}),
            true,
        );
    }
    if !request
        .headers
        .get("content-type")
        .is_some_and(|value| value.to_ascii_lowercase().starts_with("application/json"))
    {
        return json_response(
            415,
            "Unsupported Media Type",
            &json!({"error": "application_json_required"}),
            false,
        );
    }
    mcp_response_for_request(request, session_id)
}

fn mcp_response_for_request(request: &HttpRequest, session_id: &str) -> Vec<u8> {
    let message = match serde_json::from_slice::<Value>(&request.body) {
        Ok(value) => value,
        Err(_) => {
            return json_response(
                200,
                "OK",
                &mcp_rpc_error(Value::Null, -32700, "JSON-RPC parse error"),
                false,
            )
        }
    };
    let Some(object) = message.as_object() else {
        return json_response(
            200,
            "OK",
            &mcp_rpc_error(Value::Null, -32600, "Invalid JSON-RPC request"),
            false,
        );
    };
    if object.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return json_response(
            200,
            "OK",
            &mcp_rpc_error(
                object.get("id").cloned().unwrap_or(Value::Null),
                -32600,
                "JSON-RPC 2.0 required",
            ),
            false,
        );
    }
    let Some(method) = object.get("method").and_then(Value::as_str) else {
        return json_response(
            200,
            "OK",
            &mcp_rpc_error(
                object.get("id").cloned().unwrap_or(Value::Null),
                -32600,
                "JSON-RPC method required",
            ),
            false,
        );
    };
    let Some(id) = object.get("id").cloned() else {
        return json_response(202, "Accepted", &Value::Null, false);
    };
    let result = match method {
        "initialize" => Ok(mcp_initialize_result(object.get("params"))),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({"tools": mcp_tool_definitions()})),
        "tools/call" => mcp_call_tool(object.get("params"), session_id),
        "resources/list" => Ok(json!({"resources": []})),
        "resources/templates/list" => Ok(json!({"resourceTemplates": []})),
        "prompts/list" => Ok(json!({"prompts": []})),
        _ => Err((-32601, format!("MCP method not found: {method}"))),
    };
    let response = match result {
        Ok(result) => mcp_rpc_result(id, result),
        Err((code, message)) => mcp_rpc_error(id, code, &message),
    };
    json_response(200, "OK", &response, false)
}

fn mcp_initialize_result(params: Option<&Value>) -> Value {
    const SUPPORTED_PROTOCOLS: [&str; 3] = ["2025-11-25", "2025-06-18", "2025-03-26"];
    let requested = params
        .and_then(|value| value.get("protocolVersion"))
        .and_then(Value::as_str);
    let protocol_version = requested
        .filter(|value| SUPPORTED_PROTOCOLS.contains(value))
        .unwrap_or(MCP_PROTOCOL_VERSION);
    json!({
        "protocolVersion": protocol_version,
        "capabilities": {"tools": {"listChanged": false}},
        "serverInfo": {
            "name": "OutilsIA Local Action Lane",
            "version": MCP_SERVER_VERSION
        },
        "instructions": "Service local separe du MCP read-only. Les outils preparent, lisent ou annulent une demande. Aucun outil MCP n'approuve ni n'execute une action. Toute execution exige un clic explicite dans OutilsIA Local Cockpit, une capacite liee au plan valable deux minutes et une consommation unique."
    })
}

fn mcp_tool_definitions() -> Vec<Value> {
    vec![
        mcp_action_tool(
            ACTION_TOOL_NAMES[0],
            "Preparer une installation Ollama",
            "Prepare une installation limitee a une reference du catalogue fige par l'application. Aucune sonde ni commande systeme n'est lancee pendant cet appel MCP ; le preflight runtime/stockage reste dans l'execution native approuvee.",
            json!({
                "type": "object",
                "properties": {
                    "model": {"type": "string", "minLength": 2, "maxLength": 180},
                    "runtime": {"type": "string", "enum": ["native", "wsl"]}
                },
                "required": ["model"],
                "additionalProperties": false
            }),
            false,
        ),
        mcp_action_tool(
            ACTION_TOOL_NAMES[1],
            "Preparer un benchmark local",
            "Prepare un benchmark fixe depuis le snapshot de modeles fige au demarrage. Aucune sonde ni commande systeme n'est lancee pendant cet appel MCP ; la presence du modele est recontrolee seulement dans l'execution native approuvee.",
            json!({
                "type": "object",
                "properties": {
                    "model": {"type": "string", "minLength": 2, "maxLength": 180},
                    "runtime": {"type": "string", "enum": ["native", "wsl"]}
                },
                "required": ["model"],
                "additionalProperties": false
            }),
            false,
        ),
        mcp_action_tool(
            ACTION_TOOL_NAMES[2],
            "Preparer l'export du rapport",
            "Prepare l'export du rapport deja fige dans l'application vers la destination choisie dans le cockpit. Le client ne fournit ni chemin ni contenu.",
            json!({
                "type": "object",
                "properties": {"format": {"type": "string", "const": "markdown"}},
                "additionalProperties": false
            }),
            false,
        ),
        mcp_action_tool(
            ACTION_TOOL_NAMES[3],
            "Lire une demande locale",
            "Lit l'etat expurge d'une demande Action Lane. Aucun secret, contenu export ou sortie brute n'est retourne.",
            json!({
                "type": "object",
                "properties": {"request_id": {"type": "string", "minLength": 8, "maxLength": 80}},
                "required": ["request_id"],
                "additionalProperties": false
            }),
            true,
        ),
        mcp_action_tool(
            ACTION_TOOL_NAMES[4],
            "Annuler une demande locale",
            "Annule une demande encore en attente ou approuvee. Ne peut pas interrompre une action deja en execution.",
            json!({
                "type": "object",
                "properties": {"request_id": {"type": "string", "minLength": 8, "maxLength": 80}},
                "required": ["request_id"],
                "additionalProperties": false
            }),
            false,
        ),
    ]
}

fn mcp_action_tool(
    name: &str,
    title: &str,
    description: &str,
    input_schema: Value,
    read_only: bool,
) -> Value {
    json!({
        "name": name,
        "title": title,
        "description": description,
        "inputSchema": input_schema,
        "annotations": {
            "title": title,
            "readOnlyHint": read_only,
            "destructiveHint": false,
            "idempotentHint": read_only,
            "openWorldHint": false
        }
    })
}

fn mcp_call_tool(params: Option<&Value>, session_id: &str) -> Result<Value, (i64, String)> {
    let params = params
        .and_then(Value::as_object)
        .ok_or_else(|| (-32602, "tools/call params object required".to_string()))?;
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| (-32602, "tools/call name required".to_string()))?;
    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let result = match name {
        "outilsia_prepare_model_install"
        | "outilsia_prepare_benchmark"
        | "outilsia_prepare_report_export" => serde_json::to_value(
            prepare_action(session_id, name, &arguments).map_err(|error| (-32602, error))?,
        )
        .map_err(|error| (-32603, error.to_string()))?,
        "outilsia_get_action_request" => {
            let request_id = required_request_id(&arguments).map_err(|error| (-32602, error))?;
            serde_json::to_value(
                get_request_for_client(session_id, &request_id).map_err(|error| (-32602, error))?,
            )
            .map_err(|error| (-32603, error.to_string()))?
        }
        "outilsia_cancel_action_request" => {
            let request_id = required_request_id(&arguments).map_err(|error| (-32602, error))?;
            serde_json::to_value(
                cancel_request_for_client(session_id, &request_id)
                    .map_err(|error| (-32602, error))?,
            )
            .map_err(|error| (-32603, error.to_string()))?
        }
        _ => return Err((-32602, format!("Unknown Action Lane tool: {name}"))),
    };
    let text = serde_json::to_string_pretty(&result).unwrap_or_else(|_| "{}".to_string());
    Ok(json!({
        "content": [{"type": "text", "text": text}],
        "structuredContent": result,
        "isError": false
    }))
}

fn required_request_id(arguments: &Value) -> Result<String, String> {
    let object = arguments
        .as_object()
        .ok_or_else(|| "Arguments requis.".to_string())?;
    reject_unknown_arguments(object, &["request_id"])?;
    safe_identifier(
        object
            .get("request_id")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        "Identifiant de demande",
        80,
    )
}

fn mcp_rpc_result(id: Value, result: Value) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "result": result})
}

fn mcp_rpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {"code": code, "message": message}
    })
}

fn json_response(status: u16, status_text: &str, body: &Value, authenticate: bool) -> Vec<u8> {
    build_json_response(
        status,
        status_text,
        body,
        JsonResponsePolicy {
            allowed_methods: "POST, GET",
            allowed_headers: "Authorization, Content-Type, MCP-Protocol-Version",
            origin: None,
            deny_browser_origin: true,
            allow_private_network: false,
            protocol_version: Some(MCP_PROTOCOL_VERSION),
            bearer_realm: authenticate.then_some("outilsia-local-action"),
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpStream;

    fn test_lock() -> std::sync::MutexGuard<'static, ()> {
        static TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        TEST_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .expect("test lock")
    }

    fn test_runtime() -> ActionLaneRuntime {
        ActionLaneRuntime {
            shutdown: Arc::new(AtomicBool::new(false)),
            alive: Arc::new(AtomicBool::new(true)),
            base_url: "http://127.0.0.1:43128".to_string(),
            session_id: "als-test-session".to_string(),
            client_id: "codex-test".to_string(),
            client_label: "Codex Test".to_string(),
            expires_at_ms: unix_ms() + 900_000,
            models: HashMap::new(),
            export: None,
            requests: Vec::new(),
            executing_request_id: None,
        }
    }

    fn test_request(action: &str) -> StoredActionRequest {
        let target = match action {
            "export_report" => json!({
                "format": "markdown",
                "filename": "rapport.md",
                "destination": "app_data",
                "content_sha256": "a".repeat(64)
            }),
            _ => json!({"model": "qwen3:8b", "runtime": "native"}),
        };
        let plan = json!({
            "schema": "outilsia.local_action_plan.v0",
            "contract_version": ACTION_LANE_CONTRACT_VERSION,
            "action": action,
            "target": target,
            "limits": {"timeout_seconds": 45},
            "consent": {"human_required": true, "client_cannot_approve": true, "one_use": true}
        });
        StoredActionRequest {
            request_id: format!("larq-{action}"),
            session_id: "als-test-session".to_string(),
            client_id: "codex-test".to_string(),
            client_label: "Codex Test".to_string(),
            action: action.to_string(),
            state: "awaiting_human".to_string(),
            created_at_ms: unix_ms(),
            updated_at_ms: unix_ms(),
            plan_sha256: canonical_sha256(&plan),
            plan,
            human_decision: "not_recorded".to_string(),
            decision_channel: "none".to_string(),
            execution_confirmation_channel: "none".to_string(),
            capability: None,
            result: None,
        }
    }

    fn frozen_model(installed: bool) -> FrozenModel {
        FrozenModel {
            model: "qwen3:8b".to_string(),
            runtime: "native".to_string(),
            installed,
            estimated_download_gb: Some(5.2),
            estimated_upper_gb: Some(6.0),
            required_free_gb: Some(10.0),
            benchmark_timeout_seconds: 45,
        }
    }

    #[test]
    fn mcp_preparation_uses_only_the_frozen_snapshot_and_defers_live_probes() {
        let _serial = test_lock();
        stop_current_lane().expect("clean lane");

        let mut install_runtime = test_runtime();
        let install_model = frozen_model(false);
        install_runtime.models.insert(
            model_key(&install_model.model, &install_model.runtime),
            install_model,
        );
        *lane_state().lock().expect("lane state") = Some(install_runtime);
        let install = prepare_action(
            "als-test-session",
            "outilsia_prepare_model_install",
            &json!({"model": "qwen3:8b", "runtime": "native"}),
        )
        .expect("pure install preparation");
        assert_eq!(
            install
                .plan
                .pointer("/preflight/live_probes_run_during_prepare")
                .and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            install
                .plan
                .pointer("/preflight/native_preflight_required_before_execution")
                .and_then(Value::as_bool),
            Some(true)
        );
        assert!(install
            .plan
            .pointer("/preflight/storage_free_gb")
            .is_some_and(Value::is_null));

        stop_current_lane().expect("reset lane");
        let mut benchmark_runtime = test_runtime();
        let benchmark_model = frozen_model(true);
        benchmark_runtime.models.insert(
            model_key(&benchmark_model.model, &benchmark_model.runtime),
            benchmark_model,
        );
        *lane_state().lock().expect("lane state") = Some(benchmark_runtime);
        let benchmark = prepare_action(
            "als-test-session",
            "outilsia_prepare_benchmark",
            &json!({"model": "qwen3:8b", "runtime": "native"}),
        )
        .expect("pure benchmark preparation");
        assert_eq!(
            benchmark
                .plan
                .pointer("/preflight/live_probes_run_during_prepare")
                .and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            benchmark
                .plan
                .pointer("/preflight/native_installed_check_required_before_execution")
                .and_then(Value::as_bool),
            Some(true)
        );
        stop_current_lane().expect("clean lane");
    }

    fn install_test_runtime(requests: Vec<StoredActionRequest>) {
        let mut runtime = test_runtime();
        runtime.requests = requests;
        *lane_state().lock().expect("lane lock") = Some(runtime);
    }

    fn approve_for_test(request_id: &str, plan_sha256: &str) -> LocalActionRequestView {
        approve_local_action_request_after_native_dialog(
            ApproveLocalActionRequest {
                schema: ACTION_APPROVAL_SCHEMA.to_string(),
                request_id: request_id.to_string(),
                plan_sha256: plan_sha256.to_string(),
            },
            NativeActionConfirmationKind::Approval,
        )
        .expect("approval")
    }

    fn network_mcp_post(port: u16, token: Option<&str>, body: &Value) -> Vec<u8> {
        let body = serde_json::to_vec(body).expect("request body");
        let authorization = token
            .map(|value| format!("Authorization: Bearer {value}\r\n"))
            .unwrap_or_default();
        let headers = format!(
            "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{authorization}Content-Type: application/json\r\nAccept: application/json\r\nConnection: close\r\nContent-Length: {}\r\n\r\n",
            body.len()
        );
        let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("loopback connect");
        stream
            .write_all(headers.as_bytes())
            .expect("request headers");
        stream.write_all(&body).expect("request body");
        let mut response = Vec::new();
        stream.read_to_end(&mut response).expect("response");
        response
    }

    fn response_status(response: &[u8]) -> &str {
        std::str::from_utf8(response)
            .unwrap_or_default()
            .lines()
            .next()
            .unwrap_or_default()
    }

    fn response_json(response: &[u8]) -> Value {
        let offset = response
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .map(|index| index + 4)
            .expect("http body");
        serde_json::from_slice(&response[offset..]).expect("json response")
    }

    #[test]
    fn loopback_mcp_prepares_reads_and_cancels_but_never_executes() {
        let _serial = test_lock();
        let private_report = "# Rapport prive\n\nNe jamais retourner ce contenu au client.";
        let started = start_local_action_lane(StartLocalActionLaneRequest {
            schema: ACTION_LANE_START_SCHEMA.to_string(),
            client: ActionLaneClient {
                id: "codex-test".to_string(),
                label: "Codex Test".to_string(),
            },
            allowed_models: Vec::new(),
            export_snapshot: Some(ActionExportSnapshot {
                format: "markdown".to_string(),
                filename: "rapport-test.md".to_string(),
                destination: "app_data".to_string(),
                content: private_report.to_string(),
            }),
            ttl_seconds: Some(60),
        })
        .expect("lane start");
        let port = started
            .base_url
            .rsplit(':')
            .next()
            .and_then(|value| value.parse::<u16>().ok())
            .expect("lane port");

        let unauthorized = network_mcp_post(
            port,
            None,
            &json!({"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}),
        );
        assert!(response_status(&unauthorized).contains("401 Unauthorized"));

        let tools = network_mcp_post(
            port,
            Some(&started.token),
            &json!({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}),
        );
        assert!(response_status(&tools).contains("200 OK"));
        let tools_json = response_json(&tools);
        let names = tools_json
            .pointer("/result/tools")
            .and_then(Value::as_array)
            .expect("tools")
            .iter()
            .filter_map(|tool| tool.get("name").and_then(Value::as_str))
            .collect::<Vec<_>>();
        assert_eq!(names, ACTION_TOOL_NAMES);
        assert!(names
            .iter()
            .all(|name| !name.contains("execute") && !name.contains("approve")));

        let prepared = network_mcp_post(
            port,
            Some(&started.token),
            &json!({
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "outilsia_prepare_report_export",
                    "arguments": {"format": "markdown"}
                }
            }),
        );
        assert!(response_status(&prepared).contains("200 OK"));
        let prepared_text = String::from_utf8_lossy(&prepared);
        assert!(!prepared_text.contains(private_report));
        let prepared_json = response_json(&prepared);
        let request_id = prepared_json
            .pointer("/result/structuredContent/request_id")
            .and_then(Value::as_str)
            .expect("prepared request id")
            .to_string();
        let plan_sha256 = prepared_json
            .pointer("/result/structuredContent/plan_sha256")
            .and_then(Value::as_str)
            .expect("prepared plan digest")
            .to_string();
        assert_eq!(
            prepared_json
                .pointer("/result/structuredContent/state")
                .and_then(Value::as_str),
            Some("awaiting_human")
        );

        let duplicate = network_mcp_post(
            port,
            Some(&started.token),
            &json!({
                "jsonrpc": "2.0",
                "id": 31,
                "method": "tools/call",
                "params": {
                    "name": "outilsia_prepare_report_export",
                    "arguments": {"format": "markdown"}
                }
            }),
        );
        assert!(response_status(&duplicate).contains("200 OK"));
        let duplicate_json = response_json(&duplicate);
        let duplicate_request_id = duplicate_json
            .pointer("/result/structuredContent/request_id")
            .and_then(Value::as_str)
            .expect("duplicate request id")
            .to_string();
        assert_ne!(request_id, duplicate_request_id);
        assert_eq!(
            duplicate_json
                .pointer("/result/structuredContent/plan_sha256")
                .and_then(Value::as_str),
            Some(plan_sha256.as_str())
        );
        assert_eq!(
            duplicate_json
                .pointer("/result/structuredContent/state")
                .and_then(Value::as_str),
            Some("awaiting_human")
        );

        let execute_attempt = network_mcp_post(
            port,
            Some(&started.token),
            &json!({
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/call",
                "params": {
                    "name": "outilsia_execute_action",
                    "arguments": {"request_id": request_id}
                }
            }),
        );
        assert_eq!(
            response_json(&execute_attempt)
                .pointer("/error/code")
                .and_then(Value::as_i64),
            Some(-32602)
        );

        let cancelled = network_mcp_post(
            port,
            Some(&started.token),
            &json!({
                "jsonrpc": "2.0",
                "id": 5,
                "method": "tools/call",
                "params": {
                    "name": "outilsia_cancel_action_request",
                    "arguments": {"request_id": request_id}
                }
            }),
        );
        assert_eq!(
            response_json(&cancelled)
                .pointer("/result/structuredContent/state")
                .and_then(Value::as_str),
            Some("cancelled")
        );
        let duplicate_cancelled = network_mcp_post(
            port,
            Some(&started.token),
            &json!({
                "jsonrpc": "2.0",
                "id": 6,
                "method": "tools/call",
                "params": {
                    "name": "outilsia_cancel_action_request",
                    "arguments": {"request_id": duplicate_request_id}
                }
            }),
        );
        assert_eq!(
            response_json(&duplicate_cancelled)
                .pointer("/result/structuredContent/state")
                .and_then(Value::as_str),
            Some("cancelled")
        );
        let native_requests = list_local_action_requests().expect("native queue");
        assert_eq!(native_requests.len(), 2);
        assert!(native_requests
            .iter()
            .all(|request| request.state == "cancelled" && request.result.is_none()));
        assert_ne!(native_requests[0].request_id, native_requests[1].request_id);
        assert_eq!(
            native_requests[0].plan_sha256,
            native_requests[1].plan_sha256
        );

        let stopped = stop_local_action_lane().expect("lane stop");
        assert!(!stopped.running);
        assert!(!stopped.token_exposed);
    }

    #[test]
    #[ignore = "requires Node.js and npm ci for the official MCP SDK"]
    fn official_mcp_sdk_conforms_to_action_lane_without_execution() {
        let _serial = test_lock();
        let private_report = "# Rapport prive\n\nAbsent du rapport de conformite SDK.";
        let started = start_local_action_lane(StartLocalActionLaneRequest {
            schema: ACTION_LANE_START_SCHEMA.to_string(),
            client: ActionLaneClient {
                id: "sdk-conformance".to_string(),
                label: "Official MCP SDK Conformance".to_string(),
            },
            allowed_models: Vec::new(),
            export_snapshot: Some(ActionExportSnapshot {
                format: "markdown".to_string(),
                filename: "rapport-sdk-test.md".to_string(),
                destination: "app_data".to_string(),
                content: private_report.to_string(),
            }),
            ttl_seconds: Some(60),
        })
        .expect("lane start");
        let probe = crate::mcp_sdk_conformance::run_sdk_probe(
            "action_lane",
            &started.mcp_url,
            &started.token,
            true,
        );
        let requests = list_local_action_requests().expect("native Action Lane queue");
        let stopped = stop_local_action_lane().expect("lane stop");
        assert!(!stopped.running);
        assert_eq!(requests.len(), 2);
        assert!(requests
            .iter()
            .all(|request| request.state == "cancelled" && request.result.is_none()));
        let report = probe.expect("official MCP SDK Action Lane conformance");
        assert_eq!(
            report.get("sdk").and_then(Value::as_str),
            Some("@modelcontextprotocol/sdk@1.30.0")
        );
        assert_eq!(report.get("tool_count").and_then(Value::as_u64), Some(5));
        assert_eq!(
            report.get("requests_prepared").and_then(Value::as_u64),
            Some(2)
        );
        assert_eq!(
            report.get("requests_cancelled").and_then(Value::as_u64),
            Some(2)
        );
        assert_eq!(
            report.get("requests_distinct").and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            report.get("plans_equal").and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            report
                .get("execution_tool_available")
                .and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            report.get("actions_started").and_then(Value::as_bool),
            Some(false)
        );
    }

    #[test]
    fn canonical_digest_rejects_plan_mutation() {
        let _serial = test_lock();
        let request = test_request("benchmark_model");
        let original = request.plan_sha256.clone();
        let mut mutated = request.plan.clone();
        mutated["target"]["model"] = json!("other:8b");
        assert_ne!(original, canonical_sha256(&mutated));
        install_test_runtime(vec![request.clone()]);
        let error = approve_local_action_request_after_native_dialog(
            ApproveLocalActionRequest {
                schema: ACTION_APPROVAL_SCHEMA.to_string(),
                request_id: request.request_id,
                plan_sha256: canonical_sha256(&mutated),
            },
            NativeActionConfirmationKind::Approval,
        )
        .expect_err("mutated plan must fail");
        assert!(error.contains("modifie"));
        stop_current_lane().expect("cleanup");
    }

    #[test]
    fn scripted_evidence_cannot_approve_or_execute() {
        let _serial = test_lock();
        let request = test_request("benchmark_model");
        let request_id = request.request_id.clone();
        let digest = request.plan_sha256.clone();
        install_test_runtime(vec![request]);

        let wrong_approval = approve_local_action_request_after_native_dialog(
            ApproveLocalActionRequest {
                schema: ACTION_APPROVAL_SCHEMA.to_string(),
                request_id: request_id.clone(),
                plan_sha256: digest.clone(),
            },
            NativeActionConfirmationKind::Execution,
        )
        .expect_err("execution evidence cannot mint approval");
        assert!(wrong_approval.contains("systeme"));
        assert_eq!(
            list_local_action_requests().expect("requests")[0].state,
            "awaiting_human"
        );

        let approved = approve_for_test(&request_id, &digest);
        assert_eq!(approved.decision_channel, "os_native_dialog");
        let wrong_execution = begin_local_action_execution(
            &request_id,
            &digest,
            NativeActionConfirmationKind::Approval,
        )
        .expect_err("approval evidence cannot execute");
        assert!(wrong_execution.contains("execution"));
        let still_approved = list_local_action_requests().expect("requests");
        assert_eq!(still_approved[0].state, "approved");
        assert!(!still_approved[0].capability_consumed);
        assert_eq!(still_approved[0].execution_confirmation_channel, "none");
        stop_current_lane().expect("cleanup");
    }

    #[test]
    fn native_prompt_is_bound_to_state_digest_and_safe_target() {
        let _serial = test_lock();
        let request = test_request("export_report");
        let request_id = request.request_id.clone();
        let digest = request.plan_sha256.clone();
        install_test_runtime(vec![request]);

        let prompt = local_action_native_confirmation_prompt(
            &request_id,
            &digest,
            NativeActionConfirmationKind::Approval,
        )
        .expect("approval prompt");
        assert!(prompt.message.contains(&digest));
        assert!(prompt.message.contains("rapport.md"));
        assert!(prompt.message.contains("Contenu SHA-256"));
        assert!(!prompt.message.contains("top secret report body"));
        assert_eq!(prompt.confirm_label, "Autoriser 2 min");

        let wrong_digest = "f".repeat(64);
        let error = local_action_native_confirmation_prompt(
            &request_id,
            &wrong_digest,
            NativeActionConfirmationKind::Approval,
        )
        .expect_err("foreign digest must fail before dialog");
        assert!(error.contains("modifie"));

        approve_for_test(&request_id, &digest);
        let stale_approval = local_action_native_confirmation_prompt(
            &request_id,
            &digest,
            NativeActionConfirmationKind::Approval,
        )
        .expect_err("approval dialog cannot reopen after capability issuance");
        assert!(stale_approval.contains("non approuvable"));
        let execution_prompt = local_action_native_confirmation_prompt(
            &request_id,
            &digest,
            NativeActionConfirmationKind::Execution,
        )
        .expect("execution prompt");
        assert_eq!(execution_prompt.confirm_label, "Executer maintenant");
        stop_current_lane().expect("cleanup");
    }

    #[test]
    fn capability_is_one_use_and_replay_is_refused() {
        let _serial = test_lock();
        let request = test_request("benchmark_model");
        let request_id = request.request_id.clone();
        let digest = request.plan_sha256.clone();
        install_test_runtime(vec![request]);
        approve_for_test(&request_id, &digest);
        begin_local_action_execution(
            &request_id,
            &digest,
            NativeActionConfirmationKind::Execution,
        )
        .expect("first consume");
        let replay = begin_local_action_execution(
            &request_id,
            &digest,
            NativeActionConfirmationKind::Execution,
        )
        .expect_err("replay must fail");
        assert!(replay.contains("deja en cours") || replay.contains("non executable"));
        stop_current_lane().expect("cleanup");
    }

    #[test]
    fn expired_capability_is_refused() {
        let _serial = test_lock();
        let request = test_request("benchmark_model");
        let request_id = request.request_id.clone();
        let digest = request.plan_sha256.clone();
        install_test_runtime(vec![request]);
        approve_for_test(&request_id, &digest);
        {
            let mut guard = lane_state().lock().expect("lane lock");
            let stored = guard
                .as_mut()
                .expect("runtime")
                .requests
                .first_mut()
                .expect("request");
            stored
                .capability
                .as_mut()
                .expect("capability")
                .expires_at_ms = unix_ms() - 1;
        }
        let error = begin_local_action_execution(
            &request_id,
            &digest,
            NativeActionConfirmationKind::Execution,
        )
        .expect_err("expired capability must fail");
        assert!(error.contains("expired") || error.contains("etat expired"));
        stop_current_lane().expect("cleanup");
    }

    #[test]
    fn cancellation_revokes_approved_capability() {
        let _serial = test_lock();
        let request = test_request("benchmark_model");
        let request_id = request.request_id.clone();
        let digest = request.plan_sha256.clone();
        install_test_runtime(vec![request]);
        approve_for_test(&request_id, &digest);
        let cancelled = cancel_request_for_client("als-test-session", &request_id).expect("cancel");
        assert_eq!(cancelled.state, "cancelled");
        assert!(!cancelled.capability_consumed);
        let error = begin_local_action_execution(
            &request_id,
            &digest,
            NativeActionConfirmationKind::Execution,
        )
        .expect_err("cancelled request must fail");
        assert!(error.contains("cancelled"));
        stop_current_lane().expect("cleanup");
    }

    #[test]
    fn anti_reentrance_blocks_second_execution() {
        let _serial = test_lock();
        let first = test_request("benchmark_model");
        let second = test_request("export_report");
        let first_id = first.request_id.clone();
        let first_digest = first.plan_sha256.clone();
        let second_id = second.request_id.clone();
        let second_digest = second.plan_sha256.clone();
        install_test_runtime(vec![first, second]);
        approve_for_test(&first_id, &first_digest);
        approve_for_test(&second_id, &second_digest);
        begin_local_action_execution(
            &first_id,
            &first_digest,
            NativeActionConfirmationKind::Execution,
        )
        .expect("first action");
        let error = begin_local_action_execution(
            &second_id,
            &second_digest,
            NativeActionConfirmationKind::Execution,
        )
        .expect_err("second action must wait");
        assert!(error.contains("deja en cours"));
        stop_current_lane().expect("cleanup");
    }

    #[test]
    fn active_execution_survives_session_expiry_and_blocks_stop() {
        let _serial = test_lock();
        let request = test_request("benchmark_model");
        let request_id = request.request_id.clone();
        let digest = request.plan_sha256.clone();
        install_test_runtime(vec![request]);
        approve_for_test(&request_id, &digest);
        begin_local_action_execution(
            &request_id,
            &digest,
            NativeActionConfirmationKind::Execution,
        )
        .expect("execution start");
        {
            let mut guard = lane_state().lock().expect("lane lock");
            let runtime = guard.as_mut().expect("runtime");
            runtime.alive.store(false, Ordering::SeqCst);
            runtime.expires_at_ms = unix_ms() - 1;
        }

        let status = status_snapshot().expect("status during execution");
        assert!(status.running);
        assert_eq!(
            status.executing_request_id.as_deref(),
            Some(request_id.as_str())
        );
        let stop_error = stop_local_action_lane().expect_err("stop during execution must fail");
        assert!(stop_error.contains("action locale est en cours"));

        finish_local_action_execution(
            &request_id,
            true,
            125,
            json!({
                "success": true,
                "model": "qwen3:8b",
                "elapsed_ms": 125,
                "estimated_tokens_per_second": 42.0
            }),
        )
        .expect("execution finish");
        let stopped = stop_local_action_lane().expect("stop after receipt");
        assert!(!stopped.running);
    }

    #[test]
    fn failed_execution_reconstruction_does_not_consume_capability() {
        let _serial = test_lock();
        let request = test_request("export_report");
        let request_id = request.request_id.clone();
        let digest = request.plan_sha256.clone();
        install_test_runtime(vec![request]);
        approve_for_test(&request_id, &digest);

        let error = begin_local_action_execution(
            &request_id,
            &digest,
            NativeActionConfirmationKind::Execution,
        )
        .expect_err("missing frozen export must fail before consumption");
        assert!(error.contains("Snapshot export indisponible"));
        let guard = lane_state().lock().expect("lane lock");
        let runtime = guard.as_ref().expect("runtime");
        let stored = runtime.requests.first().expect("request");
        assert_eq!(stored.state, "approved");
        assert!(stored
            .capability
            .as_ref()
            .is_some_and(|capability| capability.consumed_at_ms.is_none()));
        assert!(runtime.executing_request_id.is_none());
        drop(guard);
        stop_current_lane().expect("cleanup");
    }

    #[test]
    fn agent_arguments_cannot_smuggle_shell_url_or_path() {
        let _serial = test_lock();
        let mut arguments = Map::new();
        arguments.insert("model".to_string(), json!("qwen3:8b"));
        arguments.insert("command".to_string(), json!("rm -rf /"));
        assert!(reject_unknown_arguments(&arguments, &["model", "runtime"]).is_err());

        let mut export = Map::new();
        export.insert("format".to_string(), json!("markdown"));
        export.insert("path".to_string(), json!("C:\\Users\\secret"));
        assert!(reject_unknown_arguments(&export, &["format"]).is_err());
    }

    #[test]
    fn views_and_receipts_never_expose_secret_or_export_content() {
        let _serial = test_lock();
        let mut request = test_request("export_report");
        let secret = "top-secret-capability";
        request.state = "completed".to_string();
        request.human_decision = "explicitly_approved_in_native_ui".to_string();
        request.decision_channel = "os_native_dialog".to_string();
        request.execution_confirmation_channel = "os_native_dialog".to_string();
        request.capability = Some(ActionCapability {
            capability_id: "cap-test".to_string(),
            capability_secret_sha256: sha256_bytes(secret.as_bytes()),
            plan_sha256: request.plan_sha256.clone(),
            session_id: request.session_id.clone(),
            client_id: request.client_id.clone(),
            issued_at_ms: unix_ms(),
            expires_at_ms: unix_ms() + CAPABILITY_TTL_MS,
            consumed_at_ms: Some(unix_ms()),
        });
        request.result = Some(json!({
            "success": true,
            "filename": "rapport.md",
            "content_sha256": "a".repeat(64)
        }));
        let view = serde_json::to_string(&request_view(&request)).expect("view");
        let receipt = serde_json::to_string(&build_receipt(&request, true, 42).expect("receipt"))
            .expect("receipt json");
        assert!(!view.contains(secret));
        assert!(!receipt.contains(secret));
        assert!(!view.contains("top secret report body"));
        assert!(!receipt.contains("top secret report body"));
        assert!(receipt.contains("\"raw_prompt_stored\":false"));
        assert!(receipt.contains("\"raw_model_output_stored\":false"));
        assert!(receipt.contains("\"channel\":\"os_native_dialog\""));
        assert!(receipt.contains("\"native_ui_confirmed\":true"));
        assert!(receipt.contains("\"export_content_stored\":false"));
    }
}
