#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const defaultRelease = join(repoRoot, "server-work", "static", "downloads", "local-cockpit", "release.json");
const defaultPage = join(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function fail(message) {
  throw new Error(message);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function replaceBlock(source, startMarker, endMarker, body) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) fail(`Missing or invalid markers: ${startMarker} / ${endMarker}`);
  const bodyStart = start + startMarker.length;
  const endLineStart = source.lastIndexOf("\n", end) + 1;
  const endIndent = source.slice(endLineStart, end);
  if (!/^\s*$/.test(endIndent)) fail(`End marker must start on its own line: ${endMarker}`);
  return `${source.slice(0, bodyStart)}\n${body}\n${endIndent}${source.slice(end)}`;
}

function sizeLabel(bytes) {
  return `${(Number(bytes || 0) / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

function fileKind(file) {
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".msi")) return { title: "Windows MSI", action: "Télécharger MSI", verify: "Windows MSI", command: "Get-FileHash -Algorithm SHA256" };
  if (name.endsWith(".exe")) return { title: "Windows x64", action: "Télécharger Windows", verify: "Windows (PowerShell)", command: "Get-FileHash -Algorithm SHA256" };
  if (name.endsWith(".appimage")) return { title: "Linux AppImage", action: "Télécharger AppImage", verify: "Linux AppImage", command: "sha256sum" };
  if (name.endsWith(".deb")) return { title: "Linux .deb", action: "Télécharger .deb", verify: "Linux .deb", command: "sha256sum" };
  if (name.endsWith(".rpm")) return { title: "Linux .rpm", action: "Télécharger .rpm", verify: "Linux .rpm", command: "sha256sum" };
  return { title: file.platform || "Artefact", action: "Télécharger", verify: file.platform || "Fichier", command: "sha256sum" };
}

export function syncDownloadPage({ releasePath = defaultRelease, pagePath = defaultPage, check = false } = {}) {
  if (!existsSync(releasePath)) fail(`Release not found: ${releasePath}`);
  if (!existsSync(pagePath)) fail(`Download page not found: ${pagePath}`);
  const release = JSON.parse(readFileSync(releasePath, "utf8").replace(/^\uFEFF/, ""));
  const files = Array.isArray(release.files) ? release.files : [];
  const primary = release.primary_download || files.find((file) => String(file.name || "").toLowerCase().endsWith(".exe")) || files[0];
  if (!release.build_id || !primary?.name || !primary?.sha256 || files.length < 2) fail("Release manifest is incomplete");
  for (const file of files) {
    if (!file.name || !file.url || !/^[a-f0-9]{64}$/i.test(String(file.sha256 || ""))) fail(`Invalid release file: ${file.name || "unknown"}`);
  }
  const version = release.label || `${release.version || "0.1.1"}-beta`;
  const primaryKind = fileKind(primary);
  const primaryBlock = `        <a id="downloadBtn" class="btn primary" href="${escapeHtml(primary.url)}" download="${escapeHtml(primary.name)}">${escapeHtml(primaryKind.action)}</a>`;
  const releaseBox = `        <div id="releaseBox" class="code">Nom: ${escapeHtml(primary.name)}
Version: ${escapeHtml(version)}
Build ID: ${escapeHtml(release.build_id)}
Plateforme: ${escapeHtml(primary.platform || "windows-x64")}
SHA256: ${escapeHtml(primary.sha256)}
URL: ${escapeHtml(primary.url)}
Freshness: ${release.freshness?.stale ? "stale" : "fresh"}</div>`;
  const linkItems = files.map((file) => {
    const kind = fileKind(file);
    return `          <div class="download-item">
            <div>
              <strong>${escapeHtml(kind.title)} · ${escapeHtml(version)} · build ${escapeHtml(release.build_id)}</strong>
              <span>${escapeHtml(file.name)} · ${escapeHtml(sizeLabel(file.size_bytes))}</span>
              <small>SHA256 ${escapeHtml(file.sha256)}</small>
            </div>
            <a class="btn ${file.name === primary.name ? "primary" : "secondary"}" href="${escapeHtml(file.url)}">${escapeHtml(kind.action)}</a>
          </div>`;
  }).join("\n");
  const links = `        <div class="download-list" id="telechargements-directs" style="margin-top:12px">\n${linkItems}\n        </div>`;
  const verifyLines = [`# ${primaryKind.verify} — build ${release.build_id}`];
  if (String(primary.name).toLowerCase().endsWith(".exe")) {
    verifyLines.push(
      `$expected = "${primary.sha256}"`,
      `$hash = (Get-FileHash -Algorithm SHA256 ".\\${primary.name}").Hash.ToLower()`,
      'if ($hash -eq $expected) { "OutilsIA: SHA256 OK" } else { "OutilsIA: SHA256 DIFFERENT - ne lancez pas ce fichier" }',
    );
  }
  for (const file of files.filter((item) => item.name !== primary.name)) {
    const kind = fileKind(file);
    verifyLines.push("", `# ${kind.verify} : ${kind.command} ./${file.name}`, `# attendu: ${file.sha256}`);
  }
  const verifyBlock = `      <div id="verifyCommands" class="code">${escapeHtml(verifyLines.join("\n"))}</div>`;

  const original = readFileSync(pagePath, "utf8");
  let updated = replaceBlock(original, "<!-- OUTILSIA_RELEASE_PRIMARY_START -->", "<!-- OUTILSIA_RELEASE_PRIMARY_END -->", primaryBlock);
  updated = replaceBlock(updated, "<!-- OUTILSIA_RELEASE_BOX_START -->", "<!-- OUTILSIA_RELEASE_BOX_END -->", releaseBox);
  updated = replaceBlock(updated, "<!-- OUTILSIA_RELEASE_LINKS_START -->", "<!-- OUTILSIA_RELEASE_LINKS_END -->", links);
  updated = replaceBlock(updated, "<!-- OUTILSIA_RELEASE_VERIFY_START -->", "<!-- OUTILSIA_RELEASE_VERIFY_END -->", verifyBlock);
  if (check) {
    if (updated !== original) fail(`Download page is stale for build ${release.build_id}`);
    return { changed: false, build_id: release.build_id, files: files.length, page: pagePath };
  }
  if (updated !== original) writeFileSync(pagePath, updated, "utf8");
  return { changed: updated !== original, build_id: release.build_id, files: files.length, page: pagePath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = syncDownloadPage({
      releasePath: resolve(argValue("--release") || defaultRelease),
      pagePath: resolve(argValue("--page") || defaultPage),
      check: process.argv.includes("--check"),
    });
    console.log(`download_page_release_synced build=${result.build_id} files=${result.files} changed=${result.changed} page=${result.page}`);
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
}
