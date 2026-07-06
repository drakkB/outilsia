#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "src/index.html"), "utf8");
const css = readFileSync(resolve(root, "src/styles.css"), "utf8");
const tauri = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (tauri.productName !== "OutilsIA Local Cockpit") fail("Invalid Tauri productName");
if (tauri.identifier !== "fr.outilsia.localcockpit") fail("Invalid Tauri identifier");
if (!JSON.stringify(tauri.bundle?.icon || []).includes("icons/icon.ico")) fail("Missing Windows icon in Tauri config");
if (!html.includes("brand-mark") || !html.includes("OI")) fail("Missing OutilsIA brand mark");
if (!css.includes("--cyan") || !css.includes("brand-mark") || !css.includes("grid-template-columns: repeat(12")) {
  fail("Desktop cockpit styling markers missing");
}

const probe = spawnSync("python3", ["-"], {
  cwd: root,
  input: `
from PIL import Image
from pathlib import Path
png = Image.open(Path("src-tauri/icons/icon.png"))
ico = Image.open(Path("src-tauri/icons/icon.ico"))
assert png.size == (512, 512), png.size
assert png.mode == "RGBA", png.mode
assert ico.size[0] >= 128 and ico.size[1] >= 128, ico.size
`,
  encoding: "utf8",
});
if (probe.status !== 0) fail((probe.stderr || probe.stdout || "icon probe failed").trim());

console.log("branding_ok OutilsIA Local Cockpit icon=512x512 cockpit_ui=12col");
