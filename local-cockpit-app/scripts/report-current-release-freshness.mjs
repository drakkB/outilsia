#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const defaultReleaseDir = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");
const defaultOutDir = join(repoRoot, "reports");
const sourceRoots = [
  join(appRoot, "src"),
  join(appRoot, "src-tauri", "src"),
  join(appRoot, "src-tauri", "icons"),
  join(appRoot, "src-tauri", "tauri.conf.json"),
  join(appRoot, "src-tauri", "Cargo.toml"),
  join(appRoot, "src-tauri", "Cargo.lock"),
  join(appRoot, "package.json"),
];
const sourceExts = new Set([".js", ".html", ".css", ".json", ".rs", ".toml", ".lock", ".png", ".ico", ".icns"]);

function usage() {
  console.log(`Usage:
  node scripts/report-current-release-freshness.mjs [--release-dir <dir>] [--out-dir <dir>] [--fail-on-stale]

Checks whether the public release artifacts are newer than the current app sources.
This intentionally differs from release.freshness, which only records the source
state at packaging time.`);
}

function parseArgs(argv) {
  const opts = {
    releaseDir: defaultReleaseDir,
    outDir: defaultOutDir,
    failOnStale: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--release-dir") {
      opts.releaseDir = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--out-dir") {
      opts.outDir = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--fail-on-stale") {
      opts.failOnStale = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function newestSource(paths) {
  let newest = { path: "", mtimeMs: 0 };
  function visit(path) {
    if (!existsSync(path)) return;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) {
        if (name === "target" || name === "node_modules" || name === ".git") continue;
        visit(join(path, name));
      }
      return;
    }
    if (!sourceExts.has(extname(path).toLowerCase())) return;
    if (stat.mtimeMs > newest.mtimeMs) newest = { path, mtimeMs: stat.mtimeMs };
  }
  for (const path of paths) visit(path);
  return newest;
}

function releaseArtifacts(releaseDir) {
  const releasePath = join(releaseDir, "release.json");
  if (!existsSync(releasePath)) throw new Error(`Missing release.json: ${releasePath}`);
  const release = JSON.parse(readFileSync(releasePath, "utf8"));
  const files = Array.isArray(release.files) ? release.files : [];
  if (!files.length) throw new Error("release.files is empty");
  return {
    release,
    files: files.map((file) => {
      const path = join(releaseDir, file.name);
      if (!existsSync(path)) throw new Error(`Missing release artifact: ${path}`);
      const stat = statSync(path);
      return { ...file, path, mtimeMs: stat.mtimeMs, size_bytes_actual: stat.size };
    }),
  };
}

function writeMarkdown(report, path) {
  const lines = [];
  lines.push("# Current Release Freshness");
  lines.push("");
  lines.push(`- Generated: \`${report.generated_at}\``);
  lines.push(`- Status: \`${report.status}\``);
  lines.push(`- Build ID: \`${report.release.build_id || ""}\``);
  lines.push(`- Version: \`${report.release.version || ""}\``);
  lines.push(`- Newest source: \`${report.newest_source.path}\``);
  lines.push(`- Oldest artifact: \`${report.oldest_artifact.path}\``);
  lines.push(`- Source newer by ms: \`${report.source_newer_by_ms}\``);
  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  for (const file of report.files) {
    lines.push(`- \`${file.name}\` ${file.platform} ${file.size_bytes_actual} bytes mtime=${Math.round(file.mtimeMs)}`);
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  if (report.stale) {
    lines.push("- Public release artifacts are older than the current app sources.");
    lines.push("- Do not claim the public EXE contains the latest UX/Arena/MemoryForge source changes.");
    lines.push("- Rebuild on Windows with `npm run release:beta:windows`, then deploy.");
  } else {
    lines.push("- Public release artifacts are at least as new as the current app sources.");
  }
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

try {
  const opts = parseArgs(process.argv.slice(2));
  const newest = newestSource(sourceRoots);
  const { release, files } = releaseArtifacts(opts.releaseDir);
  const oldestArtifact = [...files].sort((a, b) => a.mtimeMs - b.mtimeMs)[0];
  const sourceNewerByMs = Math.round(newest.mtimeMs - oldestArtifact.mtimeMs);
  const stale = sourceNewerByMs > 1000;
  const report = {
    generated_at: new Date().toISOString(),
    status: stale ? "STALE_PUBLIC_RELEASE" : "CURRENT_PUBLIC_RELEASE",
    stale,
    source_newer_by_ms: sourceNewerByMs,
    release: {
      build_id: release.build_id,
      version: release.version,
      primary_download: release.primary_download?.name || "",
    },
    newest_source: {
      path: newest.path ? relative(repoRoot, newest.path) : "",
      mtimeMs: Math.round(newest.mtimeMs),
    },
    oldest_artifact: {
      path: oldestArtifact?.path ? relative(repoRoot, oldestArtifact.path) : "",
      mtimeMs: Math.round(oldestArtifact?.mtimeMs || 0),
    },
    files: files.map((file) => ({
      name: file.name,
      platform: file.platform,
      size_bytes_actual: file.size_bytes_actual,
      mtimeMs: Math.round(file.mtimeMs),
    })),
  };
  mkdirSync(opts.outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const jsonPath = join(opts.outDir, `local_cockpit_release_freshness_${stamp}.json`);
  const mdPath = join(opts.outDir, `local_cockpit_release_freshness_${stamp}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeMarkdown(report, mdPath);
  console.log(`release_freshness_${report.status.toLowerCase()} json=${relative(repoRoot, jsonPath)} md=${relative(repoRoot, mdPath)}`);
  if (stale && opts.failOnStale) process.exit(1);
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
