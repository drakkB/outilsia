use crate::forgebench::validate_forgebench_result;
use crate::workstack_composer::canonical_sha256;
use getrandom::fill;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const PREPARE_REQUEST_SCHEMA: &str = "outilsia.forgebench_worker_sandbox_prepare_request.v1";
const PREPARE_RESULT_SCHEMA: &str = "outilsia.forgebench_worker_sandbox_prepare_result.v1";
const STATUS_SCHEMA: &str = "outilsia.forgebench_worker_sandbox_status.v1";
const RECEIPT_SCHEMA: &str = "outilsia.forgebench_worker_sandbox_receipt.v1";
const MANIFEST_SCHEMA: &str = "outilsia.forgebench_worker_sandbox_manifest.v1";
const RUN_CONTRACT_SCHEMA: &str = "outilsia.forgebench_worker_run_contract.v1";
const CONTRACT_VERSION: &str = "2026-07-13";
const BENCHMARK_ID: &str = "signal-maze-v1";
const ROOT_DIRECTORY: &str = "forgebench-worker-sandboxes-v1";
const ACTIVE_MANIFEST: &str = "active.json";
const ACTIVE_BACKUP: &str = "active.json.bak";
const RUN_CONTRACT_FILE: &str = ".outilsia-run-contract.json";
const MAX_STACKS: usize = 3;
const MAX_SEEDS: usize = 3;
const MAX_WORKSPACES: usize = MAX_STACKS * MAX_SEEDS;
const STARTER_BUNDLE_SHA256: &str =
    "4d88bea3831044755d3d504fb6cd9a470647f8734d4a67265c2b3c3621f06e53";
const STARTER_FILES: [(&str, &[u8], &str); 3] = [
    (
        "game.js",
        include_bytes!("../../forgebench/signal-maze-v1/starter/game.js"),
        "f465727840cab52a6a6d4ca80072d037819b007ccac942fbdcb805fd3cb77f17",
    ),
    (
        "index.html",
        include_bytes!("../../forgebench/signal-maze-v1/starter/index.html"),
        "a7db8d231f042a215f0081f53c4868021540d0e4cd38a8798287800de7f5ec26",
    ),
    (
        "styles.css",
        include_bytes!("../../forgebench/signal-maze-v1/starter/styles.css"),
        "4bd5c943830754a6ad38f006ed0c2b39abc66936f4ca245bc560822e3602e57a",
    ),
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct PrepareForgeBenchWorkerSandboxRequest {
    schema: String,
    forgebench_result: Value,
    replace_existing: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct PrepareForgeBenchWorkerSandboxResult {
    schema: String,
    contract_version: String,
    prepared: bool,
    replaced: bool,
    worker_started: bool,
    command_executed: bool,
    paths_returned: bool,
    receipt: Value,
}

#[derive(Debug)]
struct BatchInput {
    experiment_id: String,
    experiment_digest: String,
    protocol_digest: String,
    benchmark_version: String,
    stacks: Vec<String>,
    seeds: Vec<u64>,
    public_task: Value,
    visible_checks: Value,
    viewports: Value,
    budgets: Value,
    permissions: Value,
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

fn safe_id(value: &str, prefix: &str) -> bool {
    value.starts_with(prefix)
        && value.len() <= 80
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn safe_stack_key(value: &str) -> bool {
    matches!(value, "codex-solo" | "claude-solo" | "hermes-codex-claude")
}

fn sha256_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn sign_document(document: &mut Value) -> Result<(), String> {
    document
        .as_object_mut()
        .ok_or_else(|| "Document sandbox ForgeBench invalide.".to_string())?
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

fn starter_bundle_digest() -> Result<String, String> {
    let mut lines = Vec::with_capacity(STARTER_FILES.len());
    for (name, bytes, expected) in STARTER_FILES {
        let digest = sha256_bytes(bytes);
        if digest != expected {
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

fn sandbox_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(ROOT_DIRECTORY))
        .map_err(|error| format!("Dossier applicatif ForgeBench indisponible: {error}"))
}

#[cfg(unix)]
fn set_directory_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("Permissions du sandbox impossibles: {error}"))
}

#[cfg(not(unix))]
fn set_directory_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(unix)]
fn set_file_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|error| format!("Permissions du fichier sandbox impossibles: {error}"))
}

#[cfg(not(unix))]
fn set_file_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn create_private_directory(path: &Path) -> Result<(), String> {
    if path.exists() {
        let metadata = fs::symlink_metadata(path)
            .map_err(|error| format!("Dossier sandbox illisible: {error}"))?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("Le dossier sandbox est un lien ou un fichier non autorise.".to_string());
        }
    } else {
        fs::create_dir_all(path)
            .map_err(|error| format!("Creation du dossier sandbox impossible: {error}"))?;
        let metadata = fs::symlink_metadata(path)
            .map_err(|error| format!("Dossier sandbox cree mais illisible: {error}"))?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("Le dossier sandbox cree n'est pas fiable.".to_string());
        }
    }
    set_directory_permissions(path)
}

fn write_private_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| format!("Creation exclusive du fichier sandbox impossible: {error}"))?;
    file.write_all(bytes)
        .map_err(|error| format!("Ecriture du sandbox impossible: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("Synchronisation du sandbox impossible: {error}"))?;
    drop(file);
    set_file_permissions(path)
}

fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Serialisation du sandbox impossible: {error}"))?;
    write_private_file(path, &bytes)
}

fn atomic_write_json(path: &Path, backup: &Path, value: &Value) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Dossier du manifeste sandbox absent.".to_string())?;
    create_private_directory(parent)?;
    let temp = parent.join(format!(".active-{}.tmp", unix_ms()));
    write_json_file(&temp, value)?;
    if path.exists() {
        if backup.exists() {
            fs::remove_file(backup)
                .map_err(|error| format!("Ancien backup sandbox non supprimable: {error}"))?;
        }
        fs::rename(path, backup)
            .map_err(|error| format!("Rotation du manifeste sandbox impossible: {error}"))?;
    }
    if let Err(error) = fs::rename(&temp, path) {
        if backup.exists() {
            let _ = fs::rename(backup, path);
        }
        let _ = fs::remove_file(&temp);
        return Err(format!(
            "Activation du manifeste sandbox impossible: {error}"
        ));
    }
    set_file_permissions(path)?;
    Ok(())
}

fn random_nonce() -> Result<[u8; 16], String> {
    let mut nonce = [0_u8; 16];
    fill(&mut nonce).map_err(|error| format!("Entropie sandbox indisponible: {error}"))?;
    Ok(nonce)
}

fn batch_input(result: &Value) -> Result<BatchInput, String> {
    validate_forgebench_result(result)?;
    let experiment = result
        .get("experiment")
        .ok_or_else(|| "Experience ForgeBench absente.".to_string())?;
    if experiment
        .pointer("/readiness/protocol_ready")
        .and_then(Value::as_bool)
        != Some(true)
    {
        return Err("Le protocole ForgeBench doit etre pret avant le sandbox.".to_string());
    }
    let experiment_id = experiment
        .get("experiment_id")
        .and_then(Value::as_str)
        .filter(|value| safe_id(value, "fb-"))
        .ok_or_else(|| "Identifiant d'experience ForgeBench invalide.".to_string())?
        .to_string();
    let experiment_digest = experiment
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .filter(|value| is_sha256(value))
        .ok_or_else(|| "Empreinte d'experience ForgeBench absente.".to_string())?
        .to_string();
    let protocol_digest = experiment
        .get("protocol_digest")
        .and_then(Value::as_str)
        .filter(|value| is_sha256(value))
        .ok_or_else(|| "Empreinte de protocole ForgeBench absente.".to_string())?
        .to_string();
    let protocol = experiment
        .get("protocol")
        .ok_or_else(|| "Protocole ForgeBench absent.".to_string())?;
    if protocol
        .pointer("/starter/bundle_sha256")
        .and_then(Value::as_str)
        != Some(STARTER_BUNDLE_SHA256)
    {
        return Err("Starter ForgeBench non reconnu par le sandbox.".to_string());
    }
    let seeds = protocol
        .get("seeds")
        .and_then(Value::as_array)
        .ok_or_else(|| "Seeds publics ForgeBench absents.".to_string())?
        .iter()
        .map(|seed| {
            seed.as_u64()
                .ok_or_else(|| "Seed public ForgeBench invalide.".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    let unique_seeds = seeds.iter().copied().collect::<BTreeSet<_>>();
    if seeds.is_empty() || seeds.len() > MAX_SEEDS || unique_seeds.len() != seeds.len() {
        return Err("Seeds publics ForgeBench non bornes.".to_string());
    }
    let stacks = experiment
        .get("candidate_stacks")
        .and_then(Value::as_array)
        .ok_or_else(|| "Stacks ForgeBench absentes.".to_string())?
        .iter()
        .map(|stack| {
            if stack.get("available").and_then(Value::as_bool) != Some(true)
                || stack.get("execution_started").and_then(Value::as_bool) != Some(false)
            {
                return Err("Une stack ForgeBench n'est pas prete pour un workspace.".to_string());
            }
            let key = stack
                .get("key")
                .and_then(Value::as_str)
                .filter(|value| safe_stack_key(value))
                .ok_or_else(|| "Cle de stack ForgeBench invalide.".to_string())?;
            Ok(key.to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    let unique_stacks = stacks.iter().cloned().collect::<BTreeSet<_>>();
    if !(2..=MAX_STACKS).contains(&stacks.len()) || unique_stacks.len() != stacks.len() {
        return Err("Selection de stacks ForgeBench invalide.".to_string());
    }
    if stacks.len() * seeds.len() > MAX_WORKSPACES {
        return Err("Batch de workspaces ForgeBench trop large.".to_string());
    }
    Ok(BatchInput {
        experiment_id,
        experiment_digest,
        protocol_digest,
        benchmark_version: protocol
            .get("benchmark_version")
            .and_then(Value::as_str)
            .unwrap_or("1.0.0-exploratory")
            .to_string(),
        stacks,
        seeds,
        public_task: json!({
            "objective": "Construire un mini-jeu web deterministe dans lequel le joueur relie trois sources de signal a leurs recepteurs correspondants.",
            "rules": [
                "Le plateau est une grille 9 x 9 generee depuis un seed entier.",
                "Trois paires source-recepteur utilisent trois couleurs distinctes.",
                "Un chemin ne traverse ni un obstacle ni un autre chemin.",
                "Une partie est gagnee lorsque les trois paires sont reliees.",
                "Nouvelle partie et Reinitialiser restaurent un etat deterministe.",
                "Clavier, souris et tactile doivent rester jouables sans dependance reseau."
            ]
        }),
        visible_checks: protocol
            .get("visible_checks")
            .cloned()
            .unwrap_or_else(|| json!([])),
        viewports: protocol
            .get("viewports")
            .cloned()
            .unwrap_or_else(|| json!([])),
        budgets: protocol.get("budgets").cloned().unwrap_or(Value::Null),
        permissions: protocol.get("permissions").cloned().unwrap_or(Value::Null),
    })
}

fn run_contract(
    input: &BatchInput,
    sandbox_id: &str,
    stack_key: &str,
    seed: u64,
) -> Result<Value, String> {
    let mut contract = json!({
        "schema": RUN_CONTRACT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "sandbox_id": sandbox_id,
        "benchmark": {
            "id": BENCHMARK_ID,
            "version": input.benchmark_version,
            "starter_bundle_sha256": STARTER_BUNDLE_SHA256
        },
        "experiment_ref": {
            "experiment_id": input.experiment_id,
            "experiment_digest": input.experiment_digest,
            "protocol_digest": input.protocol_digest
        },
        "stack_key": stack_key,
        "public_seed": seed,
        "public_task": input.public_task,
        "visible_checks": input.visible_checks,
        "viewports": input.viewports,
        "budgets": input.budgets,
        "permissions": input.permissions,
        "execution": {
            "worker_started": false,
            "command_executed": false,
            "network_called": false,
            "repository_modified": false
        },
        "privacy": {
            "hidden_suite_included": false,
            "vault_path_included": false,
            "credentials_included": false,
            "source_repository_included": false
        }
    });
    sign_document(&mut contract)?;
    Ok(contract)
}

fn workspace_digest(path: &Path) -> Result<String, String> {
    let expected = ["game.js", "index.html", "styles.css", RUN_CONTRACT_FILE];
    let mut actual = fs::read_dir(path)
        .map_err(|error| format!("Workspace ForgeBench illisible: {error}"))?
        .map(|entry| {
            entry
                .map_err(|error| format!("Entree de workspace illisible: {error}"))
                .and_then(|entry| {
                    let metadata = entry
                        .file_type()
                        .map_err(|error| format!("Type de fichier sandbox illisible: {error}"))?;
                    if !metadata.is_file() || metadata.is_symlink() {
                        return Err("Le workspace contient une entree non autorisee.".to_string());
                    }
                    entry
                        .file_name()
                        .into_string()
                        .map_err(|_| "Nom de fichier sandbox non UTF-8.".to_string())
                })
        })
        .collect::<Result<Vec<_>, _>>()?;
    actual.sort();
    let mut expected_sorted = expected.map(str::to_string).to_vec();
    expected_sorted.sort();
    if actual != expected_sorted {
        return Err("Contenu du workspace ForgeBench inattendu.".to_string());
    }
    let mut lines = Vec::with_capacity(expected.len());
    for name in expected {
        let bytes = fs::read(path.join(name))
            .map_err(|error| format!("Fichier du workspace illisible: {error}"))?;
        lines.push(format!("{name}:{}", sha256_bytes(&bytes)));
    }
    lines.sort();
    Ok(sha256_bytes(format!("{}\n", lines.join("\n")).as_bytes()))
}

fn validate_receipt(receipt: &Value) -> Result<(), String> {
    if receipt.get("schema").and_then(Value::as_str) != Some(RECEIPT_SCHEMA)
        || receipt.get("benchmark_id").and_then(Value::as_str) != Some(BENCHMARK_ID)
        || receipt
            .get("batch_id")
            .and_then(Value::as_str)
            .is_none_or(|value| !safe_id(value, "fbsb-"))
        || receipt
            .get("experiment_id")
            .and_then(Value::as_str)
            .is_none_or(|value| !safe_id(value, "fb-"))
        || receipt
            .get("experiment_digest")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        || receipt
            .get("protocol_digest")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        || receipt.get("starter_bundle_sha256").and_then(Value::as_str)
            != Some(STARTER_BUNDLE_SHA256)
        || receipt.get("paths_returned").and_then(Value::as_bool) != Some(false)
        || receipt
            .pointer("/security/fresh_workspace_per_run")
            .and_then(Value::as_bool)
            != Some(true)
        || receipt
            .pointer("/security/workspace_outside_source_repository")
            .and_then(Value::as_bool)
            != Some(true)
        || receipt
            .pointer("/security/starter_digest_verified")
            .and_then(Value::as_bool)
            != Some(true)
        || receipt
            .pointer("/security/hidden_suite_material_copied")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/security/process_isolation_enforced")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/security/network_isolation_enforced")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/security/hidden_suite_access_blocked")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/execution/worker_started")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/execution/command_executed")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/readiness/workspace_batch_prepared")
            .and_then(Value::as_bool)
            != Some(true)
        || receipt
            .pointer("/readiness/worker_execution_ready")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/readiness/scientific_eligible")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Recu de sandbox ForgeBench trompeur ou invalide.".to_string());
    }
    let stacks = receipt
        .get("candidate_stacks_total")
        .and_then(Value::as_u64)
        .unwrap_or_default() as usize;
    let seeds = receipt
        .get("public_seeds_total")
        .and_then(Value::as_u64)
        .unwrap_or_default() as usize;
    let workspaces = receipt
        .get("workspaces_total")
        .and_then(Value::as_u64)
        .unwrap_or_default() as usize;
    if !(2..=MAX_STACKS).contains(&stacks)
        || !(1..=MAX_SEEDS).contains(&seeds)
        || workspaces != stacks * seeds
        || workspaces > MAX_WORKSPACES
    {
        return Err("Compteurs du sandbox ForgeBench incoherents.".to_string());
    }
    for blocker in [
        "worker_process_not_started",
        "process_isolation_not_enforced",
        "network_isolation_not_enforced",
        "hidden_suite_not_worker_inaccessible",
        "isolated_evaluator_not_implemented",
    ] {
        if !receipt
            .pointer("/readiness/blockers")
            .and_then(Value::as_array)
            .is_some_and(|values| values.iter().any(|value| value.as_str() == Some(blocker)))
        {
            return Err("Limites du sandbox ForgeBench incompletes.".to_string());
        }
    }
    verify_integrity(receipt, "du recu sandbox")?;
    Ok(())
}

fn create_batch(
    root: &Path,
    input: &BatchInput,
    nonce: &[u8; 16],
    created_at_ms: u128,
) -> Result<Value, String> {
    let starter_digest = starter_bundle_digest()?;
    let batch_seed = json!({
        "experiment_digest": input.experiment_digest,
        "protocol_digest": input.protocol_digest,
        "nonce_sha256": sha256_bytes(nonce)
    });
    let batch_id = format!("fbsb-{}", &canonical_sha256(&batch_seed)[..24]);
    let temp_id = format!(".tmp-{batch_id}");
    let temp_dir = root.join(&temp_id);
    let batch_dir = root.join(&batch_id);
    if temp_dir.exists() || batch_dir.exists() {
        return Err("Collision de batch sandbox ForgeBench.".to_string());
    }
    create_private_directory(&temp_dir)?;
    let workspaces_dir = temp_dir.join("workspaces");
    create_private_directory(&workspaces_dir)?;
    let mut runs = Vec::with_capacity(input.stacks.len() * input.seeds.len());
    for (stack_index, stack_key) in input.stacks.iter().enumerate() {
        for (seed_index, seed) in input.seeds.iter().enumerate() {
            let sandbox_seed = json!({
                "batch_id": batch_id,
                "stack_key": stack_key,
                "public_seed": seed,
                "ordinal": stack_index * input.seeds.len() + seed_index
            });
            let sandbox_id = format!("fbs-{}", &canonical_sha256(&sandbox_seed)[..24]);
            let workspace = workspaces_dir.join(&sandbox_id);
            create_private_directory(&workspace)?;
            for (name, bytes, _) in STARTER_FILES {
                write_private_file(&workspace.join(name), bytes)?;
            }
            let contract = run_contract(input, &sandbox_id, stack_key, *seed)?;
            write_json_file(&workspace.join(RUN_CONTRACT_FILE), &contract)?;
            let digest = workspace_digest(&workspace)?;
            runs.push(json!({
                "sandbox_id": sandbox_id,
                "workspace_relative": format!("workspaces/{sandbox_id}"),
                "stack_key": stack_key,
                "public_seed": seed,
                "starter_bundle_sha256": starter_digest,
                "run_contract_digest": contract.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
                "workspace_digest": digest
            }));
        }
    }
    let batch_digest = canonical_sha256(&json!({
        "batch_id": batch_id,
        "experiment_digest": input.experiment_digest,
        "protocol_digest": input.protocol_digest,
        "runs": runs
    }));
    let mut receipt = json!({
        "schema": RECEIPT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "batch_id": batch_id,
        "benchmark_id": BENCHMARK_ID,
        "experiment_id": input.experiment_id,
        "experiment_digest": input.experiment_digest,
        "protocol_digest": input.protocol_digest,
        "candidate_stacks_total": input.stacks.len(),
        "public_seeds_total": input.seeds.len(),
        "workspaces_total": runs.len(),
        "starter_bundle_sha256": starter_digest,
        "batch_digest": batch_digest,
        "created_at_ms": created_at_ms,
        "paths_returned": false,
        "security": {
            "fresh_workspace_per_run": true,
            "workspace_outside_source_repository": true,
            "starter_digest_verified": true,
            "hidden_suite_material_copied": false,
            "credentials_copied": false,
            "source_repository_mounted": false,
            "process_isolation_enforced": false,
            "network_isolation_enforced": false,
            "hidden_suite_access_blocked": false
        },
        "execution": {
            "worker_started": false,
            "command_executed": false,
            "network_called": false,
            "repository_modified": false,
            "api_spend_eur": 0
        },
        "readiness": {
            "workspace_batch_prepared": true,
            "worker_execution_ready": false,
            "scientific_eligible": false,
            "blockers": [
                "worker_process_not_started",
                "process_isolation_not_enforced",
                "network_isolation_not_enforced",
                "hidden_suite_not_worker_inaccessible",
                "isolated_evaluator_not_implemented"
            ]
        }
    });
    sign_document(&mut receipt)?;
    validate_receipt(&receipt)?;
    let mut manifest = json!({
        "schema": MANIFEST_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "receipt": receipt,
        "runs": runs,
        "privacy": {
            "hidden_suite_stored": false,
            "hidden_seed_stored": false,
            "credential_stored": false,
            "source_repository_path_stored": false
        }
    });
    sign_document(&mut manifest)?;
    write_json_file(&temp_dir.join("manifest.json"), &manifest)?;
    fs::rename(&temp_dir, &batch_dir)
        .map_err(|error| format!("Activation du batch sandbox impossible: {error}"))?;
    Ok(manifest)
}

fn relative_workspace_path(value: &str) -> Result<PathBuf, String> {
    let parts = value.split('/').collect::<Vec<_>>();
    if parts.len() != 2 || parts[0] != "workspaces" || !safe_id(parts[1], "fbs-") {
        return Err("Chemin relatif du workspace invalide.".to_string());
    }
    Ok(PathBuf::from(parts[0]).join(parts[1]))
}

fn validate_manifest(root: &Path, manifest: &Value) -> Result<Value, String> {
    if manifest.get("schema").and_then(Value::as_str) != Some(MANIFEST_SCHEMA)
        || manifest
            .pointer("/privacy/hidden_suite_stored")
            .and_then(Value::as_bool)
            != Some(false)
        || manifest
            .pointer("/privacy/hidden_seed_stored")
            .and_then(Value::as_bool)
            != Some(false)
        || manifest
            .pointer("/privacy/credential_stored")
            .and_then(Value::as_bool)
            != Some(false)
        || manifest
            .pointer("/privacy/source_repository_path_stored")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Manifeste sandbox ForgeBench invalide.".to_string());
    }
    verify_integrity(manifest, "du manifeste sandbox")?;
    let receipt = manifest
        .get("receipt")
        .ok_or_else(|| "Recu sandbox absent.".to_string())?;
    validate_receipt(receipt)?;
    let batch_id = receipt
        .get("batch_id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Identifiant du batch sandbox absent.".to_string())?;
    let batch_dir = root.join(batch_id);
    let batch_metadata = fs::symlink_metadata(&batch_dir)
        .map_err(|error| format!("Batch sandbox absent: {error}"))?;
    if !batch_metadata.is_dir() || batch_metadata.file_type().is_symlink() {
        return Err("Dossier du batch sandbox non fiable.".to_string());
    }
    let runs = manifest
        .get("runs")
        .and_then(Value::as_array)
        .ok_or_else(|| "Runs du sandbox absents.".to_string())?;
    if runs.len()
        != receipt
            .get("workspaces_total")
            .and_then(Value::as_u64)
            .unwrap_or_default() as usize
    {
        return Err("Nombre de runs sandbox incoherent.".to_string());
    }
    let mut seen_ids = BTreeSet::new();
    let mut seen_pairs = BTreeSet::new();
    for run in runs {
        let sandbox_id = run
            .get("sandbox_id")
            .and_then(Value::as_str)
            .filter(|value| safe_id(value, "fbs-"))
            .ok_or_else(|| "Identifiant de run sandbox invalide.".to_string())?;
        let stack_key = run
            .get("stack_key")
            .and_then(Value::as_str)
            .filter(|value| safe_stack_key(value))
            .ok_or_else(|| "Stack de run sandbox invalide.".to_string())?;
        let public_seed = run
            .get("public_seed")
            .and_then(Value::as_u64)
            .ok_or_else(|| "Seed public de run sandbox invalide.".to_string())?;
        if !seen_ids.insert(sandbox_id.to_string())
            || !seen_pairs.insert((stack_key.to_string(), public_seed))
        {
            return Err("Run sandbox duplique.".to_string());
        }
        let relative = run
            .get("workspace_relative")
            .and_then(Value::as_str)
            .ok_or_else(|| "Workspace relatif absent.".to_string())?;
        let workspace = batch_dir.join(relative_workspace_path(relative)?);
        let metadata = fs::symlink_metadata(&workspace)
            .map_err(|error| format!("Workspace sandbox absent: {error}"))?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("Workspace sandbox non fiable.".to_string());
        }
        for (name, _, expected_digest) in STARTER_FILES {
            let bytes = fs::read(workspace.join(name))
                .map_err(|error| format!("Starter du workspace illisible: {error}"))?;
            if sha256_bytes(&bytes) != expected_digest {
                return Err(format!("Starter du workspace modifie: {name}."));
            }
        }
        let contract_bytes = fs::read(workspace.join(RUN_CONTRACT_FILE))
            .map_err(|error| format!("Contrat du run sandbox illisible: {error}"))?;
        let contract = serde_json::from_slice::<Value>(&contract_bytes)
            .map_err(|error| format!("Contrat du run sandbox invalide: {error}"))?;
        if contract.get("schema").and_then(Value::as_str) != Some(RUN_CONTRACT_SCHEMA)
            || contract.get("sandbox_id").and_then(Value::as_str) != Some(sandbox_id)
            || contract.get("stack_key").and_then(Value::as_str) != Some(stack_key)
            || contract.get("public_seed").and_then(Value::as_u64) != Some(public_seed)
            || contract
                .pointer("/privacy/hidden_suite_included")
                .and_then(Value::as_bool)
                != Some(false)
            || contract
                .pointer("/privacy/credentials_included")
                .and_then(Value::as_bool)
                != Some(false)
            || contract
                .pointer("/execution/worker_started")
                .and_then(Value::as_bool)
                != Some(false)
        {
            return Err("Contrat du run sandbox trompeur.".to_string());
        }
        let contract_digest = verify_integrity(&contract, "du contrat run sandbox")?;
        if run.get("run_contract_digest").and_then(Value::as_str) != Some(contract_digest.as_str())
            || run.get("workspace_digest").and_then(Value::as_str)
                != Some(workspace_digest(&workspace)?.as_str())
        {
            return Err("Empreinte du workspace sandbox incoherente.".to_string());
        }
    }
    let expected_batch_digest = canonical_sha256(&json!({
        "batch_id": batch_id,
        "experiment_digest": receipt.get("experiment_digest"),
        "protocol_digest": receipt.get("protocol_digest"),
        "runs": runs
    }));
    if receipt.get("batch_digest").and_then(Value::as_str) != Some(expected_batch_digest.as_str()) {
        return Err("Empreinte du batch sandbox incoherente.".to_string());
    }
    Ok(receipt.clone())
}

fn read_active_manifest(root: &Path) -> Result<Option<Value>, String> {
    let active = root.join(ACTIVE_MANIFEST);
    let backup = root.join(ACTIVE_BACKUP);
    if !active.exists() {
        if !backup.exists() {
            return Ok(None);
        }
        let bytes =
            fs::read(&backup).map_err(|error| format!("Backup sandbox illisible: {error}"))?;
        let manifest = serde_json::from_slice::<Value>(&bytes)
            .map_err(|error| format!("Backup sandbox invalide: {error}"))?;
        validate_manifest(root, &manifest)?;
        fs::rename(&backup, &active)
            .map_err(|error| format!("Restauration du sandbox impossible: {error}"))?;
        return Ok(Some(manifest));
    }
    let bytes =
        fs::read(&active).map_err(|error| format!("Manifeste sandbox illisible: {error}"))?;
    match serde_json::from_slice::<Value>(&bytes)
        .map_err(|error| format!("Manifeste sandbox invalide: {error}"))
        .and_then(|manifest| validate_manifest(root, &manifest).map(|_| manifest))
    {
        Ok(manifest) => Ok(Some(manifest)),
        Err(primary_error) if backup.exists() => {
            let backup_bytes =
                fs::read(&backup).map_err(|error| format!("Backup sandbox illisible: {error}"))?;
            let backup_manifest = serde_json::from_slice::<Value>(&backup_bytes)
                .map_err(|error| format!("Backup sandbox invalide: {error}"))?;
            validate_manifest(root, &backup_manifest).map_err(|backup_error| {
                format!("Sandbox et backup invalides: {primary_error}; {backup_error}")
            })?;
            fs::remove_file(&active)
                .map_err(|error| format!("Manifeste sandbox corrompu non supprimable: {error}"))?;
            fs::rename(&backup, &active)
                .map_err(|error| format!("Restauration du backup sandbox impossible: {error}"))?;
            Ok(Some(backup_manifest))
        }
        Err(error) => Err(error),
    }
}

fn status_document(receipt: Option<Value>) -> Value {
    json!({
        "schema": STATUS_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "exists": receipt.is_some(),
        "receipt": receipt,
        "paths_returned": false,
        "hidden_suite_contents_returned": false,
        "worker_started": false,
        "command_executed": false
    })
}

#[tauri::command]
pub(crate) fn get_forgebench_worker_sandbox_status(app: AppHandle) -> Result<Value, String> {
    let root = sandbox_root(&app)?;
    if !root.exists() {
        return Ok(status_document(None));
    }
    create_private_directory(&root)?;
    let receipt = read_active_manifest(&root)?
        .map(|manifest| validate_manifest(&root, &manifest))
        .transpose()?;
    Ok(status_document(receipt))
}

#[tauri::command]
pub(crate) fn prepare_forgebench_worker_sandbox(
    app: AppHandle,
    request: PrepareForgeBenchWorkerSandboxRequest,
) -> Result<PrepareForgeBenchWorkerSandboxResult, String> {
    if request.schema != PREPARE_REQUEST_SCHEMA {
        return Err("Contrat de preparation du sandbox ForgeBench invalide.".to_string());
    }
    let input = batch_input(&request.forgebench_result)?;
    let root = sandbox_root(&app)?;
    create_private_directory(&root)?;
    let existing = read_active_manifest(&root)?;
    if existing.is_some() && request.replace_existing != Some(true) {
        return Err("Un batch sandbox existe deja. Confirmez son remplacement.".to_string());
    }
    let old_batch_id = existing
        .as_ref()
        .and_then(|manifest| manifest.pointer("/receipt/batch_id"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let manifest = create_batch(&root, &input, &random_nonce()?, unix_ms())?;
    let receipt = validate_manifest(&root, &manifest)?;
    if let Err(error) = atomic_write_json(
        &root.join(ACTIVE_MANIFEST),
        &root.join(ACTIVE_BACKUP),
        &manifest,
    ) {
        if let Some(batch_id) = receipt.get("batch_id").and_then(Value::as_str) {
            let _ = fs::remove_dir_all(root.join(batch_id));
        }
        return Err(error);
    }
    if let Some(old_batch_id) = old_batch_id {
        if receipt.get("batch_id").and_then(Value::as_str) != Some(old_batch_id.as_str()) {
            let _ = fs::remove_dir_all(root.join(old_batch_id));
        }
    }
    if root.join(ACTIVE_BACKUP).exists() {
        let _ = fs::remove_file(root.join(ACTIVE_BACKUP));
    }
    Ok(PrepareForgeBenchWorkerSandboxResult {
        schema: PREPARE_RESULT_SCHEMA.to_string(),
        contract_version: CONTRACT_VERSION.to_string(),
        prepared: true,
        replaced: existing.is_some(),
        worker_started: false,
        command_executed: false,
        paths_returned: false,
        receipt,
    })
}

#[tauri::command]
pub(crate) fn clear_forgebench_worker_sandbox(app: AppHandle) -> Result<Value, String> {
    let root = sandbox_root(&app)?;
    if root.exists() {
        let metadata = fs::symlink_metadata(&root)
            .map_err(|error| format!("Dossier sandbox illisible: {error}"))?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("Le dossier sandbox refuse la suppression de securite.".to_string());
        }
        fs::remove_dir_all(&root)
            .map_err(|error| format!("Suppression du sandbox impossible: {error}"))?;
    }
    Ok(status_document(None))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(label: &str) -> PathBuf {
        let nonce = random_nonce().expect("test entropy");
        std::env::temp_dir().join(format!(
            "outilsia-forgebench-sandbox-{label}-{}",
            &sha256_bytes(&nonce)[..16]
        ))
    }

    fn test_input() -> BatchInput {
        BatchInput {
            experiment_id: "fb-test-signal-maze".to_string(),
            experiment_digest: "a".repeat(64),
            protocol_digest: "b".repeat(64),
            benchmark_version: "1.0.0-exploratory".to_string(),
            stacks: vec!["codex-solo".to_string(), "claude-solo".to_string()],
            seeds: vec![17011, 17029, 17047],
            public_task: json!({"objective": "public", "rules": ["public-rule"]}),
            visible_checks: json!([{"id": "load-no-error"}]),
            viewports: json!([{"id": "desktop", "width": 1440, "height": 900}]),
            budgets: json!({"network_access": false}),
            permissions: json!({"starter_write": true, "hidden_tests_read": false}),
        }
    }

    #[test]
    fn materializes_one_fresh_verified_workspace_per_stack_and_seed() {
        let root = test_root("batch");
        create_private_directory(&root).unwrap();
        let manifest = create_batch(&root, &test_input(), &[7_u8; 16], 1_000).unwrap();
        let receipt = validate_manifest(&root, &manifest).expect("valid sandbox batch");
        assert_eq!(receipt["workspaces_total"], 6);
        assert_eq!(receipt["security"]["fresh_workspace_per_run"], true);
        assert_eq!(receipt["security"]["process_isolation_enforced"], false);
        assert_eq!(receipt["readiness"]["scientific_eligible"], false);
        let serialized = serde_json::to_string(&receipt).unwrap();
        assert!(!serialized.contains("workspace_relative"));
        assert!(!serialized.contains("17011"));
        assert!(!serialized.contains("hidden_seeds"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn detects_starter_or_contract_tampering() {
        let root = test_root("tamper");
        create_private_directory(&root).unwrap();
        let manifest = create_batch(&root, &test_input(), &[8_u8; 16], 1_000).unwrap();
        let workspace_relative = manifest["runs"][0]["workspace_relative"].as_str().unwrap();
        let batch_id = manifest["receipt"]["batch_id"].as_str().unwrap();
        fs::write(
            root.join(batch_id).join(workspace_relative).join("game.js"),
            b"tampered",
        )
        .unwrap();
        assert!(validate_manifest(&root, &manifest).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_forged_isolation_claims_even_when_rehashed() {
        let root = test_root("forged");
        create_private_directory(&root).unwrap();
        let manifest = create_batch(&root, &test_input(), &[9_u8; 16], 1_000).unwrap();
        let mut forged = manifest["receipt"].clone();
        forged["security"]["hidden_suite_access_blocked"] = json!(true);
        forged["security"]["process_isolation_enforced"] = json!(true);
        forged["readiness"]["scientific_eligible"] = json!(true);
        sign_document(&mut forged).unwrap();
        assert!(validate_receipt(&forged).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn restores_a_verified_backup_when_the_active_manifest_is_corrupt() {
        let root = test_root("backup");
        create_private_directory(&root).unwrap();
        let manifest = create_batch(&root, &test_input(), &[10_u8; 16], 1_000).unwrap();
        write_json_file(&root.join(ACTIVE_BACKUP), &manifest).unwrap();
        fs::write(root.join(ACTIVE_MANIFEST), b"{corrupt").unwrap();
        let restored = read_active_manifest(&root)
            .expect("backup recovery")
            .expect("restored manifest");
        assert_eq!(
            restored["receipt"]["batch_id"],
            manifest["receipt"]["batch_id"]
        );
        assert!(!root.join(ACTIVE_BACKUP).exists());
        validate_manifest(&root, &restored).expect("restored manifest valid");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn embedded_starter_matches_the_public_manifest_digest() {
        assert_eq!(starter_bundle_digest().unwrap(), STARTER_BUNDLE_SHA256);
    }
}
