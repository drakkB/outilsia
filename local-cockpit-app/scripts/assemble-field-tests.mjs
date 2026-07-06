#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_PROFILES, validateFieldTests, fieldTestsMarkdown } from "./import-field-tests.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopKit = existsSync("/mnt/c/Users/chris/Desktop")
  ? "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Field-Test-Kit"
  : join(process.env.HOME || ".", "Desktop", "OutilsIA-Local-Cockpit-Field-Test-Kit");
const defaultOut = join(desktopKit, "FIELD-TESTS.json");
const defaultReport = join(desktopKit, "FIELD-TESTS.md");

function usage() {
  console.log(`Usage:
  node scripts/assemble-field-tests.mjs --input <entry.json> [--input <entry2.json> ...] [--out <FIELD-TESTS.json>]
  node scripts/assemble-field-tests.mjs --dir <folder-with-entry-json> [--out <FIELD-TESTS.json>]

Each input can be:
- a single machine object exported by OutilsIA;
- a single-machine payload with schema outilsia.local_cockpit_field_tests.v1;
- a partial FIELD-TESTS.json payload.

The final payload is validated with the same strict importer used by:
  npm run import:field-tests -- --input <FIELD-TESTS.json>`);
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const opts = { inputs: [], dirs: [], out: defaultOut, tester: "", notes: "", verifyShareUrls: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--input") {
      opts.inputs.push(resolve(argv[++i] || ""));
      continue;
    }
    if (arg === "--dir") {
      opts.dirs.push(resolve(argv[++i] || ""));
      continue;
    }
    if (arg === "--out") {
      opts.out = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--tester") {
      opts.tester = argv[++i] || "";
      continue;
    }
    if (arg === "--notes") {
      opts.notes = argv[++i] || "";
      continue;
    }
    if (arg === "--skip-share-url-fetch") {
      opts.verifyShareUrls = false;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function looksLikeFieldEntry(value) {
  return value && typeof value === "object" && !Array.isArray(value) && typeof value.profile === "string";
}

function extractMachines(payload, source) {
  if (looksLikeFieldEntry(payload)) return [{ ...payload, _source_file: source }];
  if (payload?.schema === "outilsia.local_cockpit_field_tests.v1" && Array.isArray(payload.machines)) {
    return payload.machines.filter(looksLikeFieldEntry).map((item) => ({ ...item, _source_file: source }));
  }
  fail(`No field-test machine entry found in ${source}`);
}

function candidateFilesFromDir(dir) {
  const entries = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let children;
    try {
      children = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      const path = join(current, child.name);
      if (child.isDirectory()) {
        stack.push(path);
      } else if (child.isFile() && child.name.toLowerCase().endsWith(".json")) {
        entries.push(path);
      }
    }
  }
  return entries.sort();
}

function loadEntries(paths) {
  const machines = [];
  const metadata = [];
  for (const path of paths) {
    if (!existsSync(path)) fail(`Input not found: ${path}`);
    const payload = readJson(path);
    metadata.push({
      source: path,
      schema: payload?.schema || "",
      app_version: payload?.app_version || "",
      build_id: payload?.build_id || "",
    });
    machines.push(...extractMachines(payload, path));
  }
  return { machines, metadata };
}

function assertUniformBuildMetadata(metadata) {
  const fieldPayloads = metadata.filter((item) => item.schema === "outilsia.local_cockpit_field_tests.v1");
  const missing = fieldPayloads.filter((item) => !String(item.build_id || "").trim());
  if (missing.length) {
    fail(`Missing build_id in field entry payload(s): ${missing.map((item) => basename(item.source)).join(", ")}`);
  }
  const buildIds = [...new Set(fieldPayloads.map((item) => item.build_id).filter(Boolean))];
  if (!buildIds.length) fail("Missing build_id in all field entry payloads");
  if (buildIds.length > 1) fail(`Mixed build_id values in field entries: ${buildIds.join(", ")}`);
  const appVersions = [...new Set(fieldPayloads.map((item) => item.app_version).filter(Boolean))];
  if (!appVersions.length) fail("Missing app_version in all field entry payloads");
  if (appVersions.length > 1) fail(`Mixed app_version values in field entries: ${appVersions.join(", ")}`);
  return { build_id: buildIds[0], app_version: appVersions[0] };
}

function latestByProfile(machines) {
  const selected = new Map();
  const duplicates = [];
  for (const machine of machines) {
    const profile = machine.profile;
    if (!REQUIRED_PROFILES.includes(profile)) {
      fail(`Unexpected profile ${profile} in ${machine._source_file || "input"}`);
    }
    if (selected.has(profile)) duplicates.push(profile);
    selected.set(profile, machine);
  }
  return { selected, duplicates: [...new Set(duplicates)] };
}

function cleanMachine(machine) {
  const cleaned = { ...machine };
  delete cleaned._source_file;
  return cleaned;
}

function assembleFieldTests(opts) {
  const dirInputs = opts.dirs.flatMap(candidateFilesFromDir);
  const inputs = [...opts.inputs, ...dirInputs];
  if (!inputs.length) {
    fail("Missing --input or --dir. Export fiches terrain depuis l'app, puis assemble-les ici.");
  }
  const { machines, metadata } = loadEntries(inputs);
  const buildMetadata = assertUniformBuildMetadata(metadata);
  const { selected, duplicates } = latestByProfile(machines);
  const missing = REQUIRED_PROFILES.filter((profile) => !selected.has(profile));
  if (missing.length) {
    fail(`Missing required profiles: ${missing.join(", ")}. Inputs read: ${inputs.map(basename).join(", ")}`);
  }
  const payload = {
    schema: "outilsia.local_cockpit_field_tests.v1",
    tested_at: new Date().toISOString(),
    tester: opts.tester || "terrain",
    app_version: buildMetadata.app_version,
    build_id: buildMetadata.build_id,
    machines: REQUIRED_PROFILES.map((profile) => cleanMachine(selected.get(profile))),
    notes: opts.notes || "Assemblage automatique depuis fiches terrain OutilsIA Local Cockpit."
  };

  const validation = validateFieldTests(payload, { verifyShareUrls: opts.verifyShareUrls });
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  writeFileSync(opts.out.replace(/\.json$/i, ".md") || defaultReport, fieldTestsMarkdown(payload, validation), "utf8");
  return { payload, validation, inputs, duplicates, out: opts.out };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = assembleFieldTests(parseArgs(process.argv.slice(2)));
    console.log(`field_tests_assembled ${result.out}`);
    console.log(`profiles=${result.validation.profile_count} inputs=${result.inputs.length}`);
    if (result.duplicates.length) console.log(`duplicates_replaced=${result.duplicates.join(",")}`);
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
}

export { assembleFieldTests };
