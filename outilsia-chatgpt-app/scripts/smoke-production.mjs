import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  APP_VERSION,
  DEFAULT_WIDGET_DOMAIN,
  LEGACY_RESOURCE_URIS,
  LOCAL_ACTION_BOUNDARY_MESSAGE,
  RESOURCE_URI,
  TOOL_NAMES,
} from "../server.js";
import { publicationStatusCopy, validatePublicationStatus } from "../lib/publication-status.js";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicationStatus = validatePublicationStatus(
  JSON.parse(readFileSync(join(root, "submission", "publication-status.json"), "utf8")),
);
const publicationCopy = publicationStatusCopy(publicationStatus);

const baseUrl = String(process.env.OUTILSIA_PUBLIC_BASE_URL || "https://outilsia.fr").replace(/\/+$/, "");
const pages = [
  "/chatgpt-ia-locale",
  "/confidentialite-plugin-outilsia",
  "/conditions-plugin-outilsia",
  "/support-plugin-outilsia",
];
const widgetHealthUrl = `${DEFAULT_WIDGET_DOMAIN}/healthz`;
const pageBodies = new Map();

for (const path of pages) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "user-agent": "OutilsIA-ChatGPT-App-Smoke/0.2.1" },
  });
  if (response.status !== 200) throw new Error(`${path} returned ${response.status}`);
  const body = await response.text();
  pageBodies.set(path, body);
  if (!body.includes("OutilsIA")) throw new Error(`${path} returned an unexpected document`);
  if (path === "/chatgpt-ia-locale" && !body.includes("machine-cockpit-v3")) {
    throw new Error("Public ChatGPT app page still advertises a stale widget.");
  }
}
if (
  !pageBodies.get("/chatgpt-ia-locale")?.includes(publicationCopy.heroEyebrow)
  || !pageBodies.get("/chatgpt-ia-locale")?.includes(publicationCopy.directoryAnswer)
) {
  throw new Error(`Production website does not expose publication state ${publicationStatus.state}.`);
}
if (
  !pageBodies.get("/conditions-plugin-outilsia")?.includes(publicationCopy.termsStatus)
  || !pageBodies.get("/conditions-plugin-outilsia")?.includes(publicationCopy.termsAccess)
) {
  throw new Error(`Production terms do not expose publication state ${publicationStatus.state}.`);
}
const widgetHealth = await fetch(widgetHealthUrl, {
  headers: { "user-agent": "OutilsIA-ChatGPT-App-Smoke/0.2.1" },
});
if (widgetHealth.status !== 200 || !(await widgetHealth.text()).includes("widget origin: ok")) {
  throw new Error(`Dedicated widget origin failed at ${widgetHealthUrl}`);
}

const challenge = await fetch(`${baseUrl}/.well-known/openai-apps-challenge`, {
  headers: { "user-agent": "OutilsIA-ChatGPT-App-Smoke/0.2.1" },
});
if (![200, 404].includes(challenge.status)) {
  throw new Error(`Domain challenge returned ${challenge.status}`);
}
if (challenge.status === 200) {
  const token = await challenge.text();
  if (!token.trim() || token.includes("\n") || token.includes("\r") || token.trim().startsWith("{")) {
    throw new Error("Domain challenge must return one plain-text token.");
  }
}

const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
const client = new Client({ name: "outilsia-production-smoke", version: "0.2.1" });
await client.connect(transport);
try {
  if (client.getServerVersion()?.version !== APP_VERSION) {
    throw new Error(`Production server version differs from ${APP_VERSION}.`);
  }
  const productionInstructions = String(client.getInstructions() || "");
  for (const marker of [
    "appelle obligatoirement explain_local_action_boundary",
    "n'utilise ni recherche Web ni autre outil",
    "sans ajouter de commande",
    "procédure manuelle",
  ]) {
    if (!productionInstructions.includes(marker)) {
      throw new Error(`Production instructions are missing ${marker}.`);
    }
  }

  async function requireDecision(name, args, label) {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError || !result.structuredContent?.decision) {
      throw new Error(`${label} did not return a decision.`);
    }
    return result;
  }

  async function requireToolError(name, args, label) {
    try {
      const result = await client.callTool({ name, arguments: args });
      if (!result.isError) throw new Error(`${label} unexpectedly succeeded.`);
    } catch (error) {
      const message = String(error?.message || error);
      if (/unexpectedly succeeded/i.test(message)) throw error;
      if (!/(invalid params|validation|mcp error -32602)/i.test(message)) throw error;
    }
  }

  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  if (names.join("|") !== [...TOOL_NAMES].sort().join("|")) {
    throw new Error(`Unexpected production tools: ${names.join(", ")}`);
  }
  for (const tool of listed.tools) {
    if (
      tool.annotations?.readOnlyHint !== true
      || tool.annotations?.openWorldHint !== false
      || tool.annotations?.destructiveHint !== false
    ) {
      throw new Error(`Invalid production annotations for ${tool.name}`);
    }
    if (tool.name === "explain_local_action_boundary") {
      if (
        tool._meta?.ui?.resourceUri !== undefined
        || tool._meta?.["openai/outputTemplate"] !== undefined
      ) {
        throw new Error("The action boundary tool must not request a widget.");
      }
    } else if (
      tool._meta?.ui?.resourceUri !== "ui://outilsia/machine-cockpit-v3.html"
      || tool._meta?.["openai/outputTemplate"] !== "ui://outilsia/machine-cockpit-v3.html"
    ) {
      throw new Error(`Missing production widget binding for ${tool.name}`);
    }
  }
  const renderTool = listed.tools.find((tool) => tool.name === "render_machine_cockpit");
  if (renderTool?._meta?.ui?.visibility?.join("|") !== "app") {
    throw new Error("render_machine_cockpit must remain app-only.");
  }
  const resource = await client.readResource({ uri: RESOURCE_URI });
  const resourceContent = resource.contents[0];
  const resourceMeta = resourceContent?._meta;
  if (
    resourceMeta?.ui?.domain !== DEFAULT_WIDGET_DOMAIN
    || resourceMeta?.["openai/widgetDomain"] !== DEFAULT_WIDGET_DOMAIN
  ) {
    throw new Error("Production widget domain metadata is missing or stale.");
  }
  for (const marker of ["toolResponseMetadata", "notifyIntrinsicHeight", "Analyse impossible"]) {
    if (!resourceContent?.text?.includes(marker)) {
      throw new Error(`Production widget is missing ${marker}.`);
    }
  }
  const listedResources = await client.listResources();
  const productionUris = listedResources.resources.map((item) => item.uri);
  for (const legacyUri of LEGACY_RESOURCE_URIS) {
    if (!productionUris.includes(legacyUri)) {
      throw new Error(`Production is missing legacy widget alias ${legacyUri}.`);
    }
    const legacyResource = await client.readResource({ uri: legacyUri });
    const legacyContent = legacyResource.contents[0];
    if (
      legacyContent?.mimeType !== resourceContent?.mimeType
      || legacyContent?.text !== resourceContent?.text
      || legacyContent?._meta?.ui?.domain !== DEFAULT_WIDGET_DOMAIN
    ) {
      throw new Error(`Legacy widget alias ${legacyUri} differs from the current widget.`);
    }
  }

  const result = await requireDecision(
    "check_pc_for_local_ai",
    {
      cpu_name: "AMD Ryzen 7 7800X3D",
      cpu_cores: 8,
      ram_gb: 64,
      gpu_name: "NVIDIA GeForce RTX 4080 SUPER",
      gpu_vendor: "NVIDIA",
      vram_gb: 16,
      os_name: "Windows 11",
      usage: "assistant",
    },
    "Gaming PC profile",
  );
  if (result.structuredContent.decision.benchmark_evidence !== null) {
    throw new Error("Declared production profile fabricated benchmark evidence.");
  }
  if (/render_machine_cockpit/i.test(result.content?.[0]?.text || "")) {
    throw new Error("Production response still asks for a redundant render tool.");
  }

  await requireDecision(
    "check_pc_for_local_ai",
    {
      cpu_name: "Intel Core i7-4790K",
      cpu_cores: 4,
      ram_gb: 16,
      gpu_name: "NVIDIA GeForce GTX 1080 Ti",
      gpu_vendor: "NVIDIA",
      vram_gb: 11,
      os_name: "Windows 10",
      usage: "francais",
    },
    "Old PC profile",
  );

  const cpuOnly = await requireDecision(
    "check_pc_for_local_ai",
    {
      cpu_name: "Intel N100",
      cpu_cores: 4,
      ram_gb: 16,
      gpu_name: "Aucun GPU dédié",
      gpu_vendor: "Intel",
      vram_gb: 0,
      os_name: "Linux",
      usage: "portable",
    },
    "CPU-only profile",
  );
  if (cpuOnly.structuredContent.decision.machine.vram_gb !== 0) {
    throw new Error("CPU-only profile did not preserve 0 GB VRAM.");
  }

  const report = await requireDecision(
    "analyze_shared_report",
    {
      report_url: "https://outilsia.fr/r/3O3-DjbGWfNrIBUWe8IdmaEbJxG30F0m",
      usage: "assistant",
    },
    "Shared report",
  );
  if (report.structuredContent.decision.source.kind !== "shared_report") {
    throw new Error("Shared report lost its source kind.");
  }

  const upgrade = await requireDecision(
    "simulate_hardware_upgrade",
    {
      profile: {
        cpu_name: "Intel Core i7-4790K",
        cpu_cores: 4,
        ram_gb: 16,
        gpu_name: "NVIDIA GeForce GTX 1080 Ti",
        gpu_vendor: "NVIDIA",
        vram_gb: 11,
        os_name: "Windows 10",
      },
      target_ram_gb: 32,
      target_vram_gb: 16,
      usage: "gros_modeles",
    },
    "Upgrade simulation",
  );
  if (upgrade.structuredContent.decision.decision_type !== "upgrade_simulation") {
    throw new Error("Upgrade simulation returned the wrong decision type.");
  }

  const boundary = await client.callTool({
    name: "explain_local_action_boundary",
    arguments: {
      requested_action: "install",
      target: "Ollama puis qwen3:8b",
    },
  });
  if (boundary.isError || boundary.content?.[0]?.text !== LOCAL_ACTION_BOUNDARY_MESSAGE) {
    throw new Error("Local action boundary did not return its deterministic refusal.");
  }
  if (
    boundary.structuredContent?.boundary?.allowed !== false
    || boundary.structuredContent?.boundary?.mode !== "read_only"
    || boundary.structuredContent?.boundary?.desktop_app_url
      !== "https://outilsia.fr/telecharger-scanner-ia-local"
  ) {
    throw new Error("Local action boundary returned an invalid structured result.");
  }
  if (/```|powershell|winget|apt(?:-get)?|irm\s+https/i.test(boundary.content?.[0]?.text || "")) {
    throw new Error("Local action boundary leaked an installation command.");
  }

  await requireToolError(
    "analyze_shared_report",
    {
      report_url: "https://example.com/r/3O3-DjbGWfNrIBUWe8IdmaEbJxG30F0m",
      usage: "assistant",
    },
    "Foreign report URL",
  );
  await requireToolError(
    "simulate_hardware_upgrade",
    {
      profile: {
        cpu_name: "Intel Core i7-4790K",
        ram_gb: 16,
        gpu_name: "NVIDIA GeForce GTX 1080 Ti",
        vram_gb: 11,
      },
      target_ram_gb: 16,
      target_vram_gb: 11,
      usage: "polyvalent",
    },
    "Non-upgrade simulation",
  );
  await requireToolError(
    "check_pc_for_local_ai",
    {
      cpu_name: "PC inconnu",
      ram_gb: 16,
    },
    "Incomplete hardware profile",
  );
} finally {
  await client.close();
}

console.log(`outilsia_chatgpt_production_smoke_ok pages=${pages.length} tools=${TOOL_NAMES.length} positive=6 negative=3 challenge=${challenge.status}`);
