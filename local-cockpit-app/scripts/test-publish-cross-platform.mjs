#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function nativeLinuxFixture() {
  const path = ["/bin/true", "/usr/bin/true"].find((candidate) => existsSync(candidate));
  if (!path) throw new Error("missing /bin/true or /usr/bin/true");
  return readFileSync(path);
}

function writeRelease(root, files, buildId) {
  mkdirSync(root, { recursive: true });
  const releaseFiles = files.map((file) => {
    const path = join(root, file.name);
    writeFileSync(path, file.content);
    const size = readFileSync(path).length;
    return {
      name: file.name,
      original_name: file.originalName || file.name,
      platform: file.platform,
      size_bytes: size,
      sha256: sha256(path),
      url: `/static/downloads/local-cockpit/${file.name}`,
    };
  });
  const primary = releaseFiles.find((file) => file.platform === "windows-x64" && file.name.endsWith(".exe")) || releaseFiles[0];
  const downloadsByPlatform = releaseFiles.reduce((acc, file) => {
    if (!acc[file.platform]) acc[file.platform] = [];
    acc[file.platform].push(file);
    return acc;
  }, {});
  const artifactPlatforms = [...new Set(releaseFiles.map((file) => file.platform))].sort();
  writeFileSync(join(root, "release.json"), `${JSON.stringify({
    ok: true,
    product: "OutilsIA Local Cockpit",
    channel: "beta",
    version: "0.1.0",
    label: "0.1.0-beta",
    build_id: buildId,
    published_at: "2026-06-30T20:00:00.000Z",
    build_provenance: {
      schema: "outilsia.local_cockpit_build_provenance.v1",
      packaged_at: "2026-06-30T20:00:00.000Z",
      build_id: buildId,
      version: "0.1.0",
      ci: false,
      runner_os: artifactPlatforms.includes("linux") ? "Linux" : "Windows",
      node_platform: artifactPlatforms.includes("linux") ? "linux" : "win32",
      node_arch: "x64",
      artifact_platforms: artifactPlatforms,
      github: {
        workflow: "",
        run_id: "",
        run_attempt: "",
        ref: "",
        sha: "",
        repository: "",
      },
    },
    features: ["upgrade_digital_twin_v1", "runtime_driver_intelligence_v1", "private_workload_packs_v1", "local_capability_bridge_v1"],
    release_notes: [
      "Upgrade Digital Twin v1 publish cross-platform test",
      "Runtime & Driver Intelligence v1 publish cross-platform test",
      "Private Workload Packs v1 publish cross-platform test",
      "Local Capability Bridge v1 publish cross-platform test"
    ],
    freshness: {
      stale: false,
      allow_stale: false,
      newest_source: "local-cockpit-app/src/app.js",
      oldest_artifact: "fixture/native-artifact",
      newest_source_mtime_ms: 1500,
      oldest_artifact_mtime_ms: 1000,
    },
    primary_download: primary,
    downloads_by_platform: downloadsByPlatform,
    files: releaseFiles,
  }, null, 2)}\n`);
}

function run(args) {
  const result = spawnSync("node", ["scripts/publish-cross-platform-beta.mjs", ...args], {
    cwd: appRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

function runExpectFailure(args, expected) {
  const result = spawnSync("node", ["scripts/publish-cross-platform-beta.mjs", ...args], {
    cwd: appRoot,
    encoding: "utf8",
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0) {
    throw new Error(`expected failure but command passed: ${output}`);
  }
  if (!output.includes(expected)) {
    throw new Error(`expected failure containing ${expected}, got: ${output}`);
  }
  return output;
}

const root = mkdtempSync(join(tmpdir(), "outilsia-publish-cross-platform-test-"));
try {
  const windows = join(root, "windows");
  const linux = join(root, "linux");
  const out = join(root, "out");
  writeRelease(windows, [
    { name: "OutilsIA-Local-Cockpit-0.1.0-beta-test-windows-x64.exe", platform: "windows-x64", content: "windows setup" },
    { name: "OutilsIA-Local-Cockpit-0.1.0-beta-test-windows-x64.msi", platform: "windows-x64", content: "windows msi" },
  ], "testwin");
  writeRelease(linux, [
    { name: "OutilsIA-Local-Cockpit-0.1.0-beta-test-linux.AppImage", platform: "linux", content: nativeLinuxFixture() },
  ], "testwin");

  const fieldStatus = join(root, "FIELD-TESTS-STATUS.json");
  writeFileSync(fieldStatus, `${JSON.stringify({
    schema: "outilsia.local_cockpit_field_status.v1",
    ready: 1,
    required: 5,
    minimum_ready_before_linux_publication: 2,
    profiles_ready: ["rtx_4080_4090"],
    profiles_missing: ["old_laptop", "core_i7_gtx_1080_ti", "rtx_3060_12gb", "cpu_only"],
    next_profile_to_test: "old_laptop",
  }, null, 2)}\n`);

  const output = run(["--windows", windows, "--linux", linux, "--release-dir", out]);
  if (!output.includes("cross_platform_beta_ready dry_run")) throw new Error(output);
  const release = JSON.parse(readFileSync(join(out, "release.json"), "utf8"));
  const platforms = new Set(release.files.map((file) => file.platform));
  if (!platforms.has("windows-x64")) throw new Error("missing windows-x64 after publish script");
  if (!platforms.has("linux")) throw new Error("missing linux after publish script");
  if (!release.downloads_by_platform?.["windows-x64"]?.length) throw new Error("missing windows downloads_by_platform");
  if (!release.downloads_by_platform?.linux?.length) throw new Error("missing linux downloads_by_platform");
  if (JSON.stringify(release.build_provenance?.artifact_platforms) !== JSON.stringify(["linux", "windows-x64"])) {
    throw new Error(`bad cross-platform provenance ${JSON.stringify(release.build_provenance)}`);
  }
  if (release.build_provenance?.merged_release !== true) throw new Error("cross-platform provenance must mark merged_release=true");
  const publicReleasePath = resolve(appRoot, "..", "server-work", "static", "downloads", "local-cockpit", "release.json");
  const publicReleaseBefore = readFileSync(publicReleasePath, "utf8");
  const temporaryOutput = run(["--windows", windows, "--linux", linux]);
  if (!temporaryOutput.includes("cross_platform_beta_ready dry_run")) throw new Error(temporaryOutput);
  if (readFileSync(publicReleasePath, "utf8") !== publicReleaseBefore) {
    throw new Error("dry run without --release-dir must not mutate the public release tree");
  }
  const previousFieldStatus = process.env.OUTILSIA_FIELD_STATUS_JSON;
  process.env.OUTILSIA_FIELD_STATUS_JSON = fieldStatus;
  runExpectFailure(["--windows", windows, "--linux", linux, "--release-dir", join(root, "deploy-blocked"), "--deploy"], "Linux public deploy blocked");
  writeFileSync(fieldStatus, `${JSON.stringify({
    schema: "outilsia.local_cockpit_field_status.v1",
    required: 5,
    minimum_ready_before_linux_publication: 2,
    report_network_verified: false,
    profiles_ready: ["rtx_4080_4090", "rtx_3060_12gb"],
    profiles_missing: ["old_laptop", "core_i7_gtx_1080_ti", "cpu_only"],
    next_profile_to_test: "old_laptop",
  }, null, 2)}\n`);
  runExpectFailure(["--windows", windows, "--linux", linux, "--release-dir", join(root, "deploy-network-blocked"), "--deploy"], "report_network_verified=false");
  if (previousFieldStatus === undefined) delete process.env.OUTILSIA_FIELD_STATUS_JSON;
  else process.env.OUTILSIA_FIELD_STATUS_JSON = previousFieldStatus;
  console.log(`publish_cross_platform_test_ok ${release.files.length} file(s)`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
