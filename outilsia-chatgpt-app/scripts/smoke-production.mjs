import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { TOOL_NAMES } from "../server.js";

const baseUrl = String(process.env.OUTILSIA_PUBLIC_BASE_URL || "https://outilsia.fr").replace(/\/+$/, "");
const pages = [
  "/chatgpt-ia-locale",
  "/confidentialite-plugin-outilsia",
  "/conditions-plugin-outilsia",
  "/support-plugin-outilsia",
];

for (const path of pages) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "user-agent": "OutilsIA-ChatGPT-App-Smoke/0.2" },
  });
  if (response.status !== 200) throw new Error(`${path} returned ${response.status}`);
  const body = await response.text();
  if (!body.includes("OutilsIA")) throw new Error(`${path} returned an unexpected document`);
}

const challenge = await fetch(`${baseUrl}/.well-known/openai-apps-challenge`, {
  headers: { "user-agent": "OutilsIA-ChatGPT-App-Smoke/0.2" },
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
const client = new Client({ name: "outilsia-production-smoke", version: "0.2.0" });
await client.connect(transport);
try {
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
    if (
      tool._meta?.ui?.resourceUri !== "ui://outilsia/machine-cockpit-v2.html"
      || tool._meta?.["openai/outputTemplate"] !== "ui://outilsia/machine-cockpit-v2.html"
    ) {
      throw new Error(`Missing production widget binding for ${tool.name}`);
    }
  }

  const result = await client.callTool({
    name: "check_pc_for_local_ai",
    arguments: {
      cpu_name: "AMD Ryzen 7 7800X3D",
      cpu_cores: 8,
      ram_gb: 64,
      gpu_name: "NVIDIA GeForce RTX 4080 SUPER",
      gpu_vendor: "NVIDIA",
      vram_gb: 16,
      os_name: "Windows 11",
      usage: "assistant",
    },
  });
  if (result.isError || !result.structuredContent?.decision) {
    throw new Error("Production profile test did not return a decision.");
  }
  if (result.structuredContent.decision.benchmark_evidence !== null) {
    throw new Error("Declared production profile fabricated benchmark evidence.");
  }
} finally {
  await client.close();
}

console.log(`outilsia_chatgpt_production_smoke_ok pages=${pages.length} tools=${TOOL_NAMES.length} challenge=${challenge.status}`);
