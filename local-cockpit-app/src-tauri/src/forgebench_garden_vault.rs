use crate::forgebench_garden::GARDEN_BENCHMARK_ID;
use crate::workstack_composer::canonical_sha256;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const SEAL_REQUEST_SCHEMA: &str = "outilsia.forgebench_garden_hidden_suite_seal_request.v1";
const SEAL_RESULT_SCHEMA: &str = "outilsia.forgebench_garden_hidden_suite_seal_result.v1";
const STATUS_SCHEMA: &str = "outilsia.forgebench_garden_hidden_suite_status.v1";
const SUITE_SCHEMA: &str = "outilsia.forgebench_garden_hidden_suite.v1";
pub(crate) const RECEIPT_SCHEMA: &str = "outilsia.forgebench_garden_hidden_suite_receipt.v1";
const CONTRACT_VERSION: &str = "2026-07-24";
const VAULT_FILENAME: &str = "forgebench-garden-hidden-suite-v1.json";
const MIN_HIDDEN_SCENARIOS: usize = 3;
const DEFAULT_HIDDEN_SCENARIOS: usize = 5;
const MAX_HIDDEN_SCENARIOS: usize = 12;
const MAX_VAULT_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone)]
pub(crate) struct GardenHiddenSuiteMaterial {
    pub(crate) receipt: Value,
    pub(crate) hidden_seeds: Vec<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct SealGardenHiddenSuiteRequest {
    schema: String,
    benchmark_id: String,
    hidden_scenario_count: Option<usize>,
    replace_existing: Option<bool>,
}

fn vault_lock() -> &'static Mutex<()> {
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

fn is_hex(value: &str, expected_len: usize) -> bool {
    value.len() == expected_len && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn hex_bytes(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn sign_document(document: &mut Value) -> Result<(), String> {
    document
        .as_object_mut()
        .ok_or_else(|| "Document du coffre Garden invalide.".to_string())?
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

fn suite_identity(nonce: &str, seeds: &[Value]) -> String {
    let seed = json!({
        "benchmark_id": GARDEN_BENCHMARK_ID,
        "seal_nonce_hex": nonce,
        "hidden_seeds": seeds,
        "generator": "garden-bamboo-hidden-scenario-generator-v1"
    });
    format!("ghs-{}", &canonical_sha256(&seed)[..24])
}

fn validate_suite(suite: &Value) -> Result<(), String> {
    if suite.get("schema").and_then(Value::as_str) != Some(SUITE_SCHEMA)
        || suite.pointer("/benchmark/id").and_then(Value::as_str) != Some(GARDEN_BENCHMARK_ID)
        || suite.get("storage").and_then(Value::as_str) != Some("local_app_data")
        || suite
            .pointer("/privacy/hidden_seeds_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || suite
            .pointer("/privacy/hidden_scenarios_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || suite
            .pointer("/isolation/candidate_sources_frozen_before_read")
            .and_then(Value::as_bool)
            != Some(true)
        || suite
            .pointer("/isolation/same_scenarios_for_all_candidates")
            .and_then(Value::as_bool)
            != Some(true)
    {
        return Err("Contrat du coffre Garden non conforme.".to_string());
    }
    let nonce = suite
        .get("seal_nonce_hex")
        .and_then(Value::as_str)
        .filter(|value| is_hex(value, 64))
        .ok_or_else(|| "Nonce du coffre Garden invalide.".to_string())?;
    let seeds = suite
        .get("hidden_seeds")
        .and_then(Value::as_array)
        .ok_or_else(|| "Seeds du coffre Garden absents.".to_string())?;
    let unique = seeds
        .iter()
        .filter_map(Value::as_u64)
        .collect::<BTreeSet<_>>();
    if !(MIN_HIDDEN_SCENARIOS..=MAX_HIDDEN_SCENARIOS).contains(&seeds.len())
        || unique.len() != seeds.len()
        || unique.iter().any(|seed| *seed < 100_000)
    {
        return Err("Seeds du coffre Garden invalides.".to_string());
    }
    let expected_id = suite_identity(nonce, seeds);
    if suite.get("suite_id").and_then(Value::as_str) != Some(expected_id.as_str()) {
        return Err("Identite du coffre Garden incoherente.".to_string());
    }
    verify_integrity(suite, "de la suite Garden")?;
    Ok(())
}

fn receipt_for_suite(suite: &Value) -> Result<Value, String> {
    validate_suite(suite)?;
    let mut receipt = json!({
        "schema": RECEIPT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "suite_id": suite.get("suite_id").cloned().unwrap_or(Value::Null),
        "benchmark": suite.get("benchmark").cloned().unwrap_or(Value::Null),
        "created_at_ms": suite.get("created_at_ms").cloned().unwrap_or(Value::Null),
        "hidden_scenarios_total": suite.get("hidden_seeds").and_then(Value::as_array).map_or(0, Vec::len),
        "suite_digest": suite.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
        "storage": "local_app_data",
        "privacy": {
            "contents_returned": false,
            "hidden_seeds_returned": false,
            "hidden_scenarios_returned": false,
            "vault_path_returned": false
        },
        "isolation": {
            "candidate_sources_frozen_before_read": true,
            "same_scenarios_for_all_candidates": true,
            "candidate_code_execution": false,
            "dsl_only": true
        }
    });
    sign_document(&mut receipt)?;
    validate_garden_hidden_suite_receipt(&receipt)?;
    Ok(receipt)
}

pub(crate) fn validate_garden_hidden_suite_receipt(receipt: &Value) -> Result<(), String> {
    if receipt.get("schema").and_then(Value::as_str) != Some(RECEIPT_SCHEMA)
        || receipt.pointer("/benchmark/id").and_then(Value::as_str) != Some(GARDEN_BENCHMARK_ID)
        || receipt
            .pointer("/privacy/contents_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/privacy/hidden_seeds_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/privacy/vault_path_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/isolation/candidate_sources_frozen_before_read")
            .and_then(Value::as_bool)
            != Some(true)
        || receipt
            .pointer("/isolation/same_scenarios_for_all_candidates")
            .and_then(Value::as_bool)
            != Some(true)
        || receipt
            .pointer("/isolation/candidate_code_execution")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Recu du coffre Garden non conforme.".to_string());
    }
    if !(MIN_HIDDEN_SCENARIOS as u64..=MAX_HIDDEN_SCENARIOS as u64).contains(
        &receipt
            .get("hidden_scenarios_total")
            .and_then(Value::as_u64)
            .unwrap_or_default(),
    ) || !receipt
        .get("suite_digest")
        .and_then(Value::as_str)
        .is_some_and(is_sha256)
    {
        return Err("Metadonnees du recu Garden invalides.".to_string());
    }
    verify_integrity(receipt, "du recu Garden")?;
    Ok(())
}

fn create_suite(entropy: &[u8], count: usize, created_at_ms: u128) -> Result<Value, String> {
    if !(MIN_HIDDEN_SCENARIOS..=MAX_HIDDEN_SCENARIOS).contains(&count)
        || entropy.len() < 32 + count * 8
    {
        return Err("Entropie du coffre Garden insuffisante.".to_string());
    }
    let nonce = hex_bytes(&entropy[..32]);
    let mut seeds = Vec::with_capacity(count);
    let mut seen = BTreeSet::new();
    for index in 0..count {
        let start = 32 + index * 8;
        let mut bytes = [0_u8; 8];
        bytes.copy_from_slice(&entropy[start..start + 8]);
        let mut seed = u64::from_le_bytes(bytes) % 4_000_000_000 + 100_000;
        while !seen.insert(seed) {
            seed = seed.saturating_add(1);
        }
        seeds.push(Value::from(seed));
    }
    let suite_id = suite_identity(&nonce, &seeds);
    let mut suite = json!({
        "schema": SUITE_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "suite_id": suite_id,
        "benchmark": {
            "id": GARDEN_BENCHMARK_ID,
            "track": "outilsia_exploratory_generalization"
        },
        "created_at_ms": created_at_ms,
        "storage": "local_app_data",
        "seal_nonce_hex": nonce,
        "hidden_seeds": seeds,
        "generator": "garden-bamboo-hidden-scenario-generator-v1",
        "privacy": {
            "hidden_seeds_returned": false,
            "hidden_scenarios_returned": false,
            "vault_path_returned": false
        },
        "security": {
            "encrypted_at_rest": false,
            "os_user_permissions_only": true
        },
        "isolation": {
            "candidate_sources_frozen_before_read": true,
            "same_scenarios_for_all_candidates": true,
            "candidate_code_execution": false,
            "dsl_only": true
        }
    });
    sign_document(&mut suite)?;
    validate_suite(&suite)?;
    Ok(suite)
}

#[cfg(test)]
pub(crate) fn test_garden_hidden_suite_receipt(count: usize) -> Value {
    let entropy = (0..32 + count * 8)
        .map(|index| (index as u8).wrapping_add(71))
        .collect::<Vec<_>>();
    let suite = create_suite(&entropy, count, 1_000).expect("test Garden Hidden Suite");
    receipt_for_suite(&suite).expect("test Garden Hidden Suite receipt")
}

fn vault_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Dossier app data indisponible: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Dossier du coffre Garden impossible a creer: {error}"))?;
    Ok(directory.join(VAULT_FILENAME))
}

fn backup_path(path: &Path) -> PathBuf {
    path.with_extension("json.bak")
}

fn temporary_path(path: &Path) -> PathBuf {
    path.with_extension("json.tmp")
}

fn set_private_permissions(_path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(_path, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("Permissions du coffre Garden impossibles: {error}"))?;
    }
    Ok(())
}

fn write_suite(path: &Path, suite: &Value) -> Result<(), String> {
    validate_suite(suite)?;
    let bytes = serde_json::to_vec_pretty(suite)
        .map_err(|error| format!("Suite Garden non serialisable: {error}"))?;
    if bytes.len() > MAX_VAULT_BYTES {
        return Err("Suite Garden trop volumineuse.".to_string());
    }
    let temporary = temporary_path(path);
    let backup = backup_path(path);
    if temporary.exists() {
        let _ = fs::remove_file(&temporary);
    }
    fs::write(&temporary, bytes)
        .map_err(|error| format!("Ecriture temporaire du coffre Garden impossible: {error}"))?;
    set_private_permissions(&temporary)?;
    if backup.exists() {
        fs::remove_file(&backup)
            .map_err(|error| format!("Ancien backup Garden impossible a retirer: {error}"))?;
    }
    if path.exists() {
        fs::rename(path, &backup)
            .map_err(|error| format!("Backup du coffre Garden impossible: {error}"))?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        if backup.exists() && !path.exists() {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&temporary);
        return Err(format!("Validation du coffre Garden impossible: {error}"));
    }
    set_private_permissions(path)?;
    if backup.exists() {
        let _ = fs::remove_file(backup);
    }
    Ok(())
}

fn read_suite_file(path: &Path) -> Result<Value, String> {
    let bytes =
        fs::read(path).map_err(|error| format!("Lecture du coffre Garden impossible: {error}"))?;
    if bytes.len() > MAX_VAULT_BYTES {
        return Err("Suite Garden locale trop volumineuse.".to_string());
    }
    let suite = serde_json::from_slice::<Value>(&bytes)
        .map_err(|error| format!("Suite Garden locale corrompue: {error}"))?;
    validate_suite(&suite)?;
    Ok(suite)
}

fn read_suite_path(path: &Path) -> Result<Option<Value>, String> {
    if path.exists() {
        return read_suite_file(path).map(Some);
    }
    let backup = backup_path(path);
    if backup.exists() {
        let suite = read_suite_file(&backup)?;
        fs::rename(&backup, path)
            .map_err(|error| format!("Restauration du coffre Garden impossible: {error}"))?;
        set_private_permissions(path)?;
        return Ok(Some(suite));
    }
    Ok(None)
}

fn status_document(receipt: Option<Value>) -> Value {
    json!({
        "schema": STATUS_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "exists": receipt.is_some(),
        "receipt": receipt,
        "contents_returned": false,
        "vault_path_returned": false
    })
}

pub(crate) fn garden_hidden_suite_material(
    app: &AppHandle,
) -> Result<Option<GardenHiddenSuiteMaterial>, String> {
    let _guard = vault_lock()
        .lock()
        .map_err(|_| "Verrou du coffre Garden indisponible.".to_string())?;
    let Some(suite) = read_suite_path(&vault_path(app)?)? else {
        return Ok(None);
    };
    let receipt = receipt_for_suite(&suite)?;
    let hidden_seeds = suite
        .get("hidden_seeds")
        .and_then(Value::as_array)
        .ok_or_else(|| "Seeds du coffre Garden absents.".to_string())?
        .iter()
        .map(|seed| {
            seed.as_u64()
                .ok_or_else(|| "Seed du coffre Garden invalide.".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Some(GardenHiddenSuiteMaterial {
        receipt,
        hidden_seeds,
    }))
}

#[tauri::command]
pub(crate) fn get_forgebench_garden_hidden_suite_status(app: AppHandle) -> Result<Value, String> {
    let _guard = vault_lock()
        .lock()
        .map_err(|_| "Verrou du coffre Garden indisponible.".to_string())?;
    let receipt = read_suite_path(&vault_path(&app)?)?
        .map(|suite| receipt_for_suite(&suite))
        .transpose()?;
    Ok(status_document(receipt))
}

#[tauri::command]
pub(crate) fn seal_forgebench_garden_hidden_suite(
    app: AppHandle,
    request: SealGardenHiddenSuiteRequest,
) -> Result<Value, String> {
    if request.schema != SEAL_REQUEST_SCHEMA || request.benchmark_id != GARDEN_BENCHMARK_ID {
        return Err("Contrat de scellement du coffre Garden invalide.".to_string());
    }
    let count = request
        .hidden_scenario_count
        .unwrap_or(DEFAULT_HIDDEN_SCENARIOS);
    if !(MIN_HIDDEN_SCENARIOS..=MAX_HIDDEN_SCENARIOS).contains(&count) {
        return Err("Nombre de scenarios caches Garden invalide.".to_string());
    }
    let replace = request.replace_existing.unwrap_or(false);
    let _guard = vault_lock()
        .lock()
        .map_err(|_| "Verrou du coffre Garden indisponible.".to_string())?;
    let path = vault_path(&app)?;
    let existing = read_suite_path(&path)?;
    let had_existing = existing.is_some();
    if !replace {
        if let Some(suite) = existing.as_ref() {
            return Ok(json!({
                "schema": SEAL_RESULT_SCHEMA,
                "contract_version": CONTRACT_VERSION,
                "created": false,
                "replaced": false,
                "receipt": receipt_for_suite(suite)?,
                "contents_returned": false
            }));
        }
    }
    let mut entropy = vec![0_u8; 32 + count * 8];
    getrandom::fill(&mut entropy)
        .map_err(|error| format!("Entropie systeme indisponible: {error}"))?;
    let suite = create_suite(&entropy, count, unix_ms())?;
    write_suite(&path, &suite)?;
    Ok(json!({
        "schema": SEAL_RESULT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "created": !had_existing,
        "replaced": had_existing,
        "receipt": receipt_for_suite(&suite)?,
        "contents_returned": false
    }))
}

#[tauri::command]
pub(crate) fn clear_forgebench_garden_hidden_suite(app: AppHandle) -> Result<Value, String> {
    let _guard = vault_lock()
        .lock()
        .map_err(|_| "Verrou du coffre Garden indisponible.".to_string())?;
    let path = vault_path(&app)?;
    let existed = path.exists() || backup_path(&path).exists();
    for candidate in [path.clone(), backup_path(&path), temporary_path(&path)] {
        if candidate.exists() {
            fs::remove_file(candidate)
                .map_err(|error| format!("Effacement du coffre Garden impossible: {error}"))?;
        }
    }
    Ok(json!({
        "schema": STATUS_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "exists": false,
        "cleared": existed,
        "receipt": Value::Null,
        "contents_returned": false,
        "vault_path_returned": false
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_suite(count: usize) -> Value {
        let entropy = (0..32 + count * 8)
            .map(|index| (index as u8).wrapping_add(71))
            .collect::<Vec<_>>();
        create_suite(&entropy, count, 1_000).expect("suite")
    }

    #[test]
    fn receipt_never_contains_hidden_material() {
        let suite = test_suite(5);
        let receipt = receipt_for_suite(&suite).expect("receipt");
        let serialized = serde_json::to_string(&receipt).expect("json");
        for seed in suite["hidden_seeds"].as_array().expect("seeds") {
            assert!(!serialized.contains(&seed.to_string()));
        }
        assert_eq!(receipt["privacy"]["contents_returned"], false);
        assert_eq!(receipt["hidden_scenarios_total"], 5);
    }

    #[test]
    fn suite_rejects_tampering_and_duplicate_seeds() {
        let mut suite = test_suite(5);
        suite["hidden_seeds"][1] = suite["hidden_seeds"][0].clone();
        assert!(validate_suite(&suite).is_err());
    }

    #[test]
    fn receipt_integrity_is_enforced() {
        let suite = test_suite(3);
        let mut receipt = receipt_for_suite(&suite).expect("receipt");
        receipt["hidden_scenarios_total"] = json!(12);
        assert!(validate_garden_hidden_suite_receipt(&receipt).is_err());
    }
}
