import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const widget = readFileSync(join(root, "public", "machine-cockpit-v3.html"), "utf8");
const scriptSource = widget.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];

function executeWidget(openai) {
  const heights = [];
  const app = {
    dataset: {},
    innerHTML: "",
    addEventListener() {},
  };
  const parent = { postMessage() {} };
  const window = {
    innerWidth: 706,
    openai: {
      ...openai,
      notifyIntrinsicHeight(height) {
        heights.push(height);
      },
    },
    parent,
    addEventListener() {},
    open() {},
    requestAnimationFrame(callback) {
      callback();
    },
  };
  const document = {
    body: { scrollHeight: 540 },
    documentElement: { scrollHeight: 540 },
    querySelector(selector) {
      return selector === "#app" ? app : null;
    },
  };
  const context = vm.createContext({
    console,
    document,
    Promise,
    ResizeObserver: undefined,
    window,
  });
  new vm.Script(scriptSource, { filename: "machine-cockpit-v3.html" }).runInContext(context);
  return { app, heights };
}

test("widget renders canonical MCP errors instead of staying on the loading state", () => {
  assert.ok(scriptSource, "Widget module script is missing.");
  const { app, heights } = executeWidget({
    toolResponseMetadata: {
      status: "error",
      mcp_tool_result: {
        isError: true,
        content: [{ type: "text", text: "URL <invalide> : utilisez un rapport OutilsIA." }],
      },
    },
  });

  assert.equal(app.dataset.state, "error");
  assert.match(app.innerHTML, /Analyse impossible/);
  assert.match(app.innerHTML, /URL &lt;invalide&gt;/);
  assert.doesNotMatch(app.innerHTML, /Préparation de la fiche/);
  assert.ok(heights.length >= 1);
});

test("widget still renders structured decisions from toolOutput", () => {
  const { app, heights } = executeWidget({
    toolOutput: {
      decision: {
        schema_version: "outilsia.chatgpt.decision.v1",
        title: "Machine prête pour l'IA locale",
        verdict: "Profil déclaré, vitesse à mesurer dans Local Cockpit.",
        source: { kind: "declared_profile", label: "Profil déclaré", is_real_scan: false },
        machine: {
          cpu: "AMD Ryzen 7 7800X3D",
          ram_gb: 64,
          gpu: "NVIDIA GeForce RTX 4080 SUPER",
          vram_gb: 16,
        },
        score: { value: 80 },
        recommended_models: [],
        benchmark_evidence: null,
        purchase: { priority: "none", headline: "Aucun achat urgent", summary: "Testez d'abord." },
        links: [],
        limits: [],
      },
    },
  });

  assert.equal(app.dataset.state, "ready");
  assert.match(app.innerHTML, /Machine prête pour l&#039;IA locale/);
  assert.match(app.innerHTML, /RTX 4080 SUPER/);
  assert.ok(heights.length >= 1);
});
