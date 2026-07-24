import test from "node:test";
import assert from "node:assert/strict";
import { buildCompatibilityDecision, buildUpgradeDecision } from "../lib/decision.js";

function payload({
  score = 80,
  vram = 16,
  compatible = [],
  upgrades = [],
  benchmarks = [],
  buyingGuides = [],
} = {}) {
  return {
    ok: true,
    machine: {
      cpu_name: "AMD Ryzen 7 7800X3D",
      cpu_cores: 8,
      ram_gb: 64,
      gpu_name: "NVIDIA GeForce RTX 4080 SUPER",
      gpu_vendor: "NVIDIA",
      vram_gb: vram,
      os_name: "Windows 11",
      benchmarks,
    },
    compatibility: {
      score: { score, label: score >= 75 ? "Confort" : "Limité", summary: "Résumé déterministe." },
      compatible,
      blocked_next: [],
      upgrades,
      buying_guides: buyingGuides,
    },
  };
}

const qwen = {
  name: "Qwen 3",
  params: "14B",
  category: "Modeles 13B-27B",
  status: "rapide",
  label: "Rapide",
  vram_q4: 9,
  ollama: "qwen3:14b",
};
const flux = {
  name: "Flux Dev",
  params: "Image",
  category: "Image, video et audio",
  status: "rapide",
  label: "Rapide",
  vram_q4: 12,
  ollama: "",
};

test("a comfortable text profile recommends no immediate purchase and excludes image models", () => {
  const decision = buildCompatibilityDecision(payload({
    compatible: [flux, qwen],
    upgrades: [{ name: "RTX 3090 24 Go", summary: "Plus de VRAM" }],
    buyingGuides: [{
      title: "Guide affilié",
      url: "https://outilsia.fr/materiel",
    }],
  }), { usage: "assistant" });
  assert.equal(decision.purchase.priority, "none");
  assert.equal(decision.recommended_models[0].name, "Qwen 3");
  assert.equal(decision.benchmark_evidence, null);
  assert.match(decision.limits.join(" "), /n'est inventée/i);
  assert.equal(decision.links.some((link) => link.kind === "guide"), false);
});

test("a shared report exposes only a real positive benchmark", () => {
  const decision = buildCompatibilityDecision(payload({
    compatible: [qwen],
    benchmarks: [
      { model_name: "qwen3:14b", tokens_per_second: 42.3, elapsed_ms: 2500, success: true },
      { model_name: "failed", tokens_per_second: 0, elapsed_ms: 60_000, success: false },
    ],
  }), {
    usage: "polyvalent",
    sourceKind: "shared_report",
    reportUrl: "https://outilsia.fr/r/3O3-DjbGWfNrIBUWe8IdmaEbJxG30F0m",
  });
  assert.equal(decision.source.is_real_scan, true);
  assert.equal(decision.benchmark_evidence.tokens_per_second, 42.3);
  assert.equal(decision.links.some((link) => link.kind === "report"), true);
  assert.equal(decision.links.length, 3);
});

test("an upgrade with no catalog gain is explicitly rejected", () => {
  const before = payload({ score: 80, vram: 16, compatible: [qwen] });
  const after = payload({ score: 80, vram: 24, compatible: [qwen] });
  const decision = buildUpgradeDecision(before, after, {
    usage: "assistant",
    targetVramGb: 24,
  });
  assert.equal(decision.purchase.priority, "none");
  assert.match(decision.verdict, /ne débloque pas/i);
});
