#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = join(appRoot, "scripts", "verify-goal-closure.mjs");
const profiles = ["old_laptop", "core_i7_gtx_1080_ti", "rtx_3060_12gb", "rtx_4080_4090", "cpu_only"];

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function runGuard(root, fieldStatusPath) {
  return spawnSync("node", [scriptPath], {
    cwd: appRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      OUTILSIA_GOAL_REPORTS_DIR: root,
      OUTILSIA_FIELD_STATUS_PATH: fieldStatusPath,
    },
  });
}

function requireMatch(label, value, pattern) {
  if (!pattern.test(value)) {
    throw new Error(`${label} did not match ${pattern}: ${value}`);
  }
}

function main() {
  const root = mkdtempSync(join(tmpdir(), "outilsia-goal-closure-"));
  try {
    const fieldStatusPath = join(root, "FIELD-TESTS-STATUS.json");

    writeJson(join(root, "beta_field_goal_audit_20260704_000001.json"), {
      overall_status: "GOAL_NOT_COMPLETE",
      summary: { proved: 58, missing: 2 },
      rows: [
        { area: "Tests terrain multi-machines", requirement: "missing physical machines", status: "missing" },
        { area: "Release Linux", requirement: "missing public Linux", status: "missing" },
      ],
    });
    writeJson(join(root, "local_cockpit_linux_readiness_20260704_000001.json"), {
      status: "blocked_by_linux_dependencies",
      public_status: "public_linux_release_missing",
      missing_prerequisites: ["missing: pkg-config"],
    });
    writeJson(fieldStatusPath, {
      status: "FIELD_TESTS_INCOMPLETE",
      profiles_ready: ["rtx_4080_4090"],
      profiles_missing: ["old_laptop", "core_i7_gtx_1080_ti", "rtx_3060_12gb", "cpu_only"],
      profiles_incomplete: [],
    });

    const blocked = runGuard(root, fieldStatusPath);
    const blockedOutput = `${blocked.stdout}${blocked.stderr}`;
    if (blocked.status === 0) throw new Error("blocked fixture unexpectedly passed");
    requireMatch("blocked output", blockedOutput, /GOAL_CLOSURE_BLOCKED/);
    requireMatch("blocked output", blockedOutput, /update_goal_complete=no/);
    requireMatch("blocked output", blockedOutput, /field=1\/5/);
    requireMatch("blocked output", blockedOutput, /linux=public_linux_release_missing/);

    writeJson(join(root, "beta_field_goal_audit_20260704_000002.json"), {
      overall_status: "GOAL_COMPLETE_EVIDENCE_READY",
      summary: { proved: 60, missing: 0 },
      rows: [{ area: "Goal", requirement: "all proof rows", status: "proved" }],
    });
    writeJson(join(root, "local_cockpit_linux_readiness_20260704_000002.json"), {
      status: "ready",
      public_status: "public_linux_release_current",
      missing_prerequisites: [],
    });
    writeJson(fieldStatusPath, {
      status: "FIELD_TESTS_READY",
      profiles_ready: profiles,
      profiles_missing: [],
      profiles_incomplete: [],
    });

    const ready = runGuard(root, fieldStatusPath);
    const readyOutput = `${ready.stdout}${ready.stderr}`;
    if (ready.status !== 0) throw new Error(`ready fixture failed: ${readyOutput}`);
    requireMatch("ready output", readyOutput, /GOAL_CLOSURE_READY/);
    requireMatch("ready output", readyOutput, /update_goal_complete=yes/);
    requireMatch("ready output", readyOutput, /field=5\/5/);
    requireMatch("ready output", readyOutput, /linux=public_linux_release_current/);

    const jsonMatch = readyOutput.match(/json=([^ ]+)/);
    if (!jsonMatch) throw new Error(`ready output does not include json path: ${readyOutput}`);
    const generatedPath = jsonMatch[1].startsWith("/") ? jsonMatch[1] : join(root, jsonMatch[1].replace(/^reports\//, ""));
    const generated = readFileSync(generatedPath, "utf8");
    if (!generated.includes("\"can_call_update_goal_complete\": true")) {
      throw new Error("ready guard JSON does not authorize completion");
    }

    console.log("goal_closure_guard_test_ok blocked=blocked ready=ready");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
