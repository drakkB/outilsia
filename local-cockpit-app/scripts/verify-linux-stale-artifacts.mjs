#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const artifactsRoot = join(appRoot, ".artifacts");
const releaseDir = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");
const releasePath = join(releaseDir, "release.json");
const reportsRoot = join(repoRoot, "reports");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function artifactVersion(name) {
  const match = String(name || "").match(/Local-Cockpit-([0-9]+\.[0-9]+\.[0-9]+)-beta-([0-9]+)/i);
  return {
    version: match?.[1] || "",
    build_id: match?.[2] || "",
  };
}

const release = readJson(releasePath);
const publicLinux = (release.files || []).filter((file) => file.platform === "linux");
const publicLinuxNames = new Set(publicLinux.map((file) => file.name));
const stale = [];

if (existsSync(artifactsRoot)) {
  for (const dirName of readdirSync(artifactsRoot)) {
    if (!dirName.startsWith("linux-remote-release-")) continue;
    const dir = join(artifactsRoot, dirName);
    for (const name of readdirSync(dir)) {
      if (!/\.(appimage|deb|rpm)$/i.test(name)) continue;
      const path = join(dir, name);
      const parsed = artifactVersion(name);
      const isCurrent = parsed.version === release.version && parsed.build_id === release.build_id;
      stale.push({
        dir,
        name,
        version: parsed.version,
        build_id: parsed.build_id,
        size_bytes: statSync(path).size,
        sha256: sha256(path),
        current_version: isCurrent,
        public_release: publicLinuxNames.has(name),
      });
    }
  }
}

const stalePublished = stale.filter((item) => !item.current_version && item.public_release);
const currentLinuxPublic = publicLinux.filter((item) => {
  const parsed = artifactVersion(item.name);
  return parsed.version === release.version && parsed.build_id === release.build_id;
});

const report = {
  schema: "outilsia.local_cockpit_linux_stale_guard.v1",
  generated_at: new Date().toISOString(),
  release: {
    version: release.version || "",
    build_id: release.build_id || "",
    public_linux_count: publicLinux.length,
    current_public_linux_count: currentLinuxPublic.length,
  },
  status: stalePublished.length ? "STALE_LINUX_PUBLIC_ARTIFACT" : "STALE_LINUX_GUARDED",
  stale_artifacts: stale,
  stale_public_artifacts: stalePublished,
  rule: "Ancien artefact Linux autorisé uniquement hors release publique; release Linux valide seulement avec version/build courants.",
};

mkdirSync(reportsRoot, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const jsonPath = join(reportsRoot, `linux_stale_guard_${stamp}.json`);
const mdPath = join(reportsRoot, `linux_stale_guard_${stamp}.md`);
writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
writeFileSync(mdPath, [
  "# OutilsIA Local Cockpit - garde-fou Linux stale",
  "",
  `- Généré: \`${report.generated_at}\``,
  `- Release courante: \`${report.release.version}/${report.release.build_id}\``,
  `- Statut: \`${report.status}\``,
  `- Linux public courant: **${report.release.current_public_linux_count}**`,
  `- Artefacts Linux anciens détectés: **${report.stale_artifacts.length}**`,
  "",
  "## Règle",
  "",
  report.rule,
  "",
  "## Artefacts anciens",
  "",
  report.stale_artifacts.length
    ? "| Fichier | Version | Build | Public | SHA256 |\n| --- | --- | --- | --- | --- |\n" + report.stale_artifacts.map((item) => `| ${item.name} | ${item.version || "?"} | ${item.build_id || "?"} | ${item.public_release ? "oui" : "non"} | \`${item.sha256}\` |`).join("\n")
    : "Aucun artefact Linux ancien détecté.",
  "",
].join("\n"), "utf8");

console.log(`linux_stale_guard_verified status=${report.status} stale=${report.stale_artifacts.length} stale_public=${report.stale_public_artifacts.length} current_public=${report.release.current_public_linux_count} json=${jsonPath.replace(`${repoRoot}/`, "")}`);
if (stalePublished.length) process.exit(1);
