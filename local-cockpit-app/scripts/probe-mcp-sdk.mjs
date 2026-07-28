#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const SDK_VERSION = "1.30.0";
const PROTOCOL_VERSION = "2025-11-25";
const TOKEN_ENV = "OUTILSIA_LOCAL_MCP_TOKEN";
const URL_ENV = "OUTILSIA_LOCAL_MCP_URL";
const MODE_ENV = "OUTILSIA_MCP_CONFORMANCE_MODE";
const EXERCISE_ENV = "OUTILSIA_MCP_CONFORMANCE_EXERCISE";
let redactionSecret = "";

const READ_ONLY_TOOLS = [
  "outilsia_get_cockpit_status",
  "outilsia_get_machine_profile",
  "outilsia_get_hardware_doctor",
  "outilsia_list_installed_models",
  "outilsia_get_model_recommendation",
  "outilsia_get_benchmark_proofs",
  "outilsia_get_capability_passport",
  "outilsia_get_strategy_arena_handoff",
];

const READ_ONLY_RESOURCES = [
  "outilsia://passport/current",
  "outilsia://models/installed",
  "outilsia://recommendation/current",
  "outilsia://strategy-arena/handoff",
];

const ACTION_TOOLS = [
  "outilsia_prepare_model_install",
  "outilsia_prepare_benchmark",
  "outilsia_prepare_report_export",
  "outilsia_get_action_request",
  "outilsia_cancel_action_request",
];

function fail(message) {
  throw new Error(message);
}

function requireCondition(condition, message) {
  if (!condition) fail(message);
}

function exactLoopbackUrl(value) {
  const parsed = new URL(String(value || ""));
  requireCondition(parsed.protocol === "http:", "MCP conformance requires HTTP loopback");
  requireCondition(parsed.hostname === "127.0.0.1", "MCP conformance refuses non-loopback hosts");
  requireCondition(/^\d{1,5}$/.test(parsed.port), "MCP conformance requires an explicit port");
  requireCondition(Number(parsed.port) > 0 && Number(parsed.port) <= 65535, "Invalid loopback port");
  requireCondition(parsed.pathname === "/mcp", "MCP conformance requires the exact /mcp path");
  requireCondition(!parsed.search && !parsed.hash, "MCP conformance refuses query strings and fragments");
  return parsed;
}

function exactToken(value) {
  const token = String(value || "").trim();
  requireCondition(/^[a-f0-9]{64}$/i.test(token), "MCP bearer token format is invalid");
  return token;
}

function exactMode(value) {
  if (value === "read_only" || value === "action_lane") return value;
  fail("MCP conformance mode must be read_only or action_lane");
}

function exactNames(actual, expected, label) {
  requireCondition(Array.isArray(actual), `${label} must be an array`);
  requireCondition(
    actual.length === expected.length && actual.every((value, index) => value === expected[index]),
    `${label} differs from the frozen contract`,
  );
}

function structuredResult(result, label) {
  requireCondition(result && typeof result === "object", `${label} result is missing`);
  requireCondition(result.isError === false, `${label} returned isError`);
  requireCondition(
    result.structuredContent && typeof result.structuredContent === "object",
    `${label} structuredContent is missing`,
  );
  return result.structuredContent;
}

async function expectToolRejection(client, name, argumentsValue) {
  try {
    await client.callTool({ name, arguments: argumentsValue });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    requireCondition(
      message.includes("Unknown") || message.includes("-32602"),
      "Forbidden MCP tool failed for an unexpected reason",
    );
    return true;
  }
  fail("Forbidden MCP tool was unexpectedly accepted");
}

async function verifyReadOnly(client, capabilities, exercise) {
  requireCondition(capabilities?.tools?.listChanged === false, "Read-only tools capability is invalid");
  requireCondition(capabilities?.resources?.subscribe === false, "Resource subscription must be disabled");
  requireCondition(capabilities?.resources?.listChanged === false, "Resource list changes must be disabled");
  requireCondition(!capabilities?.prompts, "Read-only server must not advertise prompts");

  const listedTools = await client.listTools();
  exactNames(
    listedTools.tools.map((tool) => tool.name),
    READ_ONLY_TOOLS,
    "Read-only MCP tools",
  );
  for (const tool of listedTools.tools) {
    requireCondition(tool.inputSchema?.additionalProperties === false, `${tool.name} schema is open`);
    requireCondition(tool.annotations?.readOnlyHint === true, `${tool.name} is not read-only`);
    requireCondition(tool.annotations?.destructiveHint === false, `${tool.name} is destructive`);
    requireCondition(tool.annotations?.idempotentHint === true, `${tool.name} is not idempotent`);
    requireCondition(tool.annotations?.openWorldHint === false, `${tool.name} is open-world`);
  }

  const listedResources = await client.listResources();
  exactNames(
    listedResources.resources.map((resource) => resource.uri),
    READ_ONLY_RESOURCES,
    "Read-only MCP resources",
  );

  let toolCalls = 0;
  let resourceReads = 0;
  if (exercise) {
    for (const name of READ_ONLY_TOOLS) {
      const payload = structuredResult(await client.callTool({ name, arguments: {} }), name);
      requireCondition(Object.keys(payload).length > 0, `${name} returned an empty payload`);
      toolCalls += 1;
    }
    for (const uri of READ_ONLY_RESOURCES) {
      const result = await client.readResource({ uri });
      requireCondition(result.contents?.length === 1, `${uri} returned an invalid resource`);
      const content = result.contents[0];
      requireCondition(content.uri === uri, `${uri} response URI differs`);
      requireCondition(content.mimeType === "application/json", `${uri} MIME type differs`);
      requireCondition(typeof content.text === "string", `${uri} text payload is missing`);
      JSON.parse(content.text);
      resourceReads += 1;
    }
  }

  const forbiddenRejected = await expectToolRejection(client, "install_ollama_model", {});
  return {
    tool_count: listedTools.tools.length,
    resource_count: listedResources.resources.length,
    tool_calls: toolCalls,
    resource_reads: resourceReads,
    forbidden_rejected: forbiddenRejected,
    actions_started: false,
  };
}

async function verifyActionLane(client, capabilities, exercise) {
  requireCondition(capabilities?.tools?.listChanged === false, "Action Lane tools capability is invalid");
  requireCondition(!capabilities?.resources, "Action Lane must not advertise resources");
  requireCondition(!capabilities?.prompts, "Action Lane must not advertise prompts");

  const listedTools = await client.listTools();
  exactNames(
    listedTools.tools.map((tool) => tool.name),
    ACTION_TOOLS,
    "Action Lane MCP tools",
  );
  requireCondition(
    listedTools.tools.every((tool) => !tool.name.includes("approve") && !tool.name.includes("execute")),
    "Action Lane exposed an approval or execution tool",
  );
  for (const tool of listedTools.tools) {
    requireCondition(tool.inputSchema?.additionalProperties === false, `${tool.name} schema is open`);
    requireCondition(tool.annotations?.destructiveHint === false, `${tool.name} is destructive`);
    requireCondition(tool.annotations?.openWorldHint === false, `${tool.name} is open-world`);
  }

  let requestsPrepared = 0;
  let requestsCancelled = 0;
  let requestsDistinct = false;
  let plansEqual = false;
  if (exercise) {
    const first = structuredResult(
      await client.callTool({
        name: "outilsia_prepare_report_export",
        arguments: { format: "markdown" },
      }),
      "first report export preparation",
    );
    const second = structuredResult(
      await client.callTool({
        name: "outilsia_prepare_report_export",
        arguments: { format: "markdown" },
      }),
      "second report export preparation",
    );
    requestsPrepared = 2;
    requestsDistinct = first.request_id !== second.request_id;
    plansEqual = first.plan_sha256 === second.plan_sha256;
    requireCondition(requestsDistinct, "Action Lane merged two distinct requests");
    requireCondition(plansEqual, "Equivalent Action Lane requests produced different plans");
    for (const request of [first, second]) {
      requireCondition(request.state === "awaiting_human", "Action Lane request bypassed human review");
      requireCondition(request.capability_expires_at_ms == null, "MCP issued an action capability");
      requireCondition(request.capability_consumed === false, "MCP consumed an action capability");
      requireCondition(request.result == null, "MCP started an action");
      requireCondition(request.privacy?.capability_secret_exposed === false, "Capability secret leaked");
      requireCondition(request.privacy?.export_content_exposed === false, "Export content leaked");
    }

    await expectToolRejection(client, "outilsia_execute_action", {
      request_id: first.request_id,
    });

    for (const request of [first, second]) {
      const cancelled = structuredResult(
        await client.callTool({
          name: "outilsia_cancel_action_request",
          arguments: { request_id: request.request_id },
        }),
        "request cancellation",
      );
      requireCondition(cancelled.state === "cancelled", "Action Lane request was not cancelled");
      requireCondition(cancelled.result == null, "Cancelled Action Lane request has a result");
      requestsCancelled += 1;
    }
  } else {
    await expectToolRejection(client, "outilsia_execute_action", {
      request_id: "larq-conformance-noop",
    });
  }

  return {
    tool_count: listedTools.tools.length,
    resource_count: 0,
    requests_prepared: requestsPrepared,
    requests_cancelled: requestsCancelled,
    requests_distinct: requestsDistinct,
    plans_equal: plansEqual,
    execution_tool_available: false,
    actions_started: false,
  };
}

async function main() {
  const mode = exactMode(process.env[MODE_ENV]);
  const endpoint = exactLoopbackUrl(process.env[URL_ENV]);
  const token = exactToken(process.env[TOKEN_ENV]);
  redactionSecret = token;
  const exercise = process.env[EXERCISE_ENV] === "1";
  delete process.env[URL_ENV];
  delete process.env[TOKEN_ENV];
  delete process.env[MODE_ENV];
  delete process.env[EXERCISE_ENV];

  const client = new Client(
    { name: "OutilsIA MCP SDK Conformance", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    },
  });

  try {
    await client.connect(transport);
    const server = client.getServerVersion();
    const capabilities = client.getServerCapabilities();
    const instructions = client.getInstructions() || "";
    requireCondition(server?.version === "0.1.0", "Unexpected OutilsIA MCP server version");
    requireCondition(
      mode === "read_only"
        ? server?.name === "OutilsIA Local Cockpit"
        : server?.name === "OutilsIA Local Action Lane",
      "Unexpected OutilsIA MCP server name",
    );
    requireCondition(instructions.length > 40, "MCP server instructions are missing");

    const details = mode === "read_only"
      ? await verifyReadOnly(client, capabilities, exercise)
      : await verifyActionLane(client, capabilities, exercise);
    const report = {
      schema: "outilsia.mcp_sdk_conformance.v1",
      status: "passed",
      sdk: `@modelcontextprotocol/sdk@${SDK_VERSION}`,
      protocol: PROTOCOL_VERSION,
      mode,
      initialized_notification: true,
      loopback_only: true,
      bearer_from_environment: true,
      token_persisted: false,
      endpoint_recorded: false,
      ...details,
    };
    const serialized = JSON.stringify(report);
    requireCondition(!serialized.includes(token), "Token leaked into MCP conformance report");
    process.stdout.write(`${serialized}\n`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  const raw = String(error instanceof Error ? error.message : error);
  const safe = redactionSecret ? raw.replaceAll(redactionSecret, "<redacted>") : raw;
  process.stderr.write(`mcp_sdk_conformance_failed ${safe}\n`);
  process.exitCode = 1;
});
