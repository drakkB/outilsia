use crate::forgebench::validate_forgebench_result;
use crate::forgebench_browser::{
    evaluate_visible_browser, preflight_visible_browser, validate_visible_browser_evidence,
};
use crate::forgebench_runner::{
    isolated_command, selected_backend, validate_forgebench_reference_pilot_result,
};
use crate::forgebench_sandbox::copy_verified_workspace_for_stack;
use crate::workstack_composer::canonical_sha256;
use crate::{command_output_with_timeout, decode_command_stdout};
use getrandom::fill;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const REQUEST_SCHEMA: &str = "outilsia.forgebench_ollama_candidate_request.v2";
const RESULT_SCHEMA: &str = "outilsia.forgebench_ollama_candidate_result.v2";
const CONTRACT_VERSION: &str = "2026-07-13";
const CONSENT_SCOPE: &str = "ollama_local_visible_browser_candidate_v2";
const BENCHMARK_ID: &str = "signal-maze-v1";
const STACK_KEY: &str = "ollama-local";
const RUN_ROOT: &str = "forgebench-ollama-candidate-runs-v1";
const RUN_CONTRACT_FILE: &str = ".outilsia-run-contract.json";
const EVALUATOR_KIND: &str = "deterministic_visible_static_gate";
const EVALUATOR_MARKER: &str = "forgebench-ollama-static-evaluator-ok";
const EVALUATOR_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_RESPONSE_BYTES: usize = 1024 * 1024;
const MAX_SUBMISSION_BYTES: u64 = 512 * 1024;
const MAX_INDEX_BYTES: usize = 64 * 1024;
const MAX_STYLES_BYTES: usize = 128 * 1024;
const MAX_GAME_BYTES: usize = 320 * 1024;
const MIN_INDEX_BYTES: usize = 400;
const MIN_STYLES_BYTES: usize = 500;
const MIN_GAME_BYTES: usize = 1200;
const MIN_DURATION_SECONDS: u64 = 30;
const MAX_DURATION_SECONDS: u64 = 600;
const FIXED_OUTPUT_BUDGET_BYTES: u64 = 512 * 1024;
const EXPECTED_FILES: [&str; 4] = [RUN_CONTRACT_FILE, "game.js", "index.html", "styles.css"];
const REQUIRED_BLOCKERS: [&str; 4] = [
    "visible_contract_public_and_gameable",
    "hidden_suite_not_evaluated",
    "peer_candidates_not_run",
    "local_energy_not_measured",
];

const BENCHMARK_SPEC: &str = include_str!("../../forgebench/signal-maze-v1.json");
const VISIBLE_GAMEPLAY_CONTRACT: &str =
    include_str!("../../forgebench/signal-maze-v1/visible-contract.json");
const STARTER_GAME: &str = include_str!("../../forgebench/signal-maze-v1/starter/game.js");
const STARTER_INDEX: &str = include_str!("../../forgebench/signal-maze-v1/starter/index.html");
const STARTER_STYLES: &str = include_str!("../../forgebench/signal-maze-v1/starter/styles.css");

const EVALUATOR_SCRIPT: &str = r#"
set -eu
if ! command -v bwrap >/dev/null 2>&1; then exit 72; fi
set -- --die-with-parent --new-session --unshare-all --clearenv
set -- "$@" --ro-bind /usr /usr
if [ -e /lib ]; then set -- "$@" --ro-bind /lib /lib; fi
if [ -e /lib64 ]; then set -- "$@" --ro-bind /lib64 /lib64; fi
set -- "$@" --proc /proc --dev /dev --tmpfs /tmp --dir /etc
set -- "$@" --ro-bind "$PWD/workspace" /submission
set -- "$@" --bind "$PWD/evaluation" /evaluation --chdir /evaluation
set -- "$@" --setenv HOME /tmp --setenv PATH /usr/bin
bwrap "$@" -- /usr/bin/sh -c '
  set -eu
  test ! -e /etc/passwd
  test ! -e /home
  test ! -e /mnt
  test "$(find /submission -mindepth 1 -maxdepth 1 -type f | wc -l)" -eq 4
  test "$(find /submission -mindepth 1 -maxdepth 1 ! -type f | wc -l)" -eq 0
  test "$(wc -c < /submission/index.html)" -ge 400
  test "$(wc -c < /submission/styles.css)" -ge 500
  test "$(wc -c < /submission/game.js)" -ge 1200
  grep -Fq "data-forgebench=\"signal-maze-v1\"" /submission/index.html
  grep -Fq "data-status=\"candidate\"" /submission/index.html
  grep -Fq "id=\"gameRoot\"" /submission/index.html
  grep -Fq "id=\"signalMazeBoard\"" /submission/index.html
  grep -Fq "id=\"newGameBtn\"" /submission/index.html
  grep -Fq "id=\"resetBtn\"" /submission/index.html
  grep -Fq "id=\"gameStatus\"" /submission/index.html
  grep -Fq "data-state=" /submission/index.html
  grep -Fq "__SIGNAL_MAZE_CANDIDATE__" /submission/game.js
  grep -Fq "__SIGNAL_MAZE_VISIBLE_API__" /submission/game.js
  grep -Fq "signal-maze-visible-snapshot.v1" /submission/game.js
  grep -Fq "newGame" /submission/game.js
  grep -Fq "snapshot" /submission/game.js
  grep -Fq "applyPath" /submission/game.js
  grep -Fq "reset" /submission/game.js
  grep -Fq "implementation_started" /submission/game.js
  grep -Fq "styles.css" /submission/index.html
  grep -Fq "game.js" /submission/index.html
  if grep -Eiq "https?://|@import|url[[:space:]]*\\(|fetch[[:space:]]*\\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|<iframe|<object|<embed|<base|<form" /submission/game.js /submission/index.html /submission/styles.css; then exit 91; fi
  if printf "%s" "forbidden" > /submission/.outilsia-evaluator-write-test 2>/dev/null; then exit 92; fi
  test ! -e /submission/.outilsia-evaluator-write-test
  {
    for file in .outilsia-run-contract.json game.js index.html styles.css; do
      digest="$(sha256sum "/submission/$file" | cut -d " " -f 1)"
      printf "%s:%s\n" "$file" "$digest"
    done
  } | sha256sum | cut -d " " -f 1 > /evaluation/submission.sha256
  digest="$(cat /evaluation/submission.sha256)"
  printf "%s\n" "evaluator_marker=forgebench-ollama-static-evaluator-ok"
  printf "%s\n" "submission_digest=$digest"
  printf "%s\n" "files_total=4"
  printf "%s\n" "checks_passed=7"
  printf "%s\n" "readonly_verified=true"
'
"#;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct RunForgeBenchOllamaCandidateRequest {
    schema: String,
    forgebench_result: Value,
    reference_pilot_result: Value,
    isolation_result: Value,
    consent: Value,
    budget: Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CandidateIdentity {
    candidate_id: String,
    model_ref: String,
    runtime: String,
    environment: String,
}

#[derive(Debug)]
struct CandidateFiles {
    index_html: String,
    styles_css: String,
    game_js: String,
}

#[derive(Debug)]
struct GenerationEvidence {
    raw_response: String,
    duration_ms: u128,
    prompt_eval_count: u64,
    eval_count: u64,
    eval_duration_ms: u64,
    total_duration_ms: u64,
}

struct CandidateRunGuard;

impl Drop for CandidateRunGuard {
    fn drop(&mut self) {
        CANDIDATE_RUNNING.store(false, Ordering::Release);
    }
}

static CANDIDATE_RUNNING: AtomicBool = AtomicBool::new(false);

fn acquire_candidate_guard() -> Result<CandidateRunGuard, String> {
    CANDIDATE_RUNNING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map(|_| CandidateRunGuard)
        .map_err(|_| "Un candidat Ollama ForgeBench est deja en cours.".to_string())
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

fn safe_id(value: &str, prefix: &str) -> bool {
    value.starts_with(prefix)
        && value.len() <= 80
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn safe_model_ref(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 180
        && !value.starts_with('/')
        && !value.contains("..")
        && !value.contains("//")
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b'/' | b':')
        })
}

fn random_nonce() -> Result<[u8; 16], String> {
    let mut nonce = [0_u8; 16];
    fill(&mut nonce).map_err(|error| format!("Entropie du run Ollama indisponible: {error}"))?;
    Ok(nonce)
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("Permissions du run Ollama impossibles: {error}"))
}

#[cfg(not(unix))]
fn set_private_directory_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn create_private_directory(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Err("Le dossier du run Ollama doit etre neuf.".to_string());
    }
    fs::create_dir_all(path)
        .map_err(|error| format!("Creation du run Ollama impossible: {error}"))?;
    set_private_directory_permissions(path)
}

fn ensure_private_directory(path: &Path) -> Result<(), String> {
    if !path.exists() {
        fs::create_dir_all(path)
            .map_err(|error| format!("Creation de la racine Ollama impossible: {error}"))?;
    }
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Racine du run Ollama illisible: {error}"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("La racine du runner Ollama n'est pas fiable.".to_string());
    }
    set_private_directory_permissions(path)
}

fn run_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(RUN_ROOT))
        .map_err(|error| format!("Dossier du runner Ollama indisponible: {error}"))
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

fn validate_consent(consent: &Value) -> Result<(), String> {
    exact_keys(
        consent,
        &[
            "confirmed",
            "scope",
            "candidate_model_allowed",
            "external_network_access",
            "loopback_ollama_allowed",
            "paid_api_allowed",
            "hidden_suite_allowed",
            "generated_code_execution_allowed",
        ],
        "consentement candidat",
    )?;
    if consent.get("confirmed").and_then(Value::as_bool) != Some(true)
        || consent.get("scope").and_then(Value::as_str) != Some(CONSENT_SCOPE)
        || consent
            .get("candidate_model_allowed")
            .and_then(Value::as_bool)
            != Some(true)
        || consent
            .get("external_network_access")
            .and_then(Value::as_bool)
            != Some(false)
        || consent
            .get("loopback_ollama_allowed")
            .and_then(Value::as_bool)
            != Some(true)
        || consent.get("paid_api_allowed").and_then(Value::as_bool) != Some(false)
        || consent.get("hidden_suite_allowed").and_then(Value::as_bool) != Some(false)
        || consent
            .get("generated_code_execution_allowed")
            .and_then(Value::as_bool)
            != Some(true)
    {
        return Err("Consentement du candidat Ollama absent ou trop large.".to_string());
    }
    Ok(())
}

fn validate_budget(budget: &Value) -> Result<Duration, String> {
    exact_keys(
        budget,
        &[
            "max_duration_seconds",
            "max_attempts",
            "max_api_cost_eur",
            "max_output_bytes",
        ],
        "budget candidat",
    )?;
    let seconds = budget
        .get("max_duration_seconds")
        .and_then(Value::as_u64)
        .filter(|value| (MIN_DURATION_SECONDS..=MAX_DURATION_SECONDS).contains(value))
        .ok_or_else(|| "Duree du candidat Ollama invalide.".to_string())?;
    if budget.get("max_attempts").and_then(Value::as_u64) != Some(1)
        || budget.get("max_api_cost_eur").and_then(Value::as_u64) != Some(0)
        || budget.get("max_output_bytes").and_then(Value::as_u64) != Some(FIXED_OUTPUT_BUDGET_BYTES)
    {
        return Err("Budget du candidat Ollama trop large.".to_string());
    }
    Ok(Duration::from_secs(seconds))
}

fn candidate_from_forgebench(result: &Value) -> Result<CandidateIdentity, String> {
    validate_forgebench_result(result)?;
    let stack = result
        .pointer("/experiment/candidate_stacks")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|stack| stack.get("key").and_then(Value::as_str) == Some(STACK_KEY))
        .ok_or_else(|| "La stack Ollama locale n'est pas dans l'experience.".to_string())?;
    if stack.get("available").and_then(Value::as_bool) != Some(true)
        || stack.get("execution_started").and_then(Value::as_bool) != Some(false)
        || stack.get("scores_computed").and_then(Value::as_bool) != Some(false)
    {
        return Err("La stack Ollama locale n'est pas prete.".to_string());
    }
    let candidate = stack
        .get("bindings")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|binding| binding.get("role").and_then(Value::as_str) == Some("worker"))
        .and_then(|binding| binding.get("candidate"))
        .ok_or_else(|| "Worker Ollama absent de l'experience.".to_string())?;
    let candidate_id = candidate
        .get("candidate_id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Identifiant du worker Ollama absent.".to_string())?;
    let environment = candidate
        .get("environment")
        .and_then(Value::as_str)
        .ok_or_else(|| "Environnement Ollama absent.".to_string())?;
    let (prefix, runtime) = match environment {
        "ollama_native" => ("local-model:ollama_native:", "native"),
        "ollama_wsl" => ("local-model:ollama_wsl:", "wsl"),
        _ => return Err("Environnement du worker Ollama invalide.".to_string()),
    };
    let model_ref = candidate_id
        .strip_prefix(prefix)
        .filter(|value| safe_model_ref(value))
        .ok_or_else(|| "Reference du worker Ollama invalide.".to_string())?;
    Ok(CandidateIdentity {
        candidate_id: candidate_id.to_string(),
        model_ref: model_ref.to_string(),
        runtime: runtime.to_string(),
        environment: environment.to_string(),
    })
}

fn model_is_listed(tags: &Value, model_ref: &str) -> bool {
    let requested = model_ref.trim().to_ascii_lowercase();
    tags.get("models")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|model| {
            model
                .get("name")
                .or_else(|| model.get("model"))
                .and_then(Value::as_str)
        })
        .any(|name| {
            let name = name.trim().to_ascii_lowercase();
            name == requested
                || (!requested.contains(':')
                    && name.split(':').next().unwrap_or(&name) == requested)
        })
}

fn structured_format() -> Value {
    json!({
        "type": "object",
        "properties": {
            "index_html": {"type": "string"},
            "styles_css": {"type": "string"},
            "game_js": {"type": "string"}
        },
        "required": ["index_html", "styles_css", "game_js"],
        "additionalProperties": false
    })
}

fn candidate_prompt(public_seed: u64) -> String {
    format!(
        r#"Tu es le worker local d'un test exploratoire OutilsIA ForgeBench.

MISSION PUBLIQUE
Construis Signal Maze v1 depuis le starter fourni. Le plateau est une grille 9 x 9 deterministe issue du seed entier {public_seed}. Le joueur doit relier trois sources a leurs recepteurs de meme couleur. Les chemins ne traversent ni obstacle ni autre chemin. Nouvelle partie et Reinitialiser doivent fonctionner. Clavier, souris et tactile doivent rester jouables hors ligne.

CONTRAT DE SORTIE STRICT
- Reponds uniquement avec l'objet JSON impose par le schema Ollama.
- Fournis exactement index_html, styles_css et game_js, sans Markdown.
- index_html conserve data-forgebench="signal-maze-v1", utilise data-status="candidate", expose data-state="playing" et contient les IDs gameRoot, signalMazeBoard, newGameBtn, resetBtn et gameStatus.
- index_html charge uniquement styles.css et game.js.
- game_js definit globalThis.__SIGNAL_MAZE_CANDIDATE__ avec benchmark="signal-maze-v1" et implementation_started=true.
- game_js implemente globalThis.__SIGNAL_MAZE_VISIBLE_API__ avec exactement newGame, snapshot, applyPath et reset, ainsi que le snapshot signal-maze-visible-snapshot.v1.
- Aucun URL, import, fetch, WebSocket, iframe, formulaire, ressource externe ou telemetrie.
- Aucun contenu cache, depot, credential ou test prive n'est disponible.
- Apres consentement explicite, ForgeBench executera ces trois fichiers dans Chromium headless isole par Bubblewrap, sans reseau, sur trois seeds et trois viewports visibles.
- Cette recette publique est volontairement rejouable et ne produit ni score scientifique, ni comparaison cachee, ni vainqueur.

SPECIFICATION PUBLIQUE
{BENCHMARK_SPEC}

CONTRAT DE GAMEPLAY VISIBLE PUBLIC
{VISIBLE_GAMEPLAY_CONTRACT}

STARTER index.html
{STARTER_INDEX}

STARTER styles.css
{STARTER_STYLES}

STARTER game.js
{STARTER_GAME}
"#
    )
}

fn chat_payload(model_ref: &str, prompt: &str) -> Value {
    json!({
        "model": model_ref,
        "messages": [{"role": "user", "content": prompt}],
        "stream": false,
        "think": false,
        "format": structured_format(),
        "keep_alive": "2m",
        "options": {
            "num_ctx": 16384,
            "num_predict": 8192,
            "seed": 42,
            "temperature": 0
        }
    })
}

async fn read_native_json(mut response: reqwest::Response, label: &str) -> Result<Value, String> {
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(format!("Reponse {label} trop volumineuse."));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Reponse {label} illisible: {error}"))?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(format!("Reponse {label} trop volumineuse."));
        }
        bytes.extend_from_slice(&chunk);
    }
    if !status.is_success() {
        return Err(format!("Ollama local a refuse {label} ({status})."));
    }
    serde_json::from_slice(&bytes).map_err(|_| format!("Reponse {label} non JSON."))
}

async fn generate_native(
    identity: &CandidateIdentity,
    prompt: &str,
    timeout: Duration,
) -> Result<GenerationEvidence, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(timeout)
        .build()
        .map_err(|error| format!("Client Ollama local indisponible: {error}"))?;
    let tags = read_native_json(
        client
            .get("http://127.0.0.1:11434/api/tags")
            .send()
            .await
            .map_err(|error| format!("Inventaire Ollama local inaccessible: {error}"))?,
        "inventaire",
    )
    .await?;
    if !model_is_listed(&tags, &identity.model_ref) {
        return Err("Le modele Ollama selectionne n'est pas installe dans ce runtime.".to_string());
    }
    let started = Instant::now();
    let payload = read_native_json(
        client
            .post("http://127.0.0.1:11434/api/chat")
            .json(&chat_payload(&identity.model_ref, prompt))
            .send()
            .await
            .map_err(|error| format!("Generation Ollama locale impossible: {error}"))?,
        "generation candidate",
    )
    .await?;
    generation_from_payload(payload, started.elapsed())
}

fn read_bounded<R: Read>(mut reader: R, limit: usize) -> (Vec<u8>, bool) {
    let mut stored = Vec::new();
    let mut overflow = false;
    let mut buffer = [0_u8; 4096];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(size) => {
                let remaining = limit.saturating_sub(stored.len());
                if remaining > 0 {
                    stored.extend_from_slice(&buffer[..size.min(remaining)]);
                }
                if size > remaining {
                    overflow = true;
                }
            }
            Err(_) => break,
        }
    }
    (stored, overflow)
}

fn command_with_input_bounded(
    mut command: Command,
    input: Option<&[u8]>,
    timeout: Duration,
    label: &str,
) -> Result<(Vec<u8>, Vec<u8>), String> {
    let started = Instant::now();
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Impossible de lancer {label}: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        if let Some(input) = input {
            stdin
                .write_all(input)
                .map_err(|error| format!("Entree {label} impossible: {error}"))?;
        }
    }
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("Sortie {label} absente."))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| format!("Erreur {label} absente."))?;
    let stdout_reader = thread::spawn(move || read_bounded(stdout, MAX_RESPONSE_BYTES));
    let stderr_reader = thread::spawn(move || read_bounded(stderr, 16 * 1024));
    let mut timed_out = false;
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Etat {label} illisible: {error}"))?
        {
            break status;
        }
        if started.elapsed() >= timeout {
            timed_out = true;
            let _ = child.kill();
            break child
                .wait()
                .map_err(|error| format!("Fin {label} impossible: {error}"))?;
        }
        thread::sleep(Duration::from_millis(120));
    };
    let (stdout, stdout_overflow) = stdout_reader
        .join()
        .map_err(|_| format!("Lecture {label} interrompue."))?;
    let (stderr, _) = stderr_reader
        .join()
        .map_err(|_| format!("Lecture erreur {label} interrompue."))?;
    if timed_out {
        return Err(format!(
            "{label} stoppe apres {} secondes.",
            timeout.as_secs()
        ));
    }
    if stdout_overflow {
        return Err(format!("Sortie {label} trop volumineuse."));
    }
    if !status.success() {
        let reason = String::from_utf8_lossy(&stderr)
            .trim()
            .chars()
            .take(300)
            .collect::<String>();
        return Err(if reason.is_empty() {
            format!("{label} a echoue.")
        } else {
            format!("{label} a echoue: {reason}")
        });
    }
    Ok((stdout, stderr))
}

fn wsl_curl_json(
    endpoint: &str,
    payload: Option<&Value>,
    timeout: Duration,
    label: &str,
) -> Result<Value, String> {
    let mut command = Command::new("wsl.exe");
    command.args([
        "-e",
        "curl",
        "-fsS",
        "--noproxy",
        "127.0.0.1",
        "--max-filesize",
        &MAX_RESPONSE_BYTES.to_string(),
        "--max-time",
        &timeout.as_secs().to_string(),
    ]);
    let input = if let Some(payload) = payload {
        command.args([
            "-H",
            "Content-Type: application/json",
            "--data-binary",
            "@-",
        ]);
        Some(
            serde_json::to_vec(payload)
                .map_err(|error| format!("Requete {label} invalide: {error}"))?,
        )
    } else {
        None
    };
    command.arg(format!("http://127.0.0.1:11434{endpoint}"));
    let (stdout, _) = command_with_input_bounded(
        command,
        input.as_deref(),
        timeout + Duration::from_secs(5),
        label,
    )?;
    serde_json::from_slice(&stdout).map_err(|_| format!("Reponse {label} non JSON."))
}

fn generate_wsl(
    identity: CandidateIdentity,
    prompt: String,
    timeout: Duration,
) -> Result<GenerationEvidence, String> {
    let tags = wsl_curl_json(
        "/api/tags",
        None,
        Duration::from_secs(15),
        "inventaire Ollama WSL",
    )?;
    if !model_is_listed(&tags, &identity.model_ref) {
        return Err("Le modele Ollama selectionne n'est pas installe dans WSL.".to_string());
    }
    let started = Instant::now();
    let payload = wsl_curl_json(
        "/api/chat",
        Some(&chat_payload(&identity.model_ref, &prompt)),
        timeout,
        "generation Ollama WSL",
    )?;
    generation_from_payload(payload, started.elapsed())
}

fn candidate_runtime_supported(runtime: &str) -> bool {
    runtime == "native" || (runtime == "wsl" && cfg!(target_os = "windows"))
}

async fn generate_candidate(
    identity: &CandidateIdentity,
    prompt: &str,
    timeout: Duration,
) -> Result<GenerationEvidence, String> {
    if !candidate_runtime_supported(&identity.runtime) {
        return Err("Le runtime Ollama candidat n'est pas disponible sur cet hote.".to_string());
    }
    if identity.runtime == "wsl" {
        let identity = identity.clone();
        let prompt = prompt.to_string();
        return tauri::async_runtime::spawn_blocking(move || {
            generate_wsl(identity, prompt, timeout)
        })
        .await
        .map_err(|error| format!("Generation Ollama WSL interrompue: {error}"))?;
    }
    generate_native(identity, prompt, timeout).await
}

fn generation_from_payload(
    payload: Value,
    elapsed: Duration,
) -> Result<GenerationEvidence, String> {
    if payload.get("error").and_then(Value::as_str).is_some() {
        return Err("Ollama a refuse la generation candidate.".to_string());
    }
    if payload.get("done").and_then(Value::as_bool) == Some(false) {
        return Err("La generation candidate Ollama est incomplete.".to_string());
    }
    let raw_response = payload
        .pointer("/message/content")
        .and_then(Value::as_str)
        .or_else(|| payload.get("response").and_then(Value::as_str))
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Ollama n'a retourne aucune soumission.".to_string())?
        .to_string();
    if raw_response.len() > FIXED_OUTPUT_BUDGET_BYTES as usize {
        return Err("La soumission Ollama depasse le budget de sortie.".to_string());
    }
    Ok(GenerationEvidence {
        raw_response,
        duration_ms: elapsed.as_millis(),
        prompt_eval_count: payload
            .get("prompt_eval_count")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        eval_count: payload
            .get("eval_count")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        eval_duration_ms: payload
            .get("eval_duration")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            / 1_000_000,
        total_duration_ms: payload
            .get("total_duration")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            / 1_000_000,
    })
}

fn contains_forbidden_runtime_reference(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        "http://",
        "https://",
        "@import",
        "url(",
        "fetch(",
        "xmlhttprequest",
        "websocket",
        "eventsource",
        "sendbeacon",
        "<iframe",
        "<object",
        "<embed",
        "<base",
        "<form",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

fn bounded_text(value: &str, min: usize, max: usize, label: &str) -> Result<(), String> {
    if value.len() < min || value.len() > max || value.contains('\0') {
        return Err(format!("Fichier candidat {label} hors limites."));
    }
    Ok(())
}

fn parse_candidate_files(raw_response: &str) -> Result<CandidateFiles, String> {
    let payload = serde_json::from_str::<Value>(raw_response.trim())
        .map_err(|_| "Reponse structuree Ollama invalide.".to_string())?;
    exact_keys(
        &payload,
        &["index_html", "styles_css", "game_js"],
        "soumission Ollama",
    )?;
    let index_html = payload
        .get("index_html")
        .and_then(Value::as_str)
        .ok_or_else(|| "index_html candidat absent.".to_string())?
        .to_string();
    let styles_css = payload
        .get("styles_css")
        .and_then(Value::as_str)
        .ok_or_else(|| "styles_css candidat absent.".to_string())?
        .to_string();
    let game_js = payload
        .get("game_js")
        .and_then(Value::as_str)
        .ok_or_else(|| "game_js candidat absent.".to_string())?
        .to_string();
    bounded_text(&index_html, MIN_INDEX_BYTES, MAX_INDEX_BYTES, "index.html")?;
    bounded_text(
        &styles_css,
        MIN_STYLES_BYTES,
        MAX_STYLES_BYTES,
        "styles.css",
    )?;
    bounded_text(&game_js, MIN_GAME_BYTES, MAX_GAME_BYTES, "game.js")?;
    let total = index_html.len() + styles_css.len() + game_js.len();
    if total > MAX_SUBMISSION_BYTES as usize
        || contains_forbidden_runtime_reference(&index_html)
        || contains_forbidden_runtime_reference(&styles_css)
        || contains_forbidden_runtime_reference(&game_js)
    {
        return Err("La soumission candidate elargit les ressources autorisees.".to_string());
    }
    for marker in [
        "data-forgebench=\"signal-maze-v1\"",
        "data-status=\"candidate\"",
        "id=\"gameRoot\"",
        "id=\"signalMazeBoard\"",
        "id=\"newGameBtn\"",
        "id=\"resetBtn\"",
        "id=\"gameStatus\"",
        "data-state=",
        "styles.css",
        "game.js",
    ] {
        if !index_html.contains(marker) {
            return Err(format!("Marqueur candidat absent: {marker}."));
        }
    }
    if !game_js.contains("__SIGNAL_MAZE_CANDIDATE__")
        || !game_js.contains("implementation_started")
        || !game_js.contains("__SIGNAL_MAZE_VISIBLE_API__")
        || !game_js.contains("signal-maze-visible-snapshot.v1")
        || !["newGame", "snapshot", "applyPath", "reset"]
            .iter()
            .all(|marker| game_js.contains(marker))
    {
        return Err("Marqueur d'implementation candidate absent.".to_string());
    }
    Ok(CandidateFiles {
        index_html,
        styles_css,
        game_js,
    })
}

fn write_candidate_files(workspace: &Path, files: &CandidateFiles) -> Result<(), String> {
    for (name, content) in [
        ("index.html", files.index_html.as_bytes()),
        ("styles.css", files.styles_css.as_bytes()),
        ("game.js", files.game_js.as_bytes()),
    ] {
        fs::write(workspace.join(name), content)
            .map_err(|error| format!("Ecriture du fichier candidat {name} impossible: {error}"))?;
    }
    Ok(())
}

fn validate_submission(workspace: &Path) -> Result<(String, u64), String> {
    let expected_names = EXPECTED_FILES
        .iter()
        .map(|value| (*value).to_string())
        .collect::<BTreeSet<_>>();
    let mut actual_names = BTreeSet::new();
    let mut total_bytes = 0_u64;
    for entry in fs::read_dir(workspace)
        .map_err(|error| format!("Soumission candidate illisible: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Entree candidate illisible: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Type candidat illisible: {error}"))?;
        if !file_type.is_file() || file_type.is_symlink() {
            return Err("La soumission candidate contient une entree non autorisee.".to_string());
        }
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| "Nom de fichier candidat non UTF-8.".to_string())?;
        let size = entry
            .metadata()
            .map_err(|error| format!("Taille candidate illisible: {error}"))?
            .len();
        total_bytes = total_bytes.saturating_add(size);
        actual_names.insert(name);
    }
    if actual_names != expected_names || total_bytes > MAX_SUBMISSION_BYTES {
        return Err("Topologie ou taille de soumission candidate invalide.".to_string());
    }
    let files = CandidateFiles {
        index_html: fs::read_to_string(workspace.join("index.html"))
            .map_err(|error| format!("index.html candidat illisible: {error}"))?,
        styles_css: fs::read_to_string(workspace.join("styles.css"))
            .map_err(|error| format!("styles.css candidat illisible: {error}"))?,
        game_js: fs::read_to_string(workspace.join("game.js"))
            .map_err(|error| format!("game.js candidat illisible: {error}"))?,
    };
    parse_candidate_files(
        &serde_json::to_string(&json!({
            "index_html": files.index_html,
            "styles_css": files.styles_css,
            "game_js": files.game_js
        }))
        .map_err(|error| format!("Soumission candidate non serialisable: {error}"))?,
    )?;
    let mut digest_lines = Vec::with_capacity(EXPECTED_FILES.len());
    for name in EXPECTED_FILES {
        let bytes = fs::read(workspace.join(name))
            .map_err(|error| format!("Fichier candidat illisible: {error}"))?;
        digest_lines.push(format!("{name}:{}", sha256_bytes(&bytes)));
    }
    digest_lines.sort();
    Ok((
        sha256_bytes(format!("{}\n", digest_lines.join("\n")).as_bytes()),
        total_bytes,
    ))
}

fn marker_values(output: &str) -> BTreeMap<String, String> {
    output
        .lines()
        .filter_map(|line| line.trim().split_once('='))
        .map(|(key, value)| (key.to_string(), value.trim().to_string()))
        .collect()
}

fn sign_document(document: &mut Value) -> Result<(), String> {
    document
        .as_object_mut()
        .ok_or_else(|| "Resultat candidat Ollama invalide.".to_string())?
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

pub(crate) fn validate_forgebench_ollama_candidate_result(result: &Value) -> Result<(), String> {
    exact_keys(
        result,
        &[
            "schema",
            "contract_version",
            "run_id",
            "benchmark",
            "batch_ref",
            "reference_pilot_ref",
            "host_environment",
            "selected_backend",
            "candidate",
            "consent",
            "budget",
            "generation",
            "submission",
            "evaluator",
            "browser_evaluator",
            "security",
            "cost",
            "readiness",
            "integrity",
        ],
        "resultat candidat Ollama",
    )?;
    if result.get("schema").and_then(Value::as_str) != Some(RESULT_SCHEMA)
        || result.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || result
            .get("run_id")
            .and_then(Value::as_str)
            .is_none_or(|value| !safe_id(value, "fbo-"))
        || result.pointer("/benchmark/id").and_then(Value::as_str) != Some(BENCHMARK_ID)
        || result.pointer("/benchmark/track").and_then(Value::as_str)
            != Some("local_model_visible_browser_candidate")
        || !matches!(
            result.get("selected_backend").and_then(Value::as_str),
            Some("linux-bwrap-native" | "wsl-bwrap")
        )
    {
        return Err("Identite du resultat candidat Ollama invalide.".to_string());
    }
    exact_keys(
        result.get("benchmark").unwrap_or(&Value::Null),
        &["id", "track"],
        "benchmark candidat",
    )?;
    exact_keys(
        result.get("batch_ref").unwrap_or(&Value::Null),
        &[
            "batch_id",
            "experiment_digest",
            "protocol_digest",
            "stack_key",
            "public_seed_sha256",
        ],
        "batch candidat",
    )?;
    exact_keys(
        result.get("reference_pilot_ref").unwrap_or(&Value::Null),
        &["pilot_id", "integrity_digest"],
        "pilote de reference candidat",
    )?;
    let batch = result.get("batch_ref").unwrap_or(&Value::Null);
    let reference = result.get("reference_pilot_ref").unwrap_or(&Value::Null);
    if batch.get("stack_key").and_then(Value::as_str) != Some(STACK_KEY)
        || batch
            .get("batch_id")
            .and_then(Value::as_str)
            .is_none_or(|value| !safe_id(value, "fbsb-"))
        || batch
            .get("experiment_digest")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        || batch
            .get("protocol_digest")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        || batch
            .get("public_seed_sha256")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        || reference
            .get("pilot_id")
            .and_then(Value::as_str)
            .is_none_or(|value| !safe_id(value, "fbp-"))
        || reference
            .get("integrity_digest")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        || !matches!(
            result.get("host_environment").and_then(Value::as_str),
            Some("windows" | "linux")
        )
    {
        return Err("References du resultat candidat Ollama invalides.".to_string());
    }
    exact_keys(
        result.get("candidate").unwrap_or(&Value::Null),
        &[
            "candidate_id",
            "adapter_kind",
            "model_ref",
            "runtime",
            "environment",
            "model_invoked",
            "cli_agent_invoked",
        ],
        "candidat Ollama",
    )?;
    let candidate = result.get("candidate").unwrap_or(&Value::Null);
    let candidate_id = candidate
        .get("candidate_id")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let model_ref = candidate
        .get("model_ref")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let runtime = candidate
        .get("runtime")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let environment = candidate
        .get("environment")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let expected_environment = if runtime == "native" {
        "ollama_native"
    } else if runtime == "wsl" {
        "ollama_wsl"
    } else {
        ""
    };
    let expected_candidate_id = format!("local-model:{expected_environment}:{model_ref}");
    if candidate.get("adapter_kind").and_then(Value::as_str)
        != Some("ollama_local_visible_browser_v2")
        || candidate
            .get("model_ref")
            .and_then(Value::as_str)
            .is_none_or(|value| !safe_model_ref(value))
        || !matches!(
            candidate.get("runtime").and_then(Value::as_str),
            Some("native" | "wsl")
        )
        || !matches!(
            candidate.get("environment").and_then(Value::as_str),
            Some("ollama_native" | "ollama_wsl")
        )
        || candidate.get("model_invoked").and_then(Value::as_bool) != Some(true)
        || candidate.get("cli_agent_invoked").and_then(Value::as_bool) != Some(false)
        || environment != expected_environment
        || candidate_id != expected_candidate_id
    {
        return Err("Candidat Ollama incoherent.".to_string());
    }
    validate_consent(result.get("consent").unwrap_or(&Value::Null))?;
    let duration_budget = validate_budget(result.get("budget").unwrap_or(&Value::Null))?;
    exact_keys(
        result.get("generation").unwrap_or(&Value::Null),
        &[
            "started",
            "succeeded",
            "timed_out",
            "attempts",
            "duration_ms",
            "prompt_sha256",
            "response_sha256",
            "response_chars",
            "prompt_eval_count",
            "eval_count",
            "eval_duration_ms",
            "total_duration_ms",
            "raw_response_returned",
            "raw_response_persisted",
        ],
        "generation Ollama",
    )?;
    let generation = result.get("generation").unwrap_or(&Value::Null);
    let duration_ms = generation
        .get("duration_ms")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    if generation.get("started").and_then(Value::as_bool) != Some(true)
        || generation.get("succeeded").and_then(Value::as_bool) != Some(true)
        || generation.get("timed_out").and_then(Value::as_bool) != Some(false)
        || generation.get("attempts").and_then(Value::as_u64) != Some(1)
        || duration_ms == 0
        || duration_ms > duration_budget.as_millis() as u64 + 5000
        || generation
            .get("prompt_sha256")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        || generation
            .get("response_sha256")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        || generation
            .get("response_chars")
            .and_then(Value::as_u64)
            .is_none_or(|value| value == 0 || value > FIXED_OUTPUT_BUDGET_BYTES)
        || generation
            .get("raw_response_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || generation
            .get("raw_response_persisted")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Preuve de generation Ollama invalide.".to_string());
    }
    exact_keys(
        result.get("submission").unwrap_or(&Value::Null),
        &[
            "materialized",
            "exact_topology_verified",
            "files_total",
            "bytes_total",
            "digest",
            "generated_code_executed",
        ],
        "soumission candidate",
    )?;
    let submission = result.get("submission").unwrap_or(&Value::Null);
    if submission.get("materialized").and_then(Value::as_bool) != Some(true)
        || submission
            .get("exact_topology_verified")
            .and_then(Value::as_bool)
            != Some(true)
        || submission.get("files_total").and_then(Value::as_u64)
            != Some(EXPECTED_FILES.len() as u64)
        || submission
            .get("bytes_total")
            .and_then(Value::as_u64)
            .is_none_or(|value| value == 0 || value > MAX_SUBMISSION_BYTES)
        || submission
            .get("digest")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        || submission
            .get("generated_code_executed")
            .and_then(Value::as_bool)
            != Some(true)
    {
        return Err("Soumission candidate invalide.".to_string());
    }
    exact_keys(
        result.get("evaluator").unwrap_or(&Value::Null),
        &[
            "kind",
            "started",
            "succeeded",
            "timed_out",
            "duration_ms",
            "independent_process",
            "workspace_read_only",
            "network_namespace_enforced",
            "hidden_suite_used",
            "visible_checks_total",
            "visible_checks_passed",
            "submission_digest",
        ],
        "evaluateur candidat",
    )?;
    let evaluator = result.get("evaluator").unwrap_or(&Value::Null);
    if evaluator.get("kind").and_then(Value::as_str) != Some(EVALUATOR_KIND)
        || evaluator.get("started").and_then(Value::as_bool) != Some(true)
        || evaluator.get("succeeded").and_then(Value::as_bool) != Some(true)
        || evaluator.get("timed_out").and_then(Value::as_bool) != Some(false)
        || evaluator
            .get("independent_process")
            .and_then(Value::as_bool)
            != Some(true)
        || evaluator
            .get("workspace_read_only")
            .and_then(Value::as_bool)
            != Some(true)
        || evaluator
            .get("network_namespace_enforced")
            .and_then(Value::as_bool)
            != Some(true)
        || evaluator.get("hidden_suite_used").and_then(Value::as_bool) != Some(false)
        || evaluator
            .get("visible_checks_total")
            .and_then(Value::as_u64)
            != Some(7)
        || evaluator
            .get("visible_checks_passed")
            .and_then(Value::as_u64)
            != Some(7)
        || evaluator.get("submission_digest").and_then(Value::as_str)
            != submission.get("digest").and_then(Value::as_str)
    {
        return Err("Evaluation visible candidate invalide.".to_string());
    }
    validate_visible_browser_evidence(
        result.get("browser_evaluator").unwrap_or(&Value::Null),
        submission
            .get("digest")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    )?;
    exact_keys(
        result.get("security").unwrap_or(&Value::Null),
        &[
            "candidate_received_public_prompt_only",
            "candidate_filesystem_context_supplied",
            "candidate_tool_access",
            "external_network_requested",
            "loopback_ollama_requested",
            "source_repository_mounted",
            "hidden_suite_mounted",
            "credentials_read_by_outilsia",
            "raw_model_output_returned",
            "raw_model_output_persisted",
            "generated_code_executed",
            "evaluator_process_isolated",
            "temporary_workspace_removed",
            "paths_returned",
        ],
        "securite candidate",
    )?;
    let security = result.get("security").unwrap_or(&Value::Null);
    for key in [
        "candidate_filesystem_context_supplied",
        "candidate_tool_access",
        "external_network_requested",
        "source_repository_mounted",
        "hidden_suite_mounted",
        "credentials_read_by_outilsia",
        "raw_model_output_returned",
        "raw_model_output_persisted",
        "paths_returned",
    ] {
        if security.get(key).and_then(Value::as_bool) != Some(false) {
            return Err("Perimetre de securite candidat elargi.".to_string());
        }
    }
    for key in [
        "candidate_received_public_prompt_only",
        "loopback_ollama_requested",
        "generated_code_executed",
        "evaluator_process_isolated",
        "temporary_workspace_removed",
    ] {
        if security.get(key).and_then(Value::as_bool) != Some(true) {
            return Err("Preuve de securite candidate absente.".to_string());
        }
    }
    exact_keys(
        result.get("cost").unwrap_or(&Value::Null),
        &[
            "api_cost_eur",
            "api_status",
            "local_energy_wh",
            "energy_status",
        ],
        "cout candidat",
    )?;
    if result.pointer("/cost/api_cost_eur").and_then(Value::as_u64) != Some(0)
        || result.pointer("/cost/api_status").and_then(Value::as_str) != Some("not_incurred")
        || !result
            .pointer("/cost/local_energy_wh")
            .is_some_and(Value::is_null)
        || result
            .pointer("/cost/energy_status")
            .and_then(Value::as_str)
            != Some("not_measured")
    {
        return Err("Mesure de cout candidate trompeuse.".to_string());
    }
    exact_keys(
        result.get("readiness").unwrap_or(&Value::Null),
        &[
            "candidate_generation_verified",
            "candidate_submission_structure_verified",
            "visible_browser_execution_verified",
            "gameplay_verified",
            "hidden_evaluator_verified",
            "scientific_eligible",
            "winner_declared",
            "blockers",
        ],
        "readiness candidate",
    )?;
    let readiness = result.get("readiness").unwrap_or(&Value::Null);
    let blockers = readiness
        .get("blockers")
        .and_then(Value::as_array)
        .ok_or_else(|| "Blocages candidate absents.".to_string())?;
    let blocker_set = blockers
        .iter()
        .filter_map(Value::as_str)
        .collect::<BTreeSet<_>>();
    if readiness
        .get("candidate_generation_verified")
        .and_then(Value::as_bool)
        != Some(true)
        || readiness
            .get("candidate_submission_structure_verified")
            .and_then(Value::as_bool)
            != Some(true)
        || readiness
            .get("visible_browser_execution_verified")
            .and_then(Value::as_bool)
            != Some(true)
        || readiness.get("gameplay_verified").and_then(Value::as_bool) != Some(true)
        || readiness
            .get("hidden_evaluator_verified")
            .and_then(Value::as_bool)
            != Some(false)
        || readiness
            .get("scientific_eligible")
            .and_then(Value::as_bool)
            != Some(false)
        || readiness.get("winner_declared").and_then(Value::as_bool) != Some(false)
        || blocker_set != REQUIRED_BLOCKERS.iter().copied().collect::<BTreeSet<_>>()
    {
        return Err("Readiness candidate trompeuse.".to_string());
    }
    for pointer in [
        "/batch_ref/experiment_digest",
        "/batch_ref/protocol_digest",
        "/reference_pilot_ref/integrity_digest",
        "/integrity/digest",
    ] {
        if result
            .pointer(pointer)
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        {
            return Err("Empreinte candidate absente.".to_string());
        }
    }
    exact_keys(
        result.get("integrity").unwrap_or(&Value::Null),
        &["algorithm", "canonicalization", "scope", "digest"],
        "integrite candidate",
    )?;
    if result
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
        return Err("Contrat d'integrite candidat invalide.".to_string());
    }
    let digest = result
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .ok_or_else(|| "Empreinte candidate absente.".to_string())?;
    let mut unsigned = result.clone();
    unsigned
        .as_object_mut()
        .ok_or_else(|| "Document candidat invalide.".to_string())?
        .remove("integrity");
    if canonical_sha256(&unsigned) != digest {
        return Err("Empreinte candidate incoherente.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn run_forgebench_ollama_candidate(
    app: AppHandle,
    request: RunForgeBenchOllamaCandidateRequest,
) -> Result<Value, String> {
    if request.schema != REQUEST_SCHEMA {
        return Err("Contrat du candidat Ollama invalide.".to_string());
    }
    validate_consent(&request.consent)?;
    let timeout = validate_budget(&request.budget)?;
    let identity = candidate_from_forgebench(&request.forgebench_result)?;
    validate_forgebench_reference_pilot_result(&request.reference_pilot_result)?;
    let backend = selected_backend(&request.isolation_result)?.to_string();
    if request
        .reference_pilot_result
        .get("selected_backend")
        .and_then(Value::as_str)
        != Some(backend.as_str())
    {
        return Err(
            "Le pilote de reference et le candidat utilisent des backends differents.".to_string(),
        );
    }
    let _guard = acquire_candidate_guard()?;
    let root = run_root(&app)?;
    ensure_private_directory(&root)?;
    let nonce = random_nonce()?;
    let run_seed = json!({
        "nonce_sha256": sha256_bytes(&nonce),
        "started_at_ms": unix_ms(),
        "candidate_id": identity.candidate_id,
        "backend": backend
    });
    let run_id = format!("fbo-{}", &canonical_sha256(&run_seed)[..24]);
    let run_dir = root.join(&run_id);
    create_private_directory(&run_dir)?;
    let workspace = run_dir.join("workspace");
    let evaluation = run_dir.join("evaluation");

    let execution = async {
        let source =
            copy_verified_workspace_for_stack(&app, &workspace, Some(STACK_KEY))?;
        if source.stack_key != STACK_KEY {
            return Err("Le workspace ne correspond pas a la stack Ollama.".to_string());
        }
        let experiment_digest = request
            .forgebench_result
            .pointer("/experiment/integrity/digest")
            .and_then(Value::as_str)
            .ok_or_else(|| "Empreinte de l'experience absente.".to_string())?;
        let protocol_digest = request
            .forgebench_result
            .pointer("/experiment/protocol_digest")
            .and_then(Value::as_str)
            .ok_or_else(|| "Empreinte du protocole absente.".to_string())?;
        if source.experiment_digest != experiment_digest
            || source.protocol_digest != protocol_digest
            || request
                .reference_pilot_result
                .pointer("/batch_ref/batch_id")
                .and_then(Value::as_str)
                != Some(source.batch_id.as_str())
            || request
                .reference_pilot_result
                .pointer("/batch_ref/experiment_digest")
                .and_then(Value::as_str)
                != Some(source.experiment_digest.as_str())
            || request
                .reference_pilot_result
                .pointer("/batch_ref/protocol_digest")
                .and_then(Value::as_str)
                != Some(source.protocol_digest.as_str())
        {
            return Err("Le candidat ne correspond pas au batch pilote verifie.".to_string());
        }
        create_private_directory(&evaluation)?;
        preflight_visible_browser(&run_dir)?;
        let prompt = candidate_prompt(source.public_seed);
        let prompt_digest = sha256_bytes(prompt.as_bytes());
        let generation = generate_candidate(&identity, &prompt, timeout).await?;
        let response_digest = sha256_bytes(generation.raw_response.as_bytes());
        let response_chars = generation.raw_response.chars().count() as u64;
        let files = parse_candidate_files(&generation.raw_response)?;
        write_candidate_files(&workspace, &files)?;
        let (submission_digest, submission_bytes) = validate_submission(&workspace)?;

        let evaluator_started = Instant::now();
        let (evaluator_output, evaluator_timed_out) = command_output_with_timeout(
            isolated_command(&run_dir, EVALUATOR_SCRIPT)?,
            EVALUATOR_TIMEOUT,
            "evaluateur statique du candidat Ollama",
        )?;
        let evaluator_duration_ms = evaluator_started.elapsed().as_millis();
        let evaluator_stdout = decode_command_stdout(&evaluator_output.stdout).unwrap_or_default();
        let values = marker_values(&evaluator_stdout);
        if evaluator_timed_out
            || !evaluator_output.status.success()
            || values.get("evaluator_marker").map(String::as_str) != Some(EVALUATOR_MARKER)
            || values.get("submission_digest").map(String::as_str)
                != Some(submission_digest.as_str())
            || values.get("files_total").map(String::as_str) != Some("4")
            || values.get("checks_passed").map(String::as_str) != Some("7")
            || values.get("readonly_verified").map(String::as_str) != Some("true")
            || workspace.join(".outilsia-evaluator-write-test").exists()
        {
            return Err("L'evaluateur statique a refuse la soumission Ollama.".to_string());
        }
        let browser_evaluator = evaluate_visible_browser(&run_dir, &submission_digest)?;
        let reference_digest = request
            .reference_pilot_result
            .pointer("/integrity/digest")
            .and_then(Value::as_str)
            .ok_or_else(|| "Empreinte du pilote de reference absente.".to_string())?;
        Ok::<Value, String>(json!({
            "schema": RESULT_SCHEMA,
            "contract_version": CONTRACT_VERSION,
            "run_id": run_id,
            "benchmark": {"id": BENCHMARK_ID, "track": "local_model_visible_browser_candidate"},
            "batch_ref": {
                "batch_id": source.batch_id,
                "experiment_digest": source.experiment_digest,
                "protocol_digest": source.protocol_digest,
                "stack_key": source.stack_key,
                "public_seed_sha256": sha256_bytes(source.public_seed.to_string().as_bytes())
            },
            "reference_pilot_ref": {
                "pilot_id": request.reference_pilot_result.get("pilot_id").cloned().unwrap_or(Value::Null),
                "integrity_digest": reference_digest
            },
            "host_environment": if cfg!(target_os = "windows") { "windows" } else { "linux" },
            "selected_backend": backend,
            "candidate": {
                "candidate_id": identity.candidate_id,
                "adapter_kind": "ollama_local_visible_browser_v2",
                "model_ref": identity.model_ref,
                "runtime": identity.runtime,
                "environment": identity.environment,
                "model_invoked": true,
                "cli_agent_invoked": false
            },
            "consent": request.consent,
            "budget": request.budget,
            "generation": {
                "started": true,
                "succeeded": true,
                "timed_out": false,
                "attempts": 1,
                "duration_ms": generation.duration_ms,
                "prompt_sha256": prompt_digest,
                "response_sha256": response_digest,
                "response_chars": response_chars,
                "prompt_eval_count": generation.prompt_eval_count,
                "eval_count": generation.eval_count,
                "eval_duration_ms": generation.eval_duration_ms,
                "total_duration_ms": generation.total_duration_ms,
                "raw_response_returned": false,
                "raw_response_persisted": false
            },
            "submission": {
                "materialized": true,
                "exact_topology_verified": true,
                "files_total": EXPECTED_FILES.len(),
                "bytes_total": submission_bytes,
                "digest": submission_digest,
                "generated_code_executed": true
            },
            "evaluator": {
                "kind": EVALUATOR_KIND,
                "started": true,
                "succeeded": true,
                "timed_out": false,
                "duration_ms": evaluator_duration_ms,
                "independent_process": true,
                "workspace_read_only": true,
                "network_namespace_enforced": true,
                "hidden_suite_used": false,
                "visible_checks_total": 7,
                "visible_checks_passed": 7,
                "submission_digest": submission_digest
            },
            "browser_evaluator": browser_evaluator,
            "security": {
                "candidate_received_public_prompt_only": true,
                "candidate_filesystem_context_supplied": false,
                "candidate_tool_access": false,
                "external_network_requested": false,
                "loopback_ollama_requested": true,
                "source_repository_mounted": false,
                "hidden_suite_mounted": false,
                "credentials_read_by_outilsia": false,
                "raw_model_output_returned": false,
                "raw_model_output_persisted": false,
                "generated_code_executed": true,
                "evaluator_process_isolated": true,
                "temporary_workspace_removed": true,
                "paths_returned": false
            },
            "cost": {
                "api_cost_eur": 0,
                "api_status": "not_incurred",
                "local_energy_wh": Value::Null,
                "energy_status": "not_measured"
            },
            "readiness": {
                "candidate_generation_verified": true,
                "candidate_submission_structure_verified": true,
                "visible_browser_execution_verified": true,
                "gameplay_verified": true,
                "hidden_evaluator_verified": false,
                "scientific_eligible": false,
                "winner_declared": false,
                "blockers": REQUIRED_BLOCKERS
            }
        }))
    }
    .await;

    let cleanup_completed = fs::remove_dir_all(&run_dir).is_ok() && !run_dir.exists();
    let mut document = execution?;
    if !cleanup_completed {
        return Err(
            "Le workspace temporaire du candidat Ollama n'a pas pu etre supprime.".to_string(),
        );
    }
    sign_document(&mut document)?;
    validate_forgebench_ollama_candidate_result(&document)?;
    Ok(document)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn candidate_file_payload() -> String {
        let index = format!(
            "<!doctype html><html><head><link rel=\"stylesheet\" href=\"styles.css\"></head><body><main id=\"gameRoot\" data-forgebench=\"signal-maze-v1\" data-status=\"candidate\" data-state=\"playing\"><div id=\"signalMazeBoard\"></div><output id=\"gameStatus\"></output><button id=\"newGameBtn\">Nouvelle partie</button><button id=\"resetBtn\">Reinitialiser</button></main><script src=\"game.js\"></script></body></html>{}",
            " ".repeat(200)
        );
        let styles = format!("body{{display:grid}}{}", "a{color:red}".repeat(50));
        let game = format!(
            "globalThis.__SIGNAL_MAZE_CANDIDATE__={{benchmark:'signal-maze-v1',implementation_started:true}};globalThis.__SIGNAL_MAZE_VISIBLE_API__={{newGame,snapshot,applyPath,reset}};const snapshotSchema='signal-maze-visible-snapshot.v1';{}",
            "const cell = 1;\n".repeat(100)
        );
        serde_json::to_string(&json!({
            "index_html": index,
            "styles_css": styles,
            "game_js": game
        }))
        .unwrap()
    }

    pub(crate) fn signed_result() -> Value {
        let mut document = json!({
            "schema": RESULT_SCHEMA,
            "contract_version": CONTRACT_VERSION,
            "run_id": "fbo-test-ollama-candidate",
            "benchmark": {"id": BENCHMARK_ID, "track": "local_model_visible_browser_candidate"},
            "batch_ref": {
                "batch_id": "fbsb-test-batch",
                "experiment_digest": "a".repeat(64),
                "protocol_digest": "b".repeat(64),
                "stack_key": STACK_KEY,
                "public_seed_sha256": "c".repeat(64)
            },
            "reference_pilot_ref": {"pilot_id": "fbp-test", "integrity_digest": "d".repeat(64)},
            "host_environment": "linux",
            "selected_backend": "linux-bwrap-native",
            "candidate": {
                "candidate_id": "local-model:ollama_native:qwen3:8b",
                "adapter_kind": "ollama_local_visible_browser_v2",
                "model_ref": "qwen3:8b",
                "runtime": "native",
                "environment": "ollama_native",
                "model_invoked": true,
                "cli_agent_invoked": false
            },
            "consent": {
                "confirmed": true,
                "scope": CONSENT_SCOPE,
                "candidate_model_allowed": true,
                "external_network_access": false,
                "loopback_ollama_allowed": true,
                "paid_api_allowed": false,
                "hidden_suite_allowed": false,
                "generated_code_execution_allowed": true
            },
            "budget": {"max_duration_seconds": 300, "max_attempts": 1, "max_api_cost_eur": 0, "max_output_bytes": FIXED_OUTPUT_BUDGET_BYTES},
            "generation": {
                "started": true, "succeeded": true, "timed_out": false, "attempts": 1,
                "duration_ms": 1200, "prompt_sha256": "e".repeat(64), "response_sha256": "f".repeat(64),
                "response_chars": 5000, "prompt_eval_count": 900, "eval_count": 1200,
                "eval_duration_ms": 1000, "total_duration_ms": 1200,
                "raw_response_returned": false, "raw_response_persisted": false
            },
            "submission": {"materialized": true, "exact_topology_verified": true, "files_total": 4, "bytes_total": 10000, "digest": "1".repeat(64), "generated_code_executed": true},
            "evaluator": {"kind": EVALUATOR_KIND, "started": true, "succeeded": true, "timed_out": false, "duration_ms": 15, "independent_process": true, "workspace_read_only": true, "network_namespace_enforced": true, "hidden_suite_used": false, "visible_checks_total": 7, "visible_checks_passed": 7, "submission_digest": "1".repeat(64)},
            "browser_evaluator": crate::forgebench_browser::test_visible_browser_evidence(&"1".repeat(64)),
            "security": {"candidate_received_public_prompt_only": true, "candidate_filesystem_context_supplied": false, "candidate_tool_access": false, "external_network_requested": false, "loopback_ollama_requested": true, "source_repository_mounted": false, "hidden_suite_mounted": false, "credentials_read_by_outilsia": false, "raw_model_output_returned": false, "raw_model_output_persisted": false, "generated_code_executed": true, "evaluator_process_isolated": true, "temporary_workspace_removed": true, "paths_returned": false},
            "cost": {"api_cost_eur": 0, "api_status": "not_incurred", "local_energy_wh": Value::Null, "energy_status": "not_measured"},
            "readiness": {"candidate_generation_verified": true, "candidate_submission_structure_verified": true, "visible_browser_execution_verified": true, "gameplay_verified": true, "hidden_evaluator_verified": false, "scientific_eligible": false, "winner_declared": false, "blockers": REQUIRED_BLOCKERS}
        });
        sign_document(&mut document).unwrap();
        document
    }

    #[test]
    fn candidate_payload_is_strict_and_offline() {
        let payload = candidate_file_payload();
        assert!(parse_candidate_files(&payload).is_ok());
        let mut extra = serde_json::from_str::<Value>(&payload).unwrap();
        extra["workspace_path"] = json!("/secret");
        assert!(parse_candidate_files(&extra.to_string()).is_err());
        let mut networked = serde_json::from_str::<Value>(&payload).unwrap();
        networked["game_js"] = json!(format!(
            "{}\nfetch('https://example.com')",
            networked["game_js"].as_str().unwrap()
        ));
        assert!(parse_candidate_files(&networked.to_string()).is_err());
        let mut contract_missing = serde_json::from_str::<Value>(&payload).unwrap();
        contract_missing["game_js"] = json!(contract_missing["game_js"]
            .as_str()
            .unwrap()
            .replace("__SIGNAL_MAZE_VISIBLE_API__", "__MISSING_VISIBLE_API__"));
        assert!(parse_candidate_files(&contract_missing.to_string()).is_err());
    }

    #[test]
    fn wsl_candidate_runtime_is_never_relabelled_as_native_on_linux() {
        assert!(candidate_runtime_supported("native"));
        assert_eq!(
            candidate_runtime_supported("wsl"),
            cfg!(target_os = "windows")
        );
        assert!(!candidate_runtime_supported("unknown"));
    }

    #[test]
    fn rehashing_cannot_forge_scientific_or_execution_claims() {
        let document = signed_result();
        validate_forgebench_ollama_candidate_result(&document).unwrap();
        for pointer in [
            "/readiness/hidden_evaluator_verified",
            "/readiness/scientific_eligible",
            "/readiness/winner_declared",
        ] {
            let mut forged = document.clone();
            *forged.pointer_mut(pointer).unwrap() = json!(true);
            sign_document(&mut forged).unwrap();
            assert!(validate_forgebench_ollama_candidate_result(&forged).is_err());
        }
        for pointer in [
            "/readiness/visible_browser_execution_verified",
            "/readiness/gameplay_verified",
            "/submission/generated_code_executed",
            "/security/generated_code_executed",
        ] {
            let mut forged = document.clone();
            *forged.pointer_mut(pointer).unwrap() = json!(false);
            sign_document(&mut forged).unwrap();
            assert!(validate_forgebench_ollama_candidate_result(&forged).is_err());
        }
    }

    #[test]
    fn result_rejects_rehashed_raw_output_or_paths() {
        let mut forged = signed_result();
        forged["raw_model_output"] = json!("secret");
        sign_document(&mut forged).unwrap();
        assert!(validate_forgebench_ollama_candidate_result(&forged).is_err());
    }

    #[test]
    fn prompt_and_evaluator_do_not_receive_hidden_material() {
        let prompt = candidate_prompt(17011);
        assert!(prompt.contains("MISSION PUBLIQUE"));
        assert!(prompt.contains("outilsia.forgebench_visible_gameplay_contract.v1"));
        assert!(prompt.contains("candidate_execution_enabled_by_this_contract\": false"));
        assert!(!prompt.contains("forgebench-hidden-suite"));
        assert!(EVALUATOR_SCRIPT.contains("--unshare-all"));
        assert!(EVALUATOR_SCRIPT.contains("--ro-bind \"$PWD/workspace\" /submission"));
        assert!(!EVALUATOR_SCRIPT.contains("hidden-suite"));
    }
}
