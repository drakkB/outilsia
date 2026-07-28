use crate::workstack_composer::canonical_sha256;
use crate::{get_app_build_info, prepare_benchmark_prompt, validate_ollama_model_ref};
use crate::{BenchmarkResult, MachineScan};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

pub(crate) const CONTRIBUTION_SCHEMA: &str = "outilsia.benchmark_commons.contribution.v1";
pub(crate) const RECEIPT_SCHEMA: &str = "outilsia.benchmark_commons.receipt.v1";
pub(crate) const SERVER_RECEIPT_SCHEMA: &str = "outilsia.benchmark_commons.server_receipt.v1";
pub(crate) const SERVER_REVOCATION_SCHEMA: &str = "outilsia.benchmark_commons.server_revocation.v1";
const PREPARE_REQUEST_SCHEMA: &str = "outilsia.benchmark_commons.prepare_request.v1";
const PREPARE_RESULT_SCHEMA: &str = "outilsia.benchmark_commons.prepare_result.v1";
const APPROVE_REQUEST_SCHEMA: &str = "outilsia.benchmark_commons.approve_request.v1";
const EXPORT_REQUEST_SCHEMA: &str = "outilsia.benchmark_commons.export_request.v1";
const REVOKE_REQUEST_SCHEMA: &str = "outilsia.benchmark_commons.revoke_request.v1";
const ROTATE_REQUEST_SCHEMA: &str = "outilsia.benchmark_commons.rotate_request.v1";
const NETWORK_SUBMIT_REQUEST_SCHEMA: &str = "outilsia.benchmark_commons.network_submit_request.v1";
const NETWORK_REVOKE_REQUEST_SCHEMA: &str = "outilsia.benchmark_commons.network_revoke_request.v1";
const STATUS_SCHEMA: &str = "outilsia.benchmark_commons.status.v1";
const REGISTRY_SCHEMA: &str = "outilsia.benchmark_commons.local_registry.v1";
const REVOCATION_SCHEMA: &str = "outilsia.benchmark_commons.revocation.v1";
const CONTRACT_VERSION: &str = "2026-07-28";
const REGISTRY_FILENAME: &str = "registry-v1.json";
const ROTATION_MS: u128 = 30 * 24 * 60 * 60 * 1000;
const PREVIEW_TTL_MS: u128 = 15 * 60 * 1000;
const APPROVAL_TTL_MS: u128 = 2 * 60 * 1000;
const MAX_BENCHMARK_AGE_MS: u128 = 30 * 24 * 60 * 60 * 1000;
const MAX_PREPARED: usize = 16;
const MAX_EXPORTS: usize = 200;
const MAX_REVOCATIONS: usize = 200;
const MAX_REGISTRY_BYTES: usize = 2 * 1024 * 1024;
const STANDARD_BENCHMARK_QUESTION: &str = "Pourquoi la VRAM est importante pour un LLM local ?";

pub(crate) fn benchmark_commons_upload_enabled() -> bool {
    matches!(
        option_env!("OUTILSIA_BENCHMARK_COMMONS_UPLOAD"),
        Some("1") | Some("true") | Some("enabled")
    )
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct PrepareContributionRequest {
    schema: String,
    scan: MachineScan,
    benchmark: BenchmarkResult,
    runtime: String,
    destination: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ApproveContributionRequest {
    schema: String,
    request_id: String,
    plan_sha256: String,
    privacy_acknowledged: bool,
    not_field_proof_acknowledged: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ExportContributionRequest {
    schema: String,
    request_id: String,
    plan_sha256: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct RevokeContributionRequest {
    schema: String,
    contribution_id: String,
    document_sha256: String,
    confirmed_in_native_ui: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct RotatePseudonymRequest {
    schema: String,
    confirmed_in_native_ui: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct SubmitContributionNetworkRequest {
    pub(crate) schema: String,
    pub(crate) machine_id: u64,
    pub(crate) contribution_id: String,
    pub(crate) document_sha256: String,
    pub(crate) confirmed_in_native_ui: bool,
    pub(crate) privacy_reviewed: bool,
    pub(crate) not_field_proof_acknowledged: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct RevokeContributionNetworkRequest {
    pub(crate) schema: String,
    pub(crate) contribution_id: String,
    pub(crate) document_sha256: String,
    pub(crate) confirmed_in_native_ui: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PreparedState {
    AwaitingHuman,
    Approved,
    Exported,
}

impl PreparedState {
    fn as_str(self) -> &'static str {
        match self {
            Self::AwaitingHuman => "awaiting_human",
            Self::Approved => "approved",
            Self::Exported => "exported",
        }
    }
}

#[derive(Debug, Clone)]
struct PreparedContribution {
    request_id: String,
    contribution_id: String,
    contribution: Value,
    document_sha256: String,
    observation_sha256: String,
    plan_sha256: String,
    destination: String,
    created_at_ms: u128,
    expires_at_ms: u128,
    approved_at_ms: Option<u128>,
    approval_expires_at_ms: Option<u128>,
    state: PreparedState,
}

#[derive(Default)]
struct Runtime {
    prepared: HashMap<String, PreparedContribution>,
    network_in_flight: HashSet<String>,
}

#[derive(Default)]
pub(crate) struct BenchmarkCommonsState(Mutex<Runtime>);

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn random_hex(bytes_len: usize) -> Result<String, String> {
    let mut bytes = vec![0_u8; bytes_len];
    getrandom::fill(&mut bytes)
        .map_err(|_| "Entropie locale Benchmark Commons indisponible.".to_string())?;
    Ok(bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>())
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn finite_in_range(value: f64, min: f64, max: f64) -> bool {
    value.is_finite() && value >= min && value <= max
}

fn clean_label(value: Option<&str>, fallback: &str, max_chars: usize) -> String {
    let normalized = value
        .unwrap_or_default()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let trimmed = normalized.chars().take(max_chars).collect::<String>();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed
    }
}

fn os_family(value: Option<&str>) -> &'static str {
    let normalized = value.unwrap_or_default().to_ascii_lowercase();
    if normalized.contains("windows") {
        "windows"
    } else if normalized.contains("linux") || normalized.contains("ubuntu") {
        "linux"
    } else if normalized.contains("mac") || normalized.contains("darwin") {
        "macos"
    } else {
        "other"
    }
}

fn normalize_runtime(value: &str) -> Result<&'static str, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "native" | "ollama" | "windows" | "linux" => Ok("native"),
        "wsl" | "ollama-wsl" => Ok("wsl"),
        _ => Err("Runtime Benchmark Commons non autorise.".to_string()),
    }
}

fn normalize_destination(value: &str) -> Result<&'static str, String> {
    match value.trim() {
        "app_data" => Ok("app_data"),
        "downloads" => Ok("downloads"),
        _ => Err("Destination Benchmark Commons non autorisee.".to_string()),
    }
}

fn ollama_version(scan: &MachineScan, runtime: &str) -> String {
    let pointer = if runtime == "wsl" {
        "/ollama_wsl/version"
    } else {
        "/ollama/version"
    };
    clean_label(
        scan.runtimes.pointer(pointer).and_then(Value::as_str),
        "unknown",
        80,
    )
}

fn sign_document(document: &mut Value) -> Result<String, String> {
    document
        .as_object_mut()
        .ok_or_else(|| "Document Benchmark Commons invalide.".to_string())?
        .remove("integrity");
    let digest = canonical_sha256(document);
    document["integrity"] = json!({
        "algorithm": "SHA-256",
        "canonicalization": "recursive-key-sort-json-v1",
        "scope": "canonical_document_without_integrity",
        "digest": digest
    });
    Ok(digest)
}

fn verify_document(document: &Value, schema: &str, label: &str) -> Result<String, String> {
    if document.get("schema").and_then(Value::as_str) != Some(schema) {
        return Err(format!("Schema {label} invalide."));
    }
    let expected = document
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .filter(|value| is_sha256(value))
        .ok_or_else(|| format!("Empreinte {label} absente."))?;
    let mut unsigned = document.clone();
    unsigned
        .as_object_mut()
        .ok_or_else(|| format!("Document {label} invalide."))?
        .remove("integrity");
    if canonical_sha256(&unsigned) != expected {
        return Err(format!("Empreinte {label} incoherente."));
    }
    Ok(expected.to_string())
}

fn validate_privacy(document: &Value) -> Result<(), String> {
    let privacy = document
        .get("privacy")
        .ok_or_else(|| "Bloc confidentialite Benchmark Commons absent.".to_string())?;
    for field in [
        "prompt_included",
        "model_output_included",
        "raw_scan_included",
        "machine_key_included",
        "hostname_included",
        "account_included",
        "token_included",
        "file_path_included",
        "personal_file_included",
        "network_sent",
    ] {
        if privacy.get(field).and_then(Value::as_bool) != Some(false) {
            return Err(format!("Garantie de confidentialite {field} invalide."));
        }
    }
    Ok(())
}

pub(crate) fn validate_contribution(document: &Value) -> Result<String, String> {
    let digest = verify_document(document, CONTRIBUTION_SCHEMA, "de contribution")?;
    if document.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || !document
            .get("contribution_id")
            .and_then(Value::as_str)
            .is_some_and(|value| value.starts_with("bc-") && value.len() == 27)
        || !document
            .pointer("/contributor/pseudonym")
            .and_then(Value::as_str)
            .is_some_and(|value| value.starts_with("anon-") && value.len() == 29)
        || !document
            .pointer("/proof/observation_sha256")
            .and_then(Value::as_str)
            .is_some_and(is_sha256)
        || document
            .pointer("/proof/field_test_proof")
            .and_then(Value::as_bool)
            != Some(false)
        || document
            .pointer("/proof/community_verified")
            .and_then(Value::as_bool)
            != Some(false)
        || document
            .pointer("/proof/leaderboard_eligible")
            .and_then(Value::as_bool)
            != Some(false)
        || document
            .pointer("/observation/protocol/prompt_included")
            .and_then(Value::as_bool)
            != Some(false)
        || document
            .pointer("/observation/protocol/standard_prompt_sha256")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
    {
        return Err("Contribution Benchmark Commons non conforme.".to_string());
    }
    validate_privacy(document)?;
    let serialized = serde_json::to_string(document)
        .map_err(|_| "Contribution Benchmark Commons illisible.".to_string())?;
    for forbidden in [
        "\"machine_key\"",
        "\"raw_scan\"",
        "\"prompt\"",
        "\"output_preview\"",
        "\"output_text\"",
        "\"hostname\"",
        "\"account_email\"",
        "\"desktop_token\"",
        "\"path\"",
    ] {
        if serialized.contains(forbidden) {
            return Err(format!("Champ interdit dans la contribution: {forbidden}."));
        }
    }
    Ok(digest)
}

pub(crate) fn validate_receipt(receipt: &Value) -> Result<String, String> {
    let digest = verify_document(receipt, RECEIPT_SCHEMA, "du recu Benchmark Commons")?;
    let action = receipt.get("action").and_then(Value::as_str);
    let human_status = receipt
        .pointer("/human_decision/status")
        .and_then(Value::as_str);
    if receipt.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || !matches!(action, Some("export" | "revoke"))
        || !receipt
            .get("contribution_id")
            .and_then(Value::as_str)
            .is_some_and(|value| value.starts_with("bc-"))
        || !receipt
            .get("observation_sha256")
            .and_then(Value::as_str)
            .is_some_and(is_sha256)
        || !receipt
            .get("document_sha256")
            .and_then(Value::as_str)
            .is_some_and(is_sha256)
        || receipt.pointer("/network/sent").and_then(Value::as_bool) != Some(false)
        || receipt
            .pointer("/proof/field_test_proof")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/proof/community_verified")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/proof/leaderboard_eligible")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/human_decision/native_ui")
            .and_then(Value::as_bool)
            != Some(true)
        || (action == Some("export") && human_status != Some("explicitly_approved_in_native_ui"))
        || (action == Some("revoke") && human_status != Some("explicitly_revoked_in_native_ui"))
    {
        return Err("Recu Benchmark Commons non conforme.".to_string());
    }
    validate_privacy(receipt)?;
    Ok(digest)
}

fn has_exact_keys(value: &Value, expected: &[&str]) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    object.len() == expected.len() && expected.iter().all(|key| object.contains_key(*key))
}

fn validate_server_integrity_envelope(document: &Value) -> Result<String, String> {
    let integrity = document
        .get("server_integrity")
        .ok_or_else(|| "Signature serveur Benchmark Commons absente.".to_string())?;
    if !has_exact_keys(
        integrity,
        &["algorithm", "canonicalization", "scope", "key_id", "digest"],
    ) || integrity.get("algorithm").and_then(Value::as_str) != Some("HMAC-SHA256")
        || integrity.get("canonicalization").and_then(Value::as_str)
            != Some("recursive-key-sort-json-v1")
        || integrity.get("scope").and_then(Value::as_str)
            != Some("canonical_document_without_server_integrity")
        || integrity.get("key_id").and_then(Value::as_str) != Some("benchmark-commons-server-v1")
    {
        return Err("Enveloppe de signature serveur non conforme.".to_string());
    }
    integrity
        .get("digest")
        .and_then(Value::as_str)
        .filter(|value| is_sha256(value))
        .map(str::to_string)
        .ok_or_else(|| "Empreinte du recu serveur invalide.".to_string())
}

pub(crate) fn validate_server_submission_receipt(
    receipt: &Value,
    contribution_id: &str,
    observation_sha256: &str,
    document_sha256: &str,
) -> Result<String, String> {
    if !has_exact_keys(
        receipt,
        &[
            "schema",
            "contract_version",
            "status",
            "contribution_id",
            "observation_sha256",
            "document_sha256",
            "accepted_at_ms",
            "verification",
            "network",
            "proof",
            "privacy",
            "revocation",
            "retention",
            "server_integrity",
        ],
    ) || receipt.get("schema").and_then(Value::as_str) != Some(SERVER_RECEIPT_SCHEMA)
        || receipt.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || receipt.get("status").and_then(Value::as_str) != Some("accepted")
        || receipt.get("contribution_id").and_then(Value::as_str) != Some(contribution_id)
        || receipt.get("observation_sha256").and_then(Value::as_str) != Some(observation_sha256)
        || receipt.get("document_sha256").and_then(Value::as_str) != Some(document_sha256)
        || receipt
            .get("accepted_at_ms")
            .and_then(Value::as_u64)
            .is_none()
    {
        return Err("Recu de soumission serveur detache de la contribution.".to_string());
    }
    let verification = receipt
        .get("verification")
        .ok_or_else(|| "Verification serveur absente.".to_string())?;
    if !has_exact_keys(
        verification,
        &[
            "document_integrity",
            "machine_account_match",
            "benchmark_account_match",
            "server_deduplicated",
            "cohort_key",
        ],
    ) || verification
        .get("document_integrity")
        .and_then(Value::as_bool)
        != Some(true)
        || verification
            .get("machine_account_match")
            .and_then(Value::as_bool)
            != Some(true)
        || verification
            .get("benchmark_account_match")
            .and_then(Value::as_bool)
            != Some(true)
        || verification
            .get("server_deduplicated")
            .and_then(Value::as_bool)
            != Some(true)
        || verification
            .get("cohort_key")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
    {
        return Err("Verification du recu serveur incomplete.".to_string());
    }
    let network = receipt
        .get("network")
        .ok_or_else(|| "Trace reseau serveur absente.".to_string())?;
    if !has_exact_keys(network, &["received", "transport"])
        || network.get("received").and_then(Value::as_bool) != Some(true)
        || network.get("transport").and_then(Value::as_str) != Some("authenticated_https_candidate")
    {
        return Err("Trace reseau serveur invalide.".to_string());
    }
    let proof = receipt
        .get("proof")
        .ok_or_else(|| "Limites de preuve serveur absentes.".to_string())?;
    if !has_exact_keys(
        proof,
        &[
            "field_test_proof",
            "community_verified",
            "leaderboard_eligible",
        ],
    ) || proof.get("field_test_proof").and_then(Value::as_bool) != Some(false)
        || proof.get("community_verified").and_then(Value::as_bool) != Some(false)
        || proof.get("leaderboard_eligible").and_then(Value::as_bool) != Some(false)
    {
        return Err("Le recu serveur surestime la preuve.".to_string());
    }
    let privacy = receipt
        .get("privacy")
        .ok_or_else(|| "Garanties de confidentialite serveur absentes.".to_string())?;
    if !has_exact_keys(
        privacy,
        &[
            "account_identifier_returned",
            "machine_identifier_returned",
            "subject_key_returned",
            "ip_stored_in_commons_record",
            "user_agent_stored_in_commons_record",
            "raw_prompt_stored",
            "model_output_stored",
        ],
    ) || privacy
        .as_object()
        .is_none_or(|object| object.values().any(|value| value.as_bool() != Some(false)))
    {
        return Err("Garanties de confidentialite serveur invalides.".to_string());
    }
    let revocation = receipt
        .get("revocation")
        .ok_or_else(|| "Contrat de revocation serveur absent.".to_string())?;
    let retention = receipt
        .get("retention")
        .ok_or_else(|| "Contrat de retention serveur absent.".to_string())?;
    if !has_exact_keys(revocation, &["available_to_authenticated_owner"])
        || revocation
            .get("available_to_authenticated_owner")
            .and_then(Value::as_bool)
            != Some(true)
        || !has_exact_keys(retention, &["maximum_days", "revocation_supported"])
        || retention.get("maximum_days").and_then(Value::as_u64) != Some(180)
        || retention
            .get("revocation_supported")
            .and_then(Value::as_bool)
            != Some(true)
    {
        return Err("Retention ou revocation serveur non conforme.".to_string());
    }
    validate_server_integrity_envelope(receipt)
}

pub(crate) fn validate_server_revocation_receipt(
    receipt: &Value,
    contribution_id: &str,
    observation_sha256: &str,
    document_sha256: &str,
) -> Result<String, String> {
    if !has_exact_keys(
        receipt,
        &[
            "schema",
            "contract_version",
            "status",
            "contribution_id",
            "observation_sha256",
            "document_sha256",
            "revoked_at_ms",
            "reason",
            "proof",
            "privacy",
            "server_integrity",
        ],
    ) || receipt.get("schema").and_then(Value::as_str) != Some(SERVER_REVOCATION_SCHEMA)
        || receipt.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || receipt.get("status").and_then(Value::as_str) != Some("revoked")
        || receipt.get("contribution_id").and_then(Value::as_str) != Some(contribution_id)
        || receipt.get("observation_sha256").and_then(Value::as_str) != Some(observation_sha256)
        || receipt.get("document_sha256").and_then(Value::as_str) != Some(document_sha256)
        || receipt
            .get("revoked_at_ms")
            .and_then(Value::as_u64)
            .is_none()
        || receipt.get("reason").and_then(Value::as_str) != Some("authenticated_owner_request")
    {
        return Err("Recu de revocation serveur detache de la contribution.".to_string());
    }
    let proof = receipt
        .get("proof")
        .ok_or_else(|| "Limites de revocation serveur absentes.".to_string())?;
    if !has_exact_keys(
        proof,
        &[
            "field_test_proof",
            "community_verified",
            "leaderboard_eligible",
        ],
    ) || proof
        .as_object()
        .is_none_or(|object| object.values().any(|value| value.as_bool() != Some(false)))
    {
        return Err("La revocation serveur surestime la preuve.".to_string());
    }
    let privacy = receipt
        .get("privacy")
        .ok_or_else(|| "Confidentialite de revocation serveur absente.".to_string())?;
    if !has_exact_keys(
        privacy,
        &[
            "account_identifier_returned",
            "machine_identifier_returned",
            "subject_key_returned",
        ],
    ) || privacy
        .as_object()
        .is_none_or(|object| object.values().any(|value| value.as_bool() != Some(false)))
    {
        return Err("Confidentialite de revocation serveur invalide.".to_string());
    }
    validate_server_integrity_envelope(receipt)
}

fn registry_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "Dossier OutilsIA indisponible.".to_string())?
        .join("benchmark-commons");
    fs::create_dir_all(&directory)
        .map_err(|_| "Creation du dossier Benchmark Commons impossible.".to_string())?;
    Ok(directory)
}

fn registry_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(registry_directory(app)?.join(REGISTRY_FILENAME))
}

fn pseudonym(now: u128) -> Result<Value, String> {
    Ok(json!({
        "value": format!("anon-{}", random_hex(12)?),
        "issued_at_ms": now,
        "expires_at_ms": now.saturating_add(ROTATION_MS),
        "rotation_days": 30
    }))
}

fn empty_registry(now: u128) -> Result<Value, String> {
    let mut registry = json!({
        "schema": REGISTRY_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "pseudonym": pseudonym(now)?,
        "exports": [],
        "revocations": [],
        "updated_at_ms": now
    });
    sign_document(&mut registry)?;
    Ok(registry)
}

fn exact_prefixed_hex(value: &str, prefix: &str, hex_len: usize) -> bool {
    value.len() == prefix.len() + hex_len
        && value.starts_with(prefix)
        && value[prefix.len()..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
}

fn verify_receipt_binding(
    receipt: &Value,
    action: &str,
    contribution_id: &str,
    observation_sha256: &str,
    document_sha256: &str,
    destination: &str,
    filename: &str,
) -> Result<(), String> {
    validate_receipt(receipt)?;
    if receipt.get("action").and_then(Value::as_str) != Some(action)
        || receipt.get("contribution_id").and_then(Value::as_str) != Some(contribution_id)
        || receipt.get("observation_sha256").and_then(Value::as_str) != Some(observation_sha256)
        || receipt.get("document_sha256").and_then(Value::as_str) != Some(document_sha256)
        || receipt.pointer("/file/destination").and_then(Value::as_str) != Some(destination)
        || receipt.pointer("/file/filename").and_then(Value::as_str) != Some(filename)
    {
        return Err("Recu Benchmark Commons detache de son export.".to_string());
    }
    Ok(())
}

fn verify_revocation_document(document: &Value) -> Result<(), String> {
    verify_document(document, REVOCATION_SCHEMA, "de revocation")?;
    if document.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || !document
            .get("contribution_id")
            .and_then(Value::as_str)
            .is_some_and(|value| exact_prefixed_hex(value, "bc-", 24))
        || !document
            .get("observation_sha256")
            .and_then(Value::as_str)
            .is_some_and(is_sha256)
        || !document
            .get("document_sha256")
            .and_then(Value::as_str)
            .is_some_and(is_sha256)
        || document
            .get("revoked_at_ms")
            .and_then(Value::as_u64)
            .is_none()
        || document.get("reason").and_then(Value::as_str) != Some("local_owner_request")
        || document.get("network_sent").and_then(Value::as_bool) != Some(false)
    {
        return Err("Revocation Benchmark Commons non conforme.".to_string());
    }
    Ok(())
}

fn verify_export_record(record: &Value) -> Result<(), String> {
    let contribution_id = record
        .get("contribution_id")
        .and_then(Value::as_str)
        .filter(|value| exact_prefixed_hex(value, "bc-", 24))
        .ok_or_else(|| "Identifiant d'export Benchmark Commons invalide.".to_string())?;
    let observation_sha256 = record
        .get("observation_sha256")
        .and_then(Value::as_str)
        .filter(|value| is_sha256(value))
        .ok_or_else(|| "Empreinte d'observation exportee invalide.".to_string())?;
    let document_sha256 = record
        .get("document_sha256")
        .and_then(Value::as_str)
        .filter(|value| is_sha256(value))
        .ok_or_else(|| "Empreinte de contribution exportee invalide.".to_string())?;
    let destination = record
        .get("destination")
        .and_then(Value::as_str)
        .ok_or_else(|| "Destination d'export Benchmark Commons absente.".to_string())?;
    normalize_destination(destination)?;
    let filename = record
        .get("filename")
        .and_then(Value::as_str)
        .ok_or_else(|| "Nom d'export Benchmark Commons absent.".to_string())?;
    if filename != contribution_filename(contribution_id)
        || record
            .get("exported_at_ms")
            .and_then(Value::as_u64)
            .is_none()
        || record
            .get("file_deleted")
            .and_then(Value::as_bool)
            .is_none()
    {
        return Err("Metadonnees d'export Benchmark Commons invalides.".to_string());
    }

    let contribution = record
        .get("contribution")
        .ok_or_else(|| "Contribution absente du registre Benchmark Commons.".to_string())?;
    let validated_digest = validate_contribution(contribution)?;
    if validated_digest != document_sha256
        || contribution.get("contribution_id").and_then(Value::as_str) != Some(contribution_id)
        || contribution
            .pointer("/proof/observation_sha256")
            .and_then(Value::as_str)
            != Some(observation_sha256)
    {
        return Err("Contribution detachee de son enregistrement local.".to_string());
    }
    verify_receipt_binding(
        record
            .get("export_receipt")
            .ok_or_else(|| "Recu d'export Benchmark Commons absent.".to_string())?,
        "export",
        contribution_id,
        observation_sha256,
        document_sha256,
        destination,
        filename,
    )?;

    let server_submission = record
        .get("server_submission_receipt")
        .filter(|value| !value.is_null());
    let server_revocation = record
        .get("server_revocation_receipt")
        .filter(|value| !value.is_null());
    if let Some(receipt) = server_submission {
        validate_server_submission_receipt(
            receipt,
            contribution_id,
            observation_sha256,
            document_sha256,
        )?;
        if record.get("server_submitted_at_ms").and_then(Value::as_u64)
            != receipt.get("accepted_at_ms").and_then(Value::as_u64)
        {
            return Err("Date de soumission serveur incoherente.".to_string());
        }
        if let Some(revocation) = server_revocation {
            validate_server_revocation_receipt(
                revocation,
                contribution_id,
                observation_sha256,
                document_sha256,
            )?;
            if record.get("server_revoked_at_ms").and_then(Value::as_u64)
                != revocation.get("revoked_at_ms").and_then(Value::as_u64)
            {
                return Err("Date de revocation serveur incoherente.".to_string());
            }
        } else if record
            .get("server_revoked_at_ms")
            .is_some_and(|value| !value.is_null())
        {
            return Err("Revocation serveur sans recu.".to_string());
        }
    } else if server_revocation.is_some()
        || record
            .get("server_submitted_at_ms")
            .is_some_and(|value| !value.is_null())
        || record
            .get("server_revoked_at_ms")
            .is_some_and(|value| !value.is_null())
    {
        return Err("Etat serveur Benchmark Commons incomplet.".to_string());
    }

    let revoked = record
        .get("revoked_at_ms")
        .is_some_and(|value| !value.is_null());
    if revoked {
        if server_submission.is_some() && server_revocation.is_none() {
            return Err(
                "Un export soumis au serveur doit etre revoque a distance avant retrait local."
                    .to_string(),
            );
        }
        let expected_revocation_filename =
            format!("outilsia-benchmark-revocation-{contribution_id}.json");
        if record
            .get("revoked_at_ms")
            .and_then(Value::as_u64)
            .is_none()
            || record.get("revocation_filename").and_then(Value::as_str)
                != Some(expected_revocation_filename.as_str())
        {
            return Err("Metadonnees de revocation Benchmark Commons invalides.".to_string());
        }
        verify_receipt_binding(
            record
                .get("revocation_receipt")
                .ok_or_else(|| "Recu de revocation Benchmark Commons absent.".to_string())?,
            "revoke",
            contribution_id,
            observation_sha256,
            document_sha256,
            destination,
            filename,
        )?;
    } else if record.get("file_deleted").and_then(Value::as_bool) != Some(false) {
        return Err("Un export actif ne peut pas etre marque supprime.".to_string());
    }
    Ok(())
}

fn verify_registry(registry: &Value) -> Result<(), String> {
    verify_document(registry, REGISTRY_SCHEMA, "du registre local")?;
    let pseudonym = registry
        .get("pseudonym")
        .ok_or_else(|| "Pseudonyme Benchmark Commons absent.".to_string())?;
    let issued_at_ms = pseudonym
        .get("issued_at_ms")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Date du pseudonyme Benchmark Commons absente.".to_string())?;
    let expires_at_ms = pseudonym
        .get("expires_at_ms")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Expiration du pseudonyme Benchmark Commons absente.".to_string())?;
    let exports = registry
        .get("exports")
        .and_then(Value::as_array)
        .ok_or_else(|| "Exports Benchmark Commons invalides.".to_string())?;
    let revocations = registry
        .get("revocations")
        .and_then(Value::as_array)
        .ok_or_else(|| "Revocations Benchmark Commons invalides.".to_string())?;
    if registry.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || pseudonym
            .get("value")
            .and_then(Value::as_str)
            .is_none_or(|value| !exact_prefixed_hex(value, "anon-", 24))
        || pseudonym.get("rotation_days").and_then(Value::as_u64) != Some(30)
        || expires_at_ms <= issued_at_ms
        || exports.len() > MAX_EXPORTS
        || revocations.len() > MAX_REVOCATIONS
    {
        return Err("Registre Benchmark Commons invalide.".to_string());
    }
    for export in exports {
        verify_export_record(export)?;
    }
    for revocation in revocations {
        verify_revocation_document(revocation)?;
    }
    Ok(())
}

fn read_registry_path(path: &Path, now: u128) -> Result<(Value, bool), String> {
    let backup = path.with_extension("json.bak");
    if !path.exists() && backup.exists() {
        let bytes = fs::read(&backup)
            .map_err(|_| "Lecture de la sauvegarde Benchmark Commons impossible.".to_string())?;
        if bytes.len() > MAX_REGISTRY_BYTES {
            return Err("Sauvegarde Benchmark Commons trop volumineuse.".to_string());
        }
        let registry = serde_json::from_slice::<Value>(&bytes)
            .map_err(|_| "Sauvegarde Benchmark Commons illisible.".to_string())?;
        verify_registry(&registry)?;
        fs::rename(&backup, path)
            .map_err(|_| "Restauration du registre Benchmark Commons impossible.".to_string())?;
    }
    if !path.exists() {
        return Ok((empty_registry(now)?, true));
    }
    let bytes = fs::read(path)
        .map_err(|_| "Lecture du registre Benchmark Commons impossible.".to_string())?;
    if bytes.len() > MAX_REGISTRY_BYTES {
        return Err("Registre Benchmark Commons trop volumineux.".to_string());
    }
    let mut registry = serde_json::from_slice::<Value>(&bytes)
        .map_err(|_| "Registre Benchmark Commons illisible.".to_string())?;
    verify_registry(&registry)?;
    let expired = registry
        .pointer("/pseudonym/expires_at_ms")
        .and_then(Value::as_u64)
        .map(u128::from)
        .is_none_or(|expires| expires <= now);
    if expired {
        registry["pseudonym"] = pseudonym(now)?;
        registry["updated_at_ms"] = json!(now);
        sign_document(&mut registry)?;
        return Ok((registry, true));
    }
    Ok((registry, false))
}

fn write_registry_path(path: &Path, registry: &mut Value) -> Result<(), String> {
    if let Some(exports) = registry.get_mut("exports").and_then(Value::as_array_mut) {
        if exports.len() > MAX_EXPORTS {
            let keep_from = exports.len() - MAX_EXPORTS;
            exports.drain(0..keep_from);
        }
    }
    if let Some(revocations) = registry
        .get_mut("revocations")
        .and_then(Value::as_array_mut)
    {
        if revocations.len() > MAX_REVOCATIONS {
            let keep_from = revocations.len() - MAX_REVOCATIONS;
            revocations.drain(0..keep_from);
        }
    }
    registry["updated_at_ms"] = json!(unix_ms());
    sign_document(registry)?;
    verify_registry(registry)?;
    let bytes = serde_json::to_vec_pretty(registry)
        .map_err(|_| "Serialisation du registre Benchmark Commons impossible.".to_string())?;
    if bytes.len() > MAX_REGISTRY_BYTES {
        return Err("Registre Benchmark Commons trop volumineux.".to_string());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "Dossier du registre Benchmark Commons absent.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|_| "Creation du registre Benchmark Commons impossible.".to_string())?;
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    fs::write(&temporary, &bytes)
        .map_err(|_| "Ecriture temporaire Benchmark Commons impossible.".to_string())?;

    if backup.exists() {
        fs::remove_file(&backup).map_err(|_| {
            "Ancienne sauvegarde Benchmark Commons impossible a retirer.".to_string()
        })?;
    }
    let had_existing_registry = path.exists();
    if had_existing_registry {
        if let Err(error) = fs::rename(path, &backup) {
            let _ = fs::remove_file(&temporary);
            return Err(format!(
                "Sauvegarde du registre Benchmark Commons impossible: {error}"
            ));
        }
    }
    if let Err(error) = fs::rename(&temporary, path) {
        if had_existing_registry {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "Finalisation du registre Benchmark Commons impossible: {error}"
        ));
    }
    if had_existing_registry {
        let _ = fs::remove_file(&backup);
    }
    Ok(())
}

fn read_registry(app: &AppHandle, now: u128) -> Result<Value, String> {
    let path = registry_path(app)?;
    let (mut registry, changed) = read_registry_path(&path, now)?;
    if changed {
        write_registry_path(&path, &mut registry)?;
    }
    Ok(registry)
}

fn active_export_for_observation<'a>(
    registry: &'a Value,
    observation_sha256: &str,
) -> Option<&'a Value> {
    registry
        .get("exports")
        .and_then(Value::as_array)?
        .iter()
        .rev()
        .find(|record| {
            record.get("observation_sha256").and_then(Value::as_str) == Some(observation_sha256)
                && record.get("revoked_at_ms").is_none_or(Value::is_null)
        })
}

fn export_record_mut<'a>(
    registry: &'a mut Value,
    contribution_id: &str,
    document_sha256: &str,
) -> Result<&'a mut Value, String> {
    registry
        .get_mut("exports")
        .and_then(Value::as_array_mut)
        .and_then(|exports| {
            exports.iter_mut().rev().find(|record| {
                record.get("contribution_id").and_then(Value::as_str) == Some(contribution_id)
                    && record.get("document_sha256").and_then(Value::as_str)
                        == Some(document_sha256)
            })
        })
        .ok_or_else(|| "Contribution locale Benchmark Commons introuvable.".to_string())
}

fn validate_network_identity(contribution_id: &str, document_sha256: &str) -> Result<(), String> {
    if !exact_prefixed_hex(contribution_id, "bc-", 24) || !is_sha256(document_sha256) {
        return Err("Identite de contribution reseau invalide.".to_string());
    }
    Ok(())
}

pub(crate) fn begin_server_submission(
    app: &AppHandle,
    state: &BenchmarkCommonsState,
    request: &SubmitContributionNetworkRequest,
) -> Result<Value, String> {
    if request.schema != NETWORK_SUBMIT_REQUEST_SCHEMA
        || request.machine_id == 0
        || !request.confirmed_in_native_ui
        || !request.privacy_reviewed
        || !request.not_field_proof_acknowledged
    {
        return Err("Consentement reseau Benchmark Commons incomplet.".to_string());
    }
    let contribution_id = request.contribution_id.trim();
    let document_sha256 = request.document_sha256.trim();
    validate_network_identity(contribution_id, document_sha256)?;
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Verrou Benchmark Commons indisponible.".to_string())?;
    if runtime.network_in_flight.contains(contribution_id) {
        return Err("Une operation reseau Benchmark Commons est deja en cours.".to_string());
    }
    let mut registry = read_registry(app, unix_ms())?;
    let record = export_record_mut(&mut registry, contribution_id, document_sha256)?;
    verify_export_record(record)?;
    if record
        .get("revoked_at_ms")
        .is_some_and(|value| !value.is_null())
    {
        return Err("Une contribution retiree localement ne peut pas etre envoyee.".to_string());
    }
    if record
        .get("server_submission_receipt")
        .is_some_and(|value| !value.is_null())
    {
        return Err("Cette contribution possede deja un recu serveur.".to_string());
    }
    let contribution = record
        .get("contribution")
        .cloned()
        .ok_or_else(|| "Contribution locale absente.".to_string())?;
    validate_contribution(&contribution)?;
    runtime
        .network_in_flight
        .insert(contribution_id.to_string());
    Ok(contribution)
}

pub(crate) fn begin_server_revocation(
    app: &AppHandle,
    state: &BenchmarkCommonsState,
    request: &RevokeContributionNetworkRequest,
) -> Result<(), String> {
    if request.schema != NETWORK_REVOKE_REQUEST_SCHEMA || !request.confirmed_in_native_ui {
        return Err("Confirmation de revocation reseau requise.".to_string());
    }
    let contribution_id = request.contribution_id.trim();
    let document_sha256 = request.document_sha256.trim();
    validate_network_identity(contribution_id, document_sha256)?;
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Verrou Benchmark Commons indisponible.".to_string())?;
    if runtime.network_in_flight.contains(contribution_id) {
        return Err("Une operation reseau Benchmark Commons est deja en cours.".to_string());
    }
    let mut registry = read_registry(app, unix_ms())?;
    let record = export_record_mut(&mut registry, contribution_id, document_sha256)?;
    verify_export_record(record)?;
    if record
        .get("server_submission_receipt")
        .is_none_or(Value::is_null)
    {
        return Err("Aucune soumission serveur active pour cette contribution.".to_string());
    }
    if record
        .get("server_revocation_receipt")
        .is_some_and(|value| !value.is_null())
    {
        return Err("Cette contribution possede deja un recu de revocation serveur.".to_string());
    }
    runtime
        .network_in_flight
        .insert(contribution_id.to_string());
    Ok(())
}

pub(crate) fn abort_server_operation(
    state: &BenchmarkCommonsState,
    contribution_id: &str,
) -> Result<(), String> {
    state
        .0
        .lock()
        .map_err(|_| "Verrou Benchmark Commons indisponible.".to_string())?
        .network_in_flight
        .remove(contribution_id.trim());
    Ok(())
}

pub(crate) fn record_server_submission(
    app: &AppHandle,
    state: &BenchmarkCommonsState,
    contribution_id: &str,
    document_sha256: &str,
    receipt: Value,
) -> Result<Value, String> {
    validate_network_identity(contribution_id, document_sha256)?;
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Verrou Benchmark Commons indisponible.".to_string())?;
    let result = (|| {
        if !runtime.network_in_flight.contains(contribution_id) {
            return Err("Soumission serveur non initiee par l'interface native.".to_string());
        }
        let now = unix_ms();
        let mut registry = read_registry(app, now)?;
        let record = export_record_mut(&mut registry, contribution_id, document_sha256)?;
        let observation_sha256 = record
            .get("observation_sha256")
            .and_then(Value::as_str)
            .ok_or_else(|| "Empreinte d'observation absente.".to_string())?
            .to_string();
        let receipt_digest = validate_server_submission_receipt(
            &receipt,
            contribution_id,
            &observation_sha256,
            document_sha256,
        )?;
        if let Some(existing) = record
            .get("server_submission_receipt")
            .filter(|value| !value.is_null())
        {
            if existing != &receipt {
                return Err("Le recu serveur existant est en conflit.".to_string());
            }
            return Ok(json!({
                "recorded": true,
                "duplicate": true,
                "server_receipt_digest": receipt_digest
            }));
        }
        record["server_submitted_at_ms"] = receipt
            .get("accepted_at_ms")
            .cloned()
            .unwrap_or(Value::Null);
        record["server_submission_receipt"] = receipt;
        record["server_revoked_at_ms"] = Value::Null;
        record["server_revocation_receipt"] = Value::Null;
        write_registry_path(&registry_path(app)?, &mut registry)?;
        Ok(json!({
            "recorded": true,
            "duplicate": false,
            "server_receipt_digest": receipt_digest
        }))
    })();
    runtime.network_in_flight.remove(contribution_id);
    result
}

pub(crate) fn record_server_revocation(
    app: &AppHandle,
    state: &BenchmarkCommonsState,
    contribution_id: &str,
    document_sha256: &str,
    receipt: Value,
) -> Result<Value, String> {
    validate_network_identity(contribution_id, document_sha256)?;
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Verrou Benchmark Commons indisponible.".to_string())?;
    let result = (|| {
        if !runtime.network_in_flight.contains(contribution_id) {
            return Err("Revocation serveur non initiee par l'interface native.".to_string());
        }
        let now = unix_ms();
        let mut registry = read_registry(app, now)?;
        let record = export_record_mut(&mut registry, contribution_id, document_sha256)?;
        let observation_sha256 = record
            .get("observation_sha256")
            .and_then(Value::as_str)
            .ok_or_else(|| "Empreinte d'observation absente.".to_string())?
            .to_string();
        let receipt_digest = validate_server_revocation_receipt(
            &receipt,
            contribution_id,
            &observation_sha256,
            document_sha256,
        )?;
        if let Some(existing) = record
            .get("server_revocation_receipt")
            .filter(|value| !value.is_null())
        {
            if existing != &receipt {
                return Err("Le recu de revocation serveur existant est en conflit.".to_string());
            }
            return Ok(json!({
                "recorded": true,
                "duplicate": true,
                "server_receipt_digest": receipt_digest
            }));
        }
        if record
            .get("server_submission_receipt")
            .is_none_or(Value::is_null)
        {
            return Err("Recu de soumission serveur absent du registre.".to_string());
        }
        record["server_revoked_at_ms"] =
            receipt.get("revoked_at_ms").cloned().unwrap_or(Value::Null);
        record["server_revocation_receipt"] = receipt;
        write_registry_path(&registry_path(app)?, &mut registry)?;
        Ok(json!({
            "recorded": true,
            "duplicate": false,
            "server_receipt_digest": receipt_digest
        }))
    })();
    runtime.network_in_flight.remove(contribution_id);
    result
}

fn prepared_expired(prepared: &PreparedContribution, now: u128) -> bool {
    prepared.state != PreparedState::Exported
        && (prepared.expires_at_ms <= now
            || (prepared.state == PreparedState::Approved
                && prepared
                    .approval_expires_at_ms
                    .is_none_or(|expires| expires <= now)))
}

fn contribution_view(prepared: &PreparedContribution, now: u128) -> Value {
    json!({
        "request_id": prepared.request_id,
        "contribution_id": prepared.contribution_id,
        "state": if prepared_expired(prepared, now) {
            "expired"
        } else {
            prepared.state.as_str()
        },
        "document_sha256": prepared.document_sha256,
        "observation_sha256": prepared.observation_sha256,
        "plan_sha256": prepared.plan_sha256,
        "destination": prepared.destination,
        "created_at_ms": prepared.created_at_ms,
        "expires_at_ms": prepared.expires_at_ms,
        "approved_at_ms": prepared.approved_at_ms,
        "approval_expires_at_ms": prepared.approval_expires_at_ms,
        "contribution": prepared.contribution
    })
}

fn prune_runtime(runtime: &mut Runtime, now: u128) {
    runtime
        .prepared
        .retain(|_, prepared| !prepared_expired(prepared, now));
    if runtime.prepared.len() <= MAX_PREPARED {
        return;
    }
    let mut ordered = runtime
        .prepared
        .iter()
        .map(|(id, prepared)| (id.clone(), prepared.created_at_ms))
        .collect::<Vec<_>>();
    ordered.sort_by_key(|(_, created_at)| *created_at);
    for (id, _) in ordered
        .into_iter()
        .take(runtime.prepared.len() - MAX_PREPARED)
    {
        runtime.prepared.remove(&id);
    }
}

fn build_contribution(
    request: &PrepareContributionRequest,
    pseudonym_value: &str,
    pseudonym_expires_at_ms: u128,
    now: u128,
) -> Result<(Value, String), String> {
    if request.schema != PREPARE_REQUEST_SCHEMA {
        return Err("Contrat de preparation Benchmark Commons invalide.".to_string());
    }
    if request.scan.source != "tauri-local-cockpit" {
        return Err("Un scan natif reel est requis pour Benchmark Commons.".to_string());
    }
    let runtime = normalize_runtime(&request.runtime)?;
    let model = validate_ollama_model_ref(&request.benchmark.model)?;
    let benchmark = &request.benchmark;
    if !benchmark.success
        || benchmark.timed_out
        || benchmark.measurement_source != "ollama_api"
        || benchmark.eval_count == 0
        || benchmark.eval_duration_ms < 200
        || !finite_in_range(benchmark.estimated_tokens_per_second, 0.1, 10_000.0)
        || !finite_in_range(benchmark.prompt_tokens_per_second, 0.0, 100_000.0)
        || !finite_in_range(benchmark.runtime_gpu_offload_percent, 0.0, 100.0)
    {
        return Err(
            "Seul un benchmark Ollama API reussi avec metriques exactes est exportable."
                .to_string(),
        );
    }
    let canonical_prompt =
        prepare_benchmark_prompt(Some(STANDARD_BENCHMARK_QUESTION.to_string()), false);
    if benchmark.prompt != canonical_prompt {
        return Err(
            "Le benchmark utilise un prompt personnalise et ne peut pas rejoindre une cohorte comparable."
                .to_string(),
        );
    }
    if benchmark.created_at_ms > now.saturating_add(5 * 60 * 1000)
        || now.saturating_sub(benchmark.created_at_ms) > MAX_BENCHMARK_AGE_MS
    {
        return Err("Date du benchmark incompatible avec Benchmark Commons.".to_string());
    }
    let build = get_app_build_info();
    let observation = json!({
        "measured_at_ms": benchmark.created_at_ms,
        "hardware": {
            "cpu_name": clean_label(request.scan.cpu_name.as_deref(), "unknown", 160),
            "cpu_cores": request.scan.cpu_cores,
            "ram_gb": request.scan.ram_gb,
            "gpu_name": clean_label(request.scan.gpu_name.as_deref(), "unknown", 160),
            "gpu_vendor": clean_label(request.scan.gpu_vendor.as_deref(), "unknown", 80),
            "vram_gb": request.scan.vram_gb,
            "unified_memory": request.scan.unified_memory,
            "os_family": os_family(request.scan.os_name.as_deref())
        },
        "runtime": {
            "kind": runtime,
            "ollama_version": ollama_version(&request.scan, runtime),
            "execution_mode": clean_label(Some(&benchmark.execution_mode), "auto", 24),
            "processor": clean_label(Some(&benchmark.runtime_processor), "unknown", 40),
            "evidence_source": clean_label(
                Some(&benchmark.runtime_evidence_source),
                "not_measured",
                80
            )
        },
        "model": {
            "ollama_ref": model
        },
        "protocol": {
            "id": "outilsia.benchmark.short.v1",
            "measurement_source": "ollama_api",
            "standard_prompt_sha256": canonical_sha256(&Value::String(canonical_prompt)),
            "prompt_included": false
        },
        "metrics": {
            "generation_tokens_per_second": benchmark.estimated_tokens_per_second,
            "prompt_tokens_per_second": benchmark.prompt_tokens_per_second,
            "total_duration_ms": benchmark.total_duration_ms,
            "load_duration_ms": benchmark.load_duration_ms,
            "prompt_eval_count": benchmark.prompt_eval_count,
            "prompt_eval_duration_ms": benchmark.prompt_eval_duration_ms,
            "eval_count": benchmark.eval_count,
            "eval_duration_ms": benchmark.eval_duration_ms,
            "model_size_bytes": benchmark.runtime_model_size_bytes,
            "vram_bytes": benchmark.runtime_vram_bytes,
            "gpu_offload_percent": benchmark.runtime_gpu_offload_percent
        },
        "release": {
            "app_version": build.app_version,
            "channel": build.channel,
            "build_id": build.build_id,
            "source_commit": build.source_commit,
            "target_os": build.target_os,
            "target_arch": build.target_arch
        }
    });
    let observation_sha256 = canonical_sha256(&observation);
    let contribution_seed = json!({
        "pseudonym": pseudonym_value,
        "observation_sha256": observation_sha256
    });
    let contribution_id = format!("bc-{}", &canonical_sha256(&contribution_seed)[..24]);
    let mut contribution = json!({
        "schema": CONTRIBUTION_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "contribution_id": contribution_id,
        "created_at_ms": now,
        "contributor": {
            "pseudonym": pseudonym_value,
            "pseudonym_expires_at_ms": pseudonym_expires_at_ms,
            "rotating": true,
            "account_linked": false
        },
        "observation": observation,
        "proof": {
            "observation_sha256": observation_sha256,
            "source": "local_measurement",
            "field_test_proof": false,
            "community_verified": false,
            "leaderboard_eligible": false
        },
        "privacy": {
            "prompt_included": false,
            "model_output_included": false,
            "raw_scan_included": false,
            "machine_key_included": false,
            "hostname_included": false,
            "account_included": false,
            "token_included": false,
            "file_path_included": false,
            "personal_file_included": false,
            "network_sent": false
        },
        "limits": [
            "Fichier local exporte volontairement; aucune donnee n'est envoyee.",
            "Cette observation n'est ni une preuve terrain ni une validation communautaire.",
            "Aucun classement public ne peut etre produit depuis ce fichier seul."
        ]
    });
    sign_document(&mut contribution)?;
    validate_contribution(&contribution)?;
    Ok((contribution, observation_sha256))
}

fn prepare_with_registry(
    request: PrepareContributionRequest,
    registry: &Value,
    runtime: &mut Runtime,
    now: u128,
) -> Result<Value, String> {
    let destination = normalize_destination(&request.destination)?.to_string();
    let pseudonym_value = registry
        .pointer("/pseudonym/value")
        .and_then(Value::as_str)
        .ok_or_else(|| "Pseudonyme local Benchmark Commons absent.".to_string())?;
    let pseudonym_expires_at_ms = registry
        .pointer("/pseudonym/expires_at_ms")
        .and_then(Value::as_u64)
        .map(u128::from)
        .ok_or_else(|| "Expiration du pseudonyme local absente.".to_string())?;
    let (contribution, observation_sha256) =
        build_contribution(&request, pseudonym_value, pseudonym_expires_at_ms, now)?;
    let document_sha256 = contribution
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .ok_or_else(|| "Empreinte de contribution absente.".to_string())?
        .to_string();
    if let Some(existing) = active_export_for_observation(registry, &observation_sha256) {
        return Ok(json!({
            "schema": PREPARE_RESULT_SCHEMA,
            "contract_version": CONTRACT_VERSION,
            "duplicate": true,
            "already_exported": true,
            "existing": existing,
            "contribution": contribution,
            "privacy": {"network_sent": false}
        }));
    }
    let contribution_id = contribution
        .get("contribution_id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let plan = json!({
        "contribution_id": contribution_id,
        "document_sha256": document_sha256,
        "destination": destination
    });
    let plan_sha256 = canonical_sha256(&plan);
    let request_id = format!(
        "bcr-{}",
        &canonical_sha256(&json!({
            "plan_sha256": plan_sha256,
            "nonce": random_hex(16)?
        }))[..24]
    );
    let prepared = PreparedContribution {
        request_id: request_id.clone(),
        contribution_id,
        contribution,
        document_sha256,
        observation_sha256,
        plan_sha256,
        destination,
        created_at_ms: now,
        expires_at_ms: now.saturating_add(PREVIEW_TTL_MS),
        approved_at_ms: None,
        approval_expires_at_ms: None,
        state: PreparedState::AwaitingHuman,
    };
    let view = contribution_view(&prepared, now);
    runtime.prepared.insert(request_id, prepared);
    prune_runtime(runtime, now);
    Ok(json!({
        "schema": PREPARE_RESULT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "duplicate": false,
        "already_exported": false,
        "request": view,
        "privacy": {"network_sent": false}
    }))
}

#[tauri::command]
pub(crate) fn prepare_benchmark_contribution(
    app: AppHandle,
    state: State<'_, BenchmarkCommonsState>,
    request: PrepareContributionRequest,
) -> Result<Value, String> {
    let now = unix_ms();
    let registry = read_registry(&app, now)?;
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Verrou Benchmark Commons indisponible.".to_string())?;
    prepare_with_registry(request, &registry, &mut runtime, now)
}

fn approve_in_runtime(
    runtime: &mut Runtime,
    request: &ApproveContributionRequest,
    now: u128,
) -> Result<Value, String> {
    if request.schema != APPROVE_REQUEST_SCHEMA
        || !request.privacy_acknowledged
        || !request.not_field_proof_acknowledged
    {
        return Err("Consentement Benchmark Commons incomplet.".to_string());
    }
    let prepared = runtime
        .prepared
        .get_mut(request.request_id.trim())
        .ok_or_else(|| "Apercu Benchmark Commons introuvable.".to_string())?;
    if prepared.plan_sha256 != request.plan_sha256
        || prepared.expires_at_ms <= now
        || prepared.state != PreparedState::AwaitingHuman
    {
        return Err("Apercu Benchmark Commons expire, modifie ou deja utilise.".to_string());
    }
    validate_contribution(&prepared.contribution)?;
    prepared.state = PreparedState::Approved;
    prepared.approved_at_ms = Some(now);
    prepared.approval_expires_at_ms = Some(now.saturating_add(APPROVAL_TTL_MS));
    Ok(contribution_view(prepared, now))
}

#[tauri::command]
pub(crate) fn approve_benchmark_contribution(
    state: State<'_, BenchmarkCommonsState>,
    request: ApproveContributionRequest,
) -> Result<Value, String> {
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Verrou Benchmark Commons indisponible.".to_string())?;
    approve_in_runtime(&mut runtime, &request, unix_ms())
}

fn export_directory(app: &AppHandle, destination: &str) -> Result<PathBuf, String> {
    match destination {
        "app_data" => Ok(registry_directory(app)?.join("exports")),
        "downloads" => Ok(app
            .path()
            .download_dir()
            .map_err(|_| "Dossier Telechargements indisponible.".to_string())?
            .join("OutilsIA")),
        _ => Err("Destination Benchmark Commons non autorisee.".to_string()),
    }
}

fn contribution_filename(contribution_id: &str) -> String {
    format!("outilsia-benchmark-contribution-{contribution_id}.json")
}

fn write_json_no_overwrite(path: &Path, document: &Value) -> Result<usize, String> {
    if path.exists() {
        return Err("Un fichier Benchmark Commons portant ce nom existe deja.".to_string());
    }
    let bytes = serde_json::to_vec_pretty(document)
        .map_err(|_| "Export Benchmark Commons illisible.".to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "Dossier export Benchmark Commons absent.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|_| "Creation du dossier export Benchmark Commons impossible.".to_string())?;
    let temporary = parent.join(format!(
        "{}.{}.tmp",
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("benchmark-commons"),
        unix_ms()
    ));
    fs::write(&temporary, &bytes)
        .map_err(|_| "Ecriture temporaire Benchmark Commons impossible.".to_string())?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "Finalisation de l'export Benchmark Commons impossible: {error}"
        ));
    }
    Ok(bytes.len())
}

struct ReceiptInput<'a> {
    action: &'a str,
    contribution_id: &'a str,
    observation_sha256: &'a str,
    document_sha256: &'a str,
    destination: &'a str,
    filename: &'a str,
    file_deleted: bool,
    now: u128,
}

fn build_receipt(input: ReceiptInput<'_>) -> Result<Value, String> {
    let ReceiptInput {
        action,
        contribution_id,
        observation_sha256,
        document_sha256,
        destination,
        filename,
        file_deleted,
        now,
    } = input;
    let human_status = if action == "export" {
        "explicitly_approved_in_native_ui"
    } else {
        "explicitly_revoked_in_native_ui"
    };
    let mut receipt = json!({
        "schema": RECEIPT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "receipt_id": format!(
            "bcrec-{}",
            &canonical_sha256(&json!({
                "action": action,
                "contribution_id": contribution_id,
                "document_sha256": document_sha256,
                "recorded_at_ms": now
            }))[..24]
        ),
        "action": action,
        "contribution_id": contribution_id,
        "observation_sha256": observation_sha256,
        "document_sha256": document_sha256,
        "recorded_at_ms": now,
        "file": {
            "destination": destination,
            "filename": filename,
            "path_included": false,
            "deleted": file_deleted
        },
        "network": {"sent": false},
        "proof": {
            "field_test_proof": false,
            "community_verified": false,
            "leaderboard_eligible": false
        },
        "human_decision": {
            "status": human_status,
            "native_ui": true
        },
        "privacy": {
            "prompt_included": false,
            "model_output_included": false,
            "raw_scan_included": false,
            "machine_key_included": false,
            "hostname_included": false,
            "account_included": false,
            "token_included": false,
            "file_path_included": false,
            "personal_file_included": false,
            "network_sent": false
        }
    });
    sign_document(&mut receipt)?;
    validate_receipt(&receipt)?;
    Ok(receipt)
}

pub(crate) fn export_benchmark_contribution_state(
    app: &AppHandle,
    state: &BenchmarkCommonsState,
    request: ExportContributionRequest,
) -> Result<Value, String> {
    if request.schema != EXPORT_REQUEST_SCHEMA {
        return Err("Contrat export Benchmark Commons invalide.".to_string());
    }
    let now = unix_ms();
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Verrou Benchmark Commons indisponible.".to_string())?;
    let prepared = runtime
        .prepared
        .get_mut(request.request_id.trim())
        .ok_or_else(|| "Apercu Benchmark Commons introuvable.".to_string())?;
    if prepared.plan_sha256 != request.plan_sha256
        || prepared.state != PreparedState::Approved
        || prepared
            .approval_expires_at_ms
            .is_none_or(|expires| expires <= now)
    {
        return Err(
            "Autorisation Benchmark Commons expiree, modifiee ou deja consommee.".to_string(),
        );
    }
    let document_sha256 = validate_contribution(&prepared.contribution)?;
    if document_sha256 != prepared.document_sha256 {
        return Err("Contribution Benchmark Commons modifiee apres consentement.".to_string());
    }
    let mut registry = read_registry(app, now)?;
    if active_export_for_observation(&registry, &prepared.observation_sha256).is_some() {
        return Err("Cette observation a deja ete exportee.".to_string());
    }
    let filename = contribution_filename(&prepared.contribution_id);
    let directory = export_directory(app, &prepared.destination)?;
    let path = directory.join(&filename);
    let bytes_written = write_json_no_overwrite(&path, &prepared.contribution)?;
    let receipt = build_receipt(ReceiptInput {
        action: "export",
        contribution_id: &prepared.contribution_id,
        observation_sha256: &prepared.observation_sha256,
        document_sha256: &prepared.document_sha256,
        destination: &prepared.destination,
        filename: &filename,
        file_deleted: false,
        now,
    })?;
    let record = json!({
        "contribution_id": prepared.contribution_id,
        "observation_sha256": prepared.observation_sha256,
        "document_sha256": prepared.document_sha256,
        "destination": prepared.destination,
        "filename": filename,
        "exported_at_ms": now,
        "revoked_at_ms": Value::Null,
        "file_deleted": false,
        "server_submitted_at_ms": Value::Null,
        "server_revoked_at_ms": Value::Null,
        "server_submission_receipt": Value::Null,
        "server_revocation_receipt": Value::Null,
        "contribution": prepared.contribution,
        "export_receipt": receipt
    });
    registry
        .get_mut("exports")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Registre Benchmark Commons invalide.".to_string())?
        .push(record);
    let path_registry = registry_path(app)?;
    if let Err(error) = write_registry_path(&path_registry, &mut registry) {
        let cleanup = fs::remove_file(&path);
        return Err(match cleanup {
            Ok(()) => error,
            Err(cleanup_error) => {
                format!("{error}; nettoyage de l'export incomplet impossible: {cleanup_error}")
            }
        });
    }
    prepared.state = PreparedState::Exported;
    prepared.approval_expires_at_ms = None;
    Ok(json!({
        "schema": "outilsia.benchmark_commons.export_result.v1",
        "contract_version": CONTRACT_VERSION,
        "success": true,
        "request": contribution_view(prepared, now),
        "filename": filename,
        "destination": prepared.destination,
        "bytes_written": bytes_written,
        "network_sent": false,
        "receipt": receipt
    }))
}

fn revocation_document(
    contribution_id: &str,
    observation_sha256: &str,
    document_sha256: &str,
    now: u128,
) -> Result<Value, String> {
    let mut revocation = json!({
        "schema": REVOCATION_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "contribution_id": contribution_id,
        "observation_sha256": observation_sha256,
        "document_sha256": document_sha256,
        "revoked_at_ms": now,
        "reason": "local_owner_request",
        "network_sent": false,
        "limits": [
            "Cette revocation est locale tant qu'aucun service communautaire n'existe.",
            "Elle ne prouve pas qu'une copie partagee manuellement a ete supprimee."
        ]
    });
    sign_document(&mut revocation)?;
    Ok(revocation)
}

pub(crate) fn revoke_benchmark_contribution_state(
    app: &AppHandle,
    state: &BenchmarkCommonsState,
    request: RevokeContributionRequest,
) -> Result<Value, String> {
    if request.schema != REVOKE_REQUEST_SCHEMA || !request.confirmed_in_native_ui {
        return Err("Confirmation native de revocation requise.".to_string());
    }
    if !is_sha256(&request.document_sha256) {
        return Err("Empreinte de contribution invalide.".to_string());
    }
    let _runtime = state
        .0
        .lock()
        .map_err(|_| "Verrou Benchmark Commons indisponible.".to_string())?;
    if _runtime
        .network_in_flight
        .contains(request.contribution_id.trim())
    {
        return Err("Une operation reseau Benchmark Commons est en cours.".to_string());
    }
    let now = unix_ms();
    let mut registry = read_registry(app, now)?;
    let exports = registry
        .get_mut("exports")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Registre Benchmark Commons invalide.".to_string())?;
    let record = exports
        .iter_mut()
        .rev()
        .find(|record| {
            record.get("contribution_id").and_then(Value::as_str)
                == Some(request.contribution_id.trim())
                && record.get("document_sha256").and_then(Value::as_str)
                    == Some(request.document_sha256.trim())
        })
        .ok_or_else(|| "Contribution exportee introuvable.".to_string())?;
    if !record.get("revoked_at_ms").is_none_or(Value::is_null) {
        return Ok(json!({
            "schema": "outilsia.benchmark_commons.revoke_result.v1",
            "contract_version": CONTRACT_VERSION,
            "success": true,
            "duplicate": true,
            "network_sent": false,
            "receipt": record.get("revocation_receipt").cloned().unwrap_or(Value::Null)
        }));
    }
    if record
        .get("server_submission_receipt")
        .is_some_and(|value| !value.is_null())
        && record
            .get("server_revocation_receipt")
            .is_none_or(Value::is_null)
    {
        return Err(
            "Retire d'abord cette contribution du Commons avant de supprimer l'export local."
                .to_string(),
        );
    }
    let destination = record
        .get("destination")
        .and_then(Value::as_str)
        .ok_or_else(|| "Destination de contribution absente.".to_string())?
        .to_string();
    let filename = record
        .get("filename")
        .and_then(Value::as_str)
        .ok_or_else(|| "Nom de contribution absent.".to_string())?
        .to_string();
    let observation_sha256 = record
        .get("observation_sha256")
        .and_then(Value::as_str)
        .ok_or_else(|| "Empreinte d'observation absente.".to_string())?
        .to_string();
    let exported_contribution = record
        .get("contribution")
        .cloned()
        .ok_or_else(|| "Contribution exportee absente du registre.".to_string())?;
    let path = export_directory(app, &destination)?.join(&filename);
    let file_present = path.exists();
    let revocation = revocation_document(
        request.contribution_id.trim(),
        &observation_sha256,
        request.document_sha256.trim(),
        now,
    )?;
    let receipt = build_receipt(ReceiptInput {
        action: "revoke",
        contribution_id: request.contribution_id.trim(),
        observation_sha256: &observation_sha256,
        document_sha256: request.document_sha256.trim(),
        destination: &destination,
        filename: &filename,
        file_deleted: file_present,
        now,
    })?;
    let revocations_dir = registry_directory(app)?.join("revocations");
    let revocation_filename = format!(
        "outilsia-benchmark-revocation-{}.json",
        request.contribution_id.trim()
    );
    let revocation_path = revocations_dir.join(&revocation_filename);
    let revocation_file_created = !revocation_path.exists();
    if revocation_file_created {
        write_json_no_overwrite(&revocation_path, &revocation)?;
    }
    let file_deleted = if file_present {
        if let Err(error) = fs::remove_file(&path) {
            if revocation_file_created {
                let _ = fs::remove_file(&revocation_path);
            }
            return Err(format!(
                "Suppression du fichier de contribution impossible: {error}"
            ));
        }
        true
    } else {
        false
    };
    record["revoked_at_ms"] = json!(now);
    record["file_deleted"] = json!(file_deleted);
    record["revocation_filename"] = json!(revocation_filename);
    record["revocation_receipt"] = receipt.clone();
    registry
        .get_mut("revocations")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Registre de revocations invalide.".to_string())?
        .push(revocation);
    let path_registry = registry_path(app)?;
    if let Err(error) = write_registry_path(&path_registry, &mut registry) {
        let restore_error = if file_deleted && !path.exists() {
            write_json_no_overwrite(&path, &exported_contribution)
                .err()
                .map(|value| format!(" restauration export: {value}"))
        } else {
            None
        };
        if revocation_file_created {
            let _ = fs::remove_file(&revocation_path);
        }
        return Err(format!("{error}{}", restore_error.unwrap_or_default()));
    }
    Ok(json!({
        "schema": "outilsia.benchmark_commons.revoke_result.v1",
        "contract_version": CONTRACT_VERSION,
        "success": true,
        "duplicate": false,
        "file_deleted": file_deleted,
        "network_sent": false,
        "receipt": receipt
    }))
}

#[tauri::command]
pub(crate) fn rotate_benchmark_commons_pseudonym(
    app: AppHandle,
    state: State<'_, BenchmarkCommonsState>,
    request: RotatePseudonymRequest,
) -> Result<Value, String> {
    if request.schema != ROTATE_REQUEST_SCHEMA || !request.confirmed_in_native_ui {
        return Err("Confirmation native requise pour changer le pseudonyme.".to_string());
    }
    let now = unix_ms();
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Verrou Benchmark Commons indisponible.".to_string())?;
    runtime.prepared.clear();
    let path = registry_path(&app)?;
    let (mut registry, _) = read_registry_path(&path, now)?;
    registry["pseudonym"] = pseudonym(now)?;
    write_registry_path(&path, &mut registry)?;
    Ok(json!({
        "schema": "outilsia.benchmark_commons.rotate_result.v1",
        "contract_version": CONTRACT_VERSION,
        "pseudonym": registry.get("pseudonym").cloned().unwrap_or(Value::Null),
        "pending_previews_revoked": true,
        "existing_exports_unchanged": true,
        "network_sent": false
    }))
}

fn public_registry_view(registry: &Value) -> Value {
    let exports = registry
        .get("exports")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .rev()
                .take(20)
                .map(|record| {
                    let submitted_at_ms = record
                        .get("server_submitted_at_ms")
                        .cloned()
                        .unwrap_or(Value::Null);
                    let revoked_at_ms = record
                        .get("server_revoked_at_ms")
                        .cloned()
                        .unwrap_or(Value::Null);
                    let server_status = if !revoked_at_ms.is_null() {
                        "revoked"
                    } else if !submitted_at_ms.is_null() {
                        "accepted"
                    } else {
                        "not_submitted"
                    };
                    let receipt_digest = record
                        .pointer("/server_submission_receipt/server_integrity/digest")
                        .cloned()
                        .unwrap_or(Value::Null);
                    json!({
                        "contribution_id": record.get("contribution_id").cloned().unwrap_or(Value::Null),
                        "observation_sha256": record.get("observation_sha256").cloned().unwrap_or(Value::Null),
                        "document_sha256": record.get("document_sha256").cloned().unwrap_or(Value::Null),
                        "destination": record.get("destination").cloned().unwrap_or(Value::Null),
                        "filename": record.get("filename").cloned().unwrap_or(Value::Null),
                        "exported_at_ms": record.get("exported_at_ms").cloned().unwrap_or(Value::Null),
                        "revoked_at_ms": record.get("revoked_at_ms").cloned().unwrap_or(Value::Null),
                        "file_deleted": record.get("file_deleted").cloned().unwrap_or(json!(false)),
                        "contribution": record.get("contribution").cloned().unwrap_or(Value::Null),
                        "server": {
                            "status": server_status,
                            "submitted_at_ms": submitted_at_ms,
                            "revoked_at_ms": revoked_at_ms,
                            "receipt_hmac_digest": receipt_digest,
                            "network_received": server_status != "not_submitted",
                            "field_test_proof": false,
                            "community_verified": false,
                            "leaderboard_eligible": false
                        }
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    json!({
        "pseudonym": registry.get("pseudonym").cloned().unwrap_or(Value::Null),
        "exports": exports
    })
}

#[tauri::command]
pub(crate) fn get_benchmark_commons_status(
    app: AppHandle,
    state: State<'_, BenchmarkCommonsState>,
) -> Result<Value, String> {
    let now = unix_ms();
    let registry = read_registry(&app, now)?;
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Verrou Benchmark Commons indisponible.".to_string())?;
    prune_runtime(&mut runtime, now);
    let mut prepared = runtime
        .prepared
        .values()
        .map(|item| contribution_view(item, now))
        .collect::<Vec<_>>();
    prepared.sort_by_key(|item| {
        item.get("created_at_ms")
            .and_then(Value::as_u64)
            .unwrap_or_default()
    });
    prepared.reverse();
    let upload_available = benchmark_commons_upload_enabled();
    let network_sent = registry
        .get("exports")
        .and_then(Value::as_array)
        .is_some_and(|exports| {
            exports.iter().any(|record| {
                record
                    .get("server_submission_receipt")
                    .is_some_and(|value| !value.is_null())
            })
        });
    Ok(json!({
        "schema": STATUS_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "mode": if upload_available {
            "local_export_with_guarded_server_candidate"
        } else {
            "local_export_only"
        },
        "upload_available": upload_available,
        "network_sent": network_sent,
        "network_operation_in_progress": !runtime.network_in_flight.is_empty(),
        "field_test_proof": false,
        "community_verified": false,
        "leaderboard_available": false,
        "registry": public_registry_view(&registry),
        "prepared": prepared
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scan() -> MachineScan {
        serde_json::from_value(json!({
            "name": "POSTE-SECRET",
            "machine_key": "machine-private-key",
            "source": "tauri-local-cockpit",
            "os_name": "Windows",
            "os_version": "11 Pro",
            "cpu_name": "AMD Ryzen 7 7800X3D",
            "cpu_cores": 8,
            "ram_gb": 64,
            "gpu_name": "NVIDIA GeForce RTX 4080 SUPER",
            "gpu_vendor": "NVIDIA",
            "gpu_category": "high-end",
            "vram_gb": 16,
            "unified_memory": false,
            "storage_free_gb": 999,
            "runtimes": {
                "ollama": {"installed": true, "version": "0.12.3", "source": "ollama-native"},
                "ollama_wsl": {"installed": false, "version": null, "source": "ollama-wsl"}
            },
            "installed_models": [],
            "raw_scan": {
                "hostname": "POSTE-SECRET",
                "path": "C:\\Users\\secret",
                "serial": "SERIAL-SECRET"
            }
        }))
        .expect("scan")
    }

    fn benchmark(now: u128) -> BenchmarkResult {
        serde_json::from_value(json!({
            "model": "qwen3:0.6b",
            "prompt": prepare_benchmark_prompt(
                Some(STANDARD_BENCHMARK_QUESTION.to_string()),
                false
            ),
            "elapsed_ms": 1400,
            "output_chars": 200,
            "estimated_tokens": 64,
            "estimated_tokens_per_second": 53.5,
            "measurement_source": "ollama_api",
            "measurement_note": null,
            "total_duration_ms": 1400,
            "load_duration_ms": 100,
            "prompt_eval_count": 40,
            "prompt_eval_duration_ms": 200,
            "prompt_tokens_per_second": 200.0,
            "eval_count": 64,
            "eval_duration_ms": 1200,
            "success": true,
            "timed_out": false,
            "output_preview": "SECRET OUTPUT",
            "output_text": "SECRET OUTPUT FULL",
            "output_truncated": false,
            "done_reason": "stop",
            "error": null,
            "execution_mode": "auto",
            "runtime_model_size_bytes": 500000000,
            "runtime_vram_bytes": 500000000,
            "runtime_gpu_offload_percent": 100.0,
            "runtime_processor": "gpu",
            "runtime_evidence_source": "ollama_api_ps",
            "created_at_ms": now
        }))
        .expect("benchmark")
    }

    fn request(now: u128) -> PrepareContributionRequest {
        PrepareContributionRequest {
            schema: PREPARE_REQUEST_SCHEMA.to_string(),
            scan: scan(),
            benchmark: benchmark(now),
            runtime: "native".to_string(),
            destination: "downloads".to_string(),
        }
    }

    #[test]
    fn contribution_excludes_private_and_raw_fields() {
        let now = unix_ms();
        let (contribution, _) = build_contribution(
            &request(now),
            "anon-1234567890abcdef12345678",
            now + ROTATION_MS,
            now,
        )
        .expect("contribution");
        validate_contribution(&contribution).expect("valid");
        let serialized = serde_json::to_string(&contribution).expect("json");
        for forbidden in [
            "POSTE-SECRET",
            "machine-private-key",
            "C:\\\\Users\\\\secret",
            "SERIAL-SECRET",
            "SECRET OUTPUT",
            "\"prompt\"",
            "\"raw_scan\"",
        ] {
            assert!(!serialized.contains(forbidden), "leak: {forbidden}");
        }
        assert_eq!(
            contribution["observation"]["hardware"]["vram_gb"],
            json!(16)
        );
        assert_eq!(contribution["privacy"]["network_sent"], false);
        assert_eq!(contribution["proof"]["field_test_proof"], false);
    }

    #[test]
    fn rejects_custom_prompt_estimate_and_failed_benchmark() {
        let now = unix_ms();
        let mut custom = request(now);
        custom.benchmark.prompt = "prompt prive".to_string();
        assert!(build_contribution(
            &custom,
            "anon-1234567890abcdef12345678",
            now + ROTATION_MS,
            now
        )
        .is_err());
        let mut estimate = request(now);
        estimate.benchmark.measurement_source = "ollama_cli_estimate".to_string();
        assert!(build_contribution(
            &estimate,
            "anon-1234567890abcdef12345678",
            now + ROTATION_MS,
            now
        )
        .is_err());
        let mut failed = request(now);
        failed.benchmark.success = false;
        assert!(build_contribution(
            &failed,
            "anon-1234567890abcdef12345678",
            now + ROTATION_MS,
            now
        )
        .is_err());
    }

    #[test]
    fn tampering_breaks_contribution_and_receipt_integrity() {
        let now = unix_ms();
        let (mut contribution, _) = build_contribution(
            &request(now),
            "anon-1234567890abcdef12345678",
            now + ROTATION_MS,
            now,
        )
        .expect("contribution");
        contribution["observation"]["metrics"]["generation_tokens_per_second"] = json!(9999);
        assert!(validate_contribution(&contribution).is_err());

        let mut receipt = build_receipt(ReceiptInput {
            action: "export",
            contribution_id: "bc-1234567890abcdef12345678",
            observation_sha256: &"a".repeat(64),
            document_sha256: &"b".repeat(64),
            destination: "downloads",
            filename: "outilsia-benchmark-contribution.json",
            file_deleted: false,
            now,
        })
        .expect("receipt");
        receipt["network"]["sent"] = json!(true);
        sign_document(&mut receipt).expect("rehashed forged receipt");
        assert!(validate_receipt(&receipt).is_err());
    }

    #[test]
    fn approval_is_separate_expiring_and_one_way() {
        let now = unix_ms();
        let mut registry = empty_registry(now).expect("registry");
        registry["pseudonym"] = json!({
            "value": "anon-1234567890abcdef12345678",
            "issued_at_ms": now,
            "expires_at_ms": now + ROTATION_MS,
            "rotation_days": 30
        });
        sign_document(&mut registry).expect("registry");
        let mut runtime = Runtime::default();
        let prepared =
            prepare_with_registry(request(now), &registry, &mut runtime, now).expect("prepare");
        let request_id = prepared["request"]["request_id"]
            .as_str()
            .expect("request id")
            .to_string();
        let plan_sha256 = prepared["request"]["plan_sha256"]
            .as_str()
            .expect("plan")
            .to_string();
        let approval = ApproveContributionRequest {
            schema: APPROVE_REQUEST_SCHEMA.to_string(),
            request_id: request_id.clone(),
            plan_sha256: plan_sha256.clone(),
            privacy_acknowledged: true,
            not_field_proof_acknowledged: true,
        };
        approve_in_runtime(&mut runtime, &approval, now + 1).expect("approve");
        assert_eq!(runtime.prepared[&request_id].state, PreparedState::Approved);
        assert!(approve_in_runtime(&mut runtime, &approval, now + 2).is_err());
        let approval_expired_at = now + 1 + APPROVAL_TTL_MS;
        assert_eq!(
            contribution_view(&runtime.prepared[&request_id], approval_expired_at)["state"],
            "expired"
        );
        prune_runtime(&mut runtime, approval_expired_at);
        assert!(!runtime.prepared.contains_key(&request_id));

        let mut expired_runtime = Runtime::default();
        let expired = prepare_with_registry(request(now), &registry, &mut expired_runtime, now)
            .expect("prepare");
        let expired_id = expired["request"]["request_id"].as_str().unwrap();
        let expired_plan = expired["request"]["plan_sha256"].as_str().unwrap();
        let expired_approval = ApproveContributionRequest {
            schema: APPROVE_REQUEST_SCHEMA.to_string(),
            request_id: expired_id.to_string(),
            plan_sha256: expired_plan.to_string(),
            privacy_acknowledged: true,
            not_field_proof_acknowledged: true,
        };
        assert!(approve_in_runtime(
            &mut expired_runtime,
            &expired_approval,
            now + PREVIEW_TTL_MS + 1
        )
        .is_err());
    }

    #[test]
    fn registry_rotates_pseudonym_and_preserves_integrity() {
        let root = std::env::temp_dir().join(format!(
            "outilsia-benchmark-commons-{}",
            random_hex(8).expect("nonce")
        ));
        fs::create_dir_all(&root).expect("dir");
        let path = root.join("registry.json");
        let now = 10_000_u128;
        let mut registry = empty_registry(now).expect("registry");
        write_registry_path(&path, &mut registry).expect("write");
        write_registry_path(&path, &mut registry).expect("replace existing registry");
        assert!(!path.with_extension("json.tmp").exists());
        assert!(!path.with_extension("json.bak").exists());
        fs::rename(&path, path.with_extension("json.bak")).expect("simulate interrupted swap");
        let (mut restored, changed) = read_registry_path(&path, now + 1).expect("recover backup");
        assert!(!changed);
        assert!(path.exists());
        assert!(!path.with_extension("json.bak").exists());

        let old = restored["pseudonym"]["value"].as_str().unwrap().to_string();
        restored["pseudonym"]["expires_at_ms"] = json!(now + 1);
        write_registry_path(&path, &mut restored).expect("write expired pseudonym");
        let (rotated, changed) = read_registry_path(&path, now + 2).expect("read");
        assert!(changed);
        assert_ne!(rotated["pseudonym"]["value"], old);
        verify_registry(&rotated).expect("valid rotated registry");
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn registry_rejects_a_rehashed_record_with_a_tampered_contribution() {
        let now = unix_ms();
        let mut registry = empty_registry(now).expect("registry");
        let pseudonym_value = registry["pseudonym"]["value"].as_str().unwrap();
        let pseudonym_expires_at_ms = registry["pseudonym"]["expires_at_ms"]
            .as_u64()
            .map(u128::from)
            .unwrap();
        let (contribution, observation_sha256) =
            build_contribution(&request(now), pseudonym_value, pseudonym_expires_at_ms, now)
                .expect("contribution");
        let contribution_id = contribution["contribution_id"]
            .as_str()
            .unwrap()
            .to_string();
        let document_sha256 = contribution["integrity"]["digest"]
            .as_str()
            .unwrap()
            .to_string();
        let filename = contribution_filename(&contribution_id);
        let receipt = build_receipt(ReceiptInput {
            action: "export",
            contribution_id: &contribution_id,
            observation_sha256: &observation_sha256,
            document_sha256: &document_sha256,
            destination: "app_data",
            filename: &filename,
            file_deleted: false,
            now,
        })
        .expect("receipt");
        registry["exports"] = json!([{
            "contribution_id": contribution_id,
            "observation_sha256": observation_sha256,
            "document_sha256": document_sha256,
            "destination": "app_data",
            "filename": filename,
            "exported_at_ms": now,
            "revoked_at_ms": Value::Null,
            "file_deleted": false,
            "contribution": contribution,
            "export_receipt": receipt
        }]);
        sign_document(&mut registry).expect("sign registry");
        verify_registry(&registry).expect("valid registry");

        registry["exports"][0]["contribution"]["observation"]["metrics"]
            ["generation_tokens_per_second"] = json!(9999);
        sign_document(&mut registry).expect("rehashed forged registry");
        assert!(verify_registry(&registry).is_err());
    }

    fn server_submission_receipt(
        contribution_id: &str,
        observation_sha256: &str,
        document_sha256: &str,
        now: u128,
    ) -> Value {
        json!({
            "schema": SERVER_RECEIPT_SCHEMA,
            "contract_version": CONTRACT_VERSION,
            "status": "accepted",
            "contribution_id": contribution_id,
            "observation_sha256": observation_sha256,
            "document_sha256": document_sha256,
            "accepted_at_ms": now,
            "verification": {
                "document_integrity": true,
                "machine_account_match": true,
                "benchmark_account_match": true,
                "server_deduplicated": true,
                "cohort_key": "c".repeat(64)
            },
            "network": {
                "received": true,
                "transport": "authenticated_https_candidate"
            },
            "proof": {
                "field_test_proof": false,
                "community_verified": false,
                "leaderboard_eligible": false
            },
            "privacy": {
                "account_identifier_returned": false,
                "machine_identifier_returned": false,
                "subject_key_returned": false,
                "ip_stored_in_commons_record": false,
                "user_agent_stored_in_commons_record": false,
                "raw_prompt_stored": false,
                "model_output_stored": false
            },
            "revocation": {
                "available_to_authenticated_owner": true
            },
            "retention": {
                "maximum_days": 180,
                "revocation_supported": true
            },
            "server_integrity": {
                "algorithm": "HMAC-SHA256",
                "canonicalization": "recursive-key-sort-json-v1",
                "scope": "canonical_document_without_server_integrity",
                "key_id": "benchmark-commons-server-v1",
                "digest": "d".repeat(64)
            }
        })
    }

    fn server_revocation_receipt(
        contribution_id: &str,
        observation_sha256: &str,
        document_sha256: &str,
        now: u128,
    ) -> Value {
        json!({
            "schema": SERVER_REVOCATION_SCHEMA,
            "contract_version": CONTRACT_VERSION,
            "status": "revoked",
            "contribution_id": contribution_id,
            "observation_sha256": observation_sha256,
            "document_sha256": document_sha256,
            "revoked_at_ms": now,
            "reason": "authenticated_owner_request",
            "proof": {
                "field_test_proof": false,
                "community_verified": false,
                "leaderboard_eligible": false
            },
            "privacy": {
                "account_identifier_returned": false,
                "machine_identifier_returned": false,
                "subject_key_returned": false
            },
            "server_integrity": {
                "algorithm": "HMAC-SHA256",
                "canonicalization": "recursive-key-sort-json-v1",
                "scope": "canonical_document_without_server_integrity",
                "key_id": "benchmark-commons-server-v1",
                "digest": "e".repeat(64)
            }
        })
    }

    #[test]
    fn validates_bounded_server_receipts_and_rejects_overclaims() {
        let now = unix_ms();
        let contribution_id = "bc-1234567890abcdef12345678";
        let observation_sha256 = "a".repeat(64);
        let document_sha256 = "b".repeat(64);
        let mut submission =
            server_submission_receipt(contribution_id, &observation_sha256, &document_sha256, now);
        assert_eq!(
            validate_server_submission_receipt(
                &submission,
                contribution_id,
                &observation_sha256,
                &document_sha256
            )
            .expect("valid submission receipt"),
            "d".repeat(64)
        );
        submission["proof"]["community_verified"] = json!(true);
        assert!(validate_server_submission_receipt(
            &submission,
            contribution_id,
            &observation_sha256,
            &document_sha256
        )
        .is_err());

        let mut revocation = server_revocation_receipt(
            contribution_id,
            &observation_sha256,
            &document_sha256,
            now + 1,
        );
        validate_server_revocation_receipt(
            &revocation,
            contribution_id,
            &observation_sha256,
            &document_sha256,
        )
        .expect("valid revocation receipt");
        revocation["privacy"]["subject_key_returned"] = json!(true);
        assert!(validate_server_revocation_receipt(
            &revocation,
            contribution_id,
            &observation_sha256,
            &document_sha256
        )
        .is_err());
    }

    #[test]
    fn standard_prompt_digest_matches_the_server_contract_vector() {
        let prompt = prepare_benchmark_prompt(Some(STANDARD_BENCHMARK_QUESTION.to_string()), false);
        assert_eq!(
            canonical_sha256(&Value::String(prompt)),
            "15604e00ed0d0ae61dfde437cd1d3fa7b973681b111b6b377e617e9855d4d04d"
        );
    }

    #[test]
    fn contribution_digest_matches_the_python_server_contract_vector() {
        let mut contribution = json!({
            "schema": CONTRIBUTION_SCHEMA,
            "contract_version": CONTRACT_VERSION,
            "contribution_id": "bc-923350fff2758ab7ab5f78e7",
            "created_at_ms": 1_785_196_800_000_u64,
            "contributor": {
                "pseudonym": "anon-000000000000000000000001",
                "pseudonym_expires_at_ms": 1_787_788_800_000_u64,
                "rotating": true,
                "account_linked": false
            },
            "observation": {
                "measured_at_ms": 1_785_196_799_000_u64,
                "hardware": {
                    "cpu_name": "AMD Ryzen 7 7800X3D",
                    "cpu_cores": 8,
                    "ram_gb": 64,
                    "gpu_name": "NVIDIA GeForce RTX 4080 SUPER",
                    "gpu_vendor": "NVIDIA",
                    "vram_gb": 16,
                    "unified_memory": false,
                    "os_family": "windows"
                },
                "runtime": {
                    "kind": "native",
                    "ollama_version": "0.12.3",
                    "execution_mode": "auto",
                    "processor": "gpu",
                    "evidence_source": "ollama_api_ps"
                },
                "model": {
                    "ollama_ref": "qwen3:14b"
                },
                "protocol": {
                    "id": "outilsia.benchmark.short.v1",
                    "measurement_source": "ollama_api",
                    "standard_prompt_sha256": "15604e00ed0d0ae61dfde437cd1d3fa7b973681b111b6b377e617e9855d4d04d",
                    "prompt_included": false
                },
                "metrics": {
                    "generation_tokens_per_second": 50.0,
                    "prompt_tokens_per_second": 180.0,
                    "total_duration_ms": 1400,
                    "load_duration_ms": 100,
                    "prompt_eval_count": 40,
                    "prompt_eval_duration_ms": 220,
                    "eval_count": 64,
                    "eval_duration_ms": 1200,
                    "model_size_bytes": 9_100_000_000_u64,
                    "vram_bytes": 9_100_000_000_u64,
                    "gpu_offload_percent": 100.0
                },
                "release": {
                    "app_version": "0.1.2",
                    "channel": "candidate",
                    "build_id": "20260728120000",
                    "source_commit": "86afd72",
                    "target_os": "windows",
                    "target_arch": "x86_64"
                }
            },
            "proof": {
                "observation_sha256": "2e108dc0caff9d76a98d7345118bf503d9316b45e7a31f97cd8e6312f06e9d30",
                "source": "local_measurement",
                "field_test_proof": false,
                "community_verified": false,
                "leaderboard_eligible": false
            },
            "privacy": {
                "prompt_included": false,
                "model_output_included": false,
                "raw_scan_included": false,
                "machine_key_included": false,
                "hostname_included": false,
                "account_included": false,
                "token_included": false,
                "file_path_included": false,
                "personal_file_included": false,
                "network_sent": false
            },
            "limits": [
                "Fichier local exporte volontairement; aucune donnee n'est envoyee.",
                "Cette observation n'est ni une preuve terrain ni une validation communautaire.",
                "Aucun classement public ne peut etre produit depuis ce fichier seul."
            ]
        });
        let digest = sign_document(&mut contribution).expect("sign vector");
        assert_eq!(
            digest,
            "0a11bd1a36529b1ecf69776b50c62b2d49fa26294ceb8d1880d8dc5e08c22707"
        );
        validate_contribution(&contribution).expect("server vector accepted by Rust");
    }
}
