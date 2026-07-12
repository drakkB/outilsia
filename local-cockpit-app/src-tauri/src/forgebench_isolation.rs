use crate::workstack_composer::canonical_sha256;
use crate::{command_output_with_timeout, decode_command_stdout};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const REQUEST_SCHEMA: &str = "outilsia.forgebench_isolation_probe_request.v1";
const RESULT_SCHEMA: &str = "outilsia.forgebench_isolation_probe_result.v1";
const CONTRACT_VERSION: &str = "2026-07-13";
const PROBE_ROOT: &str = "forgebench-isolation-probe-v1";
const PROBE_TIMEOUT: Duration = Duration::from_secs(12);
const CANARY_INPUT: &str = "forgebench-public-canary-v1";
const CANARY_OUTPUT: &str = "forgebench-isolation-ok";

const BWRAP_CANARY_SCRIPT: &str = r#"
set -eu
if ! command -v bwrap >/dev/null 2>&1; then
  printf '%s\n' 'probe_error=bubblewrap_not_installed'
  exit 72
fi
host_user="$(readlink /proc/self/ns/user)"
host_mnt="$(readlink /proc/self/ns/mnt)"
host_net="$(readlink /proc/self/ns/net)"
host_pid="$(readlink /proc/self/ns/pid)"
printf 'backend_version=%s\n' "$(bwrap --version | head -n 1)"
set -- --die-with-parent --new-session --unshare-all --clearenv
set -- "$@" --ro-bind /usr /usr
if [ -e /lib ]; then set -- "$@" --ro-bind /lib /lib; fi
if [ -e /lib64 ]; then set -- "$@" --ro-bind /lib64 /lib64; fi
set -- "$@" --proc /proc --dev /dev --tmpfs /tmp --dir /etc
set -- "$@" --bind "$PWD" /workspace --chdir /workspace
set -- "$@" --setenv HOME /tmp --setenv PATH /usr/bin
inside="$({ bwrap "$@" -- /usr/bin/sh -c '
  set -eu
  test "$(cat canary-input.txt)" = "forgebench-public-canary-v1"
  test ! -e /etc/passwd
  test ! -e /home
  test ! -e /mnt
  printf "%s" "forgebench-isolation-ok" > canary-output.txt
  printf "marker=forgebench-isolation-ok\n"
  printf "inside_user=%s\n" "$(readlink /proc/self/ns/user)"
  printf "inside_mnt=%s\n" "$(readlink /proc/self/ns/mnt)"
  printf "inside_net=%s\n" "$(readlink /proc/self/ns/net)"
  printf "inside_pid=%s\n" "$(readlink /proc/self/ns/pid)"
  printf "host_root_hidden=true\n"
'; } 2>/dev/null)" || {
  printf '%s\n' 'probe_error=bubblewrap_canary_failed'
  exit 73
}
printf 'host_user=%s\n' "$host_user"
printf 'host_mnt=%s\n' "$host_mnt"
printf 'host_net=%s\n' "$host_net"
printf 'host_pid=%s\n' "$host_pid"
printf '%s\n' "$inside"
"#;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ProbeForgeBenchIsolationRequest {
    schema: String,
    prefer_wsl: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ProbeForgeBenchIsolationResult {
    schema: String,
    contract_version: String,
    probed_at_ms: u128,
    host_environment: String,
    selected_backend: Option<String>,
    candidates: Vec<IsolationCandidate>,
    capabilities: Value,
    security: Value,
    readiness: Value,
    integrity: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
struct IsolationCandidate {
    id: String,
    label: String,
    environment: String,
    backend: String,
    installed: bool,
    probe_executed: bool,
    timed_out: bool,
    canary_passed: bool,
    version: Option<String>,
    reason_code: Option<String>,
    capabilities: Value,
}

#[derive(Debug, Default, PartialEq, Eq)]
struct CanaryEvidence {
    marker: bool,
    version: Option<String>,
    user_namespace: bool,
    mount_namespace: bool,
    network_namespace: bool,
    pid_namespace: bool,
    host_root_hidden: bool,
    reason_code: Option<String>,
}

fn probe_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn sign_result(document: &mut Value) -> Result<(), String> {
    document
        .as_object_mut()
        .ok_or_else(|| "Résultat du préflight d'isolation invalide.".to_string())?
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

fn safe_reason(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 80
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return None;
    }
    Some(value.to_string())
}

fn namespace_changed(values: &BTreeMap<String, String>, key: &str) -> bool {
    let host = values.get(&format!("host_{key}"));
    let inside = values.get(&format!("inside_{key}"));
    host.is_some_and(|host| inside.is_some_and(|inside| host != inside))
}

fn parse_canary_output(output: &str) -> CanaryEvidence {
    let values = output
        .lines()
        .filter_map(|line| line.trim().split_once('='))
        .map(|(key, value)| (key.trim().to_string(), value.trim().to_string()))
        .collect::<BTreeMap<_, _>>();
    CanaryEvidence {
        marker: values.get("marker").map(String::as_str) == Some(CANARY_OUTPUT),
        version: values
            .get("backend_version")
            .filter(|value| !value.is_empty() && value.len() <= 80)
            .cloned(),
        user_namespace: namespace_changed(&values, "user"),
        mount_namespace: namespace_changed(&values, "mnt"),
        network_namespace: namespace_changed(&values, "net"),
        pid_namespace: namespace_changed(&values, "pid"),
        host_root_hidden: values.get("host_root_hidden").map(String::as_str) == Some("true"),
        reason_code: values
            .get("probe_error")
            .and_then(|value| safe_reason(value)),
    }
}

fn probe_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(PROBE_ROOT))
        .map_err(|error| format!("Dossier de préflight d'isolation indisponible: {error}"))
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("Permissions du préflight impossibles: {error}"))
}

#[cfg(not(unix))]
fn set_private_directory_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn create_probe_workspace(root: &Path) -> Result<PathBuf, String> {
    if root.exists() {
        let metadata = fs::symlink_metadata(root)
            .map_err(|error| format!("Dossier de préflight illisible: {error}"))?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("Le dossier de préflight d'isolation n'est pas fiable.".to_string());
        }
        fs::remove_dir_all(root)
            .map_err(|error| format!("Ancien préflight non supprimable: {error}"))?;
    }
    fs::create_dir_all(root)
        .map_err(|error| format!("Création du préflight impossible: {error}"))?;
    set_private_directory_permissions(root)?;
    let workspace = root.join("workspace");
    fs::create_dir(&workspace)
        .map_err(|error| format!("Création du workspace canari impossible: {error}"))?;
    set_private_directory_permissions(&workspace)?;
    fs::write(workspace.join("canary-input.txt"), CANARY_INPUT)
        .map_err(|error| format!("Canari d'entrée impossible: {error}"))?;
    fs::write(root.join("host-sentinel.txt"), "must-remain-outside")
        .map_err(|error| format!("Sentinelle hôte impossible: {error}"))?;
    Ok(workspace)
}

#[cfg(any(not(target_os = "linux"), test))]
fn unavailable_candidate(
    id: &str,
    label: &str,
    environment: &str,
    reason: &str,
) -> IsolationCandidate {
    IsolationCandidate {
        id: id.to_string(),
        label: label.to_string(),
        environment: environment.to_string(),
        backend: "bubblewrap".to_string(),
        installed: false,
        probe_executed: false,
        timed_out: false,
        canary_passed: false,
        version: None,
        reason_code: Some(reason.to_string()),
        capabilities: json!({
            "user_namespace": false,
            "mount_namespace": false,
            "network_namespace": false,
            "pid_namespace": false,
            "workspace_write": false,
            "host_root_hidden": false
        }),
    }
}

fn run_bwrap_probe(
    id: &str,
    label: &str,
    environment: &str,
    command: Command,
    workspace: &Path,
) -> IsolationCandidate {
    let output = command_output_with_timeout(command, PROBE_TIMEOUT, label);
    let (stdout, success, timed_out) = match output {
        Ok((output, timed_out)) => (
            decode_command_stdout(&output.stdout).unwrap_or_default(),
            output.status.success(),
            timed_out,
        ),
        Err(_) => (String::new(), false, false),
    };
    let evidence = parse_canary_output(&stdout);
    let workspace_write = fs::read_to_string(workspace.join("canary-output.txt"))
        .is_ok_and(|value| value == CANARY_OUTPUT);
    let host_sentinel_unchanged = fs::read_to_string(
        workspace
            .parent()
            .unwrap_or(workspace)
            .join("host-sentinel.txt"),
    )
    .is_ok_and(|value| value == "must-remain-outside");
    let canary_passed = success
        && !timed_out
        && evidence.marker
        && evidence.user_namespace
        && evidence.mount_namespace
        && evidence.network_namespace
        && evidence.pid_namespace
        && evidence.host_root_hidden
        && workspace_write
        && host_sentinel_unchanged;
    let reason_code = if canary_passed {
        None
    } else if timed_out {
        Some("probe_timed_out".to_string())
    } else {
        evidence
            .reason_code
            .or_else(|| Some("isolation_canary_failed".to_string()))
    };
    IsolationCandidate {
        id: id.to_string(),
        label: label.to_string(),
        environment: environment.to_string(),
        backend: "bubblewrap".to_string(),
        installed: evidence.version.is_some(),
        probe_executed: true,
        timed_out,
        canary_passed,
        version: evidence.version,
        reason_code,
        capabilities: json!({
            "user_namespace": evidence.user_namespace,
            "mount_namespace": evidence.mount_namespace,
            "network_namespace": evidence.network_namespace,
            "pid_namespace": evidence.pid_namespace,
            "workspace_write": workspace_write,
            "host_root_hidden": evidence.host_root_hidden,
            "host_sentinel_unchanged": host_sentinel_unchanged
        }),
    }
}

#[cfg(target_os = "linux")]
fn probe_candidates(workspace: &Path, _prefer_wsl: bool) -> Vec<IsolationCandidate> {
    let mut command = Command::new("sh");
    command
        .args(["-lc", BWRAP_CANARY_SCRIPT])
        .current_dir(workspace);
    vec![run_bwrap_probe(
        "linux-bwrap-native",
        "Bubblewrap Linux",
        "linux_native",
        command,
        workspace,
    )]
}

#[cfg(target_os = "windows")]
fn probe_candidates(workspace: &Path, prefer_wsl: bool) -> Vec<IsolationCandidate> {
    let mut candidates = vec![unavailable_candidate(
        "windows-native-none",
        "Windows natif",
        "windows_native",
        "no_supported_native_isolation_backend",
    )];
    if !prefer_wsl {
        return candidates;
    }
    let Some(workspace_text) = workspace.to_str() else {
        candidates.push(unavailable_candidate(
            "wsl-bwrap",
            "Bubblewrap WSL",
            "wsl_default",
            "workspace_path_not_utf8",
        ));
        return candidates;
    };
    let mut command = Command::new("wsl.exe");
    command.args([
        "--cd",
        workspace_text,
        "-e",
        "sh",
        "-lc",
        BWRAP_CANARY_SCRIPT,
    ]);
    candidates.push(run_bwrap_probe(
        "wsl-bwrap",
        "Bubblewrap WSL",
        "wsl_default",
        command,
        workspace,
    ));
    candidates
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn probe_candidates(_workspace: &Path, _prefer_wsl: bool) -> Vec<IsolationCandidate> {
    vec![unavailable_candidate(
        "unsupported-platform",
        "Plateforme non prise en charge",
        "unsupported",
        "no_supported_isolation_backend",
    )]
}

fn host_environment() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unsupported"
    }
}

fn selected_capability(candidate: Option<&IsolationCandidate>, key: &str) -> bool {
    candidate
        .and_then(|value| value.capabilities.get(key))
        .and_then(Value::as_bool)
        == Some(true)
}

pub(crate) fn validate_forgebench_isolation_result(result: &Value) -> Result<(), String> {
    let candidates = result
        .get("candidates")
        .and_then(Value::as_array)
        .ok_or_else(|| "Candidats d'isolation absents.".to_string())?;
    if candidates.is_empty() || candidates.len() > 2 {
        return Err("Nombre de backends d'isolation incohérent.".to_string());
    }
    let passed = candidates
        .iter()
        .filter(|candidate| candidate.get("canary_passed").and_then(Value::as_bool) == Some(true))
        .collect::<Vec<_>>();
    if passed.len() > 1
        || candidates.iter().any(|candidate| {
            !matches!(
                candidate.get("id").and_then(Value::as_str),
                Some(
                    "linux-bwrap-native"
                        | "wsl-bwrap"
                        | "windows-native-none"
                        | "unsupported-platform"
                )
            )
        })
    {
        return Err("Identité de backend d'isolation invalide.".to_string());
    }
    let selected = result.get("selected_backend").and_then(Value::as_str);
    let selected_valid = selected.is_none_or(|id| {
        passed
            .iter()
            .any(|candidate| candidate.get("id").and_then(Value::as_str) == Some(id))
    });
    let backend_ready = selected.is_some();
    let blockers = result
        .pointer("/readiness/blockers")
        .and_then(Value::as_array)
        .ok_or_else(|| "Blocages du préflight d'isolation absents.".to_string())?;
    let has_blocker = |required: &str| {
        blockers
            .iter()
            .any(|value| value.as_str() == Some(required))
    };
    let required_capabilities = [
        "user_namespace_available",
        "mount_namespace_available",
        "network_namespace_available",
        "pid_namespace_available",
        "workspace_write_canary_passed",
        "host_root_hidden_in_canary",
        "hidden_vault_not_mounted_by_policy",
    ];
    let capabilities_consistent = required_capabilities.iter().all(|key| {
        result
            .pointer(&format!("/capabilities/{key}"))
            .and_then(Value::as_bool)
            == Some(backend_ready)
    });
    if result.get("schema").and_then(Value::as_str) != Some(RESULT_SCHEMA)
        || !selected_valid
        || passed.len() != usize::from(backend_ready)
        || result
            .pointer("/readiness/isolation_backend_ready")
            .and_then(Value::as_bool)
            != Some(backend_ready)
        || !capabilities_consistent
        || result
            .pointer("/capabilities/outbound_network_request_attempted")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/probe_attempted")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/security/canary_command_succeeded")
            .and_then(Value::as_bool)
            != Some(selected.is_some())
        || result
            .pointer("/security/worker_started")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/worker_command_executed")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/credentials_read")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/paths_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/hidden_suite_contents_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/source_repository_mounted")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/readiness/worker_execution_ready")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/readiness/scientific_eligible")
            .and_then(Value::as_bool)
            != Some(false)
        || !has_blocker("worker_runner_not_implemented")
        || !has_blocker("worker_process_not_started")
        || !has_blocker("isolated_evaluator_not_implemented")
        || (!backend_ready && !has_blocker("verified_isolation_backend_unavailable"))
    {
        return Err("Résultat du préflight d'isolation trompeur.".to_string());
    }
    let digest = result
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or_else(|| "Empreinte du préflight absente.".to_string())?;
    let mut unsigned = result.clone();
    unsigned
        .as_object_mut()
        .ok_or_else(|| "Préflight d'isolation invalide.".to_string())?
        .remove("integrity");
    if canonical_sha256(&unsigned) != digest {
        return Err("Empreinte du préflight incohérente.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn probe_forgebench_isolation(
    app: AppHandle,
    request: ProbeForgeBenchIsolationRequest,
) -> Result<ProbeForgeBenchIsolationResult, String> {
    if request.schema != REQUEST_SCHEMA {
        return Err("Contrat du préflight d'isolation ForgeBench invalide.".to_string());
    }
    let _guard = probe_lock()
        .try_lock()
        .map_err(|_| "Un préflight d'isolation ForgeBench est déjà en cours.".to_string())?;
    let root = probe_root(&app)?;
    let workspace = create_probe_workspace(&root)?;
    let candidates = probe_candidates(&workspace, request.prefer_wsl.unwrap_or(true));
    let selected_backend = candidates
        .iter()
        .find(|candidate| candidate.canary_passed)
        .map(|candidate| candidate.id.clone());
    let selected = selected_backend
        .as_ref()
        .and_then(|id| candidates.iter().find(|candidate| &candidate.id == id));
    let isolation_backend_ready = selected.is_some();
    let mut blockers = vec![
        "worker_runner_not_implemented",
        "worker_process_not_started",
        "isolated_evaluator_not_implemented",
    ];
    if !isolation_backend_ready {
        blockers.insert(0, "verified_isolation_backend_unavailable");
    }
    let mut document = json!({
        "schema": RESULT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "probed_at_ms": unix_ms(),
        "host_environment": host_environment(),
        "selected_backend": selected_backend,
        "candidates": candidates,
        "capabilities": {
            "isolation_backend_ready": isolation_backend_ready,
            "user_namespace_available": selected_capability(selected, "user_namespace"),
            "mount_namespace_available": selected_capability(selected, "mount_namespace"),
            "network_namespace_available": selected_capability(selected, "network_namespace"),
            "pid_namespace_available": selected_capability(selected, "pid_namespace"),
            "workspace_write_canary_passed": selected_capability(selected, "workspace_write"),
            "host_root_hidden_in_canary": selected_capability(selected, "host_root_hidden"),
            "hidden_vault_not_mounted_by_policy": isolation_backend_ready,
            "outbound_network_request_attempted": false
        },
        "security": {
            "probe_attempted": true,
            "canary_command_succeeded": isolation_backend_ready,
            "worker_started": false,
            "worker_command_executed": false,
            "credentials_read": false,
            "paths_returned": false,
            "hidden_suite_contents_returned": false,
            "source_repository_mounted": false
        },
        "readiness": {
            "isolation_backend_ready": isolation_backend_ready,
            "worker_execution_ready": false,
            "scientific_eligible": false,
            "blockers": blockers
        }
    });
    sign_result(&mut document)?;
    validate_forgebench_isolation_result(&document)?;
    let _ = fs::remove_dir_all(&root);
    serde_json::from_value(document)
        .map_err(|error| format!("Résultat du préflight non sérialisable: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn passing_output() -> String {
        [
            "backend_version=bubblewrap 0.11.0",
            "host_user=user:[1]",
            "inside_user=user:[2]",
            "host_mnt=mnt:[3]",
            "inside_mnt=mnt:[4]",
            "host_net=net:[5]",
            "inside_net=net:[6]",
            "host_pid=pid:[7]",
            "inside_pid=pid:[8]",
            "marker=forgebench-isolation-ok",
            "host_root_hidden=true",
        ]
        .join("\n")
    }

    #[test]
    fn parses_independent_namespaces_without_exposing_ids_in_result() {
        let evidence = parse_canary_output(&passing_output());
        assert!(evidence.marker);
        assert!(evidence.user_namespace);
        assert!(evidence.mount_namespace);
        assert!(evidence.network_namespace);
        assert!(evidence.pid_namespace);
        assert!(evidence.host_root_hidden);
        assert_eq!(evidence.version.as_deref(), Some("bubblewrap 0.11.0"));
    }

    #[test]
    fn refuses_same_namespace_or_untrusted_reason_code() {
        let evidence =
            parse_canary_output("host_net=net:[5]\ninside_net=net:[5]\nprobe_error=../../secret\n");
        assert!(!evidence.network_namespace);
        assert_eq!(evidence.reason_code, None);
    }

    #[test]
    fn validated_result_can_never_claim_worker_or_scientific_readiness() {
        let mut document = json!({
            "schema": RESULT_SCHEMA,
            "contract_version": CONTRACT_VERSION,
            "probed_at_ms": 1,
            "host_environment": "linux",
            "selected_backend": "linux-bwrap-native",
            "candidates": [{
                "id": "linux-bwrap-native",
                "canary_passed": true
            }],
            "capabilities": {
                "isolation_backend_ready": true,
                "user_namespace_available": true,
                "mount_namespace_available": true,
                "network_namespace_available": true,
                "pid_namespace_available": true,
                "workspace_write_canary_passed": true,
                "host_root_hidden_in_canary": true,
                "hidden_vault_not_mounted_by_policy": true,
                "outbound_network_request_attempted": false
            },
            "security": {
                "probe_attempted": true,
                "canary_command_succeeded": true,
                "worker_started": false,
                "worker_command_executed": false,
                "credentials_read": false,
                "paths_returned": false,
                "hidden_suite_contents_returned": false,
                "source_repository_mounted": false
            },
            "readiness": {
                "isolation_backend_ready": true,
                "worker_execution_ready": false,
                "scientific_eligible": false,
                "blockers": [
                    "worker_runner_not_implemented",
                    "worker_process_not_started",
                    "isolated_evaluator_not_implemented"
                ]
            }
        });
        sign_result(&mut document).unwrap();
        validate_forgebench_isolation_result(&document).unwrap();
        let mut forged_capabilities = document.clone();
        forged_capabilities["capabilities"]["network_namespace_available"] = json!(false);
        sign_result(&mut forged_capabilities).unwrap();
        assert!(validate_forgebench_isolation_result(&forged_capabilities).is_err());
        document["readiness"]["scientific_eligible"] = json!(true);
        sign_result(&mut document).unwrap();
        assert!(validate_forgebench_isolation_result(&document).is_err());
    }

    #[test]
    fn unavailable_candidate_never_claims_capabilities() {
        let candidate = unavailable_candidate("none", "None", "windows_native", "unsupported");
        assert!(!candidate.installed);
        assert!(!candidate.probe_executed);
        assert!(!candidate.canary_passed);
        assert_eq!(candidate.capabilities["network_namespace"], false);
    }
}
