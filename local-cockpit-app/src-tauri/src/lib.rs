mod board_observer;
mod capability_router;
mod evidence_ledger;
mod forgebench;
mod forgebench_browser;
mod forgebench_candidate;
mod forgebench_isolation;
mod forgebench_runner;
mod forgebench_sandbox;
mod forgebench_vault;
mod local_capability_bridge;
mod workstack_composer;

use board_observer::observe_planka_board;
use capability_router::route_workstack_capabilities;
use evidence_ledger::{append_evidence_entry, clear_evidence_ledger, get_evidence_ledger};
use forgebench::compile_forgebench_experiment;
use forgebench_candidate::run_forgebench_ollama_candidate;
use forgebench_isolation::probe_forgebench_isolation;
use forgebench_runner::run_forgebench_reference_pilot;
use forgebench_sandbox::{
    clear_forgebench_worker_sandbox, get_forgebench_worker_sandbox_status,
    prepare_forgebench_worker_sandbox,
};
use forgebench_vault::{
    clear_forgebench_hidden_suite, get_forgebench_hidden_suite_status, seal_forgebench_hidden_suite,
};
use local_capability_bridge::{
    get_local_capability_bridge_status, start_local_capability_bridge, stop_local_capability_bridge,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{hash_map::DefaultHasher, HashMap};
use std::hash::{Hash, Hasher};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use std::time::{SystemTime, UNIX_EPOCH};
use std::{env, fs};
use sysinfo::{Disks, System};
use tauri::{AppHandle, Emitter, Manager, State};
use workstack_composer::compile_work_card;

const OUTILSIA_ENDPOINT: &str = "https://outilsia.fr";
const DETECTION_COMMAND_TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Default)]
struct ActiveInstalls(Mutex<HashMap<String, u32>>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct InstalledModel {
    #[serde(rename = "model_name", alias = "name")]
    name: String,
    #[serde(rename = "model_tag", alias = "tag")]
    tag: Option<String>,
    size_gb: Option<f64>,
    #[serde(rename = "runtime", alias = "source")]
    source: String,
    quantization: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct MachineScan {
    name: String,
    machine_key: String,
    source: String,
    os_name: Option<String>,
    os_version: Option<String>,
    cpu_name: Option<String>,
    cpu_cores: Option<u32>,
    ram_gb: Option<u32>,
    gpu_name: Option<String>,
    gpu_vendor: Option<String>,
    gpu_category: Option<String>,
    vram_gb: Option<u32>,
    unified_memory: bool,
    storage_free_gb: Option<u32>,
    runtimes: Value,
    installed_models: Vec<InstalledModel>,
    raw_scan: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
struct GpuProbe {
    name: Option<String>,
    vendor: Option<String>,
    category: Option<String>,
    vram_gb: Option<u32>,
    vram_confidence: String,
    source: String,
    driver_version: Option<String>,
    driver_date: Option<String>,
    driver_provider: Option<String>,
    pnp_device_id: Option<String>,
    cuda_version: Option<String>,
    rocm_version: Option<String>,
    vulkan_version: Option<String>,
    kernel_driver: Option<String>,
    memory_used_mb: Option<u32>,
    performance_state: Option<String>,
    rebar_status: Option<String>,
    temperature_c: Option<f64>,
    utilization_percent: Option<f64>,
    power_draw_w: Option<f64>,
    power_limit_w: Option<f64>,
    pcie_link_width_current: Option<u32>,
    pcie_link_width_max: Option<u32>,
    pcie_link_gen_current: Option<u32>,
    pcie_link_gen_max: Option<u32>,
}

#[derive(Debug, Clone)]
struct WindowsGpuCandidate {
    name: String,
    vram_gb: Option<u32>,
    vram_confidence: String,
    driver_version: Option<String>,
    driver_date: Option<String>,
    pnp_device_id: Option<String>,
    driver_provider: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
struct MemoryProbe {
    total_gb: Option<u32>,
    module_count: Option<u32>,
    memory_type: Option<String>,
    configured_clock_mhz: Option<u32>,
    speed_mhz: Option<u32>,
    channel_mode: String,
    confidence: String,
    source: String,
    modules: Vec<MemoryModule>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
struct MemoryModule {
    size_gb: Option<u32>,
    memory_type: Option<String>,
    configured_clock_mhz: Option<u32>,
    speed_mhz: Option<u32>,
    manufacturer: Option<String>,
    part_number: Option<String>,
    slot: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
struct MotherboardProbe {
    manufacturer: Option<String>,
    product: Option<String>,
    version: Option<String>,
    bios_version: Option<String>,
    max_memory_gb: Option<u32>,
    memory_slots: Option<u32>,
    source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
struct OllamaProbe {
    installed: bool,
    version: Option<String>,
    models: Vec<InstalledModel>,
    source: String,
}

#[derive(Debug, Clone, Default)]
struct OllamaRuntimeEvidence {
    model_size_bytes: u64,
    vram_bytes: u64,
    gpu_offload_percent: f64,
    processor: String,
    source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LocalSnapshot {
    id: String,
    saved_at_ms: u128,
    scan: MachineScan,
    compatibility: Option<Value>,
    benchmark: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SyncRequest {
    session_cookie: String,
    scan: MachineScan,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DesktopAuth {
    desktop_token: String,
    account_url: Option<String>,
    account_email: Option<String>,
    saved_at_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct AppBuildInfo {
    app_version: String,
    build_id: String,
    source_commit: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PairClaimRequest {
    code: String,
    poll_token: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct BenchmarkRequest {
    model: String,
    prompt: Option<String>,
    timeout_seconds: Option<u64>,
    runtime: Option<String>,
    force_cpu: Option<bool>,
    protocol: Option<String>,
    tuning: Option<OllamaTuningRequest>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct OllamaTuningRequest {
    num_ctx: Option<u32>,
    num_batch: Option<u32>,
    num_thread: Option<u32>,
}

#[derive(Debug, Clone, Default)]
struct OllamaExecutionOptions {
    force_cpu: bool,
    benchmark_profile: bool,
    num_predict_override: Option<u32>,
    tuning: Option<OllamaTuningRequest>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct InstallModelRequest {
    model: String,
    timeout_seconds: Option<u64>,
    runtime: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct InstallPreflightRequest {
    model: String,
    runtime: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct InstallPreflightResult {
    schema: String,
    model: String,
    runtime: String,
    runtime_ready: bool,
    model_already_installed: bool,
    storage_free_gb: Option<f64>,
    storage_scope: String,
    storage_source: String,
    storage_path_exposed: bool,
    checked_at_ms: u128,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FeedbackRequest {
    machine_id: Option<u64>,
    category: Option<String>,
    message: String,
    scan: Option<MachineScan>,
    compatibility: Option<Value>,
    context: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct BenchmarkResult {
    model: String,
    prompt: String,
    elapsed_ms: u128,
    output_chars: usize,
    estimated_tokens: u32,
    estimated_tokens_per_second: f64,
    #[serde(default)]
    measurement_source: String,
    #[serde(default)]
    measurement_note: Option<String>,
    #[serde(default)]
    total_duration_ms: u64,
    #[serde(default)]
    load_duration_ms: u64,
    #[serde(default)]
    prompt_eval_count: u32,
    #[serde(default)]
    prompt_eval_duration_ms: u64,
    #[serde(default)]
    prompt_tokens_per_second: f64,
    #[serde(default)]
    eval_count: u32,
    #[serde(default)]
    eval_duration_ms: u64,
    success: bool,
    timed_out: bool,
    output_preview: String,
    error: Option<String>,
    #[serde(default)]
    execution_mode: String,
    #[serde(default)]
    runtime_model_size_bytes: u64,
    #[serde(default)]
    runtime_vram_bytes: u64,
    #[serde(default)]
    runtime_gpu_offload_percent: f64,
    #[serde(default)]
    runtime_processor: String,
    #[serde(default)]
    runtime_evidence_source: String,
    created_at_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct InstallModelResult {
    model: String,
    success: bool,
    elapsed_ms: u128,
    output_preview: String,
    error: Option<String>,
    created_at_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CancelInstallResult {
    model: String,
    cancelled: bool,
    message: String,
    created_at_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct InstallProgressEvent {
    model: String,
    stream: String,
    message: String,
    done: bool,
    success: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ObsidianVaultExport {
    path: String,
    files: Vec<String>,
}

#[tauri::command]
async fn scan_machine() -> Result<MachineScan, String> {
    tauri::async_runtime::spawn_blocking(scan_machine_inner)
        .await
        .map_err(|err| format!("Scan materiel interrompu: {err}"))?
}

fn scan_machine_inner() -> Result<MachineScan, String> {
    let mut system = System::new_all();
    system.refresh_all();

    let os_name = System::name();
    let os_version = System::os_version();
    let cpu_name = system
        .cpus()
        .first()
        .map(|cpu| cpu.brand().trim().to_string())
        .filter(|value| !value.is_empty());
    let cpu_cores = Some(system.cpus().len() as u32);
    let ram_gb = Some(bytes_to_gb(system.total_memory()));
    let memory_probe = detect_memory_probe(ram_gb);
    let motherboard_probe = detect_motherboard_probe();
    let gpu = detect_gpu();
    let ollama = detect_ollama();
    let ollama_wsl = detect_ollama_wsl();
    let docker_version = run_command("docker", &["--version"]);
    let llama_cpp_version =
        run_command("llama-cli", &["--version"]).or_else(|| run_command("llama", &["--version"]));
    let wsl_version = if cfg!(target_os = "windows") {
        run_command("wsl.exe", &["--version"]).or_else(|| run_command("wsl", &["--version"]))
    } else {
        None
    };
    let wsl_distributions = detect_wsl_distributions();
    let wsl_installed = wsl_version.is_some() || !wsl_distributions.is_empty();
    let wsl_state = wsl_runtime_state(ollama.installed, ollama_wsl.installed, wsl_installed);
    let wsl_default_distribution = wsl_distributions.first().cloned();
    let wsl_gpu_bridge = if wsl_installed {
        detect_wsl_gpu_bridge()
    } else {
        None
    };

    let machine_name = build_machine_name(cpu_name.as_deref(), gpu.name.as_deref());
    let machine_key = stable_machine_key(
        os_name.as_deref(),
        os_version.as_deref(),
        cpu_name.as_deref(),
        gpu.name.as_deref(),
        ram_gb,
        gpu.vram_gb,
    );
    let unified_memory = is_unified_memory(
        cpu_name.as_deref(),
        gpu.name.as_deref(),
        ram_gb,
        gpu.vram_gb,
    );

    Ok(MachineScan {
        name: machine_name,
        machine_key,
        source: "tauri-local-cockpit".to_string(),
        os_name,
        os_version,
        cpu_name,
        cpu_cores,
        ram_gb,
        gpu_name: gpu.name.clone(),
        gpu_vendor: gpu.vendor.clone(),
        gpu_category: gpu.category.clone(),
        vram_gb: gpu.vram_gb,
        unified_memory,
        storage_free_gb: detect_storage_free_gb(),
        runtimes: json!({
            "ollama": {
                "installed": ollama.installed,
                "version": ollama.version,
                "source": ollama.source
            },
            "ollama_wsl": {
                "installed": ollama_wsl.installed,
                "version": ollama_wsl.version,
                "source": ollama_wsl.source
            },
            "llama_cpp": {
                "installed": llama_cpp_version.is_some(),
                "version": llama_cpp_version
            },
            "docker": {
                "installed": docker_version.is_some(),
                "version": docker_version
            },
            "wsl": {
                "installed": wsl_installed,
                "version": wsl_version,
                "state": wsl_state,
                "source": "wsl.exe",
                "default_distribution": wsl_default_distribution,
                "distributions": wsl_distributions,
                "ollama_ready": ollama_wsl.installed,
                "gpu_bridge": wsl_gpu_bridge.clone().unwrap_or_else(|| "unknown".to_string()),
                "gpu_bridge_source": if wsl_gpu_bridge.is_some() { "wsl_dev_dxg" } else { "" },
                "install_command": if cfg!(target_os = "windows") { Some("wsl.exe --install") } else { None::<&str> },
                "ollama_install_command": if cfg!(target_os = "windows") { Some("wsl.exe sh -lc \"curl -fsSL https://ollama.com/install.sh | sh\"") } else { None::<&str> },
                "ollama_test_command": if cfg!(target_os = "windows") { Some("wsl.exe ollama run qwen3:0.6b") } else { None::<&str> }
            }
        }),
        installed_models: merge_installed_models(ollama.models, ollama_wsl.models),
        raw_scan: json!({
            "gpu_probe": gpu,
            "memory_probe": memory_probe,
            "motherboard_probe": motherboard_probe,
            "app_version": env!("CARGO_PKG_VERSION")
        }),
    })
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://outilsia.fr/")
        || trimmed == "https://outilsia.fr"
        || trimmed == "https://ollama.com/download"
        || trimmed.starts_with("https://ollama.com/download?")
        || trimmed.starts_with("https://www.nvidia.com/")
        || trimmed.starts_with("https://www.amd.com/")
        || trimmed.starts_with("https://www.intel.com/"))
    {
        return Err("URL externe refusee.".to_string());
    }

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("rundll32");
        cmd.args(["url.dll,FileProtocolHandler", trimmed]);
        cmd
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(trimmed);
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(trimmed);
        cmd
    };

    command
        .spawn()
        .map_err(|err| format!("Impossible d'ouvrir le navigateur: {err}"))?;
    Ok(())
}

#[tauri::command]
fn write_windows_recipe_file(content: String) -> Result<String, String> {
    if content.trim().is_empty() {
        return Err("Recette vide.".to_string());
    }
    serde_json::from_str::<Value>(&content)
        .map_err(|err| format!("Recette JSON invalide: {err}"))?;

    let exe_path =
        env::current_exe().map_err(|err| format!("Impossible de localiser l'executable: {err}"))?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| "Dossier executable introuvable.".to_string())?;
    let recipe_path = exe_dir.join("RECETTE-RESULTAT.json");
    fs::write(&recipe_path, content)
        .map_err(|err| format!("Impossible d'ecrire RECETTE-RESULTAT.json: {err}"))?;

    Ok(recipe_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn check_compatibility(scan: MachineScan) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{OUTILSIA_ENDPOINT}/api/compatibility/check"))
        .json(&scan)
        .send()
        .await
        .map_err(|err| format!("Impossible de contacter OutilsIA: {err}"))?;

    let status = response.status();
    let payload = response
        .json::<Value>()
        .await
        .map_err(|err| format!("Reponse OutilsIA illisible: {err}"))?;

    if !status.is_success() {
        return Err(format!(
            "OutilsIA a refuse le diagnostic ({status}): {payload}"
        ));
    }

    Ok(payload)
}

#[tauri::command]
async fn fetch_desktop_manifest() -> Result<Value, String> {
    let client = reqwest::Client::new();
    response_json(
        client
            .get(format!("{OUTILSIA_ENDPOINT}/api/desktop/manifest"))
            .send()
            .await
            .map_err(|err| format!("Impossible de charger le manifeste desktop: {err}"))?,
    )
    .await
}

#[tauri::command]
async fn fetch_content_signals() -> Result<Value, String> {
    let client = reqwest::Client::new();
    response_json(
        client
            .get(format!("{OUTILSIA_ENDPOINT}/api/local-ai/content-signals"))
            .send()
            .await
            .map_err(|err| format!("Impossible de charger les signaux contenus: {err}"))?,
    )
    .await
}

#[tauri::command]
fn save_local_snapshot(
    app: AppHandle,
    scan: MachineScan,
    compatibility: Option<Value>,
    benchmark: Option<Value>,
) -> Result<LocalSnapshot, String> {
    let mut snapshots = read_snapshots(&app)?;
    let snapshot = LocalSnapshot {
        id: format!("snapshot-{}", now_ms()),
        saved_at_ms: now_ms(),
        scan,
        compatibility,
        benchmark,
    };
    snapshots.insert(0, snapshot.clone());
    snapshots.truncate(25);
    write_snapshots(&app, &snapshots)?;
    Ok(snapshot)
}

#[tauri::command]
fn list_local_snapshots(app: AppHandle) -> Result<Vec<LocalSnapshot>, String> {
    read_snapshots(&app)
}

#[tauri::command]
fn delete_local_snapshot(
    app: AppHandle,
    snapshot_id: String,
) -> Result<Vec<LocalSnapshot>, String> {
    let snapshot_id = snapshot_id.trim();
    if snapshot_id.is_empty() {
        return Err("Identifiant snapshot requis.".to_string());
    }
    let mut snapshots = read_snapshots(&app)?;
    let before = snapshots.len();
    snapshots.retain(|snapshot| snapshot.id != snapshot_id);
    if snapshots.len() == before {
        return Err("Snapshot local introuvable.".to_string());
    }
    write_snapshots(&app, &snapshots)?;
    Ok(snapshots)
}

#[tauri::command]
fn clear_local_snapshots(app: AppHandle) -> Result<Vec<LocalSnapshot>, String> {
    let snapshots = Vec::new();
    write_snapshots(&app, &snapshots)?;
    Ok(snapshots)
}

#[tauri::command]
async fn sync_desktop(request: SyncRequest) -> Result<Value, String> {
    let cookie_value = normalize_session_cookie(&request.session_cookie)?;
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{OUTILSIA_ENDPOINT}/api/desktop/sync"))
        .header(
            reqwest::header::COOKIE,
            format!("outilsia_session={cookie_value}"),
        )
        .json(&request.scan)
        .send()
        .await
        .map_err(|err| format!("Impossible de synchroniser OutilsIA: {err}"))?;

    let status = response.status();
    let payload = response
        .json::<Value>()
        .await
        .map_err(|err| format!("Reponse sync illisible: {err}"))?;

    if !status.is_success() {
        return Err(format!("Sync refusee ({status}): {payload}"));
    }

    Ok(payload)
}

#[tauri::command]
async fn start_pairing(scan: Option<MachineScan>) -> Result<Value, String> {
    let device_name = scan
        .as_ref()
        .map(|scan| scan.name.clone())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "OutilsIA Local Cockpit".to_string());
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{OUTILSIA_ENDPOINT}/api/desktop/pair/start"))
        .json(&json!({ "device_name": device_name }))
        .send()
        .await
        .map_err(|err| format!("Impossible de demarrer le pairing: {err}"))?;
    response_json(response).await
}

#[tauri::command]
async fn claim_pairing(app: AppHandle, request: PairClaimRequest) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let payload = json!({
        "code": request.code,
        "poll_token": request.poll_token
    });
    let value = response_json(
        client
            .post(format!("{OUTILSIA_ENDPOINT}/api/desktop/pair/claim"))
            .json(&payload)
            .send()
            .await
            .map_err(|err| format!("Impossible de verifier le pairing: {err}"))?,
    )
    .await?;

    if let Some(token) = value.get("desktop_token").and_then(Value::as_str) {
        let auth = DesktopAuth {
            desktop_token: token.to_string(),
            account_url: value
                .get("account_url")
                .and_then(Value::as_str)
                .map(str::to_string),
            account_email: value
                .get("account_email")
                .and_then(Value::as_str)
                .map(str::to_string),
            saved_at_ms: now_ms(),
        };
        write_desktop_auth(&app, &auth)?;
    }

    Ok(value)
}

#[tauri::command]
fn get_desktop_auth(app: AppHandle) -> Result<Option<DesktopAuth>, String> {
    read_desktop_auth(&app)
}

#[tauri::command]
fn get_app_build_info() -> AppBuildInfo {
    AppBuildInfo {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        build_id: option_env!("OUTILSIA_BUILD_ID")
            .unwrap_or("local-dev")
            .to_string(),
        source_commit: option_env!("GITHUB_SHA").unwrap_or("").to_string(),
    }
}

#[tauri::command]
fn clear_desktop_auth(app: AppHandle) -> Result<(), String> {
    let path = desktop_auth_path(&app)?;
    if path.exists() {
        fs::remove_file(path)
            .map_err(|err| format!("Impossible de supprimer le token desktop: {err}"))?;
    }
    Ok(())
}

#[tauri::command]
async fn revoke_desktop_auth(app: AppHandle) -> Result<Value, String> {
    let auth = read_desktop_auth(&app)?.ok_or_else(|| "Token desktop absent.".to_string())?;
    let client = reqwest::Client::new();
    let value = response_json(
        client
            .post(format!("{OUTILSIA_ENDPOINT}/api/desktop/token/revoke"))
            .bearer_auth(auth.desktop_token)
            .send()
            .await
            .map_err(|err| format!("Impossible de revoquer le token desktop: {err}"))?,
    )
    .await?;
    clear_desktop_auth(app)?;
    Ok(value)
}

#[tauri::command]
async fn sync_desktop_with_token(app: AppHandle, scan: MachineScan) -> Result<Value, String> {
    let auth = read_desktop_auth(&app)?
        .ok_or_else(|| "Token desktop absent. Lance le pairing OutilsIA.".to_string())?;
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{OUTILSIA_ENDPOINT}/api/desktop/sync"))
        .bearer_auth(auth.desktop_token)
        .json(&scan)
        .send()
        .await
        .map_err(|err| format!("Impossible de synchroniser OutilsIA: {err}"))?;
    response_json(response).await
}

#[tauri::command]
async fn create_share_report_with_token(app: AppHandle, machine_id: u64) -> Result<Value, String> {
    if machine_id == 0 {
        return Err("Machine synchronisee requise avant partage.".to_string());
    }
    let auth = read_desktop_auth(&app)?
        .ok_or_else(|| "Token desktop absent. Lance le pairing OutilsIA.".to_string())?;
    let client = reqwest::Client::new();
    response_json(
        client
            .post(format!(
                "{OUTILSIA_ENDPOINT}/api/account/machines/{machine_id}/share"
            ))
            .bearer_auth(auth.desktop_token)
            .send()
            .await
            .map_err(|err| format!("Impossible de creer le rapport partageable: {err}"))?,
    )
    .await
}

#[tauri::command]
async fn delete_machine_with_token(app: AppHandle, machine_id: u64) -> Result<Value, String> {
    if machine_id == 0 {
        return Err("Machine synchronisee requise avant suppression.".to_string());
    }
    let auth = read_desktop_auth(&app)?
        .ok_or_else(|| "Token desktop absent. Lance le pairing OutilsIA.".to_string())?;
    let client = reqwest::Client::new();
    response_json(
        client
            .delete(format!(
                "{OUTILSIA_ENDPOINT}/api/account/machines/{machine_id}"
            ))
            .bearer_auth(auth.desktop_token)
            .send()
            .await
            .map_err(|err| format!("Impossible de supprimer la machine: {err}"))?,
    )
    .await
}

#[tauri::command]
async fn fetch_desktop_updates_with_token(app: AppHandle) -> Result<Value, String> {
    let auth = read_desktop_auth(&app)?
        .ok_or_else(|| "Token desktop absent. Lance le pairing OutilsIA.".to_string())?;
    let client = reqwest::Client::new();
    response_json(
        client
            .get(format!("{OUTILSIA_ENDPOINT}/api/desktop/updates"))
            .bearer_auth(auth.desktop_token)
            .send()
            .await
            .map_err(|err| format!("Impossible de charger les updates OutilsIA: {err}"))?,
    )
    .await
}

#[tauri::command]
async fn send_feedback_with_token(
    app: AppHandle,
    request: FeedbackRequest,
) -> Result<Value, String> {
    let auth = read_desktop_auth(&app)?
        .ok_or_else(|| "Token desktop absent. Lance le pairing OutilsIA.".to_string())?;
    let client = reqwest::Client::new();
    let payload = json!({
        "machine_id": request.machine_id,
        "category": request.category.unwrap_or_else(|| "detection".to_string()),
        "message": request.message,
        "scan": request.scan,
        "compatibility": request.compatibility,
        "context": request.context.unwrap_or_else(|| json!({})),
        "app_version": env!("CARGO_PKG_VERSION"),
    });
    response_json(
        client
            .post(format!("{OUTILSIA_ENDPOINT}/api/desktop/feedback"))
            .bearer_auth(auth.desktop_token)
            .json(&payload)
            .send()
            .await
            .map_err(|err| format!("Impossible d'envoyer le feedback beta: {err}"))?,
    )
    .await
}

#[tauri::command]
async fn fetch_desktop_memoryforge_with_token(
    app: AppHandle,
    machine_id: u64,
) -> Result<String, String> {
    if machine_id == 0 {
        return Err("Machine synchronisee requise pour MemoryForge.".to_string());
    }
    let auth = read_desktop_auth(&app)?
        .ok_or_else(|| "Token desktop absent. Lance le pairing OutilsIA.".to_string())?;
    let client = reqwest::Client::new();
    let response = client
        .get(format!(
            "{OUTILSIA_ENDPOINT}/api/desktop/machines/{machine_id}/memoryforge.md"
        ))
        .bearer_auth(auth.desktop_token)
        .send()
        .await
        .map_err(|err| format!("Impossible de charger MemoryForge: {err}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("Reponse MemoryForge illisible: {err}"))?;
    if !status.is_success() {
        return Err(format!("MemoryForge refuse ({status}): {body}"));
    }
    Ok(body)
}

#[tauri::command]
async fn sync_benchmark_with_token(
    app: AppHandle,
    scan: MachineScan,
    benchmark: BenchmarkResult,
) -> Result<Value, String> {
    let auth = read_desktop_auth(&app)?
        .ok_or_else(|| "Token desktop absent. Lance le pairing OutilsIA.".to_string())?;
    let client = reqwest::Client::new();
    response_json(
        client
            .post(format!("{OUTILSIA_ENDPOINT}/api/desktop/sync"))
            .bearer_auth(&auth.desktop_token)
            .json(&scan)
            .send()
            .await
            .map_err(|err| {
                format!("Impossible de synchroniser la machine avant benchmark: {err}")
            })?,
    )
    .await?;
    let payload = json!({
        "machine_key": scan.machine_key,
        "benchmark": {
            "model_name": benchmark.model,
            "backend": "ollama",
            "prompt_type": "short-local",
            "tokens_per_second": benchmark.estimated_tokens_per_second,
            "context_tokens": benchmark.estimated_tokens,
            "notes": benchmark.output_preview,
            "success": benchmark.success,
            "elapsed_ms": benchmark.elapsed_ms
        }
    });
    response_json(
        client
            .post(format!("{OUTILSIA_ENDPOINT}/api/desktop/benchmarks"))
            .bearer_auth(auth.desktop_token)
            .json(&payload)
            .send()
            .await
            .map_err(|err| format!("Impossible de synchroniser le benchmark: {err}"))?,
    )
    .await
}

#[tauri::command]
fn generate_memoryforge(scan: MachineScan, compatibility: Option<Value>) -> Result<String, String> {
    let mut lines = Vec::new();
    lines.push("# Machine IA locale".to_string());
    lines.push(String::new());
    lines.push(format!("- Nom: {}", scan.name));
    lines.push(format!(
        "- OS: {} {}",
        scan.os_name.as_deref().unwrap_or("inconnu"),
        scan.os_version.as_deref().unwrap_or("")
    ));
    lines.push(format!(
        "- CPU: {} ({} coeurs)",
        scan.cpu_name.as_deref().unwrap_or("inconnu"),
        scan.cpu_cores.unwrap_or_default()
    ));
    lines.push(format!("- RAM: {} Go", scan.ram_gb.unwrap_or_default()));
    lines.push(format!(
        "- GPU: {}",
        scan.gpu_name.as_deref().unwrap_or("non detecte")
    ));
    lines.push(format!("- VRAM: {}", format_optional_gb(scan.vram_gb)));
    lines.push(String::new());

    if let Some(value) = compatibility {
        lines.push("## Compatibilite OutilsIA".to_string());
        lines.push(String::new());
        if let Some(score) = value
            .pointer("/compatibility/score")
            .and_then(Value::as_i64)
        {
            lines.push(format!("- Score: {score}/100"));
        } else if let Some(score) = value
            .pointer("/compatibility/score/score")
            .and_then(Value::as_i64)
        {
            lines.push(format!("- Score: {score}/100"));
        }
        if let Some(summary) = value
            .pointer("/compatibility/summary")
            .and_then(Value::as_str)
            .or_else(|| {
                value
                    .pointer("/compatibility/verdict")
                    .and_then(Value::as_str)
            })
            .or_else(|| {
                value
                    .pointer("/compatibility/score/summary")
                    .and_then(Value::as_str)
            })
            .or_else(|| {
                value
                    .pointer("/compatibility/score/label")
                    .and_then(Value::as_str)
            })
        {
            lines.push(format!("- Verdict: {summary}"));
        }
        if let Some(models) = value
            .pointer("/compatibility/model_recommendations")
            .and_then(Value::as_array)
            .or_else(|| {
                value
                    .pointer("/compatibility/compatible")
                    .and_then(Value::as_array)
            })
            .or_else(|| {
                value
                    .pointer("/compatibility/models")
                    .and_then(Value::as_array)
            })
        {
            lines.push(String::new());
            lines.push("### Modeles conseilles".to_string());
            for model in models.iter().take(12) {
                let name = model
                    .get("name")
                    .and_then(Value::as_str)
                    .or_else(|| model.get("model").and_then(Value::as_str))
                    .unwrap_or("modele");
                lines.push(format!("- {name}"));
            }
        }
        if let Some(new_models) = value
            .pointer("/compatibility/new")
            .and_then(Value::as_array)
        {
            lines.push(String::new());
            lines.push("### Nouveaux modeles du catalogue".to_string());
            for model in new_models.iter().take(8) {
                let name = model
                    .get("name")
                    .and_then(Value::as_str)
                    .or_else(|| model.get("model").and_then(Value::as_str))
                    .unwrap_or("modele");
                let params = model.get("params").and_then(Value::as_str).unwrap_or("");
                let status = model
                    .get("label")
                    .and_then(Value::as_str)
                    .or_else(|| model.get("status").and_then(Value::as_str))
                    .unwrap_or("");
                lines.push(format!("- {name} {params} - {status}"));
            }
        }
        if let Some(blocked) = value
            .pointer("/compatibility/blocked_next")
            .and_then(Value::as_array)
        {
            lines.push(String::new());
            lines.push("### Prochains paliers bloques".to_string());
            for model in blocked.iter().take(8) {
                let name = model
                    .get("name")
                    .and_then(Value::as_str)
                    .or_else(|| model.get("model").and_then(Value::as_str))
                    .unwrap_or("modele");
                let vram = model
                    .get("vram_q4")
                    .and_then(Value::as_i64)
                    .map(|value| format!(" - {value} Go VRAM Q4"))
                    .unwrap_or_default();
                lines.push(format!("- {name}{vram}"));
            }
        }
        if let Some(upgrades) = value
            .pointer("/compatibility/upgrades")
            .and_then(Value::as_array)
        {
            lines.push(String::new());
            lines.push("### Upgrades recommandes".to_string());
            for upgrade in upgrades.iter().take(8) {
                if let Some(text) = upgrade.as_str() {
                    lines.push(format!("- {text}"));
                } else {
                    lines.extend(upgrade_markdown_lines(upgrade, "-"));
                }
            }
        }
        lines.push(String::new());
        lines.push("## Shopping list OutilsIA".to_string());
        lines.push(String::new());
        let compat = value.get("compatibility").unwrap_or(&value);
        lines.push(shopping_list_markdown(compat, &scan));
        lines.push(String::new());
    }

    lines.push("## Modeles installes".to_string());
    lines.push(String::new());
    if scan.installed_models.is_empty() {
        lines.push("- Aucun modele Ollama detecte.".to_string());
    } else {
        for model in &scan.installed_models {
            let size = model
                .size_gb
                .map(|value| format!(" - {:.1} Go", value))
                .unwrap_or_default();
            lines.push(format!("- {}{}", model.name, size));
        }
    }

    lines.push(String::new());
    lines.push("## Notes".to_string());
    lines.push(String::new());
    lines.push("- Objectif: garder cette machine a jour avec les nouveaux modeles locaux valides par OutilsIA.".to_string());
    lines.push("- Usage conseille: Obsidian, MemoryForge, Ollama, tests Hermes/Qwen/Mistral selon VRAM disponible.".to_string());

    Ok(lines.join("\n"))
}

#[tauri::command]
fn export_obsidian_vault(
    app: AppHandle,
    scan: MachineScan,
    compatibility: Option<Value>,
    benchmark: Option<Value>,
    memory_markdown: Option<String>,
) -> Result<ObsidianVaultExport, String> {
    let base = obsidian_vaults_dir(&app)?;
    let slug = safe_slug(&scan.name);
    let dir = base.join(format!("{slug}-{}", now_ms()));
    fs::create_dir_all(&dir)
        .map_err(|err| format!("Impossible de creer le vault Obsidian: {err}"))?;

    let empty_compat = Value::Null;
    let compat = compatibility
        .as_ref()
        .and_then(|value| value.get("compatibility"))
        .or(compatibility.as_ref())
        .unwrap_or(&empty_compat);
    let mut files = Vec::new();

    write_vault_file(&dir, &mut files, "00-Machine.md", machine_markdown(&scan))?;
    write_vault_file(
        &dir,
        &mut files,
        "01-Modeles-compatibles.md",
        compatible_models_markdown(compat, &scan),
    )?;
    write_vault_file(
        &dir,
        &mut files,
        "02-Modeles-installes.md",
        installed_models_markdown(&scan),
    )?;
    write_vault_file(
        &dir,
        &mut files,
        "03-Benchmarks.md",
        benchmark_markdown(benchmark.as_ref()),
    )?;
    write_vault_file(
        &dir,
        &mut files,
        "04-Achats-guides.md",
        buying_guides_markdown(compat),
    )?;
    write_vault_file(
        &dir,
        &mut files,
        "05-Dialogues-locaux.md",
        dialogue_memory_markdown(memory_markdown.as_deref()),
    )?;
    write_vault_file(
        &dir,
        &mut files,
        "06-Shopping-list.md",
        shopping_list_markdown(compat, &scan),
    )?;
    write_vault_file(
        &dir,
        &mut files,
        "07-Rapport-partageable.md",
        share_ready_report_markdown(&scan, compat, benchmark.as_ref()),
    )?;
    write_vault_file(
        &dir,
        &mut files,
        "08-Fiches-modeles.md",
        model_cards_markdown(&scan, compat),
    )?;
    write_vault_file(
        &dir,
        &mut files,
        "09-Catalogues-OutilsIA.md",
        catalog_state_markdown(compat),
    )?;
    let memory_content = memory_markdown
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(generate_memoryforge(scan.clone(), compatibility.clone())?);
    write_vault_file(
        &dir,
        &mut files,
        "10-Journal-cockpit.md",
        cockpit_journal_markdown(&scan, &memory_content),
    )?;
    write_vault_file(&dir, &mut files, "INDEX.md", vault_index_markdown(&scan))?;
    write_vault_file(
        &dir,
        &mut files,
        "MANIFESTE.md",
        vault_manifest_markdown(&scan),
    )?;
    write_vault_file(&dir, &mut files, "MEMORY.md", memory_content)?;
    write_vault_file(
        &dir,
        &mut files,
        "HERMES.md",
        hermes_markdown(&scan, compat),
    )?;

    Ok(ObsidianVaultExport {
        path: dir.to_string_lossy().to_string(),
        files,
    })
}

#[tauri::command]
fn open_obsidian_vault(app: AppHandle, path: String) -> Result<(), String> {
    let base = obsidian_vaults_dir(&app)?;
    let requested = PathBuf::from(path);
    let canonical_base = base
        .canonicalize()
        .map_err(|err| format!("Dossier vaults indisponible: {err}"))?;
    let canonical_requested = requested
        .canonicalize()
        .map_err(|err| format!("Vault introuvable: {err}"))?;
    if !canonical_requested.starts_with(&canonical_base) {
        return Err("Ouverture refusee hors dossier Obsidian OutilsIA.".to_string());
    }
    open_path(&canonical_requested)
}

#[tauri::command]
async fn benchmark_ollama(request: BenchmarkRequest) -> Result<BenchmarkResult, String> {
    let model = validate_ollama_model_ref(&request.model)?;
    let structured_benchmark = matches!(
        request.protocol.as_deref(),
        Some("arena_objective_v1")
            | Some("outilsia.arena.objective.v1")
            | Some("outilsia.recommendation.v2")
            | Some("outilsia.autopilot.v1")
    );
    let prompt = prepare_benchmark_prompt(request.prompt, structured_benchmark);
    let timeout = Duration::from_secs(request.timeout_seconds.unwrap_or(45).clamp(5, 180));
    let runtime = normalize_ollama_runtime(request.runtime.as_deref());
    let num_predict_override = match request.protocol.as_deref() {
        Some("outilsia.recommendation.v2") => Some(224),
        _ if structured_benchmark => Some(192),
        _ => None,
    };
    let force_cpu = request.force_cpu.unwrap_or(false);
    let tuning = request.tuning;
    if force_cpu || tuning.is_some() {
        return run_ollama_api_prompt(
            model,
            prompt,
            timeout,
            runtime,
            OllamaExecutionOptions {
                force_cpu,
                benchmark_profile: true,
                num_predict_override,
                tuning,
            },
        )
        .await;
    }
    run_ollama_api_with_cli_fallback(model, prompt, timeout, runtime, true, num_predict_override)
        .await
}

fn prepare_benchmark_prompt(request_prompt: Option<String>, objective_arena: bool) -> String {
    let prompt_limit = if objective_arena { 3000 } else { 500 };
    let user_prompt = request_prompt
        .unwrap_or_else(|| {
            "Réponds en français, en une seule phrase courte, sans raisonnement: pourquoi la VRAM est importante pour un LLM local ?".to_string()
        })
        .trim()
        .chars()
        .take(prompt_limit)
        .collect::<String>();
    if objective_arena {
        user_prompt
    } else {
        format!("{user_prompt}\nRéponse finale uniquement, une phrase courte en français.")
    }
}

#[tauri::command]
async fn chat_ollama(request: BenchmarkRequest) -> Result<BenchmarkResult, String> {
    let model = validate_ollama_model_ref(&request.model)?;
    let user_prompt = request
        .prompt
        .unwrap_or_default()
        .trim()
        .chars()
        .take(2000)
        .collect::<String>();
    if user_prompt.is_empty() {
        return Err("Question requise pour interroger le modele.".to_string());
    }
    let prompt = format!("Réponds en français, clairement et directement.\n\n{user_prompt}");
    let timeout = Duration::from_secs(request.timeout_seconds.unwrap_or(90).clamp(5, 300));
    let runtime = normalize_ollama_runtime(request.runtime.as_deref());
    let force_cpu = request.force_cpu.unwrap_or(false);
    let tuning = request.tuning;
    if force_cpu || tuning.is_some() {
        return run_ollama_api_prompt(
            model,
            prompt,
            timeout,
            runtime,
            OllamaExecutionOptions {
                force_cpu,
                tuning,
                ..OllamaExecutionOptions::default()
            },
        )
        .await;
    }
    run_ollama_api_with_cli_fallback(model, prompt, timeout, runtime, false, None).await
}

async fn run_ollama_api_with_cli_fallback(
    model: String,
    prompt: String,
    timeout: Duration,
    runtime: OllamaRuntime,
    benchmark_profile: bool,
    num_predict_override: Option<u32>,
) -> Result<BenchmarkResult, String> {
    match run_ollama_api_prompt(
        model.clone(),
        prompt.clone(),
        timeout,
        runtime,
        OllamaExecutionOptions {
            benchmark_profile,
            num_predict_override,
            ..OllamaExecutionOptions::default()
        },
    )
    .await
    {
        Ok(result) => Ok(result),
        Err(api_error) => {
            let mut result = run_ollama_prompt_async(model, prompt, timeout, runtime).await?;
            result.measurement_source = "ollama_cli_estimate".to_string();
            result.measurement_note = Some(format!(
                "Métriques API Ollama indisponibles; débit estimé depuis la sortie CLI ({api_error})."
            ));
            Ok(result)
        }
    }
}

async fn run_ollama_prompt_async(
    model: String,
    prompt: String,
    timeout: Duration,
    runtime: OllamaRuntime,
) -> Result<BenchmarkResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_ollama_prompt(model, prompt, timeout, runtime))
        .await
        .map_err(|err| format!("Tâche Ollama interrompue: {err}"))?
}

fn ollama_chat_payload(
    model: &str,
    prompt: &str,
    force_cpu: bool,
    benchmark_profile: bool,
    num_predict_override: Option<u32>,
    tuning: Option<&OllamaTuningRequest>,
) -> Value {
    let mut options = serde_json::Map::new();
    let num_ctx = tuning
        .and_then(|profile| profile.num_ctx)
        .map(|value| value.clamp(512, 32_768))
        .unwrap_or(if benchmark_profile { 2048 } else { 4096 });
    options.insert("num_ctx".to_string(), json!(num_ctx));
    if let Some(value) = tuning.and_then(|profile| profile.num_batch) {
        options.insert(
            "num_batch".to_string(),
            json!(value.clamp(32, 1024).min(num_ctx)),
        );
    }
    if let Some(value) = tuning.and_then(|profile| profile.num_thread) {
        options.insert("num_thread".to_string(), json!(value.clamp(1, 64)));
    }
    if benchmark_profile {
        options.insert(
            "num_predict".to_string(),
            json!(num_predict_override.unwrap_or(96)),
        );
        options.insert("seed".to_string(), json!(42));
        options.insert("temperature".to_string(), json!(0));
    }
    if force_cpu {
        options.insert("num_gpu".to_string(), json!(0));
    }
    json!({
        "model": model,
        "messages": [{
            "role": "user",
            "content": prompt
        }],
        "stream": false,
        "think": false,
        "keep_alive": "2m",
        "options": Value::Object(options)
    })
}

fn benchmark_result_from_ollama_api(
    model: String,
    prompt: String,
    payload: Value,
    elapsed: Duration,
    execution_mode: &str,
) -> Result<BenchmarkResult, String> {
    if let Some(error) = payload.get("error").and_then(Value::as_str) {
        return Err(format!("Ollama a refusé le test: {error}"));
    }
    let output = payload
        .pointer("/message/content")
        .and_then(Value::as_str)
        .or_else(|| payload.get("response").and_then(Value::as_str))
        .unwrap_or_default()
        .trim()
        .to_string();
    let output_chars = output.chars().count();
    let eval_count = payload
        .get("eval_count")
        .and_then(Value::as_u64)
        .unwrap_or_else(|| ((output_chars as f64) / 4.0).round().max(0.0) as u64);
    let eval_duration_ns = payload
        .get("eval_duration")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let prompt_eval_count = payload
        .get("prompt_eval_count")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let prompt_eval_duration_ns = payload
        .get("prompt_eval_duration")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let total_duration_ns = payload
        .get("total_duration")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let load_duration_ns = payload
        .get("load_duration")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let measured_seconds = if eval_duration_ns > 0 {
        (eval_duration_ns as f64 / 1_000_000_000.0).max(0.001)
    } else {
        elapsed.as_secs_f64().max(0.001)
    };
    let estimated_tokens_per_second =
        (((eval_count as f64) / measured_seconds) * 10.0).round() / 10.0;
    let prompt_tokens_per_second = if prompt_eval_count > 0 && prompt_eval_duration_ns > 0 {
        (((prompt_eval_count as f64) / (prompt_eval_duration_ns as f64 / 1_000_000_000.0)) * 10.0)
            .round()
            / 10.0
    } else {
        0.0
    };
    let exact_metrics = eval_count > 0 && eval_duration_ns > 0;
    Ok(BenchmarkResult {
        model,
        prompt,
        elapsed_ms: elapsed.as_millis(),
        output_chars,
        estimated_tokens: eval_count.min(u32::MAX as u64) as u32,
        estimated_tokens_per_second,
        measurement_source: if exact_metrics {
            "ollama_api".to_string()
        } else {
            "ollama_api_estimate".to_string()
        },
        measurement_note: if exact_metrics {
            None
        } else {
            Some("Ollama n'a pas renvoyé eval_count/eval_duration; débit calculé sur le temps total.".to_string())
        },
        total_duration_ms: total_duration_ns / 1_000_000,
        load_duration_ms: load_duration_ns / 1_000_000,
        prompt_eval_count: prompt_eval_count.min(u32::MAX as u64) as u32,
        prompt_eval_duration_ms: prompt_eval_duration_ns / 1_000_000,
        prompt_tokens_per_second,
        eval_count: eval_count.min(u32::MAX as u64) as u32,
        eval_duration_ms: eval_duration_ns / 1_000_000,
        success: payload.get("done").and_then(Value::as_bool).unwrap_or(true),
        timed_out: false,
        output_preview: output.chars().take(700).collect(),
        error: None,
        execution_mode: execution_mode.to_string(),
        runtime_model_size_bytes: 0,
        runtime_vram_bytes: 0,
        runtime_gpu_offload_percent: 0.0,
        runtime_processor: "unknown".to_string(),
        runtime_evidence_source: String::new(),
        created_at_ms: now_ms(),
    })
}

fn parse_ollama_runtime_evidence(
    payload: &Value,
    target_model: &str,
) -> Option<OllamaRuntimeEvidence> {
    let models = payload.get("models")?.as_array()?;
    let target = target_model.trim().to_lowercase();
    let target_base = target.split(':').next().unwrap_or(&target);
    let selected = models
        .iter()
        .find(|item| {
            let candidate = item
                .get("name")
                .or_else(|| item.get("model"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_lowercase();
            candidate == target
                || (!target.contains(':')
                    && candidate.split(':').next().unwrap_or(&candidate) == target_base)
        })
        .or_else(|| (models.len() == 1).then(|| &models[0]))?;
    let model_size_bytes = selected.get("size").and_then(Value::as_u64).unwrap_or(0);
    let vram_bytes = selected
        .get("size_vram")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    if model_size_bytes == 0 {
        return None;
    }
    let gpu_offload_percent =
        (((vram_bytes as f64 / model_size_bytes as f64) * 1000.0).round() / 10.0).clamp(0.0, 100.0);
    let processor = if vram_bytes == 0 {
        "cpu"
    } else if gpu_offload_percent >= 95.0 {
        "gpu"
    } else {
        "hybrid"
    };
    Some(OllamaRuntimeEvidence {
        model_size_bytes,
        vram_bytes,
        gpu_offload_percent,
        processor: processor.to_string(),
        source: "ollama_api_ps".to_string(),
    })
}

fn apply_ollama_runtime_evidence(result: &mut BenchmarkResult, evidence: OllamaRuntimeEvidence) {
    result.runtime_model_size_bytes = evidence.model_size_bytes;
    result.runtime_vram_bytes = evidence.vram_bytes;
    result.runtime_gpu_offload_percent = evidence.gpu_offload_percent;
    result.runtime_processor = evidence.processor;
    result.runtime_evidence_source = evidence.source;
}

async fn fetch_native_ollama_runtime_evidence(
    client: &reqwest::Client,
    model: &str,
) -> Option<OllamaRuntimeEvidence> {
    let response = client
        .get("http://127.0.0.1:11434/api/ps")
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let payload = response.json::<Value>().await.ok()?;
    parse_ollama_runtime_evidence(&payload, model)
}

fn fetch_wsl_ollama_runtime_evidence(model: &str) -> Option<OllamaRuntimeEvidence> {
    let output = run_command(
        "wsl.exe",
        &[
            "sh",
            "-lc",
            "curl -fsS --max-time 10 http://127.0.0.1:11434/api/ps",
        ],
    )?;
    let payload = serde_json::from_str::<Value>(&output).ok()?;
    parse_ollama_runtime_evidence(&payload, model)
}

async fn run_ollama_api_prompt(
    model: String,
    prompt: String,
    timeout: Duration,
    runtime: OllamaRuntime,
    options: OllamaExecutionOptions,
) -> Result<BenchmarkResult, String> {
    let payload = ollama_chat_payload(
        &model,
        &prompt,
        options.force_cpu,
        options.benchmark_profile,
        options.num_predict_override,
        options.tuning.as_ref(),
    );
    let execution_mode = if options.force_cpu { "cpu" } else { "auto" };
    if runtime == OllamaRuntime::Wsl && cfg!(target_os = "windows") {
        let execution_mode = execution_mode.to_string();
        return tauri::async_runtime::spawn_blocking(move || {
            run_wsl_ollama_api_prompt(model, prompt, payload, timeout, execution_mode)
        })
        .await
        .map_err(|err| format!("Tâche API Ollama WSL interrompue: {err}"))?;
    }

    let started = Instant::now();
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|err| format!("Client API Ollama indisponible: {err}"))?;
    let response = client
        .post("http://127.0.0.1:11434/api/chat")
        .json(&payload)
        .send()
        .await
        .map_err(|err| format!("API Ollama inaccessible: {err}"))?;
    let status = response.status();
    let response_payload = response
        .json::<Value>()
        .await
        .map_err(|err| format!("Réponse API Ollama illisible: {err}"))?;
    if !status.is_success() {
        return Err(format!("API Ollama a répondu {status}: {response_payload}"));
    }
    let mut result = benchmark_result_from_ollama_api(
        model,
        prompt,
        response_payload,
        started.elapsed(),
        execution_mode,
    )?;
    if let Some(evidence) = fetch_native_ollama_runtime_evidence(&client, &result.model).await {
        apply_ollama_runtime_evidence(&mut result, evidence);
    }
    Ok(result)
}

fn run_wsl_ollama_api_prompt(
    model: String,
    prompt: String,
    payload: Value,
    timeout: Duration,
    execution_mode: String,
) -> Result<BenchmarkResult, String> {
    let started = Instant::now();
    let mut command = Command::new("wsl.exe");
    let script = format!(
        "curl -fsS --max-time {} -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:11434/api/chat",
        timeout.as_secs()
    );
    command.args(["sh", "-lc", &script]);
    let input = serde_json::to_vec(&payload)
        .map_err(|err| format!("Requête API Ollama WSL illisible: {err}"))?;
    let (stdout, stderr, success, timed_out) =
        command_output_with_input_timeout(command, &input, timeout, "API Ollama WSL")?;
    if timed_out {
        return Err(format!(
            "API Ollama WSL stoppée après {} secondes.",
            timeout.as_secs()
        ));
    }
    if !success {
        return Err(format!(
            "API Ollama WSL indisponible: {}",
            stderr.trim().chars().take(500).collect::<String>()
        ));
    }
    let response_payload = serde_json::from_str::<Value>(&stdout)
        .map_err(|err| format!("Réponse API Ollama WSL illisible: {err}"))?;
    let mut result = benchmark_result_from_ollama_api(
        model,
        prompt,
        response_payload,
        started.elapsed(),
        &execution_mode,
    )?;
    if let Some(evidence) = fetch_wsl_ollama_runtime_evidence(&result.model) {
        apply_ollama_runtime_evidence(&mut result, evidence);
    }
    Ok(result)
}

fn run_ollama_prompt(
    model: String,
    prompt: String,
    timeout: Duration,
    runtime: OllamaRuntime,
) -> Result<BenchmarkResult, String> {
    let started = Instant::now();
    let mut command = build_ollama_command(runtime);
    let mut child = command
        .arg("run")
        .arg(&model)
        .arg(&prompt)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| {
            format!(
                "Impossible de lancer {}: {err}",
                ollama_runtime_name(runtime)
            )
        })?;

    let stdout_preview = Arc::new(Mutex::new(String::new()));
    let stderr_preview = Arc::new(Mutex::new(String::new()));
    let mut readers = Vec::new();

    if let Some(stdout) = child.stdout.take() {
        readers.push(spawn_output_collector(stdout, stdout_preview.clone()));
    }
    if let Some(stderr) = child.stderr.take() {
        readers.push(spawn_output_collector(stderr, stderr_preview.clone()));
    }

    let mut timed_out = false;
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|err| format!("Benchmark Ollama illisible: {err}"))?
        {
            break status;
        }
        if started.elapsed() >= timeout {
            timed_out = true;
            let _ = child.kill();
            break child
                .wait()
                .map_err(|err| format!("Fin Ollama indisponible: {err}"))?;
        }
        std::thread::sleep(Duration::from_millis(120));
    };

    for reader in readers {
        let _ = reader.join();
    }

    let elapsed_ms = started.elapsed().as_millis();
    let stdout_raw = stdout_preview
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();
    let stderr_raw = stderr_preview
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();
    let stdout = clean_benchmark_output(&stdout_raw);
    let stderr = clean_benchmark_output(&stderr_raw);
    let output_chars = stdout.chars().count();
    let estimated_tokens = ((output_chars as f64) / 4.0).round().max(0.0) as u32;
    let seconds = (elapsed_ms as f64 / 1000.0).max(0.001);
    let estimated_tokens_per_second = ((estimated_tokens as f64 / seconds) * 10.0).round() / 10.0;

    Ok(BenchmarkResult {
        model,
        prompt,
        elapsed_ms,
        output_chars,
        estimated_tokens,
        estimated_tokens_per_second,
        measurement_source: "ollama_cli_estimate".to_string(),
        measurement_note: Some(
            "Débit estimé depuis la longueur de la sortie CLI; métriques API absentes.".to_string(),
        ),
        total_duration_ms: elapsed_ms.min(u64::MAX as u128) as u64,
        load_duration_ms: 0,
        prompt_eval_count: 0,
        prompt_eval_duration_ms: 0,
        prompt_tokens_per_second: 0.0,
        eval_count: estimated_tokens,
        eval_duration_ms: elapsed_ms.min(u64::MAX as u128) as u64,
        success: status.success() && !timed_out,
        timed_out,
        output_preview: stdout.chars().take(700).collect(),
        error: if status.success() && !timed_out {
            None
        } else if timed_out {
            Some(format!(
                "Ollama stoppe apres {} secondes.",
                timeout.as_secs()
            ))
        } else {
            Some(stderr.chars().take(500).collect())
        },
        execution_mode: "auto".to_string(),
        runtime_model_size_bytes: 0,
        runtime_vram_bytes: 0,
        runtime_gpu_offload_percent: 0.0,
        runtime_processor: "unknown".to_string(),
        runtime_evidence_source: String::new(),
        created_at_ms: now_ms(),
    })
}

fn validate_ollama_model_ref(model: &str) -> Result<String, String> {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        return Err("Modèle Ollama requis.".to_string());
    }
    if trimmed.len() > 180 {
        return Err("Nom de modèle trop long.".to_string());
    }
    let allowed = trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-' | ':' | '/'));
    if !allowed {
        return Err("Nom de modèle Ollama invalide.".to_string());
    }
    Ok(trimmed.to_string())
}

fn emit_install_progress(
    app: &AppHandle,
    model: &str,
    stream: &str,
    message: &str,
    done: bool,
    success: bool,
) {
    let _ = app.emit(
        "ollama-install-progress",
        InstallProgressEvent {
            model: model.to_string(),
            stream: stream.to_string(),
            message: message.to_string(),
            done,
            success,
        },
    );
}

fn append_install_output(output: &Arc<Mutex<String>>, text: &str) {
    if text.trim().is_empty() {
        return;
    }
    if let Ok(mut value) = output.lock() {
        value.push_str(text);
        if value.chars().count() > 4000 {
            let tail: String = value.chars().rev().take(4000).collect();
            *value = tail.chars().rev().collect();
        }
    }
}

fn spawn_output_collector<R: Read + Send + 'static>(
    mut reader: R,
    output: Arc<Mutex<String>>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buffer = [0_u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    let text = String::from_utf8_lossy(&buffer[..size]).to_string();
                    append_install_output(&output, &text);
                }
                Err(_) => break,
            }
        }
    })
}

fn strip_ansi_sequences(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            if matches!(chars.peek(), Some('[')) {
                let _ = chars.next();
                for next in chars.by_ref() {
                    if ('@'..='~').contains(&next) {
                        break;
                    }
                }
                continue;
            }
            continue;
        }
        if ch.is_control() && ch != '\n' && ch != '\r' && ch != '\t' {
            continue;
        }
        output.push(ch);
    }
    strip_orphan_csi_sequences(&output)
}

fn strip_orphan_csi_sequences(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let chars: Vec<char> = input.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        if chars[index] == '[' {
            let mut cursor = index + 1;
            if cursor < chars.len()
                && (chars[cursor] == '?' || chars[cursor].is_ascii_digit() || chars[cursor] == ';')
            {
                cursor += 1;
                while cursor < chars.len()
                    && (chars[cursor].is_ascii_digit()
                        || matches!(chars[cursor], ';' | '?' | ':' | '<' | '>' | '='))
                {
                    cursor += 1;
                }
                if cursor < chars.len() && matches!(chars[cursor], '@'..='~') {
                    index = cursor + 1;
                    continue;
                }
            }
        }
        output.push(chars[index]);
        index += 1;
    }
    output
}

fn clean_install_line(line: &str) -> Option<String> {
    let clean = strip_ansi_sequences(line)
        .replace('\u{fffd}', "")
        .replace(['▕', '▏'], "")
        .replace('\t', " ");
    let compact = clean.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.is_empty() {
        return None;
    }
    let lower = compact.to_lowercase();
    let useful = lower.contains("pulling")
        || lower.contains("verifying")
        || lower.contains("writing")
        || lower.contains("success")
        || lower.contains("error")
        || lower.contains("manifest")
        || lower.contains("download")
        || lower.contains("install");
    if useful {
        Some(compact)
    } else {
        None
    }
}

fn clean_benchmark_output(output: &str) -> String {
    let without_ansi = strip_ansi_sequences(output)
        .replace('\u{fffd}', "")
        .replace('\r', "\n");
    let lower_all = without_ansi.to_lowercase();
    if let Some(index) = lower_all.rfind("done thinking") {
        let start = index + "done thinking".len();
        let final_part = without_ansi[start..]
            .trim_matches(|ch: char| ch.is_whitespace() || matches!(ch, '.' | ':' | '-' | '…'));
        if !final_part.trim().is_empty() {
            return final_part
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .take(700)
                .collect();
        }
    }
    let mut lines = Vec::new();
    let mut skip_thinking = false;
    for raw in without_ansi.lines() {
        let line = raw.split_whitespace().collect::<Vec<_>>().join(" ");
        if line.is_empty() {
            continue;
        }
        let lower = line.to_lowercase();
        if lower.starts_with("thinking") || lower == "think" || lower.starts_with("<think") {
            skip_thinking = true;
            continue;
        }
        if lower.contains("done thinking") {
            skip_thinking = false;
            if let Some((_, tail)) = lower.split_once("done thinking") {
                let original_tail = &line[line.len().saturating_sub(tail.len())..];
                let cleaned_tail = original_tail.trim_matches(|ch: char| {
                    ch.is_whitespace() || matches!(ch, '.' | ':' | '-' | '…')
                });
                if !cleaned_tail.is_empty() {
                    lines.push(cleaned_tail.to_string());
                }
            }
            continue;
        }
        if skip_thinking
            && (lower.starts_with("okay")
                || lower.starts_with("let me")
                || lower.starts_with("first,")
                || lower.starts_with("break this down")
                || lower.contains("i should")
                || lower.contains("let me check"))
        {
            continue;
        }
        if line == "</think>" {
            skip_thinking = false;
            continue;
        }
        lines.push(line);
    }
    let compact = lines.join(" ").trim().to_string();
    if compact.chars().count() > 700 {
        compact.chars().take(700).collect()
    } else {
        compact
    }
}

fn spawn_install_reader<R: Read + Send + 'static>(
    app: AppHandle,
    model: String,
    stream: &'static str,
    mut reader: R,
    output: Arc<Mutex<String>>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buffer = [0_u8; 512];
        let mut last_emitted = String::new();
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    let text = String::from_utf8_lossy(&buffer[..size]).to_string();
                    append_install_output(&output, &text);
                    let normalized = strip_ansi_sequences(&text).replace('\r', "\n");
                    for raw_line in normalized.lines().map(str::trim) {
                        if let Some(line) = clean_install_line(raw_line) {
                            if line == last_emitted {
                                continue;
                            }
                            last_emitted = line.clone();
                            emit_install_progress(&app, &model, stream, &line, false, false);
                        }
                    }
                }
                Err(error) => {
                    emit_install_progress(
                        &app,
                        &model,
                        stream,
                        &format!("Lecture sortie Ollama interrompue: {error}"),
                        false,
                        false,
                    );
                    break;
                }
            }
        }
    })
}

#[tauri::command]
async fn preflight_ollama_install(
    request: InstallPreflightRequest,
) -> Result<InstallPreflightResult, String> {
    let model = validate_ollama_model_ref(&request.model)?;
    let runtime = normalize_ollama_runtime(request.runtime.as_deref());
    tauri::async_runtime::spawn_blocking(move || ollama_install_preflight_inner(model, runtime))
        .await
        .map_err(|err| format!("Préflight Ollama interrompu: {err}"))?
}

fn ollama_install_preflight_inner(
    model: String,
    runtime: OllamaRuntime,
) -> Result<InstallPreflightResult, String> {
    let list_output = run_ollama_command_for(runtime, &["list"]);
    let runtime_ready =
        list_output.is_some() || run_ollama_command_for(runtime, &["--version"]).is_some();
    let model_already_installed = list_output
        .as_deref()
        .map(|output| {
            parse_ollama_list_with_source(output, ollama_runtime_name(runtime))
                .iter()
                .any(|installed| installed_model_matches_ref(installed, &model))
        })
        .unwrap_or(false);
    let storage = ollama_storage_probe(runtime);

    Ok(InstallPreflightResult {
        schema: "outilsia.install_safety_preflight.v1".to_string(),
        model,
        runtime: ollama_runtime_name(runtime).to_string(),
        runtime_ready,
        model_already_installed,
        storage_free_gb: storage.free_gb,
        storage_scope: storage.scope,
        storage_source: storage.source,
        storage_path_exposed: false,
        checked_at_ms: now_ms(),
    })
}

#[tauri::command]
fn install_ollama_model(
    app: AppHandle,
    active_installs: State<'_, ActiveInstalls>,
    request: InstallModelRequest,
) -> Result<InstallModelResult, String> {
    let model = validate_ollama_model_ref(&request.model)?;
    let runtime = normalize_ollama_runtime(request.runtime.as_deref());
    let install_key = active_install_key(runtime, &model);
    let timeout = Duration::from_secs(request.timeout_seconds.unwrap_or(1800).clamp(60, 7200));
    let started = Instant::now();
    emit_install_progress(
        &app,
        &model,
        "cmd",
        &format!("{} pull {model}", ollama_runtime_name(runtime)),
        false,
        false,
    );
    let mut command = build_ollama_command(runtime);
    let mut child = match command
        .arg("pull")
        .arg(&model)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(err) => {
            let message = format!("Impossible de lancer Ollama: {err}");
            emit_install_progress(&app, &model, "erreur", &message, true, false);
            return Ok(InstallModelResult {
                model,
                success: false,
                elapsed_ms: started.elapsed().as_millis(),
                output_preview: String::new(),
                error: Some(message),
                created_at_ms: now_ms(),
            });
        }
    };
    if let Ok(mut active) = active_installs.0.lock() {
        active.insert(install_key.clone(), child.id());
    }

    let stdout_preview = Arc::new(Mutex::new(String::new()));
    let stderr_preview = Arc::new(Mutex::new(String::new()));
    let mut readers = Vec::new();

    if let Some(stdout) = child.stdout.take() {
        readers.push(spawn_install_reader(
            app.clone(),
            model.clone(),
            "ollama",
            stdout,
            stdout_preview.clone(),
        ));
    }
    if let Some(stderr) = child.stderr.take() {
        readers.push(spawn_install_reader(
            app.clone(),
            model.clone(),
            "ollama",
            stderr,
            stderr_preview.clone(),
        ));
    }

    let mut timed_out = false;
    let mut last_progress_tick = Instant::now();
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|err| format!("Installation Ollama illisible: {err}"))?
        {
            break status;
        }
        if last_progress_tick.elapsed() >= Duration::from_secs(5) {
            emit_install_progress(
                &app,
                &model,
                "info",
                "Téléchargement ou installation toujours en cours...",
                false,
                false,
            );
            last_progress_tick = Instant::now();
        }
        if started.elapsed() >= timeout {
            timed_out = true;
            emit_install_progress(
                &app,
                &model,
                "erreur",
                &format!(
                    "Temps limite atteint après {} secondes. Arrêt du téléchargement.",
                    timeout.as_secs()
                ),
                false,
                false,
            );
            let _ = child.kill();
            break child
                .wait()
                .map_err(|err| format!("Fin Ollama indisponible: {err}"))?;
        }
        std::thread::sleep(Duration::from_millis(350));
    };

    for reader in readers {
        let _ = reader.join();
    }
    if let Ok(mut active) = active_installs.0.lock() {
        active.remove(&install_key);
    }

    let stdout = stdout_preview
        .lock()
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    let stderr = stderr_preview
        .lock()
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    let success = status.success() && !timed_out;
    emit_install_progress(
        &app,
        &model,
        if success { "ok" } else { "erreur" },
        if success {
            "Installation terminée."
        } else {
            "Installation incomplète."
        },
        true,
        success,
    );

    Ok(InstallModelResult {
        model,
        success,
        elapsed_ms: started.elapsed().as_millis(),
        output_preview: stdout.chars().take(900).collect(),
        error: if success {
            None
        } else if timed_out {
            Some(format!(
                "Installation stoppée après {} secondes.",
                timeout.as_secs()
            ))
        } else {
            Some(stderr.chars().take(700).collect())
        },
        created_at_ms: now_ms(),
    })
}

fn terminate_process_id(pid: u32) -> Result<(), String> {
    let pid_text = pid.to_string();
    #[cfg(target_os = "windows")]
    let output = Command::new("taskkill")
        .args(["/PID", &pid_text, "/T", "/F"])
        .output()
        .map_err(|err| format!("Impossible d'annuler le processus: {err}"))?;

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("kill")
        .args(["-TERM", &pid_text])
        .output()
        .map_err(|err| format!("Impossible d'annuler le processus: {err}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            "Annulation refusée par le système.".to_string()
        } else {
            stderr
        })
    }
}

#[tauri::command]
fn cancel_ollama_install(
    app: AppHandle,
    active_installs: State<'_, ActiveInstalls>,
    model: String,
) -> Result<CancelInstallResult, String> {
    let model = validate_ollama_model_ref(&model)?;
    let pid = {
        let mut active = active_installs
            .0
            .lock()
            .map_err(|_| "Registre d'installation indisponible.".to_string())?;
        active
            .remove(&active_install_key(OllamaRuntime::Native, &model))
            .or_else(|| active.remove(&active_install_key(OllamaRuntime::Wsl, &model)))
            .or_else(|| active.remove(&model))
    };
    let Some(pid) = pid else {
        let message = "Aucun téléchargement actif pour ce modèle.".to_string();
        emit_install_progress(&app, &model, "alerte", &message, false, false);
        return Ok(CancelInstallResult {
            model,
            cancelled: false,
            message,
            created_at_ms: now_ms(),
        });
    };
    match terminate_process_id(pid) {
        Ok(()) => {
            let message = "Annulation demandée. Ollama arrête le téléchargement.".to_string();
            emit_install_progress(&app, &model, "alerte", &message, false, false);
            Ok(CancelInstallResult {
                model,
                cancelled: true,
                message,
                created_at_ms: now_ms(),
            })
        }
        Err(error) => {
            emit_install_progress(&app, &model, "erreur", &error, false, false);
            Ok(CancelInstallResult {
                model,
                cancelled: false,
                message: error,
                created_at_ms: now_ms(),
            })
        }
    }
}

#[tauri::command]
fn delete_ollama_model(
    app: AppHandle,
    request: InstallModelRequest,
) -> Result<InstallModelResult, String> {
    let model = validate_ollama_model_ref(&request.model)?;
    let runtime = normalize_ollama_runtime(request.runtime.as_deref());
    let timeout = Duration::from_secs(request.timeout_seconds.unwrap_or(120).clamp(10, 600));
    let started = Instant::now();
    emit_install_progress(
        &app,
        &model,
        "cmd",
        &format!("{} rm {model}", ollama_runtime_name(runtime)),
        false,
        false,
    );

    let mut command = build_ollama_command(runtime);
    command.arg("rm").arg(&model);
    let (output, timed_out) = command_output_with_timeout(
        command,
        timeout,
        &format!("Suppression {}", ollama_runtime_name(runtime)),
    )?;

    let elapsed = started.elapsed();
    let stdout = clean_benchmark_output(&String::from_utf8_lossy(&output.stdout));
    let stderr = clean_benchmark_output(&String::from_utf8_lossy(&output.stderr));
    let success = output.status.success() && !timed_out;
    let message = if success {
        format!("{model} supprimé.")
    } else if timed_out {
        format!("Suppression stoppée après {} secondes.", timeout.as_secs())
    } else {
        stderr
            .chars()
            .take(700)
            .collect::<String>()
            .trim()
            .to_string()
    };

    emit_install_progress(
        &app,
        &model,
        if success { "ok" } else { "erreur" },
        if success {
            "Modèle supprimé."
        } else {
            "Suppression incomplète."
        },
        true,
        success,
    );

    Ok(InstallModelResult {
        model,
        success,
        elapsed_ms: elapsed.as_millis(),
        output_preview: if stdout.trim().is_empty() {
            message.chars().take(900).collect()
        } else {
            stdout.chars().take(900).collect()
        },
        error: if success { None } else { Some(message) },
        created_at_ms: now_ms(),
    })
}

pub(crate) fn command_output_with_timeout(
    mut command: Command,
    timeout: Duration,
    label: &str,
) -> Result<(std::process::Output, bool), String> {
    let started = Instant::now();
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("Impossible de lancer {label}: {err}"))?;
    let mut timed_out = false;
    loop {
        if child
            .try_wait()
            .map_err(|err| format!("{label} illisible: {err}"))?
            .is_some()
        {
            break;
        }
        if started.elapsed() >= timeout {
            timed_out = true;
            let _ = child.kill();
            break;
        }
        std::thread::sleep(Duration::from_millis(120));
    }
    let output = child
        .wait_with_output()
        .map_err(|err| format!("Sortie {label} indisponible: {err}"))?;
    Ok((output, timed_out))
}

fn command_output_with_input_timeout(
    mut command: Command,
    input: &[u8],
    timeout: Duration,
    label: &str,
) -> Result<(String, String, bool, bool), String> {
    let started = Instant::now();
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("Impossible de lancer {label}: {err}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(input)
            .map_err(|err| format!("Entrée {label} indisponible: {err}"))?;
    }

    let stdout_preview = Arc::new(Mutex::new(String::new()));
    let stderr_preview = Arc::new(Mutex::new(String::new()));
    let mut readers = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        readers.push(spawn_output_collector(stdout, stdout_preview.clone()));
    }
    if let Some(stderr) = child.stderr.take() {
        readers.push(spawn_output_collector(stderr, stderr_preview.clone()));
    }

    let mut timed_out = false;
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|err| format!("{label} illisible: {err}"))?
        {
            break status;
        }
        if started.elapsed() >= timeout {
            timed_out = true;
            let _ = child.kill();
            break child
                .wait()
                .map_err(|err| format!("Fin {label} indisponible: {err}"))?;
        }
        thread::sleep(Duration::from_millis(120));
    };
    for reader in readers {
        let _ = reader.join();
    }
    let stdout = stdout_preview
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();
    let stderr = stderr_preview
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();
    Ok((stdout, stderr, status.success(), timed_out))
}

#[tauri::command]
fn install_ollama_runtime(app: AppHandle) -> Result<InstallModelResult, String> {
    let model = "ollama".to_string();
    let started = Instant::now();
    if run_ollama_command(&["--version"]).is_some() {
        emit_install_progress(
            &app,
            &model,
            "ok",
            "Ollama est déjà installé et accessible.",
            true,
            true,
        );
        return Ok(InstallModelResult {
            model,
            success: true,
            elapsed_ms: started.elapsed().as_millis(),
            output_preview: "Ollama déjà installé.".to_string(),
            error: None,
            created_at_ms: now_ms(),
        });
    }

    if !cfg!(target_os = "windows") {
        let message = "Installation automatique disponible seulement sur Windows pour cette bêta. Installe Ollama depuis la page officielle.";
        emit_install_progress(&app, &model, "erreur", message, true, false);
        return Ok(InstallModelResult {
            model,
            success: false,
            elapsed_ms: started.elapsed().as_millis(),
            output_preview: String::new(),
            error: Some(message.to_string()),
            created_at_ms: now_ms(),
        });
    }

    let installer_label = match spawn_ollama_installer_detached() {
        Ok(label) => label,
        Err(err) => {
            let message = format!("Impossible de lancer l'installation automatique Ollama: {err}");
            emit_install_progress(&app, &model, "erreur", &message, true, false);
            return Ok(InstallModelResult {
                model,
                success: false,
                elapsed_ms: started.elapsed().as_millis(),
                output_preview: String::new(),
                error: Some(message),
                created_at_ms: now_ms(),
            });
        }
    };
    emit_install_progress(&app, &model, "cmd", installer_label, false, false);
    emit_install_progress(
        &app,
        &model,
        "info",
        "Installeur Ollama lancé. Termine l'installation dans la fenêtre Windows, puis relance le scan.",
        true,
        true,
    );

    Ok(InstallModelResult {
        model,
        success: true,
        elapsed_ms: started.elapsed().as_millis(),
        output_preview: "Installeur Ollama lancé.".to_string(),
        error: None,
        created_at_ms: now_ms(),
    })
}

fn spawn_ollama_installer_detached() -> Result<&'static str, String> {
    match Command::new("winget")
        .args([
            "install",
            "--id",
            "Ollama.Ollama",
            "-e",
            "--accept-package-agreements",
            "--accept-source-agreements",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(_) => Ok("winget install --id Ollama.Ollama -e"),
        Err(winget_err) => {
            open_ollama_download_page()
                .map(|_| "winget indisponible - page officielle Ollama ouverte")
                .map_err(|open_err| {
                    format!("winget indisponible ({winget_err}); ouverture page Ollama impossible ({open_err})")
                })
        }
    }
}

fn open_ollama_download_page() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("rundll32");
        cmd.args(["url.dll,FileProtocolHandler", "https://ollama.com/download"]);
        cmd
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg("https://ollama.com/download");
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg("https://ollama.com/download");
        cmd
    };

    command
        .spawn()
        .map_err(|err| format!("Impossible d'ouvrir Ollama: {err}"))?;
    Ok(())
}

fn detect_gpu() -> GpuProbe {
    let vulkan_version = detect_vulkan_version();
    if let Some(mut gpu) = detect_nvidia_smi() {
        if let Some(metadata) = detect_windows_gpu() {
            if metadata.vendor.as_deref() == Some("NVIDIA") {
                gpu.driver_date = metadata.driver_date;
                gpu.driver_provider = metadata.driver_provider;
                gpu.pnp_device_id = metadata.pnp_device_id;
            }
        }
        gpu.vulkan_version = vulkan_version;
        return gpu;
    }
    if let Some(mut gpu) = detect_windows_gpu() {
        gpu.vulkan_version = vulkan_version;
        return gpu;
    }
    if let Some(mut gpu) = detect_macos_gpu() {
        gpu.vulkan_version = vulkan_version;
        return gpu;
    }
    if let Some(mut gpu) = detect_linux_lspci() {
        gpu.vulkan_version = vulkan_version;
        return gpu;
    }

    unknown_gpu_probe()
}

fn unknown_gpu_probe() -> GpuProbe {
    GpuProbe {
        name: None,
        vendor: None,
        category: Some("unknown".to_string()),
        vram_gb: None,
        vram_confidence: "unknown".to_string(),
        source: "not_detected".to_string(),
        driver_version: None,
        driver_date: None,
        driver_provider: None,
        pnp_device_id: None,
        cuda_version: None,
        rocm_version: None,
        vulkan_version: None,
        kernel_driver: None,
        memory_used_mb: None,
        performance_state: None,
        rebar_status: None,
        temperature_c: None,
        utilization_percent: None,
        power_draw_w: None,
        power_limit_w: None,
        pcie_link_width_current: None,
        pcie_link_width_max: None,
        pcie_link_gen_current: None,
        pcie_link_gen_max: None,
    }
}

fn detect_nvidia_smi() -> Option<GpuProbe> {
    let output = run_command(
        "nvidia-smi",
        &[
            "--query-gpu=name,memory.total,memory.used,driver_version,pstate,temperature.gpu,utilization.gpu,power.draw,power.limit,pcie.link.width.current,pcie.link.width.max,pcie.link.gen.current,pcie.link.gen.max",
            "--format=csv,noheader,nounits",
        ],
    )?;
    parse_nvidia_smi_csv(
        &output,
        detect_nvidia_cuda_version(),
        detect_nvidia_rebar_status(),
    )
}

fn parse_nvidia_smi_csv(
    output: &str,
    cuda_version: Option<String>,
    rebar_status: Option<String>,
) -> Option<GpuProbe> {
    let line = output.lines().find(|line| !line.trim().is_empty())?;
    let mut parts = line.split(',').map(str::trim);
    let name = parts.next()?.to_string();
    let memory_mb = parts.next().and_then(|value| value.parse::<u32>().ok());
    let memory_used_mb = parts.next().and_then(parse_optional_u32);
    let driver_version = parts.next().and_then(clean_optional_string);
    let performance_state = parts.next().and_then(clean_optional_string);
    let temperature_c = parts.next().and_then(parse_optional_f64);
    let utilization_percent = parts.next().and_then(parse_optional_f64);
    let power_draw_w = parts.next().and_then(parse_optional_f64);
    let power_limit_w = parts.next().and_then(parse_optional_f64);
    let pcie_link_width_current = parts.next().and_then(parse_optional_u32);
    let pcie_link_width_max = parts.next().and_then(parse_optional_u32);
    let pcie_link_gen_current = parts.next().and_then(parse_optional_u32);
    let pcie_link_gen_max = parts.next().and_then(parse_optional_u32);

    Some(GpuProbe {
        name: Some(name.clone()),
        vendor: Some("NVIDIA".to_string()),
        category: Some(gpu_category(&name)),
        vram_gb: memory_mb.map(|mb| ((mb as f64) / 1024.0).round() as u32),
        vram_confidence: "measured_nvidia_smi".to_string(),
        source: "nvidia-smi".to_string(),
        driver_version,
        driver_date: None,
        driver_provider: Some("NVIDIA".to_string()),
        pnp_device_id: None,
        cuda_version,
        rocm_version: None,
        vulkan_version: None,
        kernel_driver: None,
        memory_used_mb,
        performance_state,
        rebar_status,
        temperature_c,
        utilization_percent,
        power_draw_w,
        power_limit_w,
        pcie_link_width_current,
        pcie_link_width_max,
        pcie_link_gen_current,
        pcie_link_gen_max,
    })
}

fn clean_optional_string(value: &str) -> Option<String> {
    let clean = value.trim();
    if clean.is_empty()
        || clean.eq_ignore_ascii_case("[not supported]")
        || clean.eq_ignore_ascii_case("n/a")
        || clean.eq_ignore_ascii_case("unknown")
        || clean.eq_ignore_ascii_case("other")
        || clean.eq_ignore_ascii_case("not specified")
        || clean.eq_ignore_ascii_case("to be filled by o.e.m.")
    {
        None
    } else {
        Some(clean.to_string())
    }
}

fn parse_optional_f64(value: &str) -> Option<f64> {
    clean_optional_string(value)?.parse::<f64>().ok()
}

fn parse_optional_u32(value: &str) -> Option<u32> {
    clean_optional_string(value)?.parse::<u32>().ok()
}

fn detect_nvidia_cuda_version() -> Option<String> {
    let output = run_command("nvidia-smi", &[])?;
    let marker = "CUDA Version:";
    output.lines().find_map(|line| {
        let (_, right) = line.split_once(marker)?;
        right
            .split_whitespace()
            .next()
            .and_then(clean_optional_string)
    })
}

fn detect_nvidia_rebar_status() -> Option<String> {
    let output = run_command("nvidia-smi", &["-q"])?;
    parse_nvidia_rebar_status(&output)
}

fn parse_nvidia_rebar_status(output: &str) -> Option<String> {
    let lines: Vec<&str> = output.lines().collect();
    for (index, line) in lines.iter().enumerate() {
        let lower = line.trim().to_lowercase();
        if !lower.contains("resizable bar") && !lower.contains("resizeable bar") {
            continue;
        }
        if let Some((_, value)) = line.split_once(':') {
            let normalized = value.trim().to_lowercase();
            if normalized.contains("enabled") || normalized == "yes" {
                return Some("enabled".to_string());
            }
            if normalized.contains("disabled") || normalized == "no" {
                return Some("disabled".to_string());
            }
        }
        for candidate in lines.iter().skip(index + 1).take(6) {
            let normalized = candidate.trim().to_lowercase();
            if normalized.contains("enabled") || normalized.ends_with(": yes") {
                return Some("enabled".to_string());
            }
            if normalized.contains("disabled") || normalized.ends_with(": no") {
                return Some("disabled".to_string());
            }
        }
        return Some("reported_unconfirmed".to_string());
    }
    None
}

fn detect_rocm_version() -> Option<String> {
    let output = run_command("rocminfo", &[])
        .or_else(|| run_command("rocm-smi", &["--showdriverversion"]))
        .or_else(|| run_command("amd-smi", &["version"]))?;
    output.lines().find_map(|line| {
        let lower = line.to_lowercase();
        if !(lower.contains("rocm") || lower.contains("driver")) {
            return None;
        }
        line.split_whitespace()
            .find(|part| {
                part.chars().next().is_some_and(|c| c.is_ascii_digit()) && part.contains('.')
            })
            .and_then(clean_optional_string)
    })
}

fn detect_memory_probe(total_gb: Option<u32>) -> MemoryProbe {
    if let Some(probe) = detect_windows_memory_probe(total_gb) {
        return probe;
    }
    if let Some(probe) = detect_linux_memory_probe(total_gb) {
        return probe;
    }
    fallback_memory_probe(total_gb, "sysinfo")
}

fn detect_motherboard_probe() -> MotherboardProbe {
    if let Some(probe) = detect_windows_motherboard_probe() {
        return probe;
    }
    if let Some(probe) = detect_linux_motherboard_probe() {
        return probe;
    }
    MotherboardProbe {
        manufacturer: None,
        product: None,
        version: None,
        bios_version: None,
        max_memory_gb: None,
        memory_slots: None,
        source: "not_detected".to_string(),
    }
}

fn detect_windows_motherboard_probe() -> Option<MotherboardProbe> {
    if !cfg!(target_os = "windows") {
        return None;
    }
    let script = "$bb=Get-CimInstance Win32_BaseBoard | Select-Object -First 1; $bios=Get-CimInstance Win32_BIOS | Select-Object -First 1; $arr=Get-CimInstance Win32_PhysicalMemoryArray | Select-Object -First 1; [string]::Join('|', @($bb.Manufacturer,$bb.Product,$bb.Version,$bios.SMBIOSBIOSVersion,$arr.MaxCapacity,$arr.MemoryDevices))";
    let output = run_command("powershell.exe", &["-NoProfile", "-Command", script])
        .or_else(|| run_command("powershell", &["-NoProfile", "-Command", script]))?;
    parse_windows_motherboard_line(&output)
}

fn parse_windows_motherboard_line(output: &str) -> Option<MotherboardProbe> {
    let line = output.lines().find(|line| !line.trim().is_empty())?.trim();
    let parts: Vec<&str> = line.split('|').collect();
    let max_memory_gb = parts
        .get(4)
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(|kb| bytes_to_gb(kb.saturating_mul(1024)));
    Some(MotherboardProbe {
        manufacturer: parts.first().and_then(|value| clean_optional_string(value)),
        product: parts.get(1).and_then(|value| clean_optional_string(value)),
        version: parts.get(2).and_then(|value| clean_optional_string(value)),
        bios_version: parts.get(3).and_then(|value| clean_optional_string(value)),
        max_memory_gb,
        memory_slots: parts.get(5).and_then(|value| parse_optional_u32(value)),
        source: "win32_baseboard".to_string(),
    })
}

fn detect_linux_motherboard_probe() -> Option<MotherboardProbe> {
    if cfg!(target_os = "windows") {
        return None;
    }
    let sysfs_probe = detect_linux_sysfs_motherboard_probe();
    let baseboard = run_command("dmidecode", &["-t", "baseboard"]);
    let bios = run_command("dmidecode", &["-t", "bios"]);
    let memory = run_command("dmidecode", &["-t", "memory"]);

    if baseboard.is_none() && bios.is_none() && memory.is_none() {
        return sysfs_probe;
    }

    let had_sysfs = sysfs_probe.is_some();
    let fallback = sysfs_probe.unwrap_or(MotherboardProbe {
        manufacturer: None,
        product: None,
        version: None,
        bios_version: None,
        max_memory_gb: None,
        memory_slots: None,
        source: "not_detected".to_string(),
    });
    Some(MotherboardProbe {
        manufacturer: baseboard
            .as_deref()
            .and_then(|value| dmidecode_field(value, "Manufacturer"))
            .or(fallback.manufacturer),
        product: baseboard
            .as_deref()
            .and_then(|value| dmidecode_field(value, "Product Name"))
            .or(fallback.product),
        version: baseboard
            .as_deref()
            .and_then(|value| dmidecode_field(value, "Version"))
            .or(fallback.version),
        bios_version: bios
            .as_deref()
            .and_then(|value| dmidecode_field(value, "Version"))
            .or(fallback.bios_version),
        max_memory_gb: memory.as_deref().and_then(parse_dmidecode_max_capacity_gb),
        memory_slots: memory
            .as_deref()
            .and_then(|value| dmidecode_field(value, "Number Of Devices"))
            .and_then(|value| parse_optional_u32(&value)),
        source: if had_sysfs {
            "linux_sysfs_dmi+dmidecode".to_string()
        } else {
            "dmidecode".to_string()
        },
    })
}

fn detect_linux_sysfs_motherboard_probe() -> Option<MotherboardProbe> {
    linux_sysfs_motherboard_probe_from_values(
        read_clean_file("/sys/class/dmi/id/board_vendor"),
        read_clean_file("/sys/class/dmi/id/board_name"),
        read_clean_file("/sys/class/dmi/id/board_version"),
        read_clean_file("/sys/class/dmi/id/bios_version"),
    )
}

fn read_clean_file(path: &str) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .and_then(|value| clean_optional_string(&value))
}

fn linux_sysfs_motherboard_probe_from_values(
    manufacturer: Option<String>,
    product: Option<String>,
    version: Option<String>,
    bios_version: Option<String>,
) -> Option<MotherboardProbe> {
    if manufacturer.is_none() && product.is_none() && version.is_none() && bios_version.is_none() {
        return None;
    }
    Some(MotherboardProbe {
        manufacturer,
        product,
        version,
        bios_version,
        max_memory_gb: None,
        memory_slots: None,
        source: "linux_sysfs_dmi".to_string(),
    })
}

fn dmidecode_field(output: &str, key: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let trimmed = line.trim();
        let (left, right) = trimmed.split_once(':')?;
        if left.trim() == key {
            clean_optional_string(right)
        } else {
            None
        }
    })
}

fn parse_dmidecode_max_capacity_gb(output: &str) -> Option<u32> {
    let value = dmidecode_field(output, "Maximum Capacity")?;
    parse_memory_size_gb(&value)
}

fn detect_windows_memory_probe(total_gb: Option<u32>) -> Option<MemoryProbe> {
    if !cfg!(target_os = "windows") {
        return None;
    }
    let script = "Get-CimInstance Win32_PhysicalMemory | ForEach-Object { [string]::Join('|', @($_.Capacity,$_.ConfiguredClockSpeed,$_.Speed,$_.Manufacturer,$_.PartNumber,$_.DeviceLocator,$_.SMBIOSMemoryType)) }";
    let output = run_command("powershell.exe", &["-NoProfile", "-Command", script])
        .or_else(|| run_command("powershell", &["-NoProfile", "-Command", script]))?;
    let modules = parse_memory_module_lines(&output);
    if modules.is_empty() {
        return None;
    }
    Some(memory_probe_from_modules(
        total_gb,
        modules,
        "win32_physical_memory",
    ))
}

fn detect_linux_memory_probe(total_gb: Option<u32>) -> Option<MemoryProbe> {
    if cfg!(target_os = "windows") {
        return None;
    }
    let output = run_command("dmidecode", &["-t", "memory"])?;
    let modules = parse_dmidecode_memory_modules(&output);
    if modules.is_empty() {
        return None;
    }
    Some(memory_probe_from_modules(total_gb, modules, "dmidecode"))
}

fn parse_memory_module_lines(output: &str) -> Vec<MemoryModule> {
    output
        .lines()
        .filter_map(|line| {
            let clean = line.trim();
            if clean.is_empty() {
                return None;
            }
            let parts: Vec<&str> = clean.split('|').collect();
            let capacity_bytes = parts
                .first()
                .and_then(|value| value.trim().parse::<u64>().ok());
            let size_gb = capacity_bytes.map(bytes_to_gb);
            if size_gb.unwrap_or_default() == 0 {
                return None;
            }
            Some(MemoryModule {
                size_gb,
                memory_type: parts
                    .get(6)
                    .and_then(|value| value.trim().parse::<u32>().ok())
                    .and_then(memory_type_from_smbios_code),
                configured_clock_mhz: parts.get(1).and_then(|value| parse_optional_u32(value)),
                speed_mhz: parts.get(2).and_then(|value| parse_optional_u32(value)),
                manufacturer: parts.get(3).and_then(|value| clean_optional_string(value)),
                part_number: parts.get(4).and_then(|value| clean_optional_string(value)),
                slot: parts.get(5).and_then(|value| clean_optional_string(value)),
            })
        })
        .collect()
}

fn parse_dmidecode_memory_modules(output: &str) -> Vec<MemoryModule> {
    let mut modules = Vec::new();
    let mut current = MemoryModule {
        size_gb: None,
        memory_type: None,
        configured_clock_mhz: None,
        speed_mhz: None,
        manufacturer: None,
        part_number: None,
        slot: None,
    };
    let mut in_device = false;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed == "Memory Device" {
            if in_device && current.size_gb.unwrap_or_default() > 0 {
                modules.push(current.clone());
            }
            in_device = true;
            current = MemoryModule {
                size_gb: None,
                memory_type: None,
                configured_clock_mhz: None,
                speed_mhz: None,
                manufacturer: None,
                part_number: None,
                slot: None,
            };
            continue;
        }
        if !in_device {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once(':') {
            let value = value.trim();
            match key.trim() {
                "Size" => current.size_gb = parse_memory_size_gb(value),
                "Type" => current.memory_type = clean_optional_string(value),
                "Configured Memory Speed" => current.configured_clock_mhz = parse_memory_mhz(value),
                "Speed" => current.speed_mhz = parse_memory_mhz(value),
                "Manufacturer" => current.manufacturer = clean_optional_string(value),
                "Part Number" => current.part_number = clean_optional_string(value),
                "Locator" | "Bank Locator" => {
                    current.slot = current.slot.or_else(|| clean_optional_string(value));
                }
                _ => {}
            }
        }
    }
    if in_device && current.size_gb.unwrap_or_default() > 0 {
        modules.push(current);
    }
    modules
}

fn parse_memory_size_gb(value: &str) -> Option<u32> {
    let lower = value.trim().to_lowercase();
    if lower.contains("no module") || lower.contains("unknown") {
        return None;
    }
    let number = lower
        .split_whitespace()
        .next()
        .and_then(|part| part.parse::<f64>().ok())?;
    if lower.contains("mb") {
        Some(((number / 1024.0).round() as u32).max(1))
    } else if lower.contains("gb") {
        Some(number.round() as u32)
    } else if lower.contains("tb") {
        Some((number * 1024.0).round() as u32)
    } else {
        None
    }
}

fn parse_memory_mhz(value: &str) -> Option<u32> {
    value
        .split_whitespace()
        .find_map(|part| part.trim().parse::<u32>().ok())
}

fn memory_type_from_smbios_code(code: u32) -> Option<String> {
    let label = match code {
        20 => "DDR",
        21 => "DDR2",
        24 => "DDR3",
        26 => "DDR4",
        27 => "LPDDR",
        28 => "LPDDR2",
        29 => "LPDDR3",
        30 => "LPDDR4",
        34 => "DDR5",
        35 => "LPDDR5",
        _ => return None,
    };
    Some(label.to_string())
}

fn memory_probe_from_modules(
    total_gb: Option<u32>,
    modules: Vec<MemoryModule>,
    source: &str,
) -> MemoryProbe {
    let module_count = modules.len() as u32;
    let mut memory_types: Vec<String> = modules
        .iter()
        .filter_map(|module| module.memory_type.clone())
        .collect();
    memory_types.sort();
    memory_types.dedup();
    let memory_type = if memory_types.len() == 1 {
        memory_types.into_iter().next()
    } else {
        None
    };
    let configured_clock_mhz = modules
        .iter()
        .filter_map(|module| module.configured_clock_mhz)
        .min();
    let speed_mhz = modules.iter().filter_map(|module| module.speed_mhz).min();
    let channel_mode = if module_count >= 2 {
        "multiple_modules_detected"
    } else {
        "single_module_detected"
    }
    .to_string();
    MemoryProbe {
        total_gb,
        module_count: Some(module_count),
        memory_type,
        configured_clock_mhz,
        speed_mhz,
        channel_mode,
        confidence: "module_layout_only".to_string(),
        source: source.to_string(),
        modules,
    }
}

fn fallback_memory_probe(total_gb: Option<u32>, source: &str) -> MemoryProbe {
    MemoryProbe {
        total_gb,
        module_count: None,
        memory_type: None,
        configured_clock_mhz: None,
        speed_mhz: None,
        channel_mode: "unknown".to_string(),
        confidence: "capacity_only".to_string(),
        source: source.to_string(),
        modules: Vec::new(),
    }
}

fn detect_windows_gpu() -> Option<GpuProbe> {
    if !cfg!(target_os = "windows") {
        return None;
    }

    let output = run_command(
        "powershell",
        &[
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_VideoController | ForEach-Object { $d = if ($_.DriverDate) { $_.DriverDate.ToUniversalTime().ToString('yyyy-MM-dd') } else { '' }; \"$($_.Name)|$($_.AdapterRAM)|$($_.DriverVersion)|$d|$($_.PNPDeviceID)|$($_.AdapterCompatibility)\" }",
        ],
    )?;
    let candidate = preferred_windows_gpu_from_output(&output)?;

    let vendor = detect_vendor(&candidate.name);
    let rocm_version = if vendor == "AMD" {
        detect_rocm_version()
    } else {
        None
    };
    Some(GpuProbe {
        vendor: Some(vendor),
        category: Some(gpu_category(&candidate.name)),
        name: Some(candidate.name),
        vram_gb: candidate.vram_gb,
        vram_confidence: candidate.vram_confidence,
        source: "powershell-win32-videocontroller".to_string(),
        driver_version: candidate.driver_version,
        driver_date: candidate.driver_date,
        driver_provider: candidate.driver_provider,
        pnp_device_id: candidate.pnp_device_id,
        cuda_version: None,
        rocm_version,
        vulkan_version: None,
        kernel_driver: None,
        memory_used_mb: None,
        performance_state: None,
        rebar_status: None,
        temperature_c: None,
        utilization_percent: None,
        power_draw_w: None,
        power_limit_w: None,
        pcie_link_width_current: None,
        pcie_link_width_max: None,
        pcie_link_gen_current: None,
        pcie_link_gen_max: None,
    })
}

fn preferred_windows_gpu_from_output(output: &str) -> Option<WindowsGpuCandidate> {
    output
        .lines()
        .filter_map(|line| {
            let clean = line.trim().trim_matches('\u{feff}').trim();
            if clean.is_empty() {
                return None;
            }
            let parts: Vec<&str> = clean.split('|').collect();
            let name = parts.first().copied().unwrap_or(clean);
            let adapter_ram = parts.get(1).copied().unwrap_or("");
            let driver_version = parts.get(2).and_then(|value| clean_optional_string(value));
            let driver_date = parts.get(3).and_then(|value| clean_optional_string(value));
            let pnp_device_id = parts.get(4).and_then(|value| clean_optional_string(value));
            let driver_provider = parts.get(5).and_then(|value| clean_optional_string(value));
            let name = clean_gpu_device_name(name);
            if name.is_empty() || is_placeholder_gpu_name(&name) {
                return None;
            }
            let (vram_gb, vram_confidence) = windows_adapter_ram_probe(adapter_ram);
            Some(WindowsGpuCandidate {
                name,
                vram_gb,
                vram_confidence,
                driver_version,
                driver_date,
                pnp_device_id,
                driver_provider,
            })
        })
        .max_by_key(|candidate| {
            gpu_preference_score(&candidate.name)
                .saturating_add(candidate.vram_gb.unwrap_or(0).min(32) as u8)
        })
}

fn windows_adapter_ram_probe(value: &str) -> (Option<u32>, String) {
    let Some(bytes) = value.trim().parse::<u64>().ok().filter(|value| *value > 0) else {
        return (None, "not_reported".to_string());
    };
    if (4_000_000_000..=u32::MAX as u64).contains(&bytes) {
        return (None, "unknown_win32_32bit_limit".to_string());
    }
    if bytes > u32::MAX as u64 {
        return (
            Some(bytes_to_gb(bytes)),
            "reported_nonstandard_64bit".to_string(),
        );
    }
    (
        Some(bytes_to_gb(bytes)),
        "estimated_win32_adapter_ram".to_string(),
    )
}

fn detect_macos_gpu() -> Option<GpuProbe> {
    if !cfg!(target_os = "macos") {
        return None;
    }

    let output = run_command("system_profiler", &["SPDisplaysDataType"])?;
    let name = output
        .lines()
        .find_map(|line| line.trim().strip_prefix("Chipset Model:"))
        .map(str::trim)
        .filter(|value| !value.is_empty())?
        .to_string();

    Some(GpuProbe {
        vendor: Some(detect_vendor(&name)),
        category: Some(gpu_category(&name)),
        name: Some(name),
        vram_gb: None,
        vram_confidence: "unified_memory_not_dedicated_vram".to_string(),
        source: "system_profiler".to_string(),
        driver_version: None,
        driver_date: None,
        driver_provider: Some("Apple".to_string()),
        pnp_device_id: None,
        cuda_version: None,
        rocm_version: None,
        vulkan_version: None,
        kernel_driver: None,
        memory_used_mb: None,
        performance_state: None,
        rebar_status: None,
        temperature_c: None,
        utilization_percent: None,
        power_draw_w: None,
        power_limit_w: None,
        pcie_link_width_current: None,
        pcie_link_width_max: None,
        pcie_link_gen_current: None,
        pcie_link_gen_max: None,
    })
}

fn detect_linux_lspci() -> Option<GpuProbe> {
    if !cfg!(target_os = "linux") {
        return None;
    }

    let output = run_command("lspci", &["-nnk"])?;
    let (name, kernel_driver) = preferred_linux_gpu_from_lspci_output(&output)?;

    let rocm_version = if detect_vendor(&name) == "AMD" {
        detect_rocm_version()
    } else {
        None
    };

    Some(GpuProbe {
        vendor: Some(detect_vendor(&name)),
        category: Some(gpu_category(&name)),
        name: Some(name),
        vram_gb: None,
        vram_confidence: "unknown_lspci_no_memory_size".to_string(),
        source: "lspci-nnk".to_string(),
        driver_version: None,
        driver_date: None,
        driver_provider: None,
        pnp_device_id: None,
        cuda_version: None,
        rocm_version,
        vulkan_version: None,
        kernel_driver,
        memory_used_mb: None,
        performance_state: None,
        rebar_status: None,
        temperature_c: None,
        utilization_percent: None,
        power_draw_w: None,
        power_limit_w: None,
        pcie_link_width_current: None,
        pcie_link_width_max: None,
        pcie_link_gen_current: None,
        pcie_link_gen_max: None,
    })
}

fn preferred_linux_gpu_from_lspci_output(output: &str) -> Option<(String, Option<String>)> {
    let lines: Vec<&str> = output.lines().collect();
    lines
        .iter()
        .enumerate()
        .filter_map(|(index, line)| {
            let lower = line.to_lowercase();
            if !(lower.contains("vga compatible controller")
                || lower.contains("3d controller")
                || lower.contains("display controller"))
            {
                return None;
            }
            let name = line
                .split_once(": ")
                .map(|(_, right)| right.trim().to_string())
                .filter(|value| !value.is_empty())?;
            let kernel_driver = lines
                .iter()
                .skip(index + 1)
                .take_while(|next| next.starts_with(' ') || next.starts_with('\t'))
                .find_map(|next| next.trim().strip_prefix("Kernel driver in use:"))
                .and_then(clean_optional_string);
            Some((name, kernel_driver))
        })
        .max_by_key(|(name, _)| gpu_preference_score(name))
}

fn detect_vulkan_version() -> Option<String> {
    let output = run_command("vulkaninfo", &["--summary"])?;
    parse_vulkan_version(&output)
}

fn parse_vulkan_version(output: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let clean = line.trim();
        let value = clean
            .strip_prefix("Vulkan Instance Version:")
            .or_else(|| clean.strip_prefix("Vulkan Instance Version"))?;
        clean_optional_string(value.trim().trim_start_matches(':').trim())
    })
}

fn detect_ollama() -> OllamaProbe {
    let version_output = run_ollama_command(&["--version"]);
    let list_output = run_ollama_command(&["list"]);
    let models = list_output
        .as_deref()
        .map(|output| parse_ollama_list_with_source(output, "ollama"))
        .unwrap_or_default();

    OllamaProbe {
        installed: version_output.is_some() || list_output.is_some(),
        version: version_output.map(|value| value.trim().to_string()),
        models,
        source: "ollama-cli".to_string(),
    }
}

fn detect_ollama_wsl() -> OllamaProbe {
    if !cfg!(target_os = "windows") {
        return OllamaProbe {
            installed: false,
            version: None,
            models: Vec::new(),
            source: "ollama-wsl".to_string(),
        };
    }

    let version_output = run_ollama_command_for(OllamaRuntime::Wsl, &["--version"]);
    let list_output = run_ollama_command_for(OllamaRuntime::Wsl, &["list"]);
    let models = list_output
        .as_deref()
        .map(|output| parse_ollama_list_with_source(output, "ollama-wsl"))
        .unwrap_or_default();

    OllamaProbe {
        installed: version_output.is_some() || list_output.is_some(),
        version: version_output.map(|value| value.trim().to_string()),
        models,
        source: "ollama-wsl".to_string(),
    }
}

fn detect_wsl_distributions() -> Vec<String> {
    if !cfg!(target_os = "windows") {
        return Vec::new();
    }

    let output =
        run_command("wsl.exe", &["-l", "-q"]).or_else(|| run_command("wsl", &["-l", "-q"]));
    output
        .unwrap_or_default()
        .replace('\0', "")
        .lines()
        .map(|line| line.trim().trim_end_matches('\r').to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

fn detect_wsl_gpu_bridge() -> Option<String> {
    if !cfg!(target_os = "windows") {
        return None;
    }
    let output = run_command(
        "wsl.exe",
        &[
            "sh",
            "-lc",
            "if [ -e /dev/dxg ]; then printf available; else printf missing; fi",
        ],
    )?;
    match output.trim().to_lowercase().as_str() {
        "available" => Some("available".to_string()),
        "missing" => Some("missing".to_string()),
        _ => None,
    }
}

fn wsl_runtime_state(ollama_native: bool, ollama_wsl: bool, wsl_installed: bool) -> &'static str {
    if !cfg!(target_os = "windows") {
        return "not_windows";
    }
    if ollama_wsl {
        "wsl_ready"
    } else if wsl_installed {
        "wsl_detected"
    } else if ollama_native {
        "windows_native"
    } else {
        "wsl_missing"
    }
}

#[tauri::command]
fn install_wsl_runtime(app: AppHandle) -> Result<InstallModelResult, String> {
    let model = "wsl".to_string();
    let started = Instant::now();

    if !cfg!(target_os = "windows") {
        let message = "WSL est disponible uniquement sur Windows.";
        emit_install_progress(&app, &model, "erreur", message, true, false);
        return Ok(InstallModelResult {
            model,
            success: false,
            elapsed_ms: started.elapsed().as_millis(),
            output_preview: String::new(),
            error: Some(message.to_string()),
            created_at_ms: now_ms(),
        });
    }

    if run_command("wsl.exe", &["--version"]).is_some()
        || run_command("wsl", &["--version"]).is_some()
    {
        let message = "WSL est déjà installé. Lance le scan pour vérifier la distribution Linux et Ollama côté WSL.";
        emit_install_progress(&app, &model, "ok", message, true, true);
        return Ok(InstallModelResult {
            model,
            success: true,
            elapsed_ms: started.elapsed().as_millis(),
            output_preview: message.to_string(),
            error: None,
            created_at_ms: now_ms(),
        });
    }

    match Command::new("wsl.exe").arg("--install").spawn() {
        Ok(_) => {
            let message = "Installation WSL lancée. Windows peut demander une confirmation administrateur ou un redémarrage.";
            emit_install_progress(&app, &model, "cmd", "wsl.exe --install", false, false);
            emit_install_progress(&app, &model, "info", message, true, true);
            Ok(InstallModelResult {
                model,
                success: true,
                elapsed_ms: started.elapsed().as_millis(),
                output_preview: message.to_string(),
                error: None,
                created_at_ms: now_ms(),
            })
        }
        Err(err) => {
            let message = format!("Impossible de lancer l'installation WSL: {err}");
            emit_install_progress(&app, &model, "erreur", &message, true, false);
            Ok(InstallModelResult {
                model,
                success: false,
                elapsed_ms: started.elapsed().as_millis(),
                output_preview: String::new(),
                error: Some(message),
                created_at_ms: now_ms(),
            })
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OllamaRuntime {
    Native,
    Wsl,
}

#[derive(Debug, Clone, PartialEq)]
struct OllamaStorageProbe {
    free_gb: Option<f64>,
    scope: String,
    source: String,
}

fn installed_model_matches_ref(installed: &InstalledModel, requested: &str) -> bool {
    let requested = requested.trim().to_ascii_lowercase();
    let name = installed.name.trim().to_ascii_lowercase();
    let full = installed
        .tag
        .as_deref()
        .map(|tag| format!("{name}:{}", tag.trim().to_ascii_lowercase()))
        .unwrap_or_else(|| name.clone());
    if requested.contains(':') {
        full == requested
    } else {
        name == requested
    }
}

fn gibibytes_rounded(bytes: u64) -> f64 {
    (((bytes as f64) / 1024_f64.powi(3)) * 10.0).round() / 10.0
}

fn available_space_for_path(path: &Path) -> Option<u64> {
    let target = if path.is_absolute() {
        path.to_path_buf()
    } else {
        env::current_dir().ok()?.join(path)
    };
    let disks = Disks::new_with_refreshed_list();
    disks
        .iter()
        .filter(|disk| target.starts_with(disk.mount_point()))
        .max_by_key(|disk| disk.mount_point().components().count())
        .map(|disk| disk.available_space())
}

fn native_ollama_storage_probe() -> OllamaStorageProbe {
    let custom = env::var("OLLAMA_MODELS")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let target = custom.as_deref().map(PathBuf::from).or_else(|| {
        let home = if cfg!(target_os = "windows") {
            env::var("USERPROFILE")
                .ok()
                .or_else(|| env::var("HOME").ok())
        } else {
            env::var("HOME").ok()
        }?;
        Some(PathBuf::from(home).join(".ollama").join("models"))
    });
    if let Some(path) = target {
        if let Some(bytes) = available_space_for_path(&path) {
            return OllamaStorageProbe {
                free_gb: Some(gibibytes_rounded(bytes)),
                scope: if custom.is_some() {
                    "custom_model_store".to_string()
                } else {
                    "default_model_store".to_string()
                },
                source: "native_model_store_volume".to_string(),
            };
        }
    }
    OllamaStorageProbe {
        free_gb: detect_storage_free_gb().map(f64::from),
        scope: "system_volume_fallback".to_string(),
        source: "system_volume_fallback".to_string(),
    }
}

fn parse_wsl_storage_probe(output: &str) -> OllamaStorageProbe {
    let mut scope = "unknown_model_store".to_string();
    let mut free_kib = None;
    for line in output.lines() {
        if let Some(value) = line.trim().strip_prefix("scope=") {
            scope = match value.trim() {
                "custom" => "custom_model_store".to_string(),
                "default" => "default_model_store".to_string(),
                _ => "unknown_model_store".to_string(),
            };
        }
        if let Some(value) = line.trim().strip_prefix("free_kib=") {
            free_kib = value.trim().parse::<u64>().ok();
        }
    }
    OllamaStorageProbe {
        free_gb: free_kib.map(|value| gibibytes_rounded(value.saturating_mul(1024))),
        scope,
        source: "wsl_df_model_store".to_string(),
    }
}

fn wsl_ollama_storage_probe() -> OllamaStorageProbe {
    const SCRIPT: &str = r#"if [ -n "${OLLAMA_MODELS:-}" ]; then scope=custom; target="$OLLAMA_MODELS"; else scope=default; target="$HOME/.ollama/models"; fi
probe="$target"
while [ ! -e "$probe" ] && [ "$probe" != "/" ]; do probe="$(dirname "$probe")"; done
free_kib="$(df -Pk "$probe" 2>/dev/null | awk 'NR==2 {print $4}')"
printf 'scope=%s\nfree_kib=%s\n' "$scope" "$free_kib""#;
    let mut command = Command::new("wsl.exe");
    command.args(["sh", "-lc", SCRIPT]);
    if let Ok((output, timed_out)) = command_output_with_timeout(
        command,
        DETECTION_COMMAND_TIMEOUT,
        "Préflight stockage Ollama WSL",
    ) {
        if !timed_out && output.status.success() {
            if let Some(text) = decode_command_stdout(&output.stdout) {
                return parse_wsl_storage_probe(&text);
            }
        }
    }
    OllamaStorageProbe {
        free_gb: None,
        scope: "unknown_model_store".to_string(),
        source: "wsl_storage_unavailable".to_string(),
    }
}

fn ollama_storage_probe(runtime: OllamaRuntime) -> OllamaStorageProbe {
    match runtime {
        OllamaRuntime::Wsl if cfg!(target_os = "windows") => wsl_ollama_storage_probe(),
        _ => native_ollama_storage_probe(),
    }
}

fn normalize_ollama_runtime(value: Option<&str>) -> OllamaRuntime {
    match value
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "wsl" | "ollama-wsl" | "wsl-ubuntu" | "ubuntu" if cfg!(target_os = "windows") => {
            OllamaRuntime::Wsl
        }
        _ => OllamaRuntime::Native,
    }
}

fn ollama_runtime_name(runtime: OllamaRuntime) -> &'static str {
    match runtime {
        OllamaRuntime::Native => "ollama",
        OllamaRuntime::Wsl => "ollama-wsl",
    }
}

fn active_install_key(runtime: OllamaRuntime, model: &str) -> String {
    format!("{}::{model}", ollama_runtime_name(runtime))
}

fn build_ollama_command(runtime: OllamaRuntime) -> Command {
    match runtime {
        OllamaRuntime::Wsl if cfg!(target_os = "windows") => {
            let mut command = Command::new("wsl.exe");
            command.arg("ollama");
            command
        }
        _ => Command::new(ollama_program()),
    }
}

fn ollama_program() -> PathBuf {
    if cfg!(target_os = "windows") {
        let mut candidates = Vec::new();
        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(&local_app_data)
                    .join("Programs")
                    .join("Ollama")
                    .join("ollama.exe"),
            );
            candidates.push(
                PathBuf::from(&local_app_data)
                    .join("Ollama")
                    .join("ollama.exe"),
            );
        }
        if let Ok(program_files) = env::var("ProgramFiles") {
            candidates.push(
                PathBuf::from(program_files)
                    .join("Ollama")
                    .join("ollama.exe"),
            );
        }
        if let Some(found) = candidates.into_iter().find(|path| path.exists()) {
            return found;
        }
    }
    PathBuf::from("ollama")
}

fn run_ollama_command(args: &[&str]) -> Option<String> {
    run_ollama_command_for(OllamaRuntime::Native, args)
}

fn run_ollama_command_for(runtime: OllamaRuntime, args: &[&str]) -> Option<String> {
    let mut command = build_ollama_command(runtime);
    command.args(args);
    let (output, timed_out) = command_output_with_timeout(
        command,
        DETECTION_COMMAND_TIMEOUT,
        &format!("Detection {}", ollama_runtime_name(runtime)),
    )
    .ok()?;
    if timed_out || !output.status.success() {
        return None;
    }
    decode_command_stdout(&output.stdout)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn detect_storage_free_gb() -> Option<u32> {
    if cfg!(target_os = "windows") {
        return run_command(
            "powershell",
            &["-NoProfile", "-Command", "(Get-PSDrive -Name C).Free"],
        )
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(bytes_to_gb);
    }

    run_command("df", &["-k", "/"])
        .and_then(|output| {
            output
                .lines()
                .nth(1)
                .and_then(|line| line.split_whitespace().nth(3))
                .and_then(|value| value.parse::<u64>().ok())
        })
        .map(|free_kib| ((free_kib as f64) / 1024_f64.powi(2)).round().max(0.0) as u32)
}

fn merge_installed_models(
    native_models: Vec<InstalledModel>,
    wsl_models: Vec<InstalledModel>,
) -> Vec<InstalledModel> {
    let mut models = native_models;
    models.extend(wsl_models);
    models
}

fn parse_ollama_list_with_source(output: &str, source: &str) -> Vec<InstalledModel> {
    output
        .lines()
        .skip(1)
        .filter_map(|line| {
            let columns: Vec<&str> = line.split_whitespace().collect();
            let full_name = columns.first()?.trim();
            if full_name.is_empty() {
                return None;
            }
            let (name, tag) = full_name
                .split_once(':')
                .map(|(name, tag)| (name.to_string(), Some(tag.to_string())))
                .unwrap_or_else(|| (full_name.to_string(), None));

            Some(InstalledModel {
                name,
                tag,
                size_gb: parse_ollama_size_gb(&columns),
                source: source.to_string(),
                quantization: None,
            })
        })
        .collect()
}

fn parse_ollama_size_gb(columns: &[&str]) -> Option<f64> {
    let value = columns.get(2)?;
    let unit = columns.get(3).copied().unwrap_or("GB");
    parse_size_gb(value, unit)
}

fn parse_size_gb(value: &str, unit: &str) -> Option<f64> {
    let numeric = value.replace(',', ".").parse::<f64>().ok()?;
    let lower = unit.to_lowercase();
    if lower.contains("mb") {
        Some(numeric / 1024.0)
    } else if lower.contains("tb") {
        Some(numeric * 1024.0)
    } else {
        Some(numeric)
    }
}

fn run_command(program: &str, args: &[&str]) -> Option<String> {
    let mut command = Command::new(program);
    command.args(args);
    let (output, timed_out) =
        command_output_with_timeout(command, DETECTION_COMMAND_TIMEOUT, program).ok()?;
    if timed_out || !output.status.success() {
        return None;
    }
    decode_command_stdout(&output.stdout)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn decode_command_stdout(bytes: &[u8]) -> Option<String> {
    if bytes.is_empty() {
        return None;
    }
    let nul_count = bytes.iter().filter(|byte| **byte == 0).count();
    if nul_count > 0 && bytes.len() >= 2 {
        let mut words = Vec::with_capacity(bytes.len() / 2);
        for chunk in bytes.chunks_exact(2) {
            words.push(u16::from_le_bytes([chunk[0], chunk[1]]));
        }
        if !words.is_empty() {
            return Some(String::from_utf16_lossy(&words));
        }
    }
    if let Ok(value) = std::str::from_utf8(bytes) {
        return Some(value.to_string());
    }
    if !bytes.len().is_multiple_of(2) {
        return None;
    }
    let mut words = Vec::with_capacity(bytes.len() / 2);
    for chunk in bytes.chunks_exact(2) {
        words.push(u16::from_le_bytes([chunk[0], chunk[1]]));
    }
    if words.is_empty() {
        return None;
    }
    Some(String::from_utf16_lossy(&words))
}

fn build_machine_name(cpu_name: Option<&str>, gpu_name: Option<&str>) -> String {
    match (gpu_name, cpu_name) {
        (Some(gpu), Some(cpu)) => format!("{gpu} / {cpu}"),
        (Some(gpu), None) => gpu.to_string(),
        (None, Some(cpu)) => cpu.to_string(),
        (None, None) => "Machine IA locale".to_string(),
    }
}

fn stable_machine_key(
    os_name: Option<&str>,
    os_version: Option<&str>,
    cpu_name: Option<&str>,
    gpu_name: Option<&str>,
    ram_gb: Option<u32>,
    vram_gb: Option<u32>,
) -> String {
    let mut hasher = DefaultHasher::new();
    os_name.hash(&mut hasher);
    os_version.hash(&mut hasher);
    cpu_name.hash(&mut hasher);
    gpu_name.hash(&mut hasher);
    ram_gb.hash(&mut hasher);
    vram_gb.hash(&mut hasher);
    format!("local-{:016x}", hasher.finish())
}

fn detect_vendor(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("nvidia") || lower.contains("rtx") || lower.contains("gtx") {
        "NVIDIA".to_string()
    } else if lower.contains("amd") || lower.contains("radeon") {
        "AMD".to_string()
    } else if lower.contains("apple")
        || lower.contains("m1")
        || lower.contains("m2")
        || lower.contains("m3")
        || lower.contains("m4")
    {
        "Apple".to_string()
    } else if lower.contains("intel") || lower.contains("arc") {
        "Intel".to_string()
    } else {
        "Unknown".to_string()
    }
}

fn clean_gpu_device_name(value: &str) -> String {
    value.trim().trim_matches('\u{feff}').trim().to_string()
}

fn is_placeholder_gpu_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    name.eq_ignore_ascii_case("name")
        || lower.contains("microsoft basic")
        || lower.contains("basic render")
        || lower.contains("remote display")
        || lower.contains("remote desktop")
        || lower.contains("virtual")
        || lower.contains("vmware")
        || lower.contains("virtualbox")
        || lower.contains("citrix")
        || lower.contains("parsec")
}

fn gpu_preference_score(name: &str) -> u8 {
    let lower = name.to_ascii_lowercase();
    let mut score: u8 = if lower.contains("nvidia")
        || lower.contains("geforce")
        || lower.contains("rtx")
        || lower.contains("gtx")
        || lower.contains("quadro")
        || lower.contains("tesla")
    {
        80
    } else if lower.contains("amd") || lower.contains("radeon") {
        60
    } else if lower.contains("intel") || lower.contains("arc") {
        30
    } else {
        0
    };

    if lower.contains("rtx 50") || lower.contains("rtx 40") || lower.contains("rx 79") {
        score += 12;
    } else if lower.contains("rtx 30") || lower.contains("rx 78") || lower.contains("rx 77") {
        score += 10;
    } else if lower.contains("rtx 20") || lower.contains("gtx") || lower.contains("rx 6") {
        score += 6;
    }

    if lower.contains(" arc ") || lower.contains("arc(tm)") || lower.contains("arc graphics") {
        score += 8;
    }
    if lower.contains("uhd graphics")
        || lower.contains("iris")
        || lower.contains("radeon(tm) graphics")
    {
        score = score.saturating_sub(8);
    }
    if lower.contains("laptop gpu") || lower.contains("super") || lower.contains(" ti") {
        score += 2;
    }
    score
}

fn gpu_category(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("4090") || lower.contains("5090") || lower.contains("3090") {
        "high-end".to_string()
    } else if lower.contains("4070")
        || lower.contains("4080")
        || lower.contains("5070")
        || lower.contains("5080")
    {
        "performance".to_string()
    } else if lower.contains("3060") || lower.contains("4060") || lower.contains("5060") {
        "entry-local-ai".to_string()
    } else if lower.contains("apple")
        || lower.contains("m4")
        || lower.contains("m3")
        || lower.contains("strix halo")
        || lower.contains("ryzen ai max")
        || lower.contains("radeon 8060s")
        || lower.contains("radeon 8050s")
    {
        "unified-memory".to_string()
    } else {
        "unknown".to_string()
    }
}

fn bytes_to_gb(bytes: u64) -> u32 {
    ((bytes as f64) / 1024_f64.powi(3)).round().max(0.0) as u32
}

fn format_optional_gb(value: Option<u32>) -> String {
    value
        .map(|gb| format!("{gb} Go"))
        .unwrap_or_else(|| "non confirmee".to_string())
}

fn is_unified_memory(
    cpu_name: Option<&str>,
    gpu_name: Option<&str>,
    ram_gb: Option<u32>,
    vram_gb: Option<u32>,
) -> bool {
    if cfg!(target_os = "macos") {
        return true;
    }
    let text = format!(
        "{} {}",
        cpu_name.unwrap_or_default(),
        gpu_name.unwrap_or_default()
    )
    .to_lowercase();
    let looks_like_strix_halo = text.contains("strix halo")
        || text.contains("ryzen ai max")
        || text.contains("ai max+")
        || text.contains("radeon 8060s")
        || text.contains("radeon 8050s");
    looks_like_strix_halo && ram_gb.unwrap_or_default() >= 32 && vram_gb.unwrap_or_default() <= 16
}

fn snapshots_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Dossier app data indisponible: {err}"))?;
    fs::create_dir_all(&dir)
        .map_err(|err| format!("Impossible de creer le dossier app data: {err}"))?;
    Ok(dir.join("snapshots.json"))
}

fn desktop_auth_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Dossier app data indisponible: {err}"))?;
    fs::create_dir_all(&dir)
        .map_err(|err| format!("Impossible de creer le dossier app data: {err}"))?;
    Ok(dir.join("desktop-auth.json"))
}

fn obsidian_vaults_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Dossier app data indisponible: {err}"))?
        .join("obsidian-vaults");
    fs::create_dir_all(&dir)
        .map_err(|err| format!("Impossible de creer le dossier vaults: {err}"))?;
    Ok(dir)
}

fn safe_slug(value: &str) -> String {
    let slug = value
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .take(8)
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() {
        "machine-ia-locale".to_string()
    } else {
        slug
    }
}

fn write_vault_file(
    dir: &Path,
    files: &mut Vec<String>,
    name: &str,
    content: String,
) -> Result<(), String> {
    fs::write(dir.join(name), content)
        .map_err(|err| format!("Impossible d'ecrire {name}: {err}"))?;
    files.push(name.to_string());
    Ok(())
}

fn vault_index_markdown(scan: &MachineScan) -> String {
    [
        format!("# Vault OutilsIA - {}", scan.name),
        String::new(),
        "## Navigation".to_string(),
        String::new(),
        "- [[MANIFESTE]] : inventaire des fichiers et regles de memoire locale.".to_string(),
        "- [[00-Machine]] : profil materiel et runtimes.".to_string(),
        "- [[01-Modeles-compatibles]] : modeles proposes par OutilsIA.".to_string(),
        "- [[02-Modeles-installes]] : modeles Ollama detectes localement.".to_string(),
        "- [[03-Benchmarks]] : dernier benchmark exporte.".to_string(),
        "- [[04-Achats-guides]] : upgrades et liens utiles.".to_string(),
        "- [[05-Dialogues-locaux]] : conversations sauvegardees depuis l'app.".to_string(),
        "- [[06-Shopping-list]] : checklist achat et verification.".to_string(),
        "- [[07-Rapport-partageable]] : synthese claire a copier ou publier.".to_string(),
        "- [[08-Fiches-modeles]] : forces, usages et limites des modeles locaux.".to_string(),
        "- [[09-Catalogues-OutilsIA]] : versions catalogues, nouveautes et paliers.".to_string(),
        "- [[10-Journal-cockpit]] : rapport, Arena, PromptForge, dialogues et benchmarks exportes."
            .to_string(),
        "- [[MEMORY]] : memoire principale reutilisable par IA locale.".to_string(),
        "- [[HERMES]] : charte locale pour Hermes Agent.".to_string(),
        String::new(),
        "## Regle".to_string(),
        String::new(),
        "- Mesurer avant de conclure.".to_string(),
        "- Garder les conversations utiles, pas tous les logs.".to_string(),
        "- Synchroniser ou publier seulement avec accord explicite.".to_string(),
    ]
    .join("\n")
}

fn vault_manifest_markdown(scan: &MachineScan) -> String {
    [
        "---".to_string(),
        "type: vault_manifest".to_string(),
        "source: outilsia-local-cockpit".to_string(),
        format!("machine: \"{}\"", scan.name.replace('"', "'")),
        "---".to_string(),
        String::new(),
        "# Manifeste vault Obsidian".to_string(),
        String::new(),
        "Ce fichier sert de carte du vault exporte par OutilsIA Local Cockpit. Il separe les preuves techniques, les decisions et la memoire utile.".to_string(),
        String::new(),
        "## Fichiers exportes".to_string(),
        String::new(),
        "- [[INDEX]] - point d'entree du vault.".to_string(),
        "- [[00-Machine]] - CPU, RAM, GPU, VRAM, OS et runtimes.".to_string(),
        "- [[01-Modeles-compatibles]] - modeles recommandes et compatibles.".to_string(),
        "- [[02-Modeles-installes]] - modeles Ollama detectes localement.".to_string(),
        "- [[03-Benchmarks]] - mesures locales, vitesse, latence et erreurs.".to_string(),
        "- [[04-Achats-guides]] - upgrades utiles si un blocage est prouve.".to_string(),
        "- [[05-Dialogues-locaux]] - reponses locales sauvegardees par l'utilisateur.".to_string(),
        "- [[06-Shopping-list]] - liste d'achat contextualisee.".to_string(),
        "- [[07-Rapport-partageable]] - synthese courte partageable.".to_string(),
        "- [[08-Fiches-modeles]] - forces, usages et limites des modeles.".to_string(),
        "- [[09-Catalogues-OutilsIA]] - versions catalogues, nouveautes et paliers.".to_string(),
        "- [[10-Journal-cockpit]] - journal complet MemoryForge.".to_string(),
        "- [[MEMORY]] - memoire principale a relire par une IA locale.".to_string(),
        "- [[HERMES]] - regles Hermes Agent et garde-fous.".to_string(),
        String::new(),
        "## Regles de memoire".to_string(),
        String::new(),
        "- Garder les preuves utiles : machine, modeles, benchmarks, decisions et prompts valides.".to_string(),
        "- Ne pas transformer les estimations en preuves : benchmarker quand c'est possible.".to_string(),
        "- Ne pas synchroniser ni publier de contenu personnel sans action explicite.".to_string(),
    ]
    .join("\n")
}

fn cockpit_journal_markdown(scan: &MachineScan, memory_markdown: &str) -> String {
    let content = memory_markdown.trim();
    let body = if content.is_empty() {
        "Aucun journal MemoryForge exporte.".to_string()
    } else {
        content.to_string()
    };
    [
        "---".to_string(),
        "type: journal_cockpit".to_string(),
        format!("machine: \"{}\"", scan.name.replace('"', "'")),
        "runtime: outilsia-local-cockpit".to_string(),
        "---".to_string(),
        String::new(),
        format!("# Journal cockpit - {}", scan.name),
        String::new(),
        "Ce fichier regroupe les preuves utiles du cockpit: rapport machine, Arena locale, PromptForge, dialogues sauvegardes, benchmarks et prochaines actions.".to_string(),
        String::new(),
        "## Regles d'usage".to_string(),
        String::new(),
        "- Garder les mesures locales avec leur modèle et leur machine.".to_string(),
        "- Ne pas transformer une estimation en preuve.".to_string(),
        "- Sauvegarder uniquement les conversations utiles.".to_string(),
        "- Utiliser [[HERMES]] pour relire, résumer et transformer ce journal en décisions.".to_string(),
        String::new(),
        body,
    ]
    .join("\n")
}

fn dialogue_memory_markdown(memory_markdown: Option<&str>) -> String {
    let content = memory_markdown.unwrap_or("").trim();
    if content.is_empty() {
        return [
            "# Dialogues locaux".to_string(),
            String::new(),
            "Aucune reponse locale n'a encore ete sauvegardee depuis l'app.".to_string(),
            String::new(),
            "Utilise le bouton `Sauver memoire` apres une reponse utile.".to_string(),
        ]
        .join("\n");
    }
    [
        "# Dialogues locaux sauvegardes".to_string(),
        String::new(),
        "Ces notes proviennent du bouton `Sauver memoire` dans OutilsIA Local Cockpit.".to_string(),
        String::new(),
        content.to_string(),
    ]
    .join("\n")
}

fn machine_markdown(scan: &MachineScan) -> String {
    [
        format!("# {}", scan.name),
        String::new(),
        "## Materiel".to_string(),
        String::new(),
        format!(
            "- OS: {} {}",
            scan.os_name.as_deref().unwrap_or("inconnu"),
            scan.os_version.as_deref().unwrap_or("")
        ),
        format!(
            "- CPU: {} ({} coeurs)",
            scan.cpu_name.as_deref().unwrap_or("inconnu"),
            scan.cpu_cores.unwrap_or_default()
        ),
        format!("- RAM: {} Go", scan.ram_gb.unwrap_or_default()),
        format!(
            "- GPU: {}",
            scan.gpu_name.as_deref().unwrap_or("non detecte")
        ),
        format!("- VRAM: {}", format_optional_gb(scan.vram_gb)),
        format!(
            "- Memoire unifiee: {}",
            if scan.unified_memory { "oui" } else { "non" }
        ),
        format!(
            "- Stockage libre: {} Go",
            scan.storage_free_gb.unwrap_or_default()
        ),
        String::new(),
        "## Runtimes".to_string(),
        String::new(),
        format!(
            "```json\n{}\n```",
            serde_json::to_string_pretty(&scan.runtimes).unwrap_or_else(|_| "{}".to_string())
        ),
    ]
    .join("\n")
}

fn compatible_models_markdown(compat: &Value, scan: &MachineScan) -> String {
    let mut lines = vec!["# Modeles compatibles".to_string(), String::new()];
    let command_prefix = ollama_command_prefix(scan);
    for model in compat
        .get("compatible")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(30)
    {
        let name = model
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("modele");
        let params = model.get("params").and_then(Value::as_str).unwrap_or("");
        let label = model
            .get("label")
            .and_then(Value::as_str)
            .or_else(|| model.get("status").and_then(Value::as_str))
            .unwrap_or("");
        let ollama = model.get("ollama").and_then(Value::as_str).unwrap_or("");
        lines.push(format!("- **{name} {params}** - {label}"));
        if !ollama.is_empty() {
            lines.push(format!("  - `{command_prefix} run {ollama}`"));
        }
    }
    if lines.len() == 2 {
        lines.push("- Aucun modele compatible exporte.".to_string());
    }
    lines.join("\n")
}

fn installed_models_markdown(scan: &MachineScan) -> String {
    let mut lines = vec!["# Modeles installes".to_string(), String::new()];
    for model in &scan.installed_models {
        let tag = model.tag.as_deref().unwrap_or("");
        let size = model
            .size_gb
            .map(|value| format!(" - {:.1} Go", value))
            .unwrap_or_default();
        lines.push(format!(
            "- {} {} ({}){}",
            model.name, tag, model.source, size
        ));
    }
    if scan.installed_models.is_empty() {
        lines.push("- Aucun modele Ollama detecte.".to_string());
    }
    lines.join("\n")
}

fn benchmark_markdown(benchmark: Option<&Value>) -> String {
    let mut lines = vec!["# Benchmarks".to_string(), String::new()];
    if let Some(value) = benchmark {
        let model = value
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or("modele");
        let speed = value
            .get("estimated_tokens_per_second")
            .and_then(Value::as_f64)
            .unwrap_or_default();
        let elapsed = value
            .get("elapsed_ms")
            .and_then(Value::as_u64)
            .unwrap_or_default();
        lines.push(format!("- Modele: {model}"));
        lines.push(format!("- Debit estime: {speed} tok/s"));
        lines.push(format!("- Temps: {elapsed} ms"));
        if let Some(prompt) = value.get("prompt").and_then(Value::as_str) {
            lines.push(format!("- Prompt: {prompt}"));
        }
        if let Some(output) = value.get("output_preview").and_then(Value::as_str) {
            lines.push(String::new());
            lines.push("```text".to_string());
            lines.push(output.to_string());
            lines.push("```".to_string());
        }
    } else {
        lines.push("- Aucun benchmark local exporte.".to_string());
    }
    lines.join("\n")
}

fn buying_guides_markdown(compat: &Value) -> String {
    let mut lines = vec!["# Achats guides".to_string(), String::new()];
    let mut wrote_items = false;
    if let Some(disclosure) = compat
        .get("affiliate_disclosure")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    {
        lines.push(format!("> {disclosure}"));
        lines.push(String::new());
    }
    if let Some(upgrades) = compat.get("upgrades").and_then(Value::as_array) {
        if !upgrades.is_empty() {
            lines.push("## Upgrades prioritaires".to_string());
            lines.push(String::new());
            for upgrade in upgrades.iter().take(8) {
                if let Some(text) = upgrade.as_str() {
                    lines.push(format!("- {text}"));
                } else {
                    lines.extend(upgrade_markdown_lines(upgrade, "-"));
                }
                wrote_items = true;
            }
            lines.push(String::new());
        }
    }
    lines.push("## Guides OutilsIA".to_string());
    lines.push(String::new());
    for link in compat
        .get("buying_guides")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(12)
    {
        let title = link
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("Guide OutilsIA");
        let text = link.get("text").and_then(Value::as_str).unwrap_or("");
        let url = link
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or("/materiel");
        lines.push(format!("- **{title}**: {text}"));
        if url.starts_with('/') {
            lines.push(format!("  - https://outilsia.fr{url}"));
        }
        wrote_items = true;
    }
    if !wrote_items {
        lines.push("- Aucun achat guide exporte.".to_string());
    }
    lines.join("\n")
}

fn shopping_list_markdown(compat: &Value, scan: &MachineScan) -> String {
    let mut lines = vec![
        "# Shopping list OutilsIA".to_string(),
        String::new(),
        format!("- Machine: {}", scan.name),
        format!(
            "- GPU actuel: {}",
            scan.gpu_name.as_deref().unwrap_or("non detecte")
        ),
        format!("- VRAM actuelle: {}", format_optional_gb(scan.vram_gb)),
        format!("- RAM actuelle: {} Go", scan.ram_gb.unwrap_or_default()),
        String::new(),
        "## Achats prioritaires".to_string(),
        String::new(),
    ];
    let mut wrote_items = false;
    if let Some(upgrades) = compat.get("upgrades").and_then(Value::as_array) {
        for (index, upgrade) in upgrades.iter().take(6).enumerate() {
            if let Some(text) = upgrade.as_str() {
                lines.push(format!("{}. {text}", index + 1));
            } else {
                lines.extend(upgrade_markdown_lines(upgrade, &format!("{}.", index + 1)));
            }
            wrote_items = true;
        }
    }
    if !wrote_items {
        lines.push("1. Aucun achat prioritaire calcule. Garde la machine actuelle et mesure les performances.".to_string());
    }

    lines.push(String::new());
    lines.push("## Guides et alternatives".to_string());
    lines.push(String::new());
    let mut wrote_guides = false;
    for link in compat
        .get("buying_guides")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(8)
    {
        let title = link
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("Guide OutilsIA");
        let url = link
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or("/materiel");
        let full_url = if url.starts_with('/') {
            format!("https://outilsia.fr{url}")
        } else {
            url.to_string()
        };
        lines.push(format!("- {title}: {full_url}"));
        wrote_guides = true;
    }
    if !wrote_guides {
        lines.push("- https://outilsia.fr/materiel".to_string());
    }

    lines.push(String::new());
    lines.push("## Verification avant achat".to_string());
    lines.push(String::new());
    lines.push("- Relancer le scan apres upgrade.".to_string());
    lines.push(
        "- Verifier la VRAM effective, l'alimentation et la place dans le boitier.".to_string(),
    );
    lines.push("- Lancer un benchmark Ollama avant de conclure.".to_string());
    lines.push("- Eviter les GPU 8 Go pour un usage LLM local confortable.".to_string());
    lines.join("\n")
}

fn share_ready_report_markdown(
    scan: &MachineScan,
    compat: &Value,
    benchmark: Option<&Value>,
) -> String {
    let score = compat_score_label(compat);
    let models = compatible_models(compat);
    let upgrades = compat
        .get("upgrades")
        .or_else(|| compat.get("recommended_upgrades"))
        .or_else(|| compat.get("shopping_list"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let blocked = compat
        .get("blocked_next")
        .or_else(|| compat.get("blocked"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut lines = vec![
        "# Rapport IA locale OutilsIA".to_string(),
        String::new(),
        "## Verdict".to_string(),
        String::new(),
        format!(
            "**{}** avec {} Go RAM, {} et {}.",
            scan.name,
            scan.ram_gb.unwrap_or_default(),
            format_optional_gb(scan.vram_gb),
            scan.gpu_name.as_deref().unwrap_or("GPU non detecte")
        ),
        format!("- Score OutilsIA: {score}"),
        format!("- Ollama: {}", runtime_label(scan)),
        format!("- Modeles installes: {}", scan.installed_models.len()),
        String::new(),
        "## Modeles conseilles".to_string(),
        String::new(),
    ];
    if models.is_empty() {
        lines.push("- Aucun modele compatible exporte par le diagnostic actuel.".to_string());
    } else {
        let command_prefix = ollama_command_prefix(scan);
        for model in models.iter().take(6) {
            lines.push(format!(
                "- **{}**: {}",
                model_title(model),
                model_reason(model)
            ));
            if let Some(ollama) = model.get("ollama").and_then(Value::as_str) {
                lines.push(format!("  - Commande: `{command_prefix} run {ollama}`"));
            }
        }
    }
    lines.push(String::new());
    lines.push("## Preuve locale".to_string());
    lines.push(String::new());
    if let Some(value) = benchmark {
        let model = value
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or("modele");
        let speed = value
            .get("estimated_tokens_per_second")
            .and_then(Value::as_f64)
            .unwrap_or_default();
        let elapsed = value
            .get("elapsed_ms")
            .and_then(Value::as_u64)
            .unwrap_or_default();
        lines.push(format!("- Benchmark: {model}"));
        lines.push(format!("- Debit estime: {speed} tok/s"));
        lines.push(format!("- Temps de reponse: {elapsed} ms"));
    } else {
        lines.push("- Aucun benchmark local lance.".to_string());
    }
    lines.push(String::new());
    lines.push("## A surveiller".to_string());
    lines.push(String::new());
    if blocked.is_empty() {
        lines.push("- Aucun palier proche bloque dans le diagnostic actuel.".to_string());
    } else {
        for model in blocked.iter().take(5) {
            lines.push(format!("- Palier proche: {}", model_title(model)));
        }
    }
    lines.push(String::new());
    lines.push("## Upgrade utile".to_string());
    lines.push(String::new());
    if upgrades.is_empty() {
        lines.push("- Aucun achat prioritaire: mesurer davantage avant d'acheter.".to_string());
    } else {
        for upgrade in upgrades.iter().take(3) {
            if let Some(text) = upgrade.as_str() {
                lines.push(format!("- {text}"));
            } else {
                lines.extend(upgrade_markdown_lines(upgrade, "-"));
            }
        }
    }
    lines.push(String::new());
    lines.push("## Suite conseillee".to_string());
    lines.push(String::new());
    lines.push("- Lancer au moins deux benchmarks comparables dans l'Arena locale.".to_string());
    lines.push(
        "- Exporter le vault Obsidian si cette machine devient un vrai cockpit IA.".to_string(),
    );
    lines.push(
        "- Synchroniser avec le compte OutilsIA pour creer un rapport partageable.".to_string(),
    );
    lines.join("\n")
}

fn model_cards_markdown(scan: &MachineScan, compat: &Value) -> String {
    let mut lines = vec![
        "# Fiches modeles locaux".to_string(),
        String::new(),
        format!(
            "- Machine: {} - {} VRAM - {} Go RAM",
            scan.name,
            format_optional_gb(scan.vram_gb),
            scan.ram_gb.unwrap_or_default()
        ),
        String::new(),
    ];
    let models = compatible_models(compat);
    let command_prefix = ollama_command_prefix(scan);
    if models.is_empty() {
        lines.push("Aucun modele compatible exporte par ce diagnostic.".to_string());
    }
    for model in models.iter().take(20) {
        let title = model_title(model);
        let ollama = model.get("ollama").and_then(Value::as_str).unwrap_or("");
        let family = model_family(&format!("{title} {ollama}"));
        lines.push(format!("## {title}"));
        lines.push(String::new());
        lines.push(format!("- Famille: {}", family.0));
        lines.push(format!("- Force: {}", family.1));
        lines.push(format!("- Adapte a: {}", family.2));
        lines.push(format!("- Limite: {}", family.3));
        lines.push(format!("- Raison diagnostic: {}", model_reason(model)));
        if !ollama.is_empty() {
            lines.push(format!("- Commande: `{command_prefix} run {ollama}`"));
        }
        lines.push(String::new());
    }
    lines.join("\n")
}

fn catalog_state_markdown(compat: &Value) -> String {
    let models = compatible_models(compat);
    let blocked = compat
        .get("blocked_next")
        .or_else(|| compat.get("blocked"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let new_models = compat
        .get("new")
        .or_else(|| compat.get("new_models"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let catalog_version = compat
        .get("catalog_version")
        .and_then(Value::as_str)
        .unwrap_or("non communique");
    let upgrade_catalog_version = compat
        .get("upgrade_catalog_version")
        .and_then(Value::as_str)
        .unwrap_or("non communique");
    let mut lines = vec![
        "# Catalogues OutilsIA".to_string(),
        String::new(),
        format!("- Catalogue modeles: {catalog_version}"),
        format!("- Catalogue upgrades: {upgrade_catalog_version}"),
        format!("- Modeles compatibles affiches: {}", models.len()),
        format!("- Paliers proches bloques: {}", blocked.len()),
        format!("- Nouveaux modeles utiles: {}", new_models.len()),
        String::new(),
        "## Nouveaux modeles".to_string(),
        String::new(),
    ];
    if new_models.is_empty() {
        lines.push("- Aucun nouveau modele compatible signale.".to_string());
    } else {
        for model in new_models.iter().take(10) {
            lines.push(format!("- {}", model_title(model)));
        }
    }
    lines.push(String::new());
    lines.push("## Principe".to_string());
    lines.push(String::new());
    lines.push("- Le site OutilsIA maintient les catalogues modeles/materiel.".to_string());
    lines.push(
        "- L'app relit le diagnostic serveur pour rester reactive sans nouvel exe.".to_string(),
    );
    lines.push(
        "- Les choix critiques restent bases sur RAM, VRAM, stockage et benchmarks locaux."
            .to_string(),
    );
    lines.join("\n")
}

fn compatible_models(compat: &Value) -> Vec<Value> {
    for key in [
        "compatible",
        "model_recommendations",
        "models",
        "compatible_models",
        "validated_models",
    ] {
        if let Some(items) = compat.get(key).and_then(Value::as_array) {
            return items.clone();
        }
    }
    Vec::new()
}

fn model_title(model: &Value) -> String {
    let name = model
        .get("name")
        .and_then(Value::as_str)
        .or_else(|| model.get("model_name").and_then(Value::as_str))
        .or_else(|| model.get("model").and_then(Value::as_str))
        .unwrap_or("modele");
    let params = model.get("params").and_then(Value::as_str).unwrap_or("");
    [name, params]
        .into_iter()
        .filter(|value| !value.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn model_reason(model: &Value) -> String {
    model
        .get("reason")
        .and_then(Value::as_str)
        .or_else(|| model.get("label").and_then(Value::as_str))
        .or_else(|| model.get("status").and_then(Value::as_str))
        .or_else(|| model.get("tier").and_then(Value::as_str))
        .unwrap_or("a tester avec un benchmark local")
        .to_string()
}

fn compat_score_label(compat: &Value) -> String {
    if let Some(score) = compat.get("score").and_then(Value::as_i64) {
        return format!("{score}/100");
    }
    if let Some(score) = compat.pointer("/score/score").and_then(Value::as_i64) {
        return format!("{score}/100");
    }
    if let Some(score) = compat.get("compatibility_score").and_then(Value::as_i64) {
        return format!("{score}/100");
    }
    "non calcule".to_string()
}

fn runtime_label(scan: &MachineScan) -> String {
    if let Some(label) = scan.runtimes.get("ollama").and_then(|value| {
        let installed = value
            .get("installed")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let version = value.get("version").and_then(Value::as_str).unwrap_or("");
        if installed {
            Some(if version.is_empty() {
                "detecte".to_string()
            } else {
                version.to_string()
            })
        } else {
            None
        }
    }) {
        return format!("Ollama Windows ({label})");
    }
    if let Some(label) = scan.runtimes.get("ollama_wsl").and_then(|value| {
        let installed = value
            .get("installed")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let version = value.get("version").and_then(Value::as_str).unwrap_or("");
        if installed {
            Some(if version.is_empty() {
                "detecte".to_string()
            } else {
                version.to_string()
            })
        } else {
            None
        }
    }) {
        return format!("Ollama WSL ({label})");
    }
    "non detecte".to_string()
}

fn ollama_command_prefix(scan: &MachineScan) -> &'static str {
    let native = scan
        .runtimes
        .get("ollama")
        .and_then(|value| value.get("installed"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if native {
        return "ollama";
    }
    let wsl = scan
        .runtimes
        .get("ollama_wsl")
        .and_then(|value| value.get("installed"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if wsl {
        "wsl.exe ollama"
    } else {
        "ollama"
    }
}

fn model_family(text: &str) -> (&'static str, &'static str, &'static str, &'static str) {
    let lower = text.to_lowercase();
    if lower.contains("qwen") {
        (
            "Qwen",
            "Bon compromis raisonnement court, technique et vitesse.",
            "Question simple, resume, code leger, comparaison locale.",
            "Les tailles 14B+ demandent plus de RAM/VRAM.",
        )
    } else if lower.contains("hermes") {
        (
            "Hermes",
            "Tres bon profil assistant, memoire, persona et workflows Obsidian.",
            "Hermes Agent, MemoryForge, notes projet, decisions.",
            "A tester apres un modele leger: ce n'est pas toujours le plus rapide.",
        )
    } else if lower.contains("mistral") {
        (
            "Mistral",
            "Bon modele generaliste, souvent agreable en francais.",
            "Redaction, resume, assistant quotidien.",
            "A comparer localement avec Qwen/Hermes sur les memes prompts.",
        )
    } else if lower.contains("llama") {
        (
            "Llama",
            "Famille tres repandue et bien supportee.",
            "Usage general, ecosysteme local, tests de compatibilite.",
            "La quantization et la taille comptent plus que le nom seul.",
        )
    } else if lower.contains("deepseek") || lower.contains("code") || lower.contains("coder") {
        (
            "Code / raisonnement",
            "Bon candidat pour scripts, debug et generation technique.",
            "Code court, explication, corrections simples.",
            "Peut etre moins adapte a la memoire personnelle ou au style.",
        )
    } else {
        (
            "Generaliste",
            "Modele a valider localement.",
            "Question simple, benchmark et comparaison.",
            "Qualite et vitesse a confirmer sur cette machine.",
        )
    }
}

fn upgrade_markdown_lines(upgrade: &Value, bullet: &str) -> Vec<String> {
    let label = upgrade
        .get("title")
        .and_then(Value::as_str)
        .or_else(|| upgrade.get("label").and_then(Value::as_str))
        .or_else(|| upgrade.get("name").and_then(Value::as_str))
        .unwrap_or("Upgrade");
    let name = upgrade.get("name").and_then(Value::as_str).unwrap_or("");
    let reason = upgrade.get("reason").and_then(Value::as_str).unwrap_or("");
    let price = upgrade
        .get("price_range_eur")
        .and_then(Value::as_str)
        .unwrap_or("");
    let guide = upgrade
        .get("guide_url")
        .and_then(Value::as_str)
        .unwrap_or("");
    let url = upgrade.get("url").and_then(Value::as_str).unwrap_or("");
    let avoid = upgrade.get("avoid").and_then(Value::as_str).unwrap_or("");
    let mut lines = Vec::new();
    if name.is_empty() || name == label {
        lines.push(format!("{bullet} **{label}**"));
    } else {
        lines.push(format!("{bullet} **{label}**: {name}"));
    }
    if !reason.is_empty() {
        lines.push(format!("  - Pourquoi: {reason}"));
    }
    if !price.is_empty() {
        lines.push(format!("  - Prix indicatif: {price}"));
    }
    if !guide.is_empty() {
        let full_guide = if guide.starts_with('/') {
            format!("https://outilsia.fr{guide}")
        } else {
            guide.to_string()
        };
        lines.push(format!("  - Guide: {full_guide}"));
    }
    if !url.is_empty() {
        lines.push(format!("  - Prix du jour: {url}"));
    }
    if !avoid.is_empty() {
        lines.push(format!("  - A eviter: {avoid}"));
    }
    if let Some(effects) = upgrade.get("effects").and_then(Value::as_object) {
        let effects_text = effects
            .iter()
            .map(|(key, value)| format!("{key}={}", scalar_to_string(value)))
            .collect::<Vec<_>>()
            .join(", ");
        if !effects_text.is_empty() {
            lines.push(format!("  - Effet estime: {effects_text}"));
        }
    }
    lines
}

fn scalar_to_string(value: &Value) -> String {
    if let Some(text) = value.as_str() {
        return text.to_string();
    }
    if let Some(number) = value.as_i64() {
        return number.to_string();
    }
    if let Some(number) = value.as_f64() {
        return format!("{number}");
    }
    if let Some(flag) = value.as_bool() {
        return flag.to_string();
    }
    value.to_string()
}

fn hermes_markdown(scan: &MachineScan, compat: &Value) -> String {
    let score = compat
        .pointer("/score/score")
        .and_then(Value::as_i64)
        .map(|value| value.to_string())
        .unwrap_or_else(|| "non calcule".to_string());
    format!(
        "# HERMES.md\n\nMachine: {}\nScore OutilsIA: {score}/100\n\n## Regles\n\n- Utiliser cette machine comme cockpit IA locale personnel.\n- Privilegier les modeles compatibles avec la VRAM disponible.\n- Noter chaque benchmark dans `03-Benchmarks.md`.\n- Garder les decisions d'upgrade dans `04-Achats-guides.md`.\n- Ne pas inventer les performances: mesurer ou marquer comme estimation.\n",
        scan.name
    )
}

fn open_path(path: &PathBuf) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("explorer");
        cmd.arg(path);
        cmd
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(path);
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(path);
        cmd
    };

    command
        .spawn()
        .map_err(|err| format!("Impossible d'ouvrir le dossier: {err}"))?;
    Ok(())
}

fn read_snapshots(app: &AppHandle) -> Result<Vec<LocalSnapshot>, String> {
    let path = snapshots_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)
        .map_err(|err| format!("Impossible de lire l'historique local: {err}"))?;
    serde_json::from_str(&content).map_err(|err| format!("Historique local corrompu: {err}"))
}

fn write_snapshots(app: &AppHandle, snapshots: &[LocalSnapshot]) -> Result<(), String> {
    let path = snapshots_path(app)?;
    let content = serde_json::to_string_pretty(snapshots)
        .map_err(|err| format!("Impossible de serialiser l'historique: {err}"))?;
    fs::write(path, content).map_err(|err| format!("Impossible d'ecrire l'historique local: {err}"))
}

fn read_desktop_auth(app: &AppHandle) -> Result<Option<DesktopAuth>, String> {
    let path = desktop_auth_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path)
        .map_err(|err| format!("Impossible de lire le token desktop: {err}"))?;
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|err| format!("Token desktop local corrompu: {err}"))
}

fn write_desktop_auth(app: &AppHandle, auth: &DesktopAuth) -> Result<(), String> {
    let path = desktop_auth_path(app)?;
    let content = serde_json::to_string_pretty(auth)
        .map_err(|err| format!("Impossible de serialiser le token desktop: {err}"))?;
    fs::write(path, content).map_err(|err| format!("Impossible d'ecrire le token desktop: {err}"))
}

fn normalize_session_cookie(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Session OutilsIA manquante.".to_string());
    }
    if let Some((_, value)) = trimmed
        .split(';')
        .map(str::trim)
        .find_map(|part| part.split_once("outilsia_session="))
    {
        return Ok(value.trim().to_string());
    }
    if let Some(value) = trimmed.strip_prefix("outilsia_session=") {
        return Ok(value.trim().to_string());
    }
    Ok(trimmed.to_string())
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

async fn response_json(response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    let payload = response
        .json::<Value>()
        .await
        .map_err(|err| format!("Reponse OutilsIA illisible: {err}"))?;
    if !status.is_success() {
        return Err(format!(
            "OutilsIA a refuse la requete ({status}): {payload}"
        ));
    }
    Ok(payload)
}

pub fn run() {
    tauri::Builder::default()
        .manage(ActiveInstalls::default())
        .invoke_handler(tauri::generate_handler![
            scan_machine,
            open_external_url,
            write_windows_recipe_file,
            check_compatibility,
            fetch_desktop_manifest,
            get_app_build_info,
            fetch_content_signals,
            save_local_snapshot,
            list_local_snapshots,
            delete_local_snapshot,
            clear_local_snapshots,
            sync_desktop,
            start_pairing,
            claim_pairing,
            get_desktop_auth,
            clear_desktop_auth,
            revoke_desktop_auth,
            sync_desktop_with_token,
            create_share_report_with_token,
            delete_machine_with_token,
            fetch_desktop_updates_with_token,
            send_feedback_with_token,
            fetch_desktop_memoryforge_with_token,
            sync_benchmark_with_token,
            benchmark_ollama,
            chat_ollama,
            preflight_ollama_install,
            install_ollama_model,
            cancel_ollama_install,
            delete_ollama_model,
            install_ollama_runtime,
            install_wsl_runtime,
            observe_planka_board,
            compile_work_card,
            route_workstack_capabilities,
            append_evidence_entry,
            get_evidence_ledger,
            clear_evidence_ledger,
            compile_forgebench_experiment,
            seal_forgebench_hidden_suite,
            get_forgebench_hidden_suite_status,
            clear_forgebench_hidden_suite,
            prepare_forgebench_worker_sandbox,
            get_forgebench_worker_sandbox_status,
            clear_forgebench_worker_sandbox,
            probe_forgebench_isolation,
            run_forgebench_reference_pilot,
            run_forgebench_ollama_candidate,
            start_local_capability_bridge,
            get_local_capability_bridge_status,
            stop_local_capability_bridge,
            generate_memoryforge,
            export_obsidian_vault,
            open_obsidian_vault
        ])
        .run(tauri::generate_context!())
        .expect("error while running OutilsIA Local Cockpit");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "windows")]
    fn sleep_command(milliseconds: u64) -> Command {
        let mut command = Command::new("powershell.exe");
        command.args([
            "-NoProfile",
            "-Command",
            &format!("Start-Sleep -Milliseconds {milliseconds}; Write-Output done"),
        ]);
        command
    }

    #[cfg(not(target_os = "windows"))]
    fn sleep_command(milliseconds: u64) -> Command {
        let mut command = Command::new("sh");
        command.args([
            "-c",
            &format!("sleep {}; printf done", (milliseconds as f64) / 1000.0),
        ]);
        command
    }

    #[test]
    fn validates_ollama_model_refs() {
        assert_eq!(
            validate_ollama_model_ref("qwen3:0.6b").unwrap(),
            "qwen3:0.6b"
        );
        assert_eq!(
            validate_ollama_model_ref("adrienbrault/nous-hermes2theta-llama3-8b:q4").unwrap(),
            "adrienbrault/nous-hermes2theta-llama3-8b:q4"
        );
        assert!(validate_ollama_model_ref("").is_err());
        assert!(validate_ollama_model_ref("qwen3:8b && rm -rf /").is_err());
    }

    #[test]
    fn command_output_timeout_marks_slow_process() {
        let (_output, timed_out) = command_output_with_timeout(
            sleep_command(900),
            Duration::from_millis(100),
            "test-timeout",
        )
        .unwrap();
        assert!(timed_out);
    }

    #[test]
    fn memory_probe_reports_module_layout_without_claiming_channels() {
        let probe = memory_probe_from_modules(
            Some(64),
            vec![
                MemoryModule {
                    size_gb: Some(32),
                    memory_type: Some("DDR5".to_string()),
                    configured_clock_mhz: Some(6000),
                    speed_mhz: Some(5600),
                    manufacturer: Some("Demo".to_string()),
                    part_number: None,
                    slot: Some("A2".to_string()),
                },
                MemoryModule {
                    size_gb: Some(32),
                    memory_type: Some("DDR5".to_string()),
                    configured_clock_mhz: Some(6000),
                    speed_mhz: Some(5600),
                    manufacturer: Some("Demo".to_string()),
                    part_number: None,
                    slot: Some("B2".to_string()),
                },
            ],
            "test",
        );
        assert_eq!(probe.channel_mode, "multiple_modules_detected");
        assert_eq!(probe.confidence, "module_layout_only");
        assert_eq!(probe.configured_clock_mhz, Some(6000));
        assert_eq!(probe.speed_mhz, Some(5600));
        assert_eq!(probe.module_count, Some(2));
        assert_eq!(probe.memory_type.as_deref(), Some("DDR5"));
    }

    #[test]
    fn four_memory_modules_do_not_claim_quad_or_multi_channel() {
        let module = MemoryModule {
            size_gb: Some(8),
            memory_type: Some("DDR3".to_string()),
            configured_clock_mhz: Some(1600),
            speed_mhz: Some(1600),
            manufacturer: Some("G.Skill".to_string()),
            part_number: None,
            slot: None,
        };
        let probe = memory_probe_from_modules(Some(32), vec![module; 4], "test");

        assert_eq!(probe.module_count, Some(4));
        assert_eq!(probe.channel_mode, "multiple_modules_detected");
        assert_eq!(probe.confidence, "module_layout_only");
    }

    #[test]
    fn missing_gpu_probe_stays_unknown_instead_of_cpu_only() {
        let probe = unknown_gpu_probe();

        assert_eq!(probe.name, None);
        assert_eq!(probe.vram_gb, None);
        assert_eq!(probe.category.as_deref(), Some("unknown"));
        assert_eq!(probe.source, "not_detected");
    }

    #[test]
    fn builds_linux_motherboard_probe_from_unprivileged_sysfs_values() {
        let probe = linux_sysfs_motherboard_probe_from_values(
            Some("Micro-Star International Co., Ltd.".to_string()),
            Some("MPG X870E CARBON WIFI".to_string()),
            Some("1.0".to_string()),
            Some("1A20".to_string()),
        )
        .unwrap();

        assert_eq!(probe.product.as_deref(), Some("MPG X870E CARBON WIFI"));
        assert_eq!(probe.bios_version.as_deref(), Some("1A20"));
        assert_eq!(probe.max_memory_gb, None);
        assert_eq!(probe.source, "linux_sysfs_dmi");
    }

    #[test]
    fn parses_ollama_list_with_namespaces_and_sizes() {
        let output = "\
NAME                                      ID              SIZE      MODIFIED
qwen3:0.6b                                abc123          522 MB    2 days ago
hermes3:8b                                def456          4.7 GB    1 week ago
adrienbrault/nous-hermes2theta-llama3-8b:q4 ghi789       4,9 GB    1 month ago
big-model:latest                          zzz999          1.2 TB    1 year ago
";
        let models = parse_ollama_list_with_source(output, "ollama-wsl");
        assert_eq!(models.len(), 4);
        assert_eq!(models[0].name, "qwen3");
        assert_eq!(models[0].tag.as_deref(), Some("0.6b"));
        assert_eq!(models[0].source, "ollama-wsl");
        assert!(models[0].size_gb.unwrap() > 0.50 && models[0].size_gb.unwrap() < 0.52);
        assert_eq!(models[2].name, "adrienbrault/nous-hermes2theta-llama3-8b");
        assert_eq!(models[2].tag.as_deref(), Some("q4"));
        assert_eq!(models[2].size_gb, Some(4.9));
        assert_eq!(models[3].size_gb, Some(1228.8));
    }

    #[test]
    fn chooses_discrete_windows_gpu_over_virtual_or_igpu() {
        let output = "\
Name|AdapterRAM|DriverVersion|DriverDate|PNPDeviceID|AdapterCompatibility
Microsoft Basic Render Driver|0||||Microsoft
Intel(R) UHD Graphics|2147483648|31.0.101.5522|2026-01-10|PCI\\VEN_8086|Intel Corporation
NVIDIA GeForce RTX 4080 SUPER|17179869184|32.0.15.6603|2026-06-15|PCI\\VEN_10DE|NVIDIA
";
        let candidate = preferred_windows_gpu_from_output(output).unwrap();
        assert_eq!(candidate.name, "NVIDIA GeForce RTX 4080 SUPER");
        assert_eq!(candidate.vram_gb, Some(16));
        assert_eq!(candidate.vram_confidence, "reported_nonstandard_64bit");
        assert_eq!(candidate.driver_version.as_deref(), Some("32.0.15.6603"));
        assert_eq!(candidate.driver_date.as_deref(), Some("2026-06-15"));
        assert_eq!(candidate.pnp_device_id.as_deref(), Some("PCI\\VEN_10DE"));
        assert_eq!(candidate.driver_provider.as_deref(), Some("NVIDIA"));
    }

    #[test]
    fn refuses_win32_adapter_ram_value_at_the_32_bit_ceiling() {
        let (vram, confidence) = windows_adapter_ram_probe("4293918720");
        assert_eq!(vram, None);
        assert_eq!(confidence, "unknown_win32_32bit_limit");

        let (small_vram, small_confidence) = windows_adapter_ram_probe("2147483648");
        assert_eq!(small_vram, Some(2));
        assert_eq!(small_confidence, "estimated_win32_adapter_ram");
    }

    #[test]
    fn chooses_discrete_linux_gpu_and_keeps_kernel_driver() {
        let output = "\
00:02.0 VGA compatible controller: Intel Corporation UHD Graphics 770 [8086:4690]
\tKernel driver in use: i915
\tKernel modules: i915
01:00.0 VGA compatible controller: Advanced Micro Devices, Inc. [AMD/ATI] Radeon RX 7900 XTX [1002:744c]
\tKernel driver in use: amdgpu
\tKernel modules: amdgpu
";
        let (name, kernel_driver) = preferred_linux_gpu_from_lspci_output(output).unwrap();
        assert!(name.contains("Radeon RX 7900 XTX"));
        assert_eq!(kernel_driver.as_deref(), Some("amdgpu"));
    }

    #[test]
    fn parses_vulkan_instance_version_without_claiming_runtime_use() {
        let output = "VULKANINFO\nVulkan Instance Version: 1.3.290\n";
        assert_eq!(parse_vulkan_version(output).as_deref(), Some("1.3.290"));
        assert_eq!(parse_vulkan_version("Vulkan unavailable"), None);
    }

    #[test]
    fn parses_nvidia_hardware_doctor_signals() {
        let probe = parse_nvidia_smi_csv(
            "NVIDIA GeForce RTX 4080 SUPER, 16376, 1024, 576.80, P2, 55, 90, 120.5, 320, 16, 16, 4, 4",
            Some("12.9".to_string()),
            Some("enabled".to_string()),
        )
        .unwrap();

        assert_eq!(probe.memory_used_mb, Some(1024));
        assert_eq!(probe.performance_state.as_deref(), Some("P2"));
        assert_eq!(probe.rebar_status.as_deref(), Some("enabled"));
        assert_eq!(probe.temperature_c, Some(55.0));
        assert_eq!(probe.utilization_percent, Some(90.0));
        assert_eq!(probe.power_draw_w, Some(120.5));
        assert_eq!(probe.pcie_link_width_current, Some(16));
        assert_eq!(probe.pcie_link_gen_current, Some(4));
    }

    #[test]
    fn rebar_status_requires_an_explicit_driver_signal() {
        assert_eq!(
            parse_nvidia_rebar_status("Resizable BAR : Enabled"),
            Some("enabled".to_string())
        );
        assert_eq!(
            parse_nvidia_rebar_status("Resizable BAR\n    Current : Disabled"),
            Some("disabled".to_string())
        );
        assert_eq!(
            parse_nvidia_rebar_status("Resizable BAR\n    BAR1 Memory Usage"),
            Some("reported_unconfirmed".to_string())
        );
        assert_eq!(parse_nvidia_rebar_status("GPU 00000000:01:00.0"), None);
    }

    #[test]
    fn parses_ollama_runtime_gpu_offload_evidence() {
        let payload = serde_json::json!({
            "models": [{
                "name": "qwen3:0.6b",
                "size": 1_000_000_000_u64,
                "size_vram": 750_000_000_u64
            }]
        });
        let evidence = parse_ollama_runtime_evidence(&payload, "qwen3:0.6b").unwrap();

        assert_eq!(evidence.model_size_bytes, 1_000_000_000);
        assert_eq!(evidence.vram_bytes, 750_000_000);
        assert_eq!(evidence.gpu_offload_percent, 75.0);
        assert_eq!(evidence.processor, "hybrid");
        assert_eq!(evidence.source, "ollama_api_ps");
    }

    #[test]
    fn ollama_runtime_evidence_distinguishes_cpu_and_gpu() {
        let cpu_payload = serde_json::json!({
            "models": [{"name": "qwen3:0.6b", "size": 500_u64, "size_vram": 0_u64}]
        });
        let gpu_payload = serde_json::json!({
            "models": [{"name": "qwen3:0.6b", "size": 500_u64, "size_vram": 500_u64}]
        });

        assert_eq!(
            parse_ollama_runtime_evidence(&cpu_payload, "qwen3:0.6b")
                .unwrap()
                .processor,
            "cpu"
        );
        assert_eq!(
            parse_ollama_runtime_evidence(&gpu_payload, "qwen3:0.6b")
                .unwrap()
                .processor,
            "gpu"
        );
    }

    #[test]
    fn parses_windows_motherboard_probe() {
        let output = "ASUSTeK COMPUTER INC.|Z97-A|Rev 1.xx|3503|33554432|4";
        let probe = parse_windows_motherboard_line(output).unwrap();
        assert_eq!(probe.manufacturer.as_deref(), Some("ASUSTeK COMPUTER INC."));
        assert_eq!(probe.product.as_deref(), Some("Z97-A"));
        assert_eq!(probe.bios_version.as_deref(), Some("3503"));
        assert_eq!(probe.max_memory_gb, Some(32));
        assert_eq!(probe.memory_slots, Some(4));
    }

    #[test]
    fn parses_memory_size_units() {
        assert_eq!(parse_memory_size_gb("8192 MB"), Some(8));
        assert_eq!(parse_memory_size_gb("32 GB"), Some(32));
        assert_eq!(parse_memory_size_gb("2 TB"), Some(2048));
    }

    #[test]
    fn normalizes_unknown_hardware_strings_to_none() {
        for value in [
            "Unknown",
            "Other",
            "N/A",
            "Not Specified",
            "To Be Filled By O.E.M.",
        ] {
            assert_eq!(clean_optional_string(value), None, "{value}");
        }
        assert_eq!(clean_optional_string("DDR5").as_deref(), Some("DDR5"));
    }

    #[test]
    fn parses_windows_memory_modules_and_clock() {
        let output = "\
34359738368|6000|5600|Kingston|KF560C36|A2|34
34359738368|6000|5600|Kingston|KF560C36|B2|34
0|0|0|||
";
        let modules = parse_memory_module_lines(output);
        assert_eq!(modules.len(), 2);
        assert_eq!(modules[0].size_gb, Some(32));
        assert_eq!(modules[0].configured_clock_mhz, Some(6000));
        assert_eq!(modules[0].speed_mhz, Some(5600));
        assert_eq!(modules[0].slot.as_deref(), Some("A2"));
        assert_eq!(modules[0].memory_type.as_deref(), Some("DDR5"));
        let probe = memory_probe_from_modules(Some(64), modules, "test-win32");
        assert_eq!(probe.channel_mode, "multiple_modules_detected");
        assert_eq!(probe.confidence, "module_layout_only");
        assert_eq!(probe.configured_clock_mhz, Some(6000));
        assert_eq!(probe.speed_mhz, Some(5600));
        assert_eq!(probe.memory_type.as_deref(), Some("DDR5"));
    }

    #[test]
    fn decodes_utf16le_command_output_from_wsl() {
        let text = "Ubuntu\r\nDebian\r\n";
        let bytes: Vec<u8> = text
            .encode_utf16()
            .flat_map(|word| word.to_le_bytes())
            .collect();
        assert_eq!(decode_command_stdout(&bytes).unwrap(), text);
    }

    #[test]
    fn keeps_utf8_command_output_preferred() {
        assert_eq!(
            decode_command_stdout("ollama version is 0.18.2\n".as_bytes()).unwrap(),
            "ollama version is 0.18.2\n"
        );
    }

    #[test]
    fn normalizes_ollama_runtime_inputs() {
        let expected_wsl = if cfg!(target_os = "windows") {
            OllamaRuntime::Wsl
        } else {
            OllamaRuntime::Native
        };
        assert_eq!(normalize_ollama_runtime(Some("wsl")), expected_wsl);
        assert_eq!(normalize_ollama_runtime(Some("ollama-wsl")), expected_wsl);
        assert_eq!(
            normalize_ollama_runtime(Some("native")),
            OllamaRuntime::Native
        );
        assert_eq!(normalize_ollama_runtime(None), OllamaRuntime::Native);
    }

    #[test]
    fn builds_native_ollama_command() {
        let command = build_ollama_command(OllamaRuntime::Native);
        let program = command.get_program().to_string_lossy().to_lowercase();
        assert!(program.contains("ollama"));
    }

    #[test]
    fn builds_wsl_ollama_command_for_current_platform() {
        let command = build_ollama_command(OllamaRuntime::Wsl);
        let program = command.get_program().to_string_lossy().to_lowercase();
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();
        if cfg!(target_os = "windows") {
            assert!(program.ends_with("wsl.exe"));
            assert_eq!(args, vec!["ollama".to_string()]);
        } else {
            assert!(program.contains("ollama"));
            assert!(args.is_empty());
        }
    }

    #[test]
    fn matches_installed_models_without_collapsing_tags() {
        let installed = InstalledModel {
            name: "qwen3".to_string(),
            tag: Some("14b".to_string()),
            size_gb: Some(9.0),
            source: "ollama".to_string(),
            quantization: None,
        };
        assert!(installed_model_matches_ref(&installed, "qwen3"));
        assert!(installed_model_matches_ref(&installed, "qwen3:14b"));
        assert!(!installed_model_matches_ref(&installed, "qwen3:0.6b"));
    }

    #[test]
    fn parses_wsl_storage_without_exposing_a_path() {
        let probe = parse_wsl_storage_probe("scope=custom\nfree_kib=104857600\n");
        assert_eq!(probe.scope, "custom_model_store");
        assert_eq!(probe.source, "wsl_df_model_store");
        assert_eq!(probe.free_gb, Some(100.0));
    }

    #[test]
    fn keeps_unknown_wsl_storage_unknown() {
        let probe = parse_wsl_storage_probe("scope=default\nfree_kib=\n");
        assert_eq!(probe.scope, "default_model_store");
        assert_eq!(probe.free_gb, None);
    }

    #[test]
    fn benchmark_chat_payload_is_deterministic_and_can_force_cpu() {
        let payload = ollama_chat_payload("qwen3:0.6b", "bonjour", true, true, None, None);
        assert_eq!(
            payload.get("model").and_then(Value::as_str),
            Some("qwen3:0.6b")
        );
        assert_eq!(
            payload
                .pointer("/messages/0/content")
                .and_then(Value::as_str),
            Some("bonjour")
        );
        assert_eq!(payload.get("think").and_then(Value::as_bool), Some(false));
        assert_eq!(
            payload.pointer("/options/num_gpu").and_then(Value::as_i64),
            Some(0)
        );
        assert_eq!(
            payload.pointer("/options/num_ctx").and_then(Value::as_i64),
            Some(2048)
        );
        assert_eq!(
            payload
                .pointer("/options/num_predict")
                .and_then(Value::as_i64),
            Some(96)
        );
        assert_eq!(
            payload.pointer("/options/seed").and_then(Value::as_i64),
            Some(42)
        );
        assert_eq!(payload.get("stream").and_then(Value::as_bool), Some(false));
    }

    #[test]
    fn objective_arena_keeps_the_reproducible_prompt_unchanged() {
        let prompt = "Réponds uniquement en JSON avec instruction, memory et calculation.";
        assert_eq!(
            prepare_benchmark_prompt(Some(prompt.to_string()), true),
            prompt
        );
        assert!(prepare_benchmark_prompt(Some(prompt.to_string()), false)
            .ends_with("Réponse finale uniquement, une phrase courte en français."));
        let payload = ollama_chat_payload("qwen3:0.6b", prompt, false, true, Some(192), None);
        assert_eq!(
            payload
                .pointer("/options/num_predict")
                .and_then(Value::as_i64),
            Some(192)
        );
        let recommendation_payload =
            ollama_chat_payload("qwen3:0.6b", prompt, false, true, Some(224), None);
        assert_eq!(
            recommendation_payload
                .pointer("/options/num_predict")
                .and_then(Value::as_i64),
            Some(224)
        );
    }

    #[test]
    fn automatic_chat_payload_does_not_force_cpu_or_benchmark_sampling() {
        let payload = ollama_chat_payload("hermes3:8b", "bonjour", false, false, None, None);
        assert!(payload.pointer("/options/num_gpu").is_none());
        assert!(payload.pointer("/options/num_predict").is_none());
        assert!(payload.pointer("/options/seed").is_none());
        assert_eq!(
            payload.pointer("/options/num_ctx").and_then(Value::as_i64),
            Some(4096)
        );
    }

    #[test]
    fn autopilot_tuning_is_bounded_and_explicit_in_payload() {
        let tuning = OllamaTuningRequest {
            num_ctx: Some(90_000),
            num_batch: Some(4),
            num_thread: Some(128),
        };
        let payload = ollama_chat_payload(
            "qwen3:0.6b",
            "profil autopilot",
            false,
            true,
            Some(192),
            Some(&tuning),
        );
        assert_eq!(
            payload.pointer("/options/num_ctx").and_then(Value::as_i64),
            Some(32_768)
        );
        assert_eq!(
            payload
                .pointer("/options/num_batch")
                .and_then(Value::as_i64),
            Some(32)
        );
        assert_eq!(
            payload
                .pointer("/options/num_thread")
                .and_then(Value::as_i64),
            Some(64)
        );
        assert!(payload.pointer("/options/num_gpu").is_none());
    }

    #[test]
    fn cpu_generate_response_uses_real_ollama_metrics() {
        let result = benchmark_result_from_ollama_api(
            "qwen3:0.6b".to_string(),
            "bonjour".to_string(),
            json!({
                "message": { "role": "assistant", "content": "CPU OK" },
                "done": true,
                "total_duration": 3_000_000_000_u64,
                "load_duration": 500_000_000_u64,
                "prompt_eval_count": 10,
                "prompt_eval_duration": 250_000_000_u64,
                "eval_count": 20,
                "eval_duration": 2_000_000_000_u64
            }),
            Duration::from_secs(3),
            "cpu",
        )
        .unwrap();
        assert!(result.success);
        assert_eq!(result.execution_mode, "cpu");
        assert_eq!(result.measurement_source, "ollama_api");
        assert_eq!(result.estimated_tokens, 20);
        assert_eq!(result.estimated_tokens_per_second, 10.0);
        assert_eq!(result.prompt_tokens_per_second, 40.0);
        assert_eq!(result.total_duration_ms, 3000);
        assert_eq!(result.load_duration_ms, 500);
        assert_eq!(result.eval_duration_ms, 2000);
        assert_eq!(result.output_preview, "CPU OK");
    }

    #[test]
    fn api_response_without_eval_duration_is_marked_as_estimate() {
        let result = benchmark_result_from_ollama_api(
            "qwen3:0.6b".to_string(),
            "bonjour".to_string(),
            json!({
                "message": { "role": "assistant", "content": "Réponse sans métriques complètes" },
                "done": true,
                "eval_count": 8
            }),
            Duration::from_secs(2),
            "auto",
        )
        .unwrap();
        assert_eq!(result.measurement_source, "ollama_api_estimate");
        assert!(result.measurement_note.is_some());
        assert_eq!(result.estimated_tokens_per_second, 4.0);
    }

    #[test]
    fn flight_recorder_benchmark_contract_keeps_exact_metrics() {
        let mut result = benchmark_result_from_ollama_api(
            "qwen3:0.6b".to_string(),
            "référence reproductible".to_string(),
            json!({
                "message": { "role": "assistant", "content": "OK" },
                "done": true,
                "total_duration": 2_400_000_000_u64,
                "load_duration": 300_000_000_u64,
                "prompt_eval_count": 20,
                "prompt_eval_duration": 200_000_000_u64,
                "eval_count": 42,
                "eval_duration": 1_400_000_000_u64
            }),
            Duration::from_millis(2400),
            "auto",
        )
        .unwrap();
        apply_ollama_runtime_evidence(
            &mut result,
            OllamaRuntimeEvidence {
                model_size_bytes: 4_000_000_000,
                vram_bytes: 3_000_000_000,
                gpu_offload_percent: 75.0,
                processor: "cpu/gpu".to_string(),
                source: "ollama_api_ps".to_string(),
            },
        );
        let value = serde_json::to_value(&result).unwrap();
        assert_eq!(value["measurement_source"], "ollama_api");
        assert_eq!(value["load_duration_ms"], 300);
        assert_eq!(value["prompt_tokens_per_second"], 100.0);
        assert_eq!(value["estimated_tokens_per_second"], 30.0);
        assert_eq!(value["runtime_gpu_offload_percent"], 75.0);
        assert_eq!(value["runtime_processor"], "cpu/gpu");
        assert_eq!(value["runtime_evidence_source"], "ollama_api_ps");
    }

    #[test]
    fn app_build_info_always_identifies_the_running_binary() {
        let info = get_app_build_info();
        assert_eq!(info.app_version, env!("CARGO_PKG_VERSION"));
        assert!(!info.build_id.trim().is_empty());
    }
}
