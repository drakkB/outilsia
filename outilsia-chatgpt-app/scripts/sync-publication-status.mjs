import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publicationStatusCopy, validatePublicationStatus } from "../lib/publication-status.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(root, "..");
const statusPath = join(root, "submission", "publication-status.json");
const write = process.argv.includes("--write");

const paths = {
  website: join(repoRoot, "server-work", "static", "pages", "chatgpt-ia-locale.html"),
  scanner: join(repoRoot, "server-work", "static", "pages", "scanner-ia-local.html"),
  terms: join(repoRoot, "server-work", "static", "pages", "conditions-plugin-outilsia.html"),
  llms: join(repoRoot, "server-work", "static", "llms.txt"),
};

const status = validatePublicationStatus(JSON.parse(readFileSync(statusPath, "utf8")));
const copy = publicationStatusCopy(status);

function htmlMarker(id, edge) {
  return `<!-- OUTILSIA_CHATGPT_STATUS:${id}:${edge} -->`;
}

function replaceMarked(content, id, rendered, marker = htmlMarker) {
  const start = marker(id, "START");
  const end = marker(id, "END");
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error(`Missing or invalid publication marker: ${id}`);
  }
  const prefix = content.slice(0, startIndex + start.length);
  const suffix = content.slice(endIndex);
  return `${prefix}\n${rendered}\n${suffix}`;
}

function indent(lines, spaces) {
  const prefix = " ".repeat(spaces);
  return lines.map((line) => `${prefix}${line}`).join("\n");
}

function escapeJson(value) {
  return JSON.stringify(value);
}

function renderFaqJsonLd() {
  return indent([
    '<script type="application/ld+json">',
    "{",
    '  "@context":"https://schema.org",',
    '  "@type":"FAQPage",',
    '  "mainEntity":[',
    '    {"@type":"Question","name":"ChatGPT peut-il scanner directement mon PC avec OutilsIA ?","acceptedAnswer":{"@type":"Answer","text":"Non. L\'app reçoit uniquement les caractéristiques que vous déclarez ou l\'URL d\'un rapport OutilsIA déjà partagé. Le scan réel reste dans Local Cockpit sur Windows ou Linux."}},',
    '    {"@type":"Question","name":"OutilsIA peut-il installer Ollama depuis ChatGPT ?","acceptedAnswer":{"@type":"Answer","text":"Non. L\'app ChatGPT est en lecture seule. Local Cockpit reste l\'application qui scanne, installe, teste et benchmarke localement."}},',
    `    {"@type":"Question","name":${escapeJson(copy.directoryQuestion)},"acceptedAnswer":{"@type":"Answer","text":${escapeJson(copy.directoryAnswer)}}}`,
    "  ]",
    "}",
    "</script>",
  ], 2);
}

function renderHeroActions() {
  return indent([
    '<div class="actions">',
    ...copy.heroActions.map((line) => `  ${line}`),
    "</div>",
  ], 8);
}

function renderTesterSection() {
  const steps = copy.tester.steps.map(
    ([title, description]) => `            <li><strong>${title}</strong><span>${description}</span></li>`,
  );
  return [
    '    <section class="band" id="tester">',
    '      <div class="wrap two-col">',
    "        <div>",
    `          <span class="state">${copy.tester.badge}</span>`,
    `          <h2 style="margin-top:14px">${copy.tester.title}</h2>`,
    `          <p class="section-lead">${copy.tester.lead}</p>`,
    `          ${copy.tester.action}`,
    "        </div>",
    "        <div>",
    '          <ol class="steps">',
    ...steps,
    "          </ol>",
    "        </div>",
    "      </div>",
    "    </section>",
  ].join("\n");
}

function syncWebsite(content) {
  let next = content;
  next = replaceMarked(next, "faq-jsonld", renderFaqJsonLd());
  next = replaceMarked(next, "hero-eyebrow", indent([`<span class="eyebrow">${copy.heroEyebrow}</span>`], 8));
  next = replaceMarked(next, "hero-actions", renderHeroActions());
  next = replaceMarked(next, "hero-honest", indent([`<p class="honest">${copy.honest}</p>`], 8));
  next = replaceMarked(next, "tester-section", renderTesterSection());
  next = replaceMarked(
    next,
    "independent-notice",
    indent([`<p>${copy.independent}</p>`], 10),
  );
  next = replaceMarked(
    next,
    "faq-visible",
    indent([`<details><summary>${copy.directoryQuestion.replace(" OutilsIA", "")}</summary><p>${copy.directoryAnswer}</p></details>`], 8),
  );
  next = replaceMarked(next, "footer-label", indent([`<strong>${copy.footer}</strong>`], 6));
  return next;
}

function syncScanner(content) {
  const rendered = [
    `          <span class="pill">${copy.scannerPill}</span>`,
    '          <h2 class="text-3xl md:text-4xl font-black mt-4">Relire un profil PC ou un rapport Local Cockpit dans ChatGPT.</h2>',
    `          <p class="muted mt-3 text-lg">${copy.scannerLead}</p>`,
    '          <div class="flex flex-wrap gap-3 mt-6">',
    '            <a class="btn btn-primary" href="/chatgpt-ia-locale">Découvrir le connecteur</a>',
    '            <a class="btn btn-secondary" href="/confidentialite-plugin-outilsia">Voir les données traitées</a>',
    "          </div>",
    `          <p class="mini mt-4">${copy.scannerStatus}</p>`,
  ].join("\n");
  return replaceMarked(content, "scanner-summary", rendered);
}

function syncTerms(content) {
  let next = content;
  next = replaceMarked(next, "terms-status", `      <p>${copy.termsStatus}</p>`);
  next = replaceMarked(next, "terms-access", `      <p>${copy.termsAccess}</p>`);
  return next;
}

function syncLlms(content) {
  return replaceMarked(content, "llms-status", copy.llmsStatus);
}

const transforms = {
  website: syncWebsite,
  scanner: syncScanner,
  terms: syncTerms,
  llms: syncLlms,
};

const drift = [];
for (const [label, path] of Object.entries(paths)) {
  const before = readFileSync(path, "utf8");
  const after = transforms[label](before);
  if (before === after) continue;
  if (write) {
    writeFileSync(path, after);
  } else {
    drift.push(label);
  }
}

if (drift.length) {
  throw new Error(`Publication status drift: ${drift.join(", ")}. Run npm run sync:publication-status.`);
}

console.log(
  `outilsia_chatgpt_publication_status_${write ? "synced" : "ok"} state=${status.state} checked=${status.last_checked_on}`,
);
