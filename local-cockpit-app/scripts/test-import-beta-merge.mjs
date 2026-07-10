#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sha256(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function writeRelease(root, files, buildId) {
  mkdirSync(root, { recursive: true });
  const releaseFiles = files.map((file) => {
    const path = join(root, file.name);
    writeFileSync(path, file.content);
    const statSize = readFileSync(path).length;
    return {
      name: file.name,
      original_name: file.originalName || file.name,
      platform: file.platform,
      size_bytes: statSize,
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
    release_notes: ["merge test"],
    primary_download: primary,
    downloads_by_platform: downloadsByPlatform,
    files: releaseFiles,
  }, null, 2)}\n`);
}

function run(args) {
  const result = spawnSync("node", ["scripts/import-beta-artifact.mjs", ...args], {
    cwd: appRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function runExpectFailure(args, expected) {
  const result = spawnSync("node", ["scripts/import-beta-artifact.mjs", ...args], {
    cwd: appRoot,
    encoding: "utf8",
  });
  if (result.status === 0) {
    throw new Error(`expected import failure but command passed: ${args.join(" ")}`);
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes(expected)) {
    throw new Error(`expected failure marker ${expected}, got: ${output}`);
  }
}

function nativeLinuxFixture() {
  const candidates = ["/bin/true", "/usr/bin/true"];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) {
    throw new Error("missing /bin/true or /usr/bin/true for native linux merge fixture");
  }
  return readFileSync(path);
}

function verifyLinuxArtifacts(releaseDir) {
  const result = spawnSync("bash", ["scripts/verify-linux-artifacts.sh", "--release-dir", releaseDir], {
    cwd: appRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

const root = mkdtempSync(join(tmpdir(), "outilsia-import-merge-test-"));
try {
  const win = join(root, "windows");
  const linux = join(root, "linux");
  const out = join(root, "out");
  const staleLinux = join(root, "stale-linux");
  writeRelease(win, [
    { name: "OutilsIA-Local-Cockpit-0.1.0-beta-test-windows-x64.exe", platform: "windows-x64", content: "windows setup" },
    { name: "OutilsIA-Local-Cockpit-0.1.0-beta-test-windows-x64.msi", platform: "windows-x64", content: "windows msi" },
  ], "testwin");
  writeRelease(linux, [
    { name: "OutilsIA-Local-Cockpit-0.1.0-beta-test-linux.AppImage", platform: "linux", content: nativeLinuxFixture() },
  ], "testwin");
  writeRelease(staleLinux, [
    { name: "OutilsIA-Local-Cockpit-0.1.0-beta-stale-linux.AppImage", platform: "linux", content: nativeLinuxFixture() },
  ], "stale");

  run(["--input", win, "--output-dir", out, "--replace"]);
  runExpectFailure(["--input", staleLinux, "--output-dir", out, "--merge"], "linux_merge_version_guard");
  run(["--input", linux, "--output-dir", out, "--merge"]);

  const release = JSON.parse(readFileSync(join(out, "release.json"), "utf8"));
  const names = new Set(release.files.map((file) => file.name));
  const required = [
    "OutilsIA-Local-Cockpit-0.1.0-beta-test-windows-x64.exe",
    "OutilsIA-Local-Cockpit-0.1.0-beta-test-windows-x64.msi",
    "OutilsIA-Local-Cockpit-0.1.0-beta-test-linux.AppImage",
  ];
  for (const name of required) {
    if (!names.has(name)) throw new Error(`missing merged file ${name}`);
    if (!existsSync(join(out, name))) throw new Error(`missing copied file ${name}`);
  }
  if (release.primary_download.name !== "OutilsIA-Local-Cockpit-0.1.0-beta-test-windows-x64.exe") {
    throw new Error(`unexpected primary_download ${release.primary_download.name}`);
  }
  if (!release.downloads_by_platform?.["windows-x64"]?.length) throw new Error("missing windows downloads_by_platform");
  if (!release.downloads_by_platform?.linux?.length) throw new Error("missing linux downloads_by_platform");
  if (JSON.stringify(release.build_provenance?.artifact_platforms) !== JSON.stringify(["linux", "windows-x64"])) {
    throw new Error(`bad merged artifact_platforms ${JSON.stringify(release.build_provenance)}`);
  }
  if (release.build_provenance?.merged_release !== true || release.build_provenance?.merge_verified_file_count !== 3) {
    throw new Error(`missing merged release provenance ${JSON.stringify(release.build_provenance)}`);
  }
  const linuxVerifyOutput = verifyLinuxArtifacts(out);
  if (!linuxVerifyOutput.includes("linux_artifacts_verified")) {
    throw new Error(`linux artifact verifier did not confirm merged release: ${linuxVerifyOutput}`);
  }
  console.log(`import_beta_merge_ok ${release.files.length} file(s)`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
