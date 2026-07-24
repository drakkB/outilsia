use crate::workstack_composer::canonical_sha256;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::time::{SystemTime, UNIX_EPOCH};

const CATALOG_SCHEMA: &str = "outilsia.agent_adapter_policy_catalog.v1";
const CONTRACT_VERSION: &str = "2026-07-24";
const CODEX_ADAPTER_ID: &str = "codex-cli";
const CLAUDE_ADAPTER_ID: &str = "claude-code";
const HERMES_ADAPTER_ID: &str = "hermes-agent";
const CODEX_SCOPE: &str = "codex_cli_signal_maze_pilot_v1";
const CODEX_BENCHMARK_ID: &str = "signal-maze-v1";
const CODEX_STACK_KEY: &str = "codex-solo";
const CODEX_OUTPUT_BUDGET_BYTES: u64 = 512 * 1024;
const CODEX_DURATION_OPTIONS_SECONDS: [u64; 3] = [180, 300, 600];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
struct AgentAdapterPolicy {
    adapter_id: String,
    provider: String,
    label: String,
    kind: String,
    current_state: String,
    detection: Value,
    execution: Value,
    consent: Value,
    budget: Value,
    boundaries: Value,
    limitations: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct AgentAdapterPolicyCatalog {
    schema: String,
    contract_version: String,
    generated_at_ms: u128,
    catalog_kind: String,
    policies: Vec<AgentAdapterPolicy>,
    guarantees: Value,
    integrity: Value,
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn detection_policy(executables: &[&str]) -> Value {
    json!({
        "executables": executables,
        "version_probe_only": true,
        "account_status_inspected": false,
        "quota_inspected": false,
        "credentials_read_by_outilsia": false,
        "command_path_returned": false,
        "network_request_by_outilsia": false
    })
}

fn execution_boundaries() -> Value {
    json!({
        "original_repository_read_authorized": false,
        "original_repository_write_authorized": false,
        "board_write_authorized": false,
        "hidden_suite_access_authorized": false,
        "credential_access_authorized": false,
        "merge_authorized": false,
        "publish_authorized": false,
        "delivery_authorized": false,
        "winner_declaration_authorized": false,
        "raw_worker_output_persisted": false,
        "personal_paths_returned": false
    })
}

fn codex_policy() -> AgentAdapterPolicy {
    AgentAdapterPolicy {
        adapter_id: CODEX_ADAPTER_ID.to_string(),
        provider: "openai".to_string(),
        label: "Codex CLI".to_string(),
        kind: "official_cli".to_string(),
        current_state: "bounded_public_pilot".to_string(),
        detection: detection_policy(&["codex"]),
        execution: json!({
            "enabled": true,
            "allowed_scopes": [CODEX_SCOPE],
            "benchmark_id": CODEX_BENCHMARK_ID,
            "stack_key": CODEX_STACK_KEY,
            "environments": ["windows_native", "linux_native", "wsl_default"],
            "workspace_mode": "verified_disposable_workspace_only",
            "network_mode": "vendor_cli_only_after_explicit_consent",
            "hidden_holdout_enabled": false,
            "arbitrary_project_enabled": false
        }),
        consent: json!({
            "required": true,
            "requirements": [
                "vendor_cli_quota_or_cost_unknown_accepted",
                "disposable_workspace_write_and_generated_code_execution_allowed"
            ],
            "scope_is_single_run": true,
            "consent_reused_across_runs": false
        }),
        budget: json!({
            "max_attempts": 1,
            "duration_options_seconds": CODEX_DURATION_OPTIONS_SECONDS,
            "max_output_bytes": CODEX_OUTPUT_BUDGET_BYTES,
            "vendor_cost_mode": "unknown",
            "unknown_cost_converted_to_zero": false
        }),
        boundaries: execution_boundaries(),
        limitations: vec![
            "signal_maze_public_only".to_string(),
            "private_holdout_unavailable".to_string(),
            "human_review_required".to_string(),
            "delivery_forbidden".to_string(),
            "winner_forbidden".to_string(),
        ],
    }
}

fn detect_only_policy(
    adapter_id: &str,
    provider: &str,
    label: &str,
    executables: &[&str],
    limitations: &[&str],
) -> AgentAdapterPolicy {
    AgentAdapterPolicy {
        adapter_id: adapter_id.to_string(),
        provider: provider.to_string(),
        label: label.to_string(),
        kind: "official_cli".to_string(),
        current_state: "detect_only".to_string(),
        detection: detection_policy(executables),
        execution: json!({
            "enabled": false,
            "allowed_scopes": [],
            "benchmark_id": null,
            "stack_key": null,
            "environments": [],
            "workspace_mode": "not_authorized",
            "network_mode": "not_authorized",
            "hidden_holdout_enabled": false,
            "arbitrary_project_enabled": false
        }),
        consent: json!({
            "required": true,
            "requirements": [],
            "scope_is_single_run": true,
            "consent_reused_across_runs": false
        }),
        budget: json!({
            "max_attempts": 0,
            "duration_options_seconds": [],
            "max_output_bytes": 0,
            "vendor_cost_mode": "unknown",
            "unknown_cost_converted_to_zero": false
        }),
        boundaries: execution_boundaries(),
        limitations: limitations
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
    }
}

fn unsigned_catalog() -> Value {
    let policies = vec![
        codex_policy(),
        detect_only_policy(
            CLAUDE_ADAPTER_ID,
            "anthropic",
            "Claude Code",
            &["claude"],
            &[
                "adapter_execution_contract_missing",
                "budget_contract_missing",
                "workspace_boundary_unverified",
            ],
        ),
        detect_only_policy(
            HERMES_ADAPTER_ID,
            "nous-research",
            "Hermes Agent",
            &["hermes", "hermes-agent"],
            &[
                "adapter_execution_contract_missing",
                "budget_contract_missing",
                "workspace_boundary_unverified",
                "orchestration_handoff_contract_missing",
            ],
        ),
    ];
    json!({
        "schema": CATALOG_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "generated_at_ms": unix_ms(),
        "catalog_kind": "static_local_policy",
        "policies": policies,
        "guarantees": {
            "execution_started": false,
            "machine_probe_started": false,
            "credentials_read": false,
            "account_status_inspected": false,
            "quota_or_cost_queried": false,
            "network_called": false,
            "repository_scanned": false,
            "repository_modified": false,
            "board_modified": false,
            "policy_is_execution_authorization": false,
            "human_approval_required_before_every_run": true
        }
    })
}

fn signed_catalog_value() -> Value {
    let mut document = unsigned_catalog();
    let digest = canonical_sha256(&document);
    document["integrity"] = json!({
        "algorithm": "SHA-256",
        "canonicalization": "recursive-key-sort-json-v1",
        "scope": "canonical_document_without_integrity",
        "digest": digest
    });
    document
}

fn bool_at(value: &Value, pointer: &str, expected: bool) -> bool {
    value.pointer(pointer).and_then(Value::as_bool) == Some(expected)
}

fn exact_string_array(value: &Value, pointer: &str, expected: &[&str]) -> bool {
    value
        .pointer(pointer)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(Value::as_str)
                .collect::<Option<Vec<_>>>()
                .is_some_and(|actual| actual == expected)
        })
        .unwrap_or(false)
}

fn validate_common_boundaries(policy: &Value) -> bool {
    [
        "original_repository_read_authorized",
        "original_repository_write_authorized",
        "board_write_authorized",
        "hidden_suite_access_authorized",
        "credential_access_authorized",
        "merge_authorized",
        "publish_authorized",
        "delivery_authorized",
        "winner_declaration_authorized",
        "raw_worker_output_persisted",
        "personal_paths_returned",
    ]
    .iter()
    .all(|key| bool_at(policy, &format!("/boundaries/{key}"), false))
}

fn validate_detection(policy: &Value) -> bool {
    bool_at(policy, "/detection/version_probe_only", true)
        && [
            "account_status_inspected",
            "quota_inspected",
            "credentials_read_by_outilsia",
            "command_path_returned",
            "network_request_by_outilsia",
        ]
        .iter()
        .all(|key| bool_at(policy, &format!("/detection/{key}"), false))
}

fn validate_codex_policy(policy: &Value) -> bool {
    policy.get("provider").and_then(Value::as_str) == Some("openai")
        && policy.get("current_state").and_then(Value::as_str) == Some("bounded_public_pilot")
        && bool_at(policy, "/execution/enabled", true)
        && exact_string_array(policy, "/execution/allowed_scopes", &[CODEX_SCOPE])
        && policy
            .pointer("/execution/benchmark_id")
            .and_then(Value::as_str)
            == Some(CODEX_BENCHMARK_ID)
        && policy
            .pointer("/execution/stack_key")
            .and_then(Value::as_str)
            == Some(CODEX_STACK_KEY)
        && exact_string_array(
            policy,
            "/execution/environments",
            &["windows_native", "linux_native", "wsl_default"],
        )
        && policy
            .pointer("/budget/max_attempts")
            .and_then(Value::as_u64)
            == Some(1)
        && policy
            .pointer("/budget/max_output_bytes")
            .and_then(Value::as_u64)
            == Some(CODEX_OUTPUT_BUDGET_BYTES)
        && policy
            .pointer("/budget/duration_options_seconds")
            .and_then(Value::as_array)
            .map(|values| values.iter().filter_map(Value::as_u64).collect::<Vec<_>>())
            == Some(CODEX_DURATION_OPTIONS_SECONDS.to_vec())
        && bool_at(policy, "/consent/required", true)
        && bool_at(policy, "/consent/scope_is_single_run", true)
        && bool_at(policy, "/consent/consent_reused_across_runs", false)
        && bool_at(policy, "/execution/hidden_holdout_enabled", false)
        && bool_at(policy, "/execution/arbitrary_project_enabled", false)
}

fn validate_detect_only_policy(policy: &Value, provider: &str) -> bool {
    policy.get("provider").and_then(Value::as_str) == Some(provider)
        && policy.get("current_state").and_then(Value::as_str) == Some("detect_only")
        && bool_at(policy, "/execution/enabled", false)
        && exact_string_array(policy, "/execution/allowed_scopes", &[])
        && exact_string_array(policy, "/execution/environments", &[])
        && policy
            .pointer("/execution/benchmark_id")
            .is_some_and(Value::is_null)
        && policy
            .pointer("/execution/stack_key")
            .is_some_and(Value::is_null)
        && policy
            .pointer("/budget/max_attempts")
            .and_then(Value::as_u64)
            == Some(0)
        && policy
            .pointer("/budget/max_output_bytes")
            .and_then(Value::as_u64)
            == Some(0)
        && exact_string_array(policy, "/budget/duration_options_seconds", &[])
        && bool_at(policy, "/consent/required", true)
        && bool_at(policy, "/consent/scope_is_single_run", true)
        && bool_at(policy, "/consent/consent_reused_across_runs", false)
        && bool_at(policy, "/execution/hidden_holdout_enabled", false)
        && bool_at(policy, "/execution/arbitrary_project_enabled", false)
        && policy
            .get("limitations")
            .and_then(Value::as_array)
            .is_some_and(|limitations| {
                limitations
                    .iter()
                    .filter_map(Value::as_str)
                    .any(|value| value == "adapter_execution_contract_missing")
            })
}

pub(crate) fn validate_agent_adapter_policy_catalog(catalog: &Value) -> Result<(), String> {
    if catalog.get("schema").and_then(Value::as_str) != Some(CATALOG_SCHEMA)
        || catalog.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || catalog.get("catalog_kind").and_then(Value::as_str) != Some("static_local_policy")
        || catalog
            .get("generated_at_ms")
            .and_then(Value::as_u64)
            .is_none()
    {
        return Err("Catalogue de politiques agents invalide.".to_string());
    }
    let policies = catalog
        .get("policies")
        .and_then(Value::as_array)
        .filter(|policies| policies.len() == 3)
        .ok_or_else(|| "Trois politiques agents exactes sont requises.".to_string())?;
    let ids = policies
        .iter()
        .filter_map(|policy| policy.get("adapter_id").and_then(Value::as_str))
        .collect::<BTreeSet<_>>();
    if ids != BTreeSet::from([CODEX_ADAPTER_ID, CLAUDE_ADAPTER_ID, HERMES_ADAPTER_ID])
        || policies.iter().any(|policy| {
            policy.get("kind").and_then(Value::as_str) != Some("official_cli")
                || !validate_detection(policy)
                || !validate_common_boundaries(policy)
                || policy
                    .pointer("/budget/vendor_cost_mode")
                    .and_then(Value::as_str)
                    != Some("unknown")
                || !bool_at(policy, "/budget/unknown_cost_converted_to_zero", false)
        })
    {
        return Err("Politique agent trop large ou trompeuse.".to_string());
    }
    let policy = |adapter_id: &str| {
        policies
            .iter()
            .find(|policy| policy.get("adapter_id").and_then(Value::as_str) == Some(adapter_id))
    };
    if !policy(CODEX_ADAPTER_ID).is_some_and(validate_codex_policy)
        || !policy(CLAUDE_ADAPTER_ID)
            .is_some_and(|value| validate_detect_only_policy(value, "anthropic"))
        || !policy(HERMES_ADAPTER_ID)
            .is_some_and(|value| validate_detect_only_policy(value, "nous-research"))
    {
        return Err("État d'exécution des adaptateurs incohérent.".to_string());
    }
    if [
        "execution_started",
        "machine_probe_started",
        "credentials_read",
        "account_status_inspected",
        "quota_or_cost_queried",
        "network_called",
        "repository_scanned",
        "repository_modified",
        "board_modified",
        "policy_is_execution_authorization",
    ]
    .iter()
    .any(|key| !bool_at(catalog, &format!("/guarantees/{key}"), false))
        || !bool_at(
            catalog,
            "/guarantees/human_approval_required_before_every_run",
            true,
        )
    {
        return Err("Garanties du catalogue agents non conformes.".to_string());
    }
    let digest = catalog
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or_else(|| "Empreinte du catalogue agents absente.".to_string())?;
    let mut unsigned = catalog.clone();
    unsigned
        .as_object_mut()
        .ok_or_else(|| "Catalogue agents invalide.".to_string())?
        .remove("integrity");
    if canonical_sha256(&unsigned) != digest {
        return Err("Empreinte du catalogue agents incohérente.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn get_agent_adapter_policy_catalog() -> Result<AgentAdapterPolicyCatalog, String> {
    let document = signed_catalog_value();
    validate_agent_adapter_policy_catalog(&document)?;
    serde_json::from_value(document)
        .map_err(|error| format!("Catalogue de politiques agents non sérialisable: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resign(document: &mut Value) {
        document
            .as_object_mut()
            .expect("catalog object")
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
    fn catalog_is_signed_and_contains_exactly_three_adapters() {
        let catalog = signed_catalog_value();
        validate_agent_adapter_policy_catalog(&catalog).expect("valid catalog");
        assert_eq!(
            catalog
                .get("policies")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(3)
        );
    }

    #[test]
    fn codex_is_the_only_bounded_execution_policy() {
        let catalog = signed_catalog_value();
        let enabled = catalog
            .get("policies")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter(|policy| bool_at(policy, "/execution/enabled", true))
            .collect::<Vec<_>>();
        assert_eq!(enabled.len(), 1);
        assert_eq!(
            enabled[0].get("adapter_id").and_then(Value::as_str),
            Some(CODEX_ADAPTER_ID)
        );
        assert_eq!(
            enabled[0]
                .pointer("/budget/duration_options_seconds")
                .and_then(Value::as_array)
                .map(|values| values.iter().filter_map(Value::as_u64).collect::<Vec<_>>()),
            Some(CODEX_DURATION_OPTIONS_SECONDS.to_vec())
        );
    }

    #[test]
    fn detect_only_adapter_cannot_be_forged_by_rehashing() {
        let mut catalog = signed_catalog_value();
        let claude = catalog
            .get_mut("policies")
            .and_then(Value::as_array_mut)
            .and_then(|policies| {
                policies.iter_mut().find(|policy| {
                    policy.get("adapter_id").and_then(Value::as_str) == Some(CLAUDE_ADAPTER_ID)
                })
            })
            .expect("claude policy");
        claude["execution"]["enabled"] = json!(true);
        claude["execution"]["allowed_scopes"] = json!(["arbitrary_project"]);
        resign(&mut catalog);
        assert!(validate_agent_adapter_policy_catalog(&catalog).is_err());
    }

    #[test]
    fn catalog_never_authorizes_repository_board_or_delivery() {
        let catalog = signed_catalog_value();
        let serialized = serde_json::to_string(&catalog).expect("serialized catalog");
        assert!(!serialized.contains("/home/"));
        assert!(!serialized.contains("C:\\Users"));
        assert!(!serialized.contains("api_key"));
        for policy in catalog
            .get("policies")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            assert!(validate_common_boundaries(policy));
        }
    }
}
