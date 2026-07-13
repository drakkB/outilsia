use crate::forgebench_isolation::validate_forgebench_isolation_result;
use crate::forgebench_sandbox::copy_verified_pilot_workspace;
use crate::workstack_composer::canonical_sha256;
use crate::{command_output_with_timeout, decode_command_stdout};
use getrandom::fill;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const REQUEST_SCHEMA: &str = "outilsia.forgebench_reference_pilot_request.v1";
const RESULT_SCHEMA: &str = "outilsia.forgebench_reference_pilot_result.v1";
const CONTRACT_VERSION: &str = "2026-07-13";
const RUN_ROOT: &str = "forgebench-reference-runs-v1";
const BENCHMARK_ID: &str = "signal-maze-v1";
const WORKER_KIND: &str = "deterministic_reference_fixture";
const EVALUATOR_KIND: &str = "deterministic_visible_gate";
const PILOT_SCOPE: &str = "reference_worker_pilot_v1";
const PILOT_INPUT_FILE: &str = ".outilsia-pilot-input";
const PILOT_OUTPUT_FILE: &str = ".outilsia-worker-result";
const RUN_CONTRACT_FILE: &str = ".outilsia-run-contract.json";
const WORKER_MARKER: &str = "forgebench-reference-worker-ok";
const EVALUATOR_MARKER: &str = "forgebench-visible-evaluator-ok";
const WORKER_TIMEOUT: Duration = Duration::from_secs(12);
const EVALUATOR_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_SUBMISSION_BYTES: u64 = 2 * 1024 * 1024;
const EXPECTED_FILES: [&str; 6] = [
    PILOT_INPUT_FILE,
    RUN_CONTRACT_FILE,
    PILOT_OUTPUT_FILE,
    "game.js",
    "index.html",
    "styles.css",
];
const SUCCESS_BLOCKERS: [&str; 4] = [
    "candidate_cli_not_executed",
    "hidden_suite_not_evaluated",
    "multi_stack_runs_not_completed",
    "cost_measurement_not_implemented",
];

const WORKER_SCRIPT: &str = r#"
set -eu
if ! command -v bwrap >/dev/null 2>&1; then exit 72; fi
set -- --die-with-parent --new-session --unshare-all --clearenv
set -- "$@" --ro-bind /usr /usr
if [ -e /lib ]; then set -- "$@" --ro-bind /lib /lib; fi
if [ -e /lib64 ]; then set -- "$@" --ro-bind /lib64 /lib64; fi
set -- "$@" --proc /proc --dev /dev --tmpfs /tmp --dir /etc
set -- "$@" --bind "$PWD/workspace" /workspace --chdir /workspace
set -- "$@" --setenv HOME /tmp --setenv PATH /usr/bin
bwrap "$@" -- /usr/bin/sh -c '
  set -eu
  test ! -e /etc/passwd
  test ! -e /home
  test ! -e /mnt
  seed="$(cat /workspace/.outilsia-pilot-input)"
  case "$seed" in ""|*[!0-9]*) exit 81 ;; esac
  printf "\n/* forgebench-reference-pilot-v1:%s */\n" "$seed" >> /workspace/game.js
  printf "%s\n" "forgebench-reference-pilot-v1:$seed" > /workspace/.outilsia-worker-result
  printf "%s\n" "worker_marker=forgebench-reference-worker-ok"
'
"#;

const EVALUATOR_SCRIPT: &str = r#"
set -eu
if ! command -v bwrap >/dev/null 2>&1; then exit 72; fi
set -- --die-with-parent --new-session --unshare-all --clearenv
set -- "$@" --ro-bind /usr /usr
if [ -e /lib ]; then set -- "$@" --ro-bind /lib /lib; fi
if [ -e /lib64 ]; then set -- "$@" --ro-bind /lib64 /lib64; fi
set -- "$@" --proc /proc --dev /dev --tmpfs /tmp --dir /etc
set -- "$@" --ro-bind "$PWD/workspace" /submission
set -- "$@" --bind "$PWD/evaluation" /evaluation --chdir /evaluation
set -- "$@" --setenv HOME /tmp --setenv PATH /usr/bin
bwrap "$@" -- /usr/bin/sh -c '
  set -eu
  test ! -e /etc/passwd
  test ! -e /home
  test ! -e /mnt
  seed="$(cat /submission/.outilsia-pilot-input)"
  case "$seed" in ""|*[!0-9]*) exit 81 ;; esac
  expected="forgebench-reference-pilot-v1:$seed"
  test "$(cat /submission/.outilsia-worker-result)" = "$expected"
  grep -Fq "$expected" /submission/game.js
  test "$(find /submission -mindepth 1 -maxdepth 1 -type f | wc -l)" -eq 6
  test "$(find /submission -mindepth 1 -maxdepth 1 ! -type f | wc -l)" -eq 0
  if grep -Eiq "https?://|@import|url[[:space:]]*\\(" /submission/game.js /submission/index.html /submission/styles.css; then exit 91; fi
  if printf "%s" "forbidden" > /submission/.outilsia-evaluator-write-test 2>/dev/null; then exit 92; fi
  test ! -e /submission/.outilsia-evaluator-write-test
  {
    for file in .outilsia-pilot-input .outilsia-run-contract.json .outilsia-worker-result game.js index.html styles.css; do
      digest="$(sha256sum "/submission/$file" | cut -d " " -f 1)"
      printf "%s:%s\n" "$file" "$digest"
    done
  } | sha256sum | cut -d " " -f 1 > /evaluation/submission.sha256
  digest="$(cat /evaluation/submission.sha256)"
  printf "%s\n" "evaluator_marker=forgebench-visible-evaluator-ok"
  printf "%s\n" "submission_digest=$digest"
  printf "%s\n" "files_total=6"
  printf "%s\n" "checks_passed=6"
  printf "%s\n" "readonly_verified=true"
'
"#;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct RunForgeBenchReferencePilotRequest {
    schema: String,
    isolation_result: Value,
    consent: Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct RunForgeBenchReferencePilotResult {
    schema: String,
    contract_version: String,
    pilot_id: String,
    benchmark: Value,
    batch_ref: Value,
    host_environment: String,
    selected_backend: String,
    consent: Value,
    worker: Value,
    evaluator: Value,
    security: Value,
    cost: Value,
    readiness: Value,
    integrity: Value,
}

fn runner_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn sha256_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn safe_id(value: &str, prefix: &str) -> bool {
    value.starts_with(prefix)
        && value.len() <= 80
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn random_nonce() -> Result<[u8; 16], String> {
    let mut nonce = [0_u8; 16];
    fill(&mut nonce)
        .map_err(|error| format!("Entropie du pilote ForgeBench indisponible: {error}"))?;
    Ok(nonce)
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("Permissions du pilote ForgeBench impossibles: {error}"))
}

#[cfg(not(unix))]
fn set_private_directory_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn create_private_directory(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Err("Le dossier du pilote ForgeBench doit etre neuf.".to_string());
    }
    fs::create_dir_all(path)
        .map_err(|error| format!("Creation du pilote ForgeBench impossible: {error}"))?;
    set_private_directory_permissions(path)
}

fn ensure_private_directory(path: &Path) -> Result<(), String> {
    if !path.exists() {
        fs::create_dir_all(path)
            .map_err(|error| format!("Creation de la racine ForgeBench impossible: {error}"))?;
    }
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Racine ForgeBench illisible: {error}"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("La racine du runner ForgeBench n'est pas fiable.".to_string());
    }
    set_private_directory_permissions(path)
}

fn run_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(RUN_ROOT))
        .map_err(|error| format!("Dossier du runner ForgeBench indisponible: {error}"))
}

fn sign_document(document: &mut Value) -> Result<(), String> {
    document
        .as_object_mut()
        .ok_or_else(|| "Resultat du runner ForgeBench invalide.".to_string())?
        .remove("integrity");
    let digest = canonical_sha256(document);
    document["integrity"] = json!({
        "algorithm": "SHA-256",
        "canonicalization": "recursive-key-sort-json-v1",
        "scope": "canonical_document_without_integrity",
        "digest": digest
    });
    Ok(())
}

pub(crate) fn selected_backend(isolation: &Value) -> Result<&str, String> {
    validate_forgebench_isolation_result(isolation)?;
    let backend = isolation
        .get("selected_backend")
        .and_then(Value::as_str)
        .ok_or_else(|| "Aucun backend ForgeBench verifie n'est disponible.".to_string())?;
    #[cfg(target_os = "linux")]
    if backend != "linux-bwrap-native" {
        return Err("Le backend d'isolation ne correspond pas a Linux.".to_string());
    }
    #[cfg(target_os = "windows")]
    if backend != "wsl-bwrap" {
        return Err("Le backend d'isolation ne correspond pas a WSL.".to_string());
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    return Err("Le runner ForgeBench n'est pas pris en charge sur cette plateforme.".to_string());
    Ok(backend)
}

fn validate_consent(consent: &Value) -> Result<(), String> {
    if consent.get("confirmed").and_then(Value::as_bool) != Some(true)
        || consent.get("scope").and_then(Value::as_str) != Some(PILOT_SCOPE)
        || consent.get("network_access").and_then(Value::as_bool) != Some(false)
        || consent.get("paid_api_allowed").and_then(Value::as_bool) != Some(false)
        || consent
            .get("candidate_cli_allowed")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Consentement du pilote ForgeBench absent ou trop large.".to_string());
    }
    Ok(())
}

#[cfg(target_os = "linux")]
pub(crate) fn isolated_command(run_dir: &Path, script: &str) -> Result<Command, String> {
    let mut command = Command::new("sh");
    command.args(["-lc", script]).current_dir(run_dir);
    Ok(command)
}

#[cfg(target_os = "windows")]
pub(crate) fn isolated_command(run_dir: &Path, script: &str) -> Result<Command, String> {
    let run_dir = run_dir
        .to_str()
        .ok_or_else(|| "Chemin du pilote ForgeBench non UTF-8.".to_string())?;
    let mut command = Command::new("wsl.exe");
    command.args(["--cd", run_dir, "-e", "sh", "-lc", script]);
    Ok(command)
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
pub(crate) fn isolated_command(_run_dir: &Path, _script: &str) -> Result<Command, String> {
    Err("Runner ForgeBench non pris en charge sur cette plateforme.".to_string())
}

fn marker_value(output: &str, key: &str) -> Option<String> {
    output
        .lines()
        .filter_map(|line| line.trim().split_once('='))
        .find_map(|(candidate, value)| (candidate == key).then(|| value.trim().to_string()))
}

fn validate_submission(workspace: &Path, public_seed: u64) -> Result<(String, u64), String> {
    let expected_names = EXPECTED_FILES
        .iter()
        .map(|value| (*value).to_string())
        .collect::<BTreeSet<_>>();
    let mut actual_names = BTreeSet::new();
    let mut total_bytes = 0_u64;
    for entry in fs::read_dir(workspace)
        .map_err(|error| format!("Soumission ForgeBench illisible: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Entree de soumission illisible: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Type de soumission illisible: {error}"))?;
        if !file_type.is_file() || file_type.is_symlink() {
            return Err("La soumission contient une entree non autorisee.".to_string());
        }
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| "Nom de soumission non UTF-8.".to_string())?;
        let size = entry
            .metadata()
            .map_err(|error| format!("Taille de soumission illisible: {error}"))?
            .len();
        total_bytes = total_bytes.saturating_add(size);
        actual_names.insert(name);
    }
    if actual_names != expected_names || total_bytes > MAX_SUBMISSION_BYTES {
        return Err("Topologie ou taille de soumission ForgeBench invalide.".to_string());
    }
    let expected_marker = format!("forgebench-reference-pilot-v1:{public_seed}");
    if fs::read_to_string(workspace.join(PILOT_OUTPUT_FILE))
        .map_err(|error| format!("Preuve worker illisible: {error}"))?
        .trim()
        != expected_marker
        || !fs::read_to_string(workspace.join("game.js"))
            .map_err(|error| format!("Sortie game.js illisible: {error}"))?
            .contains(&expected_marker)
    {
        return Err("Marqueur de sortie du worker ForgeBench invalide.".to_string());
    }
    let mut digest_lines = Vec::with_capacity(EXPECTED_FILES.len());
    for name in EXPECTED_FILES {
        let bytes = fs::read(workspace.join(name))
            .map_err(|error| format!("Fichier de soumission illisible: {error}"))?;
        digest_lines.push(format!("{name}:{}", sha256_bytes(&bytes)));
    }
    digest_lines.sort();
    Ok((
        sha256_bytes(format!("{}\n", digest_lines.join("\n")).as_bytes()),
        total_bytes,
    ))
}

fn exact_keys(value: &Value, allowed: &[&str], label: &str) -> Result<(), String> {
    let object = value
        .as_object()
        .ok_or_else(|| format!("Objet {label} absent."))?;
    let actual = object.keys().map(String::as_str).collect::<BTreeSet<_>>();
    let expected = allowed.iter().copied().collect::<BTreeSet<_>>();
    if actual != expected {
        return Err(format!("Champs {label} inattendus."));
    }
    Ok(())
}

pub(crate) fn validate_forgebench_reference_pilot_result(result: &Value) -> Result<(), String> {
    exact_keys(
        result,
        &[
            "schema",
            "contract_version",
            "pilot_id",
            "benchmark",
            "batch_ref",
            "host_environment",
            "selected_backend",
            "consent",
            "worker",
            "evaluator",
            "security",
            "cost",
            "readiness",
            "integrity",
        ],
        "du resultat pilote",
    )?;
    exact_keys(
        result.get("benchmark").unwrap_or(&Value::Null),
        &["id", "track"],
        "benchmark",
    )?;
    exact_keys(
        result.get("batch_ref").unwrap_or(&Value::Null),
        &[
            "batch_id",
            "experiment_digest",
            "protocol_digest",
            "public_seed_sha256",
        ],
        "batch_ref",
    )?;
    exact_keys(
        result.get("consent").unwrap_or(&Value::Null),
        &[
            "confirmed",
            "scope",
            "network_access",
            "paid_api_allowed",
            "candidate_cli_allowed",
        ],
        "consent",
    )?;
    exact_keys(
        result.get("worker").unwrap_or(&Value::Null),
        &[
            "kind",
            "started",
            "command_executed",
            "succeeded",
            "timed_out",
            "duration_ms",
            "stdout_marker_verified",
            "candidate_stack_executed",
            "output_files_total",
            "output_bytes",
        ],
        "worker",
    )?;
    exact_keys(
        result.get("evaluator").unwrap_or(&Value::Null),
        &[
            "kind",
            "started",
            "command_executed",
            "succeeded",
            "timed_out",
            "duration_ms",
            "independent_process",
            "workspace_read_only",
            "hidden_suite_used",
            "visible_checks_total",
            "visible_checks_passed",
            "submission_digest",
        ],
        "evaluator",
    )?;
    exact_keys(
        result.get("security").unwrap_or(&Value::Null),
        &[
            "process_isolation_enforced",
            "mount_namespace_enforced",
            "network_namespace_enforced",
            "pid_namespace_enforced",
            "host_root_hidden",
            "source_repository_mounted",
            "hidden_suite_mounted",
            "credentials_read",
            "paths_returned",
            "raw_worker_output_returned",
            "temporary_workspace_removed",
            "host_sentinel_unchanged",
        ],
        "security",
    )?;
    exact_keys(
        result.get("cost").unwrap_or(&Value::Null),
        &["api_cost_eur", "status"],
        "cost",
    )?;
    exact_keys(
        result.get("readiness").unwrap_or(&Value::Null),
        &[
            "reference_runner_verified",
            "independent_visible_evaluator_verified",
            "candidate_worker_execution_ready",
            "scientific_eligible",
            "blockers",
        ],
        "readiness",
    )?;
    exact_keys(
        result.get("integrity").unwrap_or(&Value::Null),
        &["algorithm", "canonicalization", "scope", "digest"],
        "integrity",
    )?;
    validate_consent(result.get("consent").unwrap_or(&Value::Null))?;
    let required_true = [
        "/worker/started",
        "/worker/command_executed",
        "/worker/succeeded",
        "/worker/stdout_marker_verified",
        "/evaluator/started",
        "/evaluator/command_executed",
        "/evaluator/succeeded",
        "/evaluator/independent_process",
        "/evaluator/workspace_read_only",
        "/security/process_isolation_enforced",
        "/security/mount_namespace_enforced",
        "/security/network_namespace_enforced",
        "/security/pid_namespace_enforced",
        "/security/host_root_hidden",
        "/security/temporary_workspace_removed",
        "/security/host_sentinel_unchanged",
        "/readiness/reference_runner_verified",
        "/readiness/independent_visible_evaluator_verified",
    ];
    let required_false = [
        "/worker/timed_out",
        "/worker/candidate_stack_executed",
        "/evaluator/timed_out",
        "/evaluator/hidden_suite_used",
        "/security/source_repository_mounted",
        "/security/hidden_suite_mounted",
        "/security/credentials_read",
        "/security/paths_returned",
        "/security/raw_worker_output_returned",
        "/readiness/candidate_worker_execution_ready",
        "/readiness/scientific_eligible",
    ];
    if result.get("schema").and_then(Value::as_str) != Some(RESULT_SCHEMA)
        || result.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || result.pointer("/benchmark/id").and_then(Value::as_str) != Some(BENCHMARK_ID)
        || result.pointer("/benchmark/track").and_then(Value::as_str)
            != Some("transport_and_isolation_pilot")
        || result
            .get("pilot_id")
            .and_then(Value::as_str)
            .is_none_or(|value| !safe_id(value, "fbp-"))
        || result
            .get("selected_backend")
            .and_then(Value::as_str)
            .is_none_or(|value| !matches!(value, "linux-bwrap-native" | "wsl-bwrap"))
        || result
            .get("host_environment")
            .and_then(Value::as_str)
            .is_none_or(|value| !matches!(value, "linux" | "windows"))
        || !matches!(
            (
                result.get("host_environment").and_then(Value::as_str),
                result.get("selected_backend").and_then(Value::as_str)
            ),
            (Some("linux"), Some("linux-bwrap-native")) | (Some("windows"), Some("wsl-bwrap"))
        )
        || result.pointer("/worker/kind").and_then(Value::as_str) != Some(WORKER_KIND)
        || result.pointer("/evaluator/kind").and_then(Value::as_str) != Some(EVALUATOR_KIND)
        || required_true
            .iter()
            .any(|pointer| result.pointer(pointer).and_then(Value::as_bool) != Some(true))
        || required_false
            .iter()
            .any(|pointer| result.pointer(pointer).and_then(Value::as_bool) != Some(false))
        || result
            .pointer("/worker/output_files_total")
            .and_then(Value::as_u64)
            != Some(EXPECTED_FILES.len() as u64)
        || result
            .pointer("/worker/output_bytes")
            .and_then(Value::as_u64)
            .is_none_or(|value| value == 0 || value > MAX_SUBMISSION_BYTES)
        || result
            .pointer("/worker/duration_ms")
            .and_then(Value::as_u64)
            .is_none_or(|value| value > 15_000)
        || result
            .pointer("/evaluator/duration_ms")
            .and_then(Value::as_u64)
            .is_none_or(|value| value > 15_000)
        || result
            .pointer("/evaluator/visible_checks_total")
            .and_then(Value::as_u64)
            != Some(6)
        || result
            .pointer("/evaluator/visible_checks_passed")
            .and_then(Value::as_u64)
            != Some(6)
        || result.pointer("/cost/api_cost_eur").and_then(Value::as_u64) != Some(0)
        || result.pointer("/cost/status").and_then(Value::as_str) != Some("not_incurred")
        || result
            .pointer("/integrity/algorithm")
            .and_then(Value::as_str)
            != Some("SHA-256")
        || result
            .pointer("/integrity/canonicalization")
            .and_then(Value::as_str)
            != Some("recursive-key-sort-json-v1")
        || result.pointer("/integrity/scope").and_then(Value::as_str)
            != Some("canonical_document_without_integrity")
    {
        return Err("Resultat du pilote ForgeBench trompeur.".to_string());
    }
    for pointer in [
        "/batch_ref/experiment_digest",
        "/batch_ref/protocol_digest",
        "/batch_ref/public_seed_sha256",
        "/evaluator/submission_digest",
    ] {
        if !result
            .pointer(pointer)
            .and_then(Value::as_str)
            .is_some_and(is_sha256)
        {
            return Err("Empreinte du pilote ForgeBench invalide.".to_string());
        }
    }
    if result
        .pointer("/batch_ref/batch_id")
        .and_then(Value::as_str)
        .is_none_or(|value| !safe_id(value, "fbsb-"))
    {
        return Err("Reference de batch du pilote invalide.".to_string());
    }
    let blockers = result
        .pointer("/readiness/blockers")
        .and_then(Value::as_array)
        .ok_or_else(|| "Blocages du pilote ForgeBench absents.".to_string())?;
    let blocker_values = blockers
        .iter()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>();
    if blocker_values != SUCCESS_BLOCKERS {
        return Err("Blocages du pilote ForgeBench incoherents.".to_string());
    }
    let digest = result
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .filter(|value| is_sha256(value))
        .ok_or_else(|| "Empreinte du resultat pilote absente.".to_string())?;
    let mut unsigned = result.clone();
    unsigned
        .as_object_mut()
        .ok_or_else(|| "Resultat pilote invalide.".to_string())?
        .remove("integrity");
    if canonical_sha256(&unsigned) != digest {
        return Err("Empreinte du resultat pilote incoherente.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn run_forgebench_reference_pilot(
    app: AppHandle,
    request: RunForgeBenchReferencePilotRequest,
) -> Result<RunForgeBenchReferencePilotResult, String> {
    if request.schema != REQUEST_SCHEMA {
        return Err("Contrat du pilote ForgeBench invalide.".to_string());
    }
    validate_consent(&request.consent)?;
    let backend = selected_backend(&request.isolation_result)?.to_string();
    let _guard = runner_lock()
        .try_lock()
        .map_err(|_| "Un pilote ForgeBench est deja en cours.".to_string())?;
    let root = run_root(&app)?;
    ensure_private_directory(&root)?;
    let nonce = random_nonce()?;
    let pilot_seed = json!({
        "nonce_sha256": sha256_bytes(&nonce),
        "started_at_ms": unix_ms(),
        "backend": backend
    });
    let pilot_id = format!("fbp-{}", &canonical_sha256(&pilot_seed)[..24]);
    let run_dir = root.join(&pilot_id);
    create_private_directory(&run_dir)?;
    let workspace = run_dir.join("workspace");
    let evaluation = run_dir.join("evaluation");
    let execution = (|| -> Result<(Value, u128), String> {
        let source = copy_verified_pilot_workspace(&app, &workspace)?;
        create_private_directory(&evaluation)?;
        fs::write(
            workspace.join(PILOT_INPUT_FILE),
            source.public_seed.to_string(),
        )
        .map_err(|error| format!("Entree du pilote ForgeBench impossible: {error}"))?;
        fs::write(run_dir.join("host-sentinel.txt"), b"must-remain-outside")
            .map_err(|error| format!("Sentinelle du pilote ForgeBench impossible: {error}"))?;

        let worker_started = Instant::now();
        let (worker_output, worker_timed_out) = command_output_with_timeout(
            isolated_command(&run_dir, WORKER_SCRIPT)?,
            WORKER_TIMEOUT,
            "worker de reference ForgeBench",
        )?;
        let worker_duration_ms = worker_started.elapsed().as_millis();
        let worker_stdout = decode_command_stdout(&worker_output.stdout).unwrap_or_default();
        if worker_timed_out
            || !worker_output.status.success()
            || marker_value(&worker_stdout, "worker_marker").as_deref() != Some(WORKER_MARKER)
        {
            return Err(
                "Le worker de reference ForgeBench n'a pas termine son canari.".to_string(),
            );
        }
        let (submission_digest, output_bytes) =
            validate_submission(&workspace, source.public_seed)?;

        let evaluator_started = Instant::now();
        let (evaluator_output, evaluator_timed_out) = command_output_with_timeout(
            isolated_command(&run_dir, EVALUATOR_SCRIPT)?,
            EVALUATOR_TIMEOUT,
            "evaluateur visible ForgeBench",
        )?;
        let evaluator_duration_ms = evaluator_started.elapsed().as_millis();
        let evaluator_stdout = decode_command_stdout(&evaluator_output.stdout).unwrap_or_default();
        let evaluator_values = evaluator_stdout
            .lines()
            .filter_map(|line| line.trim().split_once('='))
            .map(|(key, value)| (key.to_string(), value.trim().to_string()))
            .collect::<BTreeMap<_, _>>();
        if evaluator_timed_out
            || !evaluator_output.status.success()
            || evaluator_values.get("evaluator_marker").map(String::as_str)
                != Some(EVALUATOR_MARKER)
            || evaluator_values
                .get("submission_digest")
                .map(String::as_str)
                != Some(submission_digest.as_str())
            || evaluator_values.get("files_total").map(String::as_str) != Some("6")
            || evaluator_values.get("checks_passed").map(String::as_str) != Some("6")
            || evaluator_values
                .get("readonly_verified")
                .map(String::as_str)
                != Some("true")
            || workspace.join(".outilsia-evaluator-write-test").exists()
        {
            return Err("L'evaluateur visible ForgeBench a refuse la soumission.".to_string());
        }
        let sentinel_unchanged = fs::read_to_string(run_dir.join("host-sentinel.txt"))
            .is_ok_and(|value| value == "must-remain-outside");
        if !sentinel_unchanged {
            return Err("La sentinelle hote du pilote ForgeBench a change.".to_string());
        }
        let public_seed_sha256 = sha256_bytes(source.public_seed.to_string().as_bytes());
        let document = json!({
            "schema": RESULT_SCHEMA,
            "contract_version": CONTRACT_VERSION,
            "pilot_id": pilot_id,
            "benchmark": {"id": BENCHMARK_ID, "track": "transport_and_isolation_pilot"},
            "batch_ref": {
                "batch_id": source.batch_id,
                "experiment_digest": source.experiment_digest,
                "protocol_digest": source.protocol_digest,
                "public_seed_sha256": public_seed_sha256
            },
            "host_environment": if cfg!(target_os = "windows") { "windows" } else { "linux" },
            "selected_backend": backend,
            "consent": request.consent,
            "worker": {
                "kind": WORKER_KIND,
                "started": true,
                "command_executed": true,
                "succeeded": true,
                "timed_out": false,
                "duration_ms": worker_duration_ms,
                "stdout_marker_verified": true,
                "candidate_stack_executed": false,
                "output_files_total": EXPECTED_FILES.len(),
                "output_bytes": output_bytes
            },
            "evaluator": {
                "kind": EVALUATOR_KIND,
                "started": true,
                "command_executed": true,
                "succeeded": true,
                "timed_out": false,
                "duration_ms": evaluator_duration_ms,
                "independent_process": true,
                "workspace_read_only": true,
                "hidden_suite_used": false,
                "visible_checks_total": 6,
                "visible_checks_passed": 6,
                "submission_digest": submission_digest
            },
            "security": {
                "process_isolation_enforced": true,
                "mount_namespace_enforced": true,
                "network_namespace_enforced": true,
                "pid_namespace_enforced": true,
                "host_root_hidden": true,
                "source_repository_mounted": false,
                "hidden_suite_mounted": false,
                "credentials_read": false,
                "paths_returned": false,
                "raw_worker_output_returned": false,
                "temporary_workspace_removed": true,
                "host_sentinel_unchanged": true
            },
            "cost": {"api_cost_eur": 0, "status": "not_incurred"},
            "readiness": {
                "reference_runner_verified": true,
                "independent_visible_evaluator_verified": true,
                "candidate_worker_execution_ready": false,
                "scientific_eligible": false,
                "blockers": SUCCESS_BLOCKERS
            }
        });
        Ok((document, worker_duration_ms + evaluator_duration_ms))
    })();
    let cleanup_completed = fs::remove_dir_all(&run_dir).is_ok() && !run_dir.exists();
    let (mut document, _total_duration_ms) = execution?;
    if !cleanup_completed {
        return Err("Le workspace temporaire ForgeBench n'a pas pu etre supprime.".to_string());
    }
    sign_document(&mut document)?;
    validate_forgebench_reference_pilot_result(&document)?;
    serde_json::from_value(document)
        .map_err(|error| format!("Resultat du pilote ForgeBench non serialisable: {error}"))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn signed_result() -> Value {
        let mut document = json!({
            "schema": RESULT_SCHEMA,
            "contract_version": CONTRACT_VERSION,
            "pilot_id": "fbp-test-reference-run",
            "benchmark": {"id": BENCHMARK_ID, "track": "transport_and_isolation_pilot"},
            "batch_ref": {
                "batch_id": "fbsb-test-batch",
                "experiment_digest": "a".repeat(64),
                "protocol_digest": "b".repeat(64),
                "public_seed_sha256": "c".repeat(64)
            },
            "host_environment": "linux",
            "selected_backend": "linux-bwrap-native",
            "consent": {
                "confirmed": true,
                "scope": PILOT_SCOPE,
                "network_access": false,
                "paid_api_allowed": false,
                "candidate_cli_allowed": false
            },
            "worker": {
                "kind": WORKER_KIND,
                "started": true,
                "command_executed": true,
                "succeeded": true,
                "timed_out": false,
                "duration_ms": 10,
                "stdout_marker_verified": true,
                "candidate_stack_executed": false,
                "output_files_total": 6,
                "output_bytes": 128
            },
            "evaluator": {
                "kind": EVALUATOR_KIND,
                "started": true,
                "command_executed": true,
                "succeeded": true,
                "timed_out": false,
                "duration_ms": 8,
                "independent_process": true,
                "workspace_read_only": true,
                "hidden_suite_used": false,
                "visible_checks_total": 6,
                "visible_checks_passed": 6,
                "submission_digest": "d".repeat(64)
            },
            "security": {
                "process_isolation_enforced": true,
                "mount_namespace_enforced": true,
                "network_namespace_enforced": true,
                "pid_namespace_enforced": true,
                "host_root_hidden": true,
                "source_repository_mounted": false,
                "hidden_suite_mounted": false,
                "credentials_read": false,
                "paths_returned": false,
                "raw_worker_output_returned": false,
                "temporary_workspace_removed": true,
                "host_sentinel_unchanged": true
            },
            "cost": {"api_cost_eur": 0, "status": "not_incurred"},
            "readiness": {
                "reference_runner_verified": true,
                "independent_visible_evaluator_verified": true,
                "candidate_worker_execution_ready": false,
                "scientific_eligible": false,
                "blockers": SUCCESS_BLOCKERS
            }
        });
        sign_document(&mut document).unwrap();
        document
    }

    #[test]
    fn accepts_only_a_verified_reference_run() {
        validate_forgebench_reference_pilot_result(&signed_result()).unwrap();
    }

    #[test]
    fn rehashing_cannot_forge_candidate_or_scientific_execution() {
        for pointer in [
            "/worker/candidate_stack_executed",
            "/evaluator/hidden_suite_used",
            "/readiness/candidate_worker_execution_ready",
            "/readiness/scientific_eligible",
        ] {
            let mut forged = signed_result();
            *forged.pointer_mut(pointer).unwrap() = json!(true);
            sign_document(&mut forged).unwrap();
            assert!(validate_forgebench_reference_pilot_result(&forged).is_err());
        }
    }

    #[test]
    fn extra_path_or_raw_output_claim_is_rejected() {
        let mut forged = signed_result();
        forged
            .as_object_mut()
            .unwrap()
            .insert("workspace_path".to_string(), json!("/secret"));
        sign_document(&mut forged).unwrap();
        assert!(validate_forgebench_reference_pilot_result(&forged).is_err());
    }

    #[test]
    fn scripts_keep_worker_and_evaluator_separate_and_offline() {
        assert!(WORKER_SCRIPT.contains("--unshare-all"));
        assert!(EVALUATOR_SCRIPT.contains("--ro-bind \"$PWD/workspace\" /submission"));
        assert!(!WORKER_SCRIPT.contains("claude"));
        assert!(!WORKER_SCRIPT.contains("codex"));
        assert!(!WORKER_SCRIPT.contains("hidden-suite"));
        assert!(!EVALUATOR_SCRIPT.contains("hidden-suite"));
    }
}
