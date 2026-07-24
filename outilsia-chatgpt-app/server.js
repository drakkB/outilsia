import { createServer as createNodeServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { buildCompatibilityDecision, buildUpgradeDecision, decisionText, USAGES } from "./lib/decision.js";
import { OutilsiaApi, OutilsiaApiError } from "./lib/outilsia-api.js";

export const APP_VERSION = "0.2.0";
export const RESOURCE_URI = "ui://outilsia/machine-cockpit-v2.html";
export const TOOL_NAMES = [
  "check_pc_for_local_ai",
  "analyze_shared_report",
  "simulate_hardware_upgrade",
  "render_machine_cockpit",
];

export const SERVER_INSTRUCTIONS = [
  "OutilsIA conseille l'IA locale mais ne scanne jamais un appareil depuis ChatGPT.",
  "Utilise check_pc_for_local_ai seulement avec un profil matériel explicite.",
  "Utilise analyze_shared_report seulement pour une URL https://outilsia.fr/r/...",
  "Ne prétends jamais installer Ollama, un modèle ou un pilote : ces actions restent dans Local Cockpit.",
  "N'invente jamais de tokens/s.",
  "Après un outil de données, appelle render_machine_cockpit avec la décision reçue.",
  "Si la machine suffit déjà, recommande clairement de ne rien acheter.",
].join(" ");

const usageSchema = z.enum(USAGES);
const machineProfileShape = {
  cpu_name: z.string().trim().min(2).max(200),
  cpu_cores: z.number().int().min(1).max(512).optional(),
  ram_gb: z.number().min(1).max(2048),
  gpu_name: z.string().trim().min(1).max(200),
  gpu_vendor: z.string().trim().max(80).optional(),
  vram_gb: z.number().min(0).max(512),
  unified_memory: z.boolean().optional(),
  storage_free_gb: z.number().min(0).max(1_000_000).optional(),
  os_name: z.string().trim().max(120).optional(),
};
const machineProfileSchema = z.object(machineProfileShape);

const modelSchema = z.object({
  name: z.string(),
  params: z.string(),
  status: z.string(),
  label: z.string(),
  vram_q4_gb: z.number(),
  ollama: z.string(),
  reason: z.string(),
});
const linkSchema = z.object({
  label: z.string(),
  url: z.string().url(),
  kind: z.string(),
});
const decisionSchema = z.object({
  schema_version: z.literal("outilsia.chatgpt.decision.v1"),
  decision_type: z.string(),
  title: z.string(),
  verdict: z.string(),
  usage: usageSchema,
  source: z.object({
    kind: z.string(),
    label: z.string(),
    is_real_scan: z.boolean(),
  }),
  machine: z.object({
    cpu: z.string(),
    cpu_cores: z.number(),
    ram_gb: z.number(),
    gpu: z.string(),
    gpu_vendor: z.string(),
    vram_gb: z.number(),
    unified_memory: z.boolean(),
    storage_free_gb: z.number(),
    os: z.string(),
  }),
  score: z.object({
    value: z.number(),
    label: z.string(),
    summary: z.string(),
  }),
  recommended_models: z.array(modelSchema),
  benchmark_evidence: z.object({
    model: z.string(),
    tokens_per_second: z.number(),
    elapsed_ms: z.number(),
    measured: z.boolean(),
  }).nullable(),
  purchase: z.object({
    priority: z.string(),
    headline: z.string(),
    summary: z.string(),
    upgrade: z.record(z.unknown()).nullable(),
  }),
  blocked_next: z.array(z.record(z.unknown())),
  links: z.array(linkSchema),
  limits: z.array(z.string()),
}).passthrough();

const decisionOutputSchema = {
  decision: decisionSchema,
};

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

const widgetHtml = readFileSync(new URL("./public/machine-cockpit-v2.html", import.meta.url), "utf8");
const rateLimitSalt = randomBytes(32).toString("hex");

function profileFromArgs(args) {
  return {
    name: "Profil déclaré via ChatGPT",
    cpu_name: args.cpu_name,
    cpu_cores: args.cpu_cores || 0,
    ram_gb: args.ram_gb,
    gpu_name: args.gpu_name,
    gpu_vendor: args.gpu_vendor || "",
    vram_gb: args.vram_gb,
    unified_memory: Boolean(args.unified_memory),
    storage_free_gb: args.storage_free_gb || 0,
    os_name: args.os_name || "",
  };
}

function decisionResult(decision, text = decisionText(decision)) {
  return {
    content: [{ type: "text", text }],
    structuredContent: { decision },
  };
}

function toolError(error) {
  const known = error instanceof OutilsiaApiError;
  const message = known
    ? error.message
    : "OutilsIA n'a pas pu terminer cette analyse. Réessayez avec un profil matériel explicite.";
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

function widgetMetadata() {
  const widgetDomain = String(process.env.OUTILSIA_WIDGET_DOMAIN || "").trim();
  const ui = {
    prefersBorder: true,
    csp: {
      connectDomains: ["https://outilsia.fr"],
      resourceDomains: [],
    },
  };
  if (widgetDomain) ui.domain = widgetDomain;
  return {
    ui,
    "openai/widgetDescription": "Fiche compacte OutilsIA : score, matériel, modèles, preuve mesurée et achat utile ou inutile.",
    "openai/widgetPrefersBorder": true,
    "openai/widgetCSP": {
      connect_domains: ["https://outilsia.fr"],
      resource_domains: [],
      redirect_domains: ["https://outilsia.fr"],
    },
    ...(widgetDomain ? { "openai/widgetDomain": widgetDomain } : {}),
  };
}

export function createOutilsiaMcpServer({ api = new OutilsiaApi() } = {}) {
  const server = new McpServer(
    { name: "outilsia-local-ai-advisor", version: APP_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  registerAppResource(
    server,
    "outilsia-machine-cockpit",
    RESOURCE_URI,
    {},
    async () => ({
      contents: [{
        uri: RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: widgetHtml,
        _meta: widgetMetadata(),
      }],
    }),
  );

  registerAppTool(
    server,
    "check_pc_for_local_ai",
    {
      title: "Vérifier un PC pour l'IA locale",
      description: [
        "Estime quels modèles IA locaux conviennent à partir de caractéristiques que l'utilisateur fournit explicitement.",
        "Ce n'est pas un scan et l'outil ne doit pas être appelé si CPU, RAM, GPU et VRAM manquent.",
      ].join(" "),
      inputSchema: {
        ...machineProfileShape,
        usage: usageSchema.optional().default("polyvalent"),
      },
      outputSchema: decisionOutputSchema,
      annotations: readOnlyAnnotations,
      _meta: {
        ui: { visibility: ["model"] },
      },
    },
    async (args) => {
      try {
        const payload = await api.checkCompatibility(profileFromArgs(args));
        return decisionResult(buildCompatibilityDecision(payload, {
          usage: args.usage,
          sourceKind: "declared_profile",
        }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerAppTool(
    server,
    "analyze_shared_report",
    {
      title: "Analyser un rapport OutilsIA partagé",
      description: [
        "Lit un rapport public OutilsIA Local Cockpit déjà créé par l'utilisateur.",
        "Accepte uniquement une URL exacte https://outilsia.fr/r/... et ne donne aucun accès à la machine.",
      ].join(" "),
      inputSchema: {
        report_url: z.string().url().max(500),
        usage: usageSchema.optional().default("polyvalent"),
      },
      outputSchema: decisionOutputSchema,
      annotations: readOnlyAnnotations,
      _meta: {
        ui: { visibility: ["model"] },
      },
    },
    async (args) => {
      try {
        const payload = await api.getSharedReport(args.report_url);
        return decisionResult(buildCompatibilityDecision(payload, {
          usage: args.usage,
          sourceKind: "shared_report",
          reportUrl: args.report_url,
        }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerAppTool(
    server,
    "simulate_hardware_upgrade",
    {
      title: "Simuler un upgrade IA locale",
      description: [
        "Compare le même profil avant et après une hausse de RAM ou VRAM.",
        "La simulation ne modifie rien et doit conclure qu'aucun achat n'est utile si le catalogue ne montre pas de gain.",
      ].join(" "),
      inputSchema: {
        profile: machineProfileSchema,
        target_ram_gb: z.number().min(1).max(2048).optional(),
        target_vram_gb: z.number().min(0).max(512).optional(),
        usage: usageSchema.optional().default("polyvalent"),
      },
      outputSchema: decisionOutputSchema,
      annotations: readOnlyAnnotations,
      _meta: {
        ui: { visibility: ["model"] },
      },
    },
    async (args) => {
      try {
        const profile = profileFromArgs(args.profile);
        const targetRamGb = args.target_ram_gb || profile.ram_gb;
        const targetVramGb = args.target_vram_gb ?? profile.vram_gb;
        if (targetRamGb <= profile.ram_gb && targetVramGb <= profile.vram_gb) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: "Indiquez une RAM ou une VRAM cible supérieure au profil actuel pour simuler un upgrade.",
            }],
          };
        }
        const [beforePayload, afterPayload] = await Promise.all([
          api.checkCompatibility(profile),
          api.checkCompatibility({
            ...profile,
            name: "Simulation upgrade via ChatGPT",
            ram_gb: targetRamGb,
            vram_gb: targetVramGb,
          }),
        ]);
        const decision = buildUpgradeDecision(beforePayload, afterPayload, {
          usage: args.usage,
          targetRamGb,
          targetVramGb,
        });
        return decisionResult(decision);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerAppTool(
    server,
    "render_machine_cockpit",
    {
      title: "Afficher la fiche OutilsIA",
      description: "Affiche sans recalculer une décision produite par un outil OutilsIA de cette app.",
      inputSchema: {
        decision: decisionSchema,
      },
      outputSchema: decisionOutputSchema,
      annotations: readOnlyAnnotations,
      _meta: {
        ui: { resourceUri: RESOURCE_URI },
        "openai/outputTemplate": RESOURCE_URI,
        "openai/toolInvocation/invoking": "Préparation de la fiche OutilsIA…",
        "openai/toolInvocation/invoked": "Fiche OutilsIA prête",
      },
    },
    async (args) => decisionResult(args.decision, "Fiche OutilsIA affichée."),
  );

  return server;
}

function requestIdentity(req) {
  const rawIdentity = String(
    req.headers["cf-connecting-ip"]
      || req.headers["x-forwarded-for"]
      || req.socket.remoteAddress
      || "unknown",
  ).split(",")[0].trim();
  return createHash("sha256")
    .update(rateLimitSalt)
    .update(rawIdentity)
    .digest("hex");
}

function createRateLimiter(limitPerMinute) {
  const buckets = new Map();
  return (identity) => {
    const now = Date.now();
    const minute = Math.floor(now / 60_000);
    if (buckets.size > 10_000) {
      for (const [key, value] of buckets) {
        if (value.minute < minute) buckets.delete(key);
      }
    }
    const bucket = buckets.get(identity);
    if (!bucket || bucket.minute !== minute) {
      buckets.set(identity, { minute, count: 1 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limitPerMinute;
  };
}

export function createHttpServer({
  api = new OutilsiaApi(),
  rateLimitPerMinute = Number(process.env.OUTILSIA_RATE_LIMIT_PER_MINUTE || 120),
  challengeToken = process.env.OUTILSIA_OPENAI_CHALLENGE_TOKEN || "",
} = {}) {
  const allowRequest = createRateLimiter(
    Number.isFinite(rateLimitPerMinute) && rateLimitPerMinute > 0 ? rateLimitPerMinute : 120,
  );

  return createNodeServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400).end("Missing URL");
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "GET" && url.pathname === "/.well-known/openai-apps-challenge") {
      const token = String(challengeToken).trim();
      if (!token || token.length > 4096 || /[\r\n]/.test(token)) {
        res.writeHead(404, {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        }).end("Not configured");
        return;
      }
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      }).end(token);
      return;
    }

    if (req.method === "GET" && ["/", "/healthz"].includes(url.pathname)) {
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      }).end(JSON.stringify({
        ok: true,
        service: "outilsia-chatgpt-app",
        version: APP_VERSION,
        mcp: "/mcp",
        mode: "read-only",
      }));
      return;
    }

    if (req.method === "OPTIONS" && url.pathname === "/mcp") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type, mcp-session-id",
        "access-control-expose-headers": "Mcp-Session-Id",
      }).end();
      return;
    }

    if (url.pathname === "/mcp" && ["POST", "GET", "DELETE"].includes(req.method || "")) {
      if (!allowRequest(requestIdentity(req))) {
        res.writeHead(429, {
          "content-type": "application/json; charset=utf-8",
          "retry-after": "60",
        }).end(JSON.stringify({ error: "rate_limit" }));
        return;
      }
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-expose-headers", "Mcp-Session-Id");
      const server = createOutilsiaMcpServer({ api });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error("MCP request failed:", error);
        if (!res.headersSent) res.writeHead(500).end("Internal server error");
      }
      return;
    }

    res.writeHead(404, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    }).end(JSON.stringify({ error: "not_found" }));
  });
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  const port = Number(process.env.PORT || 8787);
  const host = String(process.env.HOST || "127.0.0.1");
  createHttpServer().listen(port, host, () => {
    console.log(`OutilsIA ChatGPT App listening on http://${host}:${port}/mcp`);
  });
}
