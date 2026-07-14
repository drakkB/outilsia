use crate::workstack_composer::canonical_sha256;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const SEAL_REQUEST_SCHEMA: &str = "outilsia.forgebench_hidden_suite_seal_request.v1";
const SEAL_RESULT_SCHEMA: &str = "outilsia.forgebench_hidden_suite_seal_result.v1";
const STATUS_SCHEMA: &str = "outilsia.forgebench_hidden_suite_status.v1";
const SUITE_SCHEMA: &str = "outilsia.forgebench_hidden_suite.v1";
const RECEIPT_SCHEMA: &str = "outilsia.forgebench_hidden_suite_receipt.v1";
const CONTRACT_VERSION: &str = "2026-07-12";
const BENCHMARK_ID: &str = "signal-maze-v1";
const VAULT_FILENAME: &str = "forgebench-hidden-suite-v1.json";
const MIN_HIDDEN_SEEDS: usize = 3;
const DEFAULT_HIDDEN_SEEDS: usize = 5;
const MAX_HIDDEN_SEEDS: usize = 16;
const MAX_VAULT_BYTES: usize = 64 * 1024;
const PRIVATE_CHECKS: [&str; 5] = [
    "seed-boundary-cases",
    "path-collision-guards",
    "reset-state-purity",
    "mobile-rotation-resilience",
    "invalid-input-rejection",
];

#[derive(Debug, Clone)]
pub(crate) struct HiddenSuiteMaterial {
    pub(crate) suite_id: String,
    pub(crate) suite_digest: String,
    pub(crate) receipt_digest: String,
    pub(crate) hidden_seeds: Vec<u64>,
    pub(crate) private_checks_total: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct SealHiddenSuiteRequest {
    schema: String,
    benchmark_id: String,
    hidden_seed_count: Option<usize>,
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
        .ok_or_else(|| "Document Hidden Suite invalide.".to_string())?
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

fn suite_identity(nonce: &str, seeds: &[Value], checks: &[Value]) -> String {
    let seed = json!({
        "benchmark_id": BENCHMARK_ID,
        "seal_nonce_hex": nonce,
        "hidden_seeds": seeds,
        "private_checks": checks
    });
    format!("hs-{}", &canonical_sha256(&seed)[..24])
}

fn validate_hidden_suite(suite: &Value) -> Result<(), String> {
    if suite.get("schema").and_then(Value::as_str) != Some(SUITE_SCHEMA)
        || suite.pointer("/benchmark/id").and_then(Value::as_str) != Some(BENCHMARK_ID)
        || suite.get("storage").and_then(Value::as_str) != Some("local_app_data")
        || suite
            .pointer("/privacy/hidden_seeds_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || suite
            .pointer("/privacy/private_checks_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || suite
            .pointer("/security/encrypted_at_rest")
            .and_then(Value::as_bool)
            != Some(false)
        || suite
            .pointer("/isolation/worker_access_blocked")
            .and_then(Value::as_bool)
            != Some(false)
        || suite
            .pointer("/isolation/evaluator_isolated")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Contrat Hidden Suite non conforme.".to_string());
    }
    let nonce = suite
        .get("seal_nonce_hex")
        .and_then(Value::as_str)
        .filter(|value| is_hex(value, 64))
        .ok_or_else(|| "Nonce Hidden Suite invalide.".to_string())?;
    let seeds = suite
        .get("hidden_seeds")
        .and_then(Value::as_array)
        .ok_or_else(|| "Seeds prives absents.".to_string())?;
    let unique_seeds = seeds
        .iter()
        .filter_map(Value::as_u64)
        .collect::<BTreeSet<_>>();
    if !(MIN_HIDDEN_SEEDS..=MAX_HIDDEN_SEEDS).contains(&seeds.len())
        || unique_seeds.len() != seeds.len()
        || unique_seeds.iter().any(|seed| *seed < 100_000)
    {
        return Err("Seeds prives Hidden Suite invalides.".to_string());
    }
    let checks = suite
        .get("private_checks")
        .and_then(Value::as_array)
        .ok_or_else(|| "Checks prives absents.".to_string())?;
    let expected_checks = PRIVATE_CHECKS
        .iter()
        .map(|value| Value::String((*value).to_string()))
        .collect::<Vec<_>>();
    if *checks != expected_checks {
        return Err("Checks prives Hidden Suite modifies.".to_string());
    }
    let expected_id = suite_identity(nonce, seeds, checks);
    if suite.get("suite_id").and_then(Value::as_str) != Some(expected_id.as_str()) {
        return Err("Identite Hidden Suite incoherente.".to_string());
    }
    verify_integrity(suite, "de la Hidden Suite")?;
    Ok(())
}

fn receipt_for_suite(suite: &Value) -> Result<Value, String> {
    validate_hidden_suite(suite)?;
    let mut receipt = json!({
        "schema": RECEIPT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "suite_id": suite.get("suite_id").cloned().unwrap_or(Value::Null),
        "benchmark": suite.get("benchmark").cloned().unwrap_or(Value::Null),
        "created_at_ms": suite.get("created_at_ms").cloned().unwrap_or(Value::Null),
        "hidden_seeds_total": suite.get("hidden_seeds").and_then(Value::as_array).map_or(0, Vec::len),
        "private_checks_total": suite.get("private_checks").and_then(Value::as_array).map_or(0, Vec::len),
        "suite_digest": suite.pointer("/integrity/digest").cloned().unwrap_or(Value::Null),
        "storage": "local_app_data",
        "privacy": {
            "hidden_seeds_returned": false,
            "private_check_ids_returned": false,
            "suite_contents_returned": false,
            "vault_path_returned": false
        },
        "security": {
            "encrypted_at_rest": false,
            "os_user_permissions_only": true,
            "worker_access_blocked": false,
            "evaluator_isolated": false
        },
        "readiness": {
            "locally_sealed": true,
            "scientific_eligible": false,
            "blockers": ["worker_sandbox_not_implemented", "isolated_evaluator_not_implemented"]
        }
    });
    sign_document(&mut receipt)?;
    Ok(receipt)
}

pub(crate) fn validate_hidden_suite_receipt(receipt: &Value) -> Result<(), String> {
    if receipt.get("schema").and_then(Value::as_str) != Some(RECEIPT_SCHEMA)
        || receipt.pointer("/benchmark/id").and_then(Value::as_str) != Some(BENCHMARK_ID)
        || receipt
            .pointer("/privacy/suite_contents_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/privacy/hidden_seeds_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/privacy/private_check_ids_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/privacy/vault_path_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/security/encrypted_at_rest")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/security/worker_access_blocked")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/security/evaluator_isolated")
            .and_then(Value::as_bool)
            != Some(false)
        || receipt
            .pointer("/readiness/locally_sealed")
            .and_then(Value::as_bool)
            != Some(true)
        || receipt
            .pointer("/readiness/scientific_eligible")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Recu Hidden Suite non conforme.".to_string());
    }
    let blockers = receipt
        .pointer("/readiness/blockers")
        .and_then(Value::as_array)
        .ok_or_else(|| "Blocages du recu Hidden Suite absents.".to_string())?;
    for required in [
        "worker_sandbox_not_implemented",
        "isolated_evaluator_not_implemented",
    ] {
        if !blockers
            .iter()
            .any(|value| value.as_str() == Some(required))
        {
            return Err("Blocages du recu Hidden Suite incomplets.".to_string());
        }
    }
    let suite_id = receipt
        .get("suite_id")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !suite_id.starts_with("hs-")
        || suite_id.len() > 64
        || !suite_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        || !receipt
            .get("suite_digest")
            .and_then(Value::as_str)
            .is_some_and(is_sha256)
    {
        return Err("Identite du recu Hidden Suite invalide.".to_string());
    }
    let seed_count = receipt
        .get("hidden_seeds_total")
        .and_then(Value::as_u64)
        .unwrap_or_default() as usize;
    if !(MIN_HIDDEN_SEEDS..=MAX_HIDDEN_SEEDS).contains(&seed_count)
        || receipt.get("private_checks_total").and_then(Value::as_u64)
            != Some(PRIVATE_CHECKS.len() as u64)
    {
        return Err("Compteurs du recu Hidden Suite invalides.".to_string());
    }
    verify_integrity(receipt, "du recu Hidden Suite")?;
    Ok(())
}

fn create_hidden_suite(
    entropy: &[u8],
    seed_count: usize,
    created_at_ms: u128,
) -> Result<Value, String> {
    if !(MIN_HIDDEN_SEEDS..=MAX_HIDDEN_SEEDS).contains(&seed_count)
        || entropy.len() < 32 + seed_count * 8
    {
        return Err("Entropie Hidden Suite insuffisante.".to_string());
    }
    let nonce = hex_bytes(&entropy[..32]);
    let mut seeds = Vec::with_capacity(seed_count);
    let mut seen = BTreeSet::new();
    for index in 0..seed_count {
        let start = 32 + index * 8;
        let mut bytes = [0_u8; 8];
        bytes.copy_from_slice(&entropy[start..start + 8]);
        let mut seed = u64::from_le_bytes(bytes) % 4_000_000_000 + 100_000;
        while !seen.insert(seed) {
            seed = seed.saturating_add(1);
        }
        seeds.push(Value::from(seed));
    }
    let checks = PRIVATE_CHECKS
        .iter()
        .map(|value| Value::String((*value).to_string()))
        .collect::<Vec<_>>();
    let suite_id = suite_identity(&nonce, &seeds, &checks);
    let mut suite = json!({
        "schema": SUITE_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "suite_id": suite_id,
        "benchmark": {"id": BENCHMARK_ID, "version": "1.0.0-exploratory"},
        "created_at_ms": created_at_ms,
        "storage": "local_app_data",
        "seal_nonce_hex": nonce,
        "hidden_seeds": seeds,
        "private_checks": checks,
        "privacy": {
            "hidden_seeds_returned": false,
            "private_checks_returned": false,
            "vault_path_returned": false
        },
        "security": {
            "encrypted_at_rest": false,
            "os_user_permissions_only": true
        },
        "isolation": {
            "worker_access_blocked": false,
            "evaluator_isolated": false
        }
    });
    sign_document(&mut suite)?;
    validate_hidden_suite(&suite)?;
    Ok(suite)
}

#[cfg(test)]
pub(crate) fn test_hidden_suite_receipt() -> Value {
    let entropy = (0..32 + DEFAULT_HIDDEN_SEEDS * 8)
        .map(|index| (index as u8).wrapping_add(29))
        .collect::<Vec<_>>();
    let suite =
        create_hidden_suite(&entropy, DEFAULT_HIDDEN_SEEDS, 1_000).expect("test Hidden Suite");
    receipt_for_suite(&suite).expect("test Hidden Suite receipt")
}

fn vault_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Dossier app data indisponible: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Dossier Hidden Suite impossible a creer: {error}"))?;
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
            .map_err(|error| format!("Permissions Hidden Suite impossibles: {error}"))?;
    }
    Ok(())
}

fn write_suite_path(path: &Path, suite: &Value) -> Result<(), String> {
    validate_hidden_suite(suite)?;
    let bytes = serde_json::to_vec_pretty(suite)
        .map_err(|error| format!("Hidden Suite non serialisable: {error}"))?;
    if bytes.len() > MAX_VAULT_BYTES {
        return Err("Hidden Suite trop volumineuse.".to_string());
    }
    let temporary = temporary_path(path);
    let backup = backup_path(path);
    if temporary.exists() {
        let _ = fs::remove_file(&temporary);
    }
    fs::write(&temporary, bytes)
        .map_err(|error| format!("Ecriture temporaire Hidden Suite impossible: {error}"))?;
    set_private_permissions(&temporary)?;
    if backup.exists() {
        fs::remove_file(&backup)
            .map_err(|error| format!("Ancien backup Hidden Suite impossible a retirer: {error}"))?;
    }
    if path.exists() {
        fs::rename(path, &backup)
            .map_err(|error| format!("Backup Hidden Suite impossible: {error}"))?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        if backup.exists() && !path.exists() {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&temporary);
        return Err(format!("Validation Hidden Suite impossible: {error}"));
    }
    set_private_permissions(path)?;
    if backup.exists() {
        let _ = fs::remove_file(backup);
    }
    Ok(())
}

fn read_suite_file(path: &Path) -> Result<Value, String> {
    let bytes =
        fs::read(path).map_err(|error| format!("Lecture Hidden Suite impossible: {error}"))?;
    if bytes.len() > MAX_VAULT_BYTES {
        return Err("Hidden Suite locale trop volumineuse.".to_string());
    }
    let suite = serde_json::from_slice::<Value>(&bytes)
        .map_err(|error| format!("Hidden Suite locale corrompue: {error}"))?;
    validate_hidden_suite(&suite)?;
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
            .map_err(|error| format!("Restauration Hidden Suite impossible: {error}"))?;
        set_private_permissions(path)?;
        return Ok(Some(suite));
    }
    Ok(None)
}

pub(crate) fn hidden_suite_receipt(app: &AppHandle) -> Result<Option<Value>, String> {
    read_suite_path(&vault_path(app)?)?
        .map(|suite| receipt_for_suite(&suite))
        .transpose()
}

pub(crate) fn hidden_suite_material(
    app: &AppHandle,
) -> Result<Option<HiddenSuiteMaterial>, String> {
    let _guard = vault_lock()
        .lock()
        .map_err(|_| "Verrou Hidden Suite indisponible.".to_string())?;
    let Some(suite) = read_suite_path(&vault_path(app)?)? else {
        return Ok(None);
    };
    validate_hidden_suite(&suite)?;
    let receipt = receipt_for_suite(&suite)?;
    let hidden_seeds = suite
        .get("hidden_seeds")
        .and_then(Value::as_array)
        .ok_or_else(|| "Seeds prives Hidden Suite absents.".to_string())?
        .iter()
        .map(|seed| {
            seed.as_u64()
                .ok_or_else(|| "Seed prive Hidden Suite invalide.".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Some(HiddenSuiteMaterial {
        suite_id: suite
            .get("suite_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        suite_digest: suite
            .pointer("/integrity/digest")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        receipt_digest: receipt
            .pointer("/integrity/digest")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        hidden_seeds,
        private_checks_total: PRIVATE_CHECKS.len(),
    }))
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

#[tauri::command]
pub(crate) fn get_forgebench_hidden_suite_status(app: AppHandle) -> Result<Value, String> {
    let _guard = vault_lock()
        .lock()
        .map_err(|_| "Verrou Hidden Suite indisponible.".to_string())?;
    Ok(status_document(hidden_suite_receipt(&app)?))
}

#[tauri::command]
pub(crate) fn seal_forgebench_hidden_suite(
    app: AppHandle,
    request: SealHiddenSuiteRequest,
) -> Result<Value, String> {
    if request.schema != SEAL_REQUEST_SCHEMA || request.benchmark_id != BENCHMARK_ID {
        return Err("Contrat de scellement Hidden Suite invalide.".to_string());
    }
    let seed_count = request.hidden_seed_count.unwrap_or(DEFAULT_HIDDEN_SEEDS);
    if !(MIN_HIDDEN_SEEDS..=MAX_HIDDEN_SEEDS).contains(&seed_count) {
        return Err("Nombre de seeds prives invalide.".to_string());
    }
    let replace = request.replace_existing.unwrap_or(false);
    let _guard = vault_lock()
        .lock()
        .map_err(|_| "Verrou Hidden Suite indisponible.".to_string())?;
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
    let mut entropy = vec![0_u8; 32 + seed_count * 8];
    getrandom::fill(&mut entropy)
        .map_err(|error| format!("Entropie systeme indisponible: {error}"))?;
    let suite = create_hidden_suite(&entropy, seed_count, unix_ms())?;
    write_suite_path(&path, &suite)?;
    Ok(json!({
        "schema": SEAL_RESULT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "created": true,
        "replaced": had_existing,
        "receipt": receipt_for_suite(&suite)?,
        "contents_returned": false
    }))
}

#[tauri::command]
pub(crate) fn clear_forgebench_hidden_suite(app: AppHandle) -> Result<Value, String> {
    let _guard = vault_lock()
        .lock()
        .map_err(|_| "Verrou Hidden Suite indisponible.".to_string())?;
    let path = vault_path(&app)?;
    for candidate in [&path, &backup_path(&path), &temporary_path(&path)] {
        if candidate.exists() {
            fs::remove_file(candidate)
                .map_err(|error| format!("Suppression Hidden Suite impossible: {error}"))?;
        }
    }
    Ok(status_document(None))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entropy(seed_count: usize, offset: u8) -> Vec<u8> {
        (0..32 + seed_count * 8)
            .map(|index| (index as u8).wrapping_add(offset))
            .collect()
    }

    #[test]
    fn suite_is_valid_and_receipt_exposes_no_private_content() {
        let suite = create_hidden_suite(&entropy(5, 3), 5, 1_000).expect("suite");
        validate_hidden_suite(&suite).expect("valid suite");
        let receipt = receipt_for_suite(&suite).expect("receipt");
        validate_hidden_suite_receipt(&receipt).expect("valid receipt");
        let serialized = serde_json::to_string(&receipt).expect("receipt JSON");
        assert!(!serialized.contains("hidden_seeds\":"));
        assert!(!serialized.contains("private_checks\":"));
        assert!(!serialized.contains("seed-boundary-cases"));
        assert_eq!(receipt["readiness"]["scientific_eligible"], false);
        assert_eq!(receipt["security"]["encrypted_at_rest"], false);
    }

    #[test]
    fn separate_entropy_produces_a_separate_commitment() {
        let first = create_hidden_suite(&entropy(5, 1), 5, 1_000).expect("first");
        let second = create_hidden_suite(&entropy(5, 2), 5, 1_000).expect("second");
        assert_ne!(first["suite_id"], second["suite_id"]);
        assert_ne!(first["integrity"]["digest"], second["integrity"]["digest"]);
    }

    #[test]
    fn tampering_or_relabeling_the_suite_is_rejected() {
        let suite = create_hidden_suite(&entropy(5, 4), 5, 1_000).expect("suite");
        let mut tampered = suite.clone();
        tampered["hidden_seeds"][0] = json!(42);
        assert!(validate_hidden_suite(&tampered).is_err());

        let mut rehashed = suite;
        rehashed["isolation"]["worker_access_blocked"] = json!(true);
        sign_document(&mut rehashed).expect("rehashed suite");
        assert!(validate_hidden_suite(&rehashed).is_err());

        let suite = create_hidden_suite(&entropy(5, 6), 5, 1_000).expect("suite");
        let mut forged_receipt = receipt_for_suite(&suite).expect("receipt");
        forged_receipt["security"]["worker_access_blocked"] = json!(true);
        forged_receipt["readiness"]["scientific_eligible"] = json!(true);
        sign_document(&mut forged_receipt).expect("rehashed receipt");
        assert!(validate_hidden_suite_receipt(&forged_receipt).is_err());
    }

    #[test]
    fn vault_roundtrip_and_backup_recovery_preserve_the_commitment() {
        let directory = std::env::temp_dir().join(format!(
            "outilsia-forgebench-vault-{}-{}",
            std::process::id(),
            unix_ms()
        ));
        fs::create_dir_all(&directory).expect("temporary vault directory");
        let path = directory.join(VAULT_FILENAME);
        let suite = create_hidden_suite(&entropy(5, 5), 5, 1_000).expect("suite");
        write_suite_path(&path, &suite).expect("write suite");
        let restored = read_suite_path(&path)
            .expect("read suite")
            .expect("stored suite");
        assert_eq!(restored["suite_id"], suite["suite_id"]);
        let backup = backup_path(&path);
        fs::rename(&path, &backup).expect("simulate interrupted replacement");
        let recovered = read_suite_path(&path)
            .expect("recover suite")
            .expect("recovered suite");
        assert_eq!(recovered["integrity"], suite["integrity"]);
        assert!(path.exists());
        assert!(!backup.exists());
        fs::remove_dir_all(directory).expect("remove temporary vault directory");
    }

    #[test]
    fn seed_count_and_entropy_are_bounded() {
        assert!(create_hidden_suite(&entropy(2, 1), 2, 1_000).is_err());
        assert!(create_hidden_suite(&[0_u8; 8], 5, 1_000).is_err());
        assert!(create_hidden_suite(&entropy(17, 1), 17, 1_000).is_err());
    }
}
