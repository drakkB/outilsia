#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const desktopRoot = existsSync("/mnt/c/Users/chris/Desktop") ? "/mnt/c/Users/chris/Desktop" : join(process.env.HOME || ".", "Desktop");
const kitDir = join(desktopRoot, "OutilsIA-Local-Cockpit-Field-Test-Kit");
const releasePath = join(repoRoot, "server-work", "static", "downloads", "local-cockpit", "release.json");

const requiredProfiles = [
  "old_laptop",
  "core_i7_gtx_1080_ti",
  "rtx_3060_12gb",
  "rtx_4080_4090",
  "cpu_only",
];

const strictProfileRecipes = {
  old_laptop: {
    title: "Recette stricte vieux laptop",
    file: "OLD-LAPTOP-RECETTE-STRICTE.html",
    command: "OUVRIR-OLD-LAPTOP-STRICT.cmd",
    required: ["qwen3:0.6b", "Ne pas télécharger un 14B/32B"],
  },
  core_i7_gtx_1080_ti: {
    title: "Recette stricte GTX 1080 Ti",
    file: "GTX-1080-TI-RECETTE-STRICTE.html",
    command: "OUVRIR-GTX-1080-TI-STRICT.cmd",
    required: ["mistral:7b", "Ne pas la classer comme machine morte"],
  },
  rtx_3060_12gb: {
    title: "Recette stricte RTX 3060 12 Go",
    file: "RTX-3060-12GB-RECETTE-STRICTE.html",
    command: "OUVRIR-RTX-3060-12GB-STRICT.cmd",
    required: ["hermes3:8b", "Ne pas proposer uniquement qwen3:0.6b"],
  },
  rtx_4080_4090: {
    title: "Recette stricte RTX 4080 / RTX 4090",
    file: "RTX-4080-4090-RECETTE-STRICTE.html",
    command: "OUVRIR-RTX-4080-4090-STRICT.cmd",
    required: ["mistral-nemo:12b", "Ne pas rester bloqué sur le modèle test 0.6B"],
  },
  cpu_only: {
    title: "Recette stricte CPU-only",
    file: "CPU-ONLY-RECETTE-STRICTE.html",
    command: "OUVRIR-CPU-ONLY-STRICT.cmd",
    required: ["llama3.2:3b", "Ne pas afficher de VRAM fantôme"],
  },
};

function profileCommandName(profile) {
  return `TESTER-${profile.toUpperCase().replaceAll("_", "-")}.cmd`;
}

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  if (!existsSync(path)) fail(`missing json: ${path}`);
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function read(path) {
  if (!existsSync(path)) fail(`missing file: ${path}`);
  return readFileSync(path, "utf8");
}

function assertIncludes(path, needles) {
  const text = read(path);
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length) fail(`${path} missing: ${missing.join(", ")}`);
}

function assertFile(path, minBytes = 1) {
  if (!existsSync(path)) fail(`missing file: ${path}`);
  const size = statSync(path).size;
  if (size < minBytes) fail(`file too small: ${path} (${size} bytes)`);
  return size;
}

function fromWindowsPath(path) {
  const value = String(path || "");
  const match = value.match(/^([A-Za-z]):\\(.*)$/);
  if (!match) return value;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
}

function toWindowsPath(path) {
  const value = String(path || "");
  const match = value.match(/^\/mnt\/([a-z])\/(.*)$/i);
  if (!match) return value;
  return `${match[1].toUpperCase()}:\\${match[2].replaceAll("/", "\\")}`;
}

function listZipEntries(zipPath) {
  const script = [
    "import sys, zipfile",
    "with zipfile.ZipFile(sys.argv[1]) as z:",
    "    [print(name.replace('\\\\\\\\', '/').replace('\\\\', '/')) for name in z.namelist()]",
  ].join("\n");
  const result = spawnSync("python3", ["-c", script, zipPath], { encoding: "utf8" });
  if (result.status !== 0) {
    fail(`zip listing failed for ${zipPath}: ${result.stderr || result.stdout}`);
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function assertZipIncludes(zipPath, entries) {
  assertFile(zipPath, 1_000_000);
  const actual = listZipEntries(zipPath);
  const missing = entries.filter((entry) => !actual.some((actualEntry) => actualEntry === entry || actualEntry.endsWith(`/${entry}`)));
  if (missing.length) fail(`${zipPath} missing zip entries: ${missing.join(", ")}`);
}

function assertPackBuildMetadata(pack, selfCheck, profile) {
  if (pack.build_id !== release.build_id) {
    fail(`next PC pack build_id mismatch for ${profile}: ${pack.build_id} !== ${release.build_id}`);
  }
  if (pack.app_version !== release.version) {
    fail(`next PC pack app_version mismatch for ${profile}: ${pack.app_version} !== ${release.version}`);
  }
  if (String(pack.installer_sha256 || "").toLowerCase() !== String(primary.sha256 || "").toLowerCase()) {
    fail(`next PC pack installer_sha256 mismatch for ${profile}`);
  }
  if (selfCheck.expected_build_id !== release.build_id) {
    fail(`next PC self-check expected_build_id mismatch for ${profile}`);
  }
  if (selfCheck.expected_app_version !== release.version) {
    fail(`next PC self-check expected_app_version mismatch for ${profile}`);
  }
  if (String(selfCheck.expected_installer_sha256 || "").toLowerCase() !== String(primary.sha256 || "").toLowerCase()) {
    fail(`next PC self-check expected_installer_sha256 mismatch for ${profile}`);
  }
  if (String(selfCheck.installer_sha256 || "").toLowerCase() !== String(primary.sha256 || "").toLowerCase()) {
    fail(`next PC self-check installer_sha256 mismatch for ${profile}`);
  }
  if (!String(selfCheck.installer || "").includes(release.build_id)) {
    fail(`next PC self-check installer filename missing build_id for ${profile}`);
  }
}

const release = readJson(releasePath);
const primary = release.primary_download || {};
const proof = readJson(join(kitDir, "FIELD-PROOF-MANIFEST.json"));
const status = readJson(join(kitDir, "FIELD-TESTS-STATUS.json"));
const zipManifest = read(join(desktopRoot, `OutilsIA-Local-Cockpit-Field-Test-Kit-${release.build_id}.zip.sha256.txt`));

if (proof.schema !== "outilsia.local_cockpit_field_proof_manifest.v1") fail("unexpected proof manifest schema");
if (proof.build_id !== release.build_id) fail("proof manifest build_id does not match release");
if (proof.installer?.sha256 !== primary.sha256) fail("proof manifest installer sha does not match release");
if (!zipManifest.includes(proof.zip?.sha256 || "missing")) fail("zip manifest does not contain proof zip sha");

if (status.schema !== "outilsia.local_cockpit_field_status.v1") fail("unexpected field status schema");
if (JSON.stringify(status.profiles_required) !== JSON.stringify(requiredProfiles)) fail("field status required profiles changed");
if (!status.next_profile_to_test && status.status !== "FIELD_TESTS_READY") fail("field status should expose next_profile_to_test before completion");

for (const profile of requiredProfiles) {
  const row = status.profiles?.find((item) => item.profile === profile);
  if (!row) fail(`missing status row for ${profile}`);
}

assertFile(join(kitDir, "installer", primary.name), 1_000_000);
assertFile(join(desktopRoot, `OutilsIA-Local-Cockpit-Field-Test-Kit-${release.build_id}.zip`), 1_000_000);
assertIncludes(join(kitDir, "MISSION-TERRAIN.html"), [
  "Mission terrain OutilsIA",
  "Profil terrain",
  "<th>Rapport</th>",
  "Télécharger fiche",
]);
assertIncludes(join(kitDir, "START-HERE.html"), [
  "Demarrer le test terrain OutilsIA",
  "OUVRIR-CENTRE-TERRAIN.cmd",
  "OUVRIR-ACTIONS-RESTANTES.cmd",
  "OUVRIR-TEST-EXPRESS.cmd",
  "OUVRIR-RECETTES-STRICTES.cmd",
  "OUVRIR-OLD-LAPTOP-STRICT.cmd",
  "OUVRIR-CATALOGUE-VIVANT.cmd",
  "OUVRIR-PONT-STRATEGY-ARENA.cmd",
  "OUVRIR-RAPPORT-PDF-TERRAIN.cmd",
  "PROCHAIN-PC.cmd",
  "TEST-EXPRESS-PROCHAIN-PC.html",
  "OUVRIR-PROGRESSION-TERRAIN.cmd",
  "VALIDER-DERNIERE-FICHE.cmd",
  "OUVRIR-DISPATCH.cmd",
  "VALIDER-FICHES.cmd",
  "EXPORTER-FICHES.cmd",
  "PREPARER-KIT-USB.cmd",
  "IMPORTER-PACK-FICHES.cmd",
  "VALIDER-GOAL.cmd",
  "le goal reste incomplet tant que les 5 vraies machines",
]);
assertIncludes(join(kitDir, "RECETTES-STRICTES-PROFILS.html"), [
  "Recettes strictes profils",
  "UX 30s",
  "VALIDER-DERNIERE-FICHE.cmd",
  "Recette stricte vieux laptop",
  "Recette stricte GTX 1080 Ti",
  "Recette stricte RTX 3060 12 Go",
  "Recette stricte RTX 4080 / RTX 4090",
  "Recette stricte CPU-only",
]);
assertIncludes(join(kitDir, "OUVRIR-RECETTES-STRICTES.cmd"), [
  "RECETTES-STRICTES-PROFILS.html",
]);
for (const profile of requiredProfiles) {
  const recipe = strictProfileRecipes[profile];
  assertIncludes(join(kitDir, recipe.file), [
    recipe.title,
    "Profil attendu",
    profile,
    "UX 30s",
    `outilsia-field-test-${profile}.json`,
    "VALIDER-DERNIERE-FICHE.cmd",
    ...recipe.required,
  ]);
  assertIncludes(join(kitDir, recipe.command), [
    "EXPECTED-FIELD-PROFILE.txt",
    profile,
    recipe.file,
    `BRIEF-${profile}.html`,
  ]);
}
assertIncludes(join(kitDir, "FIELD-NEXT-ACTIONS.html"), [
  "Actions restantes terrain OutilsIA",
  "FIELD-ENTRIES-VALIDATION.html",
  "RAPPORT-PDF-TERRAIN.html",
  "MISSING-PC-MISSION.html",
  "Linux ensuite",
]);
assertIncludes(join(kitDir, "RAPPORT-PDF-TERRAIN.html"), [
  "Rapport PDF terrain OutilsIA",
  "PDF modèle/upgrade",
  "benchmark",
  "Upgrade utile",
  "ne remplace pas",
]);
assertIncludes(join(kitDir, "PONT-STRATEGY-ARENA.html"), [
  "Pont Strategy Arena",
  "outilsia-strategy-arena-profile.json",
  "Modèles locaux disponibles via OutilsIA",
  "Local Quant Mode",
  "OutilsIA ne génère pas de stratégie financière",
  "Strategy Arena ne devient pas un gestionnaire Ollama généraliste",
]);
assertIncludes(join(kitDir, "FIELD-TESTS-README.md"), [
  "FIELD-TESTS.json",
  "gabarit vide",
  "preuve reelle",
  "entries/",
  "assemble:field-tests",
  "mélangés",
  "même build public",
]);
assertIncludes(join(kitDir, "CENTRE-TERRAIN.html"), [
  "Centre terrain OutilsIA",
]);
assertIncludes(join(kitDir, "STATUT-WINDOWS.ps1"), [
  "VALIDER-FICHES-WINDOWS.ps1",
  "FIELD-TESTS-STATUS.json",
  "build_ids",
  "app_versions",
  "metadata_mixed",
  "Metadonnees melangees",
  "CENTRE-TERRAIN.html",
  "PROCHAIN-PC.html",
  "field_status_windows",
]);
assertIncludes(join(kitDir, "PROCHAIN-PC.html"), [
  "Prochain test terrain",
  "outilsia-field-test-",
]);
assertIncludes(join(kitDir, "TEST-EXPRESS-PROCHAIN-PC.html"), [
  "Test express prochain PC",
  "8 gestes terrain",
  "Regle bloquante",
  "VALIDER-DERNIERE-FICHE.cmd",
  "outilsia-field-test-",
]);
assertIncludes(join(kitDir, "FIELD-PROGRESS.html"), [
  "Progression terrain OutilsIA",
  "Statut des 5 machines physiques",
  "Prochaine action",
]);
const progress = readJson(join(kitDir, "FIELD-PROGRESS.json"));
if (progress.schema !== "outilsia.local_cockpit_field_progress.v1") fail("unexpected field progress schema");
if (!Number.isFinite(Number(progress.percent))) fail("field progress percent missing");
if (Number(progress.ready || 0) !== (status.profiles_ready || []).length) fail("field progress ready count mismatch");
if (Number(progress.required || 0) !== requiredProfiles.length) fail("field progress required count mismatch");
if ((progress.next_profile || "") !== (status.next_profile_to_test || "")) fail("field progress next profile mismatch");
const nextProfileText = read(join(kitDir, "PROCHAIN-PC.html"));
if (!nextProfileText.includes("À tester maintenant") && !nextProfileText.includes("A tester maintenant")) {
  fail("PROCHAIN-PC.html missing next profile heading");
}
if (!nextProfileText.includes("Preuves à obtenir sur ce PC") && !nextProfileText.includes("Preuves a obtenir sur ce PC")) {
  fail("PROCHAIN-PC.html missing required evidence section");
}
assertIncludes(join(kitDir, "FIELD-PROFILE-CARDS.html"), [
  "Cartes profils terrain OutilsIA",
  "old_laptop",
  "core_i7_gtx_1080_ti",
  "rtx_3060_12gb",
  "rtx_4080_4090",
  "cpu_only",
  "outilsia-field-test-cpu_only.json",
]);
assertIncludes(join(kitDir, "FIELD-DISPATCH.html"), [
  "Dispatch terrain OutilsIA",
  "EXPECTED-FIELD-PROFILE.txt",
  "TESTER-OLD-LAPTOP.cmd",
  "TESTER-CORE-I7-GTX-1080-TI.cmd",
  "TESTER-RTX-3060-12GB.cmd",
  "TESTER-RTX-4080-4090.cmd",
  "TESTER-CPU-ONLY.cmd",
]);
for (const profile of requiredProfiles) {
  assertIncludes(join(kitDir, profileCommandName(profile)), [
    "EXPECTED-FIELD-PROFILE.txt",
    `FIELD-DISPATCH-${profile}.html`,
  ]);
  assertIncludes(join(kitDir, `FIELD-DISPATCH-${profile}.html`), [
    profile,
    `outilsia-field-test-${profile}.json`,
    "VALIDER-DERNIERE-FICHE.cmd",
    "EXPORTER-FICHES.cmd",
  ]);
}
assertIncludes(join(kitDir, "README-Field-Test.md"), [
  "Objectif : prouver la recette terrain sur 5 machines réelles.",
  "OUVRIR-CENTRE-TERRAIN.cmd",
  "PROCHAIN-PC.cmd",
  "OUVRIR-PROGRESSION-TERRAIN.cmd",
  "OUVRIR-CARTES-PROFILS.cmd",
  "VALIDER-DERNIERE-FICHE.cmd",
  "VALIDER-GOAL.cmd",
  "EXPORTER-FICHES.cmd",
  "PREPARER-KIT-USB.cmd",
  "IMPORTER-PACK-FICHES.cmd",
  "Le validateur refuse les tests incomplets",
]);
assertIncludes(join(kitDir, "FIELD-PROOF-MANIFEST.md"), [
  "Manifeste preuve terrain OutilsIA",
  "Commandes de validation finale",
]);
const proofManifestText = read(join(kitDir, "FIELD-PROOF-MANIFEST.md"));
if (!proofManifestText.includes("Profils prêts:") && !proofManifestText.includes("Profils prets:")) {
  fail("FIELD-PROOF-MANIFEST.md missing ready profiles line");
}
assertIncludes(join(kitDir, "VALIDER-GOAL.cmd"), [
  "status:field-tests",
  "assemble:field-tests",
  "import:field-tests",
  "audit_beta_field_goal.py",
]);
assertIncludes(join(kitDir, "COLLECTER.cmd"), [
  "outilsia-field-test-*.json",
  "entries",
]);
assertIncludes(join(kitDir, "PROCHAIN-PC.cmd"), [
  "STATUT-WINDOWS.ps1",
  "CENTRE-TERRAIN.html",
  "PROCHAIN-PC.html",
]);
assertIncludes(join(kitDir, "OUVRIR-TEST-EXPRESS.cmd"), [
  "STATUT-WINDOWS.ps1",
  "TEST-EXPRESS-PROCHAIN-PC.html",
]);
assertIncludes(join(kitDir, "OUVRIR-PROGRESSION-TERRAIN.cmd"), [
  "STATUT-WINDOWS.ps1",
  "FIELD-PROGRESS.html",
]);
assertIncludes(join(kitDir, "PREPARER-PROCHAIN-PC.cmd"), [
  "PREPARER-PROCHAIN-PC-WINDOWS.ps1",
  "NEXT-PC-PACK.md",
]);
assertIncludes(join(kitDir, "PREPARER-PROCHAIN-PC-WINDOWS.ps1"), [
  "FIELD-PROGRESS.json",
  "EXPECTED-FIELD-PROFILE.txt",
  "EXPECTED-BUILD-ID.txt",
  "EXPECTED-APP-VERSION.txt",
  "EXPECTED-INSTALLER-SHA256.txt",
  "README-NEXT-PC.md",
  "DEMARRER-TEST-TERRAIN.cmd",
  "Compress-Archive",
  "zip.sha256.txt",
  "installer_sha256",
  "installer_build_id_mismatch",
  "zip_sha256_file",
  "next_pc_pack_ok",
]);
assertIncludes(join(kitDir, "PREPARER-PACKS-MANQUANTS.cmd"), [
  "PREPARER-PACKS-MANQUANTS-WINDOWS.ps1",
  "MISSING-PC-PACKS.md",
  "MISSING-PC-PACKS.html",
]);
assertIncludes(join(kitDir, "PREPARER-PACKS-MANQUANTS-WINDOWS.ps1"), [
  "missing_profiles",
  "PREPARER-PROCHAIN-PC-WINDOWS.ps1",
  "MISSING-PC-PACKS.json",
  "MISSING-PC-PACKS.html",
  "zip_sha256_file",
  "missing_pc_packs_ok",
]);
assertIncludes(join(kitDir, "VERIFIER-PACKS-MANQUANTS.cmd"), [
  "VERIFIER-PACKS-MANQUANTS-WINDOWS.ps1",
  "MISSING-PC-PACKS-VERIFY.md",
  "MISSING-PC-PACKS-VERIFY.json",
]);
assertIncludes(join(kitDir, "VERIFIER-PACKS-MANQUANTS-WINDOWS.ps1"), [
  "MISSING-PC-PACKS.json",
  "MISSING-PC-PACKS-VERIFY.html",
  "missing_pc_packs_sha_verified",
]);
assertIncludes(join(kitDir, "OUVRIR-CENTRE-TERRAIN.cmd"), [
  "STATUT-WINDOWS.ps1",
  "CENTRE-TERRAIN.html",
]);
for (const command of ["OUVRIR-CENTRE-TERRAIN.cmd", "PROCHAIN-PC.cmd", "OUVRIR-TEST-EXPRESS.cmd", "OUVRIR-PROGRESSION-TERRAIN.cmd", "PREPARER-PROCHAIN-PC.cmd", "PREPARER-PACKS-MANQUANTS.cmd", "VERIFIER-PACKS-MANQUANTS.cmd", "STATUT.cmd"]) {
  const text = read(join(kitDir, command));
  if (text.includes("\\\\wsl.localhost") || text.includes("npm run status:field-tests")) {
    fail(`${command} should be Windows-native for field status`);
  }
}
const nextPackResult = spawnSync("powershell.exe", [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  "C:\\Users\\chris\\Desktop\\OutilsIA-Local-Cockpit-Field-Test-Kit\\PREPARER-PROCHAIN-PC-WINDOWS.ps1",
], { encoding: "utf8" });
const nextPackOutput = `${nextPackResult.stdout || ""}${nextPackResult.stderr || ""}`.trim();
if (nextPackResult.status !== 0) fail(`next PC pack failed: ${nextPackOutput}`);
if (!nextPackOutput.includes("next_pc_pack_ok")) fail(`next PC pack missing marker: ${nextPackOutput}`);
const nextPack = readJson(join(kitDir, "NEXT-PC-PACK.json"));
if (nextPack.schema !== "outilsia.local_cockpit_next_pc_pack.v1") fail("unexpected next PC pack schema");
if (nextPack.profile !== status.next_profile_to_test) fail("next PC pack profile mismatch");
assertFile(fromWindowsPath(nextPack.zip), 1_000_000);
assertFile(fromWindowsPath(nextPack.zip_sha256_file));
if (!read(fromWindowsPath(nextPack.zip_sha256_file)).includes(nextPack.zip_sha256)) {
  fail("next PC pack SHA sidecar mismatch");
}
const nextPackDir = fromWindowsPath(nextPack.target_dir);
assertZipIncludes(fromWindowsPath(nextPack.zip), [
  "TEST-EXPRESS-PROCHAIN-PC.html",
  "OUVRIR-TEST-EXPRESS.cmd",
  "DEMARRER-TEST-TERRAIN.cmd",
  `BRIEF-${nextPack.profile}.html`,
  `FIELD-DISPATCH-${nextPack.profile}.html`,
  `TESTER-${nextPack.profile.toUpperCase().replaceAll("_", "-")}.cmd`,
]);
assertFile(join(nextPackDir, "README-NEXT-PC.md"));
  assertIncludes(join(nextPackDir, "README-NEXT-PC.md"), [
    "DEMARRER-TEST-TERRAIN.cmd",
    "TEST-EXPRESS-PROCHAIN-PC.html",
    "Analyser ce PC",
    `outilsia-field-test-${nextPack.profile}.json`,
  ]);
  assertFile(join(nextPackDir, "TEST-EXPRESS-PROCHAIN-PC.html"));
  assertFile(join(nextPackDir, "OUVRIR-TEST-EXPRESS.cmd"));
  assertIncludes(join(nextPackDir, "TEST-EXPRESS-PROCHAIN-PC.html"), [
    "Test express prochain PC",
    nextPack.profile,
    "Regle bloquante",
    "VALIDER-DERNIERE-FICHE.cmd",
  ]);
  assertFile(join(nextPackDir, "PREUVES-ATTENDUES.md"));
  assertFile(join(nextPackDir, "PREUVES-ATTENDUES.html"));
assertIncludes(join(nextPackDir, "PREUVES-ATTENDUES.md"), [
  "DEMARRER-TEST-TERRAIN.cmd",
  "benchmark avec tokens/s",
  "profil terrain manuel",
]);
assertFile(join(nextPackDir, "DEMARRER-TEST-TERRAIN.cmd"));
assertIncludes(join(nextPackDir, "DEMARRER-TEST-TERRAIN.cmd"), [
  "VERIFIER-PACK-WINDOWS.ps1",
  "START-HERE.html",
  "PREUVES-ATTENDUES.html",
  `BRIEF-${nextPack.profile}.html`,
  `TESTER-${nextPack.profile.toUpperCase().replaceAll("_", "-")}.cmd`,
]);
assertFile(join(nextPackDir, "EXPECTED-FIELD-PROFILE.txt"));
assertFile(join(nextPackDir, "EXPECTED-BUILD-ID.txt"));
assertFile(join(nextPackDir, "EXPECTED-APP-VERSION.txt"));
assertFile(join(nextPackDir, "EXPECTED-INSTALLER-SHA256.txt"));
assertFile(join(nextPackDir, "VERIFIER-PACK.cmd"));
assertFile(join(nextPackDir, "VERIFIER-PACK-WINDOWS.ps1"));
assertFile(join(nextPackDir, "PACK-SELF-CHECK.json"));
const nextPackSelfCheck = readJson(join(nextPackDir, "PACK-SELF-CHECK.json"));
if (nextPackSelfCheck.schema !== "outilsia.local_cockpit_next_pc_inner_pack_check.v1") fail("unexpected next pack self-check schema");
if (nextPackSelfCheck.profile !== nextPack.profile || nextPackSelfCheck.ok !== true) fail("next pack self-check invalid");
assertPackBuildMetadata(nextPack, nextPackSelfCheck, nextPack.profile);
const nextPackSelfCheckRun = spawnSync("powershell.exe", [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  toWindowsPath(join(nextPackDir, "VERIFIER-PACK-WINDOWS.ps1")),
], { encoding: "utf8" });
const nextPackSelfCheckOutput = `${nextPackSelfCheckRun.stdout || ""}${nextPackSelfCheckRun.stderr || ""}`.trim();
if (nextPackSelfCheckRun.status !== 0) fail(`next pack self-check run failed: ${nextPackSelfCheckOutput}`);
if (!nextPackSelfCheckOutput.includes("next_pc_inner_pack_verified")) fail(`next pack self-check marker missing: ${nextPackSelfCheckOutput}`);
const missingPacksResult = spawnSync("powershell.exe", [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  "C:\\Users\\chris\\Desktop\\OutilsIA-Local-Cockpit-Field-Test-Kit\\PREPARER-PACKS-MANQUANTS-WINDOWS.ps1",
], { encoding: "utf8" });
const missingPacksOutput = `${missingPacksResult.stdout || ""}${missingPacksResult.stderr || ""}`.trim();
if (missingPacksResult.status !== 0) fail(`missing PC packs failed: ${missingPacksOutput}`);
if (!missingPacksOutput.includes("missing_pc_packs_ok")) fail(`missing PC packs marker missing: ${missingPacksOutput}`);
const missingPacks = readJson(join(kitDir, "MISSING-PC-PACKS.json"));
if (missingPacks.schema !== "outilsia.local_cockpit_missing_pc_packs.v1") fail("unexpected missing PC packs schema");
assertIncludes(join(kitDir, "MISSING-PC-PACKS.html"), [
  "Packs PC manquants OutilsIA",
  "Un zip par machine physique restante",
  "Zips a emporter",
  "Fichier SHA",
  "Retour machine principale",
]);
const expectedMissing = status.profiles_missing || [];
if (Number(missingPacks.count || 0) !== expectedMissing.length) fail("missing PC packs count mismatch");
for (const profile of expectedMissing) {
  const pack = (missingPacks.packs || []).find((item) => item.profile === profile);
  if (!pack) fail(`missing pack manifest row for ${profile}`);
  assertFile(fromWindowsPath(pack.zip), 1_000_000);
  assertFile(fromWindowsPath(pack.zip_sha256_file));
  if (!read(fromWindowsPath(pack.zip_sha256_file)).includes(pack.zip_sha256)) {
    fail(`missing pack SHA sidecar mismatch for ${profile}`);
  }
  assertZipIncludes(fromWindowsPath(pack.zip), [
    "TEST-EXPRESS-PROCHAIN-PC.html",
    "OUVRIR-TEST-EXPRESS.cmd",
    "DEMARRER-TEST-TERRAIN.cmd",
    `BRIEF-${profile}.html`,
    `FIELD-DISPATCH-${profile}.html`,
    `TESTER-${profile.toUpperCase().replaceAll("_", "-")}.cmd`,
  ]);
  const packDir = fromWindowsPath(pack.dir);
  assertFile(join(packDir, "EXPECTED-FIELD-PROFILE.txt"));
  assertFile(join(packDir, "EXPECTED-BUILD-ID.txt"));
  assertFile(join(packDir, "EXPECTED-APP-VERSION.txt"));
  assertFile(join(packDir, "EXPECTED-INSTALLER-SHA256.txt"));
  assertFile(join(packDir, "PREUVES-ATTENDUES.md"));
  assertFile(join(packDir, "PREUVES-ATTENDUES.html"));
  assertFile(join(packDir, "TEST-EXPRESS-PROCHAIN-PC.html"));
  assertFile(join(packDir, "OUVRIR-TEST-EXPRESS.cmd"));
  assertFile(join(packDir, "RAPPORT-PDF-TERRAIN.html"));
  assertFile(join(packDir, "PONT-STRATEGY-ARENA.html"));
  assertFile(join(packDir, "OUVRIR-RAPPORT-PDF-TERRAIN.cmd"));
  assertFile(join(packDir, "OUVRIR-PONT-STRATEGY-ARENA.cmd"));
  assertIncludes(join(packDir, "PREUVES-ATTENDUES.md"), [
    `Profil terrain: ${profile}`,
    "DEMARRER-TEST-TERRAIN.cmd",
    "VALIDER-DERNIERE-FICHE.cmd",
  ]);
  assertFile(join(packDir, "DEMARRER-TEST-TERRAIN.cmd"));
  assertIncludes(join(packDir, "DEMARRER-TEST-TERRAIN.cmd"), [
    "VERIFIER-PACK-WINDOWS.ps1",
    "TEST-EXPRESS-PROCHAIN-PC.html",
    "PREUVES-ATTENDUES.html",
    `BRIEF-${profile}.html`,
    `TESTER-${profile.toUpperCase().replaceAll("_", "-")}.cmd`,
  ]);
  assertIncludes(join(packDir, "TEST-EXPRESS-PROCHAIN-PC.html"), [
    "Test express prochain PC",
    profile,
    "Regle bloquante",
    "VALIDER-DERNIERE-FICHE.cmd",
  ]);
  assertIncludes(join(packDir, "RAPPORT-PDF-TERRAIN.html"), [
    "Rapport PDF terrain OutilsIA",
    "PDF modèle/upgrade",
    "ne remplace pas",
  ]);
  assertIncludes(join(packDir, "PONT-STRATEGY-ARENA.html"), [
    "Pont Strategy Arena",
    "outilsia-strategy-arena-profile.json",
    "Modèles locaux disponibles via OutilsIA",
  ]);
  assertFile(join(packDir, "VERIFIER-PACK.cmd"));
  assertFile(join(packDir, "VERIFIER-PACK-WINDOWS.ps1"));
  assertFile(join(packDir, "PACK-SELF-CHECK.json"));
  const packSelfCheck = readJson(join(packDir, "PACK-SELF-CHECK.json"));
  if (packSelfCheck.schema !== "outilsia.local_cockpit_next_pc_inner_pack_check.v1") fail(`unexpected pack self-check schema for ${profile}`);
  if (packSelfCheck.profile !== profile || packSelfCheck.ok !== true) fail(`pack self-check invalid for ${profile}`);
  assertPackBuildMetadata(pack, packSelfCheck, profile);
}
const missingPacksVerifyResult = spawnSync("powershell.exe", [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  "C:\\Users\\chris\\Desktop\\OutilsIA-Local-Cockpit-Field-Test-Kit\\VERIFIER-PACKS-MANQUANTS-WINDOWS.ps1",
], { encoding: "utf8" });
const missingPacksVerifyOutput = `${missingPacksVerifyResult.stdout || ""}${missingPacksVerifyResult.stderr || ""}`.trim();
if (missingPacksVerifyResult.status !== 0) fail(`missing PC packs SHA verify failed: ${missingPacksVerifyOutput}`);
if (!missingPacksVerifyOutput.includes("missing_pc_packs_sha_verified")) fail(`missing PC packs SHA verify marker missing: ${missingPacksVerifyOutput}`);
const missingPacksVerify = readJson(join(kitDir, "MISSING-PC-PACKS-VERIFY.json"));
if (missingPacksVerify.schema !== "outilsia.local_cockpit_missing_pc_packs_verify.v1") fail("unexpected missing PC packs verify schema");
if (Number(missingPacksVerify.ok_count || 0) !== expectedMissing.length) fail("missing PC packs verify count mismatch");
assertIncludes(join(kitDir, "MISSING-PC-PACKS-VERIFY.html"), [
  "Verification SHA des packs OutilsIA",
  ".sha256.txt",
]);
assertIncludes(join(kitDir, "VALIDER-DERNIERE-FICHE.cmd"), [
  "outilsia-field-test-*.json",
  "VALIDER-FICHE-WINDOWS.ps1",
  "LAST-FIELD-ENTRY.txt",
]);
assertIncludes(join(kitDir, "COLLECTER.cmd"), [
  "outilsia-field-test-*.json",
  "VALIDER-FICHES-WINDOWS.ps1",
  "FIELD-ENTRIES-VALIDATION.json",
  "FIELD-ENTRIES-VALIDATION.html",
  "STATUT-WINDOWS.ps1",
  "CENTRE-TERRAIN.html",
]);
assertIncludes(join(kitDir, "VALIDER-FICHE-WINDOWS.ps1"), [
  "requiredProfiles",
  "app_version",
  "build_id",
  "Add-Member",
  "benchmark_tokens_per_second",
  "promptforge_ok",
  "dialogue_ok",
  "arena_ok",
  "report_ok",
  "share_url",
  "Test-First30sProof",
  "first_30s",
  "first_30s=",
  "outilsia.fr",
  "/r/",
  "Test-ProfileHardware",
  "coherence materielle invalide",
  "rtx_3060_12gb.gpu",
  "cpu_only.vram_gb",
  "field_entry_ok",
]);
assertIncludes(join(kitDir, "VALIDER-FICHES.cmd"), [
  "VALIDER-FICHES-WINDOWS.ps1",
  "FIELD-ENTRIES-VALIDATION.json",
  "FIELD-ENTRIES-VALIDATION.md",
  "FIELD-ENTRIES-VALIDATION.html",
]);
assertIncludes(join(kitDir, "VALIDER-FICHES-WINDOWS.ps1"), [
  "FIELD_ENTRIES_VALID",
  "FIELD_ENTRIES_INCOMPLETE",
  "profiles_missing",
  "profiles_incomplete",
  "next_profile_to_fix",
  "app_version",
  "build_id",
  "metadata_mixed",
  "Metadonnees melangees",
  "Add-Member",
  "share_url",
  "Test-First30sProof",
  "first_30s_complete",
  "UX 30s",
  "materiel visible, score visible, modele conseille",
  "outilsia.fr",
  "/r/",
  "Test-ProfileHardware",
  "coherence materielle invalide",
  "rtx_3060_12gb.gpu",
  "cpu_only.vram_gb",
  "FIELD-ENTRIES-VALIDATION.md",
  "FIELD-ENTRIES-VALIDATION.html",
]);
assertIncludes(join(kitDir, "EXPORTER-FICHES.cmd"), [
  "EXPORTER-FICHES-WINDOWS.ps1",
]);
assertIncludes(join(kitDir, "EXPORTER-FICHES-WINDOWS.ps1"), [
  "outilsia-field-entries-transfer-",
  "FIELD-ENTRIES-TRANSFER-MANIFEST.txt",
  "VALIDER-FICHES-WINDOWS.ps1",
  "Compress-Archive",
]);
assertIncludes(join(kitDir, "PREPARER-KIT-USB.cmd"), [
  "PREPARER-KIT-USB-WINDOWS.ps1",
]);
assertIncludes(join(kitDir, "PREPARER-KIT-USB-WINDOWS.ps1"), [
  "FIELD-PROOF-MANIFEST.json",
  "OutilsIA-Local-Cockpit-Field-Test-Kit-",
  "Get-Volume",
  "Copy-Item",
  "FIELD-USB-EXPORT.json",
  "field_usb_export_ok",
]);
assertIncludes(join(kitDir, "IMPORTER-PACK-FICHES.cmd"), [
  "IMPORTER-PACK-FICHES-WINDOWS.ps1",
  "FIELD-ENTRIES-POST-IMPORT.md",
  "FIELD-ENTRIES-POST-IMPORT.html",
]);
assertIncludes(join(kitDir, "IMPORTER-PACK-FICHES-WINDOWS.ps1"), [
  "outilsia-field-entries-transfer-",
  "FIELD-ENTRIES-IMPORT.md",
  "FIELD-ENTRIES-POST-IMPORT.json",
  "READY_TO_ASSEMBLE",
  "Expand-Archive",
  "VALIDER-FICHES-WINDOWS.ps1",
]);
const postImport = readJson(join(kitDir, "FIELD-ENTRIES-POST-IMPORT.json"));
if (postImport.schema !== "outilsia.local_cockpit_field_post_import_status.v1") fail("unexpected post-import status schema");
if (Number(postImport.ready || 0) !== status.profiles_ready.length) fail("post-import ready count mismatch");
if (Number(postImport.required || 0) !== status.profiles_required.length) fail("post-import required count mismatch");
assertIncludes(join(kitDir, "FIELD-ENTRIES-POST-IMPORT.html"), [
  "Statut post-import OutilsIA",
  "FIELD_TESTS_INCOMPLETE",
]);
assertIncludes(join(kitDir, "OUVRIR-CARTES-PROFILS.cmd"), [
  "FIELD-PROFILE-CARDS.html",
]);
assertIncludes(join(kitDir, "OUVRIR-DISPATCH.cmd"), [
  "FIELD-DISPATCH.html",
]);
assertIncludes(join(kitDir, "OUVRIR-START-HERE.cmd"), [
  "START-HERE.html",
]);

console.log(
  `field_ready_verified build=${release.build_id} ` +
  `status=${status.status} ready=${status.profiles_ready.length}/${status.profiles_required.length} ` +
  `next=${status.next_profile_to_test || "none"} zip_sha=${proof.zip.sha256}`
);
