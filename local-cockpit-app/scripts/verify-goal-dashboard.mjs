#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const reportsRoot = join(repoRoot, "reports");
const desktopHtml = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-GOAL-DASHBOARD.html";
const desktopCmd = "/mnt/c/Users/chris/Desktop/OUVRIR-GOAL-DASHBOARD-OUTILSIA.cmd";
const blockersHtml = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-BLOCAGES-RESTANTS.html";
const blockersCmd = "/mnt/c/Users/chris/Desktop/OUVRIR-BLOCAGES-RESTANTS-OUTILSIA.cmd";
const packCmd = "/mnt/c/Users/chris/Desktop/OUVRIR-PACK-OLD-LAPTOP-OUTILSIA.cmd";
const missingLauncherManifest = "/mnt/c/Users/chris/Desktop/OutilsIA-Missing-Pack-Launchers.json";
const missingMissionHtml = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Field-Test-Kit/MISSING-PC-MISSION.html";
const expressTestHtml = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Field-Test-Kit/TEST-EXPRESS-PROCHAIN-PC.html";
const expressTestCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Field-Test-Kit/OUVRIR-TEST-EXPRESS.cmd";
const linuxNextActionHtml = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/PROCHAINE-ACTION-LINUX.html";
const linuxNextActionMd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/PROCHAINE-ACTION-LINUX.md";
const linuxNextActionCmd = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Linux-Build-Kit/OUVRIR-PROCHAINE-ACTION-LINUX.cmd";
const fallbackExpectedMissingProfiles = ["old_laptop", "core_i7_gtx_1080_ti", "rtx_3060_12gb", "rtx_4080_4090", "cpu_only"];
const requireDesktopArtifacts = process.env.OUTILSIA_WRITE_DESKTOP === "1";

function fail(message) {
  throw new Error(message);
}

function latest(prefix, ext) {
  const names = readdirSync(reportsRoot)
    .filter((name) => name.startsWith(prefix) && name.endsWith(ext))
    .sort();
  if (!names.length) fail(`missing ${prefix}*${ext}`);
  return join(reportsRoot, names.at(-1));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function localPath(path) {
  const text = String(path || "");
  const match = text.match(/^([A-Za-z]):\\(.+)$/);
  if (!match) return text;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
}

function profileCommandName(profile) {
  return `TESTER-${String(profile).toUpperCase().replaceAll("_", "-")}.cmd`;
}

function listZipEntries(zipPath) {
  const script = [
    "import sys, zipfile",
    "with zipfile.ZipFile(sys.argv[1]) as z:",
    "    [print(name.replace('\\\\\\\\', '/').replace('\\\\', '/')) for name in z.namelist()]",
  ].join("\n");
  const output = execFileSync("python3", ["-c", script, zipPath], { encoding: "utf8" });
  return output.split(/\r?\n/).filter(Boolean);
}

function requireIncludes(label, text, needles) {
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length) fail(`${label} missing: ${missing.join(", ")}`);
}

function requireLauncher(profile, launcherPath) {
  if (!existsSync(launcherPath)) fail(`missing launcher for ${profile}: ${launcherPath}`);
  const text = readFileSync(launcherPath, "utf8");
  requireIncludes(`launcher ${profile}`, text, [
    `Pack terrain ${profile}`,
    `OutilsIA-Next-PC-${profile}.zip`,
    "certutil -hashfile \"%PACK_ZIP%\" SHA256",
    "EXPECTED_SHA",
    "ACTUAL_SHA",
    "Hash SHA256 OK",
    "explorer.exe /select,\"%PACK_ZIP%\"",
    "Relancez npm run kit:field",
  ]);
}

function requirePackArtifact(profile, item) {
  const zipPath = localPath(item.zip);
  const sidecarPath = localPath(item.zip_sha256_file || `${item.zip}.sha256.txt`);
  const dirPath = localPath(item.dir || String(item.zip || "").replace(/\.zip$/i, ""));
  if (!existsSync(zipPath)) fail(`missing pack zip for ${profile}: ${zipPath}`);
  if (!existsSync(sidecarPath)) fail(`missing pack sha sidecar for ${profile}: ${sidecarPath}`);
  if (!existsSync(dirPath)) fail(`missing pack directory for ${profile}: ${dirPath}`);
  const actual = sha256(zipPath);
  const expected = String(item.zip_sha256 || readFileSync(sidecarPath, "utf8").split(/\s+/)[0] || "").toLowerCase();
  const sidecar = readFileSync(sidecarPath, "utf8").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) fail(`invalid expected sha for ${profile}: ${expected}`);
  if (actual !== expected) fail(`pack sha mismatch for ${profile}: expected=${expected} actual=${actual}`);
  if (!sidecar.includes(expected)) fail(`pack sha sidecar does not contain expected sha for ${profile}`);
  const zipEntries = listZipEntries(zipPath);
  const requiredZipEntries = [
    "TEST-EXPRESS-PROCHAIN-PC.html",
    "OUVRIR-TEST-EXPRESS.cmd",
    "DEMARRER-TEST-TERRAIN.cmd",
    `BRIEF-${profile}.html`,
    `FIELD-DISPATCH-${profile}.html`,
    profileCommandName(profile),
  ];
  const missingZipEntries = requiredZipEntries.filter((entry) => !zipEntries.some((actualEntry) => actualEntry === entry || actualEntry.endsWith(`/${entry}`)));
  if (missingZipEntries.length) fail(`pack zip ${profile} missing entries: ${missingZipEntries.join(", ")}`);
  for (const file of [
    `BRIEF-${profile}.md`,
    `BRIEF-${profile}.html`,
    "TEST-EXPRESS-PROCHAIN-PC.html",
    "OUVRIR-TEST-EXPRESS.cmd",
    `FIELD-DISPATCH-${profile}.html`,
    profileCommandName(profile),
  ]) {
    const path = join(dirPath, file);
    if (!existsSync(path)) fail(`pack ${profile} missing ${file}`);
  }
  requireIncludes(`pack express ${profile}`, readFileSync(join(dirPath, "TEST-EXPRESS-PROCHAIN-PC.html"), "utf8"), [
    "Test express prochain PC",
    profile,
    "Regle bloquante",
    "VALIDER-DERNIERE-FICHE.cmd",
  ]);
  requireIncludes(`pack start ${profile}`, readFileSync(join(dirPath, "DEMARRER-TEST-TERRAIN.cmd"), "utf8"), [
    "TEST-EXPRESS-PROCHAIN-PC.html",
    `BRIEF-${profile}.html`,
    profileCommandName(profile),
  ]);
}

function expectedMissingProfilesFromReport(report) {
  const profiles = Array.isArray(report.field?.missing_profiles) && report.field.missing_profiles.length
    ? report.field.missing_profiles
    : fallbackExpectedMissingProfiles;
  return [...new Set(profiles)].sort();
}

function main() {
  const jsonPath = latest("goal_dashboard_", ".json");
  const htmlPath = latest("goal_dashboard_", ".html");
  const latestRemainingPath = latest("goal_remaining_", ".json");
  const report = readJson(jsonPath);
  const html = readFileSync(htmlPath, "utf8");
  const desktop = existsSync(desktopHtml) ? readFileSync(desktopHtml, "utf8") : "";
  const desktopLauncher = existsSync(desktopCmd) ? readFileSync(desktopCmd, "utf8") : "";
  const blockers = existsSync(blockersHtml) ? readFileSync(blockersHtml, "utf8") : "";
  const blockersLauncher = existsSync(blockersCmd) ? readFileSync(blockersCmd, "utf8") : "";
  const packLauncher = existsSync(packCmd) ? readFileSync(packCmd, "utf8") : "";
  const manifest = existsSync(missingLauncherManifest) ? readJson(missingLauncherManifest) : null;

  if (report.schema !== "outilsia.local_cockpit_goal_dashboard.v1") fail("bad dashboard schema");
  if (report.proof?.remaining_report !== latestRemainingPath.replace(`${repoRoot}/`, "")) {
    fail(`dashboard remaining source is stale: ${report.proof?.remaining_report} != ${latestRemainingPath.replace(`${repoRoot}/`, "")}`);
  }
  if (report.field?.next_profile !== "old_laptop") fail(`unexpected next profile: ${report.field?.next_profile}`);
  const expectedMissingProfiles = expectedMissingProfilesFromReport(report);
  const expectedReady = Math.max(0, Number(report.field?.required || 5) - expectedMissingProfiles.length);
  if (Number(report.field?.ready) !== expectedReady || report.field?.required !== 5) {
    fail(`unexpected field progress: ${report.field?.ready}/${report.field?.required}`);
  }
  if (report.linux?.public_status !== "public_linux_release_current") fail(`unexpected linux status: ${report.linux?.public_status}`);
  if (report.blockers?.html !== blockersHtml) fail(`unexpected blockers html path: ${report.blockers?.html}`);
  if (report.blockers?.cmd !== blockersCmd) fail(`unexpected blockers cmd path: ${report.blockers?.cmd}`);
  if (report.guard?.live_blocks_completion !== true) fail("goal dashboard should show live guard blocking completion");
  if (requireDesktopArtifacts) {
    if (report.field?.express_test !== expressTestHtml) fail(`unexpected express test path: ${report.field?.express_test}`);
    if (report.field?.express_test_cmd !== expressTestCmd) fail(`unexpected express test command path: ${report.field?.express_test_cmd}`);
    if (report.field?.express_test_exists !== true) fail("dashboard should expose next-PC express test");
    if (!existsSync(expressTestHtml)) fail(`missing express test html: ${expressTestHtml}`);
    if (!existsSync(expressTestCmd)) fail(`missing express test command: ${expressTestCmd}`);
    requireIncludes("express test html", readFileSync(expressTestHtml, "utf8"), [
      "Test express prochain PC",
      "old_laptop",
      "Regle bloquante",
      "VALIDER-DERNIERE-FICHE.cmd",
    ]);
    requireIncludes("express test command", readFileSync(expressTestCmd, "utf8"), [
      "STATUT-WINDOWS.ps1",
      "TEST-EXPRESS-PROCHAIN-PC.html",
    ]);
  }
  if (!String(report.guard?.live_json_path || "").includes("goal_closure_guard_")) fail("dashboard missing live guard json path");
  if (report.proof?.closure_guard_report !== report.guard?.live_json_path) {
    fail(`dashboard guard source mismatch: proof=${report.proof?.closure_guard_report} live=${report.guard?.live_json_path}`);
  }
  if (requireDesktopArtifacts) {
    if (!String(report.field?.next_pack_zip || "").includes("OutilsIA-Next-PC-old_laptop.zip")) fail("next pack zip does not target old_laptop");
    if (report.field?.missing_pc_mission_exists !== true) fail("dashboard should expose missing PC mission");
    if (report.field?.missing_pc_mission !== missingMissionHtml) fail(`unexpected missing PC mission path: ${report.field?.missing_pc_mission}`);
    if (!existsSync(missingMissionHtml)) fail(`missing mission html: ${missingMissionHtml}`);
    requireIncludes("missing PC mission html", readFileSync(missingMissionHtml, "utf8"), [
      "Mission des PC restants",
      "old_laptop",
      ...expectedMissingProfilesFromReport(report),
    ]);
    if (report.linux?.next_action_exists !== true) fail("dashboard should expose Linux next action");
    if (report.linux?.next_action !== linuxNextActionHtml) fail(`unexpected Linux next action path: ${report.linux?.next_action}`);
    for (const path of [linuxNextActionHtml, linuxNextActionMd, linuxNextActionCmd]) {
      if (!existsSync(path)) fail(`missing Linux next action artifact: ${path}`);
    }
    requireIncludes("Linux next action markdown", readFileSync(linuxNextActionMd, "utf8"), [
      "Prochaine action Linux OutilsIA",
      "GitHub Actions Cross Platform",
      "IMPORTER-LINUX-ARTEFACT.cmd",
      "VERIFIER-LINUX-RELEASE.cmd",
      "windows-x64 + linux",
    ]);
  }

  const requiredHtml = [
    "OutilsIA Local Cockpit - Goal Dashboard",
    "Preuve technique",
    "Readiness produit",
    "Prochain PC physique",
    "Test express prochain PC",
    "Mission 4 PC restants",
    "Linux - prochaine action",
    "Blocages restants",
    "goal_remaining_",
    "public_linux_release_current",
    "goal_closure_guard_",
  ];
  if (requireDesktopArtifacts) {
    requiredHtml.push(
      "TEST-EXPRESS-PROCHAIN-PC.html",
      "OUVRIR-TEST-EXPRESS.cmd",
      "OutilsIA-Next-PC-old_laptop.zip",
      "MISSING-PC-MISSION.html",
      "PROCHAINE-ACTION-LINUX.html",
      "OutilsIA-Local-Cockpit-BLOCAGES-RESTANTS.html",
    );
  }
  requireIncludes("dashboard html", html, requiredHtml);
  if (requireDesktopArtifacts) {
    requireIncludes("desktop dashboard html", desktop, requiredHtml);
    requireIncludes("desktop dashboard launcher", desktopLauncher, [
      "OutilsIA-Local-Cockpit-GOAL-DASHBOARD.html",
      "start \"\" \"%DASHBOARD%\"",
      "Relancez npm run report:goal-dashboard",
    ]);
    requireIncludes("blockers html", blockers, [
      "Blocages restants OutilsIA",
      "TEST-EXPRESS-PROCHAIN-PC.html",
      "MISSING-PC-MISSION.html",
      "PROCHAINE-ACTION-LINUX.html",
      "field=5/5",
      "Linux public courant",
      "old_laptop",
      ...expectedMissingProfilesFromReport(report),
    ]);
    requireIncludes("blockers launcher", blockersLauncher, [
      "OutilsIA-Local-Cockpit-BLOCAGES-RESTANTS.html",
      "OutilsIA-Local-Cockpit-GOAL-DASHBOARD.html",
      "start \"\" \"%BLOCKERS%\"",
      "Relancez npm run report:goal-dashboard",
    ]);
    requireIncludes("old laptop pack launcher", packLauncher, [
      "Pack terrain old_laptop",
      "OutilsIA-Next-PC-old_laptop.zip",
      "certutil -hashfile \"%PACK_ZIP%\" SHA256",
      "EXPECTED_SHA",
      "ACTUAL_SHA",
      "Hash SHA256 OK",
      "explorer.exe /select,\"%PACK_ZIP%\"",
      "Relancez npm run kit:field",
    ]);
    if (!manifest) fail(`missing missing-pack launcher manifest: ${missingLauncherManifest}`);
    if (manifest.schema !== "outilsia.local_cockpit_missing_pack_launchers.v1") fail("bad missing-pack launcher manifest schema");
    if (manifest.count !== expectedMissingProfiles.length) fail(`unexpected missing-pack launcher count: ${manifest.count}`);
    const byProfile = new Map((manifest.launchers || []).map((item) => [item.profile, item]));
    for (const profile of expectedMissingProfiles) {
      const item = byProfile.get(profile);
      if (!item) fail(`missing launcher manifest item for ${profile}`);
      requireLauncher(profile, item.launcher);
      requirePackArtifact(profile, item);
    }
  }

  console.log(`goal_dashboard_verified next=${report.field.next_profile} field=${report.field.ready}/${report.field.required} linux=${report.linux.public_status} desktop=${requireDesktopArtifacts ? "verified" : "disabled"}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
