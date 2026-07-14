use crate::capability_router::validate_capability_router_result;
use crate::forgebench::validate_forgebench_result;
use crate::forgebench_browser::{
    evaluate_visible_browser, preflight_visible_browser, validate_visible_browser_evidence,
};
use crate::forgebench_candidate::{marker_values, validate_submission, EVALUATOR_SCRIPT};
use crate::forgebench_runner::{
    isolated_command, selected_backend, validate_forgebench_reference_pilot_result,
};
use crate::forgebench_sandbox::copy_verified_workspace_for_stack;
use crate::workstack_composer::{canonical_sha256, validate_workstack_plan};
use crate::{command_output_with_timeout, decode_command_stdout};
use getrandom::fill;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const REQUEST_SCHEMA: &str = "outilsia.workstack_arena_run_request.v1";
const RESULT_SCHEMA: &str = "outilsia.workstack_arena_run_result.v1";
const CONTRACT_VERSION: &str = "2026-07-14";
const CONSENT_SCOPE: &str = "codex_cli_signal_maze_pilot_v1";
const STACK_KEY: &str = "codex-solo";
const BENCHMARK_ID: &str = "signal-maze-v1";
const RUN_ROOT: &str = "workstack-arena-codex-runs-v1";
const RUN_CONTRACT_FILE: &str = ".outilsia-run-contract.json";
const STATIC_EVALUATOR_MARKER: &str = "forgebench-ollama-static-evaluator-ok";
const STATIC_EVALUATOR_TIMEOUT: Duration = Duration::from_secs(12);
const ALLOWED_DURATION_SECONDS: [u64; 3] = [180, 300, 600];
const FIXED_OUTPUT_BUDGET_BYTES: u64 = 512 * 1024;
const MAX_STREAM_TAIL_BYTES: usize = 4 * 1024;
const REQUIRED_BLOCKERS: [&str; 4] = [
    "hidden_suite_not_evaluated",
    "peer_candidates_not_run",
    "vendor_cost_not_measured",
    "human_winner_decision_required",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct RunWorkstackArenaCodexPilotRequest {
    schema: String,
    workstack: Value,
    capability_routing: Value,
    forgebench_result: Value,
    reference_pilot_result: Value,
    isolation_result: Value,
    candidate_id: String,
    consent: Value,
    budget: Value,
}

#[derive(Debug, Clone)]
struct CodexCandidate {
    id: String,
    label: String,
    environment: String,
    version: Option<String>,
}

#[derive(Debug)]
struct StreamCapture {
    bytes: u64,
    sha256: String,
    tail: String,
}

#[derive(Debug)]
struct CliExecution {
    succeeded: bool,
    timed_out: bool,
    output_limit_exceeded: bool,
    duration_ms: u128,
    stdout: StreamCapture,
    stderr: StreamCapture,
}

struct ArenaRunGuard;

impl Drop for ArenaRunGuard {
    fn drop(&mut self) {
        ARENA_RUNNING.store(false, Ordering::Release);
    }
}

static ARENA_RUNNING: AtomicBool = AtomicBool::new(false);

fn acquire_run_guard() -> Result<ArenaRunGuard, String> {
    ARENA_RUNNING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map(|_| ArenaRunGuard)
        .map_err(|_| "Un pilote Workstack Arena est deja en cours.".to_string())
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

fn safe_candidate_id(value: &str) -> bool {
    value.starts_with("codex-cli:")
        && value.len() <= 160
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b':'))
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

fn validate_consent(consent: &Value, candidate_id: &str) -> Result<(), String> {
    exact_keys(
        consent,
        &[
            "confirmed",
            "scope",
            "candidate_id",
            "vendor_cli_network_allowed",
            "vendor_cli_quota_or_cost_unknown_accepted",
            "disposable_workspace_write_allowed",
            "generated_code_execution_allowed",
            "original_repository_write_allowed",
            "board_write_allowed",
            "merge_allowed",
            "publish_allowed",
            "hidden_suite_allowed",
        ],
        "consentement Workstack Arena",
    )?;
    if consent.get("confirmed").and_then(Value::as_bool) != Some(true)
        || consent.get("scope").and_then(Value::as_str) != Some(CONSENT_SCOPE)
        || consent.get("candidate_id").and_then(Value::as_str) != Some(candidate_id)
        || consent
            .get("vendor_cli_network_allowed")
            .and_then(Value::as_bool)
            != Some(true)
        || consent
            .get("vendor_cli_quota_or_cost_unknown_accepted")
            .and_then(Value::as_bool)
            != Some(true)
        || consent
            .get("disposable_workspace_write_allowed")
            .and_then(Value::as_bool)
            != Some(true)
        || consent
            .get("generated_code_execution_allowed")
            .and_then(Value::as_bool)
            != Some(true)
        || consent
            .get("original_repository_write_allowed")
            .and_then(Value::as_bool)
            != Some(false)
        || consent.get("board_write_allowed").and_then(Value::as_bool) != Some(false)
        || consent.get("merge_allowed").and_then(Value::as_bool) != Some(false)
        || consent.get("publish_allowed").and_then(Value::as_bool) != Some(false)
        || consent.get("hidden_suite_allowed").and_then(Value::as_bool) != Some(false)
    {
        return Err("Consentement Workstack Arena absent ou trop large.".to_string());
    }
    Ok(())
}

fn validate_budget(budget: &Value) -> Result<Duration, String> {
    exact_keys(
        budget,
        &["max_duration_seconds", "max_attempts", "max_output_bytes"],
        "budget Workstack Arena",
    )?;
    let seconds = budget
        .get("max_duration_seconds")
        .and_then(Value::as_u64)
        .filter(|value| ALLOWED_DURATION_SECONDS.contains(value))
        .ok_or_else(|| "Duree Workstack Arena invalide.".to_string())?;
    if budget.get("max_attempts").and_then(Value::as_u64) != Some(1)
        || budget.get("max_output_bytes").and_then(Value::as_u64) != Some(FIXED_OUTPUT_BUDGET_BYTES)
    {
        return Err("Budget Workstack Arena trop large.".to_string());
    }
    Ok(Duration::from_secs(seconds))
}

fn validate_workstack_router_pair(workstack: &Value, router: &Value) -> Result<(), String> {
    validate_workstack_plan(workstack)?;
    validate_capability_router_result(router)?;
    if workstack
        .pointer("/readiness/ready")
        .and_then(Value::as_bool)
        != Some(true)
        || workstack.get("status").and_then(Value::as_str) != Some("ready_for_human_review")
        || router.pointer("/routing/status").and_then(Value::as_str) != Some("proposal_complete")
        || router.pointer("/workstack_ref/workstack_id") != workstack.get("workstack_id")
        || router.pointer("/workstack_ref/integrity_digest")
            != workstack.pointer("/integrity/digest")
    {
        return Err("Workstack et routage ne forment pas une paire executable.".to_string());
    }
    Ok(())
}

fn candidate_from_documents(
    candidate_id: &str,
    router: &Value,
    forgebench: &Value,
) -> Result<CodexCandidate, String> {
    if !safe_candidate_id(candidate_id) {
        return Err("Identifiant Codex Workstack Arena invalide.".to_string());
    }
    validate_forgebench_result(forgebench)?;
    let candidate = router
        .get("candidates")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|candidate| candidate.get("id").and_then(Value::as_str) == Some(candidate_id))
        .ok_or_else(|| "Candidat Codex absent du routage signe.".to_string())?;
    let environment = candidate
        .get("environment")
        .and_then(Value::as_str)
        .filter(|value| matches!(*value, "windows_native" | "linux_native" | "wsl_default"))
        .ok_or_else(|| "Environnement Codex non pris en charge.".to_string())?;
    let capabilities = candidate
        .get("capabilities")
        .and_then(Value::as_array)
        .ok_or_else(|| "Capacites Codex absentes.".to_string())?;
    let required = ["code", "repository_edit", "tests"];
    if candidate.get("available").and_then(Value::as_bool) != Some(true)
        || candidate.get("provider").and_then(Value::as_str) != Some("openai")
        || candidate.get("kind").and_then(Value::as_str) != Some("official_cli")
        || candidate.get("executable").and_then(Value::as_str) != Some("codex")
        || !required.iter().all(|required| {
            capabilities
                .iter()
                .filter_map(Value::as_str)
                .any(|value| value == *required)
        })
    {
        return Err("Le candidat choisi n'est pas un Codex CLI compatible.".to_string());
    }
    let stack = forgebench
        .pointer("/experiment/candidate_stacks")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|stack| stack.get("key").and_then(Value::as_str) == Some(STACK_KEY))
        .ok_or_else(|| "La stack Codex Solo est absente de ForgeBench.".to_string())?;
    let worker_id = stack
        .get("bindings")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|binding| binding.get("role").and_then(Value::as_str) == Some("worker"))
        .and_then(|binding| binding.pointer("/candidate/candidate_id"))
        .and_then(Value::as_str);
    if stack.get("available").and_then(Value::as_bool) != Some(true)
        || stack.get("execution_started").and_then(Value::as_bool) != Some(false)
        || worker_id != Some(candidate_id)
    {
        return Err("La stack Codex Solo ne correspond pas au candidat choisi.".to_string());
    }
    Ok(CodexCandidate {
        id: candidate_id.to_string(),
        label: candidate
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or("Codex CLI")
            .chars()
            .take(120)
            .collect(),
        environment: environment.to_string(),
        version: candidate
            .get("version")
            .and_then(Value::as_str)
            .map(|value| value.chars().take(64).collect()),
    })
}

fn validate_document_links(
    workstack: &Value,
    router: &Value,
    forgebench: &Value,
) -> Result<(), String> {
    let workstack_id = workstack.get("workstack_id");
    let workstack_digest = workstack.pointer("/integrity/digest");
    if forgebench.pointer("/experiment/workstack_ref/workstack_id") != workstack_id
        || forgebench.pointer("/experiment/workstack_ref/integrity_digest") != workstack_digest
        || forgebench.pointer("/experiment/capability_routing_ref/integrity_digest")
            != router.pointer("/integrity/digest")
        || forgebench
            .pointer("/experiment/benchmark/id")
            .and_then(Value::as_str)
            != Some(BENCHMARK_ID)
    {
        return Err(
            "Les preuves Workstack, Router et ForgeBench ne correspondent pas.".to_string(),
        );
    }
    Ok(())
}

fn random_nonce() -> Result<[u8; 16], String> {
    let mut nonce = [0_u8; 16];
    fill(&mut nonce).map_err(|error| format!("Entropie Workstack Arena indisponible: {error}"))?;
    Ok(nonce)
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("Permissions Workstack Arena impossibles: {error}"))
}

#[cfg(not(unix))]
fn set_private_directory_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn ensure_private_root(path: &Path) -> Result<(), String> {
    if !path.exists() {
        fs::create_dir_all(path).map_err(|error| {
            format!("Creation de la racine Workstack Arena impossible: {error}")
        })?;
    }
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Racine Workstack Arena illisible: {error}"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("La racine Workstack Arena n'est pas fiable.".to_string());
    }
    set_private_directory_permissions(path)
}

fn create_private_directory(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Err("Le workspace Workstack Arena doit etre neuf.".to_string());
    }
    fs::create_dir_all(path)
        .map_err(|error| format!("Creation du workspace Workstack Arena impossible: {error}"))?;
    set_private_directory_permissions(path)
}

fn run_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(RUN_ROOT))
        .map_err(|error| format!("Dossier Workstack Arena indisponible: {error}"))
}

fn public_codex_prompt() -> String {
    [
        "You are the Codex CLI worker for the public OutilsIA ForgeBench Signal Maze v1 pilot.",
        "Read .outilsia-run-contract.json, index.html, styles.css and game.js in the current disposable workspace.",
        "Implement the complete public task and every visible check described by the run contract.",
        "Modify only index.html, styles.css and game.js.",
        "Do not modify .outilsia-run-contract.json and do not create any file or directory.",
        "Use no external dependency, remote URL, network call, iframe, form or embedded object.",
        "Keep deterministic behavior for every supplied seed and support keyboard, mouse and touch.",
        "Do not inspect environment variables or files outside the current workspace.",
        "Do not access another repository or publish, merge, commit, install or download anything.",
        "Finish the implementation in the workspace, perform only local checks, then stop.",
    ]
    .join("\n")
}

fn codex_exec_args() -> Vec<&'static str> {
    vec![
        "exec",
        "--sandbox",
        "workspace-write",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--json",
        "--cd",
        ".",
        "-",
    ]
}

fn is_allowlisted_codex_environment_key(environment: &str, key: &str) -> bool {
    let allowed: &[&str] = match environment {
        "linux_native" => &[
            "PATH",
            "HOME",
            "USER",
            "LOGNAME",
            "SHELL",
            "TERM",
            "LANG",
            "LC_ALL",
            "LC_CTYPE",
            "TMPDIR",
            "CODEX_HOME",
            "XDG_CONFIG_HOME",
            "SSL_CERT_FILE",
            "SSL_CERT_DIR",
            "NIX_SSL_CERT_FILE",
            "CURL_CA_BUNDLE",
        ],
        "windows_native" => &[
            "PATH",
            "PATHEXT",
            "SYSTEMROOT",
            "WINDIR",
            "COMSPEC",
            "TEMP",
            "TMP",
            "USERPROFILE",
            "HOMEDRIVE",
            "HOMEPATH",
            "LOCALAPPDATA",
            "APPDATA",
            "PROGRAMDATA",
            "CODEX_HOME",
            "LANG",
            "LC_ALL",
        ],
        "wsl_default" => &[
            "PATH",
            "PATHEXT",
            "SYSTEMROOT",
            "WINDIR",
            "COMSPEC",
            "TEMP",
            "TMP",
            "USERPROFILE",
            "HOMEDRIVE",
            "HOMEPATH",
            "LOCALAPPDATA",
            "APPDATA",
            "LANG",
            "LC_ALL",
            "WSLENV",
        ],
        _ => &[],
    };
    if environment == "linux_native" {
        allowed.contains(&key)
    } else {
        allowed
            .iter()
            .any(|allowed| allowed.eq_ignore_ascii_case(key))
    }
}

fn apply_codex_environment_allowlist(command: &mut Command, environment: &str) {
    let retained = std::env::vars_os()
        .filter(|(key, _)| {
            is_allowlisted_codex_environment_key(environment, &key.to_string_lossy())
        })
        .collect::<Vec<_>>();
    command.env_clear();
    command.envs(retained);
    command.env("NO_COLOR", "1");
}

#[cfg(target_os = "linux")]
fn codex_command(
    workspace: &Path,
    environment: &str,
    timeout: Duration,
) -> Result<Command, String> {
    if environment != "linux_native" {
        return Err("Ce candidat Codex n'est pas disponible dans Linux natif.".to_string());
    }
    let mut command = Command::new("timeout");
    command
        .args(["--signal=TERM", "--kill-after=5s"])
        .arg(format!("{}s", timeout.as_secs()))
        .arg("codex")
        .args(codex_exec_args())
        .current_dir(workspace);
    apply_codex_environment_allowlist(&mut command, environment);
    Ok(command)
}

#[cfg(target_os = "windows")]
fn codex_command(
    workspace: &Path,
    environment: &str,
    timeout: Duration,
) -> Result<Command, String> {
    match environment {
        "windows_native" => {
            let mut command = Command::new("cmd.exe");
            command
                .args([
                    "/D",
                    "/S",
                    "/C",
                    "codex exec --sandbox workspace-write --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check --json --cd . -",
                ])
                .current_dir(workspace);
            apply_codex_environment_allowlist(&mut command, environment);
            Ok(command)
        }
        "wsl_default" => {
            let workspace = workspace
                .to_str()
                .ok_or_else(|| "Chemin Workstack Arena non UTF-8.".to_string())?;
            let script = "exec timeout --signal=TERM --kill-after=5s \"$1\" codex exec --sandbox workspace-write --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check --json --cd . -";
            let mut command = Command::new("wsl.exe");
            command.args([
                "--cd",
                workspace,
                "-e",
                "sh",
                "-lc",
                script,
                "outilsia-workstack-arena",
                &format!("{}s", timeout.as_secs()),
            ]);
            apply_codex_environment_allowlist(&mut command, environment);
            Ok(command)
        }
        _ => Err("Environnement Codex Windows non pris en charge.".to_string()),
    }
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn codex_command(
    _workspace: &Path,
    _environment: &str,
    _timeout: Duration,
) -> Result<Command, String> {
    Err("Workstack Arena n'est pas pris en charge sur cette plateforme.".to_string())
}

fn spawn_stream_capture<R: Read + Send + 'static>(
    mut reader: R,
    total_bytes: Arc<AtomicU64>,
    output_limit_exceeded: Arc<AtomicBool>,
) -> thread::JoinHandle<StreamCapture> {
    thread::spawn(move || {
        let mut buffer = [0_u8; 4096];
        let mut hasher = Sha256::new();
        let mut bytes = 0_u64;
        let mut tail = Vec::<u8>::new();
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    hasher.update(&buffer[..size]);
                    bytes = bytes.saturating_add(size as u64);
                    let previous = total_bytes.fetch_add(size as u64, Ordering::AcqRel);
                    if previous.saturating_add(size as u64) > FIXED_OUTPUT_BUDGET_BYTES {
                        output_limit_exceeded.store(true, Ordering::Release);
                    }
                    tail.extend_from_slice(&buffer[..size]);
                    if tail.len() > MAX_STREAM_TAIL_BYTES {
                        let remove = tail.len() - MAX_STREAM_TAIL_BYTES;
                        tail.drain(..remove);
                    }
                }
                Err(_) => break,
            }
        }
        StreamCapture {
            bytes,
            sha256: format!("{:x}", hasher.finalize()),
            tail: String::from_utf8_lossy(&tail).to_string(),
        }
    })
}

#[cfg(target_os = "windows")]
fn terminate_process_tree(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output();
}

#[cfg(not(target_os = "windows"))]
fn terminate_process_tree(pid: u32) {
    let _ = Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .output();
}

fn execute_codex(
    mut command: Command,
    prompt: &str,
    timeout: Duration,
) -> Result<CliExecution, String> {
    let started = Instant::now();
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Codex CLI ne peut pas demarrer: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        if let Err(error) = stdin.write_all(prompt.as_bytes()) {
            terminate_process_tree(child.id());
            let _ = child.wait();
            return Err(format!("Instruction Codex indisponible: {error}"));
        }
    }
    let total_bytes = Arc::new(AtomicU64::new(0));
    let output_limit_exceeded = Arc::new(AtomicBool::new(false));
    let stdout_reader = child
        .stdout
        .take()
        .map(|reader| {
            spawn_stream_capture(
                reader,
                Arc::clone(&total_bytes),
                Arc::clone(&output_limit_exceeded),
            )
        })
        .ok_or_else(|| "Sortie Codex indisponible.".to_string())?;
    let stderr_reader = child
        .stderr
        .take()
        .map(|reader| {
            spawn_stream_capture(
                reader,
                Arc::clone(&total_bytes),
                Arc::clone(&output_limit_exceeded),
            )
        })
        .ok_or_else(|| "Erreur Codex indisponible.".to_string())?;
    let outer_timeout = timeout.saturating_add(Duration::from_secs(12));
    let mut outer_timed_out = false;
    let mut output_killed = false;
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Etat Codex illisible: {error}"))?
        {
            break status;
        }
        if output_limit_exceeded.load(Ordering::Acquire) {
            output_killed = true;
            terminate_process_tree(child.id());
            break child
                .wait()
                .map_err(|error| format!("Arret Codex impossible: {error}"))?;
        }
        if started.elapsed() >= outer_timeout {
            outer_timed_out = true;
            terminate_process_tree(child.id());
            break child
                .wait()
                .map_err(|error| format!("Arret Codex impossible: {error}"))?;
        }
        thread::sleep(Duration::from_millis(120));
    };
    let stdout = stdout_reader
        .join()
        .map_err(|_| "Lecture stdout Codex interrompue.".to_string())?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| "Lecture stderr Codex interrompue.".to_string())?;
    let timed_out = outer_timed_out || status.code() == Some(124);
    let output_limit_exceeded = output_killed
        || output_limit_exceeded.load(Ordering::Acquire)
        || stdout.bytes.saturating_add(stderr.bytes) > FIXED_OUTPUT_BUDGET_BYTES;
    Ok(CliExecution {
        succeeded: status.success() && !timed_out && !output_limit_exceeded,
        timed_out,
        output_limit_exceeded,
        duration_ms: started.elapsed().as_millis(),
        stdout,
        stderr,
    })
}

fn sign_document(document: &mut Value) -> Result<(), String> {
    document
        .as_object_mut()
        .ok_or_else(|| "Resultat Workstack Arena invalide.".to_string())?
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

pub(crate) fn validate_workstack_arena_result(result: &Value) -> Result<(), String> {
    let candidate_id = result
        .pointer("/candidate/id")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let stdout_bytes = result
        .pointer("/execution/stdout_bytes")
        .and_then(Value::as_u64)
        .unwrap_or(u64::MAX);
    let stderr_bytes = result
        .pointer("/execution/stderr_bytes")
        .and_then(Value::as_u64)
        .unwrap_or(u64::MAX);
    if result.get("schema").and_then(Value::as_str) != Some(RESULT_SCHEMA)
        || result.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || result
            .get("run_id")
            .and_then(Value::as_str)
            .is_none_or(|value| !value.starts_with("wsa-") || value.len() > 80)
        || result.pointer("/benchmark/id").and_then(Value::as_str) != Some(BENCHMARK_ID)
        || result.pointer("/benchmark/track").and_then(Value::as_str)
            != Some("codex_cli_visible_browser_pilot")
        || result
            .pointer("/batch_ref/stack_key")
            .and_then(Value::as_str)
            != Some(STACK_KEY)
        || result
            .pointer("/candidate/id")
            .and_then(Value::as_str)
            .is_none_or(|value| !safe_candidate_id(value))
        || result
            .pointer("/candidate/adapter_kind")
            .and_then(Value::as_str)
            != Some("codex_cli_signal_maze_v1")
        || result
            .pointer("/candidate/sandbox_mode")
            .and_then(Value::as_str)
            != Some("workspace-write")
        || result
            .pointer("/candidate/cli_invoked")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/candidate/subscription_or_vendor_quota_verified")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/execution/started")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/execution/succeeded")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/execution/timed_out")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/execution/attempts")
            .and_then(Value::as_u64)
            != Some(1)
        || result
            .pointer("/execution/output_budget_exceeded")
            .and_then(Value::as_bool)
            != Some(false)
        || stdout_bytes.saturating_add(stderr_bytes) > FIXED_OUTPUT_BUDGET_BYTES
        || result
            .pointer("/execution/raw_prompt_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/execution/raw_cli_output_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/submission/exact_topology_verified")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/submission/run_contract_unchanged")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/submission/files_total")
            .and_then(Value::as_u64)
            != Some(4)
        || result
            .pointer("/submission/generated_code_executed")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/evaluator/succeeded")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/evaluator/independent_process")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/security/original_repository_mounted")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/public_benchmark_prompt_only")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/security/original_repository_modified")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/board_written")
            .and_then(Value::as_bool)
            != Some(false)
        || result.pointer("/security/merged").and_then(Value::as_bool) != Some(false)
        || result
            .pointer("/security/published")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/credentials_read_by_outilsia")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/environment_allowlist_applied")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/security/raw_cli_output_persisted")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/raw_cli_output_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/hidden_suite_mounted")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/hidden_suite_used")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/host_read_scope_independently_verified")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/evaluator_process_isolated")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/security/temporary_workspace_removed")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/security/paths_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || result.pointer("/cost/status").and_then(Value::as_str)
            != Some("vendor_cli_quota_or_cost_unknown")
        || !result
            .pointer("/cost/amount_eur")
            .is_some_and(Value::is_null)
        || result
            .pointer("/cost/subscription_quota_inspected")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/cost/direct_api_call_by_outilsia")
            .and_then(Value::as_bool)
            != Some(false)
        || result.pointer("/human_gate/status").and_then(Value::as_str)
            != Some("review_required_before_any_winner_or_delivery")
        || result
            .pointer("/human_gate/winner_approval_recorded")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/human_gate/delivery_approval_recorded")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/readiness/visible_gameplay_verified")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/readiness/scientific_eligible")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/readiness/winner_declared")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Resultat Workstack Arena non conforme.".to_string());
    }
    validate_consent(result.get("consent").unwrap_or(&Value::Null), candidate_id)?;
    validate_budget(result.get("budget").unwrap_or(&Value::Null))?;
    let submission_digest = result
        .pointer("/submission/digest")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if result
        .pointer("/evaluator/submission_digest")
        .and_then(Value::as_str)
        != Some(submission_digest)
        || result
            .pointer("/evaluator/visible_checks_total")
            .and_then(Value::as_u64)
            != Some(7)
        || result
            .pointer("/evaluator/visible_checks_passed")
            .and_then(Value::as_u64)
            != Some(7)
    {
        return Err("Evaluation statique Workstack Arena incoherente.".to_string());
    }
    validate_visible_browser_evidence(
        result.get("browser_evaluator").unwrap_or(&Value::Null),
        submission_digest,
    )?;
    for pointer in [
        "/workstack_ref/integrity_digest",
        "/router_ref/integrity_digest",
        "/batch_ref/experiment_digest",
        "/batch_ref/protocol_digest",
        "/reference_pilot_ref/integrity_digest",
        "/execution/prompt_sha256",
        "/execution/stdout_sha256",
        "/execution/stderr_sha256",
        "/submission/digest",
        "/integrity/digest",
    ] {
        if result
            .pointer(pointer)
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        {
            return Err("Empreinte Workstack Arena absente.".to_string());
        }
    }
    let blockers = result
        .pointer("/readiness/blockers")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<BTreeSet<_>>();
    if blockers != REQUIRED_BLOCKERS.iter().copied().collect::<BTreeSet<_>>() {
        return Err("Limites Workstack Arena trompeuses.".to_string());
    }
    let digest = result
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .ok_or_else(|| "Empreinte Workstack Arena absente.".to_string())?;
    let mut unsigned = result.clone();
    unsigned
        .as_object_mut()
        .ok_or_else(|| "Document Workstack Arena invalide.".to_string())?
        .remove("integrity");
    if canonical_sha256(&unsigned) != digest {
        return Err("Empreinte Workstack Arena incoherente.".to_string());
    }
    Ok(())
}

fn run_codex_pilot(
    app: AppHandle,
    request: RunWorkstackArenaCodexPilotRequest,
) -> Result<Value, String> {
    if request.schema != REQUEST_SCHEMA {
        return Err("Contrat Workstack Arena invalide.".to_string());
    }
    validate_workstack_router_pair(&request.workstack, &request.capability_routing)?;
    validate_document_links(
        &request.workstack,
        &request.capability_routing,
        &request.forgebench_result,
    )?;
    let candidate = candidate_from_documents(
        request.candidate_id.trim(),
        &request.capability_routing,
        &request.forgebench_result,
    )?;
    validate_consent(&request.consent, &candidate.id)?;
    let timeout = validate_budget(&request.budget)?;
    validate_forgebench_reference_pilot_result(&request.reference_pilot_result)?;
    let backend = selected_backend(&request.isolation_result)?.to_string();
    if request
        .reference_pilot_result
        .get("selected_backend")
        .and_then(Value::as_str)
        != Some(backend.as_str())
    {
        return Err("Le pilote et Workstack Arena utilisent des backends differents.".to_string());
    }
    let _guard = acquire_run_guard()?;
    let root = run_root(&app)?;
    ensure_private_root(&root)?;
    let nonce = random_nonce()?;
    let run_seed = json!({
        "nonce_sha256": sha256_bytes(&nonce),
        "started_at_ms": unix_ms(),
        "candidate_id": candidate.id,
        "backend": backend
    });
    let run_id = format!("wsa-{}", &canonical_sha256(&run_seed)[..24]);
    let run_dir = root.join(&run_id);
    create_private_directory(&run_dir)?;
    let workspace = run_dir.join("workspace");
    let evaluation = run_dir.join("evaluation");

    let execution = (|| {
        let source = copy_verified_workspace_for_stack(&app, &workspace, Some(STACK_KEY))?;
        if source.stack_key != STACK_KEY {
            return Err("Le workspace ne correspond pas a Codex Solo.".to_string());
        }
        let experiment_digest = request
            .forgebench_result
            .pointer("/experiment/integrity/digest")
            .and_then(Value::as_str)
            .ok_or_else(|| "Empreinte de l'experience absente.".to_string())?;
        let protocol_digest = request
            .forgebench_result
            .pointer("/experiment/protocol_digest")
            .and_then(Value::as_str)
            .ok_or_else(|| "Empreinte du protocole absente.".to_string())?;
        if source.experiment_digest != experiment_digest
            || source.protocol_digest != protocol_digest
            || request
                .reference_pilot_result
                .pointer("/batch_ref/batch_id")
                .and_then(Value::as_str)
                != Some(source.batch_id.as_str())
            || request
                .reference_pilot_result
                .pointer("/batch_ref/experiment_digest")
                .and_then(Value::as_str)
                != Some(source.experiment_digest.as_str())
            || request
                .reference_pilot_result
                .pointer("/batch_ref/protocol_digest")
                .and_then(Value::as_str)
                != Some(source.protocol_digest.as_str())
        {
            return Err("Le pilote Codex ne correspond pas au batch verifie.".to_string());
        }
        create_private_directory(&evaluation)?;
        preflight_visible_browser(&run_dir)?;
        let run_contract = fs::read(workspace.join(RUN_CONTRACT_FILE))
            .map_err(|error| format!("Contrat de run Codex illisible: {error}"))?;
        let run_contract_digest = sha256_bytes(&run_contract);
        let prompt = public_codex_prompt();
        let prompt_digest = sha256_bytes(prompt.as_bytes());
        let command = codex_command(&workspace, &candidate.environment, timeout)?;
        let cli = execute_codex(command, &prompt, timeout)?;
        if cli.output_limit_exceeded {
            return Err("Codex CLI a depasse le budget de sortie.".to_string());
        }
        if !cli.succeeded {
            let reason = if cli.timed_out {
                "Codex CLI a atteint le budget temps."
            } else if cli.stderr.tail.to_ascii_lowercase().contains("login")
                || cli.stderr.tail.to_ascii_lowercase().contains("auth")
            {
                "Codex CLI a refuse le run. Verifie sa connexion dans le terminal."
            } else {
                "Codex CLI n'a pas termine le pilote. Verifie le CLI puis relance."
            };
            return Err(reason.to_string());
        }
        let contract_after = fs::read(workspace.join(RUN_CONTRACT_FILE))
            .map_err(|error| format!("Contrat de run Codex final illisible: {error}"))?;
        if sha256_bytes(&contract_after) != run_contract_digest {
            return Err("Codex a modifie le contrat ForgeBench; soumission refusee.".to_string());
        }
        let (submission_digest, submission_bytes) = validate_submission(&workspace)?;

        let evaluator_started = Instant::now();
        let (evaluator_output, evaluator_timed_out) = command_output_with_timeout(
            isolated_command(&run_dir, EVALUATOR_SCRIPT)?,
            STATIC_EVALUATOR_TIMEOUT,
            "evaluateur statique Workstack Arena",
        )?;
        let evaluator_duration_ms = evaluator_started.elapsed().as_millis();
        let evaluator_stdout = decode_command_stdout(&evaluator_output.stdout).unwrap_or_default();
        let values = marker_values(&evaluator_stdout);
        if evaluator_timed_out
            || !evaluator_output.status.success()
            || values.get("evaluator_marker").map(String::as_str) != Some(STATIC_EVALUATOR_MARKER)
            || values.get("submission_digest").map(String::as_str)
                != Some(submission_digest.as_str())
            || values.get("files_total").map(String::as_str) != Some("4")
            || values.get("checks_passed").map(String::as_str) != Some("7")
            || values.get("readonly_verified").map(String::as_str) != Some("true")
        {
            return Err("L'evaluateur statique a refuse la soumission Codex.".to_string());
        }
        let browser_evaluator = evaluate_visible_browser(&run_dir, &submission_digest)?;
        let workstack_id = request
            .workstack
            .get("workstack_id")
            .cloned()
            .unwrap_or(Value::Null);
        let workstack_digest = request
            .workstack
            .pointer("/integrity/digest")
            .cloned()
            .unwrap_or(Value::Null);
        let router_digest = request
            .capability_routing
            .pointer("/integrity/digest")
            .cloned()
            .unwrap_or(Value::Null);
        let reference_digest = request
            .reference_pilot_result
            .pointer("/integrity/digest")
            .cloned()
            .unwrap_or(Value::Null);
        Ok::<Value, String>(json!({
            "schema": RESULT_SCHEMA,
            "contract_version": CONTRACT_VERSION,
            "run_id": run_id,
            "workstack_ref": {
                "workstack_id": workstack_id,
                "integrity_digest": workstack_digest,
                "raw_context_included": false
            },
            "router_ref": {
                "integrity_digest": router_digest,
                "dry_run_source_validated": true
            },
            "benchmark": {
                "id": BENCHMARK_ID,
                "track": "codex_cli_visible_browser_pilot"
            },
            "batch_ref": {
                "batch_id": source.batch_id,
                "experiment_digest": source.experiment_digest,
                "protocol_digest": source.protocol_digest,
                "stack_key": source.stack_key,
                "public_seed_sha256": sha256_bytes(source.public_seed.to_string().as_bytes())
            },
            "reference_pilot_ref": {
                "pilot_id": request.reference_pilot_result.get("pilot_id").cloned().unwrap_or(Value::Null),
                "integrity_digest": reference_digest
            },
            "host_environment": if cfg!(target_os = "windows") { "windows" } else { "linux" },
            "selected_backend": backend,
            "candidate": {
                "id": candidate.id,
                "label": candidate.label,
                "adapter_kind": "codex_cli_signal_maze_v1",
                "sandbox_mode": "workspace-write",
                "environment": candidate.environment,
                "version": candidate.version,
                "cli_invoked": true,
                "subscription_or_vendor_quota_verified": false
            },
            "consent": request.consent,
            "budget": request.budget,
            "execution": {
                "started": true,
                "succeeded": true,
                "timed_out": false,
                "attempts": 1,
                "duration_ms": cli.duration_ms,
                "output_budget_exceeded": false,
                "prompt_sha256": prompt_digest,
                "stdout_sha256": cli.stdout.sha256,
                "stdout_bytes": cli.stdout.bytes,
                "stderr_sha256": cli.stderr.sha256,
                "stderr_bytes": cli.stderr.bytes,
                "raw_prompt_returned": false,
                "raw_cli_output_returned": false
            },
            "submission": {
                "materialized": true,
                "exact_topology_verified": true,
                "run_contract_unchanged": true,
                "files_total": 4,
                "bytes_total": submission_bytes,
                "digest": submission_digest,
                "generated_code_executed": true
            },
            "evaluator": {
                "kind": "deterministic_visible_static_gate",
                "started": true,
                "succeeded": true,
                "timed_out": false,
                "duration_ms": evaluator_duration_ms,
                "independent_process": true,
                "workspace_read_only": true,
                "network_namespace_enforced": true,
                "hidden_suite_used": false,
                "visible_checks_total": 7,
                "visible_checks_passed": 7,
                "submission_digest": submission_digest
            },
            "browser_evaluator": browser_evaluator,
            "security": {
                "public_benchmark_prompt_only": true,
                "original_repository_mounted": false,
                "original_repository_modified": false,
                "board_written": false,
                "merged": false,
                "published": false,
                "hidden_suite_mounted": false,
                "hidden_suite_used": false,
                "credentials_read_by_outilsia": false,
                "environment_allowlist_applied": true,
                "vendor_cli_auth_status_inspected": false,
                "vendor_cli_network_allowed_by_consent": true,
                "host_read_scope_controlled_by_vendor_cli_sandbox": true,
                "host_read_scope_independently_verified": false,
                "raw_cli_output_returned": false,
                "raw_cli_output_persisted": false,
                "generated_code_executed": true,
                "evaluator_process_isolated": true,
                "temporary_workspace_removed": true,
                "paths_returned": false
            },
            "cost": {
                "amount_eur": Value::Null,
                "status": "vendor_cli_quota_or_cost_unknown",
                "subscription_quota_inspected": false,
                "direct_api_call_by_outilsia": false
            },
            "human_gate": {
                "status": "review_required_before_any_winner_or_delivery",
                "winner_approval_recorded": false,
                "delivery_approval_recorded": false
            },
            "readiness": {
                "candidate_execution_verified": true,
                "submission_structure_verified": true,
                "visible_gameplay_verified": true,
                "hidden_evaluator_verified": false,
                "scientific_eligible": false,
                "winner_declared": false,
                "blockers": REQUIRED_BLOCKERS
            }
        }))
    })();

    let cleanup_completed = fs::remove_dir_all(&run_dir).is_ok() && !run_dir.exists();
    if !cleanup_completed {
        return Err("Le workspace Workstack Arena n'a pas pu etre supprime.".to_string());
    }
    let mut document = execution?;
    sign_document(&mut document)?;
    validate_workstack_arena_result(&document)?;
    Ok(document)
}

#[tauri::command]
pub(crate) async fn run_workstack_arena_codex_pilot(
    app: AppHandle,
    request: RunWorkstackArenaCodexPilotRequest,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || run_codex_pilot(app, request))
        .await
        .map_err(|_| "Pilote Workstack Arena interrompu.".to_string())?
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn valid_consent() -> Value {
        json!({
            "confirmed": true,
            "scope": CONSENT_SCOPE,
            "candidate_id": "codex-cli:linux_native",
            "vendor_cli_network_allowed": true,
            "vendor_cli_quota_or_cost_unknown_accepted": true,
            "disposable_workspace_write_allowed": true,
            "generated_code_execution_allowed": true,
            "original_repository_write_allowed": false,
            "board_write_allowed": false,
            "merge_allowed": false,
            "publish_allowed": false,
            "hidden_suite_allowed": false
        })
    }

    pub(crate) fn signed_result() -> Value {
        let mut browser = crate::forgebench_candidate::tests::signed_result()
            .get("browser_evaluator")
            .cloned()
            .expect("browser fixture");
        browser["submission_digest"] = json!("a".repeat(64));
        let mut result = json!({
            "schema": RESULT_SCHEMA,
            "contract_version": CONTRACT_VERSION,
            "run_id": "wsa-test-codex-pilot",
            "workstack_ref": {"workstack_id": "ws-ledger-test", "integrity_digest": "1".repeat(64), "raw_context_included": false},
            "router_ref": {"integrity_digest": "2".repeat(64), "dry_run_source_validated": true},
            "benchmark": {"id": BENCHMARK_ID, "track": "codex_cli_visible_browser_pilot"},
            "batch_ref": {"batch_id": "fbsb-test", "experiment_digest": "3".repeat(64), "protocol_digest": "4".repeat(64), "stack_key": STACK_KEY, "public_seed_sha256": "5".repeat(64)},
            "reference_pilot_ref": {"pilot_id": "fbp-test", "integrity_digest": "6".repeat(64)},
            "host_environment": "linux",
            "selected_backend": "linux-bwrap-native",
            "candidate": {"id": "codex-cli:linux_native", "label": "Codex CLI · Linux", "adapter_kind": "codex_cli_signal_maze_v1", "sandbox_mode": "workspace-write", "environment": "linux_native", "version": "0.144.3", "cli_invoked": true, "subscription_or_vendor_quota_verified": false},
            "consent": valid_consent(),
            "budget": {"max_duration_seconds": 300, "max_attempts": 1, "max_output_bytes": FIXED_OUTPUT_BUDGET_BYTES},
            "execution": {"started": true, "succeeded": true, "timed_out": false, "attempts": 1, "duration_ms": 4200, "output_budget_exceeded": false, "prompt_sha256": "7".repeat(64), "stdout_sha256": "8".repeat(64), "stdout_bytes": 1200, "stderr_sha256": "9".repeat(64), "stderr_bytes": 0, "raw_prompt_returned": false, "raw_cli_output_returned": false},
            "submission": {"materialized": true, "exact_topology_verified": true, "run_contract_unchanged": true, "files_total": 4, "bytes_total": 14000, "digest": "a".repeat(64), "generated_code_executed": true},
            "evaluator": {"kind": "deterministic_visible_static_gate", "started": true, "succeeded": true, "timed_out": false, "duration_ms": 140, "independent_process": true, "workspace_read_only": true, "network_namespace_enforced": true, "hidden_suite_used": false, "visible_checks_total": 7, "visible_checks_passed": 7, "submission_digest": "a".repeat(64)},
            "browser_evaluator": browser,
            "security": {"public_benchmark_prompt_only": true, "original_repository_mounted": false, "original_repository_modified": false, "board_written": false, "merged": false, "published": false, "hidden_suite_mounted": false, "hidden_suite_used": false, "credentials_read_by_outilsia": false, "environment_allowlist_applied": true, "vendor_cli_auth_status_inspected": false, "vendor_cli_network_allowed_by_consent": true, "host_read_scope_controlled_by_vendor_cli_sandbox": true, "host_read_scope_independently_verified": false, "raw_cli_output_returned": false, "raw_cli_output_persisted": false, "generated_code_executed": true, "evaluator_process_isolated": true, "temporary_workspace_removed": true, "paths_returned": false},
            "cost": {"amount_eur": Value::Null, "status": "vendor_cli_quota_or_cost_unknown", "subscription_quota_inspected": false, "direct_api_call_by_outilsia": false},
            "human_gate": {"status": "review_required_before_any_winner_or_delivery", "winner_approval_recorded": false, "delivery_approval_recorded": false},
            "readiness": {"candidate_execution_verified": true, "submission_structure_verified": true, "visible_gameplay_verified": true, "hidden_evaluator_verified": false, "scientific_eligible": false, "winner_declared": false, "blockers": REQUIRED_BLOCKERS}
        });
        sign_document(&mut result).expect("signed arena fixture");
        result
    }

    #[test]
    fn consent_is_exact_and_cannot_authorize_the_original_repository() {
        validate_consent(&valid_consent(), "codex-cli:linux_native")
            .expect("valid bounded consent");
        let mut unsafe_consent = valid_consent();
        unsafe_consent["original_repository_write_allowed"] = json!(true);
        assert!(validate_consent(&unsafe_consent, "codex-cli:linux_native").is_err());
        let mut extra = valid_consent();
        extra["shell_anywhere"] = json!(true);
        assert!(validate_consent(&extra, "codex-cli:linux_native").is_err());
    }

    #[test]
    fn budget_is_single_attempt_and_bounded() {
        let budget = json!({
            "max_duration_seconds": 300,
            "max_attempts": 1,
            "max_output_bytes": FIXED_OUTPUT_BUDGET_BYTES
        });
        assert_eq!(
            validate_budget(&budget).expect("valid budget"),
            Duration::from_secs(300)
        );
        let mut repeated = budget.clone();
        repeated["max_attempts"] = json!(2);
        assert!(validate_budget(&repeated).is_err());
        let mut unlisted_duration = budget;
        unlisted_duration["max_duration_seconds"] = json!(240);
        assert!(validate_budget(&unlisted_duration).is_err());
    }

    #[test]
    fn public_prompt_contains_no_board_or_repository_context() {
        let prompt = public_codex_prompt();
        assert!(prompt.contains("Signal Maze v1"));
        assert!(prompt.contains("disposable workspace"));
        assert!(!prompt.contains("planka"));
        assert!(!prompt.contains("C:\\Users"));
        assert!(!prompt.contains("/home/"));
    }

    #[test]
    fn codex_arguments_keep_the_vendor_sandbox_and_ephemeral_session() {
        let args = codex_exec_args();
        assert!(args
            .windows(2)
            .any(|values| values == ["--sandbox", "workspace-write"]));
        assert!(args.contains(&"--ephemeral"));
        assert!(args.contains(&"--ignore-user-config"));
        assert!(args.contains(&"--ignore-rules"));
        assert!(args.contains(&"--skip-git-repo-check"));
        assert!(!args.iter().any(|value| value.contains("dangerously")));
        assert!(!args.iter().any(|value| value.contains("bypass")));
    }

    #[test]
    fn codex_environment_allowlist_excludes_api_keys_and_third_party_tokens() {
        assert!(is_allowlisted_codex_environment_key("linux_native", "PATH"));
        assert!(is_allowlisted_codex_environment_key("linux_native", "HOME"));
        assert!(is_allowlisted_codex_environment_key(
            "windows_native",
            "USERPROFILE"
        ));
        assert!(is_allowlisted_codex_environment_key(
            "windows_native",
            "codex_home"
        ));
        assert!(!is_allowlisted_codex_environment_key(
            "wsl_default",
            "CODEX_HOME"
        ));
        for key in [
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
            "GITHUB_TOKEN",
            "AWS_SECRET_ACCESS_KEY",
            "SSH_AUTH_SOCK",
        ] {
            assert!(!is_allowlisted_codex_environment_key("linux_native", key));
            assert!(!is_allowlisted_codex_environment_key("windows_native", key));
            assert!(!is_allowlisted_codex_environment_key("wsl_default", key));
        }
    }

    #[test]
    fn signed_result_is_strict_and_cannot_claim_repository_write() {
        let result = signed_result();
        validate_workstack_arena_result(&result).expect("valid signed arena result");
        let mut oversized = result.clone();
        oversized["execution"]["stdout_bytes"] = json!(FIXED_OUTPUT_BUDGET_BYTES + 1);
        sign_document(&mut oversized).expect("resigned oversized result");
        assert!(validate_workstack_arena_result(&oversized).is_err());
        let mut tampered = result;
        tampered["security"]["original_repository_modified"] = json!(true);
        sign_document(&mut tampered).expect("resigned tampered result");
        assert!(validate_workstack_arena_result(&tampered).is_err());
        let mut unfiltered = signed_result();
        unfiltered["security"]["environment_allowlist_applied"] = json!(false);
        sign_document(&mut unfiltered).expect("resigned unfiltered result");
        assert!(validate_workstack_arena_result(&unfiltered).is_err());
    }
}
