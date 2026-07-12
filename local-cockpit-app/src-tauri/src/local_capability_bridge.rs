use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const BRIDGE_SCHEMA: &str = "outilsia.local_capability_bridge.v1";
const BRIDGE_CONTRACT_VERSION: &str = "2026-07-12";
const DEFAULT_TTL_SECONDS: u64 = 15 * 60;
const MIN_TTL_SECONDS: u64 = 60;
const MAX_TTL_SECONDS: u64 = 30 * 60;
const MAX_PAYLOAD_BYTES: usize = 1024 * 1024;
const MAX_REQUEST_BYTES: usize = 16 * 1024;
const MAX_REQUESTS_PER_SESSION: usize = 240;

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
}

#[derive(Debug)]
struct HttpRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
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

fn canonical_json(value: &Value, output: &mut String) {
    match value {
        Value::Null => output.push_str("null"),
        Value::Bool(value) => output.push_str(if *value { "true" } else { "false" }),
        Value::Number(value) => output.push_str(&value.to_string()),
        Value::String(value) => {
            output.push_str(&serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string()))
        }
        Value::Array(values) => {
            output.push('[');
            for (index, item) in values.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                canonical_json(item, output);
            }
            output.push(']');
        }
        Value::Object(values) => {
            output.push('{');
            let mut keys = values.keys().collect::<Vec<_>>();
            keys.sort_unstable();
            for (index, key) in keys.into_iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                output.push_str(&serde_json::to_string(key).unwrap_or_else(|_| "\"\"".to_string()));
                output.push(':');
                canonical_json(&values[key], output);
            }
            output.push('}');
        }
    }
}

fn canonical_sha256(value: &Value) -> String {
    let mut canonical = String::new();
    canonical_json(value, &mut canonical);
    let digest = Sha256::digest(canonical.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn verify_passport_integrity(passport: &Value) -> Result<(), String> {
    if passport
        .pointer("/integrity/algorithm")
        .and_then(Value::as_str)
        != Some("SHA-256")
    {
        return Err("Algorithme d'integrite du Passport invalide.".to_string());
    }
    if passport
        .pointer("/integrity/canonicalization")
        .and_then(Value::as_str)
        != Some("recursive-key-sort-json-v1")
    {
        return Err("Canonicalisation du Passport invalide.".to_string());
    }
    let expected = passport
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !is_sha256(&expected) {
        return Err("Empreinte SHA-256 du Passport invalide.".to_string());
    }
    let mut unsigned = passport.clone();
    if let Some(object) = unsigned.as_object_mut() {
        object.remove("integrity");
    }
    let actual = canonical_sha256(&unsigned);
    if !constant_time_eq(&expected, &actual) {
        return Err("Integrite du Passport non verifiee.".to_string());
    }
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

    if payload.pointer("/passport/schema").and_then(Value::as_str)
        != Some("outilsia.ai_capability_passport.v1")
    {
        return Err("AI Capability Passport v1 requis.".to_string());
    }
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
        .map_err(|err| format!("Passport local illisible: {err}"))?;
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
        base_url,
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
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|err| format!("Ouverture de la passerelle locale impossible: {err}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|err| format!("Configuration de la passerelle locale impossible: {err}"))?;
    let port = listener
        .local_addr()
        .map_err(|err| format!("Adresse de passerelle locale indisponible: {err}"))?
        .port();
    let base_url = format!("http://127.0.0.1:{port}");
    let token = generate_token()?;
    let expires_at_ms = unix_ms() + u128::from(ttl_seconds) * 1000;
    let shutdown = Arc::new(AtomicBool::new(false));
    let alive = Arc::new(AtomicBool::new(true));

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
    thread::spawn(move || {
        serve_bridge(
            listener,
            server_token,
            bodies,
            expires_at_ms,
            shutdown,
            &alive,
        );
        alive.store(false, Ordering::SeqCst);
    });

    Ok(LocalCapabilityBridgeStart {
        schema: BRIDGE_SCHEMA.to_string(),
        contract_version: BRIDGE_CONTRACT_VERSION.to_string(),
        running: true,
        base_url,
        token,
        expires_at_ms,
        ttl_seconds,
        bind: "127.0.0.1".to_string(),
        read_only: true,
        token_persisted: false,
        endpoints: vec![
            "/v1/health".to_string(),
            "/v1/capabilities".to_string(),
            "/v1/passport".to_string(),
            "/v1/models".to_string(),
            "/v1/strategy-arena".to_string(),
        ],
        allowed_origins: vec![
            "https://strategyarena.io".to_string(),
            "https://www.strategyarena.io".to_string(),
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
    listener: TcpListener,
    token: String,
    bodies: BridgeBodies,
    expires_at_ms: u128,
    shutdown: Arc<AtomicBool>,
    alive: &Arc<AtomicBool>,
) {
    let mut request_count = 0_usize;
    while !shutdown.load(Ordering::SeqCst) && unix_ms() < expires_at_ms {
        match listener.accept() {
            Ok((mut stream, peer)) => {
                request_count += 1;
                let response = if !peer.ip().is_loopback() {
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
                    match read_request(&stream) {
                        Ok(request) => {
                            response_for_request(&request, &token, &bodies, expires_at_ms)
                        }
                        Err(error) => {
                            json_response(400, "Bad Request", &json!({"error": error}), None, false)
                        }
                    }
                };
                let _ = stream.write_all(&response);
                let _ = stream.flush();
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(25));
            }
            Err(_) => thread::sleep(Duration::from_millis(50)),
        }
    }
    alive.store(false, Ordering::SeqCst);
}

fn read_request(stream: &TcpStream) -> Result<HttpRequest, String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|_| "read_timeout_unavailable".to_string())?;
    let clone = stream
        .try_clone()
        .map_err(|_| "request_stream_unavailable".to_string())?;
    let mut reader = BufReader::new(clone);
    let mut first = String::new();
    let mut total = reader
        .read_line(&mut first)
        .map_err(|_| "request_line_unreadable".to_string())?;
    if first.len() > 4096 || total == 0 {
        return Err("request_line_invalid".to_string());
    }
    let parts = first.split_whitespace().collect::<Vec<_>>();
    if parts.len() != 3 || !parts[2].starts_with("HTTP/1.") {
        return Err("request_line_invalid".to_string());
    }
    let mut headers = HashMap::new();
    loop {
        let mut line = String::new();
        let read = reader
            .read_line(&mut line)
            .map_err(|_| "request_headers_unreadable".to_string())?;
        total += read;
        if total > MAX_REQUEST_BYTES {
            return Err("request_too_large".to_string());
        }
        if read == 0 || line == "\r\n" || line == "\n" {
            break;
        }
        let Some((name, value)) = line.split_once(':') else {
            return Err("request_header_invalid".to_string());
        };
        headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
    }
    Ok(HttpRequest {
        method: parts[0].to_string(),
        path: parts[1].to_string(),
        headers,
    })
}

fn local_dev_origin(origin: &str, prefix: &str) -> bool {
    if origin == prefix.trim_end_matches(':') {
        return true;
    }
    origin
        .strip_prefix(prefix)
        .and_then(|port| port.parse::<u16>().ok())
        .is_some()
}

fn allowed_origin(origin: &str) -> bool {
    matches!(
        origin,
        "https://strategyarena.io" | "https://www.strategyarena.io"
    ) || local_dev_origin(origin, "http://localhost:")
        || local_dev_origin(origin, "http://127.0.0.1:")
}

fn allowed_host(host: &str) -> bool {
    let normalized = host.trim().to_ascii_lowercase();
    ["127.0.0.1", "localhost"].iter().any(|name| {
        normalized == *name
            || normalized
                .strip_prefix(&format!("{name}:"))
                .and_then(|port| port.parse::<u16>().ok())
                .is_some()
    })
}

fn constant_time_eq(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.as_bytes()
        .iter()
        .zip(right.as_bytes())
        .fold(0_u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

fn authorized(request: &HttpRequest, expected_token: &str) -> bool {
    request
        .headers
        .get("authorization")
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(|token| constant_time_eq(expected_token, token))
        .unwrap_or(false)
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

fn json_response(
    status: u16,
    label: &str,
    body: &Value,
    origin: Option<&str>,
    bearer_challenge: bool,
) -> Vec<u8> {
    let bytes = if status == 204 {
        Vec::new()
    } else {
        serde_json::to_vec(body).unwrap_or_else(|_| b"{\"error\":\"serialization\"}".to_vec())
    };
    raw_json_response(status, label, &bytes, origin, bearer_challenge)
}

fn raw_json_response(
    status: u16,
    label: &str,
    body: &[u8],
    origin: Option<&str>,
    bearer_challenge: bool,
) -> Vec<u8> {
    let mut headers = vec![
        format!("HTTP/1.1 {status} {label}"),
        "Content-Type: application/json; charset=utf-8".to_string(),
        format!("Content-Length: {}", body.len()),
        "Connection: close".to_string(),
        "Cache-Control: no-store, max-age=0".to_string(),
        "Pragma: no-cache".to_string(),
        "X-Content-Type-Options: nosniff".to_string(),
        "Content-Security-Policy: default-src 'none'; frame-ancestors 'none'".to_string(),
        "Referrer-Policy: no-referrer".to_string(),
        "Access-Control-Allow-Methods: GET, OPTIONS".to_string(),
        "Access-Control-Allow-Headers: Authorization".to_string(),
        "Access-Control-Max-Age: 60".to_string(),
        "Vary: Origin".to_string(),
    ];
    if let Some(value) = origin.filter(|value| allowed_origin(value)) {
        headers.push(format!("Access-Control-Allow-Origin: {value}"));
        headers.push("Access-Control-Allow-Private-Network: true".to_string());
    }
    if bearer_challenge {
        headers.push(
            "WWW-Authenticate: Bearer realm=\"OutilsIA Local Capability Bridge\"".to_string(),
        );
    }
    headers.push(String::new());
    headers.push(String::new());
    let mut response = headers.join("\r\n").into_bytes();
    response.extend_from_slice(body);
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn valid_payload() -> Value {
        let mut passport = json!({
            "schema": "outilsia.ai_capability_passport.v1",
            "passport_version": "1.2.0",
            "machine": {"gpu": "RTX test", "ram_gb": 32}
        });
        passport["integrity"] = json!({
            "algorithm": "SHA-256",
            "canonicalization": "recursive-key-sort-json-v1",
            "scope": "canonical_document_without_integrity",
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
        }
    }

    fn response_status(response: &[u8]) -> &str {
        std::str::from_utf8(response)
            .unwrap_or_default()
            .lines()
            .next()
            .unwrap_or_default()
    }

    #[test]
    fn payload_contract_rejects_mutation_and_bad_digest() {
        let mut payload = valid_payload();
        assert!(validate_payload(&payload).is_ok());
        payload["permissions"]["install_models"] = Value::Bool(true);
        assert!(validate_payload(&payload).is_err());
        payload["permissions"]["install_models"] = Value::Bool(false);
        payload["passport"]["integrity"]["digest"] = Value::String("bad".to_string());
        assert!(validate_payload(&payload).is_err());
        let mut tampered = valid_payload();
        tampered["passport"]["machine"]["ram_gb"] = json!(64);
        assert!(validate_payload(&tampered).is_err());
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
                Some("https://strategyarena.io"),
            ),
            &token,
            &bodies,
            expires,
        );
        let authorized_text = String::from_utf8_lossy(&authorized);
        assert!(response_status(&authorized).contains("200 OK"));
        assert!(authorized_text.contains("qwen3:8b"));
        assert!(authorized_text.contains("Access-Control-Allow-Origin: https://strategyarena.io"));
        assert!(authorized_text.contains("Access-Control-Allow-Private-Network: true"));

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
            .write_all(b"GET /v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
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
}
