use crate::forgebench_runner::isolated_command;
use crate::forgebench_vault::HiddenSuiteMaterial;
use crate::{command_output_with_timeout, decode_command_stdout};
use getrandom::fill;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const EVALUATOR_MARKER: &str = "forgebench-hidden-browser-evaluator-ok";
const EVALUATOR_KIND: &str = "chromium_hidden_holdout_gate_v1";
const CONTROLLER_KIND: &str = "trusted_local_holdout_controller_v1";
const EVALUATOR_TIMEOUT: Duration = Duration::from_secs(55);
const PRIVATE_CHECKS_TOTAL: u64 = 5;
const VIEWPORTS_TOTAL: u64 = 3;
const VISIBLE_GAMEPLAY_CONTRACT: &str =
    include_str!("../../forgebench/signal-maze-v1/visible-contract.json");

const PRELUDE_SCRIPT: &str = r#"globalThis.__FORGEBENCH_PAGE_ERRORS__=[];globalThis.addEventListener('error',event=>globalThis.__FORGEBENCH_PAGE_ERRORS__.push(String(event.error||event.message||'page_error')));globalThis.addEventListener('unhandledrejection',event=>globalThis.__FORGEBENCH_PAGE_ERRORS__.push(String(event.reason||'unhandled_rejection')));"#;

const HIDDEN_CONTROLLER_TEMPLATE: &str = r###"(() => {
  "use strict";
  const nonce = "__FORGEBENCH_NONCE__";
  const attestation = "__FORGEBENCH_ATTESTATION__";
  const contract = __FORGEBENCH_VISIBLE_CONTRACT__;
  const hiddenSeeds = __FORGEBENCH_HIDDEN_SEEDS__;
  const colors = contract.board.colors;
  const mode = new URL(location.href).searchParams.get("fb_hidden_viewport") || "desktop";
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const transform = (row, column, index) => [
    [row, column], [column, 8 - row], [8 - row, 8 - column], [8 - column, row],
    [row, 8 - column], [8 - column, 8 - row], [8 - row, column], [column, row]
  ][index];
  const cell = ([row, column], seed) => {
    const [nextRow, nextColumn] = transform(row, column, seed & 7);
    return { row: nextRow, column: nextColumn };
  };
  const colorForRole = (role, seed) => colors[(role + Math.floor(seed / 8) % colors.length) % colors.length];
  const pathForRole = (role, seed) => contract.base_layout.visible_solution_paths
    .find(entry => entry.role === role).cells.map(value => cell(value, seed));
  const fnv1a = (value) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0;
    return hash.toString(16).padStart(8, "0");
  };
  const expectedSignature = (seed) => {
    const transformIndex = seed & 7;
    const colorOffset = Math.floor(seed / 8) % colors.length;
    const cells = new Map();
    const key = (row, column) => `${row}:${column}`;
    for (const [row, column] of contract.base_layout.obstacles) {
      const [nextRow, nextColumn] = transform(row, column, transformIndex);
      cells.set(key(nextRow, nextColumn), ["obstacle", null]);
    }
    for (const endpoint of contract.base_layout.endpoints) {
      const color = colorForRole(endpoint.role, seed);
      for (const [kind, coordinates] of [["source", endpoint.source], ["receiver", endpoint.receiver]]) {
        const [nextRow, nextColumn] = transform(coordinates[0], coordinates[1], transformIndex);
        cells.set(key(nextRow, nextColumn), [kind, color]);
      }
    }
    const tokens = [];
    for (let row = 0; row < 9; row += 1) for (let column = 0; column < 9; column += 1) {
      const [kind, color] = cells.get(key(row, column)) || ["empty", null];
      tokens.push(kind === "obstacle" ? "#" : kind === "source" ? `s:${color}` : kind === "receiver" ? `r:${color}` : ".");
    }
    return fnv1a(`signal-maze-v1|${seed}|${transformIndex}|${colorOffset}|${tokens.join(",")}`);
  };
  const expectRejected = (api, color, cells, reason) => {
    const before = api.snapshot();
    const outcome = api.applyPath(color, cells);
    assert(outcome && outcome.accepted === false && outcome.reason === reason, `reason_${reason}`);
    assert(same(outcome.snapshot, before) && same(api.snapshot(), before), `mutation_${reason}`);
  };
  const boundaryCheck = api => {
    const signatures = new Set();
    for (const seed of [0, 0xffffffff, ...hiddenSeeds]) {
      const first = api.newGame(seed);
      const second = api.newGame(seed);
      assert(same(first, second), "seed_nondeterministic");
      assert(first.seed === seed && first.seed_u32 === seed && first.board_signature === expectedSignature(seed), "seed_boundary_signature");
      signatures.add(first.board_signature);
    }
    assert(signatures.size === hiddenSeeds.length + 2, "hidden_seed_collision");
    for (const invalid of [-1, 0x100000000, 1.5, "1", null]) {
      let rejected = false;
      try { api.newGame(invalid); } catch (_) { rejected = true; }
      assert(rejected, "invalid_seed_accepted");
    }
  };
  const collisionCheck = api => {
    const seed = hiddenSeeds[Math.min(2, hiddenSeeds.length - 1)];
    api.newGame(seed);
    const firstColor = colorForRole(0, seed);
    const secondColor = colorForRole(1, seed);
    assert(api.applyPath(firstColor, pathForRole(0, seed)).accepted === true, "collision_setup");
    const collisionBase = [[4,1],[4,0],[3,0],[2,0],[1,0],[0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[4,7]];
    expectRejected(api, secondColor, collisionBase.map(value => cell(value, seed)), "path_collision");
  };
  const resetCheck = api => {
    const seed = hiddenSeeds[Math.min(1, hiddenSeeds.length - 1)];
    const initial = api.newGame(seed);
    const color = colorForRole(0, seed);
    assert(api.applyPath(color, pathForRole(0, seed)).accepted === true, "reset_setup");
    const reset = api.reset();
    assert(same(reset, initial) && same(api.snapshot(), initial), "reset_state");
    reset.cells[0].kind = "tampered";
    reset.paths[colors[0]].push({ row: 99, column: 99 });
    assert(!same(reset, api.snapshot()), "reset_not_detached");
  };
  const invalidInputCheck = api => {
    const seed = hiddenSeeds[0];
    api.newGame(seed);
    const color = colorForRole(1, seed);
    const otherColor = colorForRole(0, seed);
    const valid = pathForRole(1, seed);
    expectRejected(api, color, [], "path_too_short");
    expectRejected(api, color, [valid[0], { row: 1.5, column: 1 }, valid[valid.length - 1]], "invalid_cell");
    expectRejected(api, color, [valid[0], { row: -1, column: 0 }, valid[valid.length - 1]], "out_of_bounds");
    expectRejected(api, color, [valid[0], valid[1], valid[1], ...valid.slice(2)], "repeated_cell");
    expectRejected(api, color, [valid[0], cell([0,0], seed), ...valid.slice(2)], "non_contiguous");
    expectRejected(api, color, pathForRole(0, seed), "endpoint_mismatch");
    const obstacleBase = [[4,1],[3,1],[3,2],[4,2],[4,3],[4,4],[4,5],[4,6],[4,7]];
    expectRejected(api, color, obstacleBase.map(value => cell(value, seed)), "obstacle_collision");
    const endpointBase = [[4,1],[3,1],[2,1],[1,1],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[4,7]];
    expectRejected(api, color, endpointBase.map(value => cell(value, seed)), "endpoint_collision");
    assert(otherColor !== color, "color_roles_collapsed");
  };
  const mobileCheck = async api => {
    const seed = hiddenSeeds[hiddenSeeds.length - 1];
    api.newGame(seed);
    const color = colorForRole(2, seed);
    assert(api.applyPath(color, pathForRole(2, seed)).accepted === true, "mobile_setup");
    const before = api.snapshot();
    // Headless --dump-dom may throttle requestAnimationFrame in mobile-sized
    // background pages. A bounded timer still lets layout and microtasks settle.
    await new Promise(resolve => setTimeout(resolve, 40));
    const after = api.snapshot();
    const board = document.querySelector("#signalMazeBoard")?.getBoundingClientRect();
    assert(same(before, after), "viewport_state_changed");
    assert(board && Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) <= innerWidth + 2, "mobile_horizontal_overflow");
    assert(board.left >= -1 && board.right <= innerWidth + 1 && board.top >= -1, "mobile_board_clipped");
    if (mode === "android-landscape") assert(board.bottom <= innerHeight + 1, "mobile_landscape_clipped");
  };
  const run = async () => {
    try {
      const api = globalThis.__SIGNAL_MAZE_VISIBLE_API__;
      assert(api && same(Object.keys(api).sort(), ["applyPath", "newGame", "reset", "snapshot"]), "api_contract");
      let checks = 0;
      if (mode === "desktop") {
        boundaryCheck(api); checks += 1;
        collisionCheck(api); checks += 1;
        resetCheck(api); checks += 1;
        invalidInputCheck(api); checks += 1;
      } else {
        await mobileCheck(api); checks += 1;
      }
      await new Promise(resolve => setTimeout(resolve, 30));
      assert((globalThis.__FORGEBENCH_PAGE_ERRORS__ || []).length === 0, "page_error");
      document.documentElement.setAttribute("data-forgebench-hidden-result", `${nonce}:ok:${checks}:${attestation}`);
    } catch (error) {
      document.documentElement.setAttribute("data-forgebench-hidden-result", `${nonce}:fail`);
      document.documentElement.setAttribute("data-forgebench-hidden-error", String(error?.message || error).slice(0, 80));
    }
  };
  setTimeout(run, 0);
})();
"###;

const HIDDEN_BROWSER_SCRIPT: &str = r#"
set -eu
if ! command -v bwrap >/dev/null 2>&1; then
  printf '%s\n' 'hidden_error=bubblewrap_missing' >&2
  exit 72
fi
browser_host=''
browser_origin=''
for candidate in /usr/lib/chromium/chromium /usr/lib/chromium-browser/chromium-browser /opt/google/chrome/chrome /opt/google/chrome/google-chrome; do
  if [ -x "$candidate" ]; then browser_host="$candidate"; browser_origin='system'; break; fi
done
if [ -z "$browser_host" ] && [ -n "${HOME:-}" ]; then
  for candidate in "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux*/headless_shell; do
    if [ -x "$candidate" ]; then browser_host="$candidate"; browser_origin='playwright_cache'; break; fi
  done
fi
if [ -z "$browser_host" ]; then
  printf '%s\n' 'hidden_error=chromium_runtime_missing' >&2
  exit 73
fi
browser_host="$(readlink -f "$browser_host")"
browser_guest="$browser_host"
set -- --die-with-parent --new-session --unshare-all --clearenv
set -- "$@" --ro-bind /usr /usr
if [ -e /lib ]; then set -- "$@" --ro-bind /lib /lib; fi
if [ -e /lib64 ]; then set -- "$@" --ro-bind /lib64 /lib64; fi
if [ -e /opt ] && [ "${browser_host#/opt/}" != "$browser_host" ]; then set -- "$@" --ro-bind /opt /opt; fi
case "$browser_origin" in
  playwright_cache)
    browser_root="$(dirname "$browser_host")"
    browser_guest="/browser/$(basename "$browser_host")"
    set -- "$@" --ro-bind "$browser_root" /browser
    ;;
esac
set -- "$@" --proc /proc --dev /dev --tmpfs /tmp --dir /etc
set -- "$@" --ro-bind "$PWD/workspace" /submission
set -- "$@" --bind "$PWD/hidden-evaluation" /evaluation --chdir /evaluation
set -- "$@" --setenv HOME /tmp --setenv XDG_RUNTIME_DIR /tmp --setenv PATH /usr/bin --setenv BROWSER_EXEC "$browser_guest"
bwrap "$@" -- /usr/bin/sh -c '
  set -eu
  # Chromium may create a profile file larger than the DOM output cap. Keep the
  # process bounded without applying the 4 MiB evidence limit to its internals.
  ulimit -f 131072
  ulimit -n 256
  ulimit -t 45
  test ! -e /etc/passwd
  test ! -e /home
  test ! -e /mnt
  test ! -e /root
  test "$(find /submission -mindepth 1 -maxdepth 1 -type f | wc -l)" -eq 4
  test "$(find /submission -mindepth 1 -maxdepth 1 ! -type f | wc -l)" -eq 0
  mkdir -p /evaluation/browser
  cp /submission/index.html /evaluation/browser/index.html
  cp /submission/styles.css /evaluation/browser/styles.css
  cp /submission/game.js /evaluation/browser/game.js
  cp /evaluation/forgebench-hidden-prelude.js /evaluation/browser/forgebench-hidden-prelude.js
  cp /evaluation/forgebench-hidden-controller.js /evaluation/browser/forgebench-hidden-controller.js
  original_index=/evaluation/browser/index.html
  {
    printf "%s\n" "<script src=\"forgebench-hidden-prelude.js\"></script>"
    cat "$original_index"
    printf "%s\n" "<script src=\"forgebench-hidden-controller.js\"></script>"
  } > /evaluation/browser/index.instrumented.html
  mv /evaluation/browser/index.instrumented.html "$original_index"
  {
    for file in .outilsia-run-contract.json game.js index.html styles.css; do
      digest="$(sha256sum "/submission/$file" | cut -d " " -f 1)"
      printf "%s:%s\n" "$file" "$digest"
    done
  } | sha256sum | cut -d " " -f 1 > /evaluation/submission.sha256
  run_viewport() {
    label="$1"; width="$2"; height="$3"; expected="$4"
    profile="/tmp/hidden-profile-$label"
    dom="/evaluation/$label.dom"
    if ! "$BROWSER_EXEC" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
      --disable-background-networking --disable-component-update --disable-default-apps \
      --disable-domain-reliability --disable-extensions --disable-sync --metrics-recording-only \
      --no-first-run --no-default-browser-check --renderer-process-limit=2 \
      --disk-cache-size=1048576 --media-cache-size=1048576 \
      --js-flags=--max-old-space-size=256 --user-data-dir="$profile" \
      --allow-file-access-from-files --window-size="$width,$height" --force-device-scale-factor=1 \
      --virtual-time-budget=12000 --run-all-compositor-stages-before-draw --dump-dom \
      "file:///evaluation/browser/index.html?fb_hidden_viewport=$label" > "$dom" 2> "/tmp/$label.log"; then
      printf '%s\n' "hidden_error=browser_failed_$label" >&2
      tail -c 1200 "/tmp/$label.log" >&2 || true
      exit 93
    fi
    test "$(wc -c < "$dom")" -le 4194304
    nonce="$(cat /evaluation/controller-nonce)"
    token="$(cat /evaluation/attestation-token)"
    grep -Fq "data-forgebench-hidden-result=\"$nonce:ok:$expected:$token\"" "$dom"
  }
  run_viewport desktop 1440 900 4
  run_viewport android-portrait 390 844 1
  run_viewport android-landscape 844 390 1
  if printf "%s" forbidden > /submission/.outilsia-hidden-write-test 2>/dev/null; then exit 92; fi
  test ! -e /submission/.outilsia-hidden-write-test
'
printf '%s\n' 'hidden_marker=forgebench-hidden-browser-evaluator-ok'
printf '%s\n' 'browser_family=chromium'
printf '%s\n' "browser_origin=$browser_origin"
printf '%s\n' "submission_digest=$(cat hidden-evaluation/submission.sha256)"
printf '%s\n' 'viewports_total=3'
printf '%s\n' "hidden_seeds_total=$(cat hidden-evaluation/hidden-seeds-total)"
printf '%s\n' 'private_checks_total=5'
printf '%s\n' 'private_checks_passed=5'
printf '%s\n' 'readonly_verified=true'
printf '%s\n' "attestation_digest=$(sha256sum hidden-evaluation/attestation-token | cut -d ' ' -f 1)"
"#;

struct HiddenEvaluationGuard(PathBuf);

impl Drop for HiddenEvaluationGuard {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn sha256_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn random_hex(label: &str) -> Result<String, String> {
    let mut bytes = [0_u8; 16];
    fill(&mut bytes).map_err(|error| format!("Entropie {label} indisponible: {error}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn marker_values(output: &str) -> BTreeMap<String, String> {
    output
        .lines()
        .filter_map(|line| line.trim().split_once('='))
        .map(|(key, value)| (key.to_string(), value.trim().to_string()))
        .collect()
}

fn write_private_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    fs::write(path, contents)
        .map_err(|error| format!("Ecriture du holdout ForgeBench impossible: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("Permissions du holdout ForgeBench impossibles: {error}"))?;
    }
    Ok(())
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn exact_keys(value: &Value, expected: &[&str]) -> Result<(), String> {
    let actual = value
        .as_object()
        .ok_or_else(|| "Preuve holdout absente.".to_string())?
        .keys()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    if actual != expected.iter().copied().collect::<BTreeSet<_>>() {
        return Err("Champs de preuve holdout inattendus.".to_string());
    }
    Ok(())
}

fn run_failure(output: &std::process::Output, timed_out: bool) -> String {
    if timed_out {
        return "L'evaluateur holdout ForgeBench a depasse son timeout.".to_string();
    }
    let stderr = decode_command_stdout(&output.stderr).unwrap_or_default();
    if stderr.contains("chromium_runtime_missing") {
        return "Chromium headless manque dans Linux/WSL pour le holdout ForgeBench.".to_string();
    }
    if stderr.contains("bubblewrap_missing") {
        return "Bubblewrap manque dans Linux/WSL. Le holdout ne sera pas execute sans isolation."
            .to_string();
    }
    let detail = stderr
        .split_whitespace()
        .take(24)
        .collect::<Vec<_>>()
        .join(" ");
    if detail.is_empty() {
        "L'evaluateur holdout ForgeBench a refuse la soumission.".to_string()
    } else {
        format!("L'evaluateur holdout ForgeBench a refuse la soumission: {detail}")
    }
}

pub(crate) fn evaluate_hidden_browser(
    run_dir: &Path,
    submission_digest: &str,
    suite: &HiddenSuiteMaterial,
) -> Result<Value, String> {
    if !is_sha256(submission_digest)
        || !is_sha256(&suite.suite_digest)
        || !is_sha256(&suite.receipt_digest)
        || suite.hidden_seeds.len() < 3
        || suite.private_checks_total != PRIVATE_CHECKS_TOTAL as usize
    {
        return Err("Materiel holdout ForgeBench invalide.".to_string());
    }
    let evaluation = run_dir.join("hidden-evaluation");
    if evaluation.exists() {
        return Err("Le dossier holdout ForgeBench doit etre neuf.".to_string());
    }
    fs::create_dir(&evaluation)
        .map_err(|error| format!("Creation du holdout ForgeBench impossible: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&evaluation, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("Permissions du holdout ForgeBench impossibles: {error}"))?;
    }
    let _cleanup = HiddenEvaluationGuard(evaluation.clone());
    let nonce = random_hex("du controleur holdout")?;
    let attestation_token = random_hex("de l'attestation holdout")?;
    let attestation_digest = sha256_bytes(attestation_token.as_bytes());
    let seeds = serde_json::to_string(&suite.hidden_seeds)
        .map_err(|error| format!("Seeds holdout non serialisables: {error}"))?;
    let controller = HIDDEN_CONTROLLER_TEMPLATE
        .replace("__FORGEBENCH_NONCE__", &nonce)
        .replace("__FORGEBENCH_ATTESTATION__", &attestation_token)
        .replace("__FORGEBENCH_VISIBLE_CONTRACT__", VISIBLE_GAMEPLAY_CONTRACT)
        .replace("__FORGEBENCH_HIDDEN_SEEDS__", &seeds);
    write_private_file(&evaluation.join("controller-nonce"), nonce.as_bytes())?;
    write_private_file(
        &evaluation.join("attestation-token"),
        attestation_token.as_bytes(),
    )?;
    write_private_file(
        &evaluation.join("hidden-seeds-total"),
        suite.hidden_seeds.len().to_string().as_bytes(),
    )?;
    write_private_file(
        &evaluation.join("forgebench-hidden-prelude.js"),
        PRELUDE_SCRIPT.as_bytes(),
    )?;
    write_private_file(
        &evaluation.join("forgebench-hidden-controller.js"),
        controller.as_bytes(),
    )?;

    let started = Instant::now();
    let (output, timed_out) = command_output_with_timeout(
        isolated_command(run_dir, HIDDEN_BROWSER_SCRIPT)?,
        EVALUATOR_TIMEOUT,
        "evaluateur holdout du candidat Ollama",
    )?;
    let duration_ms = started.elapsed().as_millis() as u64;
    let stdout = decode_command_stdout(&output.stdout).unwrap_or_default();
    let values = marker_values(&stdout);
    if timed_out
        || !output.status.success()
        || values.get("hidden_marker").map(String::as_str) != Some(EVALUATOR_MARKER)
        || values.get("browser_family").map(String::as_str) != Some("chromium")
        || !matches!(
            values.get("browser_origin").map(String::as_str),
            Some("system" | "playwright_cache")
        )
        || values.get("submission_digest").map(String::as_str) != Some(submission_digest)
        || values.get("viewports_total").map(String::as_str) != Some("3")
        || values
            .get("hidden_seeds_total")
            .and_then(|value| value.parse::<usize>().ok())
            != Some(suite.hidden_seeds.len())
        || values.get("private_checks_total").map(String::as_str) != Some("5")
        || values.get("private_checks_passed").map(String::as_str) != Some("5")
        || values.get("readonly_verified").map(String::as_str) != Some("true")
        || values.get("attestation_digest").map(String::as_str) != Some(attestation_digest.as_str())
        || run_dir
            .join("workspace/.outilsia-hidden-write-test")
            .exists()
    {
        return Err(run_failure(&output, timed_out));
    }
    let evidence = json!({
        "kind": EVALUATOR_KIND,
        "controller_kind": CONTROLLER_KIND,
        "browser_family": "chromium",
        "browser_origin": values.get("browser_origin").cloned().unwrap_or_default(),
        "started": true,
        "succeeded": true,
        "timed_out": false,
        "duration_ms": duration_ms,
        "independent_process": true,
        "workspace_read_only": true,
        "execution_copy_ephemeral": true,
        "network_namespace_enforced": true,
        "worker_generation_completed_before_suite_read": true,
        "vault_file_mounted": false,
        "runtime_seed_inputs_injected": true,
        "check_families_public_in_source": true,
        "vault_encrypted_at_rest": false,
        "same_user_process_isolation_enforced": false,
        "suite_id": suite.suite_id,
        "suite_digest": suite.suite_digest,
        "hidden_seeds_total": suite.hidden_seeds.len(),
        "private_checks_total": PRIVATE_CHECKS_TOTAL,
        "private_checks_passed": PRIVATE_CHECKS_TOTAL,
        "viewports_total": VIEWPORTS_TOTAL,
        "observations_returned": false,
        "screenshots_returned": false,
        "hidden_seeds_returned": false,
        "private_check_ids_returned": false,
        "paths_returned": false,
        "attestation_digest": attestation_digest,
        "submission_digest": submission_digest
    });
    validate_hidden_browser_evidence(&evidence, submission_digest, suite)?;
    Ok(evidence)
}

pub(crate) fn validate_hidden_browser_evidence(
    evidence: &Value,
    submission_digest: &str,
    suite: &HiddenSuiteMaterial,
) -> Result<(), String> {
    validate_hidden_browser_evidence_claim(evidence, submission_digest)?;
    if evidence.get("suite_id").and_then(Value::as_str) != Some(suite.suite_id.as_str())
        || evidence.get("suite_digest").and_then(Value::as_str) != Some(suite.suite_digest.as_str())
        || evidence.get("hidden_seeds_total").and_then(Value::as_u64)
            != Some(suite.hidden_seeds.len() as u64)
        || evidence.get("private_checks_total").and_then(Value::as_u64)
            != Some(suite.private_checks_total as u64)
    {
        return Err("Preuve holdout et vault ForgeBench incoherents.".to_string());
    }
    Ok(())
}

pub(crate) fn validate_hidden_browser_evidence_claim(
    evidence: &Value,
    submission_digest: &str,
) -> Result<(), String> {
    exact_keys(
        evidence,
        &[
            "kind",
            "controller_kind",
            "browser_family",
            "browser_origin",
            "started",
            "succeeded",
            "timed_out",
            "duration_ms",
            "independent_process",
            "workspace_read_only",
            "execution_copy_ephemeral",
            "network_namespace_enforced",
            "worker_generation_completed_before_suite_read",
            "vault_file_mounted",
            "runtime_seed_inputs_injected",
            "check_families_public_in_source",
            "vault_encrypted_at_rest",
            "same_user_process_isolation_enforced",
            "suite_id",
            "suite_digest",
            "hidden_seeds_total",
            "private_checks_total",
            "private_checks_passed",
            "viewports_total",
            "observations_returned",
            "screenshots_returned",
            "hidden_seeds_returned",
            "private_check_ids_returned",
            "paths_returned",
            "attestation_digest",
            "submission_digest",
        ],
    )?;
    if evidence.get("kind").and_then(Value::as_str) != Some(EVALUATOR_KIND)
        || evidence.get("controller_kind").and_then(Value::as_str) != Some(CONTROLLER_KIND)
        || evidence.get("browser_family").and_then(Value::as_str) != Some("chromium")
        || !matches!(
            evidence.get("browser_origin").and_then(Value::as_str),
            Some("system" | "playwright_cache")
        )
        || evidence.get("started").and_then(Value::as_bool) != Some(true)
        || evidence.get("succeeded").and_then(Value::as_bool) != Some(true)
        || evidence.get("timed_out").and_then(Value::as_bool) != Some(false)
        || evidence
            .get("duration_ms")
            .and_then(Value::as_u64)
            .is_none_or(|value| value == 0 || value > EVALUATOR_TIMEOUT.as_millis() as u64 + 5_000)
        || evidence.get("independent_process").and_then(Value::as_bool) != Some(true)
        || evidence.get("workspace_read_only").and_then(Value::as_bool) != Some(true)
        || evidence
            .get("execution_copy_ephemeral")
            .and_then(Value::as_bool)
            != Some(true)
        || evidence
            .get("network_namespace_enforced")
            .and_then(Value::as_bool)
            != Some(true)
        || evidence
            .get("worker_generation_completed_before_suite_read")
            .and_then(Value::as_bool)
            != Some(true)
        || evidence.get("vault_file_mounted").and_then(Value::as_bool) != Some(false)
        || evidence
            .get("runtime_seed_inputs_injected")
            .and_then(Value::as_bool)
            != Some(true)
        || evidence
            .get("check_families_public_in_source")
            .and_then(Value::as_bool)
            != Some(true)
        || evidence
            .get("vault_encrypted_at_rest")
            .and_then(Value::as_bool)
            != Some(false)
        || evidence
            .get("same_user_process_isolation_enforced")
            .and_then(Value::as_bool)
            != Some(false)
        || evidence
            .get("suite_id")
            .and_then(Value::as_str)
            .is_none_or(|value| {
                !value.starts_with("hs-")
                    || value.len() > 64
                    || !value
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
            })
        || evidence
            .get("suite_digest")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        || evidence
            .get("hidden_seeds_total")
            .and_then(Value::as_u64)
            .is_none_or(|value| !(3..=16).contains(&value))
        || evidence.get("private_checks_total").and_then(Value::as_u64)
            != Some(PRIVATE_CHECKS_TOTAL)
        || evidence
            .get("private_checks_passed")
            .and_then(Value::as_u64)
            != Some(PRIVATE_CHECKS_TOTAL)
        || evidence.get("viewports_total").and_then(Value::as_u64) != Some(VIEWPORTS_TOTAL)
        || evidence
            .get("observations_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || evidence
            .get("screenshots_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || evidence
            .get("hidden_seeds_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || evidence
            .get("private_check_ids_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || evidence.get("paths_returned").and_then(Value::as_bool) != Some(false)
        || evidence
            .get("attestation_digest")
            .and_then(Value::as_str)
            .is_none_or(|value| !is_sha256(value))
        || evidence.get("submission_digest").and_then(Value::as_str) != Some(submission_digest)
    {
        return Err("Preuve holdout ForgeBench incoherente.".to_string());
    }
    Ok(())
}

#[cfg(test)]
pub(crate) fn test_hidden_browser_evidence(
    submission_digest: &str,
    suite: &HiddenSuiteMaterial,
) -> Value {
    json!({
        "kind": EVALUATOR_KIND,
        "controller_kind": CONTROLLER_KIND,
        "browser_family": "chromium",
        "browser_origin": "system",
        "started": true,
        "succeeded": true,
        "timed_out": false,
        "duration_ms": 1800,
        "independent_process": true,
        "workspace_read_only": true,
        "execution_copy_ephemeral": true,
        "network_namespace_enforced": true,
        "worker_generation_completed_before_suite_read": true,
        "vault_file_mounted": false,
        "runtime_seed_inputs_injected": true,
        "check_families_public_in_source": true,
        "vault_encrypted_at_rest": false,
        "same_user_process_isolation_enforced": false,
        "suite_id": suite.suite_id,
        "suite_digest": suite.suite_digest,
        "hidden_seeds_total": suite.hidden_seeds.len(),
        "private_checks_total": 5,
        "private_checks_passed": 5,
        "viewports_total": 3,
        "observations_returned": false,
        "screenshots_returned": false,
        "hidden_seeds_returned": false,
        "private_check_ids_returned": false,
        "paths_returned": false,
        "attestation_digest": "a".repeat(64),
        "submission_digest": submission_digest
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn suite() -> HiddenSuiteMaterial {
        HiddenSuiteMaterial {
            suite_id: "hs-test-hidden-suite".to_string(),
            suite_digest: "b".repeat(64),
            receipt_digest: "c".repeat(64),
            hidden_seeds: vec![100_001, 200_002, 300_003, 400_004, 500_005],
            private_checks_total: 5,
        }
    }

    #[test]
    fn hidden_contract_is_separate_offline_and_ephemeral() {
        assert!(HIDDEN_BROWSER_SCRIPT.contains("--unshare-all"));
        assert!(HIDDEN_BROWSER_SCRIPT.contains("--ro-bind \"$PWD/workspace\" /submission"));
        assert!(HIDDEN_BROWSER_SCRIPT.contains("hidden-evaluation"));
        assert!(HIDDEN_BROWSER_SCRIPT.contains("test ! -e /home"));
        assert!(!HIDDEN_BROWSER_SCRIPT.contains("--share-net"));
        assert!(!HIDDEN_BROWSER_SCRIPT.contains("forgebench-hidden-suite-v1.json"));
        assert!(HIDDEN_CONTROLLER_TEMPLATE.contains("path_collision"));
        assert!(HIDDEN_CONTROLLER_TEMPLATE.contains("mobile_landscape_clipped"));
    }

    #[test]
    fn hidden_evidence_returns_counts_and_digests_only() {
        let suite = suite();
        let evidence = test_hidden_browser_evidence(&"d".repeat(64), &suite);
        validate_hidden_browser_evidence(&evidence, &"d".repeat(64), &suite)
            .expect("valid hidden evidence");
        assert!(evidence.get("hidden_seeds").is_none());
        assert!(evidence.get("private_check_ids").is_none());
        assert!(evidence.get("observations").is_none());
    }

    #[test]
    fn hidden_evidence_rejects_science_overclaims() {
        let suite = suite();
        let mut forged = test_hidden_browser_evidence(&"d".repeat(64), &suite);
        forged["same_user_process_isolation_enforced"] = json!(true);
        assert!(validate_hidden_browser_evidence(&forged, &"d".repeat(64), &suite).is_err());
        let mut forged = test_hidden_browser_evidence(&"d".repeat(64), &suite);
        forged["private_checks_passed"] = json!(4);
        assert!(validate_hidden_browser_evidence(&forged, &"d".repeat(64), &suite).is_err());
    }
}
