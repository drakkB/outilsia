#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const catalogPath = join(repoRoot, "server-work", "static", "data", "local-ai-models.json");
const reportsRoot = join(repoRoot, "reports");
const desktopRoot = existsSync("/mnt/c/Users/chris/Desktop") ? "/mnt/c/Users/chris/Desktop" : join(process.env.HOME || ".", "Desktop");
const desktopHtmlPath = join(desktopRoot, "OutilsIA-Local-Cockpit-CATALOGUE-VIVANT.html");
const desktopCmdPath = join(desktopRoot, "OUVRIR-CATALOGUE-VIVANT-OUTILSIA.cmd");

const required = [
  { key: "qwen 3.6 27b", label: "Qwen 3.6 27B", ollama: "qwen3.6:27b", runtime: "ollama_available" },
  { key: "qwen 3.6 35b-a3b", label: "Qwen 3.6 35B-A3B", ollama: "qwen3.6:35b", runtime: "ollama_available" },
  { key: "qwen3-coder-next 80b-a3b", label: "Qwen3 Coder Next", ollama: "qwen3-coder-next", runtime: "ollama_available" },
  { key: "qwen 3 30b-a3b", label: "Qwen 3 30B-A3B", ollama: "qwen3:30b", runtime: "ollama_available" },
  { key: "qwen 3 235b moe", label: "Qwen 3 235B MoE", ollama: "qwen3:235b", runtime: "ollama_frontier_available" },
  { key: "mistral medium 3.5 128b", label: "Mistral Medium 3.5", ollama: "mistral-medium-3.5", runtime: "ollama_available" },
  { key: "nvidia nemotron 3 super 120b moe", label: "NVIDIA Nemotron 3 Super", ollama: "nemotron-3-super", runtime: "frontier_watchlist" },
  { key: "phi-4 mini 3.8b", label: "Phi-4 Mini", ollama: "phi4-mini" },
  { key: "gemma 3 4b", label: "Gemma 3 4B", ollama: "gemma3:4b" },
  { key: "llama 3.2 3b", label: "Llama 3.2 3B", ollama: "llama3.2:3b" },
  { key: "mistral small 3 24b", label: "Mistral Small 3 24B", ollama: "mistral-small3.1:24b" },
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function identity(model) {
  return `${String(model.name || "").toLowerCase()} ${String(model.params || "").toLowerCase()}`.trim();
}

function markdown(report) {
  const lines = [
    "# OutilsIA Local Cockpit - modèles prioritaires",
    "",
    `- Généré: \`${report.generated_at}\``,
    `- Catalogue: \`${report.catalog.version}\``,
    `- Statut: \`${report.status}\``,
    `- Priorités OK: **${report.summary.ok}/${report.summary.required}**`,
    `- Médias verrouillés: **${report.summary.media_guarded}**`,
    `- Pilotables maintenant: **${report.decision_pack.counts.pilotable_now}**`,
    `- À surveiller: **${report.decision_pack.counts.watchlist}**`,
    `- Compatibilité seulement: **${report.decision_pack.counts.compatibility_only}**`,
    "",
    "## Décision rapide",
    "",
    "### Pilotables maintenant",
    "",
    ...(report.decision_pack.pilotable_now.length
      ? report.decision_pack.pilotable_now.map((model) => `- ${model.name} ${model.params} - \`${model.ollama}\` - ${model.vram_q4} Go VRAM Q4`)
      : ["- Aucun modèle pilotable trouvé."]),
    "",
    "### À surveiller",
    "",
    ...(report.decision_pack.watchlist.length
      ? report.decision_pack.watchlist.map((model) => `- ${model.name} ${model.params} - \`${model.ollama}\` - ${model.runtime_status}`)
      : ["- Aucune watchlist active."]),
    "",
    "### Compatibilité seulement",
    "",
    ...(report.decision_pack.compatibility_only.length
      ? report.decision_pack.compatibility_only.map((model) => `- ${model.name} ${model.params} - ${model.kind} - ${model.vram_q4} Go VRAM Q4`)
      : ["- Aucun modèle compatibilité seulement."]),
    "",
    "## Modèles",
    "",
    "| Modèle | Statut | Ollama | Catégorie |",
    "| --- | --- | --- | --- |",
  ];
  for (const row of report.required_models) {
    lines.push(`| ${row.label} | ${row.status} | \`${row.ollama || ""}\` | ${row.category || ""} |`);
  }
  lines.push("", "## Médias non actionnables", "");
  if (report.media_wrong.length) {
    for (const item of report.media_wrong) lines.push(`- ${item}`);
  } else {
    lines.push("- Aucun modèle image/audio/vidéo n'expose Bench, Dialogue ou Install comme texte Ollama.");
  }
  if (report.missing.length) {
    lines.push("", "## À corriger", "");
    for (const item of report.missing) lines.push(`- ${item}`);
  }
  lines.push("");
  return lines.join("\n");
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusLabel(row) {
  if (row.status !== "ok") return "à corriger";
  if (row.runtime_status === "ollama_available") return "pilotable";
  if (row.runtime_status === "ollama_frontier_available") return "frontier disponible";
  if (row.runtime_status === "ollama_watchlist") return "surveillé";
  if (row.runtime_status === "frontier_watchlist") return "frontier";
  return "ok";
}

function compactModel(row) {
  const model = row.model || row;
  return {
    name: model.name || "",
    params: model.params || "",
    category: row.category || "",
    kind: model.kind || "text",
    ollama: model.ollama || "",
    runtime_status: model.runtime_status || "",
    actionable_text: model.actionable_text === true,
    pilotable_text: Object.hasOwn(model, "pilotable_text") ? model.pilotable_text : null,
    vram_q4: model.vram_q4,
    use_case: model.use_case || "",
    source_url: model.source_url || "",
  };
}

function decisionPack(models) {
  const compact = models.map(compactModel);
  const pilotableNow = compact
    .filter((model) => model.kind === "text" && model.actionable_text && !["ollama_watchlist", "frontier_watchlist", "ollama_frontier_available"].includes(model.runtime_status))
    .sort((a, b) => Number(a.vram_q4 || 999) - Number(b.vram_q4 || 999))
    .slice(0, 12);
  const watchlist = compact
    .filter((model) => model.kind === "text" && model.actionable_text && ["ollama_watchlist", "frontier_watchlist", "ollama_frontier_available"].includes(model.runtime_status))
    .sort((a, b) => Number(a.vram_q4 || 999) - Number(b.vram_q4 || 999));
  const compatibilityOnly = compact
    .filter((model) => ["image", "audio", "video"].includes(String(model.kind || "").toLowerCase()) || !model.actionable_text)
    .sort((a, b) => String(a.kind).localeCompare(String(b.kind)) || Number(a.vram_q4 || 999) - Number(b.vram_q4 || 999))
    .slice(0, 18);
  return {
    pilotable_now: pilotableNow,
    watchlist,
    compatibility_only: compatibilityOnly,
    counts: {
      pilotable_now: pilotableNow.length,
      watchlist: watchlist.length,
      compatibility_only: compatibilityOnly.length,
    },
  };
}

function modelList(items, emptyText) {
  if (!items.length) return `<li>${esc(emptyText)}</li>`;
  return items.map((model) => `
    <li>
      <strong>${esc(`${model.name} ${model.params}`.trim())}</strong>
      <span>${esc(model.kind)} · ${esc(model.runtime_status || "catalogue")} · ${esc(model.vram_q4 ?? "n/a")} Go VRAM Q4</span>
      ${model.ollama ? `<code>${esc(model.ollama)}</code>` : "<em>compatibilité matériel seulement</em>"}
    </li>
  `).join("");
}

function html(report) {
  const modelRows = report.required_models.map((row) => `
    <article class="model ${row.status === "ok" ? "ok" : "bad"}">
      <div>
        <span>${esc(statusLabel(row))}</span>
        <h2>${esc(row.label)}</h2>
        <p><code>${esc(row.ollama || "n/a")}</code></p>
      </div>
      <dl>
        <dt>Catégorie</dt><dd>${esc(row.category || "n/a")}</dd>
        <dt>Runtime</dt><dd>${esc(row.runtime_status || "n/a")}</dd>
        <dt>Pilotable texte</dt><dd>${row.pilotable_text === false ? "non, watchlist" : "oui"}</dd>
        <dt>VRAM Q4</dt><dd>${esc(row.vram_q4 ?? "n/a")} Go</dd>
        <dt>Usage</dt><dd>${esc(row.use_case || "")}</dd>
      </dl>
      ${row.source_url ? `<p class="source">${esc(row.source_url)}</p>` : ""}
    </article>
  `).join("\n");
  const mediaText = report.media_wrong.length
    ? report.media_wrong.map((item) => `<li>${esc(item)}</li>`).join("")
    : "<li>Aucun modèle image/audio/vidéo n'expose Bench, Dialogue ou Install comme LLM texte.</li>";
  const missingText = report.missing.length
    ? report.missing.map((item) => `<li>${esc(item)}</li>`).join("")
    : "<li>Catalogue prioritaire complet.</li>";
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Catalogue vivant OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#607086;--line:#dbe4ef;--soft:#f5f8fc;--blue:#185abc;--green:#19735b;--amber:#9a5a00;--red:#9f2d2d}
    *{box-sizing:border-box}
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:var(--ink);background:#edf2f8;line-height:1.46}
    main{width:min(1160px,calc(100% - 28px));margin:28px auto}
    header{background:#12335e;color:white;border-radius:14px;padding:30px 34px;box-shadow:0 16px 46px rgba(28,43,68,.12)}
    h1{margin:0 0 8px;font-size:34px;letter-spacing:0}
    h2{margin:0 0 5px;font-size:21px}
    .cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:16px}
    .card,.model,section{background:white;border:1px solid var(--line);border-radius:14px;padding:20px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    .card strong{display:block;font-size:30px}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:16px}
    .model span{display:inline-flex;border-radius:999px;padding:4px 8px;background:#e7f0ff;color:var(--blue);font-size:12px;font-weight:900;text-transform:uppercase}
    .model.ok{border-color:#c8e7d8}.model.bad{border-color:#f2c7c7}
    dl{display:grid;grid-template-columns:130px 1fr;gap:7px 11px;margin:12px 0}
    dt{font-weight:900;color:var(--muted)}
    dd{margin:0}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}
    .source{color:var(--muted);font-size:12px;word-break:break-all}
    .decision{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:16px 0}
    .decision article{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    .decision h2{font-size:19px}
    .decision ul{padding-left:18px}
    .decision li strong{display:block}
    .decision li span{display:block;color:var(--muted);font-size:13px;margin:2px 0}
    .decision li code{display:inline-flex;margin-top:3px}
    .decision em{display:inline-flex;color:var(--muted);font-size:13px}
    .oktext{color:var(--green)}.warn{color:var(--amber)}.badtext{color:var(--red)}
    li{margin:7px 0}
    @media(max-width:900px){.cards,.grid,.decision{grid-template-columns:1fr}header,.card,.model,section{padding:20px}}
    @media print{body{background:white}main{width:100%;margin:0}header,.card,.model,section,.decision article{box-shadow:none;break-inside:avoid}.grid,.decision{grid-template-columns:1fr}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Catalogue vivant OutilsIA</h1>
    <p>Modèles prioritaires, statut pilotable texte et garde-fou média. Généré depuis <code>${esc(report.catalog.version)}</code>.</p>
  </header>
  <div class="cards">
    <div class="card"><strong class="${report.status === "PRIORITY_MODELS_OK" ? "oktext" : "badtext"}">${esc(report.status)}</strong><span>statut</span></div>
    <div class="card"><strong>${esc(report.summary.ok)}/${esc(report.summary.required)}</strong><span>priorités OK</span></div>
    <div class="card"><strong>${esc(report.catalog.models)}</strong><span>modèles suivis</span></div>
    <div class="card"><strong>${esc(report.summary.media_guarded)}</strong><span>médias gardés hors chat</span></div>
  </div>
  <section>
    <h2>Règle produit</h2>
    <p>Les modèles watchlist/frontier restent visibles pour compatibilité matérielle. Certains sont déjà confirmés côté Ollama mais volontairement gardés hors actions Bench/Dialogue quand leur taille ou leur statut frontier rend le test terrain imprudent. Les modèles image/audio/vidéo restent visibles mais sans actions Bench chat / Dialogue.</p>
  </section>
  <div class="decision">
    <article>
      <h2>Pilotables maintenant</h2>
      <p>Texte Ollama actionnable dans l'app : install, dialogue, benchmark et Arena locale.</p>
      <ul>${modelList(report.decision_pack.pilotable_now, "Aucun modèle pilotable trouvé.")}</ul>
    </article>
    <article>
      <h2>À surveiller</h2>
      <p>Présents pour la roadmap et la compatibilité : runtime à confirmer ou modèle frontier confirmé mais gardé hors pilotage automatique.</p>
      <ul>${modelList(report.decision_pack.watchlist, "Aucune watchlist active.")}</ul>
    </article>
    <article>
      <h2>Compatibilité seulement</h2>
      <p>Image, audio, vidéo ou modèle non piloté : visible pour le matériel, sans bouton Bench chat ni Dialogue.</p>
      <ul>${modelList(report.decision_pack.compatibility_only, "Aucun modèle compatibilité seulement.")}</ul>
    </article>
  </div>
  <div class="grid">
    ${modelRows}
  </div>
  <section>
    <h2>Garde-fou médias</h2>
    <ul>${mediaText}</ul>
  </section>
  <section>
    <h2>À corriger</h2>
    <ul>${missingText}</ul>
  </section>
</main>
</body>
</html>
`;
}

if (!existsSync(catalogPath)) {
  console.error(`priority_models_catalog_missing ${catalogPath}`);
  process.exit(1);
}

const catalog = readJson(catalogPath);
const models = [];
for (const category of catalog.categories || []) {
  for (const model of category.models || []) {
    models.push({ category: category.name || "", model });
  }
}

const byIdentity = new Map(models.map((row) => [identity(row.model), row]));
const missing = [];
const rows = required.map((item) => {
  const found = byIdentity.get(item.key);
  if (!found) {
    missing.push(`modèle absent: ${item.key}`);
    return { ...item, status: "missing", category: "", kind: "", actionable_text: false };
  }
  const model = found.model;
  const runtimeOk = item.runtime ? String(model.runtime_status || "") === item.runtime : true;
  const pilotableOk = item.runtime
    ? (["ollama_watchlist", "frontier_watchlist", "ollama_frontier_available"].includes(item.runtime)
      ? model.pilotable_text === false
      : item.runtime === "ollama_available"
        ? model.pilotable_text !== false
        : true)
    : true;
  const sourceOk = item.runtime ? /^https:\/\/.+/.test(String(model.source_url || "")) : true;
  const ok = model.kind === "text"
    && model.actionable_text === true
    && String(model.ollama || "") === item.ollama
    && runtimeOk
    && pilotableOk
    && sourceOk;
  if (!ok) missing.push(`modèle prioritaire invalide: ${item.key}`);
  return {
    ...item,
    status: ok ? "ok" : "invalid",
    category: found.category,
    kind: model.kind || "text",
    actionable_text: model.actionable_text === true,
    pilotable_text: Object.hasOwn(model, "pilotable_text") ? model.pilotable_text : null,
    runtime_status: model.runtime_status || "",
    source_url: model.source_url || "",
    use_case: model.use_case || "",
    vram_q4: model.vram_q4,
  };
});

const mediaWrong = models
  .filter(({ model }) => ["image", "audio", "video"].includes(String(model.kind || "text").toLowerCase()))
  .filter(({ model }) => model.actionable_text !== false || String(model.ollama || "").trim())
  .map(({ model }) => `${model.name || "unknown"} ${model.params || ""}`.trim());
for (const item of mediaWrong) missing.push(`média actionnable à tort: ${item}`);

const report = {
  schema: "outilsia.local_cockpit_priority_models.v1",
  generated_at: new Date().toISOString(),
  status: missing.length ? "PRIORITY_MODELS_INCOMPLETE" : "PRIORITY_MODELS_OK",
  catalog: {
    path: catalogPath,
    version: catalog.version || "",
    updated_at: catalog.updated_at || "",
    categories: (catalog.categories || []).length,
    models: models.length,
  },
  summary: {
    required: required.length,
    ok: rows.filter((row) => row.status === "ok").length,
    media_guarded: models.filter(({ model }) => ["image", "audio", "video"].includes(String(model.kind || "text").toLowerCase()) && model.actionable_text === false && !String(model.ollama || "").trim()).length,
  },
  required_models: rows,
  decision_pack: decisionPack(models),
  media_wrong: mediaWrong,
  missing,
};

mkdirSync(reportsRoot, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const jsonPath = join(reportsRoot, `priority_models_${stamp}.json`);
const mdPath = join(reportsRoot, `priority_models_${stamp}.md`);
const htmlPath = join(reportsRoot, `priority_models_${stamp}.html`);
writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
writeFileSync(mdPath, markdown(report), "utf8");
const htmlReport = html(report);
writeFileSync(htmlPath, htmlReport, "utf8");
writeFileSync(desktopHtmlPath, htmlReport, "utf8");
writeFileSync(desktopCmdPath, [
  "@echo off",
  "start \"\" \"%USERPROFILE%\\Desktop\\OutilsIA-Local-Cockpit-CATALOGUE-VIVANT.html\"",
  ""
].join("\r\n"), "utf8");

console.log(`priority_models_verified status=${report.status} ok=${report.summary.ok}/${report.summary.required} media_wrong=${report.media_wrong.length} json=${jsonPath.replace(`${repoRoot}/`, "")} html=${htmlPath.replace(`${repoRoot}/`, "")} desktop=${desktopHtmlPath}`);
if (missing.length) process.exit(1);
