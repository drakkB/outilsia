use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{hash_map::DefaultHasher, HashMap};
use std::hash::{Hash, Hasher};
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use std::time::{SystemTime, UNIX_EPOCH};
use std::{env, fs};
use sysinfo::System;
use tauri::{AppHandle, Emitter, Manager, State};

const OUTILSIA_ENDPOINT: &str = "https://outilsia.fr";

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
    source: String,
    driver_version: Option<String>,
    cuda_version: Option<String>,
    temperature_c: Option<f64>,
    utilization_percent: Option<f64>,
    power_draw_w: Option<f64>,
    power_limit_w: Option<f64>,
    pcie_link_width_current: Option<u32>,
    pcie_link_width_max: Option<u32>,
    pcie_link_gen_current: Option<u32>,
    pcie_link_gen_max: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
struct OllamaProbe {
    installed: bool,
    version: Option<String>,
    models: Vec<InstalledModel>,
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
    success: bool,
    timed_out: bool,
    output_preview: String,
    error: Option<String>,
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
fn scan_machine() -> Result<MachineScan, String> {
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

    let machine_name = build_machine_name(cpu_name.as_deref(), gpu.name.as_deref());
    let machine_key = stable_machine_key(
        os_name.as_deref(),
        os_version.as_deref(),
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
        unified_memory: is_unified_memory(),
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
                "install_command": if cfg!(target_os = "windows") { Some("wsl.exe --install -d Ubuntu") } else { None::<&str> },
                "ollama_install_command": if cfg!(target_os = "windows") { Some("wsl.exe sh -lc \"curl -fsSL https://ollama.com/install.sh | sh\"") } else { None::<&str> },
                "ollama_test_command": if cfg!(target_os = "windows") { Some("wsl.exe ollama run qwen3:0.6b") } else { None::<&str> }
            }
        }),
        installed_models: merge_installed_models(ollama.models, ollama_wsl.models),
        raw_scan: json!({
            "gpu_probe": gpu,
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
        || trimmed.starts_with("https://ollama.com/download?"))
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
    lines.push(format!("- VRAM: {} Go", scan.vram_gb.unwrap_or_default()));
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
fn benchmark_ollama(request: BenchmarkRequest) -> Result<BenchmarkResult, String> {
    let model = request.model.trim().to_string();
    if model.is_empty() {
        return Err("Modele Ollama requis.".to_string());
    }
    let user_prompt = request
        .prompt
        .unwrap_or_else(|| {
            "Réponds en français, en une seule phrase courte, sans raisonnement: pourquoi la VRAM est importante pour un LLM local ?".to_string()
        })
        .trim()
        .chars()
        .take(500)
        .collect::<String>();
    let prompt = format!(
        "/no_think\n{user_prompt}\nRéponse finale uniquement, une phrase courte en français."
    );
    let timeout = Duration::from_secs(request.timeout_seconds.unwrap_or(45).clamp(5, 180));
    let runtime = normalize_ollama_runtime(request.runtime.as_deref());
    run_ollama_prompt(model, prompt, timeout, runtime)
}

#[tauri::command]
fn chat_ollama(request: BenchmarkRequest) -> Result<BenchmarkResult, String> {
    let model = request.model.trim().to_string();
    if model.is_empty() {
        return Err("Modele Ollama requis.".to_string());
    }
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
    let prompt =
        format!("/no_think\nRéponds en français, clairement et directement.\n\n{user_prompt}");
    let timeout = Duration::from_secs(request.timeout_seconds.unwrap_or(90).clamp(5, 300));
    let runtime = normalize_ollama_runtime(request.runtime.as_deref());
    run_ollama_prompt(model, prompt, timeout, runtime)
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

    let mut timed_out = false;
    loop {
        if child
            .try_wait()
            .map_err(|err| format!("Benchmark Ollama illisible: {err}"))?
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
        .map_err(|err| format!("Sortie Ollama indisponible: {err}"))?;
    let elapsed_ms = started.elapsed().as_millis();
    let stdout = clean_benchmark_output(&String::from_utf8_lossy(&output.stdout));
    let stderr = clean_benchmark_output(&String::from_utf8_lossy(&output.stderr));
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
        success: output.status.success() && !timed_out,
        timed_out,
        output_preview: stdout.chars().take(700).collect(),
        error: if output.status.success() && !timed_out {
            None
        } else if timed_out {
            Some(format!(
                "Ollama stoppe apres {} secondes.",
                timeout.as_secs()
            ))
        } else {
            Some(stderr.chars().take(500).collect())
        },
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
    let output = command.arg("rm").arg(&model).output().map_err(|err| {
        format!(
            "Impossible de lancer {}: {err}",
            ollama_runtime_name(runtime)
        )
    })?;

    let elapsed = started.elapsed();
    let stdout = clean_benchmark_output(&String::from_utf8_lossy(&output.stdout));
    let stderr = clean_benchmark_output(&String::from_utf8_lossy(&output.stderr));
    let timed_out = elapsed >= timeout;
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
        Ok(_) => return Ok("winget install --id Ollama.Ollama -e"),
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
    if let Some(gpu) = detect_nvidia_smi() {
        return gpu;
    }
    if let Some(gpu) = detect_windows_gpu() {
        return gpu;
    }
    if let Some(gpu) = detect_macos_gpu() {
        return gpu;
    }
    if let Some(gpu) = detect_linux_lspci() {
        return gpu;
    }

    GpuProbe {
        name: None,
        vendor: None,
        category: Some("cpu-only".to_string()),
        vram_gb: Some(0),
        source: "none".to_string(),
        driver_version: None,
        cuda_version: None,
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
            "--query-gpu=name,memory.total,driver_version,temperature.gpu,utilization.gpu,power.draw,power.limit,pcie.link.width.current,pcie.link.width.max,pcie.link.gen.current,pcie.link.gen.max",
            "--format=csv,noheader,nounits",
        ],
    )?;
    let line = output.lines().find(|line| !line.trim().is_empty())?;
    let mut parts = line.split(',').map(str::trim);
    let name = parts.next()?.to_string();
    let memory_mb = parts.next().and_then(|value| value.parse::<u32>().ok());
    let driver_version = parts.next().and_then(clean_optional_string);
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
        source: "nvidia-smi".to_string(),
        driver_version,
        cuda_version: detect_nvidia_cuda_version(),
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

fn detect_windows_gpu() -> Option<GpuProbe> {
    if !cfg!(target_os = "windows") {
        return None;
    }

    let name = run_command(
        "powershell",
        &[
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name",
        ],
    )?
    .lines()
    .find(|line| !line.trim().is_empty())?
    .trim()
    .to_string();

    let vram_gb = run_command(
        "powershell",
        &[
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty AdapterRAM",
        ],
    )
    .and_then(|value| value.trim().parse::<u64>().ok())
    .map(bytes_to_gb);

    Some(GpuProbe {
        vendor: Some(detect_vendor(&name)),
        category: Some(gpu_category(&name)),
        name: Some(name),
        vram_gb,
        source: "powershell-win32-videocontroller".to_string(),
        driver_version: None,
        cuda_version: None,
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
        source: "system_profiler".to_string(),
        driver_version: None,
        cuda_version: None,
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

    let output = run_command("lspci", &[])?;
    let name = output
        .lines()
        .find(|line| {
            let lower = line.to_lowercase();
            lower.contains("vga") || lower.contains("3d controller") || lower.contains("display")
        })?
        .split_once(':')
        .map(|(_, right)| right.trim().to_string())
        .filter(|value| !value.is_empty())?;

    Some(GpuProbe {
        vendor: Some(detect_vendor(&name)),
        category: Some(gpu_category(&name)),
        name: Some(name),
        vram_gb: None,
        source: "lspci".to_string(),
        driver_version: None,
        cuda_version: None,
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
    let model = "wsl-ubuntu".to_string();
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
        let message = "WSL est déjà installé. Lance le scan pour vérifier Ollama dans Ubuntu.";
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

    match Command::new("wsl.exe")
        .args(["--install", "-d", "Ubuntu"])
        .spawn()
    {
        Ok(_) => {
            let message = "Installation WSL Ubuntu lancée. Windows peut demander une confirmation administrateur ou un redémarrage.";
            emit_install_progress(
                &app,
                &model,
                "cmd",
                "wsl.exe --install -d Ubuntu",
                false,
                false,
            );
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
    let output = build_ollama_command(runtime).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout)
        .ok()
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
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
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
    } else if lower.contains("apple") || lower.contains("m4") || lower.contains("m3") {
        "unified-memory".to_string()
    } else {
        "unknown".to_string()
    }
}

fn bytes_to_gb(bytes: u64) -> u32 {
    ((bytes as f64) / 1024_f64.powi(3)).round().max(0.0) as u32
}

fn is_unified_memory() -> bool {
    cfg!(target_os = "macos")
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
    dir: &PathBuf,
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
        format!("- VRAM: {} Go", scan.vram_gb.unwrap_or_default()),
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
        format!("- VRAM actuelle: {} Go", scan.vram_gb.unwrap_or_default()),
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
            "**{}** avec {} Go RAM, {} Go VRAM et {}.",
            scan.name,
            scan.ram_gb.unwrap_or_default(),
            scan.vram_gb.unwrap_or_default(),
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
    lines
        .into_iter()
        .filter(|line| !line.trim().is_empty() || true)
        .collect::<Vec<_>>()
        .join("\n")
}

fn model_cards_markdown(scan: &MachineScan, compat: &Value) -> String {
    let mut lines = vec![
        "# Fiches modeles locaux".to_string(),
        String::new(),
        format!(
            "- Machine: {} - {} Go VRAM - {} Go RAM",
            scan.name,
            scan.vram_gb.unwrap_or_default(),
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
        return format!("Ollama WSL Ubuntu ({label})");
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
            install_ollama_model,
            cancel_ollama_install,
            delete_ollama_model,
            install_ollama_runtime,
            install_wsl_runtime,
            generate_memoryforge,
            export_obsidian_vault,
            open_obsidian_vault
        ])
        .run(tauri::generate_context!())
        .expect("error while running OutilsIA Local Cockpit");
}
