import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  PUBLICATION_STATES,
  validatePublicationStatus,
  validatePublicationTransition,
} from "../lib/publication-status.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const statusPath = join(root, "submission", "publication-status.json");

function parseArgs(values) {
  const args = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const name = value.slice(2);
    if (name === "confirm-openai-portal") {
      args.set(name, true);
      continue;
    }
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${name}`);
    args.set(name, next);
    index += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.get("confirm-openai-portal")) {
  throw new Error("Refusing status change without --confirm-openai-portal.");
}

const state = args.get("state");
if (!PUBLICATION_STATES.includes(state)) {
  throw new Error(`--state must be one of: ${PUBLICATION_STATES.join(", ")}`);
}

const current = validatePublicationStatus(JSON.parse(readFileSync(statusPath, "utf8")));
validatePublicationTransition(current.state, state);
const checkedOn = args.get("checked-on");
const statusLabel = args.get("status-label");
if (!checkedOn || !statusLabel) {
  throw new Error("--checked-on and --status-label are required.");
}

const next = {
  ...current,
  state,
  last_checked_on: checkedOn,
  evidence: {
    kind: "openai_platform_dashboard",
    label: "OpenAI Platform > Plugins",
    status_label: statusLabel,
  },
  approved_on: args.get("approved-on") || null,
  published_on: args.get("published-on") || null,
  directory_url: args.get("directory-url") || null,
};

validatePublicationStatus(next);
const original = readFileSync(statusPath, "utf8");
writeFileSync(statusPath, `${JSON.stringify(next, null, 2)}\n`);

const sync = spawnSync(process.execPath, [join(root, "scripts", "sync-publication-status.mjs"), "--write"], {
  cwd: root,
  stdio: "inherit",
});
if (sync.status !== 0) {
  writeFileSync(statusPath, original);
  spawnSync(process.execPath, [join(root, "scripts", "sync-publication-status.mjs"), "--write"], {
    cwd: root,
    stdio: "inherit",
  });
  process.exit(sync.status || 1);
}

console.log(`outilsia_chatgpt_publication_status_updated ${current.state}->${next.state}`);
