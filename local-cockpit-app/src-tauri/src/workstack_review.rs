use crate::workstack_arena::validate_workstack_arena_result;
use crate::workstack_composer::canonical_sha256;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::time::{SystemTime, UNIX_EPOCH};

const REQUEST_SCHEMA: &str = "outilsia.workstack_human_review_request.v1";
const RESULT_SCHEMA: &str = "outilsia.workstack_human_review_result.v1";
const CONTRACT_VERSION: &str = "2026-07-14";
const REVIEW_SCOPE: &str = "signed_public_receipt_only";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub(crate) struct RecordWorkstackHumanReviewRequest {
    schema: String,
    arena_result: Value,
    decision: String,
    reason_code: String,
    acknowledgements: Value,
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

fn safe_id(value: &str, prefix: &str, maximum: usize) -> bool {
    value.starts_with(prefix)
        && value.len() <= maximum
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

fn decision_contract(
    decision: &str,
    reason_code: &str,
) -> Option<(&'static str, bool, bool, bool)> {
    match (decision, reason_code) {
        ("accept_for_future_comparison", "signed_public_receipt_accepted") => {
            Some(("accepted_for_future_comparison", true, false, false))
        }
        ("request_correction", "new_public_run_requested") => {
            Some(("revision_requested", false, true, false))
        }
        ("reject_run", "signed_public_receipt_rejected") => {
            Some(("rejected_by_human", false, false, true))
        }
        _ => None,
    }
}

fn validate_acknowledgements(acknowledgements: &Value) -> Result<(), String> {
    exact_keys(
        acknowledgements,
        &[
            "receipt_metrics_reviewed",
            "limitations_reviewed",
            "no_visual_artifact_claimed",
            "no_delivery_or_winner_authorized",
        ],
        "accuses de revue humaine",
    )?;
    if acknowledgements
        .as_object()
        .into_iter()
        .flat_map(|object| object.values())
        .any(|value| value.as_bool() != Some(true))
    {
        return Err("Tous les accuses de revue humaine sont requis.".to_string());
    }
    Ok(())
}

fn sign_document(document: &mut Value) -> Result<(), String> {
    document
        .as_object_mut()
        .ok_or_else(|| "Decision de revue humaine invalide.".to_string())?
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

pub(crate) fn validate_workstack_human_review_result(result: &Value) -> Result<(), String> {
    exact_keys(
        result,
        &[
            "schema",
            "contract_version",
            "review_id",
            "recorded_at_ms",
            "source_ref",
            "review",
            "consequences",
            "security",
            "integrity",
        ],
        "resultat de revue humaine",
    )?;
    exact_keys(
        result.get("source_ref").unwrap_or(&Value::Null),
        &[
            "schema",
            "run_id",
            "arena_integrity_digest",
            "workstack_id",
            "candidate_id",
            "submission_digest",
            "static_checks_passed",
            "browser_checks_passed",
        ],
        "source de revue humaine",
    )?;
    exact_keys(
        result.get("review").unwrap_or(&Value::Null),
        &[
            "scope",
            "reviewer_role",
            "decision",
            "reason_code",
            "status",
            "receipt_metrics_reviewed",
            "limitations_reviewed",
            "artifact_visual_inspected",
            "artifact_quality_approved",
        ],
        "decision de revue humaine",
    )?;
    exact_keys(
        result.get("consequences").unwrap_or(&Value::Null),
        &[
            "comparison_eligible",
            "rerun_recommended",
            "run_rejected",
            "delivery_authorized",
            "winner_authorized",
            "board_write_authorized",
            "merge_authorized",
            "publish_authorized",
        ],
        "consequences de revue humaine",
    )?;
    exact_keys(
        result.get("security").unwrap_or(&Value::Null),
        &[
            "source_result_stored",
            "raw_cli_output_stored",
            "screenshot_stored",
            "free_text_stored",
            "execution_started",
            "credentials_read",
        ],
        "securite de revue humaine",
    )?;
    exact_keys(
        result.get("integrity").unwrap_or(&Value::Null),
        &["algorithm", "canonicalization", "scope", "digest"],
        "integrite de revue humaine",
    )?;

    let decision = result
        .pointer("/review/decision")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let reason_code = result
        .pointer("/review/reason_code")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let (expected_status, comparison_eligible, rerun_recommended, run_rejected) =
        decision_contract(decision, reason_code)
            .ok_or_else(|| "Decision de revue humaine inconnue.".to_string())?;
    let source = result.get("source_ref").unwrap_or(&Value::Null);
    let review = result.get("review").unwrap_or(&Value::Null);
    let consequences = result.get("consequences").unwrap_or(&Value::Null);
    let security = result.get("security").unwrap_or(&Value::Null);
    if result.get("schema").and_then(Value::as_str) != Some(RESULT_SCHEMA)
        || result.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || result
            .get("review_id")
            .and_then(Value::as_str)
            .is_none_or(|value| !safe_id(value, "wsr-", 80))
        || result
            .get("recorded_at_ms")
            .and_then(Value::as_u64)
            .is_none_or(|value| value == 0)
        || source.get("schema").and_then(Value::as_str)
            != Some("outilsia.workstack_arena_run_result.v1")
        || source
            .get("run_id")
            .and_then(Value::as_str)
            .is_none_or(|value| !safe_id(value, "wsa-", 80))
        || source
            .get("workstack_id")
            .and_then(Value::as_str)
            .is_none_or(|value| !safe_id(value, "ws-", 96))
        || source
            .get("candidate_id")
            .and_then(Value::as_str)
            .is_none_or(|value| !safe_id(value, "codex-cli:", 160))
        || source
            .get("arena_integrity_digest")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        || source
            .get("submission_digest")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        || source.get("static_checks_passed").and_then(Value::as_u64) != Some(7)
        || source.get("browser_checks_passed").and_then(Value::as_u64) != Some(39)
        || review.get("scope").and_then(Value::as_str) != Some(REVIEW_SCOPE)
        || review.get("reviewer_role").and_then(Value::as_str) != Some("local_human_operator")
        || review.get("status").and_then(Value::as_str) != Some(expected_status)
        || review
            .get("receipt_metrics_reviewed")
            .and_then(Value::as_bool)
            != Some(true)
        || review.get("limitations_reviewed").and_then(Value::as_bool) != Some(true)
        || review
            .get("artifact_visual_inspected")
            .and_then(Value::as_bool)
            != Some(false)
        || review
            .get("artifact_quality_approved")
            .and_then(Value::as_bool)
            != Some(false)
        || consequences
            .get("comparison_eligible")
            .and_then(Value::as_bool)
            != Some(comparison_eligible)
        || consequences
            .get("rerun_recommended")
            .and_then(Value::as_bool)
            != Some(rerun_recommended)
        || consequences.get("run_rejected").and_then(Value::as_bool) != Some(run_rejected)
        || [
            "delivery_authorized",
            "winner_authorized",
            "board_write_authorized",
            "merge_authorized",
            "publish_authorized",
        ]
        .iter()
        .any(|key| consequences.get(*key).and_then(Value::as_bool) != Some(false))
        || [
            "source_result_stored",
            "raw_cli_output_stored",
            "screenshot_stored",
            "free_text_stored",
            "execution_started",
            "credentials_read",
        ]
        .iter()
        .any(|key| security.get(*key).and_then(Value::as_bool) != Some(false))
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
        return Err("Resultat de revue humaine non conforme.".to_string());
    }
    let expected_digest = result
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .filter(|value| is_sha256(value))
        .ok_or_else(|| "Empreinte de revue humaine absente.".to_string())?;
    let mut unsigned = result.clone();
    unsigned
        .as_object_mut()
        .ok_or_else(|| "Resultat de revue humaine invalide.".to_string())?
        .remove("integrity");
    if canonical_sha256(&unsigned) != expected_digest {
        return Err("Empreinte de revue humaine incoherente.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn record_workstack_human_review(
    request: RecordWorkstackHumanReviewRequest,
) -> Result<Value, String> {
    if request.schema != REQUEST_SCHEMA {
        return Err("Contrat de revue humaine invalide.".to_string());
    }
    validate_workstack_arena_result(&request.arena_result)?;
    validate_acknowledgements(&request.acknowledgements)?;
    let (status, comparison_eligible, rerun_recommended, run_rejected) =
        decision_contract(request.decision.trim(), request.reason_code.trim())
            .ok_or_else(|| "Decision de revue humaine inconnue.".to_string())?;
    let arena_digest = request
        .arena_result
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .ok_or_else(|| "Empreinte Workstack Arena absente.".to_string())?;
    let recorded_at_ms = unix_ms();
    let review_seed = json!({
        "arena_integrity_digest": arena_digest,
        "decision": request.decision,
        "reason_code": request.reason_code,
        "recorded_at_ms": recorded_at_ms
    });
    let mut result = json!({
        "schema": RESULT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "review_id": format!("wsr-{}", &canonical_sha256(&review_seed)[..24]),
        "recorded_at_ms": recorded_at_ms,
        "source_ref": {
            "schema": request.arena_result.get("schema").cloned().unwrap_or(Value::Null),
            "run_id": request.arena_result.get("run_id").cloned().unwrap_or(Value::Null),
            "arena_integrity_digest": arena_digest,
            "workstack_id": request.arena_result.pointer("/workstack_ref/workstack_id").cloned().unwrap_or(Value::Null),
            "candidate_id": request.arena_result.pointer("/candidate/id").cloned().unwrap_or(Value::Null),
            "submission_digest": request.arena_result.pointer("/submission/digest").cloned().unwrap_or(Value::Null),
            "static_checks_passed": request.arena_result.pointer("/evaluator/visible_checks_passed").cloned().unwrap_or(Value::Null),
            "browser_checks_passed": request.arena_result.pointer("/browser_evaluator/checks_passed").cloned().unwrap_or(Value::Null)
        },
        "review": {
            "scope": REVIEW_SCOPE,
            "reviewer_role": "local_human_operator",
            "decision": request.decision,
            "reason_code": request.reason_code,
            "status": status,
            "receipt_metrics_reviewed": true,
            "limitations_reviewed": true,
            "artifact_visual_inspected": false,
            "artifact_quality_approved": false
        },
        "consequences": {
            "comparison_eligible": comparison_eligible,
            "rerun_recommended": rerun_recommended,
            "run_rejected": run_rejected,
            "delivery_authorized": false,
            "winner_authorized": false,
            "board_write_authorized": false,
            "merge_authorized": false,
            "publish_authorized": false
        },
        "security": {
            "source_result_stored": false,
            "raw_cli_output_stored": false,
            "screenshot_stored": false,
            "free_text_stored": false,
            "execution_started": false,
            "credentials_read": false
        }
    });
    sign_document(&mut result)?;
    validate_workstack_human_review_result(&result)?;
    Ok(result)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn acknowledgements() -> Value {
        json!({
            "receipt_metrics_reviewed": true,
            "limitations_reviewed": true,
            "no_visual_artifact_claimed": true,
            "no_delivery_or_winner_authorized": true
        })
    }

    pub(crate) fn signed_review() -> Value {
        record_workstack_human_review(RecordWorkstackHumanReviewRequest {
            schema: REQUEST_SCHEMA.to_string(),
            arena_result: crate::workstack_arena::tests::signed_result(),
            decision: "accept_for_future_comparison".to_string(),
            reason_code: "signed_public_receipt_accepted".to_string(),
            acknowledgements: acknowledgements(),
        })
        .expect("signed human review")
    }

    #[test]
    fn accepts_only_a_signed_public_receipt_and_keeps_delivery_blocked() {
        let result = signed_review();
        validate_workstack_human_review_result(&result).expect("valid human review");
        assert_eq!(result["consequences"]["comparison_eligible"], true);
        assert_eq!(result["review"]["artifact_visual_inspected"], false);
        assert_eq!(result["review"]["artifact_quality_approved"], false);
        assert_eq!(result["consequences"]["delivery_authorized"], false);
        assert_eq!(result["consequences"]["winner_authorized"], false);
    }

    #[test]
    fn correction_and_rejection_never_become_delivery_approval() {
        for (decision, reason_code, expected_status) in [
            (
                "request_correction",
                "new_public_run_requested",
                "revision_requested",
            ),
            (
                "reject_run",
                "signed_public_receipt_rejected",
                "rejected_by_human",
            ),
        ] {
            let result = record_workstack_human_review(RecordWorkstackHumanReviewRequest {
                schema: REQUEST_SCHEMA.to_string(),
                arena_result: crate::workstack_arena::tests::signed_result(),
                decision: decision.to_string(),
                reason_code: reason_code.to_string(),
                acknowledgements: acknowledgements(),
            })
            .expect("bounded review decision");
            assert_eq!(result["review"]["status"], expected_status);
            assert_eq!(result["consequences"]["comparison_eligible"], false);
            assert_eq!(result["consequences"]["delivery_authorized"], false);
            assert_eq!(result["consequences"]["winner_authorized"], false);
        }
    }

    #[test]
    fn refuses_missing_acknowledgement_unknown_reason_and_tampering() {
        let mut missing = acknowledgements();
        missing["limitations_reviewed"] = json!(false);
        assert!(
            record_workstack_human_review(RecordWorkstackHumanReviewRequest {
                schema: REQUEST_SCHEMA.to_string(),
                arena_result: crate::workstack_arena::tests::signed_result(),
                decision: "accept_for_future_comparison".to_string(),
                reason_code: "signed_public_receipt_accepted".to_string(),
                acknowledgements: missing,
            })
            .is_err()
        );
        assert!(
            record_workstack_human_review(RecordWorkstackHumanReviewRequest {
                schema: REQUEST_SCHEMA.to_string(),
                arena_result: crate::workstack_arena::tests::signed_result(),
                decision: "accept_for_future_comparison".to_string(),
                reason_code: "deliver_now".to_string(),
                acknowledgements: acknowledgements(),
            })
            .is_err()
        );
        let mut tampered = signed_review();
        tampered["consequences"]["delivery_authorized"] = json!(true);
        sign_document(&mut tampered).expect("resigned tampered review");
        assert!(validate_workstack_human_review_result(&tampered).is_err());
    }
}
