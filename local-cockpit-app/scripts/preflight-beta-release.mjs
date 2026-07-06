#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import https from "node:https";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const checks = [];
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function pass(name, detail = "") {
  checks.push({ ok: true, name, detail });
}

function fail(name, detail = "") {
  checks.push({ ok: false, name, detail });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: appRoot,
    encoding: "utf8",
    shell: process.platform === "win32" && command.endsWith(".cmd"),
    timeout: options.timeoutMs || 120000,
  });
}

function assertText(path, patterns, label) {
  if (!existsSync(path)) {
    fail(label, `missing ${path}`);
    return;
  }
  const text = readText(path);
  const missing = patterns.filter((pattern) => !text.includes(pattern));
  if (missing.length) fail(label, `missing: ${missing.join(", ")}`);
  else pass(label);
}

function getJson(url) {
  return new Promise((resolvePromise, reject) => {
    const req = https.request(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "OutilsIA-Local-Cockpit/0.1 Mozilla/5.0",
      },
      timeout: 15000,
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${url} returned ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolvePromise(JSON.parse(body));
        } catch (error) {
          reject(new Error(`${url} invalid JSON: ${error.message}`));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`${url} timeout`)));
    req.end();
  });
}

function checkCommand(command, args, label) {
  const result = run(command, args);
  if (result.status === 0) {
    pass(label, result.stdout.trim().split("\n").pop() || command);
  } else {
    const detail = result.error?.code === "ETIMEDOUT"
      ? `${command} ${args.join(" ")} timed out`
      : (result.stderr || result.stdout || result.error?.message || `${command} failed`);
    fail(label, String(detail).trim().slice(0, 500));
  }
}

function checkLocalFiles() {
  const pkg = readJson(join(appRoot, "package.json"));
  for (const script of ["build:beta", "build:beta:linux", "build:beta:windows", "release:beta:windows", "kit:linux", "kit:windows", "package:beta", "import:beta", "import:windows:recipe", "publish:cross-platform", "deploy:beta", "verify:catalog", "verify:upgrades", "verify:download-page", "verify:release:contract", "verify:release:prod", "verify:release:prod:fresh", "verify:beta:goal", "verify:branding", "verify:visual", "verify:visual:scanned", "verify:terrain-ux", "verify:linux:artifacts", "verify:pairing", "test:import:merge", "test:linux:artifacts", "test:publish:cross-platform", "test:release:prod", "test:windows:recipe", "verify:windows:artifacts", "verify:ui", "smoke:live", "smoke:live:account"]) {
    if (pkg.scripts?.[script]) pass(`npm script ${script}`, pkg.scripts[script]);
    else fail(`npm script ${script}`, "missing");
  }

  const tauri = readJson(join(appRoot, "src-tauri", "tauri.conf.json"));
  if (tauri.productName === "OutilsIA Local Cockpit") pass("tauri productName", tauri.productName);
  else fail("tauri productName", String(tauri.productName));
  if (/^\d+\.\d+\.\d+/.test(tauri.version || "")) pass("tauri version", tauri.version);
  else fail("tauri version", String(tauri.version));
  if (tauri.identifier === "fr.outilsia.localcockpit") pass("tauri identifier", tauri.identifier);
  else fail("tauri identifier", String(tauri.identifier));
  if (tauri.bundle?.active === true) pass("tauri bundle active");
  else fail("tauri bundle active", "bundle.active must be true");
  if (String(tauri.app?.security?.csp || "").includes("https://outilsia.fr")) pass("tauri CSP allows OutilsIA");
  else fail("tauri CSP allows OutilsIA", "connect-src must include https://outilsia.fr");

  assertText(join(repoRoot, ".github", "workflows", "local-cockpit-windows-beta.yml"), [
    "runs-on: windows-latest",
    "npm ci",
    "node --check src/app.js",
    "npm run verify:ui",
    "npm run verify:branding",
    "build-windows-beta.ps1",
    "npm run package:beta",
    "npm run verify:release:contract -- --require-platform windows-x64 --require-freshness",
    "npm run verify:windows:artifacts",
    "npm run deploy:beta -- --require-freshness",
    "make-windows-test-kit.ps1",
    "outilsia-local-cockpit-web-release",
    "outilsia-local-cockpit-windows-test-kit",
  ], "GitHub Actions Windows beta workflow");

  assertText(join(repoRoot, ".github", "workflows", "local-cockpit-linux-beta.yml"), [
    "runs-on: ubuntu-24.04",
    "libwebkit2gtk-4.1-dev",
    "npm ci",
    "npm run build:beta:linux",
    "npm run verify:linux:artifacts",
    "outilsia-local-cockpit-linux-web-release",
  ], "GitHub Actions Linux beta workflow");

  assertText(join(repoRoot, ".github", "workflows", "local-cockpit-cross-platform-beta.yml"), [
    "Local Cockpit Cross Platform Beta",
    "runs-on: windows-latest",
    "runs-on: ubuntu-24.04",
    "needs:",
    "npm run verify:release:contract -- --require-platform windows-x64 --require-freshness",
    "npm run verify:windows:artifacts",
    "npm run package:beta",
    "npm run build:beta:linux",
    "npm run verify:linux:artifacts",
    "local-cockpit-windows-web-release",
    "local-cockpit-linux-web-release",
    "npm run import:beta -- --input .artifacts/windows --replace",
    "npm run import:beta -- --input .artifacts/linux --merge",
    "npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux",
    "cross_platform_release_ok",
    "local-cockpit-cross-platform-web-release",
  ], "GitHub Actions cross-platform beta workflow");

  assertText(join(appRoot, "scripts", "package-beta.mjs"), [
    "release.json",
    "sha256",
    "primary_download",
    "downloads_by_platform",
    "assertFreshArtifacts",
    "OUTILSIA_ALLOW_STALE_ARTIFACTS",
    "windows-x64",
    "linux",
  ], "package-beta release metadata");

  assertText(join(appRoot, "scripts", "build-windows-beta.ps1"), [
    "windows_beta_build_ok",
    "Require-Npm",
    "npm.cmd",
    "Invoke-Checked $npm @(\"exec\", \"tauri\", \"build\", \"--\", \"--bundles\", \"nsis\")",
    "Get-FileHash",
    "OutilsIA Local Cockpit_${version}_x64-setup.exe",
  ], "windows beta build script");

  assertText(join(appRoot, "scripts", "release-windows-beta.ps1"), [
    "windows_beta_release_ready",
    "Require-Npm",
    "npm.cmd",
    "verify:ui",
    "preflight:beta",
    "build-windows-beta.ps1",
    "package:beta",
    "verify:release:contract",
    "--require-freshness",
    "verify-windows-artifacts.ps1",
    "Verification deploy dry-run",
    "deploy:beta",
    "make-windows-test-kit.ps1",
    "scan -> Ollama -> qwen3:0.6b -> benchmark -> PromptForge -> dialogue -> Arena -> rapport",
    "windows-native-recipe.json",
    "windows-native-recipe.md",
    "import:windows:recipe",
  ], "windows beta release orchestrator");

  assertText(join(appRoot, "scripts", "build-linux-beta.sh"), [
    "preflight-linux.sh",
    "npm run build:beta",
    "npm run package:beta",
    "npm run verify:linux:artifacts",
    "linux_beta_build_ok",
  ], "linux beta build script");

  assertText(join(appRoot, "scripts", "make-linux-build-kit.sh"), [
    "linux_build_kit_ok",
    "outilsia-local-cockpit-linux-source.tar.gz",
    "npm run build:beta:linux",
    "npm run verify:linux:artifacts",
    "npm run import:beta -- --input",
    "--merge",
  ], "linux build kit script");

  assertText(join(appRoot, "scripts", "verify-linux-artifacts.sh"), [
    "linux_artifacts_verified",
    "linux_artifact_ok",
    "verify:release:contract",
    "--require-platform linux",
    "Invalid AppImage/native ELF inspection",
    ".AppImage",
    ".deb",
    ".rpm",
  ], "linux artifact verifier");

  assertText(join(appRoot, "scripts", "test-linux-artifacts-verifier.sh"), [
    "linux_artifacts_verifier_test_ok",
    "OutilsIA-Local-Cockpit-0.1.0-beta-test-linux.AppImage",
    "verify-linux-artifacts.sh",
    "corrupted SHA256",
  ], "linux artifact verifier test");

  assertText(join(appRoot, "scripts", "publish-cross-platform-beta.mjs"), [
    "cross_platform_beta_ready",
    "cross_platform_beta_published",
    "verify-release-contract.mjs",
    "verify-linux-artifacts.sh",
    "--require-platform",
    "windows-x64",
    "linux",
  ], "cross-platform publish script");

  assertText(join(appRoot, "scripts", "test-publish-cross-platform.mjs"), [
    "publish_cross_platform_test_ok",
    "publish-cross-platform-beta.mjs",
    "OutilsIA-Local-Cockpit-0.1.0-beta-test-linux.AppImage",
    "downloads_by_platform",
  ], "cross-platform publish test");

  assertText(join(appRoot, "scripts", "install-linux-tauri-deps.sh"), [
    "libwebkit2gtk-4.1-dev",
    "libgtk-3-dev",
    "linux_tauri_deps_ok",
  ], "linux tauri dependency installer");

  assertText(join(appRoot, "scripts", "verify-windows-artifacts.ps1"), [
    "windows_artifacts_ok",
    "launch_smoke_ok",
    "primary_download",
    "Hash-Lower",
    "release.freshness is missing",
    "release.freshness.stale must be false",
    "release_freshness_ok",
    "optional_absent",
  ], "windows artifact verifier");

  assertText(join(appRoot, "scripts", "make-windows-test-kit.ps1"), [
    "windows_test_kit_created",
    "public_release_match_ok",
    "Verifier-et-lancer.ps1",
    "RECETTE-MANUELLE.md",
    "RECETTE-RESULTAT.json",
    "RECETTE-RESULTAT*.json",
    "recette_depuis_telechargements",
    "GetFolderPath('UserProfile')",
    "recipe_prefilled",
    "01-verifier-et-lancer.cmd",
    "02-ouvrir-recette.cmd",
    "03-importer-recette.cmd",
    "04-verifier-recette.cmd",
    "Verifier-recette.ps1",
    "recette_incomplete",
    "windows-native-recipe.md",
    "start notepad",
    "npm run import:windows:recipe",
    "npm run verify:beta:goal",
    "Lancer OutilsIA Local Cockpit.lnk",
    "Release publique sans preuve de fraicheur",
    "public_release_freshness_ok",
    "Auto-test",
    "qwen3:0.6b",
    "Deuxieme modele recommande",
    "Rapport machine prete",
    "Pack decision",
    "Copier pack",
  ], "windows tester kit script");

  assertText(join(appRoot, "scripts", "deploy-beta-release.mjs"), [
    "release_valid",
    "remote_release_ok",
    "SHA256 mismatch",
    "backup:",
    "--require-freshness",
    "release.freshness.stale must be false",
    "freshness=ok",
  ], "deploy-beta release verifier");

  assertText(join(appRoot, "scripts", "import-beta-artifact.mjs"), [
    "release.json",
    "SHA256 mismatch",
    "windows-x64",
    "linux",
    "--replace",
    "--merge",
    "artifact_merged",
    "downloads_by_platform",
  ], "import-beta artifact verifier");

  assertText(join(appRoot, "scripts", "import-windows-recipe.mjs"), [
    "windows_recipe_imported",
    "windows_recipe_report",
    "windows-native-recipe.md",
    "OK beta diffusable",
    "Recette Windows OutilsIA Local Cockpit",
    "Recipe ok must be true",
    "second_model.ref",
    "report.share_url",
    "native_flow.qwen_benchmark",
    "native_flow.promptforge",
    "native_flow.dialogue",
    "native_flow.arena",
    "report.saved_account",
    "report.shared",
    "verify:beta:goal",
  ], "windows recipe import verifier");

  assertText(join(appRoot, "scripts", "test-import-beta-merge.mjs"), [
    "import_beta_merge_ok",
    "--merge",
    "downloads_by_platform",
    "windows-x64",
    "linux",
    "verify-linux-artifacts.sh",
    "linux_artifacts_verified",
  ], "import-beta merge test");

  assertText(join(appRoot, "scripts", "test-windows-recipe-import.mjs"), [
    "windows_recipe_import_test_ok",
    "Imported Markdown report",
    "windows-native-recipe.md",
    "valid.json",
    "recipe not approved",
    "missing share_url",
    "missing second model",
    "missing arena",
    "previousOutput",
  ], "windows recipe import test");

  assertText(join(appRoot, "scripts", "verify-public-release.mjs"), [
    "public_release_ok",
    "public_release_absent_optional",
    "SHA256 mismatch",
    "windows-x64",
    "downloads_by_platform",
    "linux",
    "--require-platform",
    "--require-freshness",
    "public_release_ok",
    "freshness=ok",
    "release.freshness.stale must be false",
    "Missing required platform",
  ], "public release verifier");

  assertText(join(appRoot, "scripts", "test-public-release-verifier.mjs"), [
    "public_release_verifier_test_ok",
    "--require-platform",
    "--require-freshness",
    "freshness=ok",
    "release.freshness.stale must be false",
    "windows-x64",
    "linux",
    "Missing required platform: macos",
  ], "public release verifier test");

  assertText(join(appRoot, "scripts", "verify-download-page-contract.mjs"), [
    "download_page_contract_ok",
    "downloadBtn.href = trackedUrlFor(file)",
    "downloadMeter",
    "release_notes",
    "Build ID",
    "SHA256",
    "Freshness",
    "--require-freshness",
    "Preuve de fraîcheur absente",
  ], "download page contract verifier");

  assertText(join(appRoot, "scripts", "verify-beta-goal.mjs"), [
    "release_freshness",
    "guided_flow_wiring",
    "native_recipe_ok",
    "second_model_evidence",
    "shareable_report_evidence",
    "native_recipe_evidence",
    "windows_shell_available",
    "beta_goal_not_complete",
    "beta_goal_ready",
  ], "beta goal completion verifier");

  assertText(join(appRoot, "scripts", "verify-release-contract.mjs"), [
    "release_contract_ok",
    "downloads_by_platform",
    "windows-x64",
    "linux",
    "Invalid native extension",
    "Missing required platform",
    "--require-freshness",
    "release.freshness.stale must be false",
  ], "native release contract verifier");

  assertText(join(appRoot, "scripts", "verify-model-catalog.mjs"), [
    "local-ai-models.json",
    "vram_q4",
    "ollama",
    "model_catalog_ok",
  ], "model catalog verifier");

  assertText(join(appRoot, "scripts", "verify-upgrade-catalog.mjs"), [
    "local-ai-upgrades.json",
    "affiliate_url",
    "OUTILSIA_AMAZON_TAG",
    "upgrade_catalog_ok",
  ], "upgrade catalog verifier");

  assertText(join(appRoot, "src-tauri", "src", "lib.rs"), [
    "upgrade_markdown_lines",
    "shopping_list_markdown",
    "06-Shopping-list.md",
    "Shopping list OutilsIA",
    "price_range_eur",
    "A eviter",
    "Effet estime",
    "affiliate_disclosure",
  ], "memoryforge upgrade export wiring");

  assertText(join(appRoot, "src", "app.js"), [
    "copyBetaReportBtn",
    "betaReportMarkdown",
    "Rapport recette beta OutilsIA Local Cockpit",
    "Rapport app copié",
    "copyWindowsRecipeEvidence",
    "downloadWindowsRecipeEvidence",
    "RECETTE-RESULTAT.json",
    "windowsRecipeEvidence",
    "release_freshness_ok",
    "second_model",
  ], "desktop beta report wiring");

  assertText(join(appRoot, "src", "app.js"), [
    "decisionPackMarkdown",
    "shoppingListMarkdown",
    "copyDecisionPack",
    "copyShoppingList",
    "saveDecisionPackLocal",
    "Pack decision OutilsIA Local Cockpit",
    "Shopping list OutilsIA Local Cockpit",
    "renderDecisionPack",
  ], "desktop decision pack wiring");

  assertText(join(appRoot, "src", "styles.css"), [
    ".brand-mark",
    "repeat(12",
    "backdrop-filter",
    "--line-strong",
  ], "desktop cockpit visual design");

  assertText(join(appRoot, "scripts", "verify-branding.mjs"), [
    "branding_ok",
    "OutilsIA Local Cockpit",
    "icon.png",
    "512",
  ], "desktop branding verifier");

  assertText(join(appRoot, "scripts", "verify-visual-ui.py"), [
    "visual_ui_ok",
    ".artifacts",
    "brand-mark",
    "button overflow",
    "desktop grid",
  ], "desktop visual UI verifier");

  assertText(join(appRoot, "src", "app.js"), [
    "catalogSnapshot",
    "renderCatalogStatus",
    "catalogReportMarkdown",
    "copyCatalogReport",
    "État catalogues OutilsIA Local Cockpit",
  ], "desktop catalog evolution wiring");

  assertText(join(appRoot, "src-tauri", "src", "lib.rs"), [
    "install_ollama_model",
    "ollama",
    "pull",
    "InstallModelResult",
  ], "desktop Ollama install command");

  assertText(join(appRoot, "src", "app.js"), [
    "data-install-model",
    "installRecommendedModel",
    "Installer",
  ], "desktop Ollama install UI");

  assertText(join(appRoot, "src", "app.js"), [
    "buildUpgradeImpact",
    "renderUpgradeImpact",
    "upgradeImpactMarkdown",
    "copyUpgradeImpact",
    "Impact upgrade OutilsIA Local Cockpit",
  ], "desktop upgrade impact wiring");

  assertText(join(appRoot, "src", "app.js"), [
    "localHistoryMarkdown",
    "copyLocalHistory",
    "refreshSnapshotCompatibility",
    "snapshotRefreshDeltaMarkdown",
    "renderSnapshotRefreshDelta",
    "Actualisation catalogue OutilsIA",
    "Actualiser catalogue",
    "Snapshot actualisé avec le catalogue actuel",
    "Historique local OutilsIA Local Cockpit",
    "Historique local copié en Markdown",
  ], "desktop local history export wiring");

  assertText(join(appRoot, "scripts", "smoke-live-desktop-account.py"), [
    "live_desktop_account_ok",
    "/api/desktop/sync",
    "/api/desktop/feedback",
    "assert_enriched_upgrades",
    "Prix indicatif",
    "Shopping list OutilsIA",
    "/api/desktop/token/revoke",
    "remote_cleanup_ok",
  ], "live desktop account smoke");

  assertText(join(appRoot, "scripts", "verify-desktop-pairing.py"), [
    "desktop_pairing_ok",
    "assert_enriched_upgrades",
    "Prix indicatif",
    "Shopping list OutilsIA",
    "upgrade_catalog_version",
  ], "local desktop pairing smoke");

  assertText(join(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html"), [
    "/static/downloads/local-cockpit/release.json",
    "SHA256",
    "Builds desktop prepares",
    "Auto-test",
    "Build ID",
    "freshnessBox",
    "Build reconstruit après les sources",
    "Artefact potentiellement périmé",
    "downloadList",
    "platformLabel",
    "verifyCommandFor",
    "Télécharger pour",
  ], "public download page release wiring");

  assertText(join(repoRoot, "server-work", "static", "pages", "securite-confidentialite-scanner.html"), [
    "SmartScreen",
    "Hash public",
    "Jamais lu",
  ], "security page beta trust wiring");

  assertText(join(repoRoot, "server-work", "static", "pages", "problemes-connus-scanner-ia-local.html"), [
    "SmartScreen",
    "GPU ou VRAM",
    "Feedback beta",
  ], "known issues beta page");
}

function checkReleaseDir() {
  const releaseDir = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");
  if (!existsSync(releaseDir)) {
    fail("release directory", "missing");
    return;
  }
  const files = readdirSync(releaseDir).filter((name) => name !== ".gitkeep");
  if (!files.length) {
    pass("release directory empty", "no stale beta binary in local tree");
    return;
  }
  const releasePath = join(releaseDir, "release.json");
  if (!existsSync(releasePath)) {
    fail("release directory", `files exist without release.json: ${files.join(", ")}`);
    return;
  }
  const release = readJson(releasePath);
  const missingFiles = (release.files || []).filter((file) => !existsSync(join(releaseDir, file.name)));
  if (missingFiles.length) {
    fail("release.json local files", missingFiles.map((file) => file.name).join(", "));
  } else {
    const totalSize = (release.files || []).reduce((sum, file) => sum + statSync(join(releaseDir, file.name)).size, 0);
    pass("release.json local files", `${release.files?.length || 0} file(s), ${totalSize} bytes`);
  }
}

async function checkProdManifest() {
  try {
    const manifest = await getJson("https://outilsia.fr/api/desktop/manifest");
    const features = manifest.features || {};
    const endpoints = manifest.endpoints || {};
    if (manifest.upgrade_catalog_version) pass("prod desktop manifest upgrade catalog", manifest.upgrade_catalog_version);
    else fail("prod desktop manifest upgrade catalog", "missing upgrade_catalog_version");
    const requiredFeatures = ["pairing", "desktop_token", "sync_machine", "sync_benchmark", "share_report", "memoryforge_export", "obsidian_vault_export", "delete_machine", "feedback"];
    const missingFeatures = requiredFeatures.filter((name) => features[name] !== true);
    if (missingFeatures.length) fail("prod desktop manifest features", missingFeatures.join(", "));
    else pass("prod desktop manifest features", manifest.current_version || "");
    const requiredEndpoints = ["desktop_sync", "desktop_updates", "desktop_memoryforge", "desktop_feedback", "machine_share", "machine_delete"];
    const missingEndpoints = requiredEndpoints.filter((name) => !endpoints[name]);
    if (missingEndpoints.length) fail("prod desktop manifest endpoints", missingEndpoints.join(", "));
    else pass("prod desktop manifest endpoints");
  } catch (error) {
    fail("prod desktop manifest", error.message);
  }
}

async function main() {
  checkLocalFiles();
  checkReleaseDir();
  checkCommand("node", ["--version"], "node available");
  checkCommand(npmCommand, ["--version"], "npm available");
  checkCommand(npmCommand, ["run", "verify:catalog"], "model catalog verifier");
  checkCommand(npmCommand, ["run", "verify:upgrades"], "upgrade catalog verifier");
  checkCommand(npmCommand, ["run", "verify:download-page"], "download page contract verifier");
  checkCommand(npmCommand, ["run", "verify:ui"], "desktop static UI verifier");
  checkCommand(npmCommand, ["run", "verify:branding"], "desktop branding verifier");
  checkCommand(npmCommand, ["run", "verify:visual"], "desktop visual UI verifier");
  checkCommand(npmCommand, ["run", "verify:visual:scanned"], "desktop scanned UI verifier");
  checkCommand(npmCommand, ["run", "verify:terrain-ux"], "terrain 30s UX verifier");
  checkCommand(npmCommand, ["run", "verify:release:contract", "--", "--require-platform", "windows-x64"], "native release contract verifier");
  checkCommand(npmCommand, ["run", "verify:pairing"], "local desktop pairing verifier");
  checkCommand(npmCommand, ["run", "test:import:merge"], "import beta merge verifier");
  checkCommand(npmCommand, ["run", "test:linux:artifacts"], "linux artifact verifier test");
  checkCommand(npmCommand, ["run", "test:publish:cross-platform"], "cross-platform publish verifier");
  checkCommand(npmCommand, ["run", "test:release:prod"], "public release verifier test");
  checkCommand(npmCommand, ["run", "test:windows:recipe"], "windows recipe import verifier");
  await checkProdManifest();

  const failed = checks.filter((check) => !check.ok);
  for (const check of checks) {
    const marker = check.ok ? "ok" : "fail";
    console.log(`${marker}: ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
  }
  if (failed.length) {
    console.error(`preflight_beta_release_failed ${failed.length}/${checks.length}`);
    process.exit(1);
  }
  console.log(`preflight_beta_release_ok ${checks.length} checks`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
