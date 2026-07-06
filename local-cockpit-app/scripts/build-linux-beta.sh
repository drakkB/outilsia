#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ "${SKIP_LINUX_PREFLIGHT:-0}" != "1" ]; then
  bash scripts/preflight-linux.sh
fi

npm run verify:ui
npm run build:beta
npm run package:beta
npm run verify:linux:artifacts

release_dir="$ROOT/../server-work/static/downloads/local-cockpit"
release_json="$release_dir/release.json"

if [ ! -s "$release_json" ]; then
  echo "Missing release.json after packaging: $release_json" >&2
  exit 1
fi

node --input-type=module - "$release_json" <<'NODE'
import { readFileSync } from "node:fs";
const releasePath = process.argv[2];
const release = JSON.parse(readFileSync(releasePath, "utf8"));
const linuxFiles = (release.files || []).filter((file) => file.platform === "linux");
if (!linuxFiles.length) {
  console.error("No linux artifact found in release.json");
  process.exit(1);
}
console.log(`linux_beta_build_ok ${release.version} ${linuxFiles.length} file(s)`);
for (const file of linuxFiles) {
  console.log(`${file.name} ${file.size_bytes} ${file.sha256}`);
}
NODE
