#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const desktopRoot = existsSync("/mnt/c/Users/chris/Desktop") ? "/mnt/c/Users/chris/Desktop" : join(process.env.HOME || ".", "Desktop");
const kitDir = join(desktopRoot, "OutilsIA-Local-Cockpit-Field-Test-Kit");
const releasePath = join(repoRoot, "server-work", "static", "downloads", "local-cockpit", "release.json");

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  if (!existsSync(path)) fail(`missing json: ${path}`);
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseManifest(path) {
  if (!existsSync(path)) fail(`missing manifest: ${path}`);
  const data = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    data[key.trim()] = rest.join("=").trim();
  }
  return data;
}

function assertFile(path, minBytes = 1) {
  if (!existsSync(path)) fail(`missing file: ${path}`);
  const size = statSync(path).size;
  if (size < minBytes) fail(`file too small: ${path} (${size} bytes)`);
  return size;
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

const release = readJson(releasePath);
const buildId = release.build_id || "";
const primary = release.primary_download || {};
if (!buildId) fail("release build_id missing");
if (!primary.name || !primary.sha256) fail("release primary download incomplete");

const installerPath = join(kitDir, "installer", primary.name);
const zipPath = join(desktopRoot, `OutilsIA-Local-Cockpit-Field-Test-Kit-${buildId}.zip`);
const zipManifestPath = `${zipPath}.sha256.txt`;
const kitManifestPath = join(kitDir, "FIELD-KIT-MANIFEST.txt");
const proofManifestPath = join(kitDir, "FIELD-PROOF-MANIFEST.json");
const proofManifestMarkdownPath = join(kitDir, "FIELD-PROOF-MANIFEST.md");
const statusPath = join(kitDir, "FIELD-TESTS-STATUS.json");
const statusMarkdownPath = join(kitDir, "FIELD-TESTS-STATUS.md");
const missionPath = join(kitDir, "MISSION-TERRAIN.html");
const startHerePath = join(kitDir, "START-HERE.html");
const commandCenterPath = join(kitDir, "CENTRE-TERRAIN.html");
const nextProfilePath = join(kitDir, "PROCHAIN-PC.html");
const profileCardsPath = join(kitDir, "FIELD-PROFILE-CARDS.html");
const dispatchPath = join(kitDir, "FIELD-DISPATCH.html");

function profileCommandName(profile) {
  return `TESTER-${profile.toUpperCase().replaceAll("_", "-")}.cmd`;
}

function profileBriefMdName(profile) {
  return `BRIEF-${profile}.md`;
}

function profileBriefHtmlName(profile) {
  return `BRIEF-${profile}.html`;
}

const requiredKitFiles = [
  "START-HERE.html",
  "RECETTE-5-MINUTES.html",
  "RAPPORT-PDF-TERRAIN.html",
  "CATALOGUE-VIVANT.html",
  "PONT-STRATEGY-ARENA.html",
  "CENTRE-TERRAIN.html",
  "README-Field-Test.md",
  "MISSION-TERRAIN.html",
  "PROCHAIN-PC.html",
  "TEST-EXPRESS-PROCHAIN-PC.html",
  "FIELD-PROFILE-CARDS.html",
  "FIELD-PROFILE-EXPECTATIONS.json",
  "FIELD-PROFILE-EXPECTATIONS.md",
  "FIELD-PROFILE-EXPECTATIONS.html",
  "FIELD-OPERATOR-CHECKLIST.json",
  "FIELD-OPERATOR-CHECKLIST.md",
  "FIELD-OPERATOR-CHECKLIST.html",
  "FIELD-NEXT-ACTIONS.html",
  "RAPPORT-PDF-TERRAIN.html",
  "FIELD-DISPATCH.html",
  "FIELD-KIT-MANIFEST.txt",
  "FIELD-PROOF-MANIFEST.json",
  "FIELD-PROOF-MANIFEST.md",
  "FIELD-TESTS-STATUS.json",
  "FIELD-TESTS-STATUS.md",
  "FIELD-TESTS-README.md",
  "FIELD-TESTS.template.json",
  "INSTALLER-APP.cmd",
  "OUVRIR-CENTRE-TERRAIN.cmd",
  "STATUT-WINDOWS.ps1",
  "OUVRIR-START-HERE.cmd",
  "OUVRIR-RECETTE-5-MINUTES.cmd",
  "OUVRIR-ACTIONS-RESTANTES.cmd",
  "OUVRIR-TEST-EXPRESS.cmd",
  "OUVRIR-CATALOGUE-VIVANT.cmd",
  "OUVRIR-PONT-STRATEGY-ARENA.cmd",
  "OUVRIR-RAPPORT-PDF-TERRAIN.cmd",
  "OUVRIR-MISSION.cmd",
  "OUVRIR-CARTES-PROFILS.cmd",
  "OUVRIR-CHECKLIST-OPERATEUR.cmd",
  "OUVRIR-DISPATCH.cmd",
  "PROCHAIN-PC.cmd",
  "COLLECTER.cmd",
  "VERIFIER-KIT.cmd",
  "VERIFIER-KIT-WINDOWS.ps1",
  "AUDIT-TERRAIN.cmd",
  "AUDIT-TERRAIN-WINDOWS.ps1",
  "VALIDER-DERNIERE-FICHE.cmd",
  "VALIDER-FICHE-WINDOWS.ps1",
  "VALIDER-FICHES.cmd",
  "VALIDER-FICHES-WINDOWS.ps1",
  "EXPORTER-FICHES.cmd",
  "EXPORTER-FICHES-WINDOWS.ps1",
  "PREPARER-KIT-USB.cmd",
  "PREPARER-KIT-USB-WINDOWS.ps1",
  "PREPARER-PACKS-MANQUANTS.cmd",
  "PREPARER-PACKS-MANQUANTS-WINDOWS.ps1",
  "VERIFIER-PACKS-MANQUANTS.cmd",
  "VERIFIER-PACKS-MANQUANTS-WINDOWS.ps1",
  "MISSING-PC-PACKS.html",
  "MISSING-PC-PACKS.md",
  "MISSING-PC-PACKS.json",
  "MISSING-PC-MISSION.html",
  "MISSING-PC-MISSION.md",
  "MISSING-PC-MISSION.json",
  "IMPORTER-PACK-FICHES.cmd",
  "IMPORTER-PACK-FICHES-WINDOWS.ps1",
  "STATUT.cmd",
  "ASSEMBLER.cmd",
  "IMPORTER.cmd",
  "VALIDER-GOAL.cmd",
];

for (const name of requiredKitFiles) assertFile(join(kitDir, name));
assertFile(installerPath, 1_000_000);
if (sha256(installerPath) !== primary.sha256) {
  fail(`installer sha mismatch: expected ${primary.sha256}, got ${sha256(installerPath)}`);
}

const status = readJson(statusPath);
if (status.schema !== "outilsia.local_cockpit_field_status.v1") fail("unexpected field status schema");
if (!Array.isArray(status.profiles_required) || status.profiles_required.length !== 5) fail("field status should require 5 profiles");
if (!readFileSync(statusMarkdownPath, "utf8").includes("| Rapport |")) fail("field status markdown must expose report/share column");
const fieldTestsReadme = readFileSync(join(kitDir, "FIELD-TESTS-README.md"), "utf8");
for (const needle of ["FIELD-TESTS.json", "gabarit vide", "preuve reelle", "entries/", "assemble:field-tests", "mélangés", "même build public"]) {
  if (!fieldTestsReadme.includes(needle)) fail(`FIELD-TESTS README missing ${needle}`);
}
const startHere = readFileSync(startHerePath, "utf8");
if (!startHere.includes("Demarrer le test terrain OutilsIA")) fail("start here html missing title");
if (!startHere.includes("OUVRIR-CENTRE-TERRAIN.cmd")) fail("start here html must expose the field command center");
if (!startHere.includes("OUVRIR-TEST-EXPRESS.cmd")) fail("start here html must expose the next-PC express test");
if (!startHere.includes("VALIDER-DERNIERE-FICHE.cmd")) fail("start here html must tell tester to validate the last field entry");
if (!startHere.includes("VALIDER-FICHES.cmd")) fail("start here html must expose all-entries validation");
if (!startHere.includes("EXPORTER-FICHES.cmd")) fail("start here html must expose field entries transfer export");
if (!startHere.includes("PREPARER-KIT-USB.cmd")) fail("start here html must expose USB kit preparation");
if (!startHere.includes("IMPORTER-PACK-FICHES.cmd")) fail("start here html must expose field entries transfer import");
if (!startHere.includes("OUVRIR-DISPATCH.cmd")) fail("start here html must expose profile dispatch");
if (!startHere.includes("OUVRIR-CHECKLIST-OPERATEUR.cmd")) fail("start here html must expose operator checklist");
if (!startHere.includes("AUDIT-TERRAIN.cmd")) fail("start here html must expose the field audit verdict");
if (!startHere.includes("le goal reste incomplet tant que les 5 vraies machines")) fail("start here html must not imply completion before physical tests");
const fiveMinuteRecipe = readFileSync(join(kitDir, "RECETTE-5-MINUTES.html"), "utf8");
for (const needle of [
  "Recette 5 minutes OutilsIA",
  "Ouvrir le bon profil",
  "Analyser ce PC",
  "Obtenir une preuve locale",
  "VALIDER-DERNIERE-FICHE.cmd",
  "Preuve minimale attendue",
  "À ne pas faire",
  "FIELD-TESTS-STATUS.json",
]) {
  if (!fiveMinuteRecipe.includes(needle)) fail(`5-minute recipe missing ${needle}`);
}
const fiveMinuteCmd = readFileSync(join(kitDir, "OUVRIR-RECETTE-5-MINUTES.cmd"), "utf8");
if (!fiveMinuteCmd.includes("RECETTE-5-MINUTES.html")) fail("5-minute recipe cmd must open RECETTE-5-MINUTES.html");
const nextActionsHtml = readFileSync(join(kitDir, "FIELD-NEXT-ACTIONS.html"), "utf8");
for (const needle of ["Actions restantes terrain OutilsIA", "FIELD-ENTRIES-VALIDATION.html", "RAPPORT-PDF-TERRAIN.html", "MISSING-PC-MISSION.html", "Linux ensuite", "preuves Windows terrain"]) {
  if (!nextActionsHtml.includes(needle)) fail(`next actions html missing ${needle}`);
}
const nextActionsCmd = readFileSync(join(kitDir, "OUVRIR-ACTIONS-RESTANTES.cmd"), "utf8");
if (!nextActionsCmd.includes("FIELD-NEXT-ACTIONS.html")) fail("next actions cmd must open FIELD-NEXT-ACTIONS.html");
const expressHtml = readFileSync(join(kitDir, "TEST-EXPRESS-PROCHAIN-PC.html"), "utf8");
for (const needle of ["Test express prochain PC", "8 gestes terrain", "Regle bloquante", "VALIDER-DERNIERE-FICHE.cmd", "outilsia-field-test-"]) {
  if (!expressHtml.includes(needle)) fail(`express next-PC html missing ${needle}`);
}
const expressCmd = readFileSync(join(kitDir, "OUVRIR-TEST-EXPRESS.cmd"), "utf8");
if (!expressCmd.includes("STATUT-WINDOWS.ps1") || !expressCmd.includes("TEST-EXPRESS-PROCHAIN-PC.html")) {
  fail("express next-PC cmd must regenerate status and open TEST-EXPRESS-PROCHAIN-PC.html");
}
const pdfTerrainHtml = readFileSync(join(kitDir, "RAPPORT-PDF-TERRAIN.html"), "utf8");
for (const needle of ["Rapport PDF terrain OutilsIA", "PDF modèle/upgrade", "benchmark", "Upgrade utile", "Shopping / guides", "Build et SHA", "ne remplace pas"]) {
  if (!pdfTerrainHtml.includes(needle)) fail(`terrain PDF guide missing ${needle}`);
}
const pdfTerrainCmd = readFileSync(join(kitDir, "OUVRIR-RAPPORT-PDF-TERRAIN.cmd"), "utf8");
if (!pdfTerrainCmd.includes("RAPPORT-PDF-TERRAIN.html")) fail("terrain PDF guide cmd must open RAPPORT-PDF-TERRAIN.html");
const strategyBridgeGuide = readFileSync(join(kitDir, "PONT-STRATEGY-ARENA.html"), "utf8");
for (const needle of [
  "Pont Strategy Arena",
  "outilsia-strategy-arena-profile.json",
  "Modèles locaux disponibles via OutilsIA",
  "Local Quant Mode",
  "OutilsIA ne génère pas de stratégie financière",
  "OutilsIA ne lance pas de backtest financier",
  "Strategy Arena ne devient pas un gestionnaire Ollama généraliste",
]) {
  if (!strategyBridgeGuide.includes(needle)) fail(`Strategy Arena bridge guide missing ${needle}`);
}
const strategyBridgeCmd = readFileSync(join(kitDir, "OUVRIR-PONT-STRATEGY-ARENA.cmd"), "utf8");
if (!strategyBridgeCmd.includes("PONT-STRATEGY-ARENA.html")) fail("Strategy Arena bridge cmd must open PONT-STRATEGY-ARENA.html");
if (!readFileSync(missionPath, "utf8").includes("<th>Rapport</th>")) fail("mission html must expose report/share column");
const commandCenter = readFileSync(commandCenterPath, "utf8");
if (!commandCenter.includes("Centre terrain OutilsIA")) fail("command center html missing title");
if (!commandCenter.includes("prochain PC physique") && !commandCenter.includes("OUVRIR-CENTRE-TERRAIN.cmd")) fail("command center html must expose next physical PC or command entrypoint");
const statusWindowsPs = readFileSync(join(kitDir, "STATUT-WINDOWS.ps1"), "utf8");
for (const needle of ["VALIDER-FICHES-WINDOWS.ps1", "FIELD-TESTS-STATUS.json", "build_ids", "app_versions", "metadata_mixed", "Metadonnees melangees", "CENTRE-TERRAIN.html", "PROCHAIN-PC.html", "field_status_windows"]) {
  if (!statusWindowsPs.includes(needle)) fail(`Windows status generator missing ${needle}`);
}
for (const command of ["OUVRIR-CENTRE-TERRAIN.cmd", "PROCHAIN-PC.cmd", "OUVRIR-TEST-EXPRESS.cmd", "STATUT.cmd"]) {
  const text = readFileSync(join(kitDir, command), "utf8");
  if (!text.includes("STATUT-WINDOWS.ps1")) fail(`${command} must use STATUT-WINDOWS.ps1`);
  if (text.includes("\\\\wsl.localhost") || text.includes("npm run status:field-tests")) fail(`${command} should not require WSL/npm`);
}
if (!readFileSync(nextProfilePath, "utf8").includes("Prochain test terrain")) fail("next profile html must expose the short next-PC view");
const nextProfileHtml = readFileSync(nextProfilePath, "utf8");
if (!nextProfileHtml.includes("Preuves à obtenir sur ce PC") && !nextProfileHtml.includes("Preuves a obtenir sur ce PC")) fail("next profile html must list required evidence");
const profileCards = readFileSync(profileCardsPath, "utf8");
if (!profileCards.includes("Cartes profils terrain OutilsIA")) fail("profile cards html missing title");
const operatorChecklist = readJson(join(kitDir, "FIELD-OPERATOR-CHECKLIST.json"));
const operatorChecklistMd = readFileSync(join(kitDir, "FIELD-OPERATOR-CHECKLIST.md"), "utf8");
const operatorChecklistHtml = readFileSync(join(kitDir, "FIELD-OPERATOR-CHECKLIST.html"), "utf8");
if (operatorChecklist.schema !== "outilsia.local_cockpit_field_operator_checklist.v1") {
  fail("operator checklist schema invalid");
}
if (!Array.isArray(operatorChecklist.proof_items) || operatorChecklist.proof_items.length < 8) {
  fail("operator checklist should expose at least 8 blocking proof items");
}
for (const profile of ["old_laptop", "core_i7_gtx_1080_ti", "rtx_3060_12gb", "rtx_4080_4090", "cpu_only"]) {
  if (!operatorChecklist.profiles?.[profile]) fail(`operator checklist missing profile ${profile}`);
}
for (const needle of [
  "Checklist opérateur terrain OutilsIA",
  "8 preuves",
  "Règle bloquante",
  "VALIDER-DERNIERE-FICHE.cmd",
  "outilsia-field-test-",
]) {
  if (!operatorChecklistMd.includes(needle) && !operatorChecklistHtml.includes(needle)) {
    fail(`operator checklist missing ${needle}`);
  }
}
if (!readFileSync(join(kitDir, "OUVRIR-CHECKLIST-OPERATEUR.cmd"), "utf8").includes("FIELD-OPERATOR-CHECKLIST.html")) {
  fail("operator checklist cmd must open FIELD-OPERATOR-CHECKLIST.html");
}
const profileExpectations = readJson(join(kitDir, "FIELD-PROFILE-EXPECTATIONS.json"));
const profileExpectationsMd = readFileSync(join(kitDir, "FIELD-PROFILE-EXPECTATIONS.md"), "utf8");
const profileExpectationsHtml = readFileSync(join(kitDir, "FIELD-PROFILE-EXPECTATIONS.html"), "utf8");
if (profileExpectations.schema !== "outilsia.local_cockpit_field_profile_expectations.v1") {
  fail("profile expectations schema invalid");
}
for (const needle of ["Attentes mesurables par profil terrain", "Score attendu", "Modèles à surveiller", "Pièges à éviter"]) {
  if (!profileExpectationsMd.includes(needle) && !profileExpectationsHtml.includes(needle)) {
    fail(`profile expectations missing ${needle}`);
  }
}
const dispatch = readFileSync(dispatchPath, "utf8");
if (!dispatch.includes("Dispatch terrain OutilsIA")) fail("dispatch html missing title");
const missingMissionJson = readJson(join(kitDir, "MISSING-PC-MISSION.json"));
const missingMissionMd = readFileSync(join(kitDir, "MISSING-PC-MISSION.md"), "utf8");
const missingMissionHtml = readFileSync(join(kitDir, "MISSING-PC-MISSION.html"), "utf8");
if (missingMissionJson.schema !== "outilsia.local_cockpit_missing_pc_mission.v1") {
  fail("missing PC mission json schema invalid");
}
if (!Array.isArray(missingMissionJson.missions)) fail("missing PC mission should list missions");
for (const needle of [
  "Mission 4 PC restants OutilsIA",
  "Preuve minimale par PC",
  "benchmark_tokens_per_second > 0",
  "IMPORTER-PACK-FICHES.cmd",
]) {
  if (!missingMissionMd.includes(needle)) fail(`missing PC mission markdown missing ${needle}`);
}
for (const needle of [
  "Mission des PC restants",
  "Objectif : obtenir une preuve physique",
  "TESTER-",
  "BRIEF-",
  "outilsia-field-test-",
]) {
  if (!missingMissionHtml.includes(needle)) fail(`missing PC mission html missing ${needle}`);
}
for (const profile of ["old_laptop", "core_i7_gtx_1080_ti", "rtx_3060_12gb", "rtx_4080_4090", "cpu_only"]) {
  if (!profileCards.includes(`outilsia-field-test-${profile}.json`)) fail(`profile cards html missing expected file for ${profile}`);
  if (!profileCards.includes("Score attendu")) fail(`profile cards html missing score expectation label for ${profile}`);
  const expectation = profileExpectations.profiles?.[profile];
  if (!expectation) fail(`profile expectations missing ${profile}`);
  for (const key of ["expected_score", "benchmark_target", "upgrade_signal", "expected_entry"]) {
    if (!String(expectation[key] || "").trim()) fail(`profile expectation ${profile} lacks ${key}`);
  }
  if (!Array.isArray(expectation.expected_models) || !expectation.expected_models.length) fail(`profile expectation ${profile} lacks expected_models`);
  if (!Array.isArray(expectation.must_confirm) || !expectation.must_confirm.length) fail(`profile expectation ${profile} lacks must_confirm`);
  if (!Array.isArray(expectation.pitfalls) || !expectation.pitfalls.length) fail(`profile expectation ${profile} lacks pitfalls`);
  if (!profileExpectationsMd.includes(profile) || !profileExpectationsHtml.includes(profile)) {
    fail(`profile expectation files lack profile ${profile}`);
  }
  if (!dispatch.includes(profileCommandName(profile))) fail(`dispatch html missing command for ${profile}`);
  if (!dispatch.includes(profileBriefHtmlName(profile))) fail(`dispatch html missing brief for ${profile}`);
  if (status.profiles_missing.includes(profile)) {
    const mission = missingMissionJson.missions.find((item) => item.profile === profile);
    if (!mission) fail(`missing PC mission json lacks profile ${profile}`);
    for (const key of ["target_machine", "expected_proof", "zip", "zip_sha256", "brief", "tester_command", "expected_entry"]) {
      if (!String(mission[key] || "").trim()) fail(`missing PC mission ${profile} lacks ${key}`);
    }
    if (!missingMissionMd.includes(profile) || !missingMissionHtml.includes(profile)) {
      fail(`missing PC mission files lack profile ${profile}`);
    }
  }
  assertFile(join(kitDir, profileCommandName(profile)));
  assertFile(join(kitDir, `FIELD-DISPATCH-${profile}.html`));
  assertFile(join(kitDir, profileBriefMdName(profile)));
  assertFile(join(kitDir, profileBriefHtmlName(profile)));
  const briefMd = readFileSync(join(kitDir, profileBriefMdName(profile)), "utf8");
  const briefHtml = readFileSync(join(kitDir, profileBriefHtmlName(profile)), "utf8");
  for (const needle of [
    `outilsia-field-test-${profile}.json`,
    "Preuves minimales",
    "Benchmark réel",
    "VALIDER-DERNIERE-FICHE.cmd",
  ]) {
    if (!briefMd.includes(needle) && !briefHtml.includes(needle)) fail(`brief ${profile} missing ${needle}`);
  }
  const cmd = readFileSync(join(kitDir, profileCommandName(profile)), "utf8");
  if (!cmd.includes("EXPECTED-FIELD-PROFILE.txt") || !cmd.includes(`FIELD-DISPATCH-${profile}.html`) || !cmd.includes(profileBriefHtmlName(profile))) {
    fail(`profile command incomplete for ${profile}`);
  }
}
const singleEntryCmd = readFileSync(join(kitDir, "VALIDER-DERNIERE-FICHE.cmd"), "utf8");
if (!singleEntryCmd.includes("VALIDER-FICHE-WINDOWS.ps1")) fail("single entry cmd must use bundled PowerShell validator");
if (singleEntryCmd.includes("npm run validate:field-entry")) fail("single entry cmd should not require WSL/npm on physical PCs");
const collectCmd = readFileSync(join(kitDir, "COLLECTER.cmd"), "utf8");
for (const needle of ["outilsia-field-test-*.json", "VALIDER-FICHES-WINDOWS.ps1", "FIELD-ENTRIES-VALIDATION.json", "STATUT-WINDOWS.ps1", "CENTRE-TERRAIN.html"]) {
  if (!collectCmd.includes(needle)) fail(`COLLECTER.cmd missing ${needle}`);
}
const auditTerrainCmd = readFileSync(join(kitDir, "AUDIT-TERRAIN.cmd"), "utf8");
if (!auditTerrainCmd.includes("AUDIT-TERRAIN-WINDOWS.ps1")) fail("field audit cmd must use bundled PowerShell audit");
const auditTerrainPs = readFileSync(join(kitDir, "AUDIT-TERRAIN-WINDOWS.ps1"), "utf8");
for (const needle of [
  "VALIDER-FICHES-WINDOWS.ps1",
  "STATUT-WINDOWS.ps1",
  "AUDIT-TERRAIN.md",
  "AUDIT-TERRAIN.html",
  "GOAL PAS ENCORE VALIDABLE",
  "GOAL TERRAIN VALIDABLE",
  "field_audit_windows",
]) {
  if (!auditTerrainPs.includes(needle)) fail(`PowerShell field audit missing ${needle}`);
}
const verifyKitCmd = readFileSync(join(kitDir, "VERIFIER-KIT.cmd"), "utf8");
if (!verifyKitCmd.includes("VERIFIER-KIT-WINDOWS.ps1")) fail("kit self-check cmd must use bundled PowerShell verifier");
const verifyKitPs = readFileSync(join(kitDir, "VERIFIER-KIT-WINDOWS.ps1"), "utf8");
for (const needle of [
  "FIELD-KIT-MANIFEST.txt",
  "Get-FileHash",
  "FIELD-KIT-SELF-CHECK.json",
  "FIELD-KIT-SELF-CHECK.md",
  "FIELD-KIT-SELF-CHECK.html",
  "FIELD_KIT_READY",
  "field_kit_self_check_windows",
]) {
  if (!verifyKitPs.includes(needle)) fail(`PowerShell kit self-check missing ${needle}`);
}
const singleEntryPs = readFileSync(join(kitDir, "VALIDER-FICHE-WINDOWS.ps1"), "utf8");
for (const needle of ["requiredProfiles", "EXPECTED-FIELD-PROFILE.txt", "profil attendu", "ne correspond pas au profil attendu", "app_version", "build_id", "Add-Member", "benchmark_tokens_per_second", "promptforge_ok", "dialogue_ok", "arena_ok", "report_ok", "share_url", "outilsia.fr", "/r/", "Test-ProfileHardware", "coherence materielle invalide", "rtx_3060_12gb.gpu", "cpu_only.vram_gb", "field_entry_ok"]) {
  if (!singleEntryPs.includes(needle)) fail(`PowerShell field validator missing ${needle}`);
}
const allEntriesCmd = readFileSync(join(kitDir, "VALIDER-FICHES.cmd"), "utf8");
if (!allEntriesCmd.includes("VALIDER-FICHES-WINDOWS.ps1")) fail("all entries cmd must use bundled PowerShell validator");
if (allEntriesCmd.includes("npm run validate:field-entries")) fail("all entries cmd should not require WSL/npm on physical PCs");
if (!allEntriesCmd.includes("FIELD-ENTRIES-VALIDATION.html")) fail("all entries cmd must open the HTML validation report");
const allEntriesPs = readFileSync(join(kitDir, "VALIDER-FICHES-WINDOWS.ps1"), "utf8");
for (const needle of ["FIELD_ENTRIES_VALID", "FIELD_ENTRIES_INCOMPLETE", "profiles_missing", "profiles_incomplete", "next_profile_to_fix", "app_version", "build_id", "metadata_mixed", "Metadonnees melangees", "Add-Member", "share_url", "outilsia.fr", "/r/", "Test-ProfileHardware", "coherence materielle invalide", "rtx_3060_12gb.gpu", "cpu_only.vram_gb", "FIELD-ENTRIES-VALIDATION.md", "FIELD-ENTRIES-VALIDATION.html", "Validation fiches terrain OutilsIA"]) {
  if (!allEntriesPs.includes(needle)) fail(`PowerShell all-entries validator missing ${needle}`);
}
const exportEntriesCmd = readFileSync(join(kitDir, "EXPORTER-FICHES.cmd"), "utf8");
if (!exportEntriesCmd.includes("EXPORTER-FICHES-WINDOWS.ps1")) fail("export entries cmd must use bundled PowerShell exporter");
const exportEntriesPs = readFileSync(join(kitDir, "EXPORTER-FICHES-WINDOWS.ps1"), "utf8");
for (const needle of ["outilsia-field-entries-transfer-", "FIELD-ENTRIES-TRANSFER-MANIFEST.txt", "VALIDER-FICHES-WINDOWS.ps1", "Compress-Archive"]) {
  if (!exportEntriesPs.includes(needle)) fail(`PowerShell entries exporter missing ${needle}`);
}
const usbCmd = readFileSync(join(kitDir, "PREPARER-KIT-USB.cmd"), "utf8");
if (!usbCmd.includes("PREPARER-KIT-USB-WINDOWS.ps1")) fail("USB kit cmd must use bundled PowerShell exporter");
const usbPs = readFileSync(join(kitDir, "PREPARER-KIT-USB-WINDOWS.ps1"), "utf8");
for (const needle of ["FIELD-PROOF-MANIFEST.json", "OutilsIA-Local-Cockpit-Field-Test-Kit-", "Get-Volume", "Copy-Item", "FIELD-USB-EXPORT.json", "field_usb_export_ok"]) {
  if (!usbPs.includes(needle)) fail(`PowerShell USB exporter missing ${needle}`);
}
const importEntriesCmd = readFileSync(join(kitDir, "IMPORTER-PACK-FICHES.cmd"), "utf8");
if (!importEntriesCmd.includes("IMPORTER-PACK-FICHES-WINDOWS.ps1")) fail("import entries cmd must use bundled PowerShell importer");
const importEntriesPs = readFileSync(join(kitDir, "IMPORTER-PACK-FICHES-WINDOWS.ps1"), "utf8");
for (const needle of ["outilsia-field-entries-transfer-", "FIELD-ENTRIES-IMPORT.md", "Expand-Archive", "VALIDER-FICHES-WINDOWS.ps1"]) {
  if (!importEntriesPs.includes(needle)) fail(`PowerShell entries importer missing ${needle}`);
}

const kitManifest = parseManifest(kitManifestPath);
if (kitManifest.build_id !== buildId) fail("kit manifest build_id mismatch");
if (kitManifest.installer_sha256 !== primary.sha256) fail("kit manifest installer sha mismatch");
const proofManifest = readJson(proofManifestPath);
if (proofManifest.schema !== "outilsia.local_cockpit_field_proof_manifest.v1") fail("unexpected proof manifest schema");
if (proofManifest.build_id !== buildId) fail("proof manifest build_id mismatch");
if (proofManifest.installer?.sha256 !== primary.sha256) fail("proof manifest installer sha mismatch");
if (!readFileSync(proofManifestMarkdownPath, "utf8").includes("Manifeste preuve terrain OutilsIA")) fail("proof manifest markdown missing title");

assertFile(zipPath, 1_000_000);
const zipManifest = parseManifest(zipManifestPath);
if (zipManifest.build_id !== buildId) fail("zip manifest build_id mismatch");
if (zipManifest.installer_sha256 !== primary.sha256) fail("zip manifest installer sha mismatch");
if (zipManifest.zip_sha256 !== sha256(zipPath)) fail("zip sha mismatch");

const entries = listZipEntries(zipPath);
const requiredZipEntries = [
  `installer/${primary.name}`,
  "START-HERE.html",
  "RECETTE-5-MINUTES.html",
  "CATALOGUE-VIVANT.html",
  "PONT-STRATEGY-ARENA.html",
  "CENTRE-TERRAIN.html",
  "README-Field-Test.md",
  "MISSION-TERRAIN.html",
  "PROCHAIN-PC.html",
  "TEST-EXPRESS-PROCHAIN-PC.html",
  "FIELD-PROFILE-CARDS.html",
  "FIELD-PROFILE-EXPECTATIONS.json",
  "FIELD-PROFILE-EXPECTATIONS.md",
  "FIELD-PROFILE-EXPECTATIONS.html",
  "FIELD-DISPATCH.html",
  "FIELD-KIT-MANIFEST.txt",
  "FIELD-PROOF-MANIFEST.json",
  "FIELD-PROOF-MANIFEST.md",
  "FIELD-TESTS-STATUS.json",
  "OUVRIR-START-HERE.cmd",
  "OUVRIR-RECETTE-5-MINUTES.cmd",
  "OUVRIR-CATALOGUE-VIVANT.cmd",
  "OUVRIR-PONT-STRATEGY-ARENA.cmd",
  "OUVRIR-RAPPORT-PDF-TERRAIN.cmd",
  "OUVRIR-CENTRE-TERRAIN.cmd",
  "STATUT-WINDOWS.ps1",
  "INSTALLER-APP.cmd",
  "OUVRIR-ACTIONS-RESTANTES.cmd",
  "OUVRIR-TEST-EXPRESS.cmd",
  "OUVRIR-MISSION.cmd",
  "OUVRIR-CARTES-PROFILS.cmd",
  "OUVRIR-DISPATCH.cmd",
  "PROCHAIN-PC.cmd",
  "VERIFIER-KIT.cmd",
  "VERIFIER-KIT-WINDOWS.ps1",
  "AUDIT-TERRAIN.cmd",
  "AUDIT-TERRAIN-WINDOWS.ps1",
  "VALIDER-DERNIERE-FICHE.cmd",
  "VALIDER-FICHE-WINDOWS.ps1",
  "VALIDER-FICHES.cmd",
  "VALIDER-FICHES-WINDOWS.ps1",
  "EXPORTER-FICHES.cmd",
  "EXPORTER-FICHES-WINDOWS.ps1",
  "PREPARER-KIT-USB.cmd",
  "PREPARER-KIT-USB-WINDOWS.ps1",
  "IMPORTER-PACK-FICHES.cmd",
  "IMPORTER-PACK-FICHES-WINDOWS.ps1",
  "VALIDER-GOAL.cmd",
];
for (const profile of ["old_laptop", "core_i7_gtx_1080_ti", "rtx_3060_12gb", "rtx_4080_4090", "cpu_only"]) {
  requiredZipEntries.push(
    profileCommandName(profile),
    `FIELD-DISPATCH-${profile}.html`,
    profileBriefMdName(profile),
    profileBriefHtmlName(profile),
  );
}
const missingZipEntries = requiredZipEntries.filter((entry) => !entries.includes(entry));
if (missingZipEntries.length) fail(`zip missing entries: ${missingZipEntries.join(", ")}`);

const nextProfile = status.next_profile_to_test || "old_laptop";
const nextPackDir = join(desktopRoot, `OutilsIA-Next-PC-${nextProfile}`);
const nextPackZip = `${nextPackDir}.zip`;
const nextPackZipSha = `${nextPackZip}.sha256.txt`;
const nextProfileCommand = profileCommandName(nextProfile);
const requiredNextPackFiles = [
  "START-HERE.html",
  "README-NEXT-PC.md",
  "RECETTE-5-MINUTES.html",
  "TEST-EXPRESS-PROCHAIN-PC.html",
  "OUVRIR-TEST-EXPRESS.cmd",
  "PROCHAIN-PC.html",
  "PROCHAIN-PC.cmd",
  "STATUT-WINDOWS.ps1",
  "PREUVES-ATTENDUES.html",
  "PREUVES-ATTENDUES.md",
  "DEMARRER-TEST-TERRAIN.cmd",
  "INSTALLER-APP.cmd",
  "VALIDER-DERNIERE-FICHE.cmd",
  "VALIDER-FICHE-WINDOWS.ps1",
  "VALIDER-FICHES.cmd",
  "VALIDER-FICHES-WINDOWS.ps1",
  "EXPORTER-FICHES.cmd",
  "EXPORTER-FICHES-WINDOWS.ps1",
  "COLLECTER.cmd",
  "VERIFIER-PACK.cmd",
  "VERIFIER-PACK-WINDOWS.ps1",
  `BRIEF-${nextProfile}.html`,
  `BRIEF-${nextProfile}.md`,
  `FIELD-DISPATCH-${nextProfile}.html`,
  nextProfileCommand,
  "EXPECTED-FIELD-PROFILE.txt",
  "EXPECTED-BUILD-ID.txt",
  "EXPECTED-APP-VERSION.txt",
  "EXPECTED-INSTALLER-SHA256.txt",
];
for (const name of requiredNextPackFiles) assertFile(join(nextPackDir, name));
assertFile(join(nextPackDir, "installer", primary.name), 1_000_000);
if (sha256(join(nextPackDir, "installer", primary.name)) !== primary.sha256) {
  fail("next PC pack installer sha mismatch");
}
const nextStartHere = readFileSync(join(nextPackDir, "START-HERE.html"), "utf8");
for (const needle of ["Pack autonome", "DEMARRER-TEST-TERRAIN.cmd", "VALIDER-DERNIERE-FICHE.cmd", `outilsia-field-test-${nextProfile}.json`]) {
  if (!nextStartHere.includes(needle)) fail(`next PC START-HERE missing ${needle}`);
}
for (const forbidden of ["OUVRIR-CENTRE-TERRAIN.cmd", "OUVRIR-DISPATCH.cmd", "PREPARER-KIT-USB.cmd", "VALIDER-GOAL.cmd"]) {
  if (nextStartHere.includes(forbidden)) fail(`next PC START-HERE references full-kit command: ${forbidden}`);
}
assertFile(nextPackZip, 1_000_000);
assertFile(nextPackZipSha);
const nextPackEntries = listZipEntries(nextPackZip);
const normalizedNextPackEntries = nextPackEntries.map((entry) => entry.replaceAll("\\", "/"));
function nextPackHasEntry(entry) {
  return normalizedNextPackEntries.includes(entry) || normalizedNextPackEntries.some((name) => name.endsWith(`/${entry}`));
}
for (const entry of [
  `installer/${primary.name}`,
  "START-HERE.html",
  "DEMARRER-TEST-TERRAIN.cmd",
  "VERIFIER-PACK-WINDOWS.ps1",
  "PROCHAIN-PC.cmd",
  "STATUT-WINDOWS.ps1",
  nextProfileCommand,
]) {
  if (!nextPackHasEntry(entry)) fail(`next PC zip missing entry: ${entry}`);
}

console.log(
  `field_kit_verified build=${buildId} profiles=${status.profiles_required.length} ` +
  `installer_sha=${primary.sha256} zip_sha=${zipManifest.zip_sha256} entries=${entries.length}`
);
