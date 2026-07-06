#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const repoRootReal = realpathSync(repoRoot);
const reportsRoot = join(repoRoot, "reports");
const releasePath = join(repoRoot, "server-work", "static", "downloads", "local-cockpit", "release.json");
const linuxKitManifest = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/LINUX-BUILD-MANIFEST.txt";
const linuxKitRunbook = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/LINUX-RELEASE-RUNBOOK.md";
const linuxKitMission = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/LINUX-RELEASE-MISSION.html";
const linuxKitStartHere = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/LINUX-START-HERE.html";
const linuxKitCenter = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/CENTRE-RELEASE-LINUX.html";
const linuxNextActionMd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/PROCHAINE-ACTION-LINUX.md";
const linuxNextActionHtml = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/PROCHAINE-ACTION-LINUX.html";
const linuxNextActionCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/OUVRIR-PROCHAINE-ACTION-LINUX.cmd";
const linuxCiStatusJson = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/CI-STATUS.json";
const linuxCiStatusMd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/CI-STATUS.md";
const linuxKitSelfCheckCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/VERIFIER-KIT-LINUX.cmd";
const linuxKitSelfCheckPs = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/VERIFIER-KIT-LINUX-WINDOWS.ps1";
const linuxKitSelfCheckJson = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/LINUX-KIT-SELF-CHECK.json";
const linuxKitSelfCheckMd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/LINUX-KIT-SELF-CHECK.md";
const linuxKitSelfCheckHtml = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/LINUX-KIT-SELF-CHECK.html";
const linuxTerrainGateJson = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/LINUX-TERRAIN-GATE.json";
const linuxTerrainGateMd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/LINUX-TERRAIN-GATE.md";
const linuxTerrainGateHtml = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/LINUX-TERRAIN-GATE.html";
const linuxTerrainGateCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/OUVRIR-GATE-TERRAIN-LINUX.cmd";
const linuxUnblockChecklistJson = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/LINUX-UNBLOCK-CHECKLIST.json";
const linuxUnblockChecklistMd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/LINUX-UNBLOCK-CHECKLIST.md";
const linuxUnblockChecklistHtml = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/LINUX-UNBLOCK-CHECKLIST.html";
const linuxUnblockChecklistCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/OUVRIR-DEBLOCAGE-LINUX.cmd";
const linuxActionsUrl = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/GITHUB-ACTIONS-URL.txt";
const linuxActionsUrlExample = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/GITHUB-ACTIONS-URL.example.txt";
const linuxConfigureActionsUrlCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/CONFIGURER-GITHUB-ACTIONS-URL.cmd";
const linuxImportCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/IMPORTER-LINUX-ARTEFACT.cmd";
const linuxVerifyCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/VERIFIER-LINUX-RELEASE.cmd";
const linuxStartCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/OUVRIR-START-HERE-LINUX.cmd";
const linuxCenterCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/OUVRIR-CENTRE-RELEASE-LINUX.cmd";
const linuxMissionCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/OUVRIR-MISSION-LINUX.cmd";
const linuxActionsCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/OUVRIR-GITHUB-ACTIONS.cmd";
const linuxWorkflowCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/OUVRIR-WORKFLOW-LINUX.cmd";
const crossWorkflowCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd";
const linuxWslInstallCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/INSTALLER-WSL.cmd";
const linuxWslPreflightCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/VERIFIER-WSL-LINUX.cmd";
const linuxWslPrepareCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/PREPARER-WSL-LINUX.cmd";

function run(command, args = [], options = {}) {
  return spawnSync(command, args, { cwd: options.cwd || appRoot, encoding: "utf8", shell: false });
}

function commandExists(command) {
  const result = run("bash", ["-lc", `command -v ${command} >/dev/null 2>&1`], { cwd: repoRoot });
  return result.status === 0;
}

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseManifest(path) {
  const data = {};
  if (!existsSync(path)) return data;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    data[key.trim()] = rest.join("=").trim();
  }
  return data;
}

const preflight = run("bash", ["scripts/preflight-linux.sh"]);
const sudo = run("sudo", ["-n", "true"], { cwd: repoRoot });
const releasePathCheck = run("npm", ["run", "verify:linux:path"]);
const release = readJson(releasePath) || {};
const linuxFiles = (release.files || []).filter((file) => file.platform === "linux");
const latestReadinessReport = existsSync(reportsRoot)
  ? readdirSync(reportsRoot)
    .filter((name) => name.startsWith("local_cockpit_linux_readiness_") && name.endsWith(".json"))
    .sort()
    .at(-1) || ""
  : "";

const route = {
  schema: "outilsia.local_cockpit_linux_routes.v1",
  version: readJson(join(appRoot, "src-tauri", "tauri.conf.json"))?.version || "",
  public_linux_release: linuxFiles.length > 0,
  public_linux_files: linuxFiles.map((file) => ({ name: file.name, sha256: file.sha256, size_bytes: file.size_bytes })),
  local_native: {
    ready: preflight.status === 0,
    preflight_exit_code: preflight.status,
    missing: `${preflight.stdout || ""}${preflight.stderr || ""}`
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith("missing:")),
    sudo_non_interactive: sudo.status === 0,
  },
  container: {
    docker_available: commandExists("docker"),
    podman_available: commandExists("podman"),
  },
  github_actions: {
    gh_available: commandExists("gh"),
    linux_workflow: existsSync(join(repoRoot, ".github", "workflows", "local-cockpit-linux-beta.yml")),
    cross_platform_workflow: existsSync(join(repoRoot, ".github", "workflows", "local-cockpit-cross-platform-beta.yml")),
    path_verified: releasePathCheck.status === 0,
  },
  build_kit: {
    manifest_exists: existsSync(linuxKitManifest),
    manifest: linuxKitManifest,
    runbook_exists: existsSync(linuxKitRunbook),
    runbook: linuxKitRunbook,
    mission_exists: existsSync(linuxKitMission),
    mission: linuxKitMission,
    start_here_exists: existsSync(linuxKitStartHere),
    start_here: linuxKitStartHere,
    center_exists: existsSync(linuxKitCenter),
    center: linuxKitCenter,
    next_action_md_exists: existsSync(linuxNextActionMd),
    next_action_html_exists: existsSync(linuxNextActionHtml),
    next_action_cmd_exists: existsSync(linuxNextActionCmd),
    ci_status_json_exists: existsSync(linuxCiStatusJson),
    ci_status_md_exists: existsSync(linuxCiStatusMd),
    self_check_cmd_exists: existsSync(linuxKitSelfCheckCmd),
    self_check_ps_exists: existsSync(linuxKitSelfCheckPs),
    self_check_json_exists: existsSync(linuxKitSelfCheckJson),
    self_check_md_exists: existsSync(linuxKitSelfCheckMd),
    self_check_html_exists: existsSync(linuxKitSelfCheckHtml),
    terrain_gate_json_exists: existsSync(linuxTerrainGateJson),
    terrain_gate_md_exists: existsSync(linuxTerrainGateMd),
    terrain_gate_html_exists: existsSync(linuxTerrainGateHtml),
    terrain_gate_cmd_exists: existsSync(linuxTerrainGateCmd),
    unblock_checklist_json_exists: existsSync(linuxUnblockChecklistJson),
    unblock_checklist_md_exists: existsSync(linuxUnblockChecklistMd),
    unblock_checklist_html_exists: existsSync(linuxUnblockChecklistHtml),
    unblock_checklist_cmd_exists: existsSync(linuxUnblockChecklistCmd),
    actions_url_exists: existsSync(linuxActionsUrl),
    actions_url_example_exists: existsSync(linuxActionsUrlExample),
    configure_actions_url_cmd_exists: existsSync(linuxConfigureActionsUrlCmd),
    start_cmd_exists: existsSync(linuxStartCmd),
    center_cmd_exists: existsSync(linuxCenterCmd),
    actions_cmd_exists: existsSync(linuxActionsCmd),
    linux_workflow_cmd_exists: existsSync(linuxWorkflowCmd),
    cross_workflow_cmd_exists: existsSync(crossWorkflowCmd),
    wsl_install_cmd_exists: existsSync(linuxWslInstallCmd),
    wsl_preflight_cmd_exists: existsSync(linuxWslPreflightCmd),
    wsl_prepare_cmd_exists: existsSync(linuxWslPrepareCmd),
    import_cmd_exists: existsSync(linuxImportCmd),
    verify_cmd_exists: existsSync(linuxVerifyCmd),
    mission_cmd_exists: existsSync(linuxMissionCmd),
  },
  latest_readiness_report: latestReadinessReport,
};

const viableRoutes = [];
if (route.public_linux_release) viableRoutes.push("public_release");
if (route.local_native.ready) viableRoutes.push("local_native");
if (route.container.docker_available || route.container.podman_available) viableRoutes.push("container");
if (route.github_actions.linux_workflow && route.github_actions.cross_platform_workflow && route.github_actions.path_verified) {
  viableRoutes.push("github_actions");
}
if (route.build_kit.manifest_exists) viableRoutes.push("build_kit");

if (!route.github_actions.path_verified) {
  console.error("linux route verification failed: CI/import path is not verified");
  console.error(`${releasePathCheck.stdout || ""}${releasePathCheck.stderr || ""}`.trim());
  process.exit(1);
}
if (!route.build_kit.manifest_exists) {
  console.error(`linux route verification failed: missing build kit manifest ${linuxKitManifest}`);
  process.exit(1);
}
const kitManifest = parseManifest(linuxKitManifest);
if (kitManifest.archive_source_root !== repoRoot && kitManifest.archive_source_root !== repoRootReal) {
  console.error(`linux route verification failed: archive_source_root mismatch: expected ${repoRoot} or ${repoRootReal}, got ${kitManifest.archive_source_root || "missing"}`);
  process.exit(1);
}
if (kitManifest.wsl_repo_root_linux !== "/home/chris/outilsia") {
  console.error(`linux route verification failed: wsl_repo_root_linux mismatch: expected /home/chris/outilsia, got ${kitManifest.wsl_repo_root_linux || "missing"}`);
  process.exit(1);
}
if (!kitManifest.archive || !existsSync(kitManifest.archive)) {
  console.error(`linux route verification failed: manifest archive missing: ${kitManifest.archive || "missing"}`);
  process.exit(1);
}
if (String(statSync(kitManifest.archive).size) !== String(kitManifest.archive_bytes || "")) {
  console.error("linux route verification failed: manifest archive_bytes mismatch");
  process.exit(1);
}
if (sha256(kitManifest.archive) !== kitManifest.archive_sha256) {
  console.error("linux route verification failed: manifest archive_sha256 mismatch");
  process.exit(1);
}
if (!route.build_kit.runbook_exists) {
  console.error(`linux route verification failed: missing Linux release runbook ${linuxKitRunbook}`);
  process.exit(1);
}
if (!route.build_kit.mission_exists) {
  console.error(`linux route verification failed: missing Linux release mission ${linuxKitMission}`);
  process.exit(1);
}
if (!route.build_kit.start_here_exists) {
  console.error(`linux route verification failed: missing Linux start-here page ${linuxKitStartHere}`);
  process.exit(1);
}
if (!route.build_kit.center_exists) {
  console.error(`linux route verification failed: missing Linux release center ${linuxKitCenter}`);
  process.exit(1);
}
if (!route.build_kit.next_action_md_exists || !route.build_kit.next_action_html_exists || !route.build_kit.next_action_cmd_exists) {
  console.error("linux route verification failed: missing Linux next-action files");
  process.exit(1);
}
if (!route.build_kit.ci_status_json_exists || !route.build_kit.ci_status_md_exists) {
  console.error("linux route verification failed: missing CI status files");
  process.exit(1);
}
if (!route.build_kit.self_check_cmd_exists || !route.build_kit.self_check_ps_exists) {
  console.error("linux route verification failed: missing Linux kit self-check helpers");
  process.exit(1);
}
if (!route.build_kit.self_check_json_exists || !route.build_kit.self_check_md_exists || !route.build_kit.self_check_html_exists) {
  console.error("linux route verification failed: missing Linux kit self-check reports");
  process.exit(1);
}
if (!route.build_kit.terrain_gate_json_exists || !route.build_kit.terrain_gate_md_exists || !route.build_kit.terrain_gate_html_exists || !route.build_kit.terrain_gate_cmd_exists) {
  console.error("linux route verification failed: missing Linux terrain gate files");
  process.exit(1);
}
if (!route.build_kit.unblock_checklist_json_exists || !route.build_kit.unblock_checklist_md_exists || !route.build_kit.unblock_checklist_html_exists || !route.build_kit.unblock_checklist_cmd_exists) {
  console.error("linux route verification failed: missing Linux unblock checklist files");
  process.exit(1);
}
if (!route.build_kit.import_cmd_exists || !route.build_kit.verify_cmd_exists || !route.build_kit.mission_cmd_exists || !route.build_kit.actions_cmd_exists || !route.build_kit.linux_workflow_cmd_exists || !route.build_kit.cross_workflow_cmd_exists || !route.build_kit.start_cmd_exists || !route.build_kit.center_cmd_exists || !route.build_kit.configure_actions_url_cmd_exists || !route.build_kit.wsl_install_cmd_exists || !route.build_kit.wsl_preflight_cmd_exists || !route.build_kit.wsl_prepare_cmd_exists) {
  console.error("linux route verification failed: missing Windows helper command(s)");
  process.exit(1);
}
if (!route.build_kit.actions_url_exists) {
  console.error(`linux route verification failed: missing GitHub Actions URL file ${linuxActionsUrl}`);
  process.exit(1);
}
if (!route.build_kit.actions_url_example_exists) {
  console.error(`linux route verification failed: missing GitHub Actions URL example ${linuxActionsUrlExample}`);
  process.exit(1);
}
const helperText = [linuxImportCmd, linuxVerifyCmd].map((path) => readFileSync(path, "utf8")).join("\n");
const helperAndWslText = [
  linuxImportCmd,
  linuxVerifyCmd,
  linuxWslInstallCmd,
  linuxWslPreflightCmd,
  linuxWslPrepareCmd,
].map((path) => existsSync(path) ? readFileSync(path, "utf8") : "").join("\n");
if (helperAndWslText.includes("\\home\\chris\\projects\\outilsia")) {
  console.error("linux route verification failed: helper cmd still points to stale /home/chris/projects/outilsia path");
  process.exit(1);
}
if (!helperAndWslText.includes("\\home\\chris\\outilsia") || !helperAndWslText.includes("/home/chris/outilsia")) {
  console.error("linux route verification failed: helper cmd does not point to current /home/chris/outilsia path");
  process.exit(1);
}
for (const artifactName of [
  "outilsia-local-cockpit-linux-web-release",
  "local-cockpit-linux-web-release",
  "local-cockpit-cross-platform-web-release",
]) {
  if (!helperText.includes(artifactName)) {
    console.error(`linux route verification failed: import helper missing artifact name ${artifactName}`);
    process.exit(1);
  }
}
const missionText = readFileSync(linuxKitMission, "utf8");
for (const needle of ["Mission release Linux", "GitHub Actions", "OUVRIR-GITHUB-ACTIONS.cmd", "IMPORTER-LINUX-ARTEFACT.cmd", "verify:linux:artifacts", "CI-STATUS.md"]) {
  if (!missionText.includes(needle)) {
    console.error(`linux route verification failed: mission html missing ${needle}`);
    process.exit(1);
  }
}
const startHereText = readFileSync(linuxKitStartHere, "utf8");
for (const needle of ["Demarrer release Linux OutilsIA", "OUVRIR-GITHUB-ACTIONS.cmd", "CONFIGURER-GITHUB-ACTIONS-URL.cmd", "IMPORTER-LINUX-ARTEFACT.cmd", "VERIFIER-LINUX-RELEASE.cmd", "windows-x64", "linux"]) {
  if (!startHereText.includes(needle)) {
    console.error(`linux route verification failed: start-here html missing ${needle}`);
    process.exit(1);
  }
}
const centerText = readFileSync(linuxKitCenter, "utf8");
for (const needle of ["Centre release Linux OutilsIA", "Public Linux absent", "Local Cockpit Cross Platform Beta", "IMPORTER-LINUX-ARTEFACT.cmd", "VERIFIER-LINUX-RELEASE.cmd", "CI-STATUS.md", "windows-x64", "linux"]) {
  if (!centerText.includes(needle)) {
    console.error(`linux route verification failed: center html missing ${needle}`);
    process.exit(1);
  }
}
const nextActionText = `${readFileSync(linuxNextActionMd, "utf8")}\n${readFileSync(linuxNextActionHtml, "utf8")}\n${readFileSync(linuxNextActionCmd, "utf8")}`;
for (const needle of ["Prochaine action Linux OutilsIA", "Gate terrain", "LINUX-TERRAIN-GATE.html", "Publication Linux autorisée maintenant", "OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd", "IMPORTER-LINUX-ARTEFACT.cmd", "VERIFIER-LINUX-RELEASE.cmd", "windows-x64", "linux", "release.json"]) {
  if (!nextActionText.includes(needle)) {
    console.error(`linux route verification failed: next-action missing ${needle}`);
    process.exit(1);
  }
}
const ciStatus = readJson(linuxCiStatusJson) || {};
const ciStatusMdText = readFileSync(linuxCiStatusMd, "utf8");
for (const needle of ["statut CI Linux", "Runs publics", "Artefacts publics", "Prochaine action"]) {
  if (!ciStatusMdText.includes(needle)) {
    console.error(`linux route verification failed: CI status md missing ${needle}`);
    process.exit(1);
  }
}
if (ciStatus.schema !== "outilsia.local_cockpit_linux_ci_status.v1" || !ciStatus.github_actions_url || !ciStatus.status) {
  console.error("linux route verification failed: CI status json incomplete");
  process.exit(1);
}
const linuxWorkflowText = readFileSync(linuxWorkflowCmd, "utf8");
const crossWorkflowText = readFileSync(crossWorkflowCmd, "utf8");
for (const [label, text, workflow] of [
  ["linux", linuxWorkflowText, "local-cockpit-linux-beta.yml"],
  ["cross-platform", crossWorkflowText, "local-cockpit-cross-platform-beta.yml"],
]) {
  if (!text.includes("github.com") || !text.includes("/actions/workflows/") || !text.includes(workflow) || !text.includes("start")) {
    console.error(`linux route verification failed: ${label} workflow helper incomplete`);
    process.exit(1);
  }
}
const centerCmdText = readFileSync(linuxCenterCmd, "utf8");
if (!centerCmdText.includes("CENTRE-RELEASE-LINUX.html")) {
  console.error("linux route verification failed: center helper does not open CENTRE-RELEASE-LINUX.html");
  process.exit(1);
}
for (const needle of ["INSTALLER-WSL.cmd", "VERIFIER-WSL-LINUX.cmd", "PREPARER-WSL-LINUX.cmd", "scripts/preflight-linux.sh", "sudo apt-get"]) {
  if (!startHereText.includes(needle)) {
    console.error(`linux route verification failed: start-here html missing WSL helper detail ${needle}`);
    process.exit(1);
  }
}
const configureCmdText = readFileSync(linuxConfigureActionsUrlCmd, "utf8");
for (const needle of ["GITHUB-ACTIONS-URL.txt", "github.com", "/actions"]) {
  if (!configureCmdText.includes(needle)) {
    console.error(`linux route verification failed: configure GitHub Actions helper missing ${needle}`);
    process.exit(1);
  }
}
const actionsCmdText = readFileSync(linuxActionsCmd, "utf8");
for (const needle of ["GITHUB-ACTIONS-URL.txt", "OWNER/REPO", "start"]) {
  if (!actionsCmdText.includes(needle)) {
    console.error(`linux route verification failed: GitHub Actions helper missing ${needle}`);
    process.exit(1);
  }
}
const wslInstallText = readFileSync(linuxWslInstallCmd, "utf8");
for (const needle of ["wsl.exe --install -d", "wsl.exe -l -q", "VERIFIER-WSL-LINUX.cmd", "OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd"]) {
  if (!wslInstallText.includes(needle)) {
    console.error(`linux route verification failed: WSL install helper missing ${needle}`);
    process.exit(1);
  }
}
const wslPreflightText = readFileSync(linuxWslPreflightCmd, "utf8");
for (const needle of ["wsl -d", "scripts/preflight-linux.sh", "local-cockpit-app"]) {
  if (!wslPreflightText.includes(needle)) {
    console.error(`linux route verification failed: WSL preflight helper missing ${needle}`);
    process.exit(1);
  }
}
const wslPrepareText = readFileSync(linuxWslPrepareCmd, "utf8");
for (const needle of ["wsl -d", "scripts/install-linux-tauri-deps.sh", "scripts/preflight-linux.sh"]) {
  if (!wslPrepareText.includes(needle)) {
    console.error(`linux route verification failed: WSL prepare helper missing ${needle}`);
    process.exit(1);
  }
}
const selfCheckCmdText = readFileSync(linuxKitSelfCheckCmd, "utf8");
if (!selfCheckCmdText.includes("VERIFIER-KIT-LINUX-WINDOWS.ps1")) {
  console.error("linux route verification failed: Linux kit self-check cmd does not call ps1");
  process.exit(1);
}
const selfCheckPsText = readFileSync(linuxKitSelfCheckPs, "utf8");
for (const needle of ["LINUX-BUILD-MANIFEST.txt", "LINUX-KIT-SELF-CHECK.json", "archive_sha256", "LINUX_KIT_READY"]) {
  if (!selfCheckPsText.includes(needle)) {
    console.error(`linux route verification failed: Linux kit self-check ps missing ${needle}`);
    process.exit(1);
  }
}
const selfCheckReport = readJson(linuxKitSelfCheckJson) || {};
if (selfCheckReport.schema !== "outilsia.local_cockpit_linux_kit_self_check.v1" || selfCheckReport.status !== "LINUX_KIT_READY") {
  console.error("linux route verification failed: Linux kit self-check json incomplete or not ready");
  process.exit(1);
}
const selfCheckMdText = readFileSync(linuxKitSelfCheckMd, "utf8");
const selfCheckHtmlText = readFileSync(linuxKitSelfCheckHtml, "utf8");
for (const needle of ["Verification kit Linux OutilsIA", "LINUX_KIT_READY", "SHA attendu", "SHA actuel"]) {
  if (!selfCheckMdText.includes(needle) && !selfCheckHtmlText.includes(needle)) {
    console.error(`linux route verification failed: Linux kit self-check report missing ${needle}`);
    process.exit(1);
  }
}
const terrainGate = readJson(linuxTerrainGateJson) || {};
if (
  terrainGate.schema !== "outilsia.local_cockpit_linux_terrain_gate.v1" ||
  Number(terrainGate.required || 0) < 5 ||
  Number(terrainGate.minimum_ready_before_linux_publication || 0) < 2 ||
  typeof terrainGate.allowed_to_publish_linux_now !== "boolean"
) {
  console.error("linux route verification failed: Linux terrain gate json incomplete");
  process.exit(1);
}
const terrainGateText = [
  linuxTerrainGateMd,
  linuxTerrainGateHtml,
  linuxTerrainGateCmd,
].map((path) => readFileSync(path, "utf8")).join("\n");
for (const needle of [
  "Gate terrain avant publication Linux",
  "Linux public suit après 1-2 cycles Windows terrain",
  "Publication Linux autorisée maintenant",
  "LINUX-TERRAIN-GATE.html",
]) {
  if (!terrainGateText.includes(needle)) {
    console.error(`linux route verification failed: Linux terrain gate missing ${needle}`);
    process.exit(1);
  }
}
const unblockChecklist = readJson(linuxUnblockChecklistJson) || {};
if (
  unblockChecklist.schema !== "outilsia.local_cockpit_linux_unblock_checklist.v1" ||
  !unblockChecklist.terrain_gate ||
  typeof unblockChecklist.terrain_gate.allowed_to_publish_linux_now !== "boolean" ||
  !Array.isArray(unblockChecklist.local_wsl?.missing_prerequisites)
) {
  console.error("linux route verification failed: Linux unblock checklist json incomplete");
  process.exit(1);
}
const unblockChecklistText = [
  linuxUnblockChecklistMd,
  linuxUnblockChecklistHtml,
  linuxUnblockChecklistCmd,
].map((path) => readFileSync(path, "utf8")).join("\n");
for (const needle of [
  "Checklist déblocage Linux OutilsIA",
  "LINUX-TERRAIN-GATE.html",
  "INSTALLER-WSL.cmd",
  "OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd",
  "IMPORTER-LINUX-ARTEFACT.cmd",
  "VERIFIER-LINUX-RELEASE.cmd",
  "Publier Linux large seulement si le gate terrain est ouvert",
  "OUVRIR-DEBLOCAGE-LINUX.cmd",
]) {
  if (!unblockChecklistText.includes(needle)) {
    console.error(`linux route verification failed: Linux unblock checklist missing ${needle}`);
    process.exit(1);
  }
}

const localStatus = route.local_native.ready
  ? "local_ready"
  : `local_blocked:${route.local_native.missing.length}`;
const containerStatus = route.container.docker_available || route.container.podman_available
  ? "container_available"
  : "container_absent";
const ghStatus = route.github_actions.gh_available ? "gh_available" : "gh_absent";
const publicStatus = route.public_linux_release ? "public_present" : "public_missing";

console.log(
  `linux_build_routes_verified ${publicStatus} ${localStatus} ${containerStatus} ${ghStatus} ` +
  `ci_path=${route.github_actions.path_verified ? "ok" : "ko"} kit=${route.build_kit.manifest_exists ? "ok" : "missing"} ` +
  `runbook=${route.build_kit.runbook_exists ? "ok" : "missing"} mission=${route.build_kit.mission_exists ? "ok" : "missing"} ` +
  `manifest_source=${[repoRoot, repoRootReal].includes(kitManifest.archive_source_root) ? "ok" : "ko"} ` +
  `start=${route.build_kit.start_here_exists ? "ok" : "missing"} ` +
  `center=${route.build_kit.center_exists ? "ok" : "missing"} ` +
  `ci_status=${route.build_kit.ci_status_json_exists && route.build_kit.ci_status_md_exists ? ciStatus.status : "missing"} ` +
  `self_check=${route.build_kit.self_check_json_exists ? "ok" : "missing"} ` +
  `terrain_gate=${terrainGate.ready || 0}/${terrainGate.required || 0}:min${terrainGate.minimum_ready_before_linux_publication || 0}:publish_${terrainGate.allowed_to_publish_linux_now ? "yes" : "no"} ` +
  `unblock_checklist=${route.build_kit.unblock_checklist_json_exists ? "ok" : "missing"} ` +
  `actions_helper=${route.build_kit.actions_cmd_exists ? "ok" : "missing"} workflow_helpers=${route.build_kit.linux_workflow_cmd_exists && route.build_kit.cross_workflow_cmd_exists ? "ok" : "missing"} configure_actions=${route.build_kit.configure_actions_url_cmd_exists ? "ok" : "missing"} ` +
  `wsl_helpers=${route.build_kit.wsl_install_cmd_exists && route.build_kit.wsl_preflight_cmd_exists && route.build_kit.wsl_prepare_cmd_exists ? "ok" : "missing"} ` +
  `routes=${viableRoutes.join(",")}`
);
