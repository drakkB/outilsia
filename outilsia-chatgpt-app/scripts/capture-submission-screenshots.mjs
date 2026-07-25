import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildCompatibilityDecision } from "../lib/decision.js";
import { OutilsiaApi } from "../lib/outilsia-api.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(root, "..");
const outputDir = join(root, "submission", "assets");
const scratchDir = join(repoRoot, ".artifacts", "chatgpt-app-capture");
const widgetPath = join(root, "public", "machine-cockpit-v3.html");
const api = new OutilsiaApi();

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function windowsPath(path) {
  const match = path.match(/^\/mnt\/([a-z])\/(.*)$/i);
  if (!match) return path;
  return `${match[1].toUpperCase()}:/${match[2]}`;
}

function fileUrl(path) {
  const value = windowsPath(path).replaceAll("\\", "/");
  return /^[A-Z]:\//.test(value) ? `file:///${value}` : `file://${value}`;
}

function chromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
    "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  requireCondition(found, "Chrome or Edge was not found. Set CHROME_BIN.");
  return found;
}

async function declaredDecision(profile, usage) {
  const payload = await api.checkCompatibility(profile);
  const decision = buildCompatibilityDecision(payload, { usage, sourceKind: "declared_profile" });
  return {
    ...decision,
    benchmark_evidence: null,
  };
}

async function sharedReportDecision(reportUrl, usage) {
  const payload = await api.getSharedReport(reportUrl);
  const decision = buildCompatibilityDecision(payload, {
    usage,
    sourceKind: "shared_report",
    reportUrl,
  });
  return {
    ...decision,
    benchmark_evidence: null,
  };
}

function fixtureHtml(widget, decision) {
  const bootstrap = `<script>window.openai={toolOutput:${JSON.stringify(decision)},openExternal(){}};</script>`;
  return widget.replace(
    '<script type="module">',
    `${bootstrap}\n    <script data-capture-script>`,
  );
}

function capture(chrome, sourcePath, targetPath, profileName) {
  const result = spawnSync(chrome, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-gpu",
    "--force-color-profile=srgb",
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    "--no-first-run",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=1800",
    "--window-size=706,860",
    `--user-data-dir=${windowsPath(join(scratchDir, `chrome-${profileName}`))}`,
    `--screenshot=${windowsPath(targetPath)}`,
    fileUrl(sourcePath),
  ], {
    encoding: "utf8",
    timeout: 45_000,
  });
  requireCondition(
    result.status === 0 && existsSync(targetPath),
    `Screenshot ${profileName} failed: ${result.stderr || result.stdout || `exit ${result.status}`}`,
  );
}

mkdirSync(outputDir, { recursive: true });
mkdirSync(scratchDir, { recursive: true });

const widget = readFileSync(widgetPath, "utf8");
const fixtures = [
  {
    id: "starter-01-gaming",
    decision: await declaredDecision({
      name: "Profil déclaré via ChatGPT",
      cpu_name: "AMD Ryzen 7 7800X3D",
      cpu_cores: 8,
      ram_gb: 64,
      gpu_name: "NVIDIA GeForce RTX 4080 SUPER",
      gpu_vendor: "NVIDIA",
      vram_gb: 16,
      unified_memory: false,
      storage_free_gb: 500,
      os_name: "Windows 11",
    }, "assistant"),
  },
  {
    id: "starter-02-old-pc",
    decision: await declaredDecision({
      name: "Profil déclaré via ChatGPT",
      cpu_name: "Intel Core i7-4790K",
      cpu_cores: 4,
      ram_gb: 16,
      gpu_name: "NVIDIA GeForce GTX 1080 Ti",
      gpu_vendor: "NVIDIA",
      vram_gb: 11,
      unified_memory: false,
      storage_free_gb: 200,
      os_name: "Windows 10",
    }, "francais"),
  },
  {
    id: "starter-03-report",
    decision: await sharedReportDecision(
      "https://outilsia.fr/r/3O3-DjbGWfNrIBUWe8IdmaEbJxG30F0m",
      "assistant",
    ),
  },
];

const chrome = chromeBinary();
for (const fixture of fixtures) {
  const sourcePath = join(scratchDir, `${fixture.id}.html`);
  const targetPath = join(outputDir, `${fixture.id}.png`);
  writeFileSync(sourcePath, fixtureHtml(widget, fixture.decision), "utf8");
  capture(chrome, sourcePath, targetPath, fixture.id);
  console.log(`captured ${fixture.id}.png 706x860`);
}
