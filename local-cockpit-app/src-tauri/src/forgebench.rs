use crate::capability_router::validate_capability_router_result;
use crate::forgebench_vault::{hidden_suite_receipt, validate_hidden_suite_receipt};
use crate::workstack_composer::{canonical_sha256, validate_workstack_plan};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const REQUEST_SCHEMA: &str = "outilsia.forgebench_compile_request.v1";
const RESULT_SCHEMA: &str = "outilsia.forgebench_compile_result.v1";
const EXPERIMENT_SCHEMA: &str = "outilsia.forgebench_experiment.v1";
const BENCHMARK_SCHEMA: &str = "outilsia.forgebench_benchmark.v1";
const SCORE_POLICY_SCHEMA: &str = "outilsia.forgebench_score_policy.v1";
const CONTRACT_VERSION: &str = "2026-07-12";
const SIGNAL_MAZE_ID: &str = "signal-maze-v1";
const SIGNAL_MAZE_SPEC: &str = include_str!("../../forgebench/signal-maze-v1.json");
const MIN_SCIENTIFIC_SEEDS: usize = 3;
const MAX_SEEDS: usize = 3;
const MAX_STACKS: usize = 4;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct CompileForgeBenchRequest {
    schema: String,
    benchmark_id: String,
    workstack: Value,
    capability_routing: Value,
    claim_level: Option<String>,
    seed_count: Option<usize>,
    candidate_stacks: Option<Vec<String>>,
    ollama_candidate_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ForgeBenchCompileResult {
    schema: String,
    contract_version: String,
    compiler: String,
    generated_at_ms: u128,
    prepare_only: bool,
    execution_started: bool,
    agents_started: bool,
    worktrees_created: bool,
    repository_modified: bool,
    network_called: bool,
    api_spend_eur: u64,
    experiment: Value,
    policy: Value,
    privacy: Value,
    integrity: Value,
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn sign_document(document: &mut Value) -> Result<(), String> {
    document
        .as_object_mut()
        .ok_or_else(|| "Document ForgeBench invalide.".to_string())?
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

fn verify_integrity(document: &Value, label: &str) -> Result<String, String> {
    let expected = document
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .filter(|value| is_sha256(value))
        .ok_or_else(|| format!("Empreinte {label} absente ou invalide."))?;
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

fn benchmark_spec() -> Result<Value, String> {
    let spec = serde_json::from_str::<Value>(SIGNAL_MAZE_SPEC)
        .map_err(|error| format!("Contrat Signal Maze illisible: {error}"))?;
    validate_benchmark_spec(&spec)?;
    Ok(spec)
}

fn validate_benchmark_spec(spec: &Value) -> Result<(), String> {
    if spec.get("schema").and_then(Value::as_str) != Some(BENCHMARK_SCHEMA)
        || spec.get("id").and_then(Value::as_str) != Some(SIGNAL_MAZE_ID)
        || spec.get("status").and_then(Value::as_str) != Some("exploratory_protocol")
        || spec.pointer("/starter/status").and_then(Value::as_str) != Some("sealed")
        || spec
            .pointer("/hidden_suite/contents_embedded")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Contrat Signal Maze v1 non conforme.".to_string());
    }
    let starter_digest = spec
        .pointer("/starter/bundle_sha256")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !is_sha256(starter_digest) {
        return Err("Starter Signal Maze non scelle.".to_string());
    }
    let seeds = spec
        .pointer("/determinism/default_seeds")
        .and_then(Value::as_array)
        .ok_or_else(|| "Seeds Signal Maze absents.".to_string())?;
    if seeds.len() < MIN_SCIENTIFIC_SEEDS || seeds.iter().any(|seed| seed.as_u64().is_none()) {
        return Err("Seeds Signal Maze invalides.".to_string());
    }
    let checks = spec
        .get("visible_checks")
        .and_then(Value::as_array)
        .ok_or_else(|| "Checks visibles Signal Maze absents.".to_string())?;
    if checks.len() < 5 {
        return Err("Couverture visible Signal Maze insuffisante.".to_string());
    }
    let weights = spec
        .pointer("/score_policy/weights_percent")
        .ok_or_else(|| "Politique de score ForgeBench absente.".to_string())?;
    let expected = [
        ("result", 50),
        ("efficiency", 20),
        ("speed", 15),
        ("cost", 15),
    ];
    if spec.pointer("/score_policy/schema").and_then(Value::as_str) != Some(SCORE_POLICY_SCHEMA)
        || expected
            .iter()
            .any(|(key, value)| weights.get(key).and_then(Value::as_u64) != Some(*value))
        || spec
            .pointer("/score_policy/unknown_cost_is_zero")
            .and_then(Value::as_bool)
            != Some(false)
        || spec
            .pointer("/score_policy/winner_before_complete_runs")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Politique de score ForgeBench invalide.".to_string());
    }
    for permission in [
        "benchmark_contract_write",
        "visible_tests_write",
        "hidden_tests_read",
        "publish",
        "merge",
    ] {
        if spec
            .pointer(&format!("/permissions/{permission}"))
            .and_then(Value::as_bool)
            != Some(false)
        {
            return Err("Permissions Signal Maze trop larges.".to_string());
        }
    }
    Ok(())
}

fn validate_protocol(protocol: &Value) -> Result<(), String> {
    if protocol.get("schema").and_then(Value::as_str) != Some("outilsia.forgebench_protocol.v1")
        || protocol.get("benchmark_id").and_then(Value::as_str) != Some(SIGNAL_MAZE_ID)
        || protocol.pointer("/starter/status").and_then(Value::as_str) != Some("sealed")
        || protocol
            .pointer("/hidden_suite/contents_embedded")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Protocole ForgeBench non conforme.".to_string());
    }
    if !protocol
        .pointer("/starter/bundle_sha256")
        .and_then(Value::as_str)
        .is_some_and(is_sha256)
    {
        return Err("Empreinte du starter ForgeBench invalide.".to_string());
    }
    let seeds = protocol
        .get("seeds")
        .and_then(Value::as_array)
        .ok_or_else(|| "Seeds ForgeBench absents.".to_string())?;
    let unique_seeds = seeds
        .iter()
        .filter_map(Value::as_u64)
        .collect::<BTreeSet<_>>();
    if seeds.is_empty() || seeds.len() > MAX_SEEDS || unique_seeds.len() != seeds.len() {
        return Err("Seeds ForgeBench non deterministes.".to_string());
    }
    let checks = protocol
        .get("visible_checks")
        .and_then(Value::as_array)
        .ok_or_else(|| "Checks visibles ForgeBench absents.".to_string())?;
    if checks.len() < 5 {
        return Err("Checks visibles ForgeBench insuffisants.".to_string());
    }
    let score = protocol
        .get("score_policy")
        .ok_or_else(|| "Politique de score ForgeBench absente.".to_string())?;
    let weights = score
        .get("weights_percent")
        .ok_or_else(|| "Poids ForgeBench absents.".to_string())?;
    let expected = [
        ("result", 50),
        ("efficiency", 20),
        ("speed", 15),
        ("cost", 15),
    ];
    if score.get("schema").and_then(Value::as_str) != Some(SCORE_POLICY_SCHEMA)
        || expected
            .iter()
            .any(|(key, value)| weights.get(key).and_then(Value::as_u64) != Some(*value))
        || score.get("unknown_cost_is_zero").and_then(Value::as_bool) != Some(false)
        || score
            .get("composite_requires_all_dimensions")
            .and_then(Value::as_bool)
            != Some(true)
        || score
            .get("raw_dimensions_required")
            .and_then(Value::as_bool)
            != Some(true)
        || score
            .get("dimension_podiums_required")
            .and_then(Value::as_bool)
            != Some(true)
        || score
            .get("pareto_frontier_required")
            .and_then(Value::as_bool)
            != Some(true)
        || score
            .get("winner_before_complete_runs")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Politique de score ForgeBench non conforme.".to_string());
    }
    for permission in [
        "benchmark_contract_write",
        "visible_tests_write",
        "hidden_tests_read",
        "publish",
        "merge",
    ] {
        if protocol
            .pointer(&format!("/permissions/{permission}"))
            .and_then(Value::as_bool)
            != Some(false)
        {
            return Err("Permissions du protocole ForgeBench trop larges.".to_string());
        }
    }
    let hidden_status = protocol
        .pointer("/hidden_suite/status")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match hidden_status {
        "not_provisioned" => {
            if !protocol
                .pointer("/hidden_suite/digest")
                .is_none_or(Value::is_null)
            {
                return Err("Suite cachee ForgeBench incoherente.".to_string());
            }
        }
        "sealed" => {
            if !protocol
                .pointer("/hidden_suite/digest")
                .and_then(Value::as_str)
                .is_some_and(is_sha256)
            {
                return Err("Suite cachee ForgeBench non scellee.".to_string());
            }
        }
        "locally_sealed" => {
            let suite_id = protocol
                .pointer("/hidden_suite/suite_id")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let hidden_seeds_total = protocol
                .pointer("/hidden_suite/hidden_seeds_total")
                .and_then(Value::as_u64)
                .unwrap_or_default();
            if !suite_id.starts_with("hs-")
                || suite_id.len() > 64
                || !(3..=16).contains(&hidden_seeds_total)
                || protocol
                    .pointer("/hidden_suite/checks_total")
                    .and_then(Value::as_u64)
                    != Some(5)
                || !protocol
                    .pointer("/hidden_suite/receipt_digest")
                    .and_then(Value::as_str)
                    .is_some_and(is_sha256)
                || !protocol
                    .pointer("/hidden_suite/digest")
                    .and_then(Value::as_str)
                    .is_some_and(is_sha256)
                || protocol
                    .pointer("/hidden_suite/contents_embedded")
                    .and_then(Value::as_bool)
                    != Some(false)
                || protocol
                    .pointer("/hidden_suite/encrypted_at_rest")
                    .and_then(Value::as_bool)
                    != Some(false)
                || protocol
                    .pointer("/hidden_suite/worker_access_blocked")
                    .and_then(Value::as_bool)
                    != Some(false)
                || protocol
                    .pointer("/hidden_suite/evaluator_isolated")
                    .and_then(Value::as_bool)
                    != Some(false)
            {
                return Err("Suite cachee locale ForgeBench incoherente.".to_string());
            }
        }
        _ => return Err("Statut de suite cachee ForgeBench invalide.".to_string()),
    }
    Ok(())
}

fn normalize_claim_level(value: Option<&str>) -> Result<&'static str, String> {
    match value.unwrap_or("exploratory").trim() {
        "exploratory" => Ok("exploratory"),
        "scientific" => Ok("scientific"),
        _ => Err("Niveau de preuve ForgeBench inconnu.".to_string()),
    }
}

fn default_stack_keys() -> Vec<String> {
    ["codex-solo", "claude-solo", "hermes-codex-claude"]
        .iter()
        .map(|value| (*value).to_string())
        .collect()
}

fn normalize_stack_keys(values: Option<Vec<String>>) -> Result<Vec<String>, String> {
    let values = values.unwrap_or_else(default_stack_keys);
    if values.is_empty() || values.len() > MAX_STACKS {
        return Err("Selection de stacks ForgeBench invalide.".to_string());
    }
    let mut seen = BTreeSet::new();
    let mut normalized = Vec::with_capacity(values.len());
    for value in values {
        let value = value.trim().to_ascii_lowercase();
        if !matches!(
            value.as_str(),
            "codex-solo" | "claude-solo" | "hermes-codex-claude" | "ollama-local"
        ) {
            return Err("Stack ForgeBench inconnue.".to_string());
        }
        if !seen.insert(value.clone()) {
            return Err("Stack ForgeBench dupliquee.".to_string());
        }
        normalized.push(value);
    }
    Ok(normalized)
}

fn safe_candidate_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 320
        && !value.starts_with('/')
        && !value.contains("..")
        && !value.contains("//")
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b'/' | b':')
        })
}

fn safe_ollama_candidate_id(value: &str) -> bool {
    let model_ref = value
        .strip_prefix("local-model:ollama_native:")
        .or_else(|| value.strip_prefix("local-model:ollama_wsl:"));
    model_ref.is_some_and(|model_ref| {
        !model_ref.is_empty()
            && model_ref.len() <= 180
            && !model_ref.starts_with('/')
            && !model_ref.contains("..")
            && !model_ref.contains("//")
            && model_ref.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b'/' | b':')
            })
    })
}

fn candidate_by_prefix(router: &Value, prefix: &str) -> Option<Value> {
    router
        .get("candidates")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|candidate| candidate.get("available").and_then(Value::as_bool) == Some(true))
        .filter(|candidate| {
            candidate
                .get("id")
                .and_then(Value::as_str)
                .is_some_and(|id| id.starts_with(prefix) && safe_candidate_id(id))
        })
        .min_by_key(|candidate| {
            candidate
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        })
        .map(|candidate| {
            json!({
                "candidate_id": candidate.get("id").cloned().unwrap_or(Value::Null),
                "label": candidate.get("label").cloned().unwrap_or(Value::Null),
                "environment": candidate.get("environment").cloned().unwrap_or(Value::Null),
                "version": candidate.get("version").cloned().unwrap_or(Value::Null),
                "auth_status": candidate.pointer("/auth/status").cloned().unwrap_or(Value::Null),
                "quota_verified": candidate.pointer("/auth/quota_verified").cloned().unwrap_or(json!(false))
            })
        })
}

fn candidate_by_id(router: &Value, candidate_id: &str) -> Option<Value> {
    if !safe_ollama_candidate_id(candidate_id) {
        return None;
    }
    router
        .get("candidates")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|candidate| {
            candidate.get("available").and_then(Value::as_bool) == Some(true)
                && candidate.get("kind").and_then(Value::as_str) == Some("local_model")
                && candidate.get("provider").and_then(Value::as_str) == Some("ollama")
                && candidate.get("id").and_then(Value::as_str) == Some(candidate_id)
        })
        .map(|candidate| {
            json!({
                "candidate_id": candidate.get("id").cloned().unwrap_or(Value::Null),
                "label": candidate.get("label").cloned().unwrap_or(Value::Null),
                "environment": candidate.get("environment").cloned().unwrap_or(Value::Null),
                "version": candidate.get("version").cloned().unwrap_or(Value::Null),
                "auth_status": candidate.pointer("/auth/status").cloned().unwrap_or(Value::Null),
                "quota_verified": candidate.pointer("/auth/quota_verified").cloned().unwrap_or(json!(false))
            })
        })
}

fn bind_role(role: &str, candidate: Option<Value>) -> Value {
    json!({
        "role": role,
        "candidate": candidate,
        "execution_started": false
    })
}

fn compile_candidate_stack(
    key: &str,
    router: &Value,
    protocol_digest: &str,
    ollama_candidate_id: Option<&str>,
) -> Value {
    let codex = || candidate_by_prefix(router, "codex-cli:");
    let claude = || candidate_by_prefix(router, "claude-code:");
    let hermes = || candidate_by_prefix(router, "hermes-agent:");
    let (label, bindings) = match key {
        "codex-solo" => (
            "Codex CLI seul",
            vec![
                bind_role("worker", codex()),
                bind_role(
                    "independent_verifier",
                    Some(json!({
                        "candidate_id": "forgebench:deterministic-evaluator",
                        "label": "Evaluateur deterministe ForgeBench",
                        "environment": "isolated_evaluator",
                        "version": CONTRACT_VERSION,
                        "auth_status": "not_required",
                        "quota_verified": true
                    })),
                ),
            ],
        ),
        "claude-solo" => (
            "Claude Code seul",
            vec![
                bind_role("worker", claude()),
                bind_role(
                    "independent_verifier",
                    Some(json!({
                        "candidate_id": "forgebench:deterministic-evaluator",
                        "label": "Evaluateur deterministe ForgeBench",
                        "environment": "isolated_evaluator",
                        "version": CONTRACT_VERSION,
                        "auth_status": "not_required",
                        "quota_verified": true
                    })),
                ),
            ],
        ),
        "hermes-codex-claude" => (
            "Hermes planifie, Codex construit, Claude verifie",
            vec![
                bind_role("planner", hermes()),
                bind_role("worker", codex()),
                bind_role("independent_verifier", claude()),
            ],
        ),
        "ollama-local" => (
            "Modèle Ollama local",
            vec![
                bind_role(
                    "worker",
                    ollama_candidate_id.and_then(|id| candidate_by_id(router, id)),
                ),
                bind_role(
                    "independent_verifier",
                    Some(json!({
                        "candidate_id": "forgebench:deterministic-evaluator",
                        "label": "Evaluateur deterministe ForgeBench",
                        "environment": "isolated_evaluator",
                        "version": CONTRACT_VERSION,
                        "auth_status": "not_required",
                        "quota_verified": true
                    })),
                ),
            ],
        ),
        _ => unreachable!("stack key validated"),
    };
    let blockers = bindings
        .iter()
        .filter(|binding| binding.get("candidate").is_none_or(Value::is_null))
        .filter_map(|binding| binding.get("role").and_then(Value::as_str))
        .map(|role| format!("missing_{role}"))
        .collect::<Vec<_>>();
    json!({
        "key": key,
        "label": label,
        "available": blockers.is_empty(),
        "bindings": bindings,
        "blockers": blockers,
        "protocol_digest": protocol_digest,
        "execution_started": false,
        "scores_computed": false
    })
}

fn validate_stack_bindings(key: &str, bindings: &[Value], available: bool) -> Result<(), String> {
    let expected = match key {
        "codex-solo" => vec![
            ("worker", "codex-cli:"),
            ("independent_verifier", "forgebench:deterministic-evaluator"),
        ],
        "claude-solo" => vec![
            ("worker", "claude-code:"),
            ("independent_verifier", "forgebench:deterministic-evaluator"),
        ],
        "hermes-codex-claude" => vec![
            ("planner", "hermes-agent:"),
            ("worker", "codex-cli:"),
            ("independent_verifier", "claude-code:"),
        ],
        "ollama-local" => vec![
            ("worker", "local-model:"),
            ("independent_verifier", "forgebench:deterministic-evaluator"),
        ],
        _ => return Err("Stack ForgeBench inconnue.".to_string()),
    };
    if bindings.len() != expected.len() {
        return Err("Nombre de roles ForgeBench incoherent.".to_string());
    }
    let roles = bindings
        .iter()
        .filter_map(|binding| binding.get("role").and_then(Value::as_str))
        .collect::<BTreeSet<_>>();
    if roles.len() != bindings.len() {
        return Err("Roles ForgeBench dupliques ou absents.".to_string());
    }
    for (role, expected_prefix) in expected {
        let binding = bindings
            .iter()
            .find(|binding| binding.get("role").and_then(Value::as_str) == Some(role))
            .ok_or_else(|| format!("Role ForgeBench absent: {role}."))?;
        let candidate_id = binding
            .pointer("/candidate/candidate_id")
            .and_then(Value::as_str);
        if available && candidate_id.is_none() {
            return Err(format!("Candidat ForgeBench absent: {role}."));
        }
        if candidate_id.is_some_and(|value| {
            if key == "ollama-local" && role == "worker" {
                !safe_ollama_candidate_id(value)
            } else if expected_prefix.ends_with(':') {
                !value.starts_with(expected_prefix)
            } else {
                value != expected_prefix
            }
        }) {
            return Err(format!("Candidat ForgeBench incoherent: {role}."));
        }
    }
    Ok(())
}

fn validate_workstack_router_pair(workstack: &Value, router: &Value) -> Result<(), String> {
    validate_workstack_plan(workstack)?;
    validate_capability_router_result(router)?;
    let workstack_id = workstack
        .get("workstack_id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Identifiant Workstack absent.".to_string())?;
    let workstack_digest = workstack
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .ok_or_else(|| "Empreinte Workstack absente.".to_string())?;
    if router
        .pointer("/workstack_ref/workstack_id")
        .and_then(Value::as_str)
        != Some(workstack_id)
        || router
            .pointer("/workstack_ref/integrity_digest")
            .and_then(Value::as_str)
            != Some(workstack_digest)
    {
        return Err("Capability Router et Workstack ne referencent pas le meme plan.".to_string());
    }
    Ok(())
}

fn protocol_hidden_suite(spec: &Value, receipt: Option<&Value>) -> Result<Value, String> {
    let Some(receipt) = receipt else {
        return Ok(spec.get("hidden_suite").cloned().unwrap_or(Value::Null));
    };
    validate_hidden_suite_receipt(receipt)?;
    Ok(json!({
        "status": "locally_sealed",
        "suite_id": receipt.get("suite_id").cloned().unwrap_or(Value::Null),
        "hidden_seeds_total": receipt.get("hidden_seeds_total").cloned().unwrap_or(Value::Null),
        "checks_total": receipt.get("private_checks_total").cloned().unwrap_or(Value::Null),
        "digest": receipt.get("suite_digest").cloned().unwrap_or(Value::Null),
        "receipt_digest": receipt.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
        "contents_embedded": false,
        "encrypted_at_rest": false,
        "worker_access_blocked": false,
        "evaluator_isolated": false
    }))
}

fn compile_experiment(
    request: &CompileForgeBenchRequest,
    hidden_receipt: Option<&Value>,
) -> Result<Value, String> {
    if request.schema != REQUEST_SCHEMA || request.benchmark_id != SIGNAL_MAZE_ID {
        return Err("Contrat de compilation ForgeBench invalide.".to_string());
    }
    validate_workstack_router_pair(&request.workstack, &request.capability_routing)?;
    let spec = benchmark_spec()?;
    let benchmark_digest = canonical_sha256(&spec);
    let claim_level = normalize_claim_level(request.claim_level.as_deref())?;
    let stack_keys = normalize_stack_keys(request.candidate_stacks.clone())?;
    let ollama_candidate_id = request
        .ollama_candidate_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if stack_keys.iter().any(|key| key == "ollama-local") {
        if ollama_candidate_id.is_none_or(|value| !safe_ollama_candidate_id(value)) {
            return Err("Candidat Ollama ForgeBench absent ou invalide.".to_string());
        }
    } else if ollama_candidate_id.is_some() {
        return Err("Candidat Ollama fourni sans stack locale.".to_string());
    }
    let seed_count = request.seed_count.unwrap_or(MIN_SCIENTIFIC_SEEDS);
    if seed_count == 0 || seed_count > MAX_SEEDS {
        return Err("Nombre de seeds ForgeBench invalide.".to_string());
    }
    let seeds = spec
        .pointer("/determinism/default_seeds")
        .and_then(Value::as_array)
        .ok_or_else(|| "Seeds Signal Maze absents.".to_string())?
        .iter()
        .take(seed_count)
        .cloned()
        .collect::<Vec<_>>();
    let hidden_suite = protocol_hidden_suite(&spec, hidden_receipt)?;
    let protocol = json!({
        "schema": "outilsia.forgebench_protocol.v1",
        "benchmark_id": SIGNAL_MAZE_ID,
        "benchmark_version": spec.get("version").cloned().unwrap_or(Value::Null),
        "benchmark_sha256": benchmark_digest,
        "starter": spec.get("starter").cloned().unwrap_or(Value::Null),
        "seeds": seeds,
        "viewports": spec.get("viewports").cloned().unwrap_or(Value::Null),
        "budgets": spec.get("budgets").cloned().unwrap_or(Value::Null),
        "permissions": spec.get("permissions").cloned().unwrap_or(Value::Null),
        "visible_checks": spec.get("visible_checks").cloned().unwrap_or(Value::Null),
        "hidden_suite": hidden_suite,
        "score_policy": spec.get("score_policy").cloned().unwrap_or(Value::Null),
        "fairness": spec.get("fairness").cloned().unwrap_or(Value::Null)
    });
    let protocol_digest = canonical_sha256(&protocol);
    let candidate_stacks = stack_keys
        .iter()
        .map(|key| {
            compile_candidate_stack(
                key,
                &request.capability_routing,
                protocol_digest.as_str(),
                ollama_candidate_id,
            )
        })
        .collect::<Vec<_>>();
    let workstack_ready = request
        .workstack
        .pointer("/readiness/ready")
        .and_then(Value::as_bool)
        == Some(true);
    let routing_complete = request
        .capability_routing
        .pointer("/routing/status")
        .and_then(Value::as_str)
        == Some("proposal_complete");
    let all_stacks_available = candidate_stacks
        .iter()
        .all(|stack| stack.get("available").and_then(Value::as_bool) == Some(true));
    let enough_candidates = candidate_stacks.len() >= 2;
    let starter_sealed = spec.pointer("/starter/status").and_then(Value::as_str) == Some("sealed");
    let hidden_suite_status = protocol
        .pointer("/hidden_suite/status")
        .and_then(Value::as_str)
        .unwrap_or("not_provisioned");
    let hidden_suite_sealed = hidden_suite_status == "sealed"
        && protocol
            .pointer("/hidden_suite/digest")
            .and_then(Value::as_str)
            .is_some_and(is_sha256);
    let enough_scientific_seeds = seeds.len() >= MIN_SCIENTIFIC_SEEDS;
    let protocol_ready = workstack_ready
        && routing_complete
        && all_stacks_available
        && enough_candidates
        && starter_sealed;
    let exploratory_ready = protocol_ready;
    let scientific_ready = protocol_ready && hidden_suite_sealed && enough_scientific_seeds;
    let mut blockers = Vec::new();
    if !workstack_ready {
        blockers.push("workstack_not_ready");
    }
    if !routing_complete {
        blockers.push("capability_routing_incomplete");
    }
    if !enough_candidates {
        blockers.push("at_least_two_stacks_required");
    }
    if !all_stacks_available {
        blockers.push("selected_stack_unavailable");
    }
    if !starter_sealed {
        blockers.push("starter_not_sealed");
    }
    if claim_level == "scientific" && !hidden_suite_sealed {
        blockers.push(if hidden_suite_status == "locally_sealed" {
            "hidden_suite_not_isolated"
        } else {
            "hidden_suite_not_provisioned"
        });
    }
    if claim_level == "scientific" && !enough_scientific_seeds {
        blockers.push("three_seeds_required_for_scientific_claim");
    }
    let selected_claim_ready = if claim_level == "scientific" {
        scientific_ready
    } else {
        exploratory_ready
    };
    let experiment_seed = json!({
        "benchmark_sha256": benchmark_digest,
        "workstack_sha256": request.workstack.pointer("/integrity/digest"),
        "router_sha256": request.capability_routing.pointer("/integrity/digest"),
        "claim_level": claim_level,
        "candidate_stack_keys": stack_keys,
        "ollama_candidate_id": ollama_candidate_id,
        "seeds": seeds,
        "hidden_suite_digest": protocol.pointer("/hidden_suite/digest")
    });
    let mut experiment = json!({
        "schema": EXPERIMENT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "experiment_id": format!("fb-{}", &canonical_sha256(&experiment_seed)[..24]),
        "created_at_ms": unix_ms(),
        "benchmark": {
            "id": SIGNAL_MAZE_ID,
            "version": spec.get("version").cloned().unwrap_or(Value::Null),
            "spec_sha256": benchmark_digest,
            "track": spec.get("track").cloned().unwrap_or(Value::Null),
            "public_task_included": false
        },
        "workstack_ref": {
            "workstack_id": request.workstack.get("workstack_id").cloned().unwrap_or(Value::Null),
            "integrity_digest": request.workstack.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
            "ready": workstack_ready
        },
        "capability_routing_ref": {
            "integrity_digest": request.capability_routing.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
            "status": request.capability_routing.pointer("/routing/status").cloned().unwrap_or(Value::Null)
        },
        "claim_level": claim_level,
        "protocol": protocol,
        "protocol_digest": protocol_digest,
        "candidate_stacks": candidate_stacks,
        "readiness": {
            "protocol_ready": protocol_ready,
            "exploratory_ready": exploratory_ready,
            "scientific_ready": scientific_ready,
            "selected_claim_ready": selected_claim_ready,
            "blockers": blockers,
            "warnings": if hidden_suite_sealed {
                json!([])
            } else if hidden_suite_status == "locally_sealed" {
                json!(["local_hidden_suite_not_worker_isolated"])
            } else {
                json!(["scientific_claim_unavailable_until_hidden_suite_is_sealed"])
            }
        },
        "measurements": {
            "runs_recorded": 0,
            "dimensions_measured": [],
            "scores_computed": false,
            "dimension_podiums_computed": false,
            "pareto_frontier_computed": false,
            "winner_declared": false,
            "cost_status": "not_measured_not_zero"
        },
        "fairness": {
            "same_protocol_digest_for_every_stack": true,
            "fresh_workspace_per_run_required": true,
            "independent_evaluator_required": true,
            "human_help_must_be_logged": true,
            "rules_or_tests_modified": false
        },
        "execution": {
            "started": false,
            "agents_started": false,
            "worktrees_created": false,
            "repository_modified": false,
            "api_spend_eur": 0
        },
        "privacy": {
            "raw_workstack_included": false,
            "raw_task_context_included": false,
            "credentials_included": false,
            "hidden_test_contents_included": false
        }
    });
    sign_document(&mut experiment)?;
    Ok(experiment)
}

pub(crate) fn validate_forgebench_result(result: &Value) -> Result<(), String> {
    if result.get("schema").and_then(Value::as_str) != Some(RESULT_SCHEMA)
        || result.get("prepare_only").and_then(Value::as_bool) != Some(true)
        || result.get("execution_started").and_then(Value::as_bool) != Some(false)
        || result.get("agents_started").and_then(Value::as_bool) != Some(false)
        || result.get("worktrees_created").and_then(Value::as_bool) != Some(false)
        || result.get("repository_modified").and_then(Value::as_bool) != Some(false)
        || result.get("network_called").and_then(Value::as_bool) != Some(false)
        || result.get("api_spend_eur").and_then(Value::as_u64) != Some(0)
    {
        return Err("Contrat ForgeBench non conforme au preflight.".to_string());
    }
    let experiment = result
        .get("experiment")
        .ok_or_else(|| "Experience ForgeBench absente.".to_string())?;
    if experiment.get("schema").and_then(Value::as_str) != Some(EXPERIMENT_SCHEMA)
        || experiment
            .pointer("/execution/started")
            .and_then(Value::as_bool)
            != Some(false)
        || experiment
            .pointer("/execution/agents_started")
            .and_then(Value::as_bool)
            != Some(false)
        || experiment
            .pointer("/execution/worktrees_created")
            .and_then(Value::as_bool)
            != Some(false)
        || experiment
            .pointer("/execution/repository_modified")
            .and_then(Value::as_bool)
            != Some(false)
        || experiment
            .pointer("/execution/api_spend_eur")
            .and_then(Value::as_u64)
            != Some(0)
        || experiment
            .pointer("/measurements/scores_computed")
            .and_then(Value::as_bool)
            != Some(false)
        || experiment
            .pointer("/measurements/winner_declared")
            .and_then(Value::as_bool)
            != Some(false)
        || experiment
            .pointer("/measurements/dimension_podiums_computed")
            .and_then(Value::as_bool)
            != Some(false)
        || experiment
            .pointer("/measurements/pareto_frontier_computed")
            .and_then(Value::as_bool)
            != Some(false)
        || experiment
            .pointer("/measurements/runs_recorded")
            .and_then(Value::as_u64)
            != Some(0)
        || experiment
            .pointer("/privacy/hidden_test_contents_included")
            .and_then(Value::as_bool)
            != Some(false)
        || experiment
            .pointer("/privacy/raw_workstack_included")
            .and_then(Value::as_bool)
            != Some(false)
        || experiment
            .pointer("/privacy/raw_task_context_included")
            .and_then(Value::as_bool)
            != Some(false)
        || experiment
            .pointer("/privacy/credentials_included")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Experience ForgeBench executable ou trompeuse.".to_string());
    }
    let protocol_digest = experiment
        .get("protocol_digest")
        .and_then(Value::as_str)
        .filter(|value| is_sha256(value))
        .ok_or_else(|| "Empreinte de protocole ForgeBench absente.".to_string())?;
    let protocol = experiment
        .get("protocol")
        .ok_or_else(|| "Protocole ForgeBench absent.".to_string())?;
    validate_protocol(protocol)?;
    if canonical_sha256(protocol) != protocol_digest {
        return Err("Empreinte de protocole ForgeBench incoherente.".to_string());
    }
    if experiment.pointer("/benchmark/id").and_then(Value::as_str) != Some(SIGNAL_MAZE_ID)
        || experiment
            .pointer("/benchmark/spec_sha256")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        || experiment
            .pointer("/benchmark/public_task_included")
            .and_then(Value::as_bool)
            != Some(false)
        || experiment
            .pointer("/fairness/same_protocol_digest_for_every_stack")
            .and_then(Value::as_bool)
            != Some(true)
        || experiment
            .pointer("/fairness/fresh_workspace_per_run_required")
            .and_then(Value::as_bool)
            != Some(true)
        || experiment
            .pointer("/fairness/independent_evaluator_required")
            .and_then(Value::as_bool)
            != Some(true)
        || experiment
            .pointer("/fairness/human_help_must_be_logged")
            .and_then(Value::as_bool)
            != Some(true)
        || experiment
            .pointer("/fairness/rules_or_tests_modified")
            .and_then(Value::as_bool)
            != Some(false)
        || experiment
            .pointer("/measurements/cost_status")
            .and_then(Value::as_str)
            != Some("not_measured_not_zero")
    {
        return Err("Equite ou verite de mesure ForgeBench invalide.".to_string());
    }
    let stacks = experiment
        .get("candidate_stacks")
        .and_then(Value::as_array)
        .ok_or_else(|| "Stacks ForgeBench absentes.".to_string())?;
    let mut stack_keys = BTreeSet::new();
    if stacks.is_empty()
        || stacks.len() > MAX_STACKS
        || stacks.iter().any(|stack| {
            stack.get("protocol_digest").and_then(Value::as_str) != Some(protocol_digest)
                || stack.get("execution_started").and_then(Value::as_bool) != Some(false)
                || stack.get("scores_computed").and_then(Value::as_bool) != Some(false)
                || stack.get("key").and_then(Value::as_str).is_none_or(|key| {
                    !matches!(
                        key,
                        "codex-solo" | "claude-solo" | "hermes-codex-claude" | "ollama-local"
                    ) || !stack_keys.insert(key.to_string())
                })
        })
    {
        return Err("Equite des stacks ForgeBench invalide.".to_string());
    }
    for stack in stacks {
        let available = stack
            .get("available")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let blockers = stack
            .get("blockers")
            .and_then(Value::as_array)
            .ok_or_else(|| "Blocages de stack ForgeBench absents.".to_string())?;
        let bindings = stack
            .get("bindings")
            .and_then(Value::as_array)
            .ok_or_else(|| "Affectations de stack ForgeBench absentes.".to_string())?;
        if available != blockers.is_empty()
            || bindings.is_empty()
            || bindings.iter().any(|binding| {
                let candidate_id = binding
                    .pointer("/candidate/candidate_id")
                    .and_then(Value::as_str);
                binding.get("execution_started").and_then(Value::as_bool) != Some(false)
                    || candidate_id.is_some_and(|value| !safe_candidate_id(value))
                    || (available && candidate_id.is_none())
            })
        {
            return Err("Affectations de stack ForgeBench incoherentes.".to_string());
        }
        validate_stack_bindings(
            stack.get("key").and_then(Value::as_str).unwrap_or_default(),
            bindings,
            available,
        )?;
        let worker = bindings
            .iter()
            .find(|binding| binding.get("role").and_then(Value::as_str) == Some("worker"));
        let verifier = bindings.iter().find(|binding| {
            binding.get("role").and_then(Value::as_str) == Some("independent_verifier")
        });
        if worker
            .and_then(|binding| binding.pointer("/candidate/candidate_id"))
            .and_then(Value::as_str)
            == verifier
                .and_then(|binding| binding.pointer("/candidate/candidate_id"))
                .and_then(Value::as_str)
        {
            return Err("Worker et evaluateur ForgeBench doivent etre distincts.".to_string());
        }
    }
    let protocol_ready = experiment
        .pointer("/readiness/protocol_ready")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let exploratory_ready = experiment
        .pointer("/readiness/exploratory_ready")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let scientific_ready = experiment
        .pointer("/readiness/scientific_ready")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let selected_claim_ready = experiment
        .pointer("/readiness/selected_claim_ready")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let hidden_sealed = protocol
        .pointer("/hidden_suite/status")
        .and_then(Value::as_str)
        == Some("sealed")
        && protocol
            .pointer("/hidden_suite/digest")
            .and_then(Value::as_str)
            .is_some_and(is_sha256);
    let scientific_seeds = protocol
        .pointer("/seeds")
        .and_then(Value::as_array)
        .is_some_and(|seeds| seeds.len() >= MIN_SCIENTIFIC_SEEDS);
    let expected_protocol_ready = experiment
        .pointer("/workstack_ref/ready")
        .and_then(Value::as_bool)
        == Some(true)
        && experiment
            .pointer("/capability_routing_ref/status")
            .and_then(Value::as_str)
            == Some("proposal_complete")
        && stacks.len() >= 2
        && stacks
            .iter()
            .all(|stack| stack.get("available").and_then(Value::as_bool) == Some(true));
    let expected_scientific_ready = expected_protocol_ready && hidden_sealed && scientific_seeds;
    let claim_level = experiment
        .get("claim_level")
        .and_then(Value::as_str)
        .ok_or_else(|| "Niveau de preuve ForgeBench absent.".to_string())?;
    let expected_selected_ready = match claim_level {
        "exploratory" => expected_protocol_ready,
        "scientific" => expected_scientific_ready,
        _ => return Err("Niveau de preuve ForgeBench invalide.".to_string()),
    };
    if protocol_ready != expected_protocol_ready
        || exploratory_ready != expected_protocol_ready
        || scientific_ready != expected_scientific_ready
        || selected_claim_ready != expected_selected_ready
    {
        return Err("Readiness scientifique ForgeBench injustifiee.".to_string());
    }
    let policy = result.get("policy").unwrap_or(&Value::Null);
    for key in [
        "start_agents",
        "create_worktrees",
        "modify_repository",
        "write_board",
        "spend_api_credit",
        "publish",
        "merge",
    ] {
        if policy.get(key).and_then(Value::as_bool) != Some(false) {
            return Err("Politique ForgeBench non conforme.".to_string());
        }
    }
    if policy.get("compile_protocol_only").and_then(Value::as_bool) != Some(true)
        || policy
            .get("human_approval_required_before_execution")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/privacy/raw_workstack_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/privacy/raw_task_context_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/privacy/credentials_read")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/privacy/hidden_test_contents_returned")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Gate humaine ou confidentialite ForgeBench invalide.".to_string());
    }
    verify_integrity(experiment, "de l'experience ForgeBench")?;
    verify_integrity(result, "du resultat ForgeBench")?;
    Ok(())
}

fn compile_result_with_receipt(
    request: &CompileForgeBenchRequest,
    hidden_receipt: Option<&Value>,
) -> Result<ForgeBenchCompileResult, String> {
    let experiment = compile_experiment(request, hidden_receipt)?;
    let mut result = json!({
        "schema": RESULT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "compiler": "outilsia-forgebench-v0",
        "generated_at_ms": unix_ms(),
        "prepare_only": true,
        "execution_started": false,
        "agents_started": false,
        "worktrees_created": false,
        "repository_modified": false,
        "network_called": false,
        "api_spend_eur": 0,
        "experiment": experiment,
        "policy": {
            "compile_protocol_only": true,
            "start_agents": false,
            "create_worktrees": false,
            "modify_repository": false,
            "write_board": false,
            "spend_api_credit": false,
            "publish": false,
            "merge": false,
            "human_approval_required_before_execution": true
        },
        "privacy": {
            "raw_workstack_returned": false,
            "raw_task_context_returned": false,
            "credentials_read": false,
            "hidden_test_contents_returned": false,
            "persisted": false
        }
    });
    sign_document(&mut result)?;
    validate_forgebench_result(&result)?;
    serde_json::from_value(result).map_err(|error| format!("Resultat ForgeBench invalide: {error}"))
}

#[cfg(test)]
fn compile_result(request: &CompileForgeBenchRequest) -> Result<ForgeBenchCompileResult, String> {
    compile_result_with_receipt(request, None)
}

#[tauri::command]
pub(crate) fn compile_forgebench_experiment(
    app: AppHandle,
    request: CompileForgeBenchRequest,
) -> Result<ForgeBenchCompileResult, String> {
    let receipt = hidden_suite_receipt(&app)?;
    compile_result_with_receipt(&request, receipt.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signed_workstack(ready: bool) -> Value {
        let mut plan = json!({
            "schema": "outilsia.workstack.v1",
            "contract_version": CONTRACT_VERSION,
            "workstack_id": "ws-forgebench-test",
            "execution_enabled": false,
            "source": {"source_key": "planka:signal-maze"},
            "objective": {"title": "Signal Maze", "raw_context_included": false},
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
        sign_document(&mut plan).expect("signed workstack");
        plan
    }

    fn candidate(id: &str, label: &str) -> Value {
        json!({
            "id": id,
            "provider": "test",
            "label": label,
            "kind": "official_cli",
            "environment": "test",
            "available": true,
            "version": "1.0.0",
            "executable": "not_returned",
            "capabilities": ["analysis", "audit", "code", "planning", "tests"],
            "access_mode": "vendor_cli",
            "cost_mode": "subscription_or_vendor_quota_unknown",
            "auth": {"status": "not_inspected", "quota_verified": false},
            "evidence": {"kind": "test"}
        })
    }

    fn signed_router(workstack: &Value, include_hermes: bool) -> Value {
        let mut candidates = vec![
            candidate("codex-cli:test", "Codex CLI"),
            candidate("claude-code:test", "Claude Code"),
        ];
        if include_hermes {
            candidates.push(candidate("hermes-agent:test", "Hermes Agent"));
        }
        let mut router = json!({
            "schema": "outilsia.capability_router_result.v1",
            "contract_version": CONTRACT_VERSION,
            "router": "test",
            "generated_at_ms": 1,
            "dry_run": true,
            "execution_started": false,
            "credentials_read": false,
            "repository_scanned": false,
            "repository_modified": false,
            "network_called": false,
            "workstack_ref": {
                "workstack_id": workstack.get("workstack_id").cloned().unwrap(),
                "integrity_digest": workstack.pointer("/integrity/digest").cloned().unwrap(),
                "source_key": "planka:signal-maze"
            },
            "objective_kind": "code",
            "candidates": candidates,
            "routing": {
                "schema": "outilsia.capability_routing.v1",
                "status": "proposal_complete",
                "workstack_ready": true,
                "assignments": [
                    {"role": "planner", "candidate_id": "hermes-agent:test", "score": 70, "task_execution_started": false},
                    {"role": "worker", "candidate_id": "codex-cli:test", "score": 70, "task_execution_started": false},
                    {"role": "independent_verifier", "candidate_id": "claude-code:test", "score": 70, "task_execution_started": false}
                ],
                "unresolved_roles": [],
                "independent_verifier_enforced": true
            },
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
            "privacy": {"credential_files_read_by_outilsia": false}
        });
        sign_document(&mut router).expect("signed router");
        router
    }

    fn request(claim_level: &str, seed_count: usize, stacks: &[&str]) -> CompileForgeBenchRequest {
        let workstack = signed_workstack(true);
        let router = signed_router(&workstack, true);
        CompileForgeBenchRequest {
            schema: REQUEST_SCHEMA.to_string(),
            benchmark_id: SIGNAL_MAZE_ID.to_string(),
            workstack,
            capability_routing: router,
            claim_level: Some(claim_level.to_string()),
            seed_count: Some(seed_count),
            candidate_stacks: Some(stacks.iter().map(|value| (*value).to_string()).collect()),
            ollama_candidate_id: None,
        }
    }

    #[test]
    fn compiles_an_exploratory_preflight_without_execution_or_winner() {
        let result = compile_result(&request(
            "exploratory",
            3,
            &["codex-solo", "claude-solo", "hermes-codex-claude"],
        ))
        .expect("ForgeBench preflight");
        let value = serde_json::to_value(result).expect("result value");
        validate_forgebench_result(&value).expect("valid preflight");
        assert_eq!(value["experiment"]["readiness"]["exploratory_ready"], true);
        assert_eq!(value["experiment"]["readiness"]["scientific_ready"], false);
        assert_eq!(
            value["experiment"]["measurements"]["scores_computed"],
            false
        );
        assert_eq!(
            value["experiment"]["measurements"]["winner_declared"],
            false
        );
        assert_eq!(value["agents_started"], false);
    }

    #[test]
    fn scientific_claim_is_blocked_without_a_hidden_suite() {
        let result = compile_result(&request("scientific", 3, &["codex-solo", "claude-solo"]))
            .expect("scientific preflight");
        let blockers = result.experiment["readiness"]["blockers"]
            .as_array()
            .expect("blockers");
        assert!(blockers.contains(&json!("hidden_suite_not_provisioned")));
        assert_eq!(
            result.experiment["readiness"]["selected_claim_ready"],
            false
        );
    }

    #[test]
    fn local_hidden_suite_is_committed_without_exposing_seeds_or_unlocking_science() {
        let receipt = crate::forgebench_vault::test_hidden_suite_receipt();
        let result = compile_result_with_receipt(
            &request("scientific", 3, &["codex-solo", "claude-solo"]),
            Some(&receipt),
        )
        .expect("local hidden suite preflight");
        let hidden = &result.experiment["protocol"]["hidden_suite"];
        assert_eq!(hidden["status"], "locally_sealed");
        assert_eq!(hidden["hidden_seeds_total"], 5);
        assert_eq!(hidden["worker_access_blocked"], false);
        assert_eq!(result.experiment["readiness"]["scientific_ready"], false);
        assert!(result.experiment["readiness"]["blockers"]
            .as_array()
            .expect("blockers")
            .contains(&json!("hidden_suite_not_isolated")));
        let serialized = serde_json::to_string(&result).expect("result JSON");
        assert!(!serialized.contains("\"hidden_seeds\":"));
        assert!(!serialized.contains("seed-boundary-cases"));
    }

    #[test]
    fn scientific_claim_requires_three_seeds() {
        let result = compile_result(&request("scientific", 1, &["codex-solo", "claude-solo"]))
            .expect("scientific preflight");
        assert!(result.experiment["readiness"]["blockers"]
            .as_array()
            .expect("blockers")
            .contains(&json!("three_seeds_required_for_scientific_claim")));
    }

    #[test]
    fn every_stack_receives_the_exact_same_protocol() {
        let result = compile_result(&request(
            "exploratory",
            3,
            &["codex-solo", "claude-solo", "hermes-codex-claude"],
        ))
        .expect("preflight");
        let protocol = result.experiment["protocol_digest"].as_str().unwrap();
        assert!(result.experiment["candidate_stacks"]
            .as_array()
            .unwrap()
            .iter()
            .all(|stack| stack["protocol_digest"].as_str() == Some(protocol)));
    }

    #[test]
    fn unavailable_hybrid_stack_blocks_the_selected_comparison() {
        let workstack = signed_workstack(true);
        let request = CompileForgeBenchRequest {
            schema: REQUEST_SCHEMA.to_string(),
            benchmark_id: SIGNAL_MAZE_ID.to_string(),
            capability_routing: signed_router(&workstack, false),
            workstack,
            claim_level: Some("exploratory".to_string()),
            seed_count: Some(3),
            candidate_stacks: Some(default_stack_keys()),
            ollama_candidate_id: None,
        };
        let result = compile_result(&request).expect("blocked preflight");
        assert_eq!(result.experiment["readiness"]["exploratory_ready"], false);
        assert!(result.experiment["readiness"]["blockers"]
            .as_array()
            .unwrap()
            .contains(&json!("selected_stack_unavailable")));
    }

    #[test]
    fn rejects_tampered_or_mismatched_sources() {
        let mut tampered = request("exploratory", 3, &["codex-solo", "claude-solo"]);
        tampered.workstack["readiness"]["ready"] = json!(false);
        assert!(compile_result(&tampered).is_err());

        let mut mismatched = request("exploratory", 3, &["codex-solo", "claude-solo"]);
        mismatched.capability_routing["workstack_ref"]["workstack_id"] = json!("ws-other");
        sign_document(&mut mismatched.capability_routing).unwrap();
        assert!(compile_result(&mismatched).is_err());
    }

    #[test]
    fn rejects_unknown_duplicate_or_excessive_inputs() {
        assert!(compile_result(&request("exploratory", 3, &["unknown", "codex-solo"])).is_err());
        assert!(compile_result(&request("exploratory", 3, &["codex-solo", "codex-solo"])).is_err());
        assert!(
            compile_result(&request("exploratory", 4, &["codex-solo", "claude-solo"])).is_err()
        );
    }

    #[test]
    fn ollama_candidate_identity_requires_an_exact_runtime_and_safe_model_ref() {
        assert!(safe_ollama_candidate_id(
            "local-model:ollama_native:hermes3:8b"
        ));
        assert!(safe_ollama_candidate_id(
            "local-model:ollama_wsl:namespace/model:q4_K_M"
        ));
        assert!(!safe_ollama_candidate_id("local-model:hermes3:8b"));
        assert!(!safe_ollama_candidate_id(
            "local-model:ollama_native:../model"
        ));
        assert!(!safe_ollama_candidate_id("local-model:ollama_wsl:/model"));
    }

    #[test]
    fn result_contains_references_but_no_private_task_or_hidden_tests() {
        let result = compile_result(&request("exploratory", 3, &["codex-solo", "claude-solo"]))
            .expect("preflight");
        let serialized = serde_json::to_string(&result).expect("serialized result");
        assert!(!serialized.contains("Projet tres secret"));
        assert!(!serialized.contains("api_key"));
        assert!(!serialized.contains("hidden_test_contents\":"));
        assert!(serialized.contains("not_provisioned"));
        assert!(serialized.contains("not_measured_not_zero"));
    }

    #[test]
    fn rehashing_cannot_forge_a_winner_or_hidden_suite() {
        let result = compile_result(&request("exploratory", 3, &["codex-solo", "claude-solo"]))
            .expect("preflight");
        let mut forged_winner = serde_json::to_value(result).expect("result value");
        forged_winner["experiment"]["measurements"]["winner_declared"] = json!(true);
        sign_document(&mut forged_winner["experiment"]).expect("resigned experiment");
        sign_document(&mut forged_winner).expect("resigned result");
        assert!(validate_forgebench_result(&forged_winner).is_err());

        let result = compile_result(&request("scientific", 3, &["codex-solo", "claude-solo"]))
            .expect("scientific preflight");
        let mut forged_hidden = serde_json::to_value(result).expect("result value");
        forged_hidden["experiment"]["protocol"]["hidden_suite"]["status"] = json!("sealed");
        forged_hidden["experiment"]["readiness"]["scientific_ready"] = json!(true);
        forged_hidden["experiment"]["readiness"]["selected_claim_ready"] = json!(true);
        let protocol_digest = canonical_sha256(&forged_hidden["experiment"]["protocol"]);
        forged_hidden["experiment"]["protocol_digest"] = json!(protocol_digest);
        for stack in forged_hidden["experiment"]["candidate_stacks"]
            .as_array_mut()
            .expect("stacks")
        {
            stack["protocol_digest"] = json!(protocol_digest);
        }
        sign_document(&mut forged_hidden["experiment"]).expect("resigned experiment");
        sign_document(&mut forged_hidden).expect("resigned result");
        assert!(validate_forgebench_result(&forged_hidden).is_err());

        let result = compile_result(&request("exploratory", 3, &["codex-solo", "claude-solo"]))
            .expect("preflight");
        let mut forged_binding = serde_json::to_value(result).expect("result value");
        forged_binding["experiment"]["candidate_stacks"][0]["bindings"][0]["candidate"]
            ["candidate_id"] = json!("claude-code:test");
        sign_document(&mut forged_binding["experiment"]).expect("resigned experiment");
        sign_document(&mut forged_binding).expect("resigned result");
        assert!(validate_forgebench_result(&forged_binding).is_err());
    }
}
