#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
RELEASE_DIR="$REPO_ROOT/server-work/static/downloads/local-cockpit"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --release-dir)
      RELEASE_DIR="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
      shift 2
      ;;
    --help|-h)
      cat <<'EOF'
Usage:
  bash scripts/verify-linux-artifacts.sh [--release-dir <dir>]

Validates the Linux desktop artifacts referenced by release.json:
- release contract requires platform linux;
- every Linux file exists, matches size and SHA256;
- extension is one of .AppImage, .deb or .rpm;
- file(1) can inspect the artifact for quick native sanity checks.
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

cd "$ROOT"

if [ ! -f "$RELEASE_DIR/release.json" ]; then
  echo "Missing release.json in $RELEASE_DIR" >&2
  exit 1
fi

npm run verify:release:contract -- --input "$RELEASE_DIR" --require-platform linux

node --input-type=module - "$RELEASE_DIR" <<'NODE'
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const releaseDir = process.argv[2];
const release = JSON.parse(readFileSync(join(releaseDir, "release.json"), "utf8"));
const linuxFiles = (release.files || []).filter((file) => file.platform === "linux");
if (!linuxFiles.length) {
  throw new Error("release.json does not contain a linux artifact");
}
const provenance = release.build_provenance;
if (!provenance || provenance.schema !== "outilsia.local_cockpit_build_provenance.v1") {
  throw new Error("release.json missing build_provenance schema");
}
if (provenance.build_id !== release.build_id) {
  throw new Error(`build_provenance build_id mismatch: ${provenance.build_id} != ${release.build_id}`);
}
if (provenance.version !== release.version) {
  throw new Error(`build_provenance version mismatch: ${provenance.version} != ${release.version}`);
}
if (!Array.isArray(provenance.artifact_platforms) || !provenance.artifact_platforms.includes("linux")) {
  throw new Error("build_provenance artifact_platforms must include linux");
}
if (!provenance.packaged_at) {
  throw new Error("build_provenance packaged_at is required");
}
const allowed = new Set([".appimage", ".deb", ".rpm"]);
for (const file of linuxFiles) {
  const ext = extname(file.name).toLowerCase();
  if (!allowed.has(ext)) throw new Error(`unexpected linux artifact extension: ${file.name}`);
  const path = join(releaseDir, file.name);
  if (!existsSync(path)) throw new Error(`missing linux artifact: ${file.name}`);
  const stat = statSync(path);
  if (stat.size !== Number(file.size_bytes)) {
    throw new Error(`size mismatch for ${file.name}: ${stat.size} != ${file.size_bytes}`);
  }
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (hash !== file.sha256) throw new Error(`sha256 mismatch for ${file.name}`);
  console.log(`linux_artifact_ok ${file.name} ${stat.size} ${hash}`);
}
NODE

if command -v file >/dev/null 2>&1; then
  node --input-type=module - "$RELEASE_DIR" <<'NODE' | while IFS= read -r file_name; do
import { readFileSync } from "node:fs";
import { join } from "node:path";
const releaseDir = process.argv[2];
const release = JSON.parse(readFileSync(join(releaseDir, "release.json"), "utf8"));
for (const file of (release.files || []).filter((item) => item.platform === "linux")) {
  console.log(file.name);
}
NODE
    file_output="$(file "$RELEASE_DIR/$file_name")"
    echo "$file_output"
    lower_name="$(printf '%s' "$file_name" | tr '[:upper:]' '[:lower:]')"
    case "$lower_name" in
      *.appimage)
        if ! printf '%s' "$file_output" | grep -Eq 'ELF|AppImage'; then
          echo "Invalid AppImage/native ELF inspection for $file_name" >&2
          exit 1
        fi
        ;;
      *.deb)
        if ! printf '%s' "$file_output" | grep -Eq 'Debian binary package|current ar archive'; then
          echo "Invalid Debian package inspection for $file_name" >&2
          exit 1
        fi
        ;;
      *.rpm)
        if ! printf '%s' "$file_output" | grep -Eq 'RPM'; then
          echo "Invalid RPM package inspection for $file_name" >&2
          exit 1
        fi
        ;;
    esac
  done
else
  echo "warn: file command not available; skipped native file inspection"
fi

echo "linux_artifacts_verified $RELEASE_DIR"
