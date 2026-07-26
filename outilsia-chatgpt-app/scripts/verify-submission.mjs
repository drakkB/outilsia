import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_VERSION,
  DEFAULT_WIDGET_DOMAIN,
  RESOURCE_URI,
  TOOL_NAMES,
} from "../server.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(root, "..");
const listing = JSON.parse(readFileSync(join(root, "submission", "listing.json"), "utf8"));
const tests = JSON.parse(readFileSync(join(root, "submission", "test-cases.json"), "utf8"));
const annotations = JSON.parse(readFileSync(join(root, "submission", "tool-annotations.json"), "utf8"));
const importPath = join(root, "chatgpt-app-submission.json");
const portalFieldsPath = join(root, "submission", "PORTAL-FIELDS.md");
const videoGuidePath = join(root, "submission", "AUTOMATISER-VIDEO-CODEX.md");
const videoRecorderPath = join(root, "submission", "OUTILSIA-VIDEO-RECORDER.ps1");
const windowRecorderManifestPath = join(root, "submission", "window-recorder", "Cargo.toml");
const windowRecorderSourcePath = join(root, "submission", "window-recorder", "src", "main.rs");
const demoVideoUrl = "https://outilsia.fr/static/media/demo-outilsia-chatgpt-local-cockpit.mp4";
const demoVideoSha256 = "c83ca491dd120cd8d26009cf660eaa81c08954edcfd6b5283116adcf36cb4557";
const pages = {
  website: join(repoRoot, "server-work", "static", "pages", "chatgpt-ia-locale.html"),
  privacy: join(repoRoot, "server-work", "static", "pages", "confidentialite-plugin-outilsia.html"),
  terms: join(repoRoot, "server-work", "static", "pages", "conditions-plugin-outilsia.html"),
  support: join(repoRoot, "server-work", "static", "pages", "support-plugin-outilsia.html"),
};

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function oneLineWithin(value, max, label) {
  requireCondition(typeof value === "string" && value.trim(), `${label} is required.`);
  requireCondition(!/[\r\n]/.test(value), `${label} must fit on one line.`);
  requireCondition([...value].length <= max, `${label} exceeds ${max} characters.`);
}

function resolveSubmissionAsset(relativePath, label) {
  requireCondition(typeof relativePath === "string" && relativePath.trim(), `${label} path is required.`);
  const absolutePath = resolve(root, relativePath);
  requireCondition(
    absolutePath.startsWith(`${root}${sep}`),
    `${label} must stay inside the ChatGPT app directory.`,
  );
  requireCondition(existsSync(absolutePath), `Missing ${label}: ${relativePath}`);
  return absolutePath;
}

function pngDimensions(path, label) {
  const buffer = readFileSync(path);
  const pngSignature = "89504e470d0a1a0a";
  requireCondition(buffer.length >= 24, `${label} is too small to be a valid PNG.`);
  requireCondition(buffer.subarray(0, 8).toString("hex") === pngSignature, `${label} must be a PNG.`);
  requireCondition(buffer.subarray(12, 16).toString("ascii") === "IHDR", `${label} has no PNG IHDR.`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

const ui = listing.interface;
requireCondition(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(listing.name), "Invalid package name.");
requireCondition(/^\d+\.\d+\.\d+/.test(listing.version), "Version must be semantic.");
requireCondition(listing.version === APP_VERSION, "Submission and MCP server versions differ.");
oneLineWithin(ui.displayName, 30, "displayName");
oneLineWithin(ui.shortDescription, 30, "shortDescription");
requireCondition(ui.longDescription.length <= 4_000, "longDescription exceeds 4000 characters.");
oneLineWithin(ui.developerName, 80, "developerName");
requireCondition([
  "Productivity",
  "Creativity",
  "Developer Tools",
  "Business & Operations",
  "Data & Analytics",
  "Communication",
  "Education & Research",
  "Security",
  "Finance",
  "Healthcare",
  "Travel",
  "Entertainment",
  "Other",
].includes(ui.category), "Unknown submission category.");
requireCondition(Array.isArray(ui.capabilities) && ui.capabilities.length <= 20, "Too many capabilities.");
ui.capabilities.forEach((value, index) => oneLineWithin(value, 120, `capability[${index}]`));
requireCondition(Array.isArray(ui.defaultPrompt) && ui.defaultPrompt.length <= 3, "Too many starter prompts.");
ui.defaultPrompt.forEach((value, index) => {
  oneLineWithin(value, 128, `starterPrompt[${index}]`);
  requireCondition(!/@outilsia/i.test(value), "Starter prompts must not contain an app mention.");
});
for (const [label, value] of Object.entries({
  websiteURL: ui.websiteURL,
  privacyPolicyURL: ui.privacyPolicyURL,
  termsOfServiceURL: ui.termsOfServiceURL,
  supportURL: ui.supportURL,
  mcpURL: listing.mcp.url,
  widgetDomain: listing.mcp.widgetDomain,
})) {
  requireCondition(value.startsWith("https://") && value.length <= 1_024, `${label} must be a public HTTPS URL.`);
}
const mcpUrl = new URL(listing.mcp.url);
const widgetUrl = new URL(listing.mcp.widgetDomain);
requireCondition(widgetUrl.origin === listing.mcp.widgetDomain, "widgetDomain must be an HTTPS origin without a path.");
requireCondition(widgetUrl.hostname !== mcpUrl.hostname, "widgetDomain must use a dedicated host name.");
requireCondition(listing.mcp.widgetDomain === DEFAULT_WIDGET_DOMAIN, "Submission and server widget domains differ.");
requireCondition(listing.mcp.widgetResource === RESOURCE_URI, "Submission and server widget resources differ.");

const logoPath = resolveSubmissionAsset(listing.assets?.logo, "logo");
const logo = pngDimensions(logoPath, "logo");
requireCondition(logo.width === 512 && logo.height === 512, "Logo must be exactly 512x512.");

const screenshots = listing.assets?.starterPromptScreenshots;
requireCondition(Array.isArray(screenshots), "starterPromptScreenshots must be an array.");
requireCondition(
  screenshots.length === ui.defaultPrompt.length,
  "Provide exactly one screenshot per starter prompt.",
);
requireCondition(new Set(screenshots).size === screenshots.length, "Starter screenshots must be unique.");
screenshots.forEach((relativePath, index) => {
  const path = resolveSubmissionAsset(relativePath, `starter screenshot ${index + 1}`);
  const image = pngDimensions(path, `starter screenshot ${index + 1}`);
  requireCondition(
    readFileSync(path).length >= 20_000,
    `Starter screenshot ${index + 1} appears blank or incomplete.`,
  );
  requireCondition(image.width === 706, `Starter screenshot ${index + 1} must be exactly 706px wide.`);
  requireCondition(
    image.height >= 400 && image.height <= 860,
    `Starter screenshot ${index + 1} height must be between 400px and 860px.`,
  );
});

requireCondition(existsSync(portalFieldsPath), "Missing portal copy/paste guide.");
const portalFields = readFileSync(portalFieldsPath, "utf8");
for (const value of [
  listing.mcp.url,
  listing.mcp.challengeBaseURL,
  listing.mcp.widgetDomain,
  ui.websiteURL,
  ui.privacyPolicyURL,
  ui.termsOfServiceURL,
  ui.supportURL,
]) {
  requireCondition(portalFields.includes(value), `Portal guide missing ${value}`);
}
requireCondition(portalFields.includes(demoVideoUrl), "Portal guide missing the validated demo URL.");
requireCondition(
  portalFields.includes(demoVideoSha256),
  "Portal guide missing the validated demo SHA256.",
);

requireCondition(existsSync(videoGuidePath), "Missing Codex video automation guide.");
requireCondition(existsSync(videoRecorderPath), "Missing video recorder controller.");
requireCondition(existsSync(windowRecorderManifestPath), "Missing Windows Graphics Capture helper manifest.");
requireCondition(existsSync(windowRecorderSourcePath), "Missing Windows Graphics Capture helper source.");
const videoGuide = readFileSync(videoGuidePath, "utf8");
const videoRecorder = readFileSync(videoRecorderPath, "utf8");
const windowRecorderManifest = readFileSync(windowRecorderManifestPath, "utf8");
const windowRecorderSource = readFileSync(windowRecorderSourcePath, "utf8");
for (const marker of [
  "OUTILSIA-VIDEO-RECORDER.ps1",
  "OUTILSIA_RECORDING_STARTED",
  "OUTILSIA_RECORDING_STOPPED",
  "GracefulStop: True",
  demoVideoUrl,
]) {
  requireCondition(videoGuide.includes(marker), `Video guide missing ${marker}`);
}
for (const marker of [
  "OUTILSIA_RECORDING_STARTED",
  "OUTILSIA_RECORDING_STOPPED",
  "GracefulStop:",
]) {
  requireCondition(videoRecorder.includes(marker), `Video recorder missing ${marker}`);
}
requireCondition(
  videoRecorder.includes('ValidateSet("Start", "Stop", "Status", "Worker")'),
  "Video recorder must expose the four controlled actions.",
);
requireCondition(
  videoRecorder.includes('source_mode = "windows_graphics_capture"')
    && videoRecorder.includes("Ensure-WindowRecorder")
    && videoRecorder.includes("outilsia-window-recorder.exe")
    && !videoRecorder.includes('"-i", "desktop"')
    && !videoRecorder.includes('$captureSource = "hwnd=$WindowHandle"'),
  "Video recorder must use the dedicated Windows Graphics Capture helper instead of desktop capture.",
);
requireCondition(
  videoRecorder.includes("-map 0:v:0")
    && videoRecorder.includes("-c:v libx264")
    && videoRecorder.includes("-an")
    && videoRecorder.includes('Find-FFmpegTool -Name "ffprobe"'),
  "Video recorder must normalize the window capture to a silent H.264 MP4 and validate it.",
);
requireCondition(
  windowRecorderManifest.includes('windows-capture = "2.0.0"')
    && windowRecorderSource.includes("Window::from_raw_hwnd")
    && windowRecorderSource.includes("Capture::start_free_threaded")
    && windowRecorderSource.includes("VideoEncoder::new")
    && windowRecorderSource.includes("SecondaryWindowSettings::Exclude")
    && windowRecorderSource.includes("RedrawWindow"),
  "Window helper must capture one HWND through Windows Graphics Capture and preserve real-time frames.",
);

requireCondition(tests.positive.length === 5, "Submission requires exactly five positive tests.");
requireCondition(tests.negative.length === 3, "Submission requires exactly three negative tests.");
requireCondition(new Set(tests.positive.map((item) => item.id)).size === 5, "Positive test IDs must be unique.");
requireCondition(new Set(tests.negative.map((item) => item.id)).size === 3, "Negative test IDs must be unique.");
for (const test of tests.positive) {
  requireCondition(
    Array.isArray(test.expectedToolSequence) && test.expectedToolSequence.length === 1,
    `${test.id} must use exactly one public tool.`,
  );
  requireCondition(
    test.expectedToolSequence[0] !== "render_machine_cockpit",
    `${test.id} must not ask the model to call the internal render tool.`,
  );
}
const boundaryTest = tests.positive.find(
  (test) => test.expectedToolSequence[0] === "explain_local_action_boundary",
);
requireCondition(boundaryTest, "Submission must include the local action boundary as a positive tool test.");
requireCondition(
  /sans commande/i.test(boundaryTest.expectedBehavior)
    && /recherche Web/i.test(boundaryTest.expectedBehavior),
  "Boundary test must forbid commands and web-search additions.",
);
requireCondition(
  !tests.negative.some((test) => /Installe Ollama puis qwen3:8b/i.test(test.prompt)),
  "The installation request must no longer be modeled as a no-tool negative case.",
);

requireCondition(Object.keys(annotations).sort().join("|") === [...TOOL_NAMES].sort().join("|"), "Annotation file must cover every tool.");
for (const name of TOOL_NAMES) {
  const item = annotations[name];
  requireCondition(item.readOnlyHint === true, `${name} must remain read-only.`);
  requireCondition(item.openWorldHint === false, `${name} must not write to the open world.`);
  requireCondition(item.destructiveHint === false, `${name} must not be destructive.`);
  for (const key of ["readOnlyJustification", "openWorldJustification", "destructiveJustification"]) {
    requireCondition(String(item[key] || "").length >= 40, `${name}.${key} is too vague.`);
  }
}

requireCondition(existsSync(importPath), "Missing chatgpt-app-submission.json.");
const submissionImport = JSON.parse(readFileSync(importPath, "utf8"));
requireCondition(
  submissionImport.$schema === "https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json",
  "Submission import uses the wrong schema URL.",
);
requireCondition(submissionImport.schema_version === 1, "Submission import schema_version must be 1.");
requireCondition(
  submissionImport.app_info?.display_name === ui.displayName,
  "Submission import display name differs from listing.json.",
);
requireCondition(
  submissionImport.app_info?.subtitle === ui.shortDescription,
  "Submission import subtitle differs from listing.json.",
);
requireCondition(
  submissionImport.app_info?.description === ui.longDescription,
  "Submission import description differs from listing.json.",
);
requireCondition(
  submissionImport.app_info?.category === "PRODUCTIVITY",
  "Submission import category must be PRODUCTIVITY.",
);
requireCondition(
  Object.keys(submissionImport.tools || {}).sort().join("|") === [...TOOL_NAMES].sort().join("|"),
  "Submission import must cover every MCP tool.",
);
for (const name of TOOL_NAMES) {
  const imported = submissionImport.tools[name];
  const source = annotations[name];
  requireCondition(imported.annotations.readOnlyHint === source.readOnlyHint, `${name} readOnlyHint drift.`);
  requireCondition(imported.annotations.openWorldHint === source.openWorldHint, `${name} openWorldHint drift.`);
  requireCondition(imported.annotations.destructiveHint === source.destructiveHint, `${name} destructiveHint drift.`);
  requireCondition(
    imported.justifications.read_only_justification === source.readOnlyJustification,
    `${name} read-only justification drift.`,
  );
  requireCondition(
    imported.justifications.open_world_justification === source.openWorldJustification,
    `${name} open-world justification drift.`,
  );
  requireCondition(
    imported.justifications.destructive_justification === source.destructiveJustification,
    `${name} destructive justification drift.`,
  );
}
requireCondition(submissionImport.test_cases?.length === 5, "Submission import needs five positive tests.");
requireCondition(
  submissionImport.negative_test_cases?.length === 3,
  "Submission import needs three negative tests.",
);
submissionImport.test_cases.forEach((test, index) => {
  const source = tests.positive[index];
  requireCondition(test.user_prompt === source.prompt, `Positive import test ${index + 1} prompt drift.`);
  requireCondition(
    test.tools_triggered === source.expectedToolSequence[0],
    `Positive import test ${index + 1} tool drift.`,
  );
  requireCondition(test.file_attachment_urls === null, `Positive import test ${index + 1} needs no files.`);
});
submissionImport.negative_test_cases.forEach((test, index) => {
  const source = tests.negative[index];
  requireCondition(test.user_prompt === source.prompt, `Negative import test ${index + 1} prompt drift.`);
  requireCondition(test.tools_triggered === null, `Negative import test ${index + 1} must trigger no tool.`);
  requireCondition(test.file_attachment_urls === null, `Negative import test ${index + 1} needs no files.`);
});
const importText = JSON.stringify(submissionImport);
requireCondition(!/C:\\\\Users|\/mnt\/|\/home\/|BEGIN [A-Z ]+ KEY/.test(importText), "Submission import leaks a local path or secret.");

for (const [label, path] of Object.entries(pages)) {
  requireCondition(existsSync(path), `Missing ${label} page.`);
  const html = readFileSync(path, "utf8");
  requireCondition(/<link rel="canonical" href="https:\/\/outilsia\.fr\//.test(html), `${label} page needs a canonical.`);
  requireCondition(!/<iframe\b/i.test(html), `${label} page must not embed an iframe.`);
}

const websiteHtml = readFileSync(pages.website, "utf8");
requireCondition(
  websiteHtml.includes("soumission initiale a été envoyée")
    && websiteHtml.includes("en cours d'examen"),
  "Website must expose the current submitted-under-review status.",
);
requireCondition(
  !websiteHtml.includes("dossier de publication publique est prêt avant examen"),
  "Website still exposes the obsolete pre-submission status.",
);

const scannerHtml = readFileSync(
  join(repoRoot, "server-work", "static", "pages", "scanner-ia-local.html"),
  "utf8",
);
requireCondition(
  scannerHtml.includes("soumission initiale envoyée à OpenAI")
    && scannerHtml.includes("examen en cours"),
  "Scanner hub must expose the current submitted-under-review status.",
);
requireCondition(
  !scannerHtml.includes("soumission à l'annuaire non finalisée"),
  "Scanner hub still exposes the obsolete pre-submission status.",
);

const llms = readFileSync(join(repoRoot, "server-work", "static", "llms.txt"), "utf8");
for (const url of [ui.websiteURL, ui.privacyPolicyURL, ui.supportURL]) {
  requireCondition(llms.includes(url), `llms.txt missing ${url}`);
}
requireCondition(
  llms.includes("initial submission sent to OpenAI")
    && llms.includes("currently under review"),
  "llms.txt must expose the current submitted-under-review status.",
);

console.log(
  `outilsia_chatgpt_submission_ok prompts=${ui.defaultPrompt.length} positive=${tests.positive.length} negative=${tests.negative.length} tools=${TOOL_NAMES.length}`,
);
