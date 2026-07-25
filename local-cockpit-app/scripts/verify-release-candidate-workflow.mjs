#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const workflowPath = join(repoRoot, ".github", "workflows", "local-cockpit-release-candidate.yml");
const text = readFileSync(workflowPath, "utf8");
const packager = readFileSync(join(appRoot, "scripts", "package-release-candidate.mjs"), "utf8");

function fail(message) {
  throw new Error(message);
}

if (!text.includes("Private RC (No Deploy)")) fail("RC workflow must state No Deploy");
if (!text.includes("workflow_dispatch:")) fail("RC workflow must support manual dispatch");
if (!text.includes("OUTILSIA_RELEASE_CHANNEL: rc")) fail("RC workflow must compile channel=rc");
if (!text.includes("package:rc") || !text.includes("build-windows-release-candidate.ps1")) {
  fail("RC workflow must use the isolated packager on Windows and Linux");
}
if (!text.includes(".artifacts/release-candidate")) fail("RC workflow must write under .artifacts");
if (!packager.includes("result.stdout.trimEnd()") || packager.includes("result.stdout.trim()")) {
  fail("RC packager must preserve the leading Git porcelain status column");
}

const forbidden = [
  [/\bscp\b/i, "scp"],
  [/\bssh\b/i, "ssh"],
  [/--deploy\b/i, "--deploy"],
  [/deploy:beta/i, "deploy:beta"],
  [/publish:cross-platform/i, "publish:cross-platform"],
  [/sync:download-page/i, "sync:download-page"],
  [/server-work\/static\/downloads\/local-cockpit/i, "public release tree"],
];
for (const [pattern, label] of forbidden) {
  if (pattern.test(text)) fail(`RC workflow contains forbidden deployment surface: ${label}`);
}
console.log("release_candidate_workflow_ok no_public_deploy_surface");
