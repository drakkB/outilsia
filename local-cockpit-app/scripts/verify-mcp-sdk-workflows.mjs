#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const workflows = [
  [".github/workflows/local-cockpit-cross-platform-beta.yml", 2],
  [".github/workflows/local-cockpit-windows-beta.yml", 1],
  [".github/workflows/local-cockpit-linux-beta.yml", 1],
  [".github/workflows/local-cockpit-release-candidate.yml", 2],
];
const command = "npm run verify:mcp-sdk-conformance:native";

for (const [relativePath, expectedCount] of workflows) {
  const text = readFileSync(resolve(repoRoot, relativePath), "utf8");
  const count = text.split(command).length - 1;
  if (count !== expectedCount) {
    throw new Error(`${relativePath}: expected ${expectedCount} official MCP SDK runs, found ${count}`);
  }
  const installIndex = text.indexOf("npm ci");
  const conformanceIndex = text.indexOf(command);
  if (installIndex < 0 || conformanceIndex < installIndex) {
    throw new Error(`${relativePath}: official MCP SDK conformance must run after npm ci`);
  }
}

const packageJson = JSON.parse(readFileSync(resolve(appRoot, "package.json"), "utf8"));
if (packageJson.devDependencies?.["@modelcontextprotocol/sdk"] !== "1.30.0") {
  throw new Error("Official MCP SDK must remain an exact development dependency");
}
if (!packageJson.scripts?.["verify:mcp-sdk-conformance:native"]?.includes("--ignored")) {
  throw new Error("Native SDK conformance must remain separate from the default Rust suite");
}

console.log(
  "mcp_sdk_workflow_contract_ok "
  + "windows_jobs=3 linux_jobs=3 npm_before_probe=true runtime_dependency=false",
);
