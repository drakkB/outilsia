const DEFAULT_BASE_URL = "https://outilsia.fr";
const DEFAULT_TIMEOUT_MS = 8_000;
const REPORT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,80}$/;

export class OutilsiaApiError extends Error {
  constructor(message, { status = 0, code = "api_error" } = {}) {
    super(message);
    this.name = "OutilsiaApiError";
    this.status = status;
    this.code = code;
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(String(value || DEFAULT_BASE_URL).trim());
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(isLoopback && url.protocol === "http:")) {
    throw new Error("OUTILSIA_API_BASE_URL must use HTTPS, except for loopback development.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

export function parseSharedReportUrl(value, expectedBaseUrl = DEFAULT_BASE_URL) {
  let reportUrl;
  try {
    reportUrl = new URL(String(value || "").trim());
  } catch {
    throw new OutilsiaApiError("Le lien de rapport OutilsIA est invalide.", {
      status: 400,
      code: "invalid_report_url",
    });
  }

  const baseUrl = normalizeBaseUrl(expectedBaseUrl);
  if (reportUrl.origin !== baseUrl.origin) {
    throw new OutilsiaApiError("Seuls les rapports publics du domaine OutilsIA sont acceptés.", {
      status: 400,
      code: "foreign_report_url",
    });
  }

  const match = reportUrl.pathname.match(/^\/r\/([A-Za-z0-9_-]+)\/?$/);
  const token = match?.[1] || "";
  if (!REPORT_TOKEN_PATTERN.test(token)) {
    throw new OutilsiaApiError("Le jeton du rapport OutilsIA est invalide.", {
      status: 400,
      code: "invalid_report_token",
    });
  }
  return { reportUrl, token };
}

export class OutilsiaApi {
  constructor({
    baseUrl = process.env.OUTILSIA_API_BASE_URL || DEFAULT_BASE_URL,
    timeoutMs = Number(process.env.OUTILSIA_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    fetchImpl = globalThis.fetch,
  } = {}) {
    if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
    this.fetchImpl = fetchImpl;
  }

  async request(pathname, { method = "GET", body } = {}) {
    const url = new URL(pathname, this.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          "user-agent": "OutilsIA-ChatGPT-App/0.1",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const raw = await response.text();
      let payload;
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        throw new OutilsiaApiError("La réponse OutilsIA n'est pas un JSON valide.", {
          status: response.status,
          code: "invalid_json",
        });
      }
      if (!response.ok || payload?.ok === false) {
        const code = String(payload?.error || `http_${response.status}`);
        throw new OutilsiaApiError(`OutilsIA a refusé la requête (${code}).`, {
          status: response.status,
          code,
        });
      }
      return payload;
    } catch (error) {
      if (error instanceof OutilsiaApiError) throw error;
      if (error?.name === "AbortError") {
        throw new OutilsiaApiError("Le service OutilsIA n'a pas répondu à temps.", {
          status: 504,
          code: "timeout",
        });
      }
      throw new OutilsiaApiError("Le service OutilsIA est momentanément indisponible.", {
        status: 503,
        code: "network_error",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async checkCompatibility(profile) {
    return this.request("/api/compatibility/check", { method: "POST", body: profile });
  }

  async getSharedReport(reportUrl) {
    const { token } = parseSharedReportUrl(reportUrl, this.baseUrl);
    return this.request(`/api/public/local-ai/reports/${encodeURIComponent(token)}`);
  }
}
