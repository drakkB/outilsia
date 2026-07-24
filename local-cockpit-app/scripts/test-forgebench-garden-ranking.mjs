#!/usr/bin/env node
import assert from "node:assert/strict";

const compare = (left, right) => {
  const order = [
    ["all_scenarios_rankable", -1],
    ["escaped_active_tips_sum", 1],
    ["days_uncontained_sum", 1],
    ["containment_permille_mean", -1],
    ["minimum_vitality_permille_worst", -1],
    ["living_canes_mean_milli", -1],
    ["final_vitality_permille_mean", -1],
    ["labor_used_min_sum", 1],
    ["water_used_mm_sum", 1]
  ];
  for (const [key, direction] of order) {
    const leftValue = typeof left[key] === "boolean" ? Number(left[key]) : left[key];
    const rightValue = typeof right[key] === "boolean" ? Number(right[key]) : right[key];
    if (leftValue !== rightValue) return (leftValue < rightValue ? -1 : 1) * direction;
  }
  return 0;
};

const base = {
  all_scenarios_rankable: true,
  escaped_active_tips_sum: 0,
  days_uncontained_sum: 0,
  containment_permille_mean: 1000,
  minimum_vitality_permille_worst: 760,
  living_canes_mean_milli: 28_000,
  final_vitality_permille_mean: 840,
  labor_used_min_sum: 1800,
  water_used_mm_sum: 460
};
const firstFailure = { ...base, all_scenarios_rankable: false, escaped_active_tips_sum: 0 };
const oneEscape = { ...base, escaped_active_tips_sum: 1, minimum_vitality_permille_worst: 900 };
const moreLabor = { ...base, labor_used_min_sum: 1900, water_used_mm_sum: 300 };

assert.ok(compare(base, firstFailure) < 0, "rankable must win before every other metric");
assert.ok(compare(base, oneEscape) < 0, "zero escape must win before vitality");
assert.ok(compare(base, moreLabor) < 0, "labor must break an otherwise exact tie before water");
assert.equal(compare(base, { ...base }), 0);

const candidates = [
  { id: "costly-fast", metrics: { ...base }, generation_ms: 100, api_cost_eur_micros: 9_000_000 },
  { id: "cheap-slow", metrics: { ...base }, generation_ms: 99_000, api_cost_eur_micros: 0 }
];
const strategicOrder = [...candidates].sort((left, right) => (
  compare(left.metrics, right.metrics) || left.id.localeCompare(right.id)
));
assert.deepEqual(strategicOrder.map((candidate) => candidate.id), ["cheap-slow", "costly-fast"]);

const reversedInput = [...candidates].reverse().sort((left, right) => (
  compare(left.metrics, right.metrics) || left.id.localeCompare(right.id)
));
assert.deepEqual(reversedInput.map((candidate) => candidate.id), strategicOrder.map((candidate) => candidate.id));
assert.equal(strategicOrder[0].generation_ms > strategicOrder[1].generation_ms, true);
assert.equal(strategicOrder[0].api_cost_eur_micros < strategicOrder[1].api_cost_eur_micros, true);

console.log("forgebench_garden_ranking_ok lexicographic=9 speed_cost_separate=true");
