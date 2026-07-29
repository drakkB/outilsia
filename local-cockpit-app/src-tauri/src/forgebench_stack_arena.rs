use crate::forgebench_browser::{
    evaluate_visible_browser, preflight_visible_browser, validate_visible_browser_evidence,
};
use crate::forgebench_candidate::{marker_values, validate_submission, EVALUATOR_SCRIPT};
use crate::forgebench_hidden::{evaluate_hidden_browser, validate_hidden_browser_evidence_claim};
use crate::forgebench_runner::isolated_command;
use crate::forgebench_vault::{
    hidden_suite_material, hidden_suite_receipt, validate_hidden_suite_receipt,
};
use crate::workstack_composer::canonical_sha256;
use crate::{command_output_with_timeout, decode_command_stdout};
use getrandom::fill;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const COMPILE_REQUEST_SCHEMA: &str = "outilsia.forgebench_stack_plan_compile_request.v1";
const PLAN_SCHEMA: &str = "outilsia.forgebench_stack_plan.v1";
const EXPORT_REQUEST_SCHEMA: &str = "outilsia.forgebench_stack_starter_export_request.v1";
const EXPORT_RESULT_SCHEMA: &str = "outilsia.forgebench_stack_starter_export_result.v1";
const EVALUATE_REQUEST_SCHEMA: &str = "outilsia.forgebench_stack_run_request.v1";
const RUN_RESULT_SCHEMA: &str = "outilsia.forgebench_stack_run_result.v1";
const SCOREBOARD_REQUEST_SCHEMA: &str = "outilsia.forgebench_stack_scoreboard_request.v1";
const SCOREBOARD_RESULT_SCHEMA: &str = "outilsia.forgebench_stack_scoreboard.v1";
const CONTRACT_VERSION: &str = "2026-07-29";
const BENCHMARK_ID: &str = "signal-maze-v1";
const CONSENT_SCOPE: &str = "guided_stack_artifact_import_v1";
const RUN_ROOT: &str = "forgebench-guided-stack-runs-v1";
const RUN_CONTRACT_FILE: &str = ".outilsia-run-contract.json";
const STATIC_EVALUATOR_MARKER: &str = "forgebench-ollama-static-evaluator-ok";
const STATIC_EVALUATOR_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_LABEL_CHARS: usize = 96;
const MAX_IDENTITY_CHARS: usize = 160;
const MAX_VERSION_CHARS: usize = 96;
const MAX_STAGES: usize = 5;
const MAX_RUNS: usize = 100;
const MAX_RUN_DURATION_MS: u64 = 8 * 60 * 60 * 1_000;
const MIN_RUN_DURATION_MS: u64 = 1_000;
const STARTER_BUNDLE_SHA256: &str =
    "4d88bea3831044755d3d504fb6cd9a470647f8734d4a67265c2b3c3621f06e53";
const STARTER_FILES: [(&str, &str, &str); 3] = [
    (
        "index.html",
        include_str!("../../forgebench/signal-maze-v1/starter/index.html"),
        "a7db8d231f042a215f0081f53c4868021540d0e4cd38a8798287800de7f5ec26",
    ),
    (
        "styles.css",
        include_str!("../../forgebench/signal-maze-v1/starter/styles.css"),
        "4bd5c943830754a6ad38f006ed0c2b39abc66936f4ca245bc560822e3602e57a",
    ),
    (
        "game.js",
        include_str!("../../forgebench/signal-maze-v1/starter/game.js"),
        "f465727840cab52a6a6d4ca80072d037819b007ccac942fbdcb805fd3cb77f17",
    ),
];
const BENCHMARK_SPEC: &str = include_str!("../../forgebench/signal-maze-v1.json");
const VISIBLE_CONTRACT: &str =
    include_str!("../../forgebench/signal-maze-v1/visible-contract.json");

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct StackStageInput {
    role: String,
    provider: String,
    identity: String,
    version: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct StackCostProfileInput {
    monthly_subscription_eur: Option<f64>,
    local_hardware_amortization_eur_per_run: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct CompileForgeBenchStackPlanRequest {
    schema: String,
    label: String,
    target_runs: u64,
    stages: Vec<StackStageInput>,
    cost_profile: StackCostProfileInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ExportForgeBenchStackStarterRequest {
    schema: String,
    stack_plan: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct TimingObservation {
    started_at_ms: u64,
    ended_at_ms: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct AutonomyObservation {
    semantic_interventions: u64,
    manual_edits: u64,
    permission_clicks: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct CostObservation {
    quota_unit: String,
    quota_before: Option<f64>,
    quota_after: Option<f64>,
    api_overage_eur: Option<f64>,
    local_energy_wh: Option<f64>,
    electricity_eur_per_kwh: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct EvaluateForgeBenchStackArtifactRequest {
    schema: String,
    stack_plan: Value,
    timing: TimingObservation,
    autonomy: AutonomyObservation,
    cost_observation: CostObservation,
    consent: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct CompileForgeBenchStackScoreboardRequest {
    schema: String,
    runs: Vec<Value>,
}

fn arena_lock() -> &'static Mutex<()> {
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

fn sign_document(document: &mut Value) -> Result<(), String> {
    document
        .as_object_mut()
        .ok_or_else(|| "Document ForgeBench Stack Arena invalide.".to_string())?
        .remove("integrity");
    let digest = canonical_sha256(document);
    document["integrity"] = json!({
        "algorithm": "SHA-256",
        "canonicalization": "recursive-key-sort-json-v1",
        "scope": "canonical_document_without_integrity",
        "digest": digest,
        "kind": "integrity_digest_not_signature",
        "provenance_authenticated": false
    });
    Ok(())
}

fn verify_integrity(document: &Value, label: &str) -> Result<String, String> {
    let digest = document
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .filter(|value| is_sha256(value))
        .ok_or_else(|| format!("Empreinte {label} absente."))?;
    if document.pointer("/integrity/kind").and_then(Value::as_str)
        != Some("integrity_digest_not_signature")
        || document
            .pointer("/integrity/provenance_authenticated")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err(format!(
            "Le controle d'integrite {label} ne doit pas etre presente comme une signature."
        ));
    }
    let mut unsigned = document.clone();
    unsigned
        .as_object_mut()
        .ok_or_else(|| format!("Document {label} invalide."))?
        .remove("integrity");
    if canonical_sha256(&unsigned) != digest {
        return Err(format!("Empreinte {label} incoherente."));
    }
    Ok(digest.to_string())
}

fn safe_text(value: &str, min: usize, max: usize, label: &str) -> Result<String, String> {
    let value = value.trim();
    let length = value.chars().count();
    if !(min..=max).contains(&length)
        || value
            .chars()
            .any(|character| character.is_control() || matches!(character, '<' | '>'))
    {
        return Err(format!("{label} invalide."));
    }
    Ok(value.to_string())
}

fn safe_money(value: Option<f64>, max: f64, label: &str) -> Result<Option<f64>, String> {
    match value {
        Some(value) if value.is_finite() && (0.0..=max).contains(&value) => {
            Ok(Some((value * 10_000.0).round() / 10_000.0))
        }
        Some(_) => Err(format!("{label} invalide.")),
        None => Ok(None),
    }
}

fn allowed_role(value: &str) -> bool {
    matches!(
        value,
        "planner" | "builder" | "reviewer" | "repairer" | "final_verifier"
    )
}

fn allowed_provider(value: &str) -> bool {
    matches!(
        value,
        "ollama_local"
            | "openai_codex"
            | "anthropic_claude"
            | "moonshot_kimi"
            | "xai_grok"
            | "zai_glm"
            | "google_gemini"
            | "other_official"
    )
}

fn normalized_stages(stages: &[StackStageInput]) -> Result<Vec<Value>, String> {
    if stages.is_empty() || stages.len() > MAX_STAGES {
        return Err("Une stack guidee doit contenir entre 1 et 5 etapes.".to_string());
    }
    let role_rank = |role: &str| match role {
        "planner" => 0,
        "builder" => 1,
        "reviewer" => 2,
        "repairer" => 3,
        "final_verifier" => 4,
        _ => 99,
    };
    let mut previous_rank = 0;
    let mut seen_roles = BTreeSet::new();
    let mut normalized = Vec::with_capacity(stages.len());
    for (index, stage) in stages.iter().enumerate() {
        let role = stage.role.trim();
        let provider = stage.provider.trim();
        if !allowed_role(role) || !allowed_provider(provider) || !seen_roles.insert(role) {
            return Err("Roles ou fournisseurs de la stack guides invalides.".to_string());
        }
        let rank = role_rank(role);
        if index > 0 && rank <= previous_rank {
            return Err("Les etapes de la stack ne respectent pas l'ordre de travail.".to_string());
        }
        previous_rank = rank;
        normalized.push(json!({
            "ordinal": index + 1,
            "role": role,
            "provider": provider,
            "identity": safe_text(&stage.identity, 2, MAX_IDENTITY_CHARS, "Identite du worker")?,
            "version": safe_text(&stage.version, 1, MAX_VERSION_CHARS, "Version du worker")?,
            "execution_by_outilsia": false
        }));
    }
    if !seen_roles.contains("builder") {
        return Err("La stack guidee doit contenir un builder.".to_string());
    }
    Ok(normalized)
}

fn derived_lane(stages: &[Value]) -> &'static str {
    let local = stages
        .iter()
        .filter(|stage| stage.get("provider").and_then(Value::as_str) == Some("ollama_local"))
        .count();
    if local == stages.len() {
        "local"
    } else if local == 0 {
        "subscription"
    } else {
        "hybrid"
    }
}

fn public_brief_markdown(label: &str, stages: &[Value], target_runs: u64) -> String {
    let stage_lines = stages
        .iter()
        .map(|stage| {
            format!(
                "{}. {} - {} {} ({})",
                stage
                    .get("ordinal")
                    .and_then(Value::as_u64)
                    .unwrap_or_default(),
                stage.get("role").and_then(Value::as_str).unwrap_or("etape"),
                stage
                    .get("identity")
                    .and_then(Value::as_str)
                    .unwrap_or("worker"),
                stage
                    .get("version")
                    .and_then(Value::as_str)
                    .unwrap_or("version inconnue"),
                stage
                    .get("provider")
                    .and_then(Value::as_str)
                    .unwrap_or("provider")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "# ForgeBench Arcade - {label}\n\n\
Challenge: Signal Maze v1.\n\n\
Objectif: terminer le mini-jeu web deterministe fourni dans `workspace/`.\n\
Le resultat final doit conserver exactement `index.html`, `styles.css` et `game.js`, rester hors ligne, \
fonctionner au clavier, a la souris et au tactile, et respecter l'API visible versionnee.\n\n\
## Arrangement scelle\n{stage_lines}\n\n\
## Regles du ring\n\
- Utiliser chaque outil dans son environnement officiel, avec le compte de l'utilisateur.\n\
- Ne pas modifier le challenge, les tests, les seeds ou les permissions.\n\
- Chaque relais transmet uniquement l'artefact et le handoff prevus.\n\
- Compter toute correction semantique ou edition manuelle.\n\
- OutilsIA n'automatise aucun abonnement et n'inspecte aucun jeton.\n\
- Objectif arcade: {target_runs} runs independants avec le meme brief.\n\n\
Une fois le dernier relais termine, selectionner uniquement le dossier contenant les trois fichiers finaux dans OutilsIA."
    )
}

fn stage_card(stage: &Value, label: &str) -> Value {
    let role = stage
        .get("role")
        .and_then(Value::as_str)
        .unwrap_or("builder");
    let instruction = match role {
        "planner" => "Produire un plan de construction borne et un handoff vers le builder. Ne pas modifier les tests.",
        "builder" => "Construire ou completer les trois fichiers du mini-jeu a partir du brief et du handoff precedent.",
        "reviewer" => "Auditer le resultat contre le brief public. Rendre une liste de corrections bornees, sans changer les regles.",
        "repairer" => "Appliquer uniquement les corrections du reviewer dans les trois fichiers autorises.",
        "final_verifier" => "Verifier le resultat final contre le brief public et signaler tout ecart restant.",
        _ => "Executer l'etape declaree sans modifier le challenge.",
    };
    json!({
        "ordinal": stage.get("ordinal").cloned().unwrap_or(Value::Null),
        "role": role,
        "provider": stage.get("provider").cloned().unwrap_or(Value::Null),
        "identity": stage.get("identity").cloned().unwrap_or(Value::Null),
        "version": stage.get("version").cloned().unwrap_or(Value::Null),
        "arrangement_label": label,
        "instruction": instruction,
        "input_scope": if role == "planner" { "sealed_public_brief" } else { "previous_handoff_and_workspace" },
        "output_scope": if role == "final_verifier" { "bounded_final_review" } else { "workspace_or_bounded_handoff" },
        "hidden_suite_access": false,
        "automatic_execution": false
    })
}

fn benchmark_identity() -> Result<Value, String> {
    let spec = serde_json::from_str::<Value>(BENCHMARK_SPEC)
        .map_err(|_| "Contrat Signal Maze illisible.".to_string())?;
    let visible = serde_json::from_str::<Value>(VISIBLE_CONTRACT)
        .map_err(|_| "Contrat visible Signal Maze illisible.".to_string())?;
    Ok(json!({
        "id": BENCHMARK_ID,
        "version": spec.get("version").cloned().unwrap_or(Value::Null),
        "spec_sha256": canonical_sha256(&spec),
        "visible_contract_version": visible.get("contract_version").cloned().unwrap_or(Value::Null),
        "visible_contract_sha256": canonical_sha256(&visible),
        "starter_bundle_sha256": starter_bundle_digest()?,
        "track": "guided_multi_ai_arrangement"
    }))
}

fn compile_plan(
    request: &CompileForgeBenchStackPlanRequest,
    hidden_receipt: Option<&Value>,
) -> Result<Value, String> {
    if request.schema != COMPILE_REQUEST_SCHEMA || !matches!(request.target_runs, 3 | 5) {
        return Err("Contrat de stack guidee invalide.".to_string());
    }
    let label = safe_text(&request.label, 2, MAX_LABEL_CHARS, "Nom de la stack")?;
    let stages = normalized_stages(&request.stages)?;
    let lane = derived_lane(&stages);
    let monthly_subscription_eur = safe_money(
        request.cost_profile.monthly_subscription_eur,
        10_000.0,
        "Engagement mensuel",
    )?;
    let hardware_amortization = safe_money(
        request.cost_profile.local_hardware_amortization_eur_per_run,
        10_000.0,
        "Amortissement materiel",
    )?;
    if lane == "local" && monthly_subscription_eur.is_some_and(|value| value != 0.0) {
        return Err(
            "Une stack entierement locale ne doit pas declarer d'abonnement IA.".to_string(),
        );
    }
    if let Some(receipt) = hidden_receipt {
        validate_hidden_suite_receipt(receipt)?;
    }
    let benchmark = benchmark_identity()?;
    let plan_seed = json!({
        "label": label,
        "stages": stages,
        "benchmark": benchmark,
        "target_runs": request.target_runs
    });
    let plan_id = format!("fbsa-{}", &canonical_sha256(&plan_seed)[..24]);
    let brief = public_brief_markdown(&label, &stages, request.target_runs);
    let cards = stages
        .iter()
        .map(|stage| stage_card(stage, &label))
        .collect::<Vec<_>>();
    let hidden_suite = hidden_receipt.map_or_else(
        || {
            json!({
                "status": "not_sealed",
                "suite_id": null,
                "suite_digest": null,
                "receipt_digest": null,
                "hidden_seeds_total": 0,
                "private_checks_total": 0
            })
        },
        |receipt| {
            json!({
                "status": "locally_sealed",
                "suite_id": receipt.get("suite_id").cloned().unwrap_or(Value::Null),
                "suite_digest": receipt.get("suite_digest").cloned().unwrap_or(Value::Null),
                "receipt_digest": receipt.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
                "hidden_seeds_total": receipt.get("hidden_seeds_total").cloned().unwrap_or(json!(0)),
                "private_checks_total": receipt.get("private_checks_total").cloned().unwrap_or(json!(0))
            })
        },
    );
    let mut plan = json!({
        "schema": PLAN_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "plan_id": plan_id,
        "created_at_ms": unix_ms(),
        "benchmark": benchmark,
        "arrangement": {
            "label": label,
            "lane": lane,
            "stages": stages
        },
        "run_policy": {
            "target_runs": request.target_runs,
            "tier": if request.target_runs == 5 { "monthly_compass" } else { "arcade" },
            "same_sealed_task": true,
            "native_tool_usage": true,
            "role_specific_handoffs": true,
            "exact_versions_required": true,
            "unlogged_human_help_invalidates_autonomy_claim": true
        },
        "cost_profile": {
            "currency": "EUR",
            "monthly_subscription_eur": monthly_subscription_eur,
            "local_hardware_amortization_eur_per_run": hardware_amortization,
            "monthly_price_is_not_run_cost": true,
            "unknown_cost_is_zero": false
        },
        "hidden_suite_ref": hidden_suite,
        "handoff": {
            "brief_markdown": brief,
            "brief_sha256": sha256_bytes(brief.as_bytes()),
            "stage_cards": cards,
            "raw_private_context_included": false
        },
        "readiness": {
            "starter_export_ready": true,
            "artifact_evaluation_ready": hidden_receipt.is_some(),
            "blockers": if hidden_receipt.is_some() { json!([]) } else { json!(["hidden_suite_not_sealed"]) }
        },
        "security": {
            "subscription_tool_started": false,
            "local_model_started": false,
            "network_called": false,
            "credential_read": false,
            "project_read": false,
            "hidden_suite_contents_returned": false,
            "winner_declared": false
        }
    });
    sign_document(&mut plan)?;
    validate_stack_plan(&plan)?;
    Ok(plan)
}

pub(crate) fn validate_stack_plan(plan: &Value) -> Result<(), String> {
    let expected_benchmark = benchmark_identity()?;
    let expected_spec_sha256 = expected_benchmark
        .get("spec_sha256")
        .and_then(Value::as_str)
        .ok_or_else(|| "Empreinte du benchmark embarque absente.".to_string())?;
    if plan.get("schema").and_then(Value::as_str) != Some(PLAN_SCHEMA)
        || plan.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || plan
            .get("plan_id")
            .and_then(Value::as_str)
            .is_none_or(|value| {
                !value.starts_with("fbsa-")
                    || value.len() != 29
                    || !value
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
            })
        || plan.pointer("/benchmark/id").and_then(Value::as_str) != Some(BENCHMARK_ID)
        || plan
            .pointer("/benchmark/spec_sha256")
            .and_then(Value::as_str)
            != Some(expected_spec_sha256)
        || !matches!(
            plan.pointer("/arrangement/lane").and_then(Value::as_str),
            Some("local" | "hybrid" | "subscription")
        )
        || !matches!(
            plan.pointer("/run_policy/target_runs")
                .and_then(Value::as_u64),
            Some(3 | 5)
        )
        || plan
            .pointer("/cost_profile/monthly_price_is_not_run_cost")
            .and_then(Value::as_bool)
            != Some(true)
        || plan
            .pointer("/cost_profile/unknown_cost_is_zero")
            .and_then(Value::as_bool)
            != Some(false)
        || plan
            .pointer("/security/subscription_tool_started")
            .and_then(Value::as_bool)
            != Some(false)
        || plan
            .pointer("/security/local_model_started")
            .and_then(Value::as_bool)
            != Some(false)
        || plan
            .pointer("/security/credential_read")
            .and_then(Value::as_bool)
            != Some(false)
        || plan
            .pointer("/security/winner_declared")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Plan ForgeBench Stack Arena trompeur.".to_string());
    }
    let label = plan
        .pointer("/arrangement/label")
        .and_then(Value::as_str)
        .ok_or_else(|| "Nom de stack absent.".to_string())?;
    safe_text(label, 2, MAX_LABEL_CHARS, "Nom de la stack")?;
    let stages = plan
        .pointer("/arrangement/stages")
        .and_then(Value::as_array)
        .ok_or_else(|| "Etapes de stack absentes.".to_string())?;
    if stages.is_empty() || stages.len() > MAX_STAGES {
        return Err("Nombre d'etapes de stack invalide.".to_string());
    }
    let mut inputs = Vec::with_capacity(stages.len());
    for stage in stages {
        inputs.push(StackStageInput {
            role: stage
                .get("role")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            provider: stage
                .get("provider")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            identity: stage
                .get("identity")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            version: stage
                .get("version")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        });
    }
    let normalized = normalized_stages(&inputs)?;
    if derived_lane(&normalized)
        != plan
            .pointer("/arrangement/lane")
            .and_then(Value::as_str)
            .unwrap_or_default()
    {
        return Err("Lane de stack incoherente.".to_string());
    }
    let brief = plan
        .pointer("/handoff/brief_markdown")
        .and_then(Value::as_str)
        .filter(|value| value.len() <= 32 * 1024)
        .ok_or_else(|| "Brief de stack absent ou trop grand.".to_string())?;
    let brief_sha256 = sha256_bytes(brief.as_bytes());
    if plan
        .pointer("/handoff/brief_sha256")
        .and_then(Value::as_str)
        != Some(brief_sha256.as_str())
        || plan
            .pointer("/handoff/stage_cards")
            .and_then(Value::as_array)
            .map_or(0, Vec::len)
            != stages.len()
    {
        return Err("Handoff de stack incoherent.".to_string());
    }
    let hidden_status = plan
        .pointer("/hidden_suite_ref/status")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match hidden_status {
        "not_sealed" => {
            if plan
                .pointer("/readiness/artifact_evaluation_ready")
                .and_then(Value::as_bool)
                != Some(false)
            {
                return Err("Plan sans holdout presente comme evaluable.".to_string());
            }
        }
        "locally_sealed" => {
            for pointer in [
                "/hidden_suite_ref/suite_digest",
                "/hidden_suite_ref/receipt_digest",
            ] {
                if !plan
                    .pointer(pointer)
                    .and_then(Value::as_str)
                    .is_some_and(is_sha256)
                {
                    return Err("Reference holdout de stack invalide.".to_string());
                }
            }
            if plan
                .pointer("/readiness/artifact_evaluation_ready")
                .and_then(Value::as_bool)
                != Some(true)
            {
                return Err("Plan scelle non evaluable.".to_string());
            }
        }
        _ => return Err("Statut holdout de stack invalide.".to_string()),
    }
    verify_integrity(plan, "du plan Stack Arena")?;
    Ok(())
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|_| "Permissions du dossier ForgeBench impossibles.".to_string())?;
    Ok(())
}

#[cfg(not(unix))]
fn set_private_directory_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn create_private_directory(path: &Path) -> Result<(), String> {
    fs::create_dir(path)
        .map_err(|_| "Creation du dossier prive ForgeBench impossible.".to_string())?;
    set_private_directory_permissions(path)
}

fn run_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "Dossier local OutilsIA indisponible.".to_string())?
        .join(RUN_ROOT);
    if !root.exists() {
        create_private_directory(&root)?;
    }
    Ok(root)
}

async fn pick_folder(app: &AppHandle, title: &str) -> Result<Option<PathBuf>, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Fenetre native OutilsIA indisponible.".to_string())?;
    let title = title.to_string();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        window
            .dialog()
            .file()
            .set_title(title)
            .set_parent(&window)
            .blocking_pick_folder()
    })
    .await
    .map_err(|_| "Dialogue de selection interrompu.".to_string())?;
    selected
        .map(|path| {
            path.into_path()
                .map_err(|_| "Dossier selectionne illisible.".to_string())
        })
        .transpose()
}

fn write_new_file(path: &Path, content: &[u8]) -> Result<(), String> {
    if path.exists() {
        return Err("Le kit ForgeBench existe deja; choisis un autre dossier.".to_string());
    }
    fs::write(path, content).map_err(|_| "Ecriture du kit ForgeBench impossible.".to_string())
}

fn starter_bundle_digest() -> Result<String, String> {
    let mut lines = Vec::with_capacity(STARTER_FILES.len());
    for (name, content, expected_digest) in STARTER_FILES {
        let digest = sha256_bytes(content.as_bytes());
        if digest != expected_digest {
            return Err(format!("Starter ForgeBench embarque altere: {name}."));
        }
        lines.push(format!("starter/{name}:{digest}"));
    }
    lines.sort();
    let bundle = sha256_bytes(format!("{}\n", lines.join("\n")).as_bytes());
    if bundle != STARTER_BUNDLE_SHA256 {
        return Err("Empreinte du bundle ForgeBench embarque incoherente.".to_string());
    }
    Ok(bundle)
}

fn export_starter_to_parent(plan: &Value, parent: &Path) -> Result<Value, String> {
    validate_stack_plan(plan)?;
    let plan_id = plan
        .get("plan_id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Identifiant de plan absent.".to_string())?;
    let folder_name = format!("OutilsIA-ForgeBench-{plan_id}");
    let target = parent.join(&folder_name);
    if target.exists() {
        return Err("Ce kit ForgeBench existe deja dans le dossier choisi.".to_string());
    }
    create_private_directory(&target)?;
    let export = (|| {
        let workspace = target.join("workspace");
        let handoffs = target.join("handoffs");
        create_private_directory(&workspace)?;
        create_private_directory(&handoffs)?;
        for (name, content, _) in STARTER_FILES {
            write_new_file(&workspace.join(name), content.as_bytes())?;
        }
        let brief = plan
            .pointer("/handoff/brief_markdown")
            .and_then(Value::as_str)
            .ok_or_else(|| "Brief ForgeBench absent.".to_string())?;
        write_new_file(&target.join("BRIEF.md"), brief.as_bytes())?;
        let plan_json = serde_json::to_vec_pretty(plan)
            .map_err(|_| "Plan ForgeBench non serialisable.".to_string())?;
        write_new_file(&target.join("ARRANGEMENT.json"), &plan_json)?;
        for card in plan
            .pointer("/handoff/stage_cards")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let ordinal = card
                .get("ordinal")
                .and_then(Value::as_u64)
                .unwrap_or_default();
            let role = card.get("role").and_then(Value::as_str).unwrap_or("etape");
            let markdown = format!(
                "# Etape {ordinal} - {role}\n\n\
Worker: {} {}\nProvider: {}\n\n{}\n\n\
Entree: {}\nSortie: {}\n\n\
Ne pas lire la suite cachee, les credentials ou un autre projet. Ne pas modifier les regles du challenge.\n",
                card.get("identity").and_then(Value::as_str).unwrap_or("inconnu"),
                card.get("version").and_then(Value::as_str).unwrap_or("version inconnue"),
                card.get("provider").and_then(Value::as_str).unwrap_or("inconnu"),
                card.get("instruction").and_then(Value::as_str).unwrap_or(""),
                card.get("input_scope").and_then(Value::as_str).unwrap_or(""),
                card.get("output_scope").and_then(Value::as_str).unwrap_or("")
            );
            write_new_file(
                &handoffs.join(format!("{ordinal:02}-{role}.md")),
                markdown.as_bytes(),
            )?;
        }
        Ok::<(), String>(())
    })();
    if let Err(error) = export {
        let _ = fs::remove_dir_all(&target);
        return Err(error);
    }
    let mut result = json!({
        "schema": EXPORT_RESULT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "exported_at_ms": unix_ms(),
        "plan_ref": {
            "plan_id": plan_id,
            "plan_digest": plan.pointer("/integrity/digest").cloned().unwrap_or(Value::Null)
        },
        "folder_name": folder_name,
        "workspace_files_total": 3,
        "starter_bundle_sha256": starter_bundle_digest()?,
        "handoffs_total": plan.pointer("/handoff/stage_cards").and_then(Value::as_array).map_or(0, Vec::len),
        "paths_returned": false,
        "credentials_included": false,
        "hidden_suite_included": false,
        "execution_started": false
    });
    sign_document(&mut result)?;
    Ok(result)
}

fn copy_selected_artifact(source: &Path, workspace: &Path) -> Result<(), String> {
    let expected = STARTER_FILES
        .iter()
        .map(|(name, _, _)| (*name).to_string())
        .collect::<BTreeSet<_>>();
    let mut actual = BTreeSet::new();
    for entry in fs::read_dir(source).map_err(|_| "Dossier final illisible.".to_string())? {
        let entry = entry.map_err(|_| "Entree du dossier final illisible.".to_string())?;
        let kind = entry
            .file_type()
            .map_err(|_| "Type de fichier final illisible.".to_string())?;
        if !kind.is_file() || kind.is_symlink() {
            return Err(
                "Le dossier final doit contenir uniquement trois fichiers ordinaires.".to_string(),
            );
        }
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| "Nom de fichier final non UTF-8.".to_string())?;
        actual.insert(name);
    }
    if actual != expected {
        return Err(
            "Selectionne un dossier contenant exactement index.html, styles.css et game.js."
                .to_string(),
        );
    }
    for name in expected {
        let bytes = fs::read(source.join(&name))
            .map_err(|_| "Lecture d'un fichier final impossible.".to_string())?;
        fs::write(workspace.join(name), bytes)
            .map_err(|_| "Copie privee du fichier final impossible.".to_string())?;
    }
    Ok(())
}

fn validate_timing(timing: &TimingObservation) -> Result<u64, String> {
    let elapsed = timing
        .ended_at_ms
        .checked_sub(timing.started_at_ms)
        .filter(|value| (MIN_RUN_DURATION_MS..=MAX_RUN_DURATION_MS).contains(value))
        .ok_or_else(|| "Chronometre ForgeBench invalide.".to_string())?;
    Ok(elapsed)
}

fn validate_autonomy(observation: &AutonomyObservation) -> Result<(), String> {
    if observation.semantic_interventions > 100
        || observation.manual_edits > 100
        || observation.permission_clicks > 1_000
    {
        return Err("Compteurs d'autonomie invalides.".to_string());
    }
    Ok(())
}

fn validate_cost_observation(observation: &CostObservation) -> Result<Value, String> {
    if !matches!(
        observation.quota_unit.as_str(),
        "unknown" | "percent" | "credits" | "messages" | "minutes" | "requests"
    ) {
        return Err("Unite de quota invalide.".to_string());
    }
    let bounded = |value: Option<f64>, max: f64| {
        value.filter(|value| value.is_finite() && (0.0..=max).contains(value))
    };
    let before = bounded(observation.quota_before, 1_000_000_000.0);
    let after = bounded(observation.quota_after, 1_000_000_000.0);
    if observation.quota_before.is_some() != before.is_some()
        || observation.quota_after.is_some() != after.is_some()
        || before.is_some() != after.is_some()
        || (observation.quota_unit == "unknown" && before.is_some())
        || before
            .zip(after)
            .is_some_and(|(before, after)| after > before)
    {
        return Err("Observation de quota incoherente.".to_string());
    }
    let api = safe_money(observation.api_overage_eur, 10_000.0, "Depassement API")?;
    let energy = safe_money(observation.local_energy_wh, 1_000_000.0, "Energie locale")?;
    let rate = safe_money(
        observation.electricity_eur_per_kwh,
        10.0,
        "Tarif electrique",
    )?;
    if energy.is_some() != rate.is_some() {
        return Err("Energie et tarif electrique doivent etre fournis ensemble.".to_string());
    }
    Ok(json!({
        "quota_unit": observation.quota_unit,
        "quota_before": before,
        "quota_after": after,
        "quota_delta": before.zip(after).map(|(before, after)| ((before - after) * 10_000.0).round() / 10_000.0),
        "api_overage_eur": api,
        "local_energy_wh": energy,
        "electricity_eur_per_kwh": rate
    }))
}

fn validate_consent(consent: &Value) -> Result<(), String> {
    let required_true = [
        "confirmed",
        "folder_selected_by_user",
        "artifact_copy_allowed",
        "generated_code_execution_allowed",
        "hidden_holdout_allowed_after_artifact_freeze",
    ];
    if consent.get("scope").and_then(Value::as_str) != Some(CONSENT_SCOPE)
        || required_true
            .iter()
            .any(|key| consent.get(*key).and_then(Value::as_bool) != Some(true))
        || consent
            .get("subscription_automation_allowed")
            .and_then(Value::as_bool)
            != Some(false)
        || consent
            .get("network_access_allowed")
            .and_then(Value::as_bool)
            != Some(false)
        || consent.get("publish_allowed").and_then(Value::as_bool) != Some(false)
    {
        return Err("Consentement du ring guide absent ou trop large.".to_string());
    }
    Ok(())
}

fn validate_plan_hidden_binding(
    plan: &Value,
    suite: &crate::forgebench_vault::HiddenSuiteMaterial,
) -> Result<(), String> {
    if plan
        .pointer("/hidden_suite_ref/status")
        .and_then(Value::as_str)
        != Some("locally_sealed")
        || plan
            .pointer("/hidden_suite_ref/suite_id")
            .and_then(Value::as_str)
            != Some(suite.suite_id.as_str())
        || plan
            .pointer("/hidden_suite_ref/suite_digest")
            .and_then(Value::as_str)
            != Some(suite.suite_digest.as_str())
        || plan
            .pointer("/hidden_suite_ref/receipt_digest")
            .and_then(Value::as_str)
            != Some(suite.receipt_digest.as_str())
        || plan
            .pointer("/hidden_suite_ref/hidden_seeds_total")
            .and_then(Value::as_u64)
            != Some(suite.hidden_seeds.len() as u64)
        || plan
            .pointer("/hidden_suite_ref/private_checks_total")
            .and_then(Value::as_u64)
            != Some(suite.private_checks_total as u64)
    {
        return Err("La suite cachee a change depuis le scellement de la stack.".to_string());
    }
    Ok(())
}

fn validate_plan_hidden_receipt(plan: &Value, receipt: &Value) -> Result<(), String> {
    validate_hidden_suite_receipt(receipt)?;
    if plan
        .pointer("/hidden_suite_ref/status")
        .and_then(Value::as_str)
        != Some("locally_sealed")
        || plan
            .pointer("/hidden_suite_ref/suite_id")
            .and_then(Value::as_str)
            != receipt.get("suite_id").and_then(Value::as_str)
        || plan
            .pointer("/hidden_suite_ref/suite_digest")
            .and_then(Value::as_str)
            != receipt.get("suite_digest").and_then(Value::as_str)
        || plan
            .pointer("/hidden_suite_ref/receipt_digest")
            .and_then(Value::as_str)
            != receipt.pointer("/integrity/digest").and_then(Value::as_str)
        || plan
            .pointer("/hidden_suite_ref/hidden_seeds_total")
            .and_then(Value::as_u64)
            != receipt.get("hidden_seeds_total").and_then(Value::as_u64)
        || plan
            .pointer("/hidden_suite_ref/private_checks_total")
            .and_then(Value::as_u64)
            != receipt.get("private_checks_total").and_then(Value::as_u64)
    {
        return Err("La suite cachee a change depuis le scellement de la stack.".to_string());
    }
    Ok(())
}

fn run_contract(plan: &Value, run_id: &str, started_at_ms: u64) -> Result<Value, String> {
    let mut contract = json!({
        "schema": "outilsia.forgebench_guided_run_contract.v1",
        "contract_version": CONTRACT_VERSION,
        "run_id": run_id,
        "started_at_ms": started_at_ms,
        "benchmark": plan.get("benchmark").cloned().unwrap_or(Value::Null),
        "plan_ref": {
            "plan_id": plan.get("plan_id").cloned().unwrap_or(Value::Null),
            "plan_digest": plan.pointer("/integrity/digest").cloned().unwrap_or(Value::Null)
        },
        "permissions": {
            "workspace_write": true,
            "network": false,
            "hidden_suite_read_by_worker": false,
            "publish": false
        },
        "privacy": {
            "raw_prompt_included": false,
            "worker_output_included": false,
            "credentials_included": false
        }
    });
    sign_document(&mut contract)?;
    Ok(contract)
}

fn build_cost_result(plan: &Value, observed: &Value) -> Value {
    let lane = plan
        .pointer("/arrangement/lane")
        .and_then(Value::as_str)
        .unwrap_or("hybrid");
    let has_local = lane != "subscription";
    let has_subscription = lane != "local";
    let monthly = plan
        .pointer("/cost_profile/monthly_subscription_eur")
        .cloned()
        .unwrap_or(Value::Null);
    let amortization = plan
        .pointer("/cost_profile/local_hardware_amortization_eur_per_run")
        .and_then(Value::as_f64);
    let api = observed.get("api_overage_eur").and_then(Value::as_f64);
    let energy = observed.get("local_energy_wh").and_then(Value::as_f64);
    let rate = observed
        .get("electricity_eur_per_kwh")
        .and_then(Value::as_f64);
    let energy_cost = energy
        .zip(rate)
        .map(|(energy, rate)| ((energy / 1_000.0 * rate) * 10_000.0).round() / 10_000.0);
    let mut known_total = 0.0;
    let mut any_known = false;
    if let Some(value) = api {
        known_total += value;
        any_known = true;
    }
    if let Some(value) = energy_cost {
        known_total += value;
        any_known = true;
    }
    if let Some(value) = amortization {
        known_total += value;
        any_known = true;
    }
    let complete = (!has_subscription || api.is_some())
        && (!has_local || (energy_cost.is_some() && amortization.is_some()));
    let mut unknown_components = Vec::new();
    if has_subscription && api.is_none() {
        unknown_components.push("api_overage_or_subscription_quota_value");
    }
    if has_local && energy_cost.is_none() {
        unknown_components.push("local_energy");
    }
    if has_local && amortization.is_none() {
        unknown_components.push("hardware_amortization");
    }
    json!({
        "currency": "EUR",
        "monthly_subscription_eur": monthly,
        "monthly_price_is_not_run_cost": true,
        "quota": {
            "unit": observed.get("quota_unit").cloned().unwrap_or(json!("unknown")),
            "before": observed.get("quota_before").cloned().unwrap_or(Value::Null),
            "after": observed.get("quota_after").cloned().unwrap_or(Value::Null),
            "delta": observed.get("quota_delta").cloned().unwrap_or(Value::Null)
        },
        "api_overage_eur": api,
        "local_energy_wh": energy,
        "electricity_eur_per_kwh": rate,
        "local_energy_cost_eur": energy_cost,
        "hardware_amortization_eur_per_run": amortization,
        "known_marginal_components_eur": if any_known { json!((known_total * 10_000.0).round() / 10_000.0) } else { Value::Null },
        "marginal_cost_complete": complete,
        "unknown_components": unknown_components,
        "unknown_cost_is_zero": false
    })
}

fn autonomy_result(observation: &AutonomyObservation) -> Value {
    let penalty = observation
        .semantic_interventions
        .saturating_mul(15)
        .saturating_add(observation.manual_edits.saturating_mul(25));
    let index = 100_u64.saturating_sub(penalty.min(100));
    let classification = if observation.manual_edits > 0 {
        "manually_assisted"
    } else if observation.semantic_interventions > 0 {
        "guided"
    } else {
        "hands_off_after_start"
    };
    json!({
        "semantic_interventions": observation.semantic_interventions,
        "manual_edits": observation.manual_edits,
        "permission_clicks": observation.permission_clicks,
        "permission_clicks_penalized": false,
        "classification": classification,
        "exploratory_index": index,
        "index_policy": "100-minus-15-per-semantic-intervention-minus-25-per-manual-edit"
    })
}

fn evaluate_selected_folder(
    app: &AppHandle,
    request: &EvaluateForgeBenchStackArtifactRequest,
    selected: &Path,
) -> Result<Value, String> {
    validate_stack_plan(&request.stack_plan)?;
    validate_consent(&request.consent)?;
    let elapsed_ms = validate_timing(&request.timing)?;
    validate_autonomy(&request.autonomy)?;
    let cost_observed = validate_cost_observation(&request.cost_observation)?;
    let _guard = arena_lock()
        .try_lock()
        .map_err(|_| "Un import ForgeBench est deja en cours.".to_string())?;
    let root = run_root(app)?;
    let mut entropy = [0_u8; 16];
    fill(&mut entropy).map_err(|_| "Entropie du run ForgeBench indisponible.".to_string())?;
    let run_seed = json!({
        "plan_digest": request.stack_plan.pointer("/integrity/digest"),
        "started_at_ms": request.timing.started_at_ms,
        "entropy_sha256": sha256_bytes(&entropy)
    });
    let run_id = format!("fbsr-{}", &canonical_sha256(&run_seed)[..24]);
    let run_dir = root.join(&run_id);
    create_private_directory(&run_dir)?;
    let workspace = run_dir.join("workspace");
    let evaluation = run_dir.join("evaluation");
    let evaluation_started = Instant::now();
    let execution = (|| {
        create_private_directory(&workspace)?;
        create_private_directory(&evaluation)?;
        copy_selected_artifact(selected, &workspace)?;
        let contract = run_contract(&request.stack_plan, &run_id, request.timing.started_at_ms)?;
        let contract_bytes = serde_json::to_vec_pretty(&contract)
            .map_err(|_| "Contrat de run non serialisable.".to_string())?;
        fs::write(workspace.join(RUN_CONTRACT_FILE), contract_bytes)
            .map_err(|_| "Contrat de run non ecrit.".to_string())?;
        preflight_visible_browser(&run_dir)?;
        let (submission_digest, submission_bytes) = validate_submission(&workspace)?;
        let hidden_suite = hidden_suite_material(app)?
            .ok_or_else(|| "Scelle d'abord la suite cachee locale.".to_string())?;
        validate_plan_hidden_binding(&request.stack_plan, &hidden_suite)?;
        let static_started = Instant::now();
        let (output, timed_out) = command_output_with_timeout(
            isolated_command(&run_dir, EVALUATOR_SCRIPT)?,
            STATIC_EVALUATOR_TIMEOUT,
            "evaluateur statique du ring guide",
        )?;
        let static_duration_ms = static_started.elapsed().as_millis() as u64;
        let stdout = decode_command_stdout(&output.stdout).unwrap_or_default();
        let values = marker_values(&stdout);
        if timed_out
            || !output.status.success()
            || values.get("evaluator_marker").map(String::as_str) != Some(STATIC_EVALUATOR_MARKER)
            || values.get("submission_digest").map(String::as_str)
                != Some(submission_digest.as_str())
            || values.get("files_total").map(String::as_str) != Some("4")
            || values.get("checks_passed").map(String::as_str) != Some("7")
            || values.get("readonly_verified").map(String::as_str) != Some("true")
        {
            return Err("L'evaluateur statique a refuse l'artefact final.".to_string());
        }
        let browser = evaluate_visible_browser(&run_dir, &submission_digest)?;
        let hidden = evaluate_hidden_browser(&run_dir, &submission_digest, &hidden_suite)?;
        validate_visible_browser_evidence(&browser, &submission_digest)?;
        validate_hidden_browser_evidence_claim(&hidden, &submission_digest)?;
        Ok::<Value, String>(json!({
            "submission_digest": submission_digest,
            "submission_bytes": submission_bytes,
            "static_duration_ms": static_duration_ms,
            "browser": browser,
            "hidden": hidden
        }))
    })();
    let removed = fs::remove_dir_all(&run_dir).is_ok() && !run_dir.exists();
    let proof = execution?;
    if !removed {
        return Err("Le workspace temporaire du ring n'a pas pu etre supprime.".to_string());
    }
    let cost = build_cost_result(&request.stack_plan, &cost_observed);
    let autonomy = autonomy_result(&request.autonomy);
    let browser = proof.get("browser").cloned().unwrap_or(Value::Null);
    let hidden = proof.get("hidden").cloned().unwrap_or(Value::Null);
    let mut result = json!({
        "schema": RUN_RESULT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "run_id": run_id,
        "recorded_at_ms": unix_ms(),
        "plan_ref": {
            "plan_id": request.stack_plan.get("plan_id").cloned().unwrap_or(Value::Null),
            "plan_digest": request.stack_plan.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
            "label": request.stack_plan.pointer("/arrangement/label").cloned().unwrap_or(Value::Null),
            "lane": request.stack_plan.pointer("/arrangement/lane").cloned().unwrap_or(Value::Null),
            "target_runs": request.stack_plan.pointer("/run_policy/target_runs").cloned().unwrap_or(Value::Null)
        },
        "arrangement": request.stack_plan.get("arrangement").cloned().unwrap_or(Value::Null),
        "benchmark": request.stack_plan.get("benchmark").cloned().unwrap_or(Value::Null),
        "artifact": {
            "files_total": 3,
            "bytes_total": proof.get("submission_bytes").cloned().unwrap_or(json!(0)),
            "digest": proof.get("submission_digest").cloned().unwrap_or(Value::Null),
            "source_path_returned": false,
            "raw_files_stored": false
        },
        "timing": {
            "started_at_ms": request.timing.started_at_ms,
            "ended_at_ms": request.timing.ended_at_ms,
            "elapsed_ms": elapsed_ms,
            "measurement_source": "outilsia_guided_stopwatch",
            "evaluation_ms": evaluation_started.elapsed().as_millis() as u64
        },
        "autonomy": autonomy,
        "cost": cost,
        "quality": {
            "objective_checks_total": 51,
            "objective_checks_passed": 51,
            "objective_percent": 100,
            "static_checks": {"passed": 7, "total": 7, "duration_ms": proof.get("static_duration_ms").cloned().unwrap_or(json!(0))},
            "visible_gameplay": {
                "passed": browser.get("checks_passed").cloned().unwrap_or(json!(0)),
                "total": browser.get("checks_total").cloned().unwrap_or(json!(0)),
                "viewports": browser.get("viewports_total").cloned().unwrap_or(json!(0))
            },
            "hidden_holdout": {
                "passed": hidden.get("private_checks_passed").cloned().unwrap_or(json!(0)),
                "total": hidden.get("private_checks_total").cloned().unwrap_or(json!(0)),
                "observations_returned": false
            },
            "subjective_polish_scored": false
        },
        "provenance": {
            "arrangement_attribution": "user_declared",
            "artifact_authorship_verified": false,
            "handoff_trace_retained": false,
            "independently_authenticated": false
        },
        "security": {
            "folder_selected_by_user": true,
            "subscription_automation": false,
            "external_network_during_evaluation": false,
            "evaluator_isolated": true,
            "artifact_frozen_before_hidden_suite_evaluation": true,
            "hidden_suite_mounted_into_worker": false,
            "raw_prompt_stored": false,
            "raw_worker_output_stored": false,
            "credentials_read": false,
            "personal_path_returned": false,
            "temporary_workspace_removed": true
        },
        "readiness": {
            "run_verified": true,
            "comparison_eligible": true,
            "scientific_eligible": false,
            "winner_declared": false,
            "blockers": ["single_task_family", "subjective_polish_not_scored"]
        }
    });
    sign_document(&mut result)?;
    validate_stack_run_result(&result)?;
    Ok(result)
}

pub(crate) fn validate_stack_run_result(result: &Value) -> Result<(), String> {
    if result.get("schema").and_then(Value::as_str) != Some(RUN_RESULT_SCHEMA)
        || result.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || result
            .get("run_id")
            .and_then(Value::as_str)
            .is_none_or(|value| !value.starts_with("fbsr-") || value.len() != 29)
        || !result
            .pointer("/plan_ref/plan_digest")
            .and_then(Value::as_str)
            .is_some_and(is_sha256)
        || result.pointer("/benchmark/id").and_then(Value::as_str) != Some(BENCHMARK_ID)
        || result
            .pointer("/artifact/files_total")
            .and_then(Value::as_u64)
            != Some(3)
        || !result
            .pointer("/artifact/digest")
            .and_then(Value::as_str)
            .is_some_and(is_sha256)
        || result
            .pointer("/quality/objective_checks_total")
            .and_then(Value::as_u64)
            != Some(51)
        || result
            .pointer("/quality/objective_checks_passed")
            .and_then(Value::as_u64)
            != Some(51)
        || result
            .pointer("/quality/objective_percent")
            .and_then(Value::as_u64)
            != Some(100)
        || result
            .pointer("/security/subscription_automation")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/provenance/arrangement_attribution")
            .and_then(Value::as_str)
            != Some("user_declared")
        || result
            .pointer("/provenance/artifact_authorship_verified")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/provenance/handoff_trace_retained")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/provenance/independently_authenticated")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/security/artifact_frozen_before_hidden_suite_evaluation")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/security/temporary_workspace_removed")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/cost/unknown_cost_is_zero")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/readiness/comparison_eligible")
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
        || result
            .pointer("/timing/elapsed_ms")
            .and_then(Value::as_u64)
            .is_none_or(|value| !(MIN_RUN_DURATION_MS..=MAX_RUN_DURATION_MS).contains(&value))
    {
        return Err("Recu ForgeBench Stack Arena trompeur.".to_string());
    }
    for pointer in [
        "/autonomy/semantic_interventions",
        "/autonomy/manual_edits",
        "/autonomy/permission_clicks",
    ] {
        if result.pointer(pointer).and_then(Value::as_u64).is_none() {
            return Err("Mesure d'autonomie absente.".to_string());
        }
    }
    verify_integrity(result, "du run Stack Arena")?;
    Ok(())
}

fn median_u64(values: &mut [u64]) -> u64 {
    values.sort_unstable();
    if values.len() % 2 == 1 {
        values[values.len() / 2]
    } else {
        values[values.len() / 2 - 1].saturating_add(values[values.len() / 2]) / 2
    }
}

fn median_f64(values: &mut [f64]) -> f64 {
    values.sort_by(|left, right| left.total_cmp(right));
    let value = if values.len() % 2 == 1 {
        values[values.len() / 2]
    } else {
        (values[values.len() / 2 - 1] + values[values.len() / 2]) / 2.0
    };
    (value * 10_000.0).round() / 10_000.0
}

fn aggregate_runs(plan_digest: &str, runs: &[Value]) -> Result<Value, String> {
    let first = runs
        .first()
        .ok_or_else(|| "Groupe de runs vide.".to_string())?;
    let label = first
        .pointer("/plan_ref/label")
        .cloned()
        .unwrap_or(Value::Null);
    let lane = first
        .pointer("/plan_ref/lane")
        .cloned()
        .unwrap_or(Value::Null);
    let target_runs = first
        .pointer("/plan_ref/target_runs")
        .and_then(Value::as_u64)
        .unwrap_or(3);
    let monthly = first
        .pointer("/cost/monthly_subscription_eur")
        .and_then(Value::as_f64);
    let mut durations = Vec::with_capacity(runs.len());
    let mut quality = Vec::with_capacity(runs.len());
    let mut autonomy = Vec::with_capacity(runs.len());
    let mut semantic = Vec::with_capacity(runs.len());
    let mut manual = Vec::with_capacity(runs.len());
    let mut marginal = Vec::with_capacity(runs.len());
    let mut quota = Vec::with_capacity(runs.len());
    let quota_unit = first
        .pointer("/cost/quota/unit")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let mut complete_cost = true;
    for run in runs {
        if run.pointer("/plan_ref/plan_digest").and_then(Value::as_str) != Some(plan_digest)
            || run.pointer("/plan_ref/label") != first.pointer("/plan_ref/label")
            || run.pointer("/plan_ref/lane") != first.pointer("/plan_ref/lane")
            || run
                .pointer("/cost/monthly_subscription_eur")
                .and_then(Value::as_f64)
                != monthly
        {
            return Err("Runs d'une meme stack incoherents.".to_string());
        }
        durations.push(
            run.pointer("/timing/elapsed_ms")
                .and_then(Value::as_u64)
                .unwrap_or_default(),
        );
        quality.push(
            run.pointer("/quality/objective_percent")
                .and_then(Value::as_u64)
                .unwrap_or_default(),
        );
        autonomy.push(
            run.pointer("/autonomy/exploratory_index")
                .and_then(Value::as_u64)
                .unwrap_or_default(),
        );
        semantic.push(
            run.pointer("/autonomy/semantic_interventions")
                .and_then(Value::as_u64)
                .unwrap_or_default(),
        );
        manual.push(
            run.pointer("/autonomy/manual_edits")
                .and_then(Value::as_u64)
                .unwrap_or_default(),
        );
        if run
            .pointer("/cost/marginal_cost_complete")
            .and_then(Value::as_bool)
            == Some(true)
        {
            marginal.push(
                run.pointer("/cost/known_marginal_components_eur")
                    .and_then(Value::as_f64)
                    .unwrap_or_default(),
            );
        } else {
            complete_cost = false;
        }
        if run.pointer("/cost/quota/unit").and_then(Value::as_str) == Some(quota_unit) {
            if let Some(delta) = run.pointer("/cost/quota/delta").and_then(Value::as_f64) {
                quota.push(delta);
            }
        }
    }
    let duration_min = durations.iter().min().copied().unwrap_or_default();
    let duration_max = durations.iter().max().copied().unwrap_or_default();
    let duration_median = median_u64(&mut durations);
    let quality_median = median_u64(&mut quality);
    let autonomy_median = median_u64(&mut autonomy);
    let semantic_median = median_u64(&mut semantic);
    let manual_median = median_u64(&mut manual);
    let marginal_median = if complete_cost && marginal.len() == runs.len() {
        Some(median_f64(&mut marginal))
    } else {
        None
    };
    let quota_median = if quota.len() == runs.len() && quota_unit != "unknown" {
        Some(median_f64(&mut quota))
    } else {
        None
    };
    Ok(json!({
        "plan_digest": plan_digest,
        "label": label,
        "lane": lane,
        "runs_recorded": runs.len(),
        "target_runs": target_runs,
        "arcade_ready": runs.len() >= 3,
        "monthly_compass_ready": runs.len() >= 5,
        "quality": {
            "objective_median_percent": quality_median,
            "all_runs_passed": quality_median == 100
        },
        "speed": {
            "median_ms": duration_median,
            "min_ms": duration_min,
            "max_ms": duration_max,
            "spread_ms": duration_max.saturating_sub(duration_min)
        },
        "autonomy": {
            "median_index": autonomy_median,
            "median_semantic_interventions": semantic_median,
            "median_manual_edits": manual_median
        },
        "cost": {
            "monthly_subscription_eur": monthly,
            "marginal_cost_complete": complete_cost && marginal_median.is_some(),
            "median_marginal_eur": marginal_median,
            "quota_unit": quota_unit,
            "median_quota_delta": quota_median,
            "unknown_cost_is_zero": false
        },
        "reliability": {
            "accepted_runs": runs.len(),
            "failed_runs_recorded": 0,
            "failure_receipts_supported": false
        }
    }))
}

fn dominates(left: &Value, right: &Value, include_cost: bool) -> bool {
    let left_quality = left
        .pointer("/quality/objective_median_percent")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let right_quality = right
        .pointer("/quality/objective_median_percent")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let left_speed = left
        .pointer("/speed/median_ms")
        .and_then(Value::as_u64)
        .unwrap_or(u64::MAX);
    let right_speed = right
        .pointer("/speed/median_ms")
        .and_then(Value::as_u64)
        .unwrap_or(u64::MAX);
    let left_help = left
        .pointer("/autonomy/median_semantic_interventions")
        .and_then(Value::as_u64)
        .unwrap_or(u64::MAX)
        .saturating_add(
            left.pointer("/autonomy/median_manual_edits")
                .and_then(Value::as_u64)
                .unwrap_or(u64::MAX),
        );
    let right_help = right
        .pointer("/autonomy/median_semantic_interventions")
        .and_then(Value::as_u64)
        .unwrap_or(u64::MAX)
        .saturating_add(
            right
                .pointer("/autonomy/median_manual_edits")
                .and_then(Value::as_u64)
                .unwrap_or(u64::MAX),
        );
    let mut no_worse =
        left_quality >= right_quality && left_speed <= right_speed && left_help <= right_help;
    let mut strictly_better =
        left_quality > right_quality || left_speed < right_speed || left_help < right_help;
    if include_cost {
        let left_monthly = left
            .pointer("/cost/monthly_subscription_eur")
            .and_then(Value::as_f64)
            .unwrap_or(f64::INFINITY);
        let right_monthly = right
            .pointer("/cost/monthly_subscription_eur")
            .and_then(Value::as_f64)
            .unwrap_or(f64::INFINITY);
        let left_marginal = left
            .pointer("/cost/median_marginal_eur")
            .and_then(Value::as_f64)
            .unwrap_or(f64::INFINITY);
        let right_marginal = right
            .pointer("/cost/median_marginal_eur")
            .and_then(Value::as_f64)
            .unwrap_or(f64::INFINITY);
        no_worse &= left_monthly <= right_monthly && left_marginal <= right_marginal;
        strictly_better |= left_monthly < right_monthly || left_marginal < right_marginal;
    }
    no_worse && strictly_better
}

fn compile_scoreboard(runs: &[Value]) -> Result<Value, String> {
    if runs.is_empty() || runs.len() > MAX_RUNS {
        return Err("Le ring doit contenir entre 1 et 100 runs.".to_string());
    }
    let mut ids = BTreeSet::new();
    let mut grouped = BTreeMap::<String, Vec<Value>>::new();
    for run in runs {
        validate_stack_run_result(run)?;
        let run_id = run
            .get("run_id")
            .and_then(Value::as_str)
            .ok_or_else(|| "Identifiant de run absent.".to_string())?;
        if !ids.insert(run_id.to_string()) {
            return Err("Run ForgeBench duplique.".to_string());
        }
        let digest = run
            .pointer("/plan_ref/plan_digest")
            .and_then(Value::as_str)
            .ok_or_else(|| "Empreinte de stack absente.".to_string())?;
        grouped
            .entry(digest.to_string())
            .or_default()
            .push(run.clone());
    }
    let mut arrangements = Vec::with_capacity(grouped.len());
    for (digest, grouped_runs) in grouped {
        arrangements.push(aggregate_runs(&digest, &grouped_runs)?);
    }
    arrangements.sort_by(|left, right| {
        left.get("label")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .cmp(
                right
                    .get("label")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            )
    });
    let arcade = arrangements
        .iter()
        .filter(|item| item.get("arcade_ready").and_then(Value::as_bool) == Some(true))
        .cloned()
        .collect::<Vec<_>>();
    let cost_comparable = arcade.len() >= 2
        && arcade.iter().all(|item| {
            item.pointer("/cost/monthly_subscription_eur")
                .and_then(Value::as_f64)
                .is_some()
                && item
                    .pointer("/cost/marginal_cost_complete")
                    .and_then(Value::as_bool)
                    == Some(true)
        });
    let frontier = arcade
        .iter()
        .filter(|candidate| {
            !arcade
                .iter()
                .any(|other| other != *candidate && dominates(other, candidate, cost_comparable))
        })
        .filter_map(|candidate| candidate.get("plan_digest").cloned())
        .collect::<Vec<_>>();
    let minimal_subscription = arcade
        .iter()
        .filter(|item| {
            item.pointer("/quality/objective_median_percent")
                .and_then(Value::as_u64)
                == Some(100)
                && item
                    .pointer("/autonomy/median_manual_edits")
                    .and_then(Value::as_u64)
                    == Some(0)
                && item
                    .pointer("/cost/monthly_subscription_eur")
                    .and_then(Value::as_f64)
                    .is_some()
        })
        .min_by(|left, right| {
            left.pointer("/cost/monthly_subscription_eur")
                .and_then(Value::as_f64)
                .unwrap_or(f64::INFINITY)
                .total_cmp(
                    &right
                        .pointer("/cost/monthly_subscription_eur")
                        .and_then(Value::as_f64)
                        .unwrap_or(f64::INFINITY),
                )
        })
        .map(|item| {
            json!({
                "plan_digest": item.get("plan_digest").cloned().unwrap_or(Value::Null),
                "label": item.get("label").cloned().unwrap_or(Value::Null),
                "monthly_subscription_eur": item.pointer("/cost/monthly_subscription_eur").cloned().unwrap_or(Value::Null),
                "claim": "smallest_declared_subscription_commitment_among_sufficient_arcade_runs",
                "total_cost_claimed": false
            })
        });
    let status = if arrangements.len() < 2 {
        "needs_two_arrangements"
    } else if arcade.len() < arrangements.len() {
        "arcade_incomplete"
    } else {
        "exploratory_comparison_ready"
    };
    let mut scoreboard = json!({
        "schema": SCOREBOARD_RESULT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "compiled_at_ms": unix_ms(),
        "benchmark": benchmark_identity()?,
        "status": status,
        "runs_total": runs.len(),
        "arrangements": arrangements,
        "pareto": {
            "eligible_arrangements": arcade.len(),
            "frontier_plan_digests": frontier,
            "dimensions": if cost_comparable {
                json!(["objective_quality", "wall_clock_speed", "human_help", "monthly_subscription", "observed_marginal_cost"])
            } else {
                json!(["objective_quality", "wall_clock_speed", "human_help"])
            },
            "cost_included": cost_comparable,
            "unknown_cost_is_zero": false
        },
        "minimal_sufficient_subscription": minimal_subscription,
        "claims": {
            "single_global_winner_declared": false,
            "scientific_superiority_claimed": false,
            "arrangement_attribution": "user_declared",
            "artifact_authorship_verified": false,
            "valid_for_task_family": "greenfield_browser_game",
            "three_runs_are_arcade_exploration": true,
            "five_runs_enable_monthly_compass_not_universal_truth": true,
            "exact_versions_required": true,
            "raw_metrics_preserved": true
        }
    });
    sign_document(&mut scoreboard)?;
    validate_stack_scoreboard(&scoreboard)?;
    Ok(scoreboard)
}

pub(crate) fn validate_stack_scoreboard(scoreboard: &Value) -> Result<(), String> {
    if scoreboard.get("schema").and_then(Value::as_str) != Some(SCOREBOARD_RESULT_SCHEMA)
        || scoreboard.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || scoreboard.pointer("/benchmark/id").and_then(Value::as_str) != Some(BENCHMARK_ID)
        || !matches!(
            scoreboard.get("status").and_then(Value::as_str),
            Some("needs_two_arrangements" | "arcade_incomplete" | "exploratory_comparison_ready")
        )
        || scoreboard
            .get("runs_total")
            .and_then(Value::as_u64)
            .is_none_or(|value| !(1..=MAX_RUNS as u64).contains(&value))
        || scoreboard
            .pointer("/pareto/unknown_cost_is_zero")
            .and_then(Value::as_bool)
            != Some(false)
        || scoreboard
            .pointer("/claims/single_global_winner_declared")
            .and_then(Value::as_bool)
            != Some(false)
        || scoreboard
            .pointer("/claims/scientific_superiority_claimed")
            .and_then(Value::as_bool)
            != Some(false)
        || scoreboard
            .pointer("/claims/arrangement_attribution")
            .and_then(Value::as_str)
            != Some("user_declared")
        || scoreboard
            .pointer("/claims/artifact_authorship_verified")
            .and_then(Value::as_bool)
            != Some(false)
        || scoreboard
            .pointer("/claims/three_runs_are_arcade_exploration")
            .and_then(Value::as_bool)
            != Some(true)
        || scoreboard
            .pointer("/claims/five_runs_enable_monthly_compass_not_universal_truth")
            .and_then(Value::as_bool)
            != Some(true)
    {
        return Err("Tableau ForgeBench Stack Arena trompeur.".to_string());
    }
    let arrangements = scoreboard
        .get("arrangements")
        .and_then(Value::as_array)
        .filter(|items| !items.is_empty() && items.len() <= MAX_RUNS)
        .ok_or_else(|| "Arrangements du tableau ForgeBench absents.".to_string())?;
    let runs_total = scoreboard
        .get("runs_total")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let mut counted_runs = 0_u64;
    let mut digests = BTreeSet::new();
    for arrangement in arrangements {
        let digest = arrangement
            .get("plan_digest")
            .and_then(Value::as_str)
            .filter(|value| is_sha256(value))
            .ok_or_else(|| "Empreinte d'arrangement invalide.".to_string())?;
        let runs = arrangement
            .get("runs_recorded")
            .and_then(Value::as_u64)
            .filter(|value| *value > 0)
            .ok_or_else(|| "Nombre de runs d'arrangement invalide.".to_string())?;
        let _target = arrangement
            .get("target_runs")
            .and_then(Value::as_u64)
            .filter(|value| matches!(*value, 3 | 5))
            .ok_or_else(|| "Cible de runs d'arrangement invalide.".to_string())?;
        if !digests.insert(digest)
            || arrangement.get("arcade_ready").and_then(Value::as_bool) != Some(runs >= 3)
            || arrangement
                .get("monthly_compass_ready")
                .and_then(Value::as_bool)
                != Some(runs >= 5)
            || arrangement
                .pointer("/quality/objective_median_percent")
                .and_then(Value::as_u64)
                != Some(100)
            || arrangement
                .pointer("/cost/unknown_cost_is_zero")
                .and_then(Value::as_bool)
                != Some(false)
        {
            return Err("Agrégat ForgeBench Stack Arena incoherent.".to_string());
        }
        counted_runs = counted_runs.saturating_add(runs);
    }
    if counted_runs != runs_total {
        return Err("Total de runs ForgeBench incoherent.".to_string());
    }
    verify_integrity(scoreboard, "du tableau Stack Arena")?;
    Ok(())
}

async fn confirm_artifact_execution(app: &AppHandle, label: &str) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Fenetre native OutilsIA indisponible.".to_string())?;
    let label = label.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        window
            .dialog()
            .message(format!(
                "OutilsIA va copier puis executer hors ligne les trois fichiers finaux de « {label} » dans un espace temporaire isole. Aucun abonnement ne sera pilote et aucun resultat ne sera publie."
            ))
            .title("Evaluer cet artefact ForgeBench ?")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Evaluer hors ligne".to_string(),
                "Annuler".to_string(),
            ))
            .parent(&window)
            .blocking_show()
    })
    .await
    .map_err(|_| "Dialogue natif ForgeBench interrompu.".to_string())
}

#[tauri::command]
pub(crate) fn compile_forgebench_stack_plan(
    app: AppHandle,
    request: CompileForgeBenchStackPlanRequest,
) -> Result<Value, String> {
    let receipt = hidden_suite_receipt(&app)?;
    compile_plan(&request, receipt.as_ref())
}

#[tauri::command]
pub(crate) async fn export_forgebench_stack_starter(
    app: AppHandle,
    request: ExportForgeBenchStackStarterRequest,
) -> Result<Value, String> {
    if request.schema != EXPORT_REQUEST_SCHEMA {
        return Err("Contrat d'export ForgeBench invalide.".to_string());
    }
    validate_stack_plan(&request.stack_plan)?;
    let Some(parent) = pick_folder(&app, "Choisir le dossier parent du kit ForgeBench").await?
    else {
        return Err("Export ForgeBench annule.".to_string());
    };
    export_starter_to_parent(&request.stack_plan, &parent)
}

#[tauri::command]
pub(crate) async fn evaluate_forgebench_stack_artifact(
    app: AppHandle,
    request: EvaluateForgeBenchStackArtifactRequest,
) -> Result<Value, String> {
    if request.schema != EVALUATE_REQUEST_SCHEMA {
        return Err("Contrat d'import ForgeBench invalide.".to_string());
    }
    validate_stack_plan(&request.stack_plan)?;
    validate_consent(&request.consent)?;
    let receipt = hidden_suite_receipt(&app)?
        .ok_or_else(|| "Scelle d'abord la suite cachee locale.".to_string())?;
    validate_plan_hidden_receipt(&request.stack_plan, &receipt)?;
    let Some(folder) = pick_folder(
        &app,
        "Choisir le dossier final: index.html, styles.css et game.js",
    )
    .await?
    else {
        return Err("Import ForgeBench annule.".to_string());
    };
    let label = request
        .stack_plan
        .pointer("/arrangement/label")
        .and_then(Value::as_str)
        .unwrap_or("cet arrangement");
    if !confirm_artifact_execution(&app, label).await? {
        return Err("Evaluation ForgeBench annulee.".to_string());
    }
    evaluate_selected_folder(&app, &request, &folder)
}

#[tauri::command]
pub(crate) fn compile_forgebench_stack_scoreboard(
    request: CompileForgeBenchStackScoreboardRequest,
) -> Result<Value, String> {
    if request.schema != SCOREBOARD_REQUEST_SCHEMA {
        return Err("Contrat de classement ForgeBench invalide.".to_string());
    }
    compile_scoreboard(&request.runs)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::forgebench_vault::test_hidden_suite_receipt;

    fn request(label: &str, target_runs: u64) -> CompileForgeBenchStackPlanRequest {
        CompileForgeBenchStackPlanRequest {
            schema: COMPILE_REQUEST_SCHEMA.to_string(),
            label: label.to_string(),
            target_runs,
            stages: vec![
                StackStageInput {
                    role: "planner".to_string(),
                    provider: "moonshot_kimi".to_string(),
                    identity: "Kimi Code".to_string(),
                    version: "2026.07".to_string(),
                },
                StackStageInput {
                    role: "builder".to_string(),
                    provider: "xai_grok".to_string(),
                    identity: "Grok Code".to_string(),
                    version: "4.1".to_string(),
                },
                StackStageInput {
                    role: "reviewer".to_string(),
                    provider: "anthropic_claude".to_string(),
                    identity: "Claude Code".to_string(),
                    version: "2.1.0".to_string(),
                },
                StackStageInput {
                    role: "repairer".to_string(),
                    provider: "xai_grok".to_string(),
                    identity: "Grok Code".to_string(),
                    version: "4.1".to_string(),
                },
            ],
            cost_profile: StackCostProfileInput {
                monthly_subscription_eur: Some(60.0),
                local_hardware_amortization_eur_per_run: None,
            },
        }
    }

    fn run_receipt(plan: &Value, index: u64, elapsed_ms: u64, monthly: f64) -> Value {
        let mut receipt = json!({
            "schema": RUN_RESULT_SCHEMA,
            "contract_version": CONTRACT_VERSION,
            "run_id": format!("fbsr-{:024x}", index),
            "recorded_at_ms": 1_000 + index,
            "plan_ref": {
                "plan_id": plan.get("plan_id").cloned().unwrap(),
                "plan_digest": plan.pointer("/integrity/digest").cloned().unwrap(),
                "label": plan.pointer("/arrangement/label").cloned().unwrap(),
                "lane": plan.pointer("/arrangement/lane").cloned().unwrap(),
                "target_runs": plan.pointer("/run_policy/target_runs").cloned().unwrap()
            },
            "arrangement": plan.get("arrangement").cloned().unwrap(),
            "benchmark": plan.get("benchmark").cloned().unwrap(),
            "artifact": {"files_total": 3, "bytes_total": 12000, "digest": format!("{:064x}", index + 100), "source_path_returned": false, "raw_files_stored": false},
            "timing": {"started_at_ms": 1000, "ended_at_ms": 1000 + elapsed_ms, "elapsed_ms": elapsed_ms, "measurement_source": "outilsia_guided_stopwatch", "evaluation_ms": 500},
            "autonomy": {"semantic_interventions": 0, "manual_edits": 0, "permission_clicks": 2, "permission_clicks_penalized": false, "classification": "hands_off_after_start", "exploratory_index": 100, "index_policy": "100-minus-15-per-semantic-intervention-minus-25-per-manual-edit"},
            "cost": {"currency": "EUR", "monthly_subscription_eur": monthly, "monthly_price_is_not_run_cost": true, "quota": {"unit": "credits", "before": 100, "after": 98, "delta": 2}, "api_overage_eur": 0, "local_energy_wh": null, "electricity_eur_per_kwh": null, "local_energy_cost_eur": null, "hardware_amortization_eur_per_run": null, "known_marginal_components_eur": 0, "marginal_cost_complete": true, "unknown_components": [], "unknown_cost_is_zero": false},
            "quality": {"objective_checks_total": 51, "objective_checks_passed": 51, "objective_percent": 100, "static_checks": {"passed": 7, "total": 7, "duration_ms": 10}, "visible_gameplay": {"passed": 39, "total": 39, "viewports": 3}, "hidden_holdout": {"passed": 5, "total": 5, "observations_returned": false}, "subjective_polish_scored": false},
            "provenance": {"arrangement_attribution": "user_declared", "artifact_authorship_verified": false, "handoff_trace_retained": false, "independently_authenticated": false},
            "security": {"folder_selected_by_user": true, "subscription_automation": false, "external_network_during_evaluation": false, "evaluator_isolated": true, "artifact_frozen_before_hidden_suite_evaluation": true, "hidden_suite_mounted_into_worker": false, "raw_prompt_stored": false, "raw_worker_output_stored": false, "credentials_read": false, "personal_path_returned": false, "temporary_workspace_removed": true},
            "readiness": {"run_verified": true, "comparison_eligible": true, "scientific_eligible": false, "winner_declared": false, "blockers": ["single_task_family", "subjective_polish_not_scored"]}
        });
        sign_document(&mut receipt).expect("signed run");
        receipt
    }

    pub(crate) fn signed_result() -> Value {
        let plan = compile_plan(
            &request("Kimi vers Grok vers Claude", 3),
            Some(&test_hidden_suite_receipt()),
        )
        .expect("stack plan");
        run_receipt(&plan, 77, 61_000, 60.0)
    }

    pub(crate) fn signed_scoreboard() -> Value {
        let plan = compile_plan(
            &request("Kimi vers Grok vers Claude", 3),
            Some(&test_hidden_suite_receipt()),
        )
        .expect("stack plan");
        compile_scoreboard(&[
            run_receipt(&plan, 81, 60_000, 60.0),
            run_receipt(&plan, 82, 61_000, 60.0),
            run_receipt(&plan, 83, 62_000, 60.0),
        ])
        .expect("stack scoreboard")
    }

    #[test]
    fn compiles_a_versioned_multi_ai_arrangement_without_execution() {
        let plan = compile_plan(
            &request("Kimi vers Grok vers Claude", 3),
            Some(&test_hidden_suite_receipt()),
        )
        .expect("stack plan");
        validate_stack_plan(&plan).expect("valid plan");
        assert_eq!(
            plan.pointer("/arrangement/lane").and_then(Value::as_str),
            Some("subscription")
        );
        assert_eq!(
            plan.pointer("/arrangement/stages")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(4)
        );
        assert_eq!(
            plan.pointer("/security/subscription_tool_started")
                .and_then(Value::as_bool),
            Some(false)
        );
    }

    #[test]
    fn blocks_missing_builder_wrong_order_and_fake_local_subscription() {
        let mut missing = request("Sans builder", 3);
        missing.stages.retain(|stage| stage.role != "builder");
        assert!(compile_plan(&missing, Some(&test_hidden_suite_receipt())).is_err());

        let mut wrong_order = request("Mauvais ordre", 3);
        wrong_order.stages.swap(0, 1);
        assert!(compile_plan(&wrong_order, Some(&test_hidden_suite_receipt())).is_err());

        let local = CompileForgeBenchStackPlanRequest {
            schema: COMPILE_REQUEST_SCHEMA.to_string(),
            label: "Local seul".to_string(),
            target_runs: 3,
            stages: vec![StackStageInput {
                role: "builder".to_string(),
                provider: "ollama_local".to_string(),
                identity: "qwen3:14b".to_string(),
                version: "q4_K_M".to_string(),
            }],
            cost_profile: StackCostProfileInput {
                monthly_subscription_eur: Some(20.0),
                local_hardware_amortization_eur_per_run: None,
            },
        };
        assert!(compile_plan(&local, Some(&test_hidden_suite_receipt())).is_err());
    }

    #[test]
    fn an_unsealed_plan_never_unlocks_artifact_evaluation() {
        let plan = compile_plan(&request("Cloud sans holdout", 3), None).expect("plan");
        assert_eq!(
            plan.pointer("/readiness/artifact_evaluation_ready")
                .and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            plan.pointer("/readiness/blockers/0")
                .and_then(Value::as_str),
            Some("hidden_suite_not_sealed")
        );
    }

    #[test]
    fn cost_and_autonomy_keep_unknowns_visible() {
        let plan =
            compile_plan(&request("Cloud", 3), Some(&test_hidden_suite_receipt())).expect("plan");
        let observed = validate_cost_observation(&CostObservation {
            quota_unit: "unknown".to_string(),
            quota_before: None,
            quota_after: None,
            api_overage_eur: None,
            local_energy_wh: None,
            electricity_eur_per_kwh: None,
        })
        .expect("cost");
        let cost = build_cost_result(&plan, &observed);
        assert_eq!(
            cost.get("marginal_cost_complete").and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            cost.get("unknown_cost_is_zero").and_then(Value::as_bool),
            Some(false)
        );
        let autonomy = autonomy_result(&AutonomyObservation {
            semantic_interventions: 2,
            manual_edits: 1,
            permission_clicks: 7,
        });
        assert_eq!(
            autonomy.get("exploratory_index").and_then(Value::as_u64),
            Some(45)
        );
        assert_eq!(
            autonomy
                .get("permission_clicks_penalized")
                .and_then(Value::as_bool),
            Some(false)
        );
    }

    #[test]
    fn three_runs_unlock_arcade_but_never_science_or_a_global_winner() {
        let plan =
            compile_plan(&request("Stack A", 3), Some(&test_hidden_suite_receipt())).expect("plan");
        let runs = vec![
            run_receipt(&plan, 1, 60_000, 60.0),
            run_receipt(&plan, 2, 62_000, 60.0),
            run_receipt(&plan, 3, 58_000, 60.0),
        ];
        let board = compile_scoreboard(&runs).expect("scoreboard");
        assert_eq!(
            board
                .pointer("/arrangements/0/arcade_ready")
                .and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            board
                .pointer("/claims/single_global_winner_declared")
                .and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            board
                .pointer("/claims/scientific_superiority_claimed")
                .and_then(Value::as_bool),
            Some(false)
        );
    }

    #[test]
    fn scoreboard_rejects_duplicate_or_tampered_runs() {
        let plan =
            compile_plan(&request("Stack B", 3), Some(&test_hidden_suite_receipt())).expect("plan");
        let run = run_receipt(&plan, 9, 70_000, 20.0);
        assert!(compile_scoreboard(&[run.clone(), run]).is_err());
        let mut forged = run_receipt(&plan, 10, 70_000, 20.0);
        forged["quality"]["objective_percent"] = json!(101);
        assert!(compile_scoreboard(&[forged]).is_err());
    }

    #[test]
    fn rejects_resigned_false_provenance_and_global_winner_claims() {
        let plan =
            compile_plan(&request("Stack C", 3), Some(&test_hidden_suite_receipt())).expect("plan");

        let mut forged_run = run_receipt(&plan, 11, 65_000, 20.0);
        forged_run["provenance"]["artifact_authorship_verified"] = json!(true);
        sign_document(&mut forged_run).expect("resigned forged run");
        assert!(validate_stack_run_result(&forged_run).is_err());

        let runs = vec![
            run_receipt(&plan, 12, 60_000, 20.0),
            run_receipt(&plan, 13, 61_000, 20.0),
            run_receipt(&plan, 14, 62_000, 20.0),
        ];
        let mut forged_scoreboard = compile_scoreboard(&runs).expect("scoreboard");
        forged_scoreboard["claims"]["single_global_winner_declared"] = json!(true);
        sign_document(&mut forged_scoreboard).expect("resigned forged scoreboard");
        assert!(validate_stack_scoreboard(&forged_scoreboard).is_err());
    }
}
