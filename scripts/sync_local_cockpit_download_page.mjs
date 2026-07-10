#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releasePath = join(repoRoot, "server-work", "static", "downloads", "local-cockpit", "release.json");
const pagePath = join(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html");

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function replaceBlock(source, name, content) {
  const start = `<!-- OUTILSIA_RELEASE_${name}_START -->`;
  const end = `<!-- OUTILSIA_RELEASE_${name}_END -->`;
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end);
  if (startAt < 0 || endAt <= startAt) throw new Error(`Missing release block ${name}`);
  const lineStart = source.lastIndexOf("\n", startAt) + 1;
  const indent = source.slice(lineStart, startAt);
  return `${source.slice(0, startAt)}${start}\n${content}\n${indent}${source.slice(endAt)}`;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} Ko`;
  return `${bytes} o`;
}

function fileLabel(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".exe")) return "Windows x64";
  if (name.endsWith(".msi")) return "Windows MSI";
  if (name.endsWith(".appimage")) return "Linux AppImage";
  if (name.endsWith(".deb")) return "Linux .deb";
  if (name.endsWith(".rpm")) return "Linux .rpm";
  return file.platform || "Téléchargement";
}

function buttonLabel(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".exe")) return "Télécharger Windows";
  if (name.endsWith(".msi")) return "Télécharger MSI";
  if (name.endsWith(".appimage")) return "Télécharger AppImage";
  if (name.endsWith(".deb")) return "Télécharger .deb";
  if (name.endsWith(".rpm")) return "Télécharger .rpm";
  return "Télécharger";
}

const release = JSON.parse(readFileSync(releasePath, "utf8"));
if (!release.ok || !Array.isArray(release.files) || !release.files.length) {
  throw new Error("Invalid Local Cockpit release.json");
}
const files = release.files;
const primary = files.find((file) => file.name.endsWith(".exe")) || release.primary_download || files[0];
const buildId = String(release.build_id || "");
if (!/^\d{10,}$/.test(buildId)) throw new Error(`Invalid build id: ${buildId}`);

const primaryHtml = `        <a id="downloadBtn" class="btn primary" href="${escapeHtml(primary.url)}" download="${escapeHtml(primary.name)}">${escapeHtml(buttonLabel(primary))}</a>`;
const releaseBox = `        <div id="releaseBox" class="code">Nom: ${escapeHtml(primary.name)}
Version: ${escapeHtml(release.label || release.version)}
Build ID: ${escapeHtml(buildId)}
Plateforme: ${escapeHtml(primary.platform)}
SHA256: ${escapeHtml(primary.sha256)}
URL: ${escapeHtml(primary.url)}
Freshness: ${release.freshness?.stale === false ? "fresh" : "à vérifier"}</div>`;
const links = `        <div class="download-list" id="telechargements-directs" style="margin-top:12px">
${files.map((file) => `          <div class="download-item">
            <div>
              <strong>${escapeHtml(fileLabel(file))} · ${escapeHtml(release.label || release.version)} · build ${escapeHtml(buildId)}</strong>
              <span>${escapeHtml(file.name)} · ${escapeHtml(formatBytes(file.size_bytes))}</span>
              <small>SHA256 ${escapeHtml(file.sha256)}</small>
            </div>
            <a class="btn ${file.name === primary.name ? "primary" : "secondary"}" href="${escapeHtml(file.url)}">${escapeHtml(buttonLabel(file))}</a>
          </div>`).join("\n")}
        </div>`;

const windowsExe = files.find((file) => file.name.endsWith(".exe"));
const windowsMsi = files.find((file) => file.name.endsWith(".msi"));
const appImage = files.find((file) => file.name.toLowerCase().endsWith(".appimage"));
const deb = files.find((file) => file.name.endsWith(".deb"));
const rpm = files.find((file) => file.name.endsWith(".rpm"));
if (!windowsExe || !appImage || !deb || !rpm) throw new Error("Release must contain Windows EXE and Linux AppImage/deb/rpm");
const verifyText = `# Windows (PowerShell) — build ${buildId}
$expected = "${windowsExe.sha256}"
$hash = (Get-FileHash -Algorithm SHA256 ".\\${windowsExe.name}").Hash.ToLower()
if ($hash -eq $expected) { "OutilsIA: SHA256 OK" } else { "OutilsIA: SHA256 DIFFERENT - ne lancez pas ce fichier" }

${windowsMsi ? `# Windows MSI : Get-FileHash -Algorithm SHA256 .\\${windowsMsi.name}\n# attendu: ${windowsMsi.sha256}\n` : ""}
# Linux AppImage : sha256sum ./${appImage.name}
# attendu: ${appImage.sha256}

# Linux .deb : sha256sum ./${deb.name}
# attendu: ${deb.sha256}

# Linux .rpm : sha256sum ./${rpm.name}
# attendu: ${rpm.sha256}`;
const verify = `      <div id="verifyCommands" class="code">${escapeHtml(verifyText)}</div>`;

let page = readFileSync(pagePath, "utf8");
page = replaceBlock(page, "PRIMARY", primaryHtml);
page = replaceBlock(page, "BOX", releaseBox);
page = replaceBlock(page, "LINKS", links);
page = replaceBlock(page, "VERIFY", verify);
writeFileSync(pagePath, page);
console.log(`download_page_synced build=${buildId} files=${files.length}`);
