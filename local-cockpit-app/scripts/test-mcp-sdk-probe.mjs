#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const probe = resolve(root, "scripts", "probe-mcp-sdk.mjs");
const token = "a".repeat(64);
const planSha256 = "b".repeat(64);
const privateMarker = "PRIVATE_REPORT_CONTENT_MUST_NOT_LEAK";

const readOnlyTools = [
  "outilsia_get_cockpit_status",
  "outilsia_get_machine_profile",
  "outilsia_get_hardware_doctor",
  "outilsia_list_installed_models",
  "outilsia_get_model_recommendation",
  "outilsia_get_benchmark_proofs",
  "outilsia_get_capability_passport",
  "outilsia_get_strategy_arena_handoff",
];

const readOnlyResources = [
  "outilsia://passport/current",
  "outilsia://models/installed",
  "outilsia://recommendation/current",
  "outilsia://strategy-arena/handoff",
];

const actionTools = [
  "outilsia_prepare_model_install",
  "outilsia_prepare_benchmark",
  "outilsia_prepare_report_export",
  "outilsia_get_action_request",
  "outilsia_cancel_action_request",
];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolDefinition(name, readOnly = true) {
  return {
    name,
    title: name,
    description: `Fixture ${name}`,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      title: name,
      readOnlyHint: readOnly,
      destructiveHint: false,
      idempotentHint: readOnly,
      openWorldHint: false,
    },
  };
}

function toolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
    isError: false,
  };
}

function requestView(requestId, state = "awaiting_human") {
  return {
    schema: "outilsia.local_action_request.v0",
    request_id: requestId,
    action: "export_report",
    state,
    plan: {
      action: "export_report",
      target: {
        format: "markdown",
        filename: "rapport-sdk-test.md",
        destination: "app_data",
        content_sha256: "c".repeat(64),
      },
    },
    plan_sha256: planSha256,
    human_decision: state === "cancelled" ? "cancelled_by_requesting_client" : "not_recorded",
    capability_expires_at_ms: null,
    capability_consumed: false,
    result: null,
    privacy: {
      capability_secret_exposed: false,
      export_content_exposed: false,
    },
  };
}

function sendJson(response, status, value) {
  const body = value == null ? "" : JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "MCP-Protocol-Version": "2025-11-25",
  });
  response.end(body);
}

function createFixture(mode) {
  let nextRequest = 1;
  const requests = new Map();
  let executeAttempts = 0;
  const server = createServer((request, response) => {
    if (request.url !== "/mcp") {
      sendJson(response, 404, { error: "not_found" });
      return;
    }
    if (request.method === "GET") {
      sendJson(response, 405, { error: "streamable_http_post_required" });
      return;
    }
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      sendJson(response, 401, { error: "bearer_token_required" });
      return;
    }
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (message.method === "notifications/initialized" && message.id == null) {
        sendJson(response, 202, null);
        return;
      }
      const id = message.id;
      const params = message.params || {};
      if (message.method === "initialize") {
        sendJson(response, 200, rpcResult(id, {
          protocolVersion: "2025-11-25",
          capabilities: mode === "read_only"
            ? {
                tools: { listChanged: false },
                resources: { subscribe: false, listChanged: false },
              }
            : { tools: { listChanged: false } },
          serverInfo: {
            name: mode === "read_only"
              ? "OutilsIA Local Cockpit"
              : "OutilsIA Local Action Lane",
            version: "0.1.0",
          },
          instructions: "OutilsIA fixture with strict local boundaries and no implicit execution.",
        }));
        return;
      }
      if (message.method === "tools/list") {
        const names = mode === "read_only" ? readOnlyTools : actionTools;
        sendJson(response, 200, rpcResult(id, {
          tools: names.map((name, index) => toolDefinition(
            name,
            mode === "read_only" || index === 3,
          )),
        }));
        return;
      }
      if (message.method === "resources/list" && mode === "read_only") {
        sendJson(response, 200, rpcResult(id, {
          resources: readOnlyResources.map((uri) => ({
            uri,
            name: uri,
            mimeType: "application/json",
          })),
        }));
        return;
      }
      if (message.method === "resources/read" && mode === "read_only") {
        const uri = String(params.uri || "");
        if (!readOnlyResources.includes(uri)) {
          sendJson(response, 200, rpcError(id, -32602, "Unknown resource"));
          return;
        }
        sendJson(response, 200, rpcResult(id, {
          contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify({ schema: "outilsia.fixture.v1", uri }),
          }],
        }));
        return;
      }
      if (message.method !== "tools/call") {
        sendJson(response, 200, rpcError(id, -32601, "Unknown method"));
        return;
      }
      const name = params.name;
      const argumentsValue = params.arguments || {};
      if (mode === "read_only") {
        if (!readOnlyTools.includes(name)) {
          sendJson(response, 200, rpcError(id, -32602, "Unknown read-only tool"));
          return;
        }
        sendJson(response, 200, rpcResult(id, toolResult({
          schema: `outilsia.fixture.${name}.v1`,
          local_only: true,
        })));
        return;
      }
      if (name === "outilsia_execute_action") {
        executeAttempts += 1;
        sendJson(response, 200, rpcError(id, -32602, "Unknown Action Lane tool"));
        return;
      }
      if (name === "outilsia_prepare_report_export") {
        if (argumentsValue.format !== "markdown") {
          sendJson(response, 200, rpcError(id, -32602, "Invalid format"));
          return;
        }
        const requestId = `larq-sdk-${nextRequest}`;
        nextRequest += 1;
        const value = requestView(requestId);
        requests.set(requestId, value);
        sendJson(response, 200, rpcResult(id, toolResult(value)));
        return;
      }
      if (name === "outilsia_cancel_action_request") {
        const requestId = String(argumentsValue.request_id || "");
        if (!requests.has(requestId)) {
          sendJson(response, 200, rpcError(id, -32602, "Unknown request"));
          return;
        }
        const value = requestView(requestId, "cancelled");
        requests.set(requestId, value);
        sendJson(response, 200, rpcResult(id, toolResult(value)));
        return;
      }
      sendJson(response, 200, rpcError(id, -32602, "Unknown Action Lane tool"));
    });
  });
  return {
    server,
    snapshot: () => ({ requests, executeAttempts }),
  };
}

async function runProbe(mode) {
  const fixture = createFixture(mode);
  await new Promise((resolveReady) => fixture.server.listen(0, "127.0.0.1", resolveReady));
  const address = fixture.server.address();
  requireCondition(address && typeof address === "object", "Fixture address missing");
  const child = spawn(process.execPath, [probe], {
    cwd: root,
    env: {
      ...process.env,
      OUTILSIA_MCP_CONFORMANCE_MODE: mode,
      OUTILSIA_MCP_CONFORMANCE_EXERCISE: "1",
      OUTILSIA_LOCAL_MCP_URL: `http://127.0.0.1:${address.port}/mcp`,
      OUTILSIA_LOCAL_MCP_TOKEN: token,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const timer = setTimeout(() => child.kill(), 20_000);
  const exitCode = await new Promise((resolveExit) => child.once("close", resolveExit));
  clearTimeout(timer);
  await new Promise((resolveClose) => fixture.server.close(resolveClose));
  requireCondition(exitCode === 0, `${mode} probe failed: ${stderr.slice(-800)}`);
  requireCondition(!stdout.includes(token) && !stderr.includes(token), `${mode} probe leaked token`);
  requireCondition(!stdout.includes(privateMarker), `${mode} probe leaked report content`);
  const report = JSON.parse(stdout.trim());
  requireCondition(report.status === "passed", `${mode} probe did not pass`);
  requireCondition(report.sdk === "@modelcontextprotocol/sdk@1.30.0", "SDK version differs");
  requireCondition(report.initialized_notification === true, "Initialized notification not proven");
  const state = fixture.snapshot();
  if (mode === "action_lane") {
    requireCondition(state.executeAttempts === 1, "Forbidden execution was not tested");
    requireCondition(state.requests.size === 2, "Action Lane request count differs");
    requireCondition(
      [...state.requests.values()].every((value) => value.state === "cancelled"),
      "Action Lane fixture requests remain active",
    );
  }
  return report;
}

function verifyLockedDependencies() {
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  requireCondition(
    packageJson.devDependencies?.["@modelcontextprotocol/sdk"] === "1.30.0",
    "Official MCP SDK must be locked to 1.30.0",
  );
  requireCondition(packageJson.devDependencies?.zod === "4.4.3", "Zod must be locked");
  requireCondition(
    lock.packages?.["node_modules/@modelcontextprotocol/sdk"]?.version === "1.30.0",
    "MCP SDK lockfile version differs",
  );
  const honoVersion = lock.packages?.["node_modules/@hono/node-server"]?.version || "0.0.0";
  const [major, minor, patch] = honoVersion.split(".").map(Number);
  requireCondition(
    major > 2 || (major === 2 && (minor > 0 || patch >= 5)),
    "Vulnerable @hono/node-server version remains locked",
  );
}

verifyLockedDependencies();
const readOnly = await runProbe("read_only");
const actionLane = await runProbe("action_lane");
console.log(
  "mcp_sdk_probe_test_ok "
  + `sdk=${readOnly.sdk} read_tools=${readOnly.tool_count} `
  + `resources=${readOnly.resource_count} action_tools=${actionLane.tool_count} `
  + `requests=${actionLane.requests_prepared} cancelled=${actionLane.requests_cancelled} `
  + "execution=false token_leak=false",
);
