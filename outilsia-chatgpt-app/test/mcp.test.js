import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  createHttpServer,
  DEFAULT_WIDGET_DOMAIN,
  RESOURCE_URI,
  TOOL_NAMES,
} from "../server.js";

function compatibility(profile, withBenchmark = false) {
  const score = Number(profile.vram_gb) >= 16 ? 80 : 54;
  return {
    ok: true,
    machine: {
      ...profile,
      benchmarks: withBenchmark
        ? [{ model_name: "qwen3:8b", tokens_per_second: 31.5, elapsed_ms: 2400, success: true }]
        : [],
    },
    compatibility: {
      score: {
        score,
        label: score >= 75 ? "Confort" : "Limité",
        summary: "Test MCP déterministe.",
      },
      compatible: [{
        name: "Qwen 3",
        params: "8B",
        category: "Sweet spot 7B-9B",
        status: "rapide",
        label: "Rapide",
        vram_q4: 5,
        ollama: "qwen3:8b",
      }],
      blocked_next: [],
      upgrades: score >= 75 ? [] : [{ name: "GPU 16 Go", summary: "Plus de marge." }],
      buying_guides: [],
    },
  };
}

const fakeApi = {
  checkCompatibility: async (profile) => compatibility(profile),
  getSharedReport: async () => compatibility({
    cpu_name: "Core i7",
    cpu_cores: 8,
    ram_gb: 16,
    gpu_name: "GTX 1080 Ti",
    gpu_vendor: "NVIDIA",
    vram_gb: 11,
    os_name: "Windows 10",
  }, true),
};

test("MCP exposes four read-only tools and returns renderable structured data", async (t) => {
  const httpServer = createHttpServer({ api: fakeApi, rateLimitPerMinute: 1_000 });
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const address = httpServer.address();
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${address.port}/mcp`),
  );
  const client = new Client({ name: "outilsia-test-client", version: "0.1.0" });
  await client.connect(transport);
  t.after(async () => {
    await client.close();
    await new Promise((resolve) => httpServer.close(resolve));
  });

  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [...TOOL_NAMES].sort());
  for (const tool of listed.tools) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
    assert.equal(tool.annotations?.openWorldHint, false);
    assert.equal(tool._meta?.ui?.resourceUri, "ui://outilsia/machine-cockpit-v3.html");
    assert.equal(tool._meta?.["openai/outputTemplate"], "ui://outilsia/machine-cockpit-v3.html");
  }
  const renderTool = listed.tools.find((tool) => tool.name === "render_machine_cockpit");
  assert.deepEqual(renderTool?._meta?.ui?.visibility, ["app"]);
  for (const tool of listed.tools.filter((item) => item.name !== "render_machine_cockpit")) {
    assert.deepEqual(tool._meta?.ui?.visibility, ["model", "app"]);
  }

  const resource = await client.readResource({ uri: RESOURCE_URI });
  assert.equal(resource.contents[0]?._meta?.ui?.domain, DEFAULT_WIDGET_DOMAIN);
  assert.equal(resource.contents[0]?._meta?.["openai/widgetDomain"], DEFAULT_WIDGET_DOMAIN);

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
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.decision.score.value, 80);
  assert.equal(result.structuredContent.decision.purchase.priority, "none");
  assert.match(result.content[0].text, /fiche visuelle OutilsIA est jointe/i);
  assert.doesNotMatch(result.content[0].text, /render_machine_cockpit/i);

  const report = await client.callTool({
    name: "analyze_shared_report",
    arguments: {
      report_url: "https://outilsia.fr/r/3O3-DjbGWfNrIBUWe8IdmaEbJxG30F0m",
      usage: "assistant",
    },
  });
  assert.equal(report.structuredContent.decision.source.is_real_scan, true);
  assert.equal(report.structuredContent.decision.benchmark_evidence.tokens_per_second, 31.5);

  const simulation = await client.callTool({
    name: "simulate_hardware_upgrade",
    arguments: {
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
  });
  assert.equal(simulation.isError, undefined);
  assert.equal(simulation.structuredContent.decision.decision_type, "upgrade_simulation");
  assert.equal(simulation.structuredContent.decision.score_gain > 0, true);
  assert.equal(
    simulation.structuredContent.decision.machine.gpu,
    "GPU cible simulé (16 Go VRAM)",
  );

  const rendered = await client.callTool({
    name: "render_machine_cockpit",
    arguments: { decision: result.structuredContent.decision },
  });
  assert.equal(rendered.structuredContent.decision.schema_version, "outilsia.chatgpt.decision.v1");
});

test("domain verification returns only the configured OpenAI token", async (t) => {
  const token = "openai-apps-verification-token-test";
  const httpServer = createHttpServer({
    api: fakeApi,
    rateLimitPerMinute: 1_000,
    challengeToken: token,
  });
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const address = httpServer.address();
  t.after(async () => {
    await new Promise((resolve) => httpServer.close(resolve));
  });

  const response = await fetch(
    `http://127.0.0.1:${address.port}/.well-known/openai-apps-challenge`,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(await response.text(), token);
});

test("domain verification stays disabled until OpenAI provides a token", async (t) => {
  const httpServer = createHttpServer({
    api: fakeApi,
    rateLimitPerMinute: 1_000,
    challengeToken: "",
  });
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const address = httpServer.address();
  t.after(async () => {
    await new Promise((resolve) => httpServer.close(resolve));
  });

  const response = await fetch(
    `http://127.0.0.1:${address.port}/.well-known/openai-apps-challenge`,
  );
  assert.equal(response.status, 404);
});
