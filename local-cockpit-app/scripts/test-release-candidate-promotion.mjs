#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { importRcSmoke } from "./import-release-candidate-smoke.mjs";
import { preparePromotion } from "./promote-release-candidate.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const pageTemplate = join(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html");
const fixtureBuildId = "301234567891";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function run(script, args) {
  const result = spawnSync("node", [join(appRoot, "scripts", script), ...args], {
    cwd: appRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      OUTILSIA_RC_SOURCE_TRACKED_DIRTY_AT_START: "false",
    },
  });
  if (result.status !== 0) throw new Error(`${script} failed\n${result.stdout}\n${result.stderr}`);
}

function reportBody(gpu, tps) {
  return `<!doctype html><html><head><title>Machine prete pour l'IA locale - ${gpu}</title><meta name="description" content="Rapport OutilsIA Local Cockpit pour ${gpu}"></head><body><h1>${gpu}</h1><p>qwen3:0.6b a ${tps} tok/s</p></body></html>`;
}

function smokeResult(candidate, candidateManifestPath, id, machine, tps, url, body) {
  return {
    schema: "outilsia.local_cockpit_rc_smoke.v1",
    ok: true,
    validated_at: new Date().toISOString(),
    candidate: {
      version: candidate.version,
      label: candidate.label,
      build_id: candidate.build_id,
      channel: "rc",
      source_commit: candidate.source.commit,
      manifest_sha256: sha256File(candidateManifestPath),
      artifact_set_sha256: candidate.build_provenance.artifact_set_sha256,
      public_deploy_allowed: false,
    },
    machine: {
      ...machine,
      anchor_sha256: sha256(`fixture-anchor-${id}`),
      fingerprint_sha256: sha256(`fixture-machine-${id}`),
    },
    benchmark: {
      model: "qwen3:0.6b",
      tokens_per_second: tps,
      elapsed_ms: 2200 + id,
      execution_mode: "auto",
      runtime_processor: "gpu",
      gpu_offload_percent: 100,
      measurement_source: "ollama_api",
    },
    shared_report: {
      url,
      http_status: 200,
      gpu_identity_matched: true,
      body_sha256: sha256(body),
    },
    source_recipe: {
      name: "RECETTE-RESULTAT.json",
      sha256: sha256(`fixture-recipe-${id}`),
    },
    validator: {
      schema: "outilsia.local_cockpit_rc_smoke_validator.v1",
      network_rechecked: true,
    },
    full_terrain_gate_complete: false,
    note: "Fixture deterministic RC smoke.",
  };
}

const root = mkdtempSync(join(tmpdir(), "outilsia-rc-promotion-"));
try {
  const fixtureArtifacts = join(root, "artifacts");
  const windowsDir = join(root, "windows");
  const linuxDir = join(root, "linux");
  const mergedDir = join(root, "merged");
  const registryDir = join(root, "registry");
  const promotionDir = join(root, "promotion");
  mkdirSync(fixtureArtifacts, { recursive: true });
  const portable = join(fixtureArtifacts, "outilsia-local-cockpit.exe");
  const setup = join(fixtureArtifacts, "OutilsIA Local Cockpit_0.1.2_x64-setup.exe");
  const appImage = join(fixtureArtifacts, "OutilsIA Local Cockpit_0.1.2_amd64.AppImage");
  writeFileSync(portable, "fixture portable bytes");
  writeFileSync(setup, "fixture setup bytes");
  writeFileSync(appImage, "fixture appimage bytes");
  run("package-release-candidate.mjs", [
    "--artifact", portable,
    "--artifact", setup,
    "--output-dir", windowsDir,
    "--rc", "4",
    "--build-id", fixtureBuildId,
    "--replace",
  ]);
  run("package-release-candidate.mjs", [
    "--artifact", appImage,
    "--output-dir", linuxDir,
    "--rc", "4",
    "--build-id", fixtureBuildId,
    "--replace",
  ]);
  run("merge-release-candidate.mjs", [
    "--input", windowsDir,
    "--input", linuxDir,
    "--output-dir", mergedDir,
    "--replace",
  ]);

  const windowsManifestPath = join(windowsDir, "release-candidate.json");
  const windowsCandidate = JSON.parse(readFileSync(windowsManifestPath, "utf8"));
  const bodies = new Map();
  const fixtures = [
    {
      id: 1,
      machine: { cpu: "Intel Core i7-4790K", ram_gb: 16, gpu: "NVIDIA GeForce GTX 1080 Ti", vram_gb: 11, os: "Windows 11" },
      tps: 42.5,
      url: "https://outilsia.fr/r/FixturePromotionMachineOne",
    },
    {
      id: 2,
      machine: { cpu: "AMD Ryzen 7 7800X3D", ram_gb: 64, gpu: "NVIDIA GeForce RTX 4080 SUPER", vram_gb: 16, os: "Windows 11" },
      tps: 128.7,
      url: "https://outilsia.fr/r/FixturePromotionMachineTwo",
    },
  ];
  const inputDirs = [];
  for (const fixture of fixtures) {
    const inputDir = join(root, `smoke-${fixture.id}`);
    mkdirSync(inputDir, { recursive: true });
    const body = reportBody(fixture.machine.gpu, fixture.tps);
    bodies.set(fixture.url, body);
    const result = smokeResult(
      windowsCandidate,
      windowsManifestPath,
      fixture.id,
      fixture.machine,
      fixture.tps,
      fixture.url,
      body,
    );
    writeFileSync(join(inputDir, `RC-SMOKE-fixture-${fixture.id}.json`), `${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(join(inputDir, "release-candidate.json"), readFileSync(windowsManifestPath));
    writeFileSync(join(inputDir, "RECETTE-RESULTAT.json"), `fixture-recipe-${fixture.id}`);
    inputDirs.push(inputDir);
  }
  const fetchImpl = async (url) => new Response(bodies.get(String(url)) || "not found", {
    status: bodies.has(String(url)) ? 200 : 404,
    headers: { "content-type": "text/html" },
  });
  for (const input of inputDirs) {
    await importRcSmoke({ input, candidateDir: mergedDir, registryDir, reportBody: "", fetchImpl });
  }
  const rerunDir = join(root, "smoke-machine-rerun");
  mkdirSync(rerunDir, { recursive: true });
  const rerunUrl = "https://outilsia.fr/r/FixturePromotionMachineOneRerun";
  const rerunMachine = { ...fixtures[0].machine, ram_gb: 32 };
  const rerunBody = reportBody(rerunMachine.gpu, 47.2);
  bodies.set(rerunUrl, rerunBody);
  const rerunResult = smokeResult(
    windowsCandidate,
    windowsManifestPath,
    5,
    rerunMachine,
    47.2,
    rerunUrl,
    rerunBody,
  );
  rerunResult.machine.anchor_sha256 = sha256("fixture-anchor-1");
  writeFileSync(join(rerunDir, "RC-SMOKE-machine-rerun.json"), `${JSON.stringify(rerunResult, null, 2)}\n`);
  writeFileSync(join(rerunDir, "release-candidate.json"), readFileSync(windowsManifestPath));
  writeFileSync(join(rerunDir, "RECETTE-RESULTAT.json"), "fixture-recipe-5");
  const rerunImport = await importRcSmoke({
    input: rerunDir,
    candidateDir: mergedDir,
    registryDir,
    reportBody: "",
    fetchImpl,
  });
  if (rerunImport.status.unique_machines !== 2 || rerunImport.registry.runs.length !== 3) {
    throw new Error("A rerun of the same physical machine was counted as a new machine");
  }
  const duplicate = await importRcSmoke({
    input: inputDirs[0],
    candidateDir: mergedDir,
    registryDir,
    reportBody: "",
    fetchImpl,
  });
  if (!duplicate.duplicate || duplicate.registry.runs.length !== 3) {
    throw new Error("Exact RC smoke duplicate was not deduplicated");
  }
  const reusedReportDir = join(root, "smoke-reused-report");
  mkdirSync(reusedReportDir, { recursive: true });
  const reusedBody = bodies.get(fixtures[0].url);
  const reusedResult = smokeResult(
    windowsCandidate,
    windowsManifestPath,
    3,
    fixtures[0].machine,
    fixtures[0].tps,
    fixtures[0].url,
    reusedBody,
  );
  writeFileSync(join(reusedReportDir, "RC-SMOKE-reused-report.json"), `${JSON.stringify(reusedResult, null, 2)}\n`);
  writeFileSync(join(reusedReportDir, "release-candidate.json"), readFileSync(windowsManifestPath));
  writeFileSync(join(reusedReportDir, "RECETTE-RESULTAT.json"), "fixture-recipe-3");
  let reusedReportRejected = false;
  try {
    await importRcSmoke({
      input: reusedReportDir,
      candidateDir: mergedDir,
      registryDir,
      reportBody: "",
      fetchImpl,
    });
  } catch (error) {
    reusedReportRejected = String(error.message || error).includes("already attached");
  }
  if (!reusedReportRejected) throw new Error("Reused shared report URL was not rejected");

  const tamperedRecipeDir = join(root, "smoke-tampered-recipe");
  mkdirSync(tamperedRecipeDir, { recursive: true });
  writeFileSync(
    join(tamperedRecipeDir, "RC-SMOKE-tampered-recipe.json"),
    readFileSync(join(inputDirs[0], "RC-SMOKE-fixture-1.json")),
  );
  writeFileSync(join(tamperedRecipeDir, "release-candidate.json"), readFileSync(windowsManifestPath));
  writeFileSync(join(tamperedRecipeDir, "RECETTE-RESULTAT.json"), "tampered recipe bytes");
  let tamperedRecipeRejected = false;
  try {
    await importRcSmoke({
      input: tamperedRecipeDir,
      candidateDir: mergedDir,
      registryDir,
      reportBody: "",
      fetchImpl,
    });
  } catch (error) {
    tamperedRecipeRejected = String(error.message || error).includes("Source recipe SHA256");
  }
  if (!tamperedRecipeRejected) throw new Error("Tampered source recipe was not rejected");

  const changedReportDir = join(root, "smoke-changed-report");
  mkdirSync(changedReportDir, { recursive: true });
  const changedReportUrl = "https://outilsia.fr/r/FixturePromotionChangedReport";
  const originalReportBody = reportBody(fixtures[1].machine.gpu, 88.8);
  bodies.set(changedReportUrl, `${originalReportBody}\n<!-- changed after validation -->`);
  const changedReportResult = smokeResult(
    windowsCandidate,
    windowsManifestPath,
    4,
    fixtures[1].machine,
    88.8,
    changedReportUrl,
    originalReportBody,
  );
  writeFileSync(
    join(changedReportDir, "RC-SMOKE-changed-report.json"),
    `${JSON.stringify(changedReportResult, null, 2)}\n`,
  );
  writeFileSync(join(changedReportDir, "release-candidate.json"), readFileSync(windowsManifestPath));
  writeFileSync(join(changedReportDir, "RECETTE-RESULTAT.json"), "fixture-recipe-4");
  let changedReportRejected = false;
  try {
    await importRcSmoke({
      input: changedReportDir,
      candidateDir: mergedDir,
      registryDir,
      reportBody: "",
      fetchImpl,
    });
  } catch (error) {
    changedReportRejected = String(error.message || error).includes("body hash changed");
  }
  if (!changedReportRejected) throw new Error("Changed shared report body was not rejected");

  const statusPath = join(registryDir, "RC-SMOKE-STATUS.json");
  const status = JSON.parse(readFileSync(statusPath, "utf8"));
  if (status.status !== "RC_SMOKE_GATE_READY" || status.unique_machines !== 2 || status.network_verified_machines !== 2) {
    throw new Error(`Unexpected RC smoke status: ${JSON.stringify(status)}`);
  }

  const mergedManifestPath = join(mergedDir, "release-candidate.json");
  const mergedCandidate = JSON.parse(readFileSync(mergedManifestPath, "utf8"));
  const decisionPath = join(registryDir, "PROMOTION-DECISION.json");
  const decision = {
    schema: "outilsia.local_cockpit_rc_promotion_decision.v1",
    decision: "approve_public_beta",
    candidate: {
      version: mergedCandidate.version,
      label: mergedCandidate.label,
      build_id: mergedCandidate.build_id,
      source_commit: mergedCandidate.source.commit,
      manifest_sha256: sha256File(mergedManifestPath),
      artifact_set_sha256: mergedCandidate.build_provenance.artifact_set_sha256,
    },
    smoke_status_sha256: sha256File(statusPath),
    decided_at: new Date().toISOString(),
    decided_by: "test-suite",
    reason: "Two unique network-verified fixture machines passed the deterministic promotion contract.",
    acknowledgements: {
      publish_exact_rc_artifact_bytes: true,
      full_terrain_gate_incomplete: true,
      public_claim_limited_to_beta: true,
      rollback_prepared: true,
    },
  };
  const pendingDecisionPath = join(registryDir, "PROMOTION-DECISION-PENDING.json");
  writeFileSync(
    pendingDecisionPath,
    `${JSON.stringify({ ...decision, decision: "pending" }, null, 2)}\n`,
  );
  let pendingDecisionRejected = false;
  try {
    await preparePromotion({
      candidateDir: mergedDir,
      registryDir,
      decision: pendingDecisionPath,
      output: join(root, "pending-promotion"),
      pageTemplate,
      replace: true,
    }, { fetchImpl });
  } catch (error) {
    pendingDecisionRejected = String(error.message || error).includes("not approve_public_beta");
  }
  if (!pendingDecisionRejected) throw new Error("Pending human promotion decision was not rejected");

  writeFileSync(decisionPath, `${JSON.stringify(decision, null, 2)}\n`);
  await preparePromotion({
    candidateDir: mergedDir,
    registryDir,
    decision: decisionPath,
    output: promotionDir,
    pageTemplate,
    replace: true,
  }, { fetchImpl });
  const release = JSON.parse(readFileSync(join(promotionDir, "release.json"), "utf8"));
  const candidateHashes = new Set(mergedCandidate.files.map((file) => file.sha256));
  if (!release.files.every((file) => candidateHashes.has(file.sha256))) {
    throw new Error("Promotion rebuilt or changed RC artifact bytes");
  }
  if (new Set(release.files.map((file) => file.name)).size !== release.files.length) {
    throw new Error("Promotion produced duplicate public artifact names");
  }
  if (!existsSync(join(promotionDir, "PROMOTION-PROOF.json"))
    || !existsSync(join(promotionDir, "telecharger-scanner-ia-local.html"))) {
    throw new Error("Promotion proof or staged download page is missing");
  }
  const deployDryRun = spawnSync("node", [
    join(appRoot, "scripts", "deploy-beta-release.mjs"),
    "--release-dir", promotionDir,
    "--page", join(promotionDir, "telecharger-scanner-ia-local.html"),
    "--promotion-proof", join(promotionDir, "PROMOTION-PROOF.json"),
    "--require-freshness",
  ], { cwd: appRoot, encoding: "utf8" });
  if (deployDryRun.status !== 0 || !deployDryRun.stdout.includes("Add --deploy to publish this release.")) {
    throw new Error(`Promoted release deploy dry-run failed\n${deployDryRun.stdout}\n${deployDryRun.stderr}`);
  }
  const tamperedArtifactPath = join(promotionDir, release.files[0].name);
  const originalArtifactBytes = readFileSync(tamperedArtifactPath);
  writeFileSync(tamperedArtifactPath, Buffer.concat([originalArtifactBytes, Buffer.from("tampered")]));
  const tamperedDeploy = spawnSync("node", [
    join(appRoot, "scripts", "deploy-beta-release.mjs"),
    "--release-dir", promotionDir,
    "--page", join(promotionDir, "telecharger-scanner-ia-local.html"),
    "--promotion-proof", join(promotionDir, "PROMOTION-PROOF.json"),
    "--require-freshness",
  ], { cwd: appRoot, encoding: "utf8" });
  writeFileSync(tamperedArtifactPath, originalArtifactBytes);
  const tamperedDeployOutput = `${tamperedDeploy.stdout}\n${tamperedDeploy.stderr}`;
  if (tamperedDeploy.status === 0 || !/Size mismatch|SHA256 mismatch/.test(tamperedDeployOutput)) {
    throw new Error("Tampered promoted artifact was not rejected before deployment");
  }

  const rollback = spawnSync("node", [
    join(appRoot, "scripts", "rollback-beta-release.mjs"),
    "--backup-dir", "/var/backups/outilsia-local-cockpit/release_20260725010101",
    "--expected-current-build", fixtureBuildId,
  ], { cwd: appRoot, encoding: "utf8" });
  if (rollback.status !== 0 || !rollback.stdout.includes("dry_run=true")) {
    throw new Error(`Rollback dry-run contract failed\n${rollback.stdout}\n${rollback.stderr}`);
  }
  console.log("release_candidate_promotion_test_ok physical_dedup recipe_hash report_hash human_gate exact_bytes staged_page rollback_dry_run");
} finally {
  rmSync(root, { recursive: true, force: true });
}
