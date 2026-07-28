use crate::local_mcp_http::{
    allowed_loopback_host as allowed_host, allowed_loopback_origin as allowed_origin,
    bearer_authorized as authorized, build_json_response, build_raw_json_response,
    canonical_sha256, constant_time_eq, read_request, tiny_response, HttpRequest,
    JsonResponsePolicy,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tiny_http::Server;

const BRIDGE_SCHEMA: &str = "outilsia.local_capability_bridge.v1";
const BRIDGE_CONTRACT_VERSION: &str = "2026-07-27";
const CAPABILITY_DOCUMENT_SCHEMA: &str = "outilsia.ai_capability_passport.v1";
const CAPABILITY_DOCUMENT_KIND: &str = "capability_snapshot";
const CAPABILITY_DOCUMENT_VERSION: &str = "1.4.0";
const CAPABILITY_ASSURANCE_LEVEL: &str = "self_consistency_only";
const MCP_PROTOCOL_VERSION: &str = "2025-11-25";
const MCP_SERVER_VERSION: &str = "0.1.0";
const MCP_PATH: &str = "/mcp";
const DEFAULT_TTL_SECONDS: u64 = 15 * 60;
const MIN_TTL_SECONDS: u64 = 60;
const MAX_TTL_SECONDS: u64 = 30 * 60;
const MAX_PAYLOAD_BYTES: usize = 1024 * 1024;
const MAX_REQUEST_BYTES: usize = 64 * 1024;
const MAX_REQUESTS_PER_SESSION: usize = 240;
const MCP_TOOL_NAMES: [&str; 8] = [
    "outilsia_get_cockpit_status",
    "outilsia_get_machine_profile",
    "outilsia_get_hardware_doctor",
    "outilsia_list_installed_models",
    "outilsia_get_model_recommendation",
    "outilsia_get_benchmark_proofs",
    "outilsia_get_capability_passport",
    "outilsia_get_strategy_arena_handoff",
];

static LOCAL_BRIDGE: OnceLock<Mutex<Option<BridgeRuntime>>> = OnceLock::new();

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct LocalCapabilityBridgeRequest {
    payload: Value,
    ttl_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct LocalCapabilityBridgeStart {
    schema: String,
    contract_version: String,
    running: bool,
    base_url: String,
    mcp_url: String,
    mcp_protocol_version: String,
    mcp_server_version: String,
    mcp_tools: Vec<String>,
    token: String,
    expires_at_ms: u128,
    ttl_seconds: u64,
    bind: String,
    read_only: bool,
    token_persisted: bool,
    endpoints: Vec<String>,
    allowed_origins: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct LocalCapabilityBridgeStatus {
    schema: String,
    contract_version: String,
    running: bool,
    base_url: String,
    mcp_url: String,
    mcp_protocol_version: String,
    mcp_server_version: String,
    mcp_tools: Vec<String>,
    expires_at_ms: u128,
    bind: String,
    read_only: bool,
    token_exposed: bool,
}

struct BridgeRuntime {
    shutdown: Arc<AtomicBool>,
    alive: Arc<AtomicBool>,
    base_url: String,
    expires_at_ms: u128,
}

#[derive(Clone)]
struct BridgeBodies {
    capabilities: Arc<Vec<u8>>,
    passport: Arc<Vec<u8>>,
    models: Arc<Vec<u8>>,
    strategy_arena: Arc<Vec<u8>>,
    snapshot: Arc<Value>,
}

fn bridge_state() -> &'static Mutex<Option<BridgeRuntime>> {
    LOCAL_BRIDGE.get_or_init(|| Mutex::new(None))
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn generate_token() -> Result<String, String> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes)
        .map_err(|err| format!("Generation du jeton local impossible: {err}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn verify_passport_integrity(passport: &Value) -> Result<(), String> {
    if passport
        .pointer("/integrity/algorithm")
        .and_then(Value::as_str)
        != Some("SHA-256")
    {
        return Err("Algorithme du checksum de l'instantane invalide.".to_string());
    }
    if passport
        .pointer("/integrity/canonicalization")
        .and_then(Value::as_str)
        != Some("recursive-key-sort-json-v1")
    {
        return Err("Canonicalisation de l'instantane invalide.".to_string());
    }
    let expected = passport
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !is_sha256(&expected) {
        return Err("Checksum SHA-256 de l'instantane invalide.".to_string());
    }
    let mut unsigned = passport.clone();
    if let Some(object) = unsigned.as_object_mut() {
        object.remove("integrity");
    }
    let actual = canonical_sha256(&unsigned);
    if !constant_time_eq(&expected, &actual) {
        return Err("Coherence de l'instantane non verifiee.".to_string());
    }
    Ok(())
}

fn verify_snapshot_assurance(snapshot: &Value) -> Result<(), String> {
    if snapshot.get("document_kind").and_then(Value::as_str) != Some(CAPABILITY_DOCUMENT_KIND) {
        return Err("Type de document de capacites invalide.".to_string());
    }
    if snapshot.get("passport_version").and_then(Value::as_str) != Some(CAPABILITY_DOCUMENT_VERSION)
    {
        return Err("Version de l'instantane de capacites invalide.".to_string());
    }
    if snapshot.pointer("/assurance/level").and_then(Value::as_str)
        != Some(CAPABILITY_ASSURANCE_LEVEL)
        || snapshot
            .pointer("/assurance/producer_layer")
            .and_then(Value::as_str)
            != Some("tauri_webview")
        || snapshot
            .pointer("/assurance/digest_generated_by")
            .and_then(Value::as_str)
            != Some("web_crypto_sha256")
        || snapshot
            .pointer("/integrity/verification_semantics")
            .and_then(Value::as_str)
            != Some("coherence_not_provenance")
    {
        return Err("Niveau d'assurance de l'instantane invalide.".to_string());
    }
    for pointer in [
        "/assurance/rust_rederived",
        "/assurance/os_key_attested",
        "/assurance/machine_identity_proven",
        "/assurance/owner_identity_proven",
        "/assurance/provenance_verified",
        "/integrity/identity_signature",
    ] {
        required_bool(snapshot, pointer, false)?;
    }
    required_bool(snapshot, "/assurance/portable_unsigned_json", true)?;
    Ok(())
}

fn required_bool(payload: &Value, pointer: &str, expected: bool) -> Result<(), String> {
    match payload.pointer(pointer).and_then(Value::as_bool) {
        Some(value) if value == expected => Ok(()),
        _ => Err(format!(
            "Contrat local invalide: {pointer} doit valoir {expected}."
        )),
    }
}

fn validate_payload(payload: &Value) -> Result<Vec<u8>, String> {
    if payload.get("schema").and_then(Value::as_str) != Some(BRIDGE_SCHEMA) {
        return Err("Schema de passerelle locale invalide.".to_string());
    }
    if payload.get("contract_version").and_then(Value::as_str) != Some(BRIDGE_CONTRACT_VERSION) {
        return Err("Version de contrat local invalide.".to_string());
    }
    required_bool(payload, "/read_only", true)?;
    required_bool(payload, "/permissions/read_capabilities", true)?;
    for pointer in [
        "/permissions/install_models",
        "/permissions/delete_models",
        "/permissions/run_benchmark",
        "/permissions/run_chat",
        "/permissions/access_personal_files",
        "/permissions/run_backtests",
        "/permissions/execute_trades",
        "/permissions/write_configuration",
    ] {
        required_bool(payload, pointer, false)?;
    }
    required_bool(payload, "/privacy/local_only", true)?;
    required_bool(payload, "/privacy/ephemeral", true)?;
    required_bool(payload, "/privacy/raw_prompts_included", false)?;
    required_bool(payload, "/privacy/raw_model_outputs_included", false)?;
    required_bool(payload, "/privacy/account_tokens_included", false)?;
    required_bool(payload, "/mcp/read_only", true)?;
    required_bool(payload, "/mcp/actions_exposed", false)?;
    if payload.pointer("/mcp/transport").and_then(Value::as_str) != Some("streamable_http") {
        return Err("Transport MCP local invalide.".to_string());
    }
    if payload
        .pointer("/mcp/protocol_version")
        .and_then(Value::as_str)
        != Some(MCP_PROTOCOL_VERSION)
    {
        return Err("Version de protocole MCP locale invalide.".to_string());
    }
    let advertised_tools = payload
        .pointer("/mcp/tools")
        .and_then(Value::as_array)
        .ok_or_else(|| "Liste des outils MCP locale invalide.".to_string())?;
    if advertised_tools.len() != MCP_TOOL_NAMES.len()
        || MCP_TOOL_NAMES.iter().any(|expected| {
            !advertised_tools
                .iter()
                .any(|value| value.as_str() == Some(expected))
        })
    {
        return Err("Catalogue des outils MCP local incomplet.".to_string());
    }

    if payload.pointer("/passport/schema").and_then(Value::as_str)
        != Some(CAPABILITY_DOCUMENT_SCHEMA)
    {
        return Err("Schema de l'instantane de capacites invalide.".to_string());
    }
    verify_snapshot_assurance(&payload["passport"])?;
    verify_passport_integrity(&payload["passport"])?;

    let serialized =
        serde_json::to_vec(payload).map_err(|err| format!("Instantane local illisible: {err}"))?;
    if serialized.len() > MAX_PAYLOAD_BYTES {
        return Err(format!(
            "Instantane local trop volumineux: {} octets (maximum {}).",
            serialized.len(),
            MAX_PAYLOAD_BYTES
        ));
    }
    Ok(serialized)
}

fn bridge_bodies(payload: &Value, serialized: Vec<u8>) -> Result<BridgeBodies, String> {
    let passport = serde_json::to_vec(payload.get("passport").unwrap_or(&Value::Null))
        .map_err(|err| format!("Instantane local illisible: {err}"))?;
    let models = serde_json::to_vec(&json!({
        "schema": "outilsia.local_capability_models.v1",
        "read_only": true,
        "installed_models": payload.get("installed_models").cloned().unwrap_or_else(|| json!([])),
        "recommendation": payload.get("recommendation").cloned().unwrap_or(Value::Null)
    }))
    .map_err(|err| format!("Liste de modeles locale illisible: {err}"))?;
    let strategy_arena = serde_json::to_vec(&json!({
        "schema": "outilsia.local_strategy_arena_handoff.v1",
        "read_only": true,
        "handoff": payload.get("strategy_arena").cloned().unwrap_or(Value::Null)
    }))
    .map_err(|err| format!("Pont Strategy Arena local illisible: {err}"))?;
    Ok(BridgeBodies {
        capabilities: Arc::new(serialized),
        passport: Arc::new(passport),
        models: Arc::new(models),
        strategy_arena: Arc::new(strategy_arena),
        snapshot: Arc::new(payload.clone()),
    })
}

fn stop_runtime(runtime: &BridgeRuntime) {
    runtime.shutdown.store(true, Ordering::SeqCst);
}

fn stop_current_bridge() -> Result<bool, String> {
    let mut guard = bridge_state()
        .lock()
        .map_err(|_| "Etat de passerelle locale indisponible.".to_string())?;
    if let Some(runtime) = guard.as_ref() {
        stop_runtime(runtime);
        *guard = None;
        return Ok(true);
    }
    Ok(false)
}

fn bridge_status_snapshot() -> Result<LocalCapabilityBridgeStatus, String> {
    let mut guard = bridge_state()
        .lock()
        .map_err(|_| "Etat de passerelle locale indisponible.".to_string())?;
    let running = guard
        .as_ref()
        .map(|runtime| {
            runtime.alive.load(Ordering::SeqCst)
                && !runtime.shutdown.load(Ordering::SeqCst)
                && unix_ms() < runtime.expires_at_ms
        })
        .unwrap_or(false);
    if !running {
        if let Some(runtime) = guard.as_ref() {
            stop_runtime(runtime);
        }
        *guard = None;
    }
    let (base_url, expires_at_ms) = guard
        .as_ref()
        .map(|runtime| (runtime.base_url.clone(), runtime.expires_at_ms))
        .unwrap_or_else(|| (String::new(), 0));
    Ok(LocalCapabilityBridgeStatus {
        schema: BRIDGE_SCHEMA.to_string(),
        contract_version: BRIDGE_CONTRACT_VERSION.to_string(),
        running,
        mcp_url: if base_url.is_empty() {
            String::new()
        } else {
            format!("{base_url}{MCP_PATH}")
        },
        base_url,
        mcp_protocol_version: MCP_PROTOCOL_VERSION.to_string(),
        mcp_server_version: MCP_SERVER_VERSION.to_string(),
        mcp_tools: MCP_TOOL_NAMES
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
        expires_at_ms,
        bind: "127.0.0.1".to_string(),
        read_only: true,
        token_exposed: false,
    })
}

#[tauri::command]
pub(crate) fn start_local_capability_bridge(
    request: LocalCapabilityBridgeRequest,
) -> Result<LocalCapabilityBridgeStart, String> {
    let serialized = validate_payload(&request.payload)?;
    let bodies = bridge_bodies(&request.payload, serialized)?;
    let ttl_seconds = request
        .ttl_seconds
        .unwrap_or(DEFAULT_TTL_SECONDS)
        .clamp(MIN_TTL_SECONDS, MAX_TTL_SECONDS);
    let server = Server::http(("127.0.0.1", 0))
        .map_err(|err| format!("Ouverture de la passerelle locale impossible: {err}"))?;
    let port = server
        .server_addr()
        .to_ip()
        .ok_or_else(|| "Adresse TCP de passerelle locale indisponible.".to_string())?
        .port();
    let base_url = format!("http://127.0.0.1:{port}");
    let mcp_url = format!("{base_url}{MCP_PATH}");
    let token = generate_token()?;
    let expires_at_ms = unix_ms() + u128::from(ttl_seconds) * 1000;
    let shutdown = Arc::new(AtomicBool::new(false));
    let alive = Arc::new(AtomicBool::new(false));

    stop_current_bridge()?;
    {
        let mut guard = bridge_state()
            .lock()
            .map_err(|_| "Etat de passerelle locale indisponible.".to_string())?;
        *guard = Some(BridgeRuntime {
            shutdown: Arc::clone(&shutdown),
            alive: Arc::clone(&alive),
            base_url: base_url.clone(),
            expires_at_ms,
        });
    }

    let server_token = token.clone();
    let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
    thread::spawn(move || {
        alive.store(true, Ordering::SeqCst);
        let _ = ready_sender.send(());
        serve_bridge(
            server,
            server_token,
            bodies,
            expires_at_ms,
            shutdown,
            &alive,
        );
        alive.store(false, Ordering::SeqCst);
    });
    if ready_receiver.recv_timeout(Duration::from_secs(1)).is_err() {
        stop_current_bridge()?;
        return Err("Demarrage du serveur MCP local non confirme.".to_string());
    }

    Ok(LocalCapabilityBridgeStart {
        schema: BRIDGE_SCHEMA.to_string(),
        contract_version: BRIDGE_CONTRACT_VERSION.to_string(),
        running: true,
        base_url,
        mcp_url,
        mcp_protocol_version: MCP_PROTOCOL_VERSION.to_string(),
        mcp_server_version: MCP_SERVER_VERSION.to_string(),
        mcp_tools: MCP_TOOL_NAMES
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
        token,
        expires_at_ms,
        ttl_seconds,
        bind: "127.0.0.1".to_string(),
        read_only: true,
        token_persisted: false,
        endpoints: vec![
            MCP_PATH.to_string(),
            "/v1/health".to_string(),
            "/v1/capabilities".to_string(),
            "/v1/passport".to_string(),
            "/v1/models".to_string(),
            "/v1/strategy-arena".to_string(),
        ],
        allowed_origins: vec![
            "http://localhost:<port>".to_string(),
            "http://127.0.0.1:<port>".to_string(),
        ],
    })
}

#[tauri::command]
pub(crate) fn stop_local_capability_bridge() -> Result<LocalCapabilityBridgeStatus, String> {
    stop_current_bridge()?;
    bridge_status_snapshot()
}

#[tauri::command]
pub(crate) fn get_local_capability_bridge_status() -> Result<LocalCapabilityBridgeStatus, String> {
    bridge_status_snapshot()
}

fn serve_bridge(
    server: Server,
    token: String,
    bodies: BridgeBodies,
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
                    json_response(
                        403,
                        "Forbidden",
                        &json!({"error": "loopback_only"}),
                        None,
                        false,
                    )
                } else if request_count > MAX_REQUESTS_PER_SESSION {
                    json_response(
                        429,
                        "Too Many Requests",
                        &json!({"error": "session_request_limit"}),
                        None,
                        false,
                    )
                } else {
                    match read_request(&mut request, MAX_REQUEST_BYTES) {
                        Ok(request) => {
                            response_for_request(&request, &token, &bodies, expires_at_ms)
                        }
                        Err(error) => {
                            json_response(400, "Bad Request", &json!({"error": error}), None, false)
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
    bodies: &BridgeBodies,
    expires_at_ms: u128,
) -> Vec<u8> {
    let origin = request.headers.get("origin").map(String::as_str);
    if !request
        .headers
        .get("host")
        .is_some_and(|value| allowed_host(value))
    {
        return json_response(
            421,
            "Misdirected Request",
            &json!({"error": "loopback_host_required"}),
            None,
            false,
        );
    }
    if origin.is_some_and(|value| !allowed_origin(value)) {
        return json_response(
            403,
            "Forbidden",
            &json!({"error": "origin_not_allowed"}),
            None,
            false,
        );
    }
    if request.path.contains('?') {
        return json_response(
            400,
            "Bad Request",
            &json!({"error": "query_parameters_forbidden"}),
            origin,
            false,
        );
    }
    if request.method == "OPTIONS" {
        return json_response(204, "No Content", &Value::Null, origin, false);
    }
    if request.path == MCP_PATH {
        if request.method != "POST" {
            return json_response(
                405,
                "Method Not Allowed",
                &json!({"error": "streamable_http_post_required"}),
                origin,
                false,
            );
        }
        if !authorized(request, token) {
            return json_response(
                401,
                "Unauthorized",
                &json!({"error": "bearer_token_required"}),
                origin,
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
                origin,
                false,
            );
        }
        return mcp_response_for_request(request, bodies, expires_at_ms, origin);
    }
    if request.method != "GET" {
        return json_response(
            405,
            "Method Not Allowed",
            &json!({"error": "read_only_get_required"}),
            origin,
            false,
        );
    }
    if request.path == "/v1/health" {
        return json_response(
            200,
            "OK",
            &json!({
                "schema": "outilsia.local_capability_bridge_health.v1",
                "status": "ready",
                "read_only": true,
                "bind": "127.0.0.1",
                "expires_at_ms": expires_at_ms
            }),
            origin,
            false,
        );
    }
    if !authorized(request, token) {
        return json_response(
            401,
            "Unauthorized",
            &json!({"error": "bearer_token_required"}),
            origin,
            true,
        );
    }
    let body = match request.path.as_str() {
        "/v1/capabilities" => Some(Arc::clone(&bodies.capabilities)),
        "/v1/passport" => Some(Arc::clone(&bodies.passport)),
        "/v1/models" => Some(Arc::clone(&bodies.models)),
        "/v1/strategy-arena" => Some(Arc::clone(&bodies.strategy_arena)),
        _ => None,
    };
    match body {
        Some(bytes) => raw_json_response(200, "OK", &bytes, origin, false),
        None => json_response(
            404,
            "Not Found",
            &json!({"error": "endpoint_not_found"}),
            origin,
            false,
        ),
    }
}

fn mcp_response_for_request(
    request: &HttpRequest,
    bodies: &BridgeBodies,
    expires_at_ms: u128,
    origin: Option<&str>,
) -> Vec<u8> {
    let message = match serde_json::from_slice::<Value>(&request.body) {
        Ok(value) => value,
        Err(_) => {
            return json_response(
                200,
                "OK",
                &mcp_rpc_error(Value::Null, -32700, "JSON-RPC parse error"),
                origin,
                false,
            )
        }
    };
    let Some(object) = message.as_object() else {
        return json_response(
            200,
            "OK",
            &mcp_rpc_error(Value::Null, -32600, "Invalid JSON-RPC request"),
            origin,
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
            origin,
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
            origin,
            false,
        );
    };
    let Some(id) = object.get("id").cloned() else {
        return raw_json_response(202, "Accepted", &[], origin, false);
    };
    let params = object.get("params");
    let response = match mcp_dispatch(method, params, bodies, expires_at_ms) {
        Ok(result) => mcp_rpc_result(id, result),
        Err((code, message)) => mcp_rpc_error(id, code, &message),
    };
    json_response(200, "OK", &response, origin, false)
}

fn mcp_rpc_result(id: Value, result: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    })
}

fn mcp_rpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message
        }
    })
}

fn mcp_dispatch(
    method: &str,
    params: Option<&Value>,
    bodies: &BridgeBodies,
    expires_at_ms: u128,
) -> Result<Value, (i64, String)> {
    match method {
        "initialize" => Ok(mcp_initialize_result(params)),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({"tools": mcp_tool_definitions()})),
        "tools/call" => mcp_call_tool(params, bodies, expires_at_ms),
        "resources/list" => Ok(json!({"resources": mcp_resource_definitions()})),
        "resources/read" => mcp_read_resource(params, bodies, expires_at_ms),
        "resources/templates/list" => Ok(json!({"resourceTemplates": []})),
        "prompts/list" => Ok(json!({"prompts": []})),
        _ => Err((-32601, format!("MCP method not found: {method}"))),
    }
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
        "capabilities": {
            "tools": {"listChanged": false},
            "resources": {"subscribe": false, "listChanged": false}
        },
        "serverInfo": {
            "name": "OutilsIA Local Cockpit",
            "version": MCP_SERVER_VERSION
        },
        "instructions": "Serveur MCP local OutilsIA strictement en lecture seule. Utilise ses outils pour consulter l'instantané courant du matériel, du Hardware Doctor, des modèles installés, des benchmarks et de la recommandation. Le checksum du document prouve sa cohérence, jamais sa provenance. Le serveur ne déclenche aucun scan, modèle, benchmark, téléchargement, fichier, backtest ou ordre de trading. Toute action locale reste dans l'application desktop avec consentement humain."
    })
}

fn mcp_tool_definition(name: &str, title: &str, description: &str) -> Value {
    json!({
        "name": name,
        "title": title,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": {},
            "additionalProperties": false
        },
        "annotations": {
            "title": title,
            "readOnlyHint": true,
            "destructiveHint": false,
            "idempotentHint": true,
            "openWorldHint": false
        }
    })
}

fn mcp_tool_definitions() -> Vec<Value> {
    vec![
        mcp_tool_definition(
            MCP_TOOL_NAMES[0],
            "État du cockpit",
            "Retourne l'identité du snapshot OutilsIA actif, son expiration et sa frontière de permissions. Ne scanne pas la machine.",
        ),
        mcp_tool_definition(
            MCP_TOOL_NAMES[1],
            "Profil matériel",
            "Lit le profil matériel déjà capturé dans l'instantané de capacités actif. Ne déclenche aucune sonde système.",
        ),
        mcp_tool_definition(
            MCP_TOOL_NAMES[2],
            "Hardware Doctor",
            "Lit le dernier diagnostic Hardware Doctor et l'état des runtimes présents dans le snapshot.",
        ),
        mcp_tool_definition(
            MCP_TOOL_NAMES[3],
            "Modèles installés",
            "Liste les modèles Ollama observés lors du snapshot avec leur runtime déclaré. N'installe et ne supprime rien.",
        ),
        mcp_tool_definition(
            MCP_TOOL_NAMES[4],
            "Recommandation locale",
            "Lit la recommandation de modèle déjà calculée par OutilsIA et sa provenance. Ne recalcule pas la compatibilité.",
        ),
        mcp_tool_definition(
            MCP_TOOL_NAMES[5],
            "Preuves de benchmark",
            "Retourne uniquement les preuves de benchmark incluses dans l'instantané actif, sans prompt ni sortie brute.",
        ),
        mcp_tool_definition(
            MCP_TOOL_NAMES[6],
            "Instantané de capacités IA",
            "Lit l'instantané de capacités complet et son checksum de cohérence. Le document reste local, non signé et sans provenance attestée.",
        ),
        mcp_tool_definition(
            MCP_TOOL_NAMES[7],
            "Handoff Strategy Arena",
            "Lit le handoff borné destiné à Strategy Arena. Aucun backtest, stratégie ou ordre de trading n'est exécuté.",
        ),
    ]
}

fn mcp_call_tool(
    params: Option<&Value>,
    bodies: &BridgeBodies,
    expires_at_ms: u128,
) -> Result<Value, (i64, String)> {
    let params = params
        .and_then(Value::as_object)
        .ok_or_else(|| (-32602, "tools/call params object required".to_string()))?;
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| (-32602, "tools/call name required".to_string()))?;
    if params
        .get("arguments")
        .is_some_and(|value| !value.as_object().is_some_and(serde_json::Map::is_empty))
    {
        return Err((-32602, format!("{name} accepts no arguments")));
    }
    let payload = mcp_tool_payload(name, bodies, expires_at_ms)
        .ok_or_else(|| (-32602, format!("Unknown read-only tool: {name}")))?;
    let text = serde_json::to_string_pretty(&payload)
        .map_err(|_| (-32603, "Tool result serialization failed".to_string()))?;
    Ok(json!({
        "content": [{"type": "text", "text": text}],
        "structuredContent": payload,
        "isError": false
    }))
}

fn mcp_tool_payload(name: &str, bodies: &BridgeBodies, expires_at_ms: u128) -> Option<Value> {
    let snapshot = bodies.snapshot.as_ref();
    let passport = snapshot.get("passport").cloned().unwrap_or(Value::Null);
    let generated_at = snapshot.get("generated_at").cloned().unwrap_or(Value::Null);
    match name {
        "outilsia_get_cockpit_status" => Some(json!({
            "schema": "outilsia.local_mcp_status.v1",
            "server": {
                "name": "OutilsIA Local Cockpit",
                "version": MCP_SERVER_VERSION,
                "protocol_version": MCP_PROTOCOL_VERSION,
                "transport": "streamable_http"
            },
            "snapshot": {
                "generated_at": generated_at,
                "expires_at_ms": expires_at_ms,
                "passport_sha256": passport.pointer("/integrity/digest").cloned().unwrap_or(Value::Null)
            },
            "read_only": true,
            "permissions": snapshot.get("permissions").cloned().unwrap_or(Value::Null),
            "privacy": snapshot.get("privacy").cloned().unwrap_or(Value::Null),
            "tools": MCP_TOOL_NAMES
        })),
        "outilsia_get_machine_profile" => Some(json!({
            "schema": "outilsia.local_mcp_machine_profile.v1",
            "snapshot_generated_at": generated_at,
            "machine": passport.get("machine").cloned().unwrap_or(Value::Null),
            "provenance": passport.get("machine_provenance").cloned().unwrap_or(Value::Null),
            "binding": {
                "app_version": passport.pointer("/binding/app_version").cloned().unwrap_or(Value::Null),
                "build_id": passport.pointer("/binding/build_id").cloned().unwrap_or(Value::Null),
                "os": passport.pointer("/binding/os").cloned().unwrap_or(Value::Null)
            }
        })),
        "outilsia_get_hardware_doctor" => Some(json!({
            "schema": "outilsia.local_mcp_hardware_doctor.v1",
            "snapshot_generated_at": generated_at,
            "hardware_doctor": passport.get("hardware_doctor").cloned().unwrap_or(Value::Null),
            "runtime_readiness": passport.get("runtime_readiness").cloned().unwrap_or(Value::Null)
        })),
        "outilsia_list_installed_models" => {
            let models = snapshot
                .get("installed_models")
                .cloned()
                .unwrap_or_else(|| json!([]));
            Some(json!({
                "schema": "outilsia.local_mcp_installed_models.v1",
                "snapshot_generated_at": generated_at,
                "count": models.as_array().map(Vec::len).unwrap_or(0),
                "installed_models": models
            }))
        }
        "outilsia_get_model_recommendation" => Some(json!({
            "schema": "outilsia.local_mcp_recommendation.v1",
            "snapshot_generated_at": generated_at,
            "recommendation": snapshot.get("recommendation").cloned().unwrap_or(Value::Null),
            "model_autopilot": passport.get("model_autopilot").cloned().unwrap_or(Value::Null)
        })),
        "outilsia_get_benchmark_proofs" => {
            let proofs = snapshot
                .get("benchmark_proofs")
                .cloned()
                .unwrap_or_else(|| json!([]));
            Some(json!({
                "schema": "outilsia.local_mcp_benchmark_proofs.v1",
                "snapshot_generated_at": generated_at,
                "count": proofs.as_array().map(Vec::len).unwrap_or(0),
                "benchmark_proofs": proofs,
                "raw_prompts_included": false,
                "raw_model_outputs_included": false
            }))
        }
        "outilsia_get_capability_passport" => Some(passport),
        "outilsia_get_strategy_arena_handoff" => Some(json!({
            "schema": "outilsia.local_mcp_strategy_arena_handoff.v1",
            "snapshot_generated_at": generated_at,
            "handoff": snapshot.get("strategy_arena").cloned().unwrap_or(Value::Null)
        })),
        _ => None,
    }
}

fn mcp_resource_definitions() -> Vec<Value> {
    vec![
        json!({
            "uri": "outilsia://passport/current",
            "name": "Instantané de capacités IA actif",
            "description": "Instantané local non signé ; son checksum atteste seulement la cohérence du JSON.",
            "mimeType": "application/json"
        }),
        json!({
            "uri": "outilsia://models/installed",
            "name": "Modèles installés",
            "description": "Modèles observés lors de la génération du snapshot.",
            "mimeType": "application/json"
        }),
        json!({
            "uri": "outilsia://recommendation/current",
            "name": "Recommandation courante",
            "description": "Dernière recommandation calculée par OutilsIA.",
            "mimeType": "application/json"
        }),
        json!({
            "uri": "outilsia://strategy-arena/handoff",
            "name": "Handoff Strategy Arena",
            "description": "Profil borné en lecture seule pour Strategy Arena.",
            "mimeType": "application/json"
        }),
    ]
}

fn mcp_read_resource(
    params: Option<&Value>,
    bodies: &BridgeBodies,
    expires_at_ms: u128,
) -> Result<Value, (i64, String)> {
    let uri = params
        .and_then(|value| value.get("uri"))
        .and_then(Value::as_str)
        .ok_or_else(|| (-32602, "resources/read uri required".to_string()))?;
    let payload = match uri {
        "outilsia://passport/current" => {
            mcp_tool_payload("outilsia_get_capability_passport", bodies, expires_at_ms)
        }
        "outilsia://models/installed" => {
            mcp_tool_payload("outilsia_list_installed_models", bodies, expires_at_ms)
        }
        "outilsia://recommendation/current" => {
            mcp_tool_payload("outilsia_get_model_recommendation", bodies, expires_at_ms)
        }
        "outilsia://strategy-arena/handoff" => {
            mcp_tool_payload("outilsia_get_strategy_arena_handoff", bodies, expires_at_ms)
        }
        _ => None,
    }
    .ok_or_else(|| (-32602, format!("Unknown OutilsIA resource: {uri}")))?;
    let text = serde_json::to_string_pretty(&payload)
        .map_err(|_| (-32603, "Resource serialization failed".to_string()))?;
    Ok(json!({
        "contents": [{
            "uri": uri,
            "mimeType": "application/json",
            "text": text
        }]
    }))
}

fn json_response(
    status: u16,
    label: &str,
    body: &Value,
    origin: Option<&str>,
    bearer_challenge: bool,
) -> Vec<u8> {
    build_json_response(
        status,
        label,
        body,
        JsonResponsePolicy {
            allowed_methods: "GET, POST, OPTIONS",
            allowed_headers:
                "Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id",
            origin,
            deny_browser_origin: false,
            allow_private_network: true,
            protocol_version: Some(MCP_PROTOCOL_VERSION),
            bearer_realm: bearer_challenge.then_some("OutilsIA Local Capability Bridge"),
        },
    )
}

fn raw_json_response(
    status: u16,
    label: &str,
    body: &[u8],
    origin: Option<&str>,
    bearer_challenge: bool,
) -> Vec<u8> {
    build_raw_json_response(
        status,
        label,
        body,
        JsonResponsePolicy {
            allowed_methods: "GET, POST, OPTIONS",
            allowed_headers:
                "Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id",
            origin,
            deny_browser_origin: false,
            allow_private_network: true,
            protocol_version: Some(MCP_PROTOCOL_VERSION),
            bearer_realm: bearer_challenge.then_some("OutilsIA Local Capability Bridge"),
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::io::{Read, Write};
    use std::net::TcpStream;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn valid_payload() -> Value {
        let mut passport = json!({
            "schema": CAPABILITY_DOCUMENT_SCHEMA,
            "document_kind": CAPABILITY_DOCUMENT_KIND,
            "passport_version": CAPABILITY_DOCUMENT_VERSION,
            "assurance": {
                "level": CAPABILITY_ASSURANCE_LEVEL,
                "producer_layer": "tauri_webview",
                "digest_generated_by": "web_crypto_sha256",
                "rust_rederived": false,
                "os_key_attested": false,
                "machine_identity_proven": false,
                "owner_identity_proven": false,
                "provenance_verified": false,
                "portable_unsigned_json": true
            },
            "machine": {"gpu": "RTX test", "ram_gb": 32}
        });
        passport["integrity"] = json!({
            "algorithm": "SHA-256",
            "canonicalization": "recursive-key-sort-json-v1",
            "scope": "canonical_document_without_integrity",
            "identity_signature": false,
            "verification_semantics": "coherence_not_provenance",
            "digest": canonical_sha256(&passport)
        });
        json!({
            "schema": BRIDGE_SCHEMA,
            "contract_version": BRIDGE_CONTRACT_VERSION,
            "read_only": true,
            "permissions": {
                "read_capabilities": true,
                "install_models": false,
                "delete_models": false,
                "run_benchmark": false,
                "run_chat": false,
                "access_personal_files": false,
                "run_backtests": false,
                "execute_trades": false,
                "write_configuration": false
            },
            "privacy": {
                "local_only": true,
                "ephemeral": true,
                "raw_prompts_included": false,
                "raw_model_outputs_included": false,
                "account_tokens_included": false
            },
            "mcp": {
                "read_only": true,
                "actions_exposed": false,
                "transport": "streamable_http",
                "protocol_version": MCP_PROTOCOL_VERSION,
                "tools": MCP_TOOL_NAMES,
                "resources": [
                    "outilsia://passport/current",
                    "outilsia://models/installed",
                    "outilsia://recommendation/current",
                    "outilsia://strategy-arena/handoff"
                ]
            },
            "passport": passport,
            "installed_models": [{"ref": "qwen3:8b"}],
            "recommendation": {"recommended_model": "qwen3:8b"},
            "strategy_arena": {"read_only": true}
        })
    }

    fn request(method: &str, path: &str, token: Option<&str>, origin: Option<&str>) -> HttpRequest {
        let mut headers = HashMap::new();
        headers.insert("host".to_string(), "127.0.0.1:43127".to_string());
        if let Some(value) = token {
            headers.insert("authorization".to_string(), format!("Bearer {value}"));
        }
        if let Some(value) = origin {
            headers.insert("origin".to_string(), value.to_string());
        }
        HttpRequest {
            method: method.to_string(),
            path: path.to_string(),
            headers,
            body: Vec::new(),
        }
    }

    fn mcp_request(body: Value, token: Option<&str>) -> HttpRequest {
        let mut request = request("POST", MCP_PATH, token, None);
        request
            .headers
            .insert("content-type".to_string(), "application/json".to_string());
        request.headers.insert(
            "accept".to_string(),
            "application/json, text/event-stream".to_string(),
        );
        request.body = serde_json::to_vec(&body).expect("json request");
        request
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
    fn payload_contract_rejects_mutation_and_bad_digest() {
        let mut payload = valid_payload();
        assert!(validate_payload(&payload).is_ok());
        payload["permissions"]["install_models"] = Value::Bool(true);
        assert!(validate_payload(&payload).is_err());
        payload["permissions"]["install_models"] = Value::Bool(false);
        payload["mcp"]["actions_exposed"] = Value::Bool(true);
        assert!(validate_payload(&payload).is_err());
        payload["mcp"]["actions_exposed"] = Value::Bool(false);
        payload["passport"]["integrity"]["digest"] = Value::String("bad".to_string());
        assert!(validate_payload(&payload).is_err());
        let mut tampered = valid_payload();
        tampered["passport"]["machine"]["ram_gb"] = json!(64);
        assert!(validate_payload(&tampered).is_err());
    }

    #[test]
    fn snapshot_cannot_claim_signature_attestation_or_provenance() {
        for pointer in [
            "/passport/assurance/rust_rederived",
            "/passport/assurance/os_key_attested",
            "/passport/assurance/machine_identity_proven",
            "/passport/assurance/owner_identity_proven",
            "/passport/assurance/provenance_verified",
            "/passport/integrity/identity_signature",
        ] {
            let mut payload = valid_payload();
            *payload.pointer_mut(pointer).expect("assurance field") = Value::Bool(true);
            let passport = payload.pointer_mut("/passport").expect("passport");
            let unsigned = passport.as_object_mut().expect("passport object");
            unsigned.remove("integrity");
            let digest = canonical_sha256(passport);
            passport["integrity"] = json!({
                "algorithm": "SHA-256",
                "canonicalization": "recursive-key-sort-json-v1",
                "scope": "canonical_document_without_integrity",
                "identity_signature": pointer.ends_with("identity_signature"),
                "verification_semantics": "coherence_not_provenance",
                "digest": digest
            });
            assert!(
                validate_payload(&payload).is_err(),
                "claim should be rejected: {pointer}"
            );
        }
    }

    #[test]
    fn canonical_digest_matches_javascript_reference_vector() {
        let value = json!({
            "z": 1,
            "a": {"é": "x", "b": [true, null, 2.5]},
            "s": "line\n"
        });
        assert_eq!(
            canonical_sha256(&value),
            "14f93d9a6ba6cb1cc852dd480d9b994055129f20d73f880508c037bd84ed57d9"
        );
    }

    #[test]
    fn http_contract_requires_bearer_and_rejects_writes_and_foreign_origins() {
        let payload = valid_payload();
        let serialized = validate_payload(&payload).expect("valid payload");
        let bodies = bridge_bodies(&payload, serialized).expect("valid bodies");
        let token = "b".repeat(64);
        let expires = unix_ms() + 60_000;

        let health = response_for_request(
            &request("GET", "/v1/health", None, None),
            &token,
            &bodies,
            expires,
        );
        assert!(response_status(&health).contains("200 OK"));
        assert!(!String::from_utf8_lossy(&health).contains("qwen3:8b"));

        let unauthorized = response_for_request(
            &request("GET", "/v1/capabilities", None, None),
            &token,
            &bodies,
            expires,
        );
        assert!(response_status(&unauthorized).contains("401 Unauthorized"));

        let authorized = response_for_request(
            &request(
                "GET",
                "/v1/capabilities",
                Some(&token),
                Some("http://127.0.0.1:5173"),
            ),
            &token,
            &bodies,
            expires,
        );
        let authorized_text = String::from_utf8_lossy(&authorized);
        assert!(response_status(&authorized).contains("200 OK"));
        assert!(authorized_text.contains("qwen3:8b"));
        assert!(authorized_text.contains("Access-Control-Allow-Origin: http://127.0.0.1:5173"));
        assert!(authorized_text.contains("Access-Control-Allow-Private-Network: true"));

        let remote_origin = response_for_request(
            &request(
                "GET",
                "/v1/capabilities",
                Some(&token),
                Some("https://strategyarena.io"),
            ),
            &token,
            &bodies,
            expires,
        );
        assert!(response_status(&remote_origin).contains("403 Forbidden"));

        let write = response_for_request(
            &request("POST", "/v1/capabilities", Some(&token), None),
            &token,
            &bodies,
            expires,
        );
        assert!(response_status(&write).contains("405 Method Not Allowed"));

        let foreign = response_for_request(
            &request(
                "GET",
                "/v1/capabilities",
                Some(&token),
                Some("https://example.com"),
            ),
            &token,
            &bodies,
            expires,
        );
        assert!(response_status(&foreign).contains("403 Forbidden"));

        let mut rebound = request("GET", "/v1/capabilities", Some(&token), None);
        rebound
            .headers
            .insert("host".to_string(), "attacker.example".to_string());
        let rebound_response = response_for_request(&rebound, &token, &bodies, expires);
        assert!(response_status(&rebound_response).contains("421 Misdirected Request"));
        rebound
            .headers
            .insert("host".to_string(), "127.0.0.1:43127:evil".to_string());
        let malformed_host = response_for_request(&rebound, &token, &bodies, expires);
        assert!(response_status(&malformed_host).contains("421 Misdirected Request"));
    }

    #[test]
    fn bridge_binds_loopback_and_stops_without_persisting_token() {
        let _guard = TEST_LOCK.lock().expect("test lock");
        let started = start_local_capability_bridge(LocalCapabilityBridgeRequest {
            payload: valid_payload(),
            ttl_seconds: Some(60),
        })
        .expect("bridge start");
        assert!(started.running);
        assert!(started.base_url.starts_with("http://127.0.0.1:"));
        assert_eq!(started.mcp_url, format!("{}/mcp", started.base_url));
        assert_eq!(started.mcp_protocol_version, MCP_PROTOCOL_VERSION);
        assert_eq!(started.mcp_server_version, MCP_SERVER_VERSION);
        assert_eq!(started.mcp_tools.len(), MCP_TOOL_NAMES.len());
        assert!(started.endpoints.contains(&MCP_PATH.to_string()));
        assert_eq!(started.token.len(), 64);
        assert!(!started.token_persisted);

        let port = started
            .base_url
            .rsplit(':')
            .next()
            .and_then(|value| value.parse::<u16>().ok())
            .expect("bridge port");
        let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("loopback connect");
        stream
            .write_all(b"GET /v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
            .expect("health request");
        let mut response = String::new();
        stream
            .read_to_string(&mut response)
            .expect("health response");
        assert!(response.starts_with("HTTP/1.1 200 OK"));

        let stopped = stop_local_capability_bridge().expect("bridge stop");
        assert!(!stopped.running);
        assert!(!stopped.token_exposed);
    }

    #[test]
    fn mcp_streamable_http_works_over_the_loopback_socket() {
        let _guard = TEST_LOCK.lock().expect("test lock");
        let started = start_local_capability_bridge(LocalCapabilityBridgeRequest {
            payload: valid_payload(),
            ttl_seconds: Some(60),
        })
        .expect("bridge start");
        let port = started
            .base_url
            .rsplit(':')
            .next()
            .and_then(|value| value.parse::<u16>().ok())
            .expect("bridge port");
        let body = serde_json::to_vec(&json!({
            "jsonrpc": "2.0",
            "id": "network-tools",
            "method": "tools/list",
            "params": {}
        }))
        .expect("request body");
        let headers = format!(
            "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nConnection: close\r\nContent-Length: {}\r\n\r\n",
            started.token,
            body.len()
        );
        let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("loopback connect");
        stream
            .write_all(headers.as_bytes())
            .expect("request headers");
        stream.write_all(&body).expect("request body");
        let mut response = Vec::new();
        stream.read_to_end(&mut response).expect("mcp response");
        assert!(response_status(&response).contains("200 OK"));
        let response_text = String::from_utf8_lossy(&response);
        assert!(response_text.contains("MCP-Protocol-Version: 2025-11-25"));
        let response_body = response_json(&response);
        assert_eq!(
            response_body.pointer("/id").and_then(Value::as_str),
            Some("network-tools")
        );
        assert_eq!(
            response_body
                .pointer("/result/tools")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(MCP_TOOL_NAMES.len())
        );
        assert!(!response_text.contains(&started.token));
        stop_local_capability_bridge().expect("bridge stop");
    }

    #[test]
    #[ignore = "requires Node.js and npm ci for the official MCP SDK"]
    fn official_mcp_sdk_conforms_to_read_only_server() {
        let _guard = TEST_LOCK.lock().expect("test lock");
        let started = start_local_capability_bridge(LocalCapabilityBridgeRequest {
            payload: valid_payload(),
            ttl_seconds: Some(60),
        })
        .expect("bridge start");
        let probe = crate::mcp_sdk_conformance::run_sdk_probe(
            "read_only",
            &started.mcp_url,
            &started.token,
            true,
        );
        let stopped = stop_local_capability_bridge().expect("bridge stop");
        assert!(!stopped.running);
        let report = probe.expect("official MCP SDK read-only conformance");
        assert_eq!(
            report.get("sdk").and_then(Value::as_str),
            Some("@modelcontextprotocol/sdk@1.30.0")
        );
        assert_eq!(report.get("tool_count").and_then(Value::as_u64), Some(8));
        assert_eq!(
            report.get("resource_count").and_then(Value::as_u64),
            Some(4)
        );
        assert_eq!(report.get("tool_calls").and_then(Value::as_u64), Some(8));
        assert_eq!(
            report.get("resource_reads").and_then(Value::as_u64),
            Some(4)
        );
        assert_eq!(
            report.get("forbidden_rejected").and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            report.get("actions_started").and_then(Value::as_bool),
            Some(false)
        );
    }

    #[test]
    fn mcp_loopback_handles_a_short_request_burst() {
        let _guard = TEST_LOCK.lock().expect("test lock");
        let started = start_local_capability_bridge(LocalCapabilityBridgeRequest {
            payload: valid_payload(),
            ttl_seconds: Some(60),
        })
        .expect("bridge start");
        let port = started
            .base_url
            .rsplit(':')
            .next()
            .and_then(|value| value.parse::<u16>().ok())
            .expect("bridge port");

        for request_id in 0..64 {
            let body = serde_json::to_vec(&json!({
                "jsonrpc": "2.0",
                "id": request_id,
                "method": "ping"
            }))
            .expect("request body");
            let headers = format!(
                "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nAccept: application/json\r\nConnection: close\r\nContent-Length: {}\r\n\r\n",
                started.token,
                body.len()
            );
            let mut stream =
                TcpStream::connect(("127.0.0.1", port)).expect("loopback burst connect");
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .expect("read timeout");
            stream
                .write_all(headers.as_bytes())
                .expect("request headers");
            stream.write_all(&body).expect("request body");
            let mut response = Vec::new();
            stream
                .read_to_end(&mut response)
                .expect("complete burst response");
            assert!(response_status(&response).contains("200 OK"));
            assert_eq!(
                response_json(&response)
                    .pointer("/id")
                    .and_then(Value::as_u64),
                Some(request_id)
            );
        }

        stop_local_capability_bridge().expect("bridge stop");
    }

    #[test]
    fn mcp_contract_lists_and_calls_only_read_only_snapshot_tools() {
        let payload = valid_payload();
        let serialized = validate_payload(&payload).expect("valid payload");
        let bodies = bridge_bodies(&payload, serialized).expect("valid bodies");
        let token = "c".repeat(64);
        let expires = unix_ms() + 60_000;

        let initialize = response_for_request(
            &mcp_request(
                json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": MCP_PROTOCOL_VERSION,
                        "capabilities": {},
                        "clientInfo": {"name": "bridge-test", "version": "1.0"}
                    }
                }),
                Some(&token),
            ),
            &token,
            &bodies,
            expires,
        );
        assert!(response_status(&initialize).contains("200 OK"));
        let initialized = response_json(&initialize);
        assert_eq!(
            initialized
                .pointer("/result/protocolVersion")
                .and_then(Value::as_str),
            Some(MCP_PROTOCOL_VERSION)
        );
        assert_eq!(
            initialized
                .pointer("/result/serverInfo/version")
                .and_then(Value::as_str),
            Some(MCP_SERVER_VERSION)
        );

        let listed = response_for_request(
            &mcp_request(
                json!({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}),
                Some(&token),
            ),
            &token,
            &bodies,
            expires,
        );
        let listed_json = response_json(&listed);
        let tools = listed_json
            .pointer("/result/tools")
            .and_then(Value::as_array)
            .expect("tools array");
        assert_eq!(tools.len(), MCP_TOOL_NAMES.len());
        for tool in tools {
            assert_eq!(
                tool.pointer("/annotations/readOnlyHint")
                    .and_then(Value::as_bool),
                Some(true)
            );
            assert_eq!(
                tool.pointer("/annotations/destructiveHint")
                    .and_then(Value::as_bool),
                Some(false)
            );
            assert_eq!(
                tool.pointer("/annotations/openWorldHint")
                    .and_then(Value::as_bool),
                Some(false)
            );
        }

        let called = response_for_request(
            &mcp_request(
                json!({
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "tools/call",
                    "params": {
                        "name": "outilsia_get_machine_profile",
                        "arguments": {}
                    }
                }),
                Some(&token),
            ),
            &token,
            &bodies,
            expires,
        );
        let called_text = String::from_utf8_lossy(&called);
        assert!(called_text.contains("RTX test"));
        assert!(!called_text.contains(&token));
        let called_json = response_json(&called);
        assert_eq!(
            called_json
                .pointer("/result/structuredContent/schema")
                .and_then(Value::as_str),
            Some("outilsia.local_mcp_machine_profile.v1")
        );

        let forbidden = response_for_request(
            &mcp_request(
                json!({
                    "jsonrpc": "2.0",
                    "id": 4,
                    "method": "tools/call",
                    "params": {"name": "install_ollama_model", "arguments": {}}
                }),
                Some(&token),
            ),
            &token,
            &bodies,
            expires,
        );
        assert_eq!(
            response_json(&forbidden)
                .pointer("/error/code")
                .and_then(Value::as_i64),
            Some(-32602)
        );

        let unauthorized = response_for_request(
            &mcp_request(
                json!({"jsonrpc": "2.0", "id": 5, "method": "tools/list", "params": {}}),
                None,
            ),
            &token,
            &bodies,
            expires,
        );
        assert!(response_status(&unauthorized).contains("401 Unauthorized"));
    }
}
