use crate::forgebench_runner::isolated_command;
use crate::{command_output_with_timeout, decode_command_stdout};
use getrandom::fill;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const PREFLIGHT_MARKER: &str = "forgebench-visible-browser-preflight-ok";
const EVALUATOR_MARKER: &str = "forgebench-visible-browser-evaluator-ok";
const EVALUATOR_KIND: &str = "chromium_visible_gameplay_gate";
const CONTROLLER_KIND: &str = "trusted_public_contract_controller_v1";
const PREFLIGHT_TIMEOUT: Duration = Duration::from_secs(18);
const EVALUATOR_TIMEOUT: Duration = Duration::from_secs(55);
const CHECKS_PER_VIEWPORT: u64 = 13;
const MAX_SCREENSHOT_BYTES: u64 = 5 * 1024 * 1024;
const VIEWPORTS: [(&str, u32, u32); 3] = [
    ("desktop", 1440, 900),
    ("android-portrait", 390, 844),
    ("android-landscape", 844, 390),
];
const VISIBLE_GAMEPLAY_CONTRACT: &str =
    include_str!("../../forgebench/signal-maze-v1/visible-contract.json");

const PREFLIGHT_HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>ForgeBench browser preflight</title></head><body data-forgebench-browser-preflight="ready">ForgeBench browser preflight</body></html>"#;

const BROWSER_PREFLIGHT_SCRIPT: &str = r#"
set -eu
if ! command -v bwrap >/dev/null 2>&1; then
  printf '%s\n' 'browser_error=bubblewrap_missing' >&2
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
  printf '%s\n' 'browser_error=chromium_runtime_missing' >&2
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
set -- "$@" --bind "$PWD/evaluation" /evaluation --chdir /evaluation
set -- "$@" --setenv HOME /tmp --setenv XDG_RUNTIME_DIR /tmp --setenv PATH /usr/bin --setenv BROWSER_EXEC "$browser_guest"
bwrap "$@" -- /usr/bin/sh -c '
  set -eu
  test ! -e /etc/passwd
  test ! -e /home
  test ! -e /mnt
  "$BROWSER_EXEC" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --disable-background-networking --disable-component-update --disable-default-apps \
    --disable-domain-reliability --disable-extensions --disable-sync --metrics-recording-only \
    --no-first-run --no-default-browser-check --user-data-dir=/tmp/browser-preflight \
    --virtual-time-budget=1500 --dump-dom file:///evaluation/browser-preflight.html \
    > /evaluation/browser-preflight.dom 2> /tmp/browser-preflight.log
  test "$(wc -c < /evaluation/browser-preflight.dom)" -le 65536
  grep -Fq "data-forgebench-browser-preflight=\"ready\"" /evaluation/browser-preflight.dom
'
printf '%s\n' 'browser_marker=forgebench-visible-browser-preflight-ok'
printf '%s\n' 'browser_family=chromium'
printf '%s\n' "browser_origin=$browser_origin"
"#;

const BROWSER_EVALUATOR_SCRIPT: &str = r#"
set -eu
if ! command -v bwrap >/dev/null 2>&1; then
  printf '%s\n' 'browser_error=bubblewrap_missing' >&2
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
  printf '%s\n' 'browser_error=chromium_runtime_missing' >&2
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
set -- "$@" --bind "$PWD/evaluation" /evaluation --chdir /evaluation
set -- "$@" --setenv HOME /tmp --setenv XDG_RUNTIME_DIR /tmp --setenv PATH /usr/bin --setenv BROWSER_EXEC "$browser_guest"
bwrap "$@" -- /usr/bin/sh -c '
  set -eu
  ulimit -f 16384
  ulimit -n 256
  ulimit -t 45
  test ! -e /etc/passwd
  test ! -e /home
  test ! -e /mnt
  test "$(find /submission -mindepth 1 -maxdepth 1 -type f | wc -l)" -eq 4
  test "$(find /submission -mindepth 1 -maxdepth 1 ! -type f | wc -l)" -eq 0
  mkdir -p /evaluation/browser
  cp /submission/index.html /evaluation/browser/index.html
  cp /submission/styles.css /evaluation/browser/styles.css
  cp /submission/game.js /evaluation/browser/game.js
  cp /evaluation/forgebench-prelude.js /evaluation/browser/forgebench-prelude.js
  cp /evaluation/forgebench-controller.js /evaluation/browser/forgebench-controller.js
  original_index=/evaluation/browser/index.html
  {
    printf "%s\n" "<script src=\"forgebench-prelude.js\"></script>"
    cat "$original_index"
    printf "%s\n" "<script src=\"forgebench-controller.js\"></script>"
  } > /evaluation/browser/index.instrumented.html
  mv /evaluation/browser/index.instrumented.html "$original_index"
  {
    for file in .outilsia-run-contract.json game.js index.html styles.css; do
      digest="$(sha256sum "/submission/$file" | cut -d " " -f 1)"
      printf "%s:%s\n" "$file" "$digest"
    done
  } | sha256sum | cut -d " " -f 1 > /evaluation/browser-submission.sha256
  run_viewport() {
    label="$1"; width="$2"; height="$3"
    profile="/tmp/browser-profile-$label"
    dom="/evaluation/$label.dom"
    screenshot="/evaluation/$label.png"
    "$BROWSER_EXEC" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
      --disable-background-networking --disable-component-update --disable-default-apps \
      --disable-domain-reliability --disable-extensions --disable-sync --metrics-recording-only \
      --no-first-run --no-default-browser-check --renderer-process-limit=2 \
      --js-flags=--max-old-space-size=256 --user-data-dir="$profile" \
      --allow-file-access-from-files --window-size="$width,$height" --force-device-scale-factor=1 \
      --virtual-time-budget=12000 --run-all-compositor-stages-before-draw \
      --screenshot="$screenshot" --dump-dom \
      "file:///evaluation/browser/index.html?fb_viewport=$label" > "$dom" 2> "/tmp/$label.log"
    test "$(wc -c < "$dom")" -le 4194304
    nonce="$(cat /evaluation/controller-nonce)"
    grep -Fq "data-forgebench-result=\"$nonce:ok:13\"" "$dom"
    test -s "$screenshot"
  }
  run_viewport desktop 1440 900
  run_viewport android-portrait 390 844
  run_viewport android-landscape 844 390
  if printf "%s" forbidden > /submission/.outilsia-browser-write-test 2>/dev/null; then exit 92; fi
  test ! -e /submission/.outilsia-browser-write-test
'
printf '%s\n' 'browser_marker=forgebench-visible-browser-evaluator-ok'
printf '%s\n' 'browser_family=chromium'
printf '%s\n' "browser_origin=$browser_origin"
printf '%s\n' "submission_digest=$(cat evaluation/browser-submission.sha256)"
printf '%s\n' 'viewports_total=3'
printf '%s\n' 'seeds_total=3'
printf '%s\n' 'input_modes_total=3'
printf '%s\n' 'checks_per_viewport=13'
printf '%s\n' 'screenshots_total=3'
printf '%s\n' 'readonly_verified=true'
"#;

const PRELUDE_SCRIPT: &str = r#"globalThis.__FORGEBENCH_PAGE_ERRORS__=[];globalThis.addEventListener('error',event=>globalThis.__FORGEBENCH_PAGE_ERRORS__.push(String(event.error||event.message||'page_error')));globalThis.addEventListener('unhandledrejection',event=>globalThis.__FORGEBENCH_PAGE_ERRORS__.push(String(event.reason||'unhandled_rejection')));"#;

const CONTROLLER_TEMPLATE: &str = r###"(() => {
  "use strict";
  const nonce = "__FORGEBENCH_NONCE__";
  const contract = __FORGEBENCH_VISIBLE_CONTRACT__;
  const seeds = contract.visible_recipe.default_seeds;
  const colors = contract.board.colors;
  let checks = 0;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const pass = () => { checks += 1; };
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const transform = (row, column, index) => [
    [row, column], [column, 8 - row], [8 - row, 8 - column], [8 - column, row],
    [row, 8 - column], [8 - column, 8 - row], [8 - row, column], [column, row]
  ][index];
  const colorForRole = (role, seed) => colors[(role + Math.floor(seed / 8) % colors.length) % colors.length];
  const visiblePaths = (seed) => contract.base_layout.visible_solution_paths.map(entry => ({
    color: colorForRole(entry.role, seed),
    cells: entry.cells.map(([row, column]) => {
      const [nextRow, nextColumn] = transform(row, column, seed & 7);
      return { row: nextRow, column: nextColumn };
    })
  }));
  const fnv1a = (value) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0;
    return hash.toString(16).padStart(8, "0");
  };
  const expectedInitial = (seed) => {
    const index = seed & 7;
    const colorOffset = Math.floor(seed / 8) % colors.length;
    const cells = new Map();
    const key = (row, column) => `${row}:${column}`;
    for (const [row, column] of contract.base_layout.obstacles) {
      const [nextRow, nextColumn] = transform(row, column, index);
      cells.set(key(nextRow, nextColumn), ["obstacle", null]);
    }
    for (const endpoint of contract.base_layout.endpoints) {
      const color = colorForRole(endpoint.role, seed);
      for (const [kind, coordinates] of [["source", endpoint.source], ["receiver", endpoint.receiver]]) {
        const [nextRow, nextColumn] = transform(coordinates[0], coordinates[1], index);
        cells.set(key(nextRow, nextColumn), [kind, color]);
      }
    }
    const tokens = [];
    for (let row = 0; row < 9; row += 1) for (let column = 0; column < 9; column += 1) {
      const [kind, color] = cells.get(key(row, column)) || ["empty", null];
      tokens.push(kind === "obstacle" ? "#" : kind === "source" ? `s:${color}` : kind === "receiver" ? `r:${color}` : ".");
    }
    return { signature: fnv1a(`signal-maze-v1|${seed}|${index}|${colorOffset}|${tokens.join(",")}`), cells };
  };
  const validateSnapshot = (snapshot, seed, initial = false) => {
    assert(snapshot && typeof snapshot === "object", "snapshot_absent");
    assert(same(Object.keys(snapshot).sort(), [...contract.snapshot.exact_fields].sort()), "snapshot_fields");
    assert(snapshot.schema === contract.snapshot.schema && snapshot.contract_version === contract.contract_version, "snapshot_contract");
    assert(snapshot.seed === seed && snapshot.seed_u32 === seed && snapshot.rows === 9 && snapshot.columns === 9, "snapshot_identity");
    assert(snapshot.pairs_total === 3 && same(snapshot.colors, colors) && snapshot.cells.length === 81, "snapshot_topology");
    const expected = expectedInitial(seed);
    assert(snapshot.board_signature === expected.signature, "snapshot_signature");
    snapshot.cells.forEach((cell, index) => {
      assert(same(Object.keys(cell).sort(), ["row", "column", "kind", "color", "path_color"].sort()), "cell_fields");
      assert(cell.row === Math.floor(index / 9) && cell.column === index % 9, "cell_order");
      if (initial) {
        const [kind, color] = expected.cells.get(`${cell.row}:${cell.column}`) || ["empty", null];
        assert(cell.kind === kind && cell.color === color && cell.path_color === null, "initial_cell");
      }
    });
  };
  const cellElement = (cell) => document.querySelector(`[data-row="${cell.row}"][data-column="${cell.column}"]`);
  const point = (cell) => {
    const target = cellElement(cell);
    assert(target, "cell_missing");
    const box = target.getBoundingClientRect();
    return { target, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
  };
  const drawPointer = (api, seed, entry, pointerType, pointerId) => {
    api.newGame(seed);
    const board = document.querySelector("#signalMazeBoard");
    const first = point(entry.cells[0]);
    first.target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId, pointerType, isPrimary: true, buttons: 1, clientX: first.clientX, clientY: first.clientY }));
    for (const cell of entry.cells.slice(1)) {
      const next = point(cell);
      board.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, pointerId, pointerType, isPrimary: true, buttons: 1, clientX: next.clientX, clientY: next.clientY }));
    }
    const last = point(entry.cells[entry.cells.length - 1]);
    board.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId, pointerType, isPrimary: true, buttons: 0, clientX: last.clientX, clientY: last.clientY }));
    const snapshot = api.snapshot();
    assert(snapshot.connected_pairs === 1 && snapshot.paths[entry.color]?.length > 1, `${pointerType}_input`);
  };
  const drawKeyboard = (api, seed, entry) => {
    api.newGame(seed);
    const first = cellElement(entry.cells[0]);
    first.focus();
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    for (let index = 1; index < entry.cells.length; index += 1) {
      const previous = entry.cells[index - 1];
      const current = entry.cells[index];
      const key = ({ "-1:0": "ArrowUp", "1:0": "ArrowDown", "0:-1": "ArrowLeft", "0:1": "ArrowRight" })[`${current.row - previous.row}:${current.column - previous.column}`];
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
    document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    const snapshot = api.snapshot();
    assert(snapshot.connected_pairs === 1 && snapshot.paths[entry.color]?.length > 1, "keyboard_input");
  };
  const run = async () => {
    try {
      const api = globalThis.__SIGNAL_MAZE_VISIBLE_API__;
      assert(api && same(Object.keys(api).sort(), ["applyPath", "newGame", "reset", "snapshot"]), "api_contract"); pass();
      assert(document.querySelectorAll("#signalMazeBoard [data-cell]").length === 81, "dom_cells"); pass();
      const signatures = new Set();
      for (const seed of seeds) {
        const first = api.newGame(seed);
        const second = api.newGame(seed);
        assert(same(first, second), "seed_nondeterministic");
        validateSnapshot(first, seed, true);
        signatures.add(first.board_signature);
      }
      assert(signatures.size === seeds.length, "seed_signatures"); pass();
      let invalidRejected = false;
      try { api.newGame(-1); } catch (_) { invalidRejected = true; }
      assert(invalidRejected, "invalid_seed_accepted"); pass();
      api.newGame(seeds[0]);
      const before = api.snapshot();
      const rejected = api.applyPath("unknown", []);
      assert(rejected.accepted === false && rejected.reason === "unknown_color" && same(before, api.snapshot()), "rejection_mutated"); pass();
      for (const seed of seeds) {
        api.newGame(seed);
        for (const entry of visiblePaths(seed)) {
          const result = api.applyPath(entry.color, entry.cells);
          assert(result.accepted === true && result.reason === "accepted", "visible_path_rejected");
        }
        const solved = api.snapshot();
        assert(solved.won === true && solved.connected_pairs === 3 && document.querySelector("#gameRoot")?.dataset.state === "won", "win_state");
      }
      pass();
      const resetSeed = seeds[1];
      const initial = api.newGame(resetSeed);
      api.applyPath(visiblePaths(resetSeed)[0].color, visiblePaths(resetSeed)[0].cells);
      assert(same(api.reset(), initial), "api_reset"); pass();
      const detached = api.snapshot();
      detached.cells[0].kind = "tampered";
      detached.paths[colors[0]].push({ row: 99, column: 99 });
      const fresh = api.snapshot();
      assert(fresh.cells[0].kind !== "tampered" && !fresh.paths[colors[0]].some(cell => cell.row === 99), "snapshot_attached"); pass();
      const seedInput = document.querySelector("#seedInput");
      if (seedInput) seedInput.value = String(seeds[1]);
      document.querySelector("#newGameBtn").click();
      validateSnapshot(api.snapshot(), seedInput ? seeds[1] : api.snapshot().seed, true); pass();
      api.applyPath(visiblePaths(api.snapshot().seed)[0].color, visiblePaths(api.snapshot().seed)[0].cells);
      document.querySelector("#resetBtn").click();
      assert(api.snapshot().connected_pairs === 0, "button_reset"); pass();
      const paths = visiblePaths(seeds[0]);
      drawPointer(api, seeds[0], paths[0], "mouse", 41);
      drawKeyboard(api, seeds[0], paths[1]);
      drawPointer(api, seeds[0], paths[2], "touch", 77); pass();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const board = document.querySelector("#signalMazeBoard").getBoundingClientRect();
      assert(Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) <= innerWidth + 2, "horizontal_overflow");
      assert(board.left >= -1 && board.right <= innerWidth + 1 && board.top >= -1, "board_clipped");
      if (new URL(location.href).searchParams.get("fb_viewport") === "android-landscape") assert(board.bottom <= innerHeight + 1, "landscape_clipped"); pass();
      await new Promise(resolve => setTimeout(resolve, 30));
      assert((globalThis.__FORGEBENCH_PAGE_ERRORS__ || []).length === 0, "page_error"); pass();
      assert(checks === 13, "check_count");
      document.documentElement.setAttribute("data-forgebench-result", `${nonce}:ok:${checks}`);
    } catch (error) {
      document.documentElement.setAttribute("data-forgebench-result", `${nonce}:fail`);
      document.documentElement.setAttribute("data-forgebench-error", String(error?.message || error).slice(0, 80));
    }
  };
  setTimeout(run, 0);
})();
"###;

fn marker_values(output: &str) -> BTreeMap<String, String> {
    output
        .lines()
        .filter_map(|line| line.trim().split_once('='))
        .map(|(key, value)| (key.to_string(), value.trim().to_string()))
        .collect()
}

fn write_private_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    fs::write(path, contents)
        .map_err(|error| format!("Ecriture de la preuve navigateur impossible: {error}"))
}

fn run_failure(label: &str, output: &std::process::Output, timed_out: bool) -> String {
    if timed_out {
        return format!("{label} interrompu par le timeout.");
    }
    let stderr = decode_command_stdout(&output.stderr).unwrap_or_default();
    if stderr.contains("chromium_runtime_missing") {
        return "Chromium headless manque dans Linux/WSL. Installe Chromium dans ce runtime avant d'executer le code ForgeBench.".to_string();
    }
    if stderr.contains("bubblewrap_missing") {
        return "Bubblewrap manque dans Linux/WSL. Le code candidat ne sera pas execute sans isolation validee.".to_string();
    }
    let detail = stderr
        .split_whitespace()
        .take(24)
        .collect::<Vec<_>>()
        .join(" ");
    if detail.is_empty() {
        format!("{label} a refuse le navigateur isole.")
    } else {
        format!("{label} a refuse le navigateur isole: {detail}")
    }
}

pub(crate) fn preflight_visible_browser(run_dir: &Path) -> Result<Value, String> {
    let evaluation = run_dir.join("evaluation");
    write_private_file(
        &evaluation.join("browser-preflight.html"),
        PREFLIGHT_HTML.as_bytes(),
    )?;
    let started = Instant::now();
    let (output, timed_out) = command_output_with_timeout(
        isolated_command(run_dir, BROWSER_PREFLIGHT_SCRIPT)?,
        PREFLIGHT_TIMEOUT,
        "preflight du navigateur ForgeBench",
    )?;
    let duration_ms = started.elapsed().as_millis() as u64;
    let stdout = decode_command_stdout(&output.stdout).unwrap_or_default();
    let values = marker_values(&stdout);
    if timed_out
        || !output.status.success()
        || values.get("browser_marker").map(String::as_str) != Some(PREFLIGHT_MARKER)
        || values.get("browser_family").map(String::as_str) != Some("chromium")
        || !matches!(
            values.get("browser_origin").map(String::as_str),
            Some("system" | "playwright_cache")
        )
    {
        return Err(run_failure("Le preflight ForgeBench", &output, timed_out));
    }
    Ok(json!({
        "browser_family": "chromium",
        "browser_origin": values.get("browser_origin").cloned().unwrap_or_default(),
        "duration_ms": duration_ms,
        "network_namespace_enforced": true
    }))
}

fn random_nonce() -> Result<String, String> {
    let mut bytes = [0_u8; 16];
    fill(&mut bytes)
        .map_err(|error| format!("Entropie du controleur navigateur indisponible: {error}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn sha256_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn screenshot_evidence(
    path: PathBuf,
    label: &str,
    width: u32,
    height: u32,
) -> Result<Value, String> {
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("Capture ForgeBench absente: {error}"))?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() < 128
        || metadata.len() > MAX_SCREENSHOT_BYTES
    {
        return Err("Capture ForgeBench hors limites.".to_string());
    }
    let bytes =
        fs::read(&path).map_err(|error| format!("Capture ForgeBench illisible: {error}"))?;
    if bytes.len() < 24 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("Capture ForgeBench non PNG.".to_string());
    }
    let actual_width = u32::from_be_bytes(bytes[16..20].try_into().unwrap_or_default());
    let actual_height = u32::from_be_bytes(bytes[20..24].try_into().unwrap_or_default());
    if actual_width != width || actual_height != height {
        return Err("Dimensions de capture ForgeBench incoherentes.".to_string());
    }
    Ok(json!({
        "label": label,
        "width": width,
        "height": height,
        "bytes": bytes.len(),
        "sha256": sha256_bytes(&bytes)
    }))
}

pub(crate) fn evaluate_visible_browser(
    run_dir: &Path,
    submission_digest: &str,
) -> Result<Value, String> {
    let evaluation = run_dir.join("evaluation");
    let nonce = random_nonce()?;
    let controller = CONTROLLER_TEMPLATE
        .replace("__FORGEBENCH_NONCE__", &nonce)
        .replace("__FORGEBENCH_VISIBLE_CONTRACT__", VISIBLE_GAMEPLAY_CONTRACT);
    write_private_file(&evaluation.join("controller-nonce"), nonce.as_bytes())?;
    write_private_file(
        &evaluation.join("forgebench-prelude.js"),
        PRELUDE_SCRIPT.as_bytes(),
    )?;
    write_private_file(
        &evaluation.join("forgebench-controller.js"),
        controller.as_bytes(),
    )?;
    let started = Instant::now();
    let (output, timed_out) = command_output_with_timeout(
        isolated_command(run_dir, BROWSER_EVALUATOR_SCRIPT)?,
        EVALUATOR_TIMEOUT,
        "evaluateur navigateur du candidat Ollama",
    )?;
    let duration_ms = started.elapsed().as_millis() as u64;
    let stdout = decode_command_stdout(&output.stdout).unwrap_or_default();
    let values = marker_values(&stdout);
    if timed_out
        || !output.status.success()
        || values.get("browser_marker").map(String::as_str) != Some(EVALUATOR_MARKER)
        || values.get("browser_family").map(String::as_str) != Some("chromium")
        || !matches!(
            values.get("browser_origin").map(String::as_str),
            Some("system" | "playwright_cache")
        )
        || values.get("submission_digest").map(String::as_str) != Some(submission_digest)
        || values.get("viewports_total").map(String::as_str) != Some("3")
        || values.get("seeds_total").map(String::as_str) != Some("3")
        || values.get("input_modes_total").map(String::as_str) != Some("3")
        || values.get("checks_per_viewport").map(String::as_str) != Some("13")
        || values.get("screenshots_total").map(String::as_str) != Some("3")
        || values.get("readonly_verified").map(String::as_str) != Some("true")
        || run_dir
            .join("workspace/.outilsia-browser-write-test")
            .exists()
    {
        return Err(run_failure(
            "L'evaluateur navigateur ForgeBench",
            &output,
            timed_out,
        ));
    }
    let captures = VIEWPORTS
        .iter()
        .map(|(label, width, height)| {
            screenshot_evidence(
                evaluation.join(format!("{label}.png")),
                label,
                *width,
                *height,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
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
        "hidden_suite_used": false,
        "public_contract_only": true,
        "seeds_total": 3,
        "viewports_total": 3,
        "input_modes": ["keyboard", "mouse", "touch"],
        "checks_total": CHECKS_PER_VIEWPORT * VIEWPORTS.len() as u64,
        "checks_passed": CHECKS_PER_VIEWPORT * VIEWPORTS.len() as u64,
        "screenshots": captures,
        "submission_digest": submission_digest
    });
    validate_visible_browser_evidence(&evidence, submission_digest)?;
    Ok(evidence)
}

fn exact_keys(value: &Value, expected: &[&str]) -> Result<(), String> {
    let actual = value
        .as_object()
        .ok_or_else(|| "Preuve navigateur absente.".to_string())?
        .keys()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    if actual != expected.iter().copied().collect::<BTreeSet<_>>() {
        return Err("Champs de preuve navigateur inattendus.".to_string());
    }
    Ok(())
}

pub(crate) fn validate_visible_browser_evidence(
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
            "hidden_suite_used",
            "public_contract_only",
            "seeds_total",
            "viewports_total",
            "input_modes",
            "checks_total",
            "checks_passed",
            "screenshots",
            "submission_digest",
        ],
    )?;
    let input_modes = evidence
        .get("input_modes")
        .and_then(Value::as_array)
        .ok_or_else(|| "Modes d'entree navigateur absents.".to_string())?;
    let screenshots = evidence
        .get("screenshots")
        .and_then(Value::as_array)
        .ok_or_else(|| "Captures navigateur absentes.".to_string())?;
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
        || evidence.get("hidden_suite_used").and_then(Value::as_bool) != Some(false)
        || evidence
            .get("public_contract_only")
            .and_then(Value::as_bool)
            != Some(true)
        || evidence.get("seeds_total").and_then(Value::as_u64) != Some(3)
        || evidence.get("viewports_total").and_then(Value::as_u64) != Some(3)
        || input_modes != &vec![json!("keyboard"), json!("mouse"), json!("touch")]
        || evidence.get("checks_total").and_then(Value::as_u64) != Some(39)
        || evidence.get("checks_passed").and_then(Value::as_u64) != Some(39)
        || evidence.get("submission_digest").and_then(Value::as_str) != Some(submission_digest)
        || screenshots.len() != VIEWPORTS.len()
    {
        return Err("Preuve navigateur ForgeBench incoherente.".to_string());
    }
    for (index, (label, width, height)) in VIEWPORTS.iter().enumerate() {
        let screenshot = &screenshots[index];
        exact_keys(screenshot, &["label", "width", "height", "bytes", "sha256"])?;
        if screenshot.get("label").and_then(Value::as_str) != Some(*label)
            || screenshot.get("width").and_then(Value::as_u64) != Some(*width as u64)
            || screenshot.get("height").and_then(Value::as_u64) != Some(*height as u64)
            || screenshot
                .get("bytes")
                .and_then(Value::as_u64)
                .is_none_or(|value| !(128..=MAX_SCREENSHOT_BYTES).contains(&value))
            || screenshot
                .get("sha256")
                .and_then(Value::as_str)
                .is_none_or(|value| {
                    value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit())
                })
        {
            return Err("Capture navigateur ForgeBench incoherente.".to_string());
        }
    }
    Ok(())
}

#[cfg(test)]
pub(crate) fn test_visible_browser_evidence(submission_digest: &str) -> Value {
    json!({
        "kind": EVALUATOR_KIND,
        "controller_kind": CONTROLLER_KIND,
        "browser_family": "chromium",
        "browser_origin": "system",
        "started": true,
        "succeeded": true,
        "timed_out": false,
        "duration_ms": 1200,
        "independent_process": true,
        "workspace_read_only": true,
        "execution_copy_ephemeral": true,
        "network_namespace_enforced": true,
        "hidden_suite_used": false,
        "public_contract_only": true,
        "seeds_total": 3,
        "viewports_total": 3,
        "input_modes": ["keyboard", "mouse", "touch"],
        "checks_total": 39,
        "checks_passed": 39,
        "screenshots": [
            {"label": "desktop", "width": 1440, "height": 900, "bytes": 4096, "sha256": "1".repeat(64)},
            {"label": "android-portrait", "width": 390, "height": 844, "bytes": 4096, "sha256": "2".repeat(64)},
            {"label": "android-landscape", "width": 844, "height": 390, "bytes": 4096, "sha256": "3".repeat(64)}
        ],
        "submission_digest": submission_digest
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn evidence() -> Value {
        test_visible_browser_evidence(&"a".repeat(64))
    }

    #[test]
    fn browser_contract_keeps_the_host_and_hidden_suite_outside() {
        assert!(BROWSER_EVALUATOR_SCRIPT.contains("--unshare-all"));
        assert!(BROWSER_EVALUATOR_SCRIPT.contains("--ro-bind \"$PWD/workspace\" /submission"));
        assert!(BROWSER_EVALUATOR_SCRIPT.contains("test ! -e /home"));
        assert!(!BROWSER_EVALUATOR_SCRIPT.contains("--share-net"));
        assert!(!BROWSER_EVALUATOR_SCRIPT.contains("hidden-suite"));
        assert!(BROWSER_EVALUATOR_SCRIPT.contains("android-landscape 844 390"));
    }

    #[test]
    fn controller_is_public_bounded_and_nonce_scoped() {
        let controller = CONTROLLER_TEMPLATE
            .replace("__FORGEBENCH_NONCE__", "f".repeat(32).as_str())
            .replace("__FORGEBENCH_VISIBLE_CONTRACT__", "{}");
        assert!(controller.contains("data-forgebench-result"));
        assert!(controller.contains("keyboard_input"));
        assert!(controller.contains("touch"));
        assert!(!controller.contains("hidden"));
    }

    #[test]
    fn validates_bounded_visible_browser_evidence() {
        validate_visible_browser_evidence(&evidence(), &"a".repeat(64)).expect("valid evidence");
    }

    #[test]
    fn rejects_a_forged_hidden_or_partial_browser_claim() {
        let mut value = evidence();
        value["hidden_suite_used"] = json!(true);
        assert!(validate_visible_browser_evidence(&value, &"a".repeat(64)).is_err());
        let mut value = evidence();
        value["checks_passed"] = json!(38);
        assert!(validate_visible_browser_evidence(&value, &"a".repeat(64)).is_err());
    }
}
