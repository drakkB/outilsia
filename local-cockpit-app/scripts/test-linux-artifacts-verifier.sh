#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

RELEASE_DIR="$TMP_DIR/release"
mkdir -p "$RELEASE_DIR"

APPIMAGE="$RELEASE_DIR/OutilsIA-Local-Cockpit-0.1.0-beta-test-linux.AppImage"
if [ -x /bin/true ]; then
  cp /bin/true "$APPIMAGE"
elif command -v true >/dev/null 2>&1; then
  cp "$(command -v true)" "$APPIMAGE"
else
  echo "Unable to locate a tiny ELF binary for AppImage verifier test" >&2
  exit 1
fi
chmod +x "$APPIMAGE"

node --input-type=module - "$RELEASE_DIR" <<'NODE'
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const releaseDir = process.argv[2];
const name = "OutilsIA-Local-Cockpit-0.1.0-beta-test-linux.AppImage";
const path = join(releaseDir, name);
const stat = statSync(path);
const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
const file = {
  name,
  original_name: "outilsia-local-cockpit-test.AppImage",
  platform: "linux",
  size_bytes: stat.size,
  sha256,
  url: `/static/downloads/local-cockpit/${name}`,
};
const release = {
  ok: true,
  product: "OutilsIA Local Cockpit",
  channel: "beta",
  version: "0.1.0",
  label: "0.1.0-beta",
  build_id: "linuxverifiertest",
  published_at: "2026-06-30T00:00:00.000Z",
  build_provenance: {
    schema: "outilsia.local_cockpit_build_provenance.v1",
    packaged_at: "2026-06-30T00:00:00.000Z",
    build_id: "linuxverifiertest",
    version: "0.1.0",
    ci: false,
    runner_os: "Linux",
    node_platform: "linux",
    node_arch: "x64",
    artifact_platforms: ["linux"],
    github: {
      workflow: "",
      run_id: "",
      run_attempt: "",
      ref: "",
      sha: "",
      repository: ""
    }
  },
  release_notes: ["linux verifier test"],
  primary_download: file,
  downloads_by_platform: { linux: [file] },
  files: [file],
};
writeFileSync(join(releaseDir, "release.json"), `${JSON.stringify(release, null, 2)}\n`);
NODE

bash "$ROOT/scripts/verify-linux-artifacts.sh" --release-dir "$RELEASE_DIR" >/tmp/outilsia-linux-verifier-ok.log

node --input-type=module - "$RELEASE_DIR/release.json" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
const releasePath = process.argv[2];
const release = JSON.parse(readFileSync(releasePath, "utf8"));
release.files[0].sha256 = "0".repeat(64);
release.primary_download.sha256 = "0".repeat(64);
release.downloads_by_platform.linux[0].sha256 = "0".repeat(64);
writeFileSync(releasePath, `${JSON.stringify(release, null, 2)}\n`);
NODE

if bash "$ROOT/scripts/verify-linux-artifacts.sh" --release-dir "$RELEASE_DIR" >/tmp/outilsia-linux-verifier-bad.log 2>&1; then
  echo "linux verifier accepted a corrupted SHA256" >&2
  cat /tmp/outilsia-linux-verifier-bad.log >&2
  exit 1
fi

echo "linux_artifacts_verifier_test_ok"
