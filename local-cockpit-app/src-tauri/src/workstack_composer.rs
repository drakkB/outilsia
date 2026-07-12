use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::time::{SystemTime, UNIX_EPOCH};

const COMPILE_REQUEST_SCHEMA: &str = "outilsia.workstack_compile_request.v1";
const COMPILE_RESULT_SCHEMA: &str = "outilsia.workstack_compile_result.v1";
const WORKSTACK_SCHEMA: &str = "outilsia.workstack.v1";
const CONTRACT_VERSION: &str = "2026-07-12";
const MAX_CONTEXT_BYTES: usize = 64 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct CompileWorkCardRequest {
    schema: String,
    card: Value,
    local_context: Option<String>,
    priority: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct WorkstackCompileResult {
    schema: String,
    contract_version: String,
    compiler: String,
    execution_started: bool,
    raw_context_returned: bool,
    plan: Value,
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
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

fn text_field<'a>(value: &'a Value, name: &str) -> &'a str {
    value.get(name).and_then(Value::as_str).unwrap_or_default()
}

fn validate_source_key(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 256 || value.chars().any(char::is_whitespace) {
        return Err("Identite source de la carte invalide.".to_string());
    }
    let Some((adapter, source_id)) = value.split_once(':') else {
        return Err("Identite source de la carte invalide.".to_string());
    };
    if adapter.is_empty()
        || source_id.is_empty()
        || !adapter
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        || source_id.chars().any(char::is_control)
    {
        return Err("Identite source de la carte invalide.".to_string());
    }
    Ok(())
}

fn priority_weights(priority: &str) -> Result<Value, String> {
    let weights = match priority {
        "quality" => {
            json!({"quality": 45, "reliability": 25, "speed": 10, "cost": 10, "privacy": 10})
        }
        "speed" => {
            json!({"quality": 20, "reliability": 20, "speed": 40, "cost": 10, "privacy": 10})
        }
        "cost" => json!({"quality": 20, "reliability": 20, "speed": 10, "cost": 40, "privacy": 10}),
        "privacy" => {
            json!({"quality": 20, "reliability": 20, "speed": 10, "cost": 10, "privacy": 40})
        }
        "balanced" => {
            json!({"quality": 25, "reliability": 25, "speed": 20, "cost": 15, "privacy": 15})
        }
        _ => return Err("Priorite Workstack inconnue.".to_string()),
    };
    Ok(weights)
}

fn normalized_missing(card: &Value, local_context: &str) -> BTreeSet<String> {
    let contract = card.get("contract").unwrap_or(&Value::Null);
    let mut missing = contract
        .get("missing")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect::<BTreeSet<_>>();
    if !local_context.is_empty() {
        missing.remove("context");
    } else if !contract
        .get("context_present")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        missing.insert("context".to_string());
    }
    if contract
        .get("acceptance_checks_total")
        .and_then(Value::as_u64)
        .unwrap_or_default()
        == 0
    {
        missing.insert("acceptance_checks".to_string());
    }
    if contract
        .get("permission_boundaries")
        .and_then(Value::as_array)
        .is_none_or(Vec::is_empty)
    {
        missing.insert("permission_boundary".to_string());
    }
    missing
}

fn compile_plan(request: &CompileWorkCardRequest) -> Result<Value, String> {
    if request.schema != COMPILE_REQUEST_SCHEMA {
        return Err("Contrat Workstack Composer invalide.".to_string());
    }
    let source_key = text_field(&request.card, "source_key");
    validate_source_key(source_key)?;
    let title = text_field(&request.card, "name").trim();
    if title.is_empty() || title.len() > 512 {
        return Err("Objectif de la carte invalide.".to_string());
    }
    let work_state = text_field(&request.card, "work_state");
    let priority = request.priority.as_deref().unwrap_or("balanced");
    let weights = priority_weights(priority)?;
    let local_context = request.local_context.as_deref().unwrap_or_default().trim();
    if local_context.len() > MAX_CONTEXT_BYTES {
        return Err("Contexte local trop volumineux.".to_string());
    }
    let context_digest = if local_context.is_empty() {
        Value::Null
    } else {
        Value::String(canonical_sha256(&Value::String(local_context.to_string())))
    };
    let missing = normalized_missing(&request.card, local_context);
    let mut blockers = missing.iter().cloned().collect::<Vec<_>>();
    if work_state != "ready_for_agent" {
        blockers.push("card_not_ready_for_agent".to_string());
    }
    blockers.sort();
    blockers.dedup();
    let ready = blockers.is_empty();
    let acceptance_total = request
        .card
        .pointer("/contract/acceptance_checks_total")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let permission_boundaries = request
        .card
        .pointer("/contract/permission_boundaries")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let context_mode = if local_context.is_empty() {
        "source_reference"
    } else {
        "local_digest"
    };
    let workstack_seed = json!({
        "source_key": source_key,
        "title": title,
        "priority": priority,
        "context_digest": context_digest,
        "blockers": blockers
    });
    let workstack_id = format!("ws-{}", &canonical_sha256(&workstack_seed)[..24]);
    let mut plan = json!({
        "schema": WORKSTACK_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "workstack_id": workstack_id,
        "created_at_ms": unix_ms(),
        "status": if ready { "ready_for_human_review" } else { "blocked" },
        "execution_enabled": false,
        "source": {
            "type": "board_card",
            "source_key": source_key,
            "adapter": source_key.split_once(':').map(|value| value.0).unwrap_or("unknown")
        },
        "objective": {
            "title": title,
            "context_mode": context_mode,
            "context_digest": context_digest,
            "raw_context_included": false,
            "acceptance_checks_total": acceptance_total,
            "permission_boundaries": permission_boundaries
        },
        "readiness": {
            "ready": ready,
            "blockers": blockers,
            "human_review_required": true
        },
        "routing": {
            "priority": priority,
            "capability_weights_percent": weights,
            "worker_assignment": "unassigned",
            "brand_locked": false
        },
        "budget": {
            "max_workers": 2,
            "max_attempts_per_stage": 1,
            "max_duration_seconds": 1800,
            "max_api_cost_eur": 0,
            "cloud_allowed": false
        },
        "stages": [
            {"id": "scope", "role": "human_owner", "action": "confirm_scope", "enabled": true, "status": "required"},
            {"id": "plan", "role": "planner", "action": "produce_bounded_plan", "enabled": false, "status": "not_started"},
            {"id": "execute", "role": "worker", "action": "produce_isolated_patch_or_artifact", "enabled": false, "status": "not_started"},
            {"id": "verify", "role": "independent_verifier", "action": "rerun_acceptance_checks", "enabled": false, "status": "not_started"},
            {"id": "approve", "role": "human_owner", "action": "approve_merge_or_delivery", "enabled": false, "status": "not_started"}
        ],
        "policy": {
            "plan_only": true,
            "start_agents": false,
            "create_worktrees": false,
            "write_board": false,
            "publish": false,
            "merge": false,
            "human_gate_non_delegable": true
        },
        "privacy": {
            "raw_context_included": false,
            "raw_board_description_included": false,
            "credentials_included": false,
            "persisted": false
        }
    });
    let digest = canonical_sha256(&plan);
    plan["integrity"] = json!({
        "algorithm": "SHA-256",
        "canonicalization": "recursive-key-sort-json-v1",
        "scope": "canonical_document_without_integrity",
        "digest": digest
    });
    Ok(plan)
}

#[tauri::command]
pub(crate) fn compile_work_card(
    request: CompileWorkCardRequest,
) -> Result<WorkstackCompileResult, String> {
    let plan = compile_plan(&request)?;
    Ok(WorkstackCompileResult {
        schema: COMPILE_RESULT_SCHEMA.to_string(),
        contract_version: CONTRACT_VERSION.to_string(),
        compiler: "outilsia-workstack-composer-v0".to_string(),
        execution_started: false,
        raw_context_returned: false,
        plan,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn complete_card() -> Value {
        json!({
            "source_key": "planka:card-1",
            "source_id": "card-1",
            "work_state": "ready_for_agent",
            "name": "Construire Signal Maze v1",
            "contract": {
                "status": "complete",
                "missing": [],
                "context_present": true,
                "acceptance_checks_total": 3,
                "permission_boundaries": ["safe_to_execute"],
                "human_approval_required": false,
                "execution_allowed": false
            }
        })
    }

    fn request(card: Value) -> CompileWorkCardRequest {
        CompileWorkCardRequest {
            schema: COMPILE_REQUEST_SCHEMA.to_string(),
            card,
            local_context: Some("Contexte prive qui ne doit pas sortir".to_string()),
            priority: Some("balanced".to_string()),
        }
    }

    #[test]
    fn complete_card_compiles_to_a_plan_only_workstack() {
        let result = compile_work_card(request(complete_card())).expect("compiled workstack");
        assert_eq!(result.schema, COMPILE_RESULT_SCHEMA);
        assert!(!result.execution_started);
        assert!(!result.raw_context_returned);
        assert_eq!(result.plan["schema"], WORKSTACK_SCHEMA);
        assert_eq!(result.plan["status"], "ready_for_human_review");
        assert_eq!(result.plan["execution_enabled"], false);
        assert_eq!(result.plan["policy"]["start_agents"], false);
        assert_eq!(result.plan["policy"]["write_board"], false);
        assert_eq!(result.plan["stages"][2]["role"], "worker");

        let serialized = serde_json::to_string(&result).expect("workstack JSON");
        assert!(!serialized.contains("Contexte prive"));
        assert!(serialized.contains("raw_context_included\":false"));
        assert!(result.plan["objective"]["context_digest"].is_string());
    }

    #[test]
    fn incomplete_or_misplaced_card_remains_blocked() {
        let mut card = complete_card();
        card["work_state"] = json!("in_progress");
        card["contract"]["acceptance_checks_total"] = json!(0);
        card["contract"]["permission_boundaries"] = json!([]);
        let plan = compile_plan(&request(card)).expect("blocked plan");
        assert_eq!(plan["status"], "blocked");
        let blockers = plan["readiness"]["blockers"].as_array().expect("blockers");
        assert!(blockers.contains(&json!("acceptance_checks")));
        assert!(blockers.contains(&json!("permission_boundary")));
        assert!(blockers.contains(&json!("card_not_ready_for_agent")));
    }

    #[test]
    fn local_context_can_satisfy_a_missing_context_without_being_exported() {
        let mut card = complete_card();
        card["contract"]["missing"] = json!(["context"]);
        card["contract"]["context_present"] = json!(false);
        let plan = compile_plan(&request(card)).expect("context repaired plan");
        assert_eq!(plan["status"], "ready_for_human_review");
        assert_eq!(plan["objective"]["context_mode"], "local_digest");
        assert_eq!(plan["objective"]["raw_context_included"], false);
    }

    #[test]
    fn identity_and_priority_are_validated() {
        let mut bad_identity = request(complete_card());
        bad_identity.card["source_key"] = json!("../card");
        assert!(compile_plan(&bad_identity).is_err());
        let mut bad_priority = request(complete_card());
        bad_priority.priority = Some("brand-name".to_string());
        assert!(compile_plan(&bad_priority).is_err());
    }

    #[test]
    fn workstack_id_is_stable_while_integrity_covers_each_plan() {
        let first = compile_plan(&request(complete_card())).expect("first plan");
        let second = compile_plan(&request(complete_card())).expect("second plan");
        assert_eq!(first["workstack_id"], second["workstack_id"]);
        assert!(first["integrity"]["digest"]
            .as_str()
            .is_some_and(|value| value.len() == 64));
        let mut unsigned = first.clone();
        unsigned
            .as_object_mut()
            .expect("plan object")
            .remove("integrity");
        assert_eq!(first["integrity"]["digest"], canonical_sha256(&unsigned));
    }
}
