use crate::capability_router::validate_capability_router_result;
use crate::forgebench::validate_forgebench_result;
use crate::forgebench_candidate::validate_forgebench_ollama_candidate_result;
use crate::forgebench_isolation::validate_forgebench_isolation_result;
use crate::forgebench_runner::validate_forgebench_reference_pilot_result;
use crate::workstack_composer::{canonical_sha256, validate_workstack_plan};
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const APPEND_REQUEST_SCHEMA: &str = "outilsia.evidence_append_request.v1";
const APPEND_RESULT_SCHEMA: &str = "outilsia.evidence_append_result.v1";
const LEDGER_SCHEMA: &str = "outilsia.evidence_ledger.v1";
const ENTRY_SCHEMA: &str = "outilsia.evidence_entry.v1";
const CONTRACT_VERSION: &str = "2026-07-12";
const LEDGER_FILENAME: &str = "evidence-ledger-v1.json";
const MAX_ENTRIES: usize = 500;
const MAX_LEDGER_BYTES: usize = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES: usize = 10 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct AppendEvidenceRequest {
    schema: String,
    event_type: String,
    source_document: Value,
}

fn ledger_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
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

fn ledger_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Dossier app data indisponible: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Impossible de creer le dossier app data: {error}"))?;
    Ok(dir.join(LEDGER_FILENAME))
}

fn backup_path(path: &Path) -> PathBuf {
    path.with_extension("json.bak")
}

fn temporary_path(path: &Path) -> PathBuf {
    path.with_extension("json.tmp")
}

fn sign_document(document: &mut Value) -> Result<(), String> {
    document
        .as_object_mut()
        .ok_or_else(|| "Document Evidence Ledger invalide.".to_string())?
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

fn verify_document_integrity(document: &Value, label: &str) -> Result<String, String> {
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

fn empty_ledger() -> Result<Value, String> {
    let mut ledger = json!({
        "schema": LEDGER_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "ledger_id": Value::Null,
        "created_at_ms": Value::Null,
        "updated_at_ms": Value::Null,
        "head_digest": Value::Null,
        "entries": [],
        "verification": {
            "chain_valid": true,
            "entries_verified": 0,
            "last_verified_at_ms": unix_ms()
        },
        "policy": {
            "local_only": true,
            "append_only_between_resets": true,
            "raw_source_documents_stored": false,
            "raw_prompts_stored": false,
            "raw_model_outputs_stored": false,
            "credentials_stored": false,
            "human_decision_required_for_execution": true
        }
    });
    sign_document(&mut ledger)?;
    Ok(ledger)
}

fn verify_entry(
    entry: &Value,
    expected_sequence: u64,
    previous: Option<&str>,
) -> Result<String, String> {
    if entry.get("schema").and_then(Value::as_str) != Some(ENTRY_SCHEMA)
        || entry.get("sequence").and_then(Value::as_u64) != Some(expected_sequence)
    {
        return Err("Sequence Evidence Ledger invalide.".to_string());
    }
    let entry_previous = entry.get("previous_digest").and_then(Value::as_str);
    if entry_previous != previous {
        return Err("Chaine Evidence Ledger rompue.".to_string());
    }
    let event_type = entry
        .get("event_type")
        .and_then(Value::as_str)
        .ok_or_else(|| "Type d'entree Evidence Ledger absent.".to_string())?;
    let is_reference_run = event_type == "forgebench_reference_pilot_verified";
    let is_candidate_run = event_type == "forgebench_ollama_candidate_verified";
    let is_executed_run = is_reference_run || is_candidate_run;
    if entry
        .pointer("/privacy/raw_source_stored")
        .and_then(Value::as_bool)
        != Some(false)
        || entry.pointer("/execution/started").and_then(Value::as_bool) != Some(is_executed_run)
        || entry
            .pointer("/validation/independent_run_verification")
            .and_then(Value::as_bool)
            != Some(is_executed_run)
        || (is_executed_run
            && (entry
                .pointer("/execution/api_cost_eur")
                .and_then(Value::as_u64)
                != Some(0)
                || if is_reference_run {
                    entry
                        .pointer("/execution/cost_status")
                        .and_then(Value::as_str)
                        != Some("not_incurred")
                        || entry
                            .pointer("/human_decision/status")
                            .and_then(Value::as_str)
                            != Some("explicitly_confirmed_reference_pilot")
                } else {
                    entry
                        .pointer("/execution/cost_status")
                        .and_then(Value::as_str)
                        != Some("api_not_incurred_energy_not_measured")
                        || entry
                            .pointer("/human_decision/status")
                            .and_then(Value::as_str)
                            != Some("explicitly_confirmed_local_candidate")
                }))
    {
        return Err("Entree Evidence Ledger non conforme a la politique locale.".to_string());
    }
    verify_document_integrity(entry, "d'entree")
}

fn verify_ledger(ledger: &Value) -> Result<(), String> {
    if ledger.get("schema").and_then(Value::as_str) != Some(LEDGER_SCHEMA) {
        return Err("Contrat Evidence Ledger invalide.".to_string());
    }
    let entries = ledger
        .get("entries")
        .and_then(Value::as_array)
        .ok_or_else(|| "Entrees Evidence Ledger absentes.".to_string())?;
    if entries.len() > MAX_ENTRIES {
        return Err("Evidence Ledger trop volumineux.".to_string());
    }
    let mut previous = None;
    for (index, entry) in entries.iter().enumerate() {
        let digest = verify_entry(entry, (index + 1) as u64, previous.as_deref())?;
        previous = Some(digest);
    }
    if ledger.get("head_digest").and_then(Value::as_str) != previous.as_deref() {
        return Err("Tete Evidence Ledger incoherente.".to_string());
    }
    if ledger
        .pointer("/policy/raw_source_documents_stored")
        .and_then(Value::as_bool)
        != Some(false)
        || ledger
            .pointer("/policy/append_only_between_resets")
            .and_then(Value::as_bool)
            != Some(true)
    {
        return Err("Politique de confidentialite Evidence Ledger invalide.".to_string());
    }
    verify_document_integrity(ledger, "du Ledger")?;
    Ok(())
}

fn read_ledger_file(path: &Path) -> Result<Value, String> {
    let bytes =
        fs::read(path).map_err(|error| format!("Impossible de lire Evidence Ledger: {error}"))?;
    if bytes.len() > MAX_LEDGER_BYTES {
        return Err("Evidence Ledger local trop volumineux.".to_string());
    }
    let ledger = serde_json::from_slice::<Value>(&bytes)
        .map_err(|error| format!("Evidence Ledger local corrompu: {error}"))?;
    verify_ledger(&ledger)?;
    Ok(ledger)
}

fn read_ledger(app: &AppHandle) -> Result<Value, String> {
    let path = ledger_path(app)?;
    read_ledger_path(&path)
}

fn read_ledger_path(path: &Path) -> Result<Value, String> {
    if path.exists() {
        return read_ledger_file(path);
    }
    let backup = backup_path(path);
    if backup.exists() {
        let ledger = read_ledger_file(&backup)?;
        fs::rename(&backup, path)
            .map_err(|error| format!("Restauration Evidence Ledger impossible: {error}"))?;
        return Ok(ledger);
    }
    empty_ledger()
}

fn write_ledger(app: &AppHandle, ledger: &Value) -> Result<(), String> {
    let path = ledger_path(app)?;
    write_ledger_path(&path, ledger)
}

fn write_ledger_path(path: &Path, ledger: &Value) -> Result<(), String> {
    verify_ledger(ledger)?;
    let backup = backup_path(path);
    let temporary = temporary_path(path);
    let bytes = serde_json::to_vec_pretty(ledger)
        .map_err(|error| format!("Evidence Ledger non serialisable: {error}"))?;
    if bytes.len() > MAX_LEDGER_BYTES {
        return Err("Evidence Ledger local trop volumineux.".to_string());
    }
    if temporary.exists() {
        let _ = fs::remove_file(&temporary);
    }
    fs::write(&temporary, bytes)
        .map_err(|error| format!("Ecriture temporaire Evidence Ledger impossible: {error}"))?;
    if backup.exists() {
        fs::remove_file(&backup).map_err(|error| {
            format!("Ancienne sauvegarde Evidence Ledger impossible a retirer: {error}")
        })?;
    }
    if path.exists() {
        fs::rename(path, &backup)
            .map_err(|error| format!("Sauvegarde Evidence Ledger impossible: {error}"))?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        if backup.exists() && !path.exists() {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&temporary);
        return Err(format!("Validation Evidence Ledger impossible: {error}"));
    }
    if backup.exists() {
        let _ = fs::remove_file(backup);
    }
    Ok(())
}

fn validate_board_source(source: &Value) -> Result<(), String> {
    if source.get("schema").and_then(Value::as_str) != Some("outilsia.board_observer_result.v1")
        || source.get("read_only").and_then(Value::as_bool) != Some(true)
        || source.get("credential_persisted").and_then(Value::as_bool) != Some(false)
        || source.get("raw_payload_returned").and_then(Value::as_bool) != Some(false)
        || source.pointer("/snapshot/schema").and_then(Value::as_str)
            != Some("outilsia.board_snapshot.v1")
        || source
            .pointer("/snapshot/permissions/write_board")
            .and_then(Value::as_bool)
            != Some(false)
        || source
            .pointer("/snapshot/privacy/api_key_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || source
            .pointer("/snapshot/privacy/raw_descriptions_returned")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Preuve Board Observer non conforme.".to_string());
    }
    let response_digest = source
        .pointer("/snapshot/evidence/source_response_sha256")
        .and_then(Value::as_str)
        .ok_or_else(|| "Empreinte de reponse Board Observer absente.".to_string())?;
    if !is_sha256(response_digest) {
        return Err("Empreinte de reponse Board Observer invalide.".to_string());
    }
    Ok(())
}

fn numeric_claim(source: &Value, pointer: &str) -> Value {
    Value::from(
        source
            .pointer(pointer)
            .and_then(Value::as_u64)
            .unwrap_or_default(),
    )
}

fn required_enum_claim(
    source: &Value,
    pointer: &str,
    allowed: &[&str],
    label: &str,
) -> Result<Value, String> {
    source
        .pointer(pointer)
        .and_then(Value::as_str)
        .filter(|value| allowed.contains(value))
        .map(|value| Value::String(value.to_string()))
        .ok_or_else(|| format!("{label} invalide pour Evidence Ledger."))
}

fn safe_candidate_id(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 320
        || value.starts_with('/')
        || value.contains("..")
        || value.contains("//")
        || !value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b'/' | b':')
        })
    {
        return Err("Identifiant de candidat Evidence Ledger invalide.".to_string());
    }
    Ok(value.to_string())
}

fn workstack_id_claim(source: &Value, pointer: &str) -> Result<Value, String> {
    let value = source
        .pointer(pointer)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    if value.is_empty()
        || value.len() > 128
        || !value.starts_with("ws-")
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("Identifiant Workstack invalide pour Evidence Ledger.".to_string());
    }
    Ok(Value::String(value.to_string()))
}

fn source_contract(event_type: &str, source: &Value) -> Result<Value, String> {
    match event_type {
        "board_observed" => {
            validate_board_source(source)?;
            Ok(json!({
                "actor": {"kind": "outilsia_component", "id": "board_observer"},
                "workstack_id": Value::Null,
                "proof_level": "remote_response_digest",
                "source_integrity_sha256": source.pointer("/snapshot/evidence/source_response_sha256").cloned().unwrap_or(Value::Null),
                "claims": {
                    "lanes": numeric_claim(source, "/snapshot/counts/lanes"),
                    "cards": numeric_claim(source, "/snapshot/counts/cards"),
                    "incomplete_contracts": numeric_claim(source, "/snapshot/counts/incomplete_contracts"),
                    "ready_for_agent": numeric_claim(source, "/snapshot/states/ready_for_agent"),
                    "warnings_total": source.pointer("/snapshot/warnings").and_then(Value::as_array).map_or(0, Vec::len)
                }
            }))
        }
        "workstack_compiled" => {
            validate_workstack_plan(source)?;
            let workstack_id = workstack_id_claim(source, "/workstack_id")?;
            let status = required_enum_claim(
                source,
                "/status",
                &["blocked", "ready_for_human_review"],
                "Statut Workstack",
            )?;
            let priority = required_enum_claim(
                source,
                "/routing/priority",
                &["balanced", "quality", "speed", "cost", "privacy"],
                "Priorite Workstack",
            )?;
            let ready = source
                .pointer("/readiness/ready")
                .and_then(Value::as_bool)
                .ok_or_else(|| "Readiness Workstack invalide pour Evidence Ledger.".to_string())?;
            Ok(json!({
                "actor": {"kind": "outilsia_component", "id": "workstack_composer"},
                "workstack_id": workstack_id,
                "proof_level": "signed_local_plan",
                "source_integrity_sha256": source.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
                "claims": {
                    "status": status,
                    "ready": ready,
                    "blockers_total": source.pointer("/readiness/blockers").and_then(Value::as_array).map_or(0, Vec::len),
                    "acceptance_checks_total": numeric_claim(source, "/objective/acceptance_checks_total"),
                    "priority": priority
                }
            }))
        }
        "capability_routing_proposed" => {
            validate_capability_router_result(source)?;
            let workstack_id = workstack_id_claim(source, "/workstack_ref/workstack_id")?;
            let routing_status = required_enum_claim(
                source,
                "/routing/status",
                &[
                    "workstack_blocked",
                    "no_eligible_capability",
                    "proposal_partial",
                    "proposal_complete",
                ],
                "Statut Capability Router",
            )?;
            let objective_kind = required_enum_claim(
                source,
                "/objective_kind",
                &["general", "code", "audit", "writing", "research"],
                "Type de mission Capability Router",
            )?;
            let assignment_sources = source
                .pointer("/routing/assignments")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            if assignment_sources.len() > 8 {
                return Err("Trop d'affectations pour Evidence Ledger.".to_string());
            }
            let mut assignments = Vec::with_capacity(assignment_sources.len());
            for assignment in assignment_sources {
                let role = assignment
                    .get("role")
                    .and_then(Value::as_str)
                    .filter(|value| matches!(*value, "planner" | "worker" | "independent_verifier"))
                    .ok_or_else(|| {
                        "Role Capability Router invalide pour Evidence Ledger.".to_string()
                    })?;
                let candidate_id = safe_candidate_id(
                    assignment
                        .get("candidate_id")
                        .and_then(Value::as_str)
                        .unwrap_or_default(),
                )?;
                let score = assignment
                    .get("score")
                    .and_then(Value::as_i64)
                    .filter(|score| (0..=1_000).contains(score))
                    .ok_or_else(|| {
                        "Score Capability Router invalide pour Evidence Ledger.".to_string()
                    })?;
                assignments.push(json!({
                    "role": role,
                    "candidate_id": candidate_id,
                    "score": score
                }));
            }
            let candidates = source
                .get("candidates")
                .and_then(Value::as_array)
                .ok_or_else(|| "Candidats Capability Router absents.".to_string())?;
            if candidates.len() > 128 {
                return Err("Trop de candidats pour Evidence Ledger.".to_string());
            }
            let available = candidates
                .iter()
                .filter(|item| item.get("available").and_then(Value::as_bool) == Some(true))
                .count();
            let unresolved = source
                .pointer("/routing/unresolved_roles")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .filter(|role| matches!(*role, "planner" | "worker" | "independent_verifier"))
                .map(str::to_string)
                .collect::<Vec<_>>();
            Ok(json!({
                "actor": {"kind": "outilsia_component", "id": "capability_router"},
                "workstack_id": workstack_id,
                "proof_level": "signed_dry_run_proposal",
                "source_integrity_sha256": source.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
                "claims": {
                    "status": routing_status,
                    "objective_kind": objective_kind,
                    "candidates_total": candidates.len(),
                    "available_candidates": available,
                    "assignments": assignments,
                    "unresolved_roles": unresolved
                }
            }))
        }
        "forgebench_experiment_compiled" => {
            validate_forgebench_result(source)?;
            let workstack_id =
                workstack_id_claim(source, "/experiment/workstack_ref/workstack_id")?;
            let claim_level = required_enum_claim(
                source,
                "/experiment/claim_level",
                &["exploratory", "scientific"],
                "Niveau de preuve ForgeBench",
            )?;
            let experiment_id = source
                .pointer("/experiment/experiment_id")
                .and_then(Value::as_str)
                .filter(|value| {
                    value.starts_with("fb-")
                        && value.len() <= 64
                        && value
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
                })
                .ok_or_else(|| {
                    "Identifiant ForgeBench invalide pour Evidence Ledger.".to_string()
                })?;
            let stacks = source
                .pointer("/experiment/candidate_stacks")
                .and_then(Value::as_array)
                .ok_or_else(|| "Stacks ForgeBench absentes pour Evidence Ledger.".to_string())?;
            let seeds = source
                .pointer("/experiment/protocol/seeds")
                .and_then(Value::as_array)
                .ok_or_else(|| "Seeds ForgeBench absents pour Evidence Ledger.".to_string())?;
            Ok(json!({
                "actor": {"kind": "outilsia_component", "id": "forgebench"},
                "workstack_id": workstack_id,
                "proof_level": "signed_benchmark_preflight",
                "source_integrity_sha256": source.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
                "claims": {
                    "experiment_id": experiment_id,
                    "benchmark_id": source.pointer("/experiment/benchmark/id").cloned().unwrap_or(Value::Null),
                    "benchmark_version": source.pointer("/experiment/benchmark/version").cloned().unwrap_or(Value::Null),
                    "claim_level": claim_level,
                    "candidate_stacks_total": stacks.len(),
                    "seeds_total": seeds.len(),
                    "protocol_ready": source.pointer("/experiment/readiness/protocol_ready").cloned().unwrap_or(json!(false)),
                    "exploratory_ready": source.pointer("/experiment/readiness/exploratory_ready").cloned().unwrap_or(json!(false)),
                    "scientific_ready": source.pointer("/experiment/readiness/scientific_ready").cloned().unwrap_or(json!(false)),
                    "scores_computed": false,
                    "winner_declared": false
                }
            }))
        }
        "forgebench_isolation_probed" => {
            validate_forgebench_isolation_result(source)?;
            let candidates = source
                .get("candidates")
                .and_then(Value::as_array)
                .ok_or_else(|| "Candidats d'isolation absents pour Evidence Ledger.".to_string())?;
            if candidates.len() > 3 {
                return Err("Trop de backends d'isolation pour Evidence Ledger.".to_string());
            }
            let selected_backend = source
                .get("selected_backend")
                .and_then(Value::as_str)
                .map(safe_candidate_id)
                .transpose()?
                .map(Value::String)
                .unwrap_or(Value::Null);
            let host_environment = required_enum_claim(
                source,
                "/host_environment",
                &["windows", "linux", "unsupported"],
                "Environnement du préflight d'isolation",
            )?;
            Ok(json!({
                "actor": {"kind": "outilsia_component", "id": "forgebench_isolation"},
                "workstack_id": Value::Null,
                "proof_level": "signed_isolation_preflight",
                "source_integrity_sha256": source.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
                "claims": {
                    "host_environment": host_environment,
                    "selected_backend": selected_backend,
                    "candidates_total": candidates.len(),
                    "isolation_backend_ready": source.pointer("/readiness/isolation_backend_ready").cloned().unwrap_or(json!(false)),
                    "user_namespace_available": source.pointer("/capabilities/user_namespace_available").cloned().unwrap_or(json!(false)),
                    "mount_namespace_available": source.pointer("/capabilities/mount_namespace_available").cloned().unwrap_or(json!(false)),
                    "network_namespace_available": source.pointer("/capabilities/network_namespace_available").cloned().unwrap_or(json!(false)),
                    "pid_namespace_available": source.pointer("/capabilities/pid_namespace_available").cloned().unwrap_or(json!(false)),
                    "host_root_hidden_in_canary": source.pointer("/capabilities/host_root_hidden_in_canary").cloned().unwrap_or(json!(false)),
                    "worker_execution_ready": false,
                    "scientific_eligible": false
                }
            }))
        }
        "forgebench_reference_pilot_verified" => {
            validate_forgebench_reference_pilot_result(source)?;
            Ok(json!({
                "actor": {"kind": "outilsia_component", "id": "forgebench_runner"},
                "workstack_id": Value::Null,
                "proof_level": "isolated_reference_run",
                "source_integrity_sha256": source.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
                "claims": {
                    "pilot_id": source.get("pilot_id").cloned().unwrap_or(Value::Null),
                    "benchmark_id": source.pointer("/benchmark/id").cloned().unwrap_or(Value::Null),
                    "selected_backend": source.get("selected_backend").cloned().unwrap_or(Value::Null),
                    "worker_kind": source.pointer("/worker/kind").cloned().unwrap_or(Value::Null),
                    "evaluator_kind": source.pointer("/evaluator/kind").cloned().unwrap_or(Value::Null),
                    "reference_runner_verified": true,
                    "independent_visible_evaluator_verified": true,
                    "candidate_stack_executed": false,
                    "hidden_suite_used": false,
                    "scientific_eligible": false,
                    "submission_digest": source.pointer("/evaluator/submission_digest").cloned().unwrap_or(Value::Null),
                    "worker_duration_ms": numeric_claim(source, "/worker/duration_ms"),
                    "evaluator_duration_ms": numeric_claim(source, "/evaluator/duration_ms")
                },
                "execution": {
                    "started": true,
                    "latency_ms": source.pointer("/worker/duration_ms").and_then(Value::as_u64).unwrap_or_default()
                        + source.pointer("/evaluator/duration_ms").and_then(Value::as_u64).unwrap_or_default(),
                    "api_cost_eur": 0,
                    "cost_status": "not_incurred"
                },
                "validation": {
                    "source_contract_valid": true,
                    "independent_run_verification": true
                },
                "human_decision": {"status": "explicitly_confirmed_reference_pilot"}
            }))
        }
        "forgebench_ollama_candidate_verified" => {
            validate_forgebench_ollama_candidate_result(source)?;
            let candidate_id = safe_candidate_id(
                source
                    .pointer("/candidate/candidate_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            )?;
            let model_ref = safe_candidate_id(
                source
                    .pointer("/candidate/model_ref")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            )?;
            let runtime = required_enum_claim(
                source,
                "/candidate/runtime",
                &["native", "wsl"],
                "Runtime du candidat Ollama",
            )?;
            Ok(json!({
                "actor": {"kind": "outilsia_component", "id": "forgebench_candidate_runner"},
                "workstack_id": Value::Null,
                "proof_level": "isolated_local_model_candidate",
                "source_integrity_sha256": source.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
                "claims": {
                    "run_id": source.get("run_id").cloned().unwrap_or(Value::Null),
                    "benchmark_id": source.pointer("/benchmark/id").cloned().unwrap_or(Value::Null),
                    "candidate_id": candidate_id,
                    "model_ref": model_ref,
                    "runtime": runtime,
                    "selected_backend": source.get("selected_backend").cloned().unwrap_or(Value::Null),
                    "candidate_generation_verified": true,
                    "candidate_submission_structure_verified": true,
                    "gameplay_verified": false,
                    "hidden_suite_used": false,
                    "scientific_eligible": false,
                    "winner_declared": false,
                    "submission_digest": source.pointer("/submission/digest").cloned().unwrap_or(Value::Null),
                    "generation_duration_ms": numeric_claim(source, "/generation/duration_ms"),
                    "evaluator_duration_ms": numeric_claim(source, "/evaluator/duration_ms"),
                    "eval_count": numeric_claim(source, "/generation/eval_count")
                },
                "execution": {
                    "started": true,
                    "latency_ms": source.pointer("/generation/duration_ms").and_then(Value::as_u64).unwrap_or_default()
                        + source.pointer("/evaluator/duration_ms").and_then(Value::as_u64).unwrap_or_default(),
                    "api_cost_eur": 0,
                    "cost_status": "api_not_incurred_energy_not_measured"
                },
                "validation": {
                    "source_contract_valid": true,
                    "independent_run_verification": true
                },
                "human_decision": {"status": "explicitly_confirmed_local_candidate"}
            }))
        }
        _ => Err("Type de preuve Evidence Ledger inconnu.".to_string()),
    }
}

fn append_to_ledger(
    mut ledger: Value,
    event_type: &str,
    source: &Value,
    recorded_at_ms: u128,
) -> Result<(Value, bool), String> {
    verify_ledger(&ledger)?;
    let source_bytes = serde_json::to_vec(source)
        .map_err(|error| format!("Source Evidence Ledger non serialisable: {error}"))?;
    if source_bytes.len() > MAX_SOURCE_BYTES {
        return Err("Source Evidence Ledger trop volumineuse.".to_string());
    }
    let contract = source_contract(event_type, source)?;
    let source_document_digest = canonical_sha256(source);
    let entries = ledger
        .get("entries")
        .and_then(Value::as_array)
        .ok_or_else(|| "Entrees Evidence Ledger absentes.".to_string())?;
    if entries.iter().any(|entry| {
        entry.get("event_type").and_then(Value::as_str) == Some(event_type)
            && entry
                .pointer("/evidence/source_document_sha256")
                .and_then(Value::as_str)
                == Some(source_document_digest.as_str())
    }) {
        return Ok((ledger, false));
    }
    if entries.len() >= MAX_ENTRIES {
        return Err("Evidence Ledger a atteint sa limite locale.".to_string());
    }
    let sequence = entries.len() as u64 + 1;
    let previous_digest = ledger.get("head_digest").cloned().unwrap_or(Value::Null);
    if sequence == 1 {
        let ledger_seed = json!({
            "recorded_at_ms": recorded_at_ms,
            "source_document_sha256": source_document_digest
        });
        ledger["ledger_id"] = json!(format!("ledger-{}", &canonical_sha256(&ledger_seed)[..24]));
        ledger["created_at_ms"] = json!(recorded_at_ms);
    }
    let entry_seed = json!({
        "sequence": sequence,
        "event_type": event_type,
        "source_document_sha256": source_document_digest,
        "previous_digest": previous_digest
    });
    let execution = contract.get("execution").cloned().unwrap_or_else(|| json!({"started": false, "latency_ms": Value::Null, "api_cost_eur": 0, "cost_status": "not_incurred"}));
    let validation = contract.get("validation").cloned().unwrap_or_else(
        || json!({"source_contract_valid": true, "independent_run_verification": false}),
    );
    let human_decision = contract
        .get("human_decision")
        .cloned()
        .unwrap_or_else(|| json!({"status": "not_recorded"}));
    let mut entry = json!({
        "schema": ENTRY_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "entry_id": format!("ev-{}", &canonical_sha256(&entry_seed)[..24]),
        "sequence": sequence,
        "recorded_at_ms": recorded_at_ms,
        "event_type": event_type,
        "workstack_id": contract.get("workstack_id").cloned().unwrap_or(Value::Null),
        "actor": contract.get("actor").cloned().unwrap_or(Value::Null),
        "evidence": {
            "source_schema": source.get("schema").cloned().unwrap_or(Value::Null),
            "source_document_sha256": source_document_digest,
            "source_integrity_sha256": contract.get("source_integrity_sha256").cloned().unwrap_or(Value::Null),
            "proof_level": contract.get("proof_level").cloned().unwrap_or(Value::Null),
            "claims": contract.get("claims").cloned().unwrap_or(Value::Object(Default::default())),
            "source_contract_valid": true
        },
        "critique": {"status": "not_performed"},
        "validation": validation,
        "execution": execution,
        "human_decision": human_decision,
        "privacy": {"raw_source_stored": false, "raw_prompt_stored": false, "raw_model_output_stored": false, "credentials_stored": false},
        "previous_digest": previous_digest
    });
    sign_document(&mut entry)?;
    let entry_digest = entry
        .pointer("/integrity/digest")
        .cloned()
        .unwrap_or(Value::Null);
    ledger
        .get_mut("entries")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Entrees Evidence Ledger absentes.".to_string())?
        .push(entry);
    ledger["head_digest"] = entry_digest;
    ledger["updated_at_ms"] = json!(recorded_at_ms);
    ledger["verification"] = json!({
        "chain_valid": true,
        "entries_verified": sequence,
        "last_verified_at_ms": recorded_at_ms
    });
    sign_document(&mut ledger)?;
    verify_ledger(&ledger)?;
    Ok((ledger, true))
}

#[tauri::command]
pub(crate) fn get_evidence_ledger(app: AppHandle) -> Result<Value, String> {
    let _guard = ledger_lock()
        .lock()
        .map_err(|_| "Verrou Evidence Ledger indisponible.".to_string())?;
    read_ledger(&app)
}

#[tauri::command]
pub(crate) fn append_evidence_entry(
    app: AppHandle,
    request: AppendEvidenceRequest,
) -> Result<Value, String> {
    if request.schema != APPEND_REQUEST_SCHEMA {
        return Err("Contrat d'ajout Evidence Ledger invalide.".to_string());
    }
    let _guard = ledger_lock()
        .lock()
        .map_err(|_| "Verrou Evidence Ledger indisponible.".to_string())?;
    let current = read_ledger(&app)?;
    let (ledger, appended) = append_to_ledger(
        current,
        request.event_type.trim(),
        &request.source_document,
        unix_ms(),
    )?;
    if appended {
        write_ledger(&app, &ledger)?;
    }
    Ok(json!({
        "schema": APPEND_RESULT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "appended": appended,
        "duplicate": !appended,
        "ledger": ledger
    }))
}

#[tauri::command]
pub(crate) fn clear_evidence_ledger(app: AppHandle) -> Result<Value, String> {
    let _guard = ledger_lock()
        .lock()
        .map_err(|_| "Verrou Evidence Ledger indisponible.".to_string())?;
    let path = ledger_path(&app)?;
    for candidate in [&path, &backup_path(&path), &temporary_path(&path)] {
        if candidate.exists() {
            fs::remove_file(candidate)
                .map_err(|error| format!("Reinitialisation Evidence Ledger impossible: {error}"))?;
        }
    }
    empty_ledger()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn board_source() -> Value {
        json!({
            "schema": "outilsia.board_observer_result.v1",
            "read_only": true,
            "credential_persisted": false,
            "raw_payload_returned": false,
            "snapshot": {
                "schema": "outilsia.board_snapshot.v1",
                "board": {"name": "Projet tres secret"},
                "counts": {"lanes": 4, "cards": 8, "incomplete_contracts": 1},
                "states": {"ready_for_agent": 2},
                "warnings": ["incomplete_contracts"],
                "evidence": {"source_response_sha256": "a".repeat(64)},
                "privacy": {"api_key_returned": false, "raw_descriptions_returned": false},
                "permissions": {"write_board": false}
            }
        })
    }

    fn workstack_source() -> Value {
        let mut plan = json!({
            "schema": "outilsia.workstack.v1",
            "workstack_id": "ws-ledger-test",
            "status": "ready_for_human_review",
            "execution_enabled": false,
            "objective": {"acceptance_checks_total": 3},
            "readiness": {"ready": true, "blockers": []},
            "routing": {"priority": "balanced"},
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

    fn router_source() -> Value {
        let mut result = json!({
            "schema": "outilsia.capability_router_result.v1",
            "dry_run": true,
            "execution_started": false,
            "credentials_read": false,
            "repository_scanned": false,
            "repository_modified": false,
            "network_called": false,
            "workstack_ref": {"workstack_id": "ws-ledger-test"},
            "objective_kind": "code",
            "candidates": [
                {"id": "worker", "available": true},
                {"id": "verifier", "available": true}
            ],
            "routing": {
                "status": "proposal_complete",
                "assignments": [
                    {"role": "worker", "candidate_id": "worker", "score": 60, "task_execution_started": false},
                    {"role": "independent_verifier", "candidate_id": "verifier", "score": 55, "task_execution_started": false}
                ],
                "unresolved_roles": []
            },
            "policy": {
                "start_agents": false,
                "create_worktrees": false,
                "write_board": false,
                "modify_repository": false,
                "spend_api_credit": false,
                "publish": false,
                "merge": false,
                "human_approval_required_before_execution": true
            }
        });
        let digest = canonical_sha256(&result);
        result["integrity"] = json!({"digest": digest});
        result
    }

    fn forgebench_source() -> Value {
        let protocol = json!({
            "schema": "outilsia.forgebench_protocol.v1",
            "benchmark_id": "signal-maze-v1",
            "starter": {"status": "sealed", "bundle_sha256": "a".repeat(64)},
            "seeds": [17011, 17029, 17047],
            "visible_checks": [1, 2, 3, 4, 5],
            "hidden_suite": {"status": "not_provisioned", "contents_embedded": false, "digest": Value::Null},
            "score_policy": {
                "schema": "outilsia.forgebench_score_policy.v1",
                "weights_percent": {"result": 50, "efficiency": 20, "speed": 15, "cost": 15},
                "unknown_cost_is_zero": false,
                "composite_requires_all_dimensions": true,
                "raw_dimensions_required": true,
                "dimension_podiums_required": true,
                "pareto_frontier_required": true,
                "winner_before_complete_runs": false
            },
            "permissions": {
                "benchmark_contract_write": false,
                "visible_tests_write": false,
                "hidden_tests_read": false,
                "publish": false,
                "merge": false
            }
        });
        let protocol_digest = canonical_sha256(&protocol);
        let mut experiment = json!({
            "schema": "outilsia.forgebench_experiment.v1",
            "experiment_id": "fb-ledger-test",
            "benchmark": {"id": "signal-maze-v1", "version": "1.0.0-exploratory", "spec_sha256": "b".repeat(64), "public_task_included": false},
            "workstack_ref": {"workstack_id": "ws-ledger-test", "ready": true},
            "capability_routing_ref": {"status": "proposal_complete"},
            "claim_level": "exploratory",
            "protocol": protocol,
            "protocol_digest": protocol_digest,
            "candidate_stacks": [
                {
                    "key": "codex-solo", "available": true, "blockers": [], "protocol_digest": protocol_digest, "execution_started": false, "scores_computed": false,
                    "bindings": [
                        {"role": "worker", "candidate": {"candidate_id": "codex-cli:test"}, "execution_started": false},
                        {"role": "independent_verifier", "candidate": {"candidate_id": "forgebench:deterministic-evaluator"}, "execution_started": false}
                    ]
                },
                {
                    "key": "claude-solo", "available": true, "blockers": [], "protocol_digest": protocol_digest, "execution_started": false, "scores_computed": false,
                    "bindings": [
                        {"role": "worker", "candidate": {"candidate_id": "claude-code:test"}, "execution_started": false},
                        {"role": "independent_verifier", "candidate": {"candidate_id": "forgebench:deterministic-evaluator"}, "execution_started": false}
                    ]
                }
            ],
            "readiness": {"protocol_ready": true, "exploratory_ready": true, "scientific_ready": false, "selected_claim_ready": true},
            "measurements": {"runs_recorded": 0, "scores_computed": false, "dimension_podiums_computed": false, "pareto_frontier_computed": false, "winner_declared": false, "cost_status": "not_measured_not_zero"},
            "fairness": {"same_protocol_digest_for_every_stack": true, "fresh_workspace_per_run_required": true, "independent_evaluator_required": true, "human_help_must_be_logged": true, "rules_or_tests_modified": false},
            "execution": {"started": false, "agents_started": false, "worktrees_created": false, "repository_modified": false, "api_spend_eur": 0},
            "privacy": {"raw_workstack_included": false, "raw_task_context_included": false, "credentials_included": false, "hidden_test_contents_included": false}
        });
        sign_document(&mut experiment).expect("signed ForgeBench experiment");
        let mut result = json!({
            "schema": "outilsia.forgebench_compile_result.v1",
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
                "hidden_test_contents_returned": false
            }
        });
        sign_document(&mut result).expect("signed ForgeBench result");
        result
    }

    fn isolation_source() -> Value {
        let mut result = json!({
            "schema": "outilsia.forgebench_isolation_probe_result.v1",
            "contract_version": "2026-07-13",
            "probed_at_ms": 4_500,
            "host_environment": "linux",
            "selected_backend": "linux-bwrap-native",
            "candidates": [{
                "id": "linux-bwrap-native",
                "label": "Bubblewrap Linux",
                "environment": "linux_native",
                "backend": "bubblewrap",
                "installed": true,
                "probe_executed": true,
                "timed_out": false,
                "canary_passed": true,
                "version": "bubblewrap 0.11.0",
                "reason_code": Value::Null,
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
        sign_document(&mut result).expect("signed isolation source");
        result
    }

    #[test]
    fn empty_ledger_is_valid_and_contains_no_entry() {
        let ledger = empty_ledger().expect("empty ledger");
        verify_ledger(&ledger).expect("valid empty ledger");
        assert_eq!(ledger["entries"], json!([]));
        assert_eq!(ledger["verification"]["chain_valid"], true);
    }

    #[test]
    fn appends_three_contracts_into_a_verified_chain() {
        let (ledger, first) = append_to_ledger(
            empty_ledger().expect("empty"),
            "board_observed",
            &board_source(),
            1_000,
        )
        .expect("board entry");
        assert!(first);
        let (ledger, second) =
            append_to_ledger(ledger, "workstack_compiled", &workstack_source(), 2_000)
                .expect("workstack entry");
        assert!(second);
        let (ledger, third) = append_to_ledger(
            ledger,
            "capability_routing_proposed",
            &router_source(),
            3_000,
        )
        .expect("router entry");
        assert!(third);
        verify_ledger(&ledger).expect("verified chain");
        assert_eq!(ledger["entries"].as_array().map(Vec::len), Some(3));
        assert_eq!(ledger["verification"]["entries_verified"], 3);
    }

    #[test]
    fn appends_a_forgebench_preflight_without_scores_or_raw_content() {
        let (ledger, appended) = append_to_ledger(
            empty_ledger().expect("empty"),
            "forgebench_experiment_compiled",
            &forgebench_source(),
            4_000,
        )
        .expect("ForgeBench entry");
        assert!(appended);
        verify_ledger(&ledger).expect("verified ForgeBench ledger");
        let entry = &ledger["entries"][0];
        assert_eq!(
            entry["evidence"]["proof_level"],
            "signed_benchmark_preflight"
        );
        assert_eq!(entry["evidence"]["claims"]["scores_computed"], false);
        assert_eq!(entry["evidence"]["claims"]["winner_declared"], false);
        let serialized = serde_json::to_string(&ledger).expect("ledger JSON");
        assert!(!serialized.contains("\"candidate_stacks\":"));
        assert!(!serialized.contains("\"hidden_suite\":"));
    }

    #[test]
    fn appends_an_isolation_preflight_without_worker_or_namespace_ids() {
        let (ledger, appended) = append_to_ledger(
            empty_ledger().expect("empty"),
            "forgebench_isolation_probed",
            &isolation_source(),
            4_500,
        )
        .expect("isolation entry");
        assert!(appended);
        verify_ledger(&ledger).expect("verified isolation ledger");
        let entry = &ledger["entries"][0];
        assert_eq!(
            entry["evidence"]["proof_level"],
            "signed_isolation_preflight"
        );
        assert_eq!(entry["evidence"]["claims"]["worker_execution_ready"], false);
        assert_eq!(entry["evidence"]["claims"]["scientific_eligible"], false);
        let serialized = serde_json::to_string(&ledger).expect("ledger JSON");
        assert!(!serialized.contains("user:["));
        assert!(!serialized.contains("workspace"));
        assert!(!serialized.contains("hidden_suite"));
    }

    #[test]
    fn appends_a_verified_reference_run_without_raw_worker_output() {
        let source = crate::forgebench_runner::tests::signed_result();
        let (ledger, appended) = append_to_ledger(
            empty_ledger().expect("empty"),
            "forgebench_reference_pilot_verified",
            &source,
            4_750,
        )
        .expect("reference run entry");
        assert!(appended);
        verify_ledger(&ledger).expect("verified reference run ledger");
        let entry = &ledger["entries"][0];
        assert_eq!(entry["evidence"]["proof_level"], "isolated_reference_run");
        assert_eq!(entry["execution"]["started"], true);
        assert_eq!(entry["validation"]["independent_run_verification"], true);
        assert_eq!(entry["evidence"]["claims"]["scientific_eligible"], false);
        let serialized = serde_json::to_string(&ledger).expect("ledger JSON");
        assert!(!serialized.contains("workspace_path"));
        assert!(!serialized.contains("raw_worker_output"));
        assert!(!serialized.contains("forgebench-reference-pilot-v1:"));
    }

    #[test]
    fn appends_a_local_candidate_without_raw_model_output_or_quality_claim() {
        let source = crate::forgebench_candidate::tests::signed_result();
        let (ledger, appended) = append_to_ledger(
            empty_ledger().expect("empty"),
            "forgebench_ollama_candidate_verified",
            &source,
            4_900,
        )
        .expect("candidate run entry");
        assert!(appended);
        verify_ledger(&ledger).expect("verified candidate ledger");
        let entry = &ledger["entries"][0];
        assert_eq!(
            entry["evidence"]["proof_level"],
            "isolated_local_model_candidate"
        );
        assert_eq!(entry["execution"]["started"], true);
        assert_eq!(entry["execution"]["api_cost_eur"], 0);
        assert_eq!(entry["evidence"]["claims"]["gameplay_verified"], false);
        assert_eq!(entry["evidence"]["claims"]["scientific_eligible"], false);
        let serialized = serde_json::to_string(&ledger).expect("ledger JSON");
        assert!(!serialized.contains("raw_response"));
        assert!(!serialized.contains("index_html"));
        assert!(!serialized.contains("workspace_path"));
    }

    #[test]
    fn duplicate_source_is_not_appended_twice() {
        let source = board_source();
        let (ledger, _) = append_to_ledger(
            empty_ledger().expect("empty"),
            "board_observed",
            &source,
            1_000,
        )
        .expect("first append");
        let (ledger, appended) =
            append_to_ledger(ledger, "board_observed", &source, 2_000).expect("duplicate append");
        assert!(!appended);
        assert_eq!(ledger["entries"].as_array().map(Vec::len), Some(1));
    }

    #[test]
    fn tampering_breaks_the_chain() {
        let (mut ledger, _) = append_to_ledger(
            empty_ledger().expect("empty"),
            "workstack_compiled",
            &workstack_source(),
            1_000,
        )
        .expect("append");
        ledger["entries"][0]["evidence"]["claims"]["status"] = json!("done");
        assert!(verify_ledger(&ledger).is_err());
    }

    #[test]
    fn raw_source_content_is_never_persisted() {
        let source = board_source();
        let (ledger, _) = append_to_ledger(
            empty_ledger().expect("empty"),
            "board_observed",
            &source,
            1_000,
        )
        .expect("append");
        let serialized = serde_json::to_string(&ledger).expect("ledger JSON");
        assert!(!serialized.contains("Projet tres secret"));
        assert!(!serialized.contains("description"));
        assert!(serialized.contains("raw_source_stored\":false"));
    }

    #[test]
    fn event_type_must_match_the_source_contract() {
        assert!(append_to_ledger(
            empty_ledger().expect("empty"),
            "workstack_compiled",
            &board_source(),
            1_000,
        )
        .is_err());
    }

    #[test]
    fn forged_raw_candidate_identifier_is_rejected_even_when_rehashed() {
        let mut source = router_source();
        source["routing"]["assignments"][0]["candidate_id"] =
            json!("secret@example.com /home/chris");
        source
            .as_object_mut()
            .expect("router object")
            .remove("integrity");
        let digest = canonical_sha256(&source);
        source["integrity"] = json!({"digest": digest});
        assert!(append_to_ledger(
            empty_ledger().expect("empty"),
            "capability_routing_proposed",
            &source,
            1_000,
        )
        .is_err());
    }

    #[test]
    fn ledger_file_roundtrip_preserves_a_verified_chain() {
        let directory = std::env::temp_dir().join(format!(
            "outilsia-evidence-ledger-{}-{}",
            std::process::id(),
            unix_ms()
        ));
        fs::create_dir_all(&directory).expect("temporary ledger directory");
        let path = directory.join(LEDGER_FILENAME);
        let (ledger, _) = append_to_ledger(
            empty_ledger().expect("empty"),
            "workstack_compiled",
            &workstack_source(),
            1_000,
        )
        .expect("append");
        write_ledger_path(&path, &ledger).expect("write ledger");
        let restored = read_ledger_path(&path).expect("read ledger");
        assert_eq!(restored["head_digest"], ledger["head_digest"]);
        verify_ledger(&restored).expect("verified restored ledger");
        let backup = backup_path(&path);
        fs::rename(&path, &backup).expect("simulate interrupted replacement");
        let recovered = read_ledger_path(&path).expect("recover backup ledger");
        assert_eq!(recovered["head_digest"], ledger["head_digest"]);
        assert!(path.exists());
        assert!(!backup.exists());
        fs::remove_dir_all(directory).expect("remove temporary ledger directory");
    }
}
