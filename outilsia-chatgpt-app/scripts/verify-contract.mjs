import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_WIDGET_DOMAIN,
  RESOURCE_URI,
  SERVER_INSTRUCTIONS,
  TOOL_NAMES,
} from "../server.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = readFileSync(join(root, "server.js"), "utf8");
const decision = readFileSync(join(root, "lib", "decision.js"), "utf8");
const widget = readFileSync(join(root, "public", "machine-cockpit-v2.html"), "utf8");
const readme = readFileSync(join(root, "README.md"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

requireCondition(TOOL_NAMES.length === 4, "The v1 app must expose exactly four focused tools.");
for (const name of TOOL_NAMES) {
  requireCondition(server.includes(`"${name}"`), `Missing registered tool: ${name}`);
}
requireCondition(server.includes("readOnlyHint: true"), "Tools must declare readOnlyHint.");
requireCondition(server.includes("destructiveHint: false"), "Tools must declare destructiveHint=false.");
requireCondition(!server.includes("node:child_process"), "The MCP server must never spawn local commands.");
requireCondition(!server.includes("exec(") && !server.includes("spawn("), "The MCP server must not execute local processes.");
requireCondition(SERVER_INSTRUCTIONS.includes("ne scanne jamais"), "Server instructions must reject fake scans.");
requireCondition(SERVER_INSTRUCTIONS.includes("N'invente jamais de tokens/s"), "Server instructions must reject fabricated speed.");
requireCondition(
  SERVER_INSTRUCTIONS.includes("rendent directement la fiche"),
  "Server instructions must document direct widget rendering.",
);
requireCondition(
  !decision.includes("Utilisez render_machine_cockpit"),
  "Analysis text must not ask the model for a redundant render call.",
);
requireCondition(
  server.includes("resourceUri: RESOURCE_URI"),
  "Analysis tools must link directly to the widget resource.",
);
requireCondition(
  server.includes('visibility: modelVisible ? ["model", "app"] : ["app"]'),
  "The internal render tool must not be exposed to the model.",
);
requireCondition(
  DEFAULT_WIDGET_DOMAIN === "https://chatgpt-local-cockpit.outilsia.fr",
  "The UI must use its dedicated production origin.",
);
requireCondition(RESOURCE_URI.includes("-v2.html"), "Widget resource URI must be versioned.");
requireCondition(widget.includes("ui/initialize"), "Widget must initialize the MCP Apps bridge.");
requireCondition(widget.includes("ui/notifications/tool-result"), "Widget must consume MCP tool results.");
requireCondition(!/<iframe\b/i.test(widget), "Widget must not embed subframes.");
requireCondition(!/<script[^>]+\bsrc=/i.test(widget), "Widget scripts must be self-contained.");
requireCondition(widget.includes(".slice(0, 2)"), "Widget must expose no more than two actions.");
requireCondition(!decision.includes("buying_guides"), "MCP decisions must not expose buying-guide or affiliate links.");
requireCondition(server.includes("OUTILSIA_OPENAI_CHALLENGE_TOKEN"), "Domain verification route is missing.");
requireCondition(readme.includes("Local Cockpit reste seul"), "README must document the desktop boundary.");
requireCondition(pkg.dependencies["@modelcontextprotocol/sdk"], "Missing MCP SDK dependency.");
requireCondition(pkg.dependencies["@modelcontextprotocol/ext-apps"], "Missing MCP Apps dependency.");

console.log(`outilsia_chatgpt_app_contract_ok tools=${TOOL_NAMES.length} widget=${RESOURCE_URI} mode=read-only`);
