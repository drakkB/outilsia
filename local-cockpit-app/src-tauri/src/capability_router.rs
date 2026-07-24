use crate::workstack_composer::{canonical_sha256, validate_workstack_plan};
use crate::{command_output_with_timeout, decode_command_stdout};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::process::Command;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const REQUEST_SCHEMA: &str = "outilsia.capability_router_request.v1";
const RESULT_SCHEMA: &str = "outilsia.capability_router_result.v1";
const ROUTING_SCHEMA: &str = "outilsia.capability_routing.v1";
const CONTRACT_VERSION: &str = "2026-07-12";
const DEFAULT_TIMEOUT_SECONDS: u64 = 4;
const MIN_TIMEOUT_SECONDS: u64 = 2;
const MAX_TIMEOUT_SECONDS: u64 = 8;
const MAX_LOCAL_MODELS: usize = 64;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct LocalModelCapabilityInput {
    model_ref: String,
    runtime: Option<String>,
    size_gb: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct RouteWorkstackCapabilitiesRequest {
    schema: String,
    workstack: Value,
    objective_kind: Option<String>,
    installed_models: Option<Vec<LocalModelCapabilityInput>>,
    include_wsl: Option<bool>,
    timeout_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
struct CapabilityCandidate {
    id: String,
    provider: String,
    label: String,
    kind: String,
    environment: String,
    available: bool,
    version: Option<String>,
    executable: String,
    capabilities: Vec<String>,
    access_mode: String,
    cost_mode: String,
    auth: Value,
    evidence: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
struct RoleAssignment {
    role: String,
    candidate_id: String,
    candidate_label: String,
    score: i64,
    confidence: String,
    reasons: Vec<String>,
    task_execution_started: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct CapabilityRouterResult {
    schema: String,
    contract_version: String,
    router: String,
    generated_at_ms: u128,
    dry_run: bool,
    execution_started: bool,
    credentials_read: bool,
    repository_scanned: bool,
    repository_modified: bool,
    network_called: bool,
    workstack_ref: Value,
    objective_kind: String,
    candidates: Vec<CapabilityCandidate>,
    routing: Value,
    policy: Value,
    privacy: Value,
    integrity: Value,
}

#[derive(Clone, Copy)]
struct ToolProfile {
    id: &'static str,
    provider: &'static str,
    label: &'static str,
    executables: &'static [&'static str],
    capabilities: &'static [&'static str],
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ProbeEnvironment {
    Native,
    Wsl,
}

const TOOL_PROFILES: [ToolProfile; 4] = [
    ToolProfile {
        id: "codex-cli",
        provider: "openai",
        label: "Codex CLI",
        executables: &["codex"],
        capabilities: &[
            "analysis",
            "audit",
            "code",
            "planning",
            "repository_edit",
            "tests",
        ],
    },
    ToolProfile {
        id: "claude-code",
        provider: "anthropic",
        label: "Claude Code",
        executables: &["claude"],
        capabilities: &[
            "analysis",
            "audit",
            "code",
            "planning",
            "repository_edit",
            "research",
            "tests",
            "writing",
        ],
    },
    ToolProfile {
        id: "hermes-agent",
        provider: "nous-research",
        label: "Hermes Agent",
        executables: &["hermes", "hermes-agent"],
        capabilities: &[
            "analysis",
            "local_tools",
            "orchestration",
            "planning",
            "writing",
        ],
    },
    ToolProfile {
        id: "kimi-code",
        provider: "moonshot-ai",
        label: "Kimi Code",
        executables: &["kimi"],
        capabilities: &[
            "analysis",
            "audit",
            "code",
            "orchestration",
            "planning",
            "repository_edit",
            "research",
            "tests",
            "writing",
        ],
    },
];

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn native_environment_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows_native"
    } else if cfg!(target_os = "linux") {
        "linux_native"
    } else {
        "native"
    }
}

fn environment_name(environment: ProbeEnvironment) -> &'static str {
    match environment {
        ProbeEnvironment::Native => native_environment_name(),
        ProbeEnvironment::Wsl => "wsl_default",
    }
}

fn environment_display_name(environment: ProbeEnvironment) -> &'static str {
    match environment {
        ProbeEnvironment::Native if cfg!(target_os = "windows") => "Windows",
        ProbeEnvironment::Native if cfg!(target_os = "linux") => "Linux",
        ProbeEnvironment::Native => "Natif",
        ProbeEnvironment::Wsl => "WSL",
    }
}

fn command_for_version(environment: ProbeEnvironment, executable: &str) -> Option<Command> {
    if !matches!(
        executable,
        "codex" | "claude" | "hermes" | "hermes-agent" | "kimi"
    ) {
        return None;
    }
    match environment {
        ProbeEnvironment::Native if cfg!(target_os = "windows") => {
            let mut command = Command::new("cmd.exe");
            command.args(["/D", "/S", "/C", &format!("{executable} --version")]);
            Some(command)
        }
        ProbeEnvironment::Native => {
            let mut command = Command::new(executable);
            command.arg("--version");
            Some(command)
        }
        ProbeEnvironment::Wsl if cfg!(target_os = "windows") => {
            let mut command = Command::new("wsl.exe");
            command.args([
                "-e",
                "sh",
                "-lc",
                &format!("command -v {executable} >/dev/null 2>&1 && {executable} --version"),
            ]);
            Some(command)
        }
        ProbeEnvironment::Wsl => None,
    }
}

fn version_token(output: &str) -> Option<String> {
    output
        .split_whitespace()
        .map(|token| {
            token.trim_matches(|character: char| {
                matches!(character, ',' | ';' | '(' | ')' | '[' | ']')
            })
        })
        .find(|token| {
            !token.is_empty()
                && token.len() <= 64
                && token.bytes().any(|byte| byte.is_ascii_digit())
                && !token.contains(['/', '\\', ':'])
                && token.bytes().all(|byte| {
                    byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'+' | b'_')
                })
        })
        .map(str::to_string)
}

fn probe_tool(
    profile: ToolProfile,
    environment: ProbeEnvironment,
    timeout: Duration,
) -> CapabilityCandidate {
    let mut detected = None;
    let mut timed_out = false;
    for executable in profile.executables {
        let Some(command) = command_for_version(environment, executable) else {
            continue;
        };
        match command_output_with_timeout(command, timeout, profile.label) {
            Ok((_output, hit_timeout)) if hit_timeout => timed_out = true,
            Ok((output, _)) if output.status.success() => {
                let stdout = decode_command_stdout(&output.stdout).unwrap_or_default();
                let stderr = decode_command_stdout(&output.stderr).unwrap_or_default();
                detected = Some((
                    (*executable).to_string(),
                    version_token(&format!("{stdout} {stderr}")),
                ));
                break;
            }
            _ => {}
        }
    }
    let available = detected.is_some();
    let executable = detected
        .as_ref()
        .map(|value| value.0.clone())
        .unwrap_or_else(|| profile.executables[0].to_string());
    let version = detected.and_then(|value| value.1);
    CapabilityCandidate {
        id: format!("{}:{}", profile.id, environment_name(environment)),
        provider: profile.provider.to_string(),
        label: format!(
            "{} · {}",
            profile.label,
            environment_display_name(environment)
        ),
        kind: "official_cli".to_string(),
        environment: environment_name(environment).to_string(),
        available,
        version,
        executable,
        capabilities: profile
            .capabilities
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
        access_mode: "vendor_cli".to_string(),
        cost_mode: "subscription_or_vendor_quota_unknown".to_string(),
        auth: json!({
            "owner": "vendor_cli",
            "status": "not_inspected",
            "credentials_read_by_outilsia": false,
            "quota_verified": false
        }),
        evidence: json!({
            "kind": "bounded_version_command",
            "status": if available { "version_command_succeeded" } else if timed_out { "timeout" } else { "not_found" },
            "timeout_ms": timeout.as_millis(),
            "network_request_by_outilsia": false,
            "credential_files_read_by_outilsia": false,
            "command_path_returned": false
        }),
    }
}

fn validate_model_ref(model_ref: &str) -> Result<String, String> {
    let clean = model_ref.trim();
    if clean.is_empty()
        || clean.len() > 256
        || clean.starts_with('/')
        || clean.contains("..")
        || clean.contains("//")
        || !clean.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b'/' | b':')
        })
    {
        return Err("Reference de modele local invalide.".to_string());
    }
    Ok(clean.to_string())
}

fn normalize_model_runtime(runtime: Option<&str>) -> &'static str {
    match runtime
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "wsl" | "ollama-wsl" | "wsl_default" => "ollama_wsl",
        _ => "ollama_native",
    }
}

fn local_model_capabilities(model_ref: &str) -> Vec<String> {
    let lower = model_ref.to_ascii_lowercase();
    let mut capabilities = BTreeSet::from([
        "analysis".to_string(),
        "local_inference".to_string(),
        "privacy_local".to_string(),
        "writing".to_string(),
    ]);
    if ["coder", "codellama", "deepseek", "qwen"]
        .iter()
        .any(|term| lower.contains(term))
    {
        capabilities.insert("code".to_string());
    }
    if lower.contains("hermes") {
        capabilities.insert("orchestration".to_string());
        capabilities.insert("planning".to_string());
    }
    capabilities.into_iter().collect()
}

fn local_model_candidates(
    models: Vec<LocalModelCapabilityInput>,
) -> Result<Vec<CapabilityCandidate>, String> {
    if models.len() > MAX_LOCAL_MODELS {
        return Err("Trop de modeles locaux dans le contrat Capability Router.".to_string());
    }
    let mut unique = BTreeMap::new();
    for model in models {
        let model_ref = validate_model_ref(&model.model_ref)?;
        if model
            .size_gb
            .is_some_and(|value| !value.is_finite() || !(0.0..=10_000.0).contains(&value))
        {
            return Err("Taille de modele local invalide.".to_string());
        }
        let runtime = normalize_model_runtime(model.runtime.as_deref());
        let runtime_label = if runtime == "ollama_wsl" {
            "Ollama WSL"
        } else {
            "Ollama natif"
        };
        let id = format!("local-model:{runtime}:{model_ref}");
        unique
            .entry(id.clone())
            .or_insert_with(|| CapabilityCandidate {
                id,
                provider: "ollama".to_string(),
                label: format!("{model_ref} · {runtime_label}"),
                kind: "local_model".to_string(),
                environment: runtime.to_string(),
                available: true,
                version: None,
                executable: "ollama".to_string(),
                capabilities: local_model_capabilities(&model_ref),
                access_mode: "local_inference".to_string(),
                cost_mode: "local_energy".to_string(),
                auth: json!({
                    "owner": "local_runtime",
                    "status": "not_required",
                    "credentials_read_by_outilsia": false,
                    "quota_verified": false
                }),
                evidence: json!({
                    "kind": "machine_scan_installed_model",
                    "status": "reported_installed",
                    "size_gb": model.size_gb,
                    "network_request_by_outilsia": false,
                    "credential_files_read_by_outilsia": false,
                    "command_path_returned": false
                }),
            });
    }
    Ok(unique.into_values().collect())
}

fn objective_requirements(
    role: &str,
    objective_kind: &str,
) -> (&'static [&'static str], &'static [&'static str]) {
    match role {
        "planner" => (&["planning", "analysis"], &["planning", "orchestration"]),
        "independent_verifier" => (&["audit", "tests", "analysis"], &["audit", "tests"]),
        "worker" => match objective_kind {
            "code" => (&["code", "repository_edit", "tests"], &["code"]),
            "audit" => (&["audit", "analysis", "tests"], &["audit"]),
            "writing" => (&["writing", "analysis"], &["writing"]),
            "research" => (&["research", "analysis", "writing"], &["research"]),
            _ => (&["analysis", "writing"], &["analysis"]),
        },
        _ => (&[], &[]),
    }
}

fn candidate_score(
    candidate: &CapabilityCandidate,
    role: &str,
    objective_kind: &str,
    priority: &str,
) -> Option<(i64, Vec<String>)> {
    if !candidate.available {
        return None;
    }
    let capability_set = candidate
        .capabilities
        .iter()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    let (weighted, required_any) = objective_requirements(role, objective_kind);
    if !required_any
        .iter()
        .any(|capability| capability_set.contains(capability))
    {
        return None;
    }
    let matched = weighted
        .iter()
        .filter(|capability| capability_set.contains(**capability))
        .copied()
        .collect::<Vec<_>>();
    let mut score = (matched.len() as i64) * 20;
    let mut reasons = matched
        .iter()
        .map(|capability| format!("capability:{capability}"))
        .collect::<Vec<_>>();
    if role == "planner" && capability_set.contains("orchestration") {
        score += 12;
        reasons.push("role:orchestration".to_string());
    }
    if priority == "privacy" && candidate.access_mode == "local_inference" {
        score += 25;
        reasons.push("priority:privacy_local".to_string());
    } else if priority == "cost" {
        score += if candidate.access_mode == "local_inference" {
            20
        } else {
            8
        };
        reasons.push(
            if candidate.access_mode == "local_inference" {
                "priority:local_energy"
            } else {
                "priority:existing_cli_quota_unknown"
            }
            .to_string(),
        );
    }
    score += 5;
    reasons.push("evidence:available".to_string());
    Some((score, reasons))
}

fn assign_roles(
    candidates: &[CapabilityCandidate],
    objective_kind: &str,
    priority: &str,
    workstack_ready: bool,
) -> (Vec<RoleAssignment>, Vec<String>) {
    let roles = ["planner", "worker", "independent_verifier"];
    if !workstack_ready {
        return (
            Vec::new(),
            roles.iter().map(|role| (*role).to_string()).collect(),
        );
    }
    let mut assignments = Vec::new();
    let mut unresolved = Vec::new();
    let mut worker_id = None;
    for role in roles {
        let mut ranked = candidates
            .iter()
            .filter_map(|candidate| {
                candidate_score(candidate, role, objective_kind, priority)
                    .map(|(score, reasons)| (candidate, score, reasons))
            })
            .collect::<Vec<_>>();
        ranked.sort_by(|left, right| {
            right
                .1
                .cmp(&left.1)
                .then_with(|| left.0.id.cmp(&right.0.id))
        });
        if role == "independent_verifier" {
            if let Some(worker) = worker_id.as_deref() {
                ranked.retain(|candidate| candidate.0.id != worker);
            }
        }
        let Some((candidate, score, reasons)) = ranked.into_iter().next() else {
            unresolved.push(role.to_string());
            continue;
        };
        if role == "worker" {
            worker_id = Some(candidate.id.clone());
        }
        assignments.push(RoleAssignment {
            role: role.to_string(),
            candidate_id: candidate.id.clone(),
            candidate_label: candidate.label.clone(),
            score,
            confidence: "declared_capability_match".to_string(),
            reasons,
            task_execution_started: false,
        });
    }
    (assignments, unresolved)
}

fn normalize_objective_kind(value: Option<&str>) -> Result<String, String> {
    let value = value.unwrap_or("general").trim().to_ascii_lowercase();
    if matches!(
        value.as_str(),
        "general" | "code" | "audit" | "writing" | "research"
    ) {
        Ok(value)
    } else {
        Err("Type de mission Capability Router inconnu.".to_string())
    }
}

fn detect_cli_candidates(include_wsl: bool, timeout: Duration) -> Vec<CapabilityCandidate> {
    let mut jobs = Vec::new();
    for profile in TOOL_PROFILES {
        jobs.push((profile, ProbeEnvironment::Native));
        if include_wsl && cfg!(target_os = "windows") {
            jobs.push((profile, ProbeEnvironment::Wsl));
        }
    }
    let mut handles = jobs
        .into_iter()
        .map(|(profile, environment)| {
            thread::spawn(move || probe_tool(profile, environment, timeout))
        })
        .collect::<Vec<_>>();
    let mut candidates = handles
        .drain(..)
        .filter_map(|handle| handle.join().ok())
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| left.id.cmp(&right.id));
    candidates
}

fn route_capabilities(
    request: RouteWorkstackCapabilitiesRequest,
    cli_candidates: Vec<CapabilityCandidate>,
) -> Result<CapabilityRouterResult, String> {
    if request.schema != REQUEST_SCHEMA {
        return Err("Contrat Capability Router invalide.".to_string());
    }
    validate_workstack_plan(&request.workstack)?;
    let objective_kind = normalize_objective_kind(request.objective_kind.as_deref())?;
    let priority = request
        .workstack
        .pointer("/routing/priority")
        .and_then(Value::as_str)
        .unwrap_or("balanced");
    if !matches!(
        priority,
        "balanced" | "quality" | "speed" | "cost" | "privacy"
    ) {
        return Err("Priorite Workstack inconnue.".to_string());
    }
    let mut candidates = cli_candidates;
    candidates.extend(local_model_candidates(
        request.installed_models.unwrap_or_default(),
    )?);
    candidates.sort_by(|left, right| left.id.cmp(&right.id));
    let workstack_ready = request
        .workstack
        .pointer("/readiness/ready")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let (assignments, unresolved_roles) =
        assign_roles(&candidates, &objective_kind, priority, workstack_ready);
    let status = if !workstack_ready {
        "workstack_blocked"
    } else if assignments.is_empty() {
        "no_eligible_capability"
    } else if unresolved_roles.is_empty() {
        "proposal_complete"
    } else {
        "proposal_partial"
    };
    let workstack_ref = json!({
        "workstack_id": request.workstack.get("workstack_id").cloned().unwrap_or(Value::Null),
        "integrity_digest": request.workstack.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
        "source_key": request.workstack.pointer("/source/source_key").cloned().unwrap_or(Value::Null)
    });
    let routing = json!({
        "schema": ROUTING_SCHEMA,
        "status": status,
        "workstack_ready": workstack_ready,
        "assignments": assignments,
        "unresolved_roles": unresolved_roles,
        "brand_locked": false,
        "independent_verifier_enforced": true,
        "selection_basis": "declared_capabilities_and_local_evidence_v1",
        "performance_benchmark_used": false,
        "subscription_quota_verified": false
    });
    let mut unsigned = json!({
        "schema": RESULT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "router": "outilsia-capability-router-v0",
        "generated_at_ms": unix_ms(),
        "dry_run": true,
        "execution_started": false,
        "credentials_read": false,
        "repository_scanned": false,
        "repository_modified": false,
        "network_called": false,
        "workstack_ref": workstack_ref,
        "objective_kind": objective_kind,
        "candidates": candidates,
        "routing": routing,
        "policy": {
            "detect_only": true,
            "start_agents": false,
            "create_worktrees": false,
            "write_board": false,
            "modify_repository": false,
            "spend_api_credit": false,
            "publish": false,
            "merge": false,
            "human_approval_required_before_execution": true
        },
        "privacy": {
            "credential_files_read_by_outilsia": false,
            "tokens_returned": false,
            "command_paths_returned": false,
            "raw_task_context_returned": false,
            "persisted": false
        }
    });
    let digest = canonical_sha256(&unsigned);
    unsigned["integrity"] = json!({
        "algorithm": "SHA-256",
        "canonicalization": "recursive-key-sort-json-v1",
        "scope": "canonical_document_without_integrity",
        "digest": digest
    });
    serde_json::from_value(unsigned)
        .map_err(|error| format!("Resultat Capability Router invalide: {error}"))
}

pub(crate) fn validate_capability_router_result(result: &Value) -> Result<(), String> {
    if result.get("schema").and_then(Value::as_str) != Some(RESULT_SCHEMA)
        || result.get("dry_run").and_then(Value::as_bool) != Some(true)
        || result.get("execution_started").and_then(Value::as_bool) != Some(false)
        || result.get("credentials_read").and_then(Value::as_bool) != Some(false)
        || result.get("repository_scanned").and_then(Value::as_bool) != Some(false)
        || result.get("repository_modified").and_then(Value::as_bool) != Some(false)
        || result.get("network_called").and_then(Value::as_bool) != Some(false)
    {
        return Err("Contrat Capability Router non conforme au mode simulation.".to_string());
    }
    let policy = result.get("policy").unwrap_or(&Value::Null);
    for key in [
        "start_agents",
        "create_worktrees",
        "write_board",
        "modify_repository",
        "spend_api_credit",
        "publish",
        "merge",
    ] {
        if policy.get(key).and_then(Value::as_bool) != Some(false) {
            return Err("Politique Capability Router non conforme.".to_string());
        }
    }
    if policy
        .get("human_approval_required_before_execution")
        .and_then(Value::as_bool)
        != Some(true)
    {
        return Err("Gate humaine Capability Router absente.".to_string());
    }
    let assignments = result
        .pointer("/routing/assignments")
        .and_then(Value::as_array)
        .ok_or_else(|| "Affectations Capability Router absentes.".to_string())?;
    if assignments.iter().any(|assignment| {
        assignment
            .get("task_execution_started")
            .and_then(Value::as_bool)
            != Some(false)
    }) {
        return Err("Une affectation Capability Router a demarre une execution.".to_string());
    }
    let worker = assignments
        .iter()
        .find(|assignment| assignment.get("role").and_then(Value::as_str) == Some("worker"));
    let verifier = assignments.iter().find(|assignment| {
        assignment.get("role").and_then(Value::as_str) == Some("independent_verifier")
    });
    if worker.is_some()
        && verifier.is_some()
        && worker
            .and_then(|value| value.get("candidate_id"))
            .and_then(Value::as_str)
            == verifier
                .and_then(|value| value.get("candidate_id"))
                .and_then(Value::as_str)
    {
        return Err("Le worker et le verificateur doivent rester distincts.".to_string());
    }
    let expected = result
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .filter(|value| value.len() == 64)
        .ok_or_else(|| "Empreinte Capability Router absente.".to_string())?;
    let mut unsigned = result.clone();
    unsigned
        .as_object_mut()
        .ok_or_else(|| "Document Capability Router invalide.".to_string())?
        .remove("integrity");
    if canonical_sha256(&unsigned) != expected {
        return Err("Empreinte Capability Router incoherente.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn route_workstack_capabilities(
    request: RouteWorkstackCapabilitiesRequest,
) -> Result<CapabilityRouterResult, String> {
    if request.schema != REQUEST_SCHEMA {
        return Err("Contrat Capability Router invalide.".to_string());
    }
    validate_workstack_plan(&request.workstack)?;
    let include_wsl = request.include_wsl.unwrap_or(true);
    let timeout = Duration::from_secs(
        request
            .timeout_seconds
            .unwrap_or(DEFAULT_TIMEOUT_SECONDS)
            .clamp(MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS),
    );
    let cli_candidates =
        tauri::async_runtime::spawn_blocking(move || detect_cli_candidates(include_wsl, timeout))
            .await
            .map_err(|_| "Detection Capability Router interrompue.".to_string())?;
    route_capabilities(request, cli_candidates)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signed_workstack(ready: bool) -> Value {
        let mut plan = json!({
            "schema": "outilsia.workstack.v1",
            "contract_version": CONTRACT_VERSION,
            "workstack_id": "ws-test",
            "execution_enabled": false,
            "source": {"source_key": "planka:card-test"},
            "objective": {"title": "Corriger un bug", "raw_context_included": false},
            "readiness": {"ready": ready, "blockers": if ready { json!([]) } else { json!(["context"]) }},
            "routing": {"priority": "balanced", "brand_locked": false},
            "policy": {
                "plan_only": true,
                "start_agents": false,
                "create_worktrees": false,
                "write_board": false,
                "publish": false,
                "merge": false,
                "human_gate_non_delegable": true
            }
        });
        let digest = canonical_sha256(&plan);
        plan["integrity"] = json!({"digest": digest});
        plan
    }

    fn request(ready: bool) -> RouteWorkstackCapabilitiesRequest {
        RouteWorkstackCapabilitiesRequest {
            schema: REQUEST_SCHEMA.to_string(),
            workstack: signed_workstack(ready),
            objective_kind: Some("code".to_string()),
            installed_models: Some(vec![LocalModelCapabilityInput {
                model_ref: "qwen3:8b".to_string(),
                runtime: Some("ollama-wsl".to_string()),
                size_gb: Some(5.2),
            }]),
            include_wsl: Some(false),
            timeout_seconds: Some(2),
        }
    }

    fn candidate(id: &str, label: &str, capabilities: &[&str]) -> CapabilityCandidate {
        CapabilityCandidate {
            id: id.to_string(),
            provider: "test".to_string(),
            label: label.to_string(),
            kind: "official_cli".to_string(),
            environment: "test".to_string(),
            available: true,
            version: Some("1.2.3".to_string()),
            executable: "test".to_string(),
            capabilities: capabilities
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
            access_mode: "vendor_cli".to_string(),
            cost_mode: "unknown".to_string(),
            auth: json!({"status": "not_inspected"}),
            evidence: json!({"kind": "test"}),
        }
    }

    #[test]
    fn extracts_only_a_safe_version_token() {
        assert_eq!(
            version_token("codex-cli 0.144.1\n/home/chris"),
            Some("0.144.1".to_string())
        );
        assert_eq!(version_token("C:\\Users\\name\\tool.exe"), None);
    }

    #[test]
    fn version_probe_allowlist_includes_kimi_without_accepting_shell_input() {
        assert!(command_for_version(ProbeEnvironment::Native, "kimi").is_some());
        assert!(command_for_version(ProbeEnvironment::Native, "kimi;whoami").is_none());
    }

    #[test]
    fn routes_code_to_capabilities_and_keeps_verifier_independent() {
        let candidates = vec![
            candidate(
                "planner",
                "Planner",
                &["analysis", "orchestration", "planning"],
            ),
            candidate(
                "worker",
                "Worker",
                &["analysis", "code", "repository_edit", "tests"],
            ),
            candidate("verifier", "Verifier", &["analysis", "audit", "tests"]),
        ];
        let result = route_capabilities(request(true), candidates).expect("routing result");
        let assignments: Vec<RoleAssignment> =
            serde_json::from_value(result.routing["assignments"].clone()).expect("assignments");
        let worker = assignments
            .iter()
            .find(|item| item.role == "worker")
            .expect("worker");
        let verifier = assignments
            .iter()
            .find(|item| item.role == "independent_verifier")
            .expect("verifier");
        assert_ne!(worker.candidate_id, verifier.candidate_id);
        assert!(!worker.task_execution_started);
    }

    #[test]
    fn unavailable_or_unqualified_candidates_are_not_assigned() {
        let mut unavailable = candidate("offline", "Offline", &["planning", "code", "audit"]);
        unavailable.available = false;
        let (assignments, unresolved) = assign_roles(&[unavailable], "code", "balanced", true);
        assert!(assignments.is_empty());
        assert_eq!(unresolved.len(), 3);
    }

    #[test]
    fn blocked_workstack_is_detectable_but_never_routed() {
        let result = route_capabilities(
            request(false),
            vec![candidate(
                "all",
                "All",
                &["analysis", "planning", "code", "audit", "tests"],
            )],
        )
        .expect("blocked result");
        assert_eq!(result.routing["status"], "workstack_blocked");
        assert_eq!(result.routing["assignments"], json!([]));
    }

    #[test]
    fn refuses_tampered_or_executable_workstacks() {
        let mut bad = request(true);
        bad.workstack["execution_enabled"] = json!(true);
        assert!(route_capabilities(bad, Vec::new()).is_err());
    }

    #[test]
    fn result_contains_no_token_path_or_raw_context() {
        let result = route_capabilities(
            request(true),
            vec![candidate(
                "worker",
                "Worker",
                &["analysis", "code", "tests", "audit", "planning"],
            )],
        )
        .expect("routing result");
        let serialized = serde_json::to_string(&result).expect("serialized result");
        assert!(!serialized.contains("/home/"));
        assert!(!serialized.contains("C:\\Users"));
        assert!(!serialized.contains("api_key"));
        assert!(!serialized.contains("secret"));
        assert!(serialized.contains("\"execution_started\":false"));
        assert!(serialized.contains("\"credentials_read\":false"));
        let value = serde_json::to_value(&result).expect("router value");
        validate_capability_router_result(&value).expect("valid router result");

        let mut tampered = value;
        tampered["routing"]["assignments"][0]["task_execution_started"] = json!(true);
        assert!(validate_capability_router_result(&tampered).is_err());
    }

    #[test]
    fn local_model_references_are_bounded_and_deduplicated() {
        let models = vec![
            LocalModelCapabilityInput {
                model_ref: "hermes3:8b".to_string(),
                runtime: Some("ollama".to_string()),
                size_gb: Some(4.7),
            },
            LocalModelCapabilityInput {
                model_ref: "hermes3:8b".to_string(),
                runtime: Some("ollama".to_string()),
                size_gb: Some(4.7),
            },
        ];
        let candidates = local_model_candidates(models).expect("local candidates");
        assert_eq!(candidates.len(), 1);
        assert!(candidates[0].capabilities.contains(&"planning".to_string()));
        assert!(validate_model_ref("../../token").is_err());
    }
}
