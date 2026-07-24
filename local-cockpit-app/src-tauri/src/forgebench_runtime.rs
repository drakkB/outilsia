use crate::forgebench_browser::preflight_visible_browser;
use crate::forgebench_isolation::validate_forgebench_isolation_result;
use crate::forgebench_runner::{isolated_command, selected_backend};
use crate::workstack_composer::canonical_sha256;
use crate::{command_output_with_timeout, decode_command_stdout};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const REQUEST_SCHEMA: &str = "outilsia.forgebench_runtime_probe_request.v1";
const RESULT_SCHEMA: &str = "outilsia.forgebench_runtime_probe_result.v1";
const CONTRACT_VERSION: &str = "2026-07-24";
const PROBE_ROOT: &str = "forgebench-runtime-probe-v1";
const TOOLING_TIMEOUT: Duration = Duration::from_secs(8);
const NPX_INSTALL_COMMAND: &str = "npx --yes playwright install --with-deps chromium";
const PYTHON_INSTALL_COMMAND: &str = "python3 -m playwright install --with-deps chromium";

const TOOLING_PROBE_SCRIPT: &str = r#"
set -eu
if command -v npx >/dev/null 2>&1; then
  printf '%s\n' 'npx_available=true'
else
  printf '%s\n' 'npx_available=false'
fi
if command -v python3 >/dev/null 2>&1 \
  && python3 -c 'import playwright' >/dev/null 2>&1; then
  printf '%s\n' 'python_playwright_available=true'
else
  printf '%s\n' 'python_playwright_available=false'
fi
distro_id='unknown'
if [ -r /etc/os-release ]; then
  distro_id="$(. /etc/os-release; printf '%s' "${ID:-unknown}")"
fi
case "$distro_id" in
  *[!a-zA-Z0-9._-]*|'') distro_id='unknown' ;;
esac
printf 'distro_id=%s\n' "$distro_id"
"#;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ProbeForgeBenchRuntimeRequest {
    schema: String,
    isolation_result: Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ProbeForgeBenchRuntimeResult {
    schema: String,
    contract_version: String,
    probed_at_ms: u128,
    host_environment: String,
    target_environment: String,
    selected_backend: String,
    isolation_ref: Value,
    requirements: Value,
    readiness: Value,
    guidance: Value,
    security: Value,
    integrity: Value,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct ToolingEvidence {
    npx_available: bool,
    python_playwright_available: bool,
    distro_id: String,
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

fn host_environment() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unsupported"
    }
}

fn target_environment() -> &'static str {
    if cfg!(target_os = "windows") {
        "wsl_default"
    } else if cfg!(target_os = "linux") {
        "linux_native"
    } else {
        "unsupported"
    }
}

fn sign_result(document: &mut Value) -> Result<(), String> {
    document
        .as_object_mut()
        .ok_or_else(|| "Résultat du préflight Chromium invalide.".to_string())?
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

fn safe_identifier(value: Option<&String>) -> String {
    value
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 40
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        })
        .cloned()
        .unwrap_or_else(|| "unknown".to_string())
}

fn parse_tooling_output(output: &str) -> ToolingEvidence {
    let values = output
        .lines()
        .filter_map(|line| line.trim().split_once('='))
        .map(|(key, value)| (key.trim().to_string(), value.trim().to_string()))
        .collect::<BTreeMap<_, _>>();
    ToolingEvidence {
        npx_available: values.get("npx_available").map(String::as_str) == Some("true"),
        python_playwright_available: values
            .get("python_playwright_available")
            .map(String::as_str)
            == Some("true"),
        distro_id: safe_identifier(values.get("distro_id")),
    }
}

fn probe_tooling(root: &Path) -> ToolingEvidence {
    let Ok(command) = isolated_command(root, TOOLING_PROBE_SCRIPT) else {
        return ToolingEvidence {
            distro_id: "unknown".to_string(),
            ..ToolingEvidence::default()
        };
    };
    let Ok((output, timed_out)) =
        command_output_with_timeout(command, TOOLING_TIMEOUT, "outils ForgeBench")
    else {
        return ToolingEvidence {
            distro_id: "unknown".to_string(),
            ..ToolingEvidence::default()
        };
    };
    if timed_out || !output.status.success() {
        return ToolingEvidence {
            distro_id: "unknown".to_string(),
            ..ToolingEvidence::default()
        };
    }
    parse_tooling_output(&decode_command_stdout(&output.stdout).unwrap_or_default())
}

fn browser_reason(error: &str) -> &'static str {
    let lower = error.to_ascii_lowercase();
    if lower.contains("chromium headless manque") {
        "chromium_runtime_missing"
    } else if lower.contains("bubblewrap manque") {
        "bubblewrap_missing"
    } else if lower.contains("timeout") || lower.contains("interrompu") {
        "chromium_probe_timed_out"
    } else {
        "chromium_launch_canary_failed"
    }
}

fn guidance(runtime_ready: bool, tooling: &ToolingEvidence) -> Value {
    if runtime_ready {
        return json!({
            "mode": "none",
            "title": "Aucune installation requise",
            "detail": "Chromium fonctionne déjà dans le runtime isolé.",
            "command": null,
            "requires_user_confirmation": true,
            "network_required_if_run": false,
            "administrator_may_be_required": false
        });
    }
    let (command, mode, detail) = if tooling.python_playwright_available {
        (
            Some(PYTHON_INSTALL_COMMAND),
            "copy_command",
            "Playwright Python est disponible dans ce runtime. La commande installe Chromium et ses dépendances après votre confirmation.",
        )
    } else if tooling.npx_available {
        (
            Some(NPX_INSTALL_COMMAND),
            "copy_command",
            "npx est disponible dans ce runtime. La commande officielle Playwright installe Chromium et ses dépendances après votre confirmation.",
        )
    } else {
        (
            None,
            "manual",
            "Installez d'abord Node.js 22+ ou Playwright Python dans Linux/WSL, puis installez Chromium avec Playwright.",
        )
    };
    json!({
        "mode": mode,
        "title": "Chromium requis dans Linux/WSL",
        "detail": detail,
        "command": command,
        "requires_user_confirmation": true,
        "network_required_if_run": true,
        "administrator_may_be_required": true
    })
}

fn probe_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(PROBE_ROOT))
        .map_err(|error| format!("Dossier du préflight Chromium indisponible: {error}"))
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("Permissions du préflight Chromium impossibles: {error}"))
}

#[cfg(not(unix))]
fn set_private_directory_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn create_probe_root(root: &Path) -> Result<(), String> {
    if root.exists() {
        let metadata = fs::symlink_metadata(root)
            .map_err(|error| format!("Dossier du préflight Chromium illisible: {error}"))?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("Le dossier du préflight Chromium n'est pas fiable.".to_string());
        }
        fs::remove_dir_all(root)
            .map_err(|error| format!("Ancien préflight Chromium non supprimable: {error}"))?;
    }
    fs::create_dir_all(root.join("evaluation"))
        .map_err(|error| format!("Création du préflight Chromium impossible: {error}"))?;
    set_private_directory_permissions(root)?;
    set_private_directory_permissions(&root.join("evaluation"))
}

fn build_document(
    request: &ProbeForgeBenchRuntimeRequest,
    tooling: &ToolingEvidence,
    browser_result: Result<Value, String>,
) -> Result<Value, String> {
    validate_forgebench_isolation_result(&request.isolation_result)?;
    let backend = selected_backend(&request.isolation_result)?.to_string();
    let isolation_digest = request
        .isolation_result
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .ok_or_else(|| "Empreinte du préflight d'isolation absente.".to_string())?;
    let (runtime_ready, browser_origin, duration_ms, blocker) = match browser_result {
        Ok(result) => (
            true,
            result
                .get("browser_origin")
                .and_then(Value::as_str)
                .map(str::to_string),
            result
                .get("duration_ms")
                .and_then(Value::as_u64)
                .unwrap_or_default(),
            None,
        ),
        Err(error) => (false, None, 0, Some(browser_reason(&error).to_string())),
    };
    let blockers = blocker.into_iter().collect::<Vec<_>>();
    let mut document = json!({
        "schema": RESULT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "probed_at_ms": unix_ms(),
        "host_environment": host_environment(),
        "target_environment": target_environment(),
        "selected_backend": backend,
        "isolation_ref": {
            "schema": request.isolation_result.get("schema").cloned().unwrap_or(Value::Null),
            "integrity_digest": isolation_digest,
            "backend_ready": true
        },
        "requirements": {
            "bubblewrap": {
                "ready": true,
                "verified_by_isolation_canary": true
            },
            "chromium": {
                "family": "chromium",
                "launch_canary_passed": runtime_ready,
                "origin": browser_origin,
                "duration_ms": duration_ms
            },
            "installer_tooling": {
                "npx_available": tooling.npx_available,
                "python_playwright_available": tooling.python_playwright_available,
                "distro_id": tooling.distro_id
            }
        },
        "readiness": {
            "runtime_ready": runtime_ready,
            "browser_runtime_ready": runtime_ready,
            "worker_browser_execution_ready": runtime_ready,
            "scientific_eligible": false,
            "blockers": blockers
        },
        "guidance": guidance(runtime_ready, tooling),
        "security": {
            "probe_attempted": true,
            "browser_launch_attempted": true,
            "browser_launch_canary_succeeded": runtime_ready,
            "installation_started": false,
            "network_request_attempted": false,
            "worker_started": false,
            "credentials_read": false,
            "paths_returned": false,
            "raw_browser_output_returned": false
        }
    });
    sign_result(&mut document)?;
    validate_forgebench_runtime_result(&document)?;
    Ok(document)
}

pub(crate) fn validate_forgebench_runtime_result(result: &Value) -> Result<(), String> {
    let runtime_ready = result
        .pointer("/readiness/runtime_ready")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let blockers = result
        .pointer("/readiness/blockers")
        .and_then(Value::as_array)
        .ok_or_else(|| "Blocages du préflight Chromium absents.".to_string())?;
    let guidance_mode = result
        .pointer("/guidance/mode")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let command = result.pointer("/guidance/command");
    let browser_origin = result
        .pointer("/requirements/chromium/origin")
        .and_then(Value::as_str);
    let browser_duration_ms = result
        .pointer("/requirements/chromium/duration_ms")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let command_valid = match command {
        Some(Value::Null) | None => guidance_mode != "copy_command",
        Some(Value::String(value)) => {
            guidance_mode == "copy_command"
                && matches!(value.as_str(), NPX_INSTALL_COMMAND | PYTHON_INSTALL_COMMAND)
        }
        _ => false,
    };
    let blocker_valid = if runtime_ready {
        blockers.is_empty()
    } else {
        blockers.len() == 1
            && matches!(
                blockers[0].as_str(),
                Some(
                    "chromium_runtime_missing"
                        | "bubblewrap_missing"
                        | "chromium_probe_timed_out"
                        | "chromium_launch_canary_failed"
                )
            )
    };
    if result.get("schema").and_then(Value::as_str) != Some(RESULT_SCHEMA)
        || result
            .get("selected_backend")
            .and_then(Value::as_str)
            .is_none_or(|value| !matches!(value, "linux-bwrap-native" | "wsl-bwrap"))
        || result
            .pointer("/isolation_ref/backend_ready")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/isolation_ref/integrity_digest")
            .and_then(Value::as_str)
            .is_none_or(|value| {
                value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit())
            })
        || result
            .pointer("/requirements/bubblewrap/ready")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/requirements/chromium/launch_canary_passed")
            .and_then(Value::as_bool)
            != Some(runtime_ready)
        || (runtime_ready
            && (!matches!(browser_origin, Some("system" | "playwright_cache"))
                || browser_duration_ms == 0))
        || (!runtime_ready && (browser_origin.is_some() || browser_duration_ms != 0))
        || result
            .pointer("/readiness/browser_runtime_ready")
            .and_then(Value::as_bool)
            != Some(runtime_ready)
        || result
            .pointer("/readiness/worker_browser_execution_ready")
            .and_then(Value::as_bool)
            != Some(runtime_ready)
        || result
            .pointer("/readiness/scientific_eligible")
            .and_then(Value::as_bool)
            != Some(false)
        || !blocker_valid
        || !matches!(guidance_mode, "none" | "copy_command" | "manual")
        || (runtime_ready && guidance_mode != "none")
        || (!runtime_ready && guidance_mode == "none")
        || !command_valid
        || result
            .pointer("/guidance/requires_user_confirmation")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/guidance/network_required_if_run")
            .and_then(Value::as_bool)
            != Some(!runtime_ready)
        || result
            .pointer("/guidance/administrator_may_be_required")
            .and_then(Value::as_bool)
            != Some(!runtime_ready)
        || result
            .pointer("/security/probe_attempted")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/security/browser_launch_attempted")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/security/browser_launch_canary_succeeded")
            .and_then(Value::as_bool)
            != Some(runtime_ready)
        || [
            "installation_started",
            "network_request_attempted",
            "worker_started",
            "credentials_read",
            "paths_returned",
            "raw_browser_output_returned",
        ]
        .iter()
        .any(|key| {
            result
                .pointer(&format!("/security/{key}"))
                .and_then(Value::as_bool)
                != Some(false)
        })
    {
        return Err("Résultat du préflight Chromium trompeur.".to_string());
    }
    let digest = result
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or_else(|| "Empreinte du préflight Chromium absente.".to_string())?;
    let mut unsigned = result.clone();
    unsigned
        .as_object_mut()
        .ok_or_else(|| "Préflight Chromium invalide.".to_string())?
        .remove("integrity");
    if canonical_sha256(&unsigned) != digest {
        return Err("Empreinte du préflight Chromium incohérente.".to_string());
    }
    Ok(())
}

fn probe_inner(
    app: AppHandle,
    request: ProbeForgeBenchRuntimeRequest,
) -> Result<ProbeForgeBenchRuntimeResult, String> {
    if request.schema != REQUEST_SCHEMA {
        return Err("Contrat du préflight Chromium invalide.".to_string());
    }
    validate_forgebench_isolation_result(&request.isolation_result)?;
    selected_backend(&request.isolation_result)?;
    let _guard = probe_lock()
        .try_lock()
        .map_err(|_| "Un préflight Chromium est déjà en cours.".to_string())?;
    let root = probe_root(&app)?;
    create_probe_root(&root)?;
    let tooling = probe_tooling(&root);
    let browser_result = preflight_visible_browser(&root);
    let document = build_document(&request, &tooling, browser_result);
    let _ = fs::remove_dir_all(&root);
    serde_json::from_value(document?)
        .map_err(|error| format!("Résultat du préflight Chromium non sérialisable: {error}"))
}

#[tauri::command]
pub(crate) async fn probe_forgebench_runtime(
    app: AppHandle,
    request: ProbeForgeBenchRuntimeRequest,
) -> Result<ProbeForgeBenchRuntimeResult, String> {
    tauri::async_runtime::spawn_blocking(move || probe_inner(app, request))
        .await
        .map_err(|error| format!("Préflight Chromium interrompu: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn isolation_result() -> Value {
        let mut document = json!({
            "schema": "outilsia.forgebench_isolation_probe_result.v1",
            "contract_version": "2026-07-13",
            "probed_at_ms": 1,
            "host_environment": if cfg!(target_os = "windows") { "windows" } else { "linux" },
            "selected_backend": if cfg!(target_os = "windows") { "wsl-bwrap" } else { "linux-bwrap-native" },
            "candidates": [{
                "id": if cfg!(target_os = "windows") { "wsl-bwrap" } else { "linux-bwrap-native" },
                "label": "Bubblewrap",
                "environment": if cfg!(target_os = "windows") { "wsl_default" } else { "linux_native" },
                "backend": "bubblewrap",
                "installed": true,
                "probe_executed": true,
                "timed_out": false,
                "canary_passed": true,
                "version": "bubblewrap 0.11.0",
                "reason_code": null,
                "capabilities": {
                    "user_namespace": true,
                    "mount_namespace": true,
                    "network_namespace": true,
                    "pid_namespace": true,
                    "workspace_write": true,
                    "host_root_hidden": true,
                    "host_sentinel_unchanged": true
                }
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
        sign_isolation_for_test(&mut document);
        document
    }

    fn sign_isolation_for_test(document: &mut Value) {
        document
            .as_object_mut()
            .expect("isolation object")
            .remove("integrity");
        let digest = canonical_sha256(document);
        document["integrity"] = json!({
            "algorithm": "SHA-256",
            "canonicalization": "recursive-key-sort-json-v1",
            "scope": "canonical_document_without_integrity",
            "digest": digest
        });
    }

    #[test]
    fn tooling_parser_does_not_return_paths() {
        let result = parse_tooling_output(
            "npx_available=true\npython_playwright_available=false\ndistro_id=ubuntu\npath=/home/user\n",
        );
        assert!(result.npx_available);
        assert!(!result.python_playwright_available);
        assert_eq!(result.distro_id, "ubuntu");
    }

    #[test]
    fn guidance_prefers_existing_python_playwright() {
        let result = guidance(
            false,
            &ToolingEvidence {
                npx_available: true,
                python_playwright_available: true,
                distro_id: "ubuntu".to_string(),
            },
        );
        assert_eq!(
            result.get("command").and_then(Value::as_str),
            Some(PYTHON_INSTALL_COMMAND)
        );
        assert_eq!(
            result.get("mode").and_then(Value::as_str),
            Some("copy_command")
        );
    }

    #[test]
    fn ready_result_is_signed_and_rejects_install_claims() {
        let request = ProbeForgeBenchRuntimeRequest {
            schema: REQUEST_SCHEMA.to_string(),
            isolation_result: isolation_result(),
        };
        let tooling = ToolingEvidence {
            npx_available: true,
            python_playwright_available: false,
            distro_id: "ubuntu".to_string(),
        };
        let mut result = build_document(
            &request,
            &tooling,
            Ok(json!({
                "browser_family": "chromium",
                "browser_origin": "playwright_cache",
                "duration_ms": 480,
                "network_namespace_enforced": true
            })),
        )
        .expect("valid runtime result");
        validate_forgebench_runtime_result(&result).expect("signed result");
        result["security"]["installation_started"] = json!(true);
        assert!(validate_forgebench_runtime_result(&result).is_err());
    }

    #[test]
    fn missing_runtime_returns_only_bounded_guidance() {
        let request = ProbeForgeBenchRuntimeRequest {
            schema: REQUEST_SCHEMA.to_string(),
            isolation_result: isolation_result(),
        };
        let tooling = ToolingEvidence {
            npx_available: true,
            python_playwright_available: false,
            distro_id: "ubuntu".to_string(),
        };
        let result = build_document(
            &request,
            &tooling,
            Err("Chromium headless manque dans Linux/WSL.".to_string()),
        )
        .expect("guided result");
        assert_eq!(
            result
                .pointer("/readiness/blockers/0")
                .and_then(Value::as_str),
            Some("chromium_runtime_missing")
        );
        assert_eq!(
            result.pointer("/guidance/command").and_then(Value::as_str),
            Some(NPX_INSTALL_COMMAND)
        );
        assert_eq!(
            result
                .pointer("/security/installation_started")
                .and_then(Value::as_bool),
            Some(false)
        );
        validate_forgebench_runtime_result(&result).expect("valid missing-runtime result");
    }
}
