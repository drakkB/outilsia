import test from "node:test";
import assert from "node:assert/strict";
import { OutilsiaApi, OutilsiaApiError, parseSharedReportUrl } from "../lib/outilsia-api.js";

test("parseSharedReportUrl accepts only the configured OutilsIA origin", () => {
  const valid = parseSharedReportUrl(
    "https://outilsia.fr/r/3O3-DjbGWfNrIBUWe8IdmaEbJxG30F0m",
    "https://outilsia.fr",
  );
  assert.equal(valid.token, "3O3-DjbGWfNrIBUWe8IdmaEbJxG30F0m");

  assert.throws(
    () => parseSharedReportUrl(
      "https://example.com/r/3O3-DjbGWfNrIBUWe8IdmaEbJxG30F0m",
      "https://outilsia.fr",
    ),
    (error) => error instanceof OutilsiaApiError && error.code === "foreign_report_url",
  );
});

test("OutilsiaApi posts only the declared compatibility profile", async () => {
  let captured;
  const api = new OutilsiaApi({
    baseUrl: "http://127.0.0.1:9999",
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return new Response(JSON.stringify({ ok: true, compatibility: { score: { score: 80 } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const payload = { cpu_name: "Core i7", ram_gb: 16, gpu_name: "GTX 1080 Ti", vram_gb: 11 };
  await api.checkCompatibility(payload);
  assert.equal(captured.url, "http://127.0.0.1:9999/api/compatibility/check");
  assert.equal(captured.options.method, "POST");
  assert.deepEqual(JSON.parse(captured.options.body), payload);
});

test("OutilsiaApi never turns a timeout into a fabricated result", async () => {
  const api = new OutilsiaApi({
    baseUrl: "http://127.0.0.1:9999",
    timeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(
        Object.assign(new Error("aborted"), { name: "AbortError" }),
      ));
    }),
  });
  await assert.rejects(
    () => api.checkCompatibility({}),
    (error) => error instanceof OutilsiaApiError && error.code === "timeout",
  );
});
