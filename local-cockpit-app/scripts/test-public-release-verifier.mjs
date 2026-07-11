#!/usr/bin/env node
import { createHash } from "node:crypto";
import http from "node:http";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releasePrefix = "/static/downloads/local-cockpit/";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function writeArtifact(root, name, content) {
  const path = join(root, name);
  writeFileSync(path, content);
  const stat = statSync(path);
  return {
    name,
    path,
    size_bytes: stat.size,
    sha256: sha256(readFileSync(path)),
    url: `${releasePrefix}${name}`,
  };
}

function runVerifier(port, extraArgs = []) {
  const child = spawn("node", [
    "scripts/verify-public-release.mjs",
    "--base-url",
    `http://127.0.0.1:${port}`,
    "--max-file-mb",
    "10",
    ...extraArgs,
  ], {
    cwd: appRoot,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  return new Promise((resolveRun) => {
    child.on("close", (status) => resolveRun({ status, stdout, stderr }));
  });
}

const root = mkdtempSync(join(tmpdir(), "outilsia-public-release-test-"));
let server;

try {
  const windows = writeArtifact(root, "OutilsIA-Local-Cockpit-0.1.0-beta-test-windows-x64.exe", Buffer.from("windows setup test\n"));
  const linux = writeArtifact(root, "OutilsIA-Local-Cockpit-0.1.0-beta-test-linux-x64.AppImage", readFileSync("/bin/true"));

  const release = {
    ok: true,
    product: "OutilsIA Local Cockpit",
    channel: "beta",
    version: "0.1.0",
    label: "0.1.0-beta-test",
    build_id: "test",
    build_provenance: {
      schema: "outilsia.local_cockpit_build_provenance.v1",
      build_id: "test",
      ci: false,
      artifact_platforms: ["linux", "windows-x64"],
      merged_release: true,
    },
    features: ["upgrade_digital_twin_v1"],
    release_notes: ["Upgrade Digital Twin v1 public verifier test"],
    primary_download: { ...windows, platform: "windows-x64" },
    downloads_by_platform: {
      "windows-x64": [{ ...windows, platform: "windows-x64" }],
      linux: [{ ...linux, platform: "linux" }],
    },
    files: [
      { ...windows, platform: "windows-x64" },
      { ...linux, platform: "linux" },
    ],
    freshness: {
      newest_source: "local-cockpit-app/src/app.js",
      oldest_artifact: "local-cockpit-app/src-tauri/target/release/bundle/nsis/OutilsIA Local Cockpit_0.1.0_x64-setup.exe",
      newest_source_mtime_ms: 1000,
      oldest_artifact_mtime_ms: 2000,
      allow_stale: false,
      stale: false,
    },
  };
  writeFileSync(join(root, "release.json"), `${JSON.stringify(release, null, 2)}\n`);

  server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const name = url.pathname === `${releasePrefix}release.json`
      ? "release.json"
      : basename(url.pathname);
    const path = join(root, name);
    try {
      const body = readFileSync(path);
      res.writeHead(200, {
        "Content-Length": body.length,
        "Content-Type": name === "release.json" ? "application/json" : "application/octet-stream",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });

  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const port = server.address().port;

  const ok = await runVerifier(port, ["--require-platform", "windows-x64", "--require-platform", "linux"]);
  if (ok.status !== 0) {
    throw new Error(`expected public release verifier to pass\nstdout=${ok.stdout}\nstderr=${ok.stderr}`);
  }

  const fresh = await runVerifier(port, ["--require-platform", "windows-x64", "--require-freshness"]);
  if (fresh.status !== 0 || !String(fresh.stdout).includes("freshness=ok")) {
    throw new Error(`expected public release freshness verifier to pass\nstdout=${fresh.stdout}\nstderr=${fresh.stderr}`);
  }

  const missing = await runVerifier(port, ["--require-platform", "macos"]);
  if (missing.status === 0 || !String(missing.stderr).includes("Missing required platform: macos")) {
    throw new Error(`expected missing platform failure\nstdout=${missing.stdout}\nstderr=${missing.stderr}`);
  }

  writeFileSync(join(root, "release.json"), `${JSON.stringify({ ...release, features: [] }, null, 2)}\n`);
  const missingFeature = await runVerifier(port);
  if (missingFeature.status === 0 || !String(missingFeature.stderr).includes("release.features must include upgrade_digital_twin_v1")) {
    throw new Error(`expected missing feature failure\nstdout=${missingFeature.stdout}\nstderr=${missingFeature.stderr}`);
  }

  writeFileSync(join(root, "release.json"), `${JSON.stringify({
    ...release,
    build_provenance: { ...release.build_provenance, build_id: "different-build" },
  }, null, 2)}\n`);
  const badBuild = await runVerifier(port);
  if (badBuild.status === 0 || !String(badBuild.stderr).includes("build_provenance.build_id must match release.build_id")) {
    throw new Error(`expected build provenance failure\nstdout=${badBuild.stdout}\nstderr=${badBuild.stderr}`);
  }

  writeFileSync(join(root, "release.json"), `${JSON.stringify({
    ...release,
    downloads_by_platform: {
      ...release.downloads_by_platform,
      linux: release.downloads_by_platform["windows-x64"],
    },
  }, null, 2)}\n`);
  const badPlatform = await runVerifier(port);
  if (badPlatform.status === 0 || !String(badPlatform.stderr).includes("downloads_by_platform.linux contains")) {
    throw new Error(`expected platform mapping failure\nstdout=${badPlatform.stdout}\nstderr=${badPlatform.stderr}`);
  }

  const staleRelease = {
    ...release,
    freshness: {
      ...release.freshness,
      newest_source_mtime_ms: 3000,
      oldest_artifact_mtime_ms: 1000,
      stale: true,
    },
  };
  writeFileSync(join(root, "release.json"), `${JSON.stringify(staleRelease, null, 2)}\n`);
  const stale = await runVerifier(port, ["--require-platform", "windows-x64", "--require-freshness"]);
  if (stale.status === 0 || !String(stale.stderr).includes("release.freshness.stale must be false")) {
    throw new Error(`expected stale freshness failure\nstdout=${stale.stdout}\nstderr=${stale.stderr}`);
  }

  console.log(`public_release_verifier_test_ok ${release.files.length} file(s)`);
} finally {
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(root, { recursive: true, force: true });
}
