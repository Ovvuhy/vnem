const DEFAULT_BASE_URL = import.meta.env?.VITE_VNEM_APP_SERVER_URL ?? "http://127.0.0.1:9099";

export function createVnemApiClient(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const fetchImpl = Object.hasOwn(options, "fetchImpl")
    ? options.fetchImpl
    : globalThis.fetch?.bind(globalThis);

  return {
    baseUrl,
    streamUrl: `${baseUrl}/api/telemetry/stream`,
    hasFetch: typeof fetchImpl === "function",
    telemetryHistory() {
      return requestJson(fetchImpl, `${baseUrl}/api/telemetry/history`);
    },
    reviewDispatch(id) {
      return requestJson(fetchImpl, `${baseUrl}/api/intelligence/dispatch/${encodeURIComponent(id)}`);
    },
    approveDispatch(id) {
      return requestJson(fetchImpl, `${baseUrl}/api/intelligence/dispatch/${encodeURIComponent(id)}/approve`, {
        method: "POST"
      });
    },
    rejectDispatch(id) {
      return requestJson(fetchImpl, `${baseUrl}/api/intelligence/dispatch/${encodeURIComponent(id)}/reject`, {
        method: "POST"
      });
    },
    deployIntelligenceTarget(target) {
      return requestJson(fetchImpl, `${baseUrl}/api/intelligence/target`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          query: target.query,
          vector: target.vector ?? "github",
          threat_tolerance: target.threatTolerance
        })
      });
    }
  };
}

export function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function normalizeRequestError(error) {
  const payload = error?.payload;
  if (payload && typeof payload === "object") {
    return {
      error: payload.error ?? "request-failed",
      error_code: payload.error_code ?? `HTTP_${error.status ?? "unknown"}`,
      message: payload.message ?? error.message,
      target_path: payload.target_path ?? null
    };
  }
  return {
    error: "request-failed",
    error_code: `HTTP_${error?.status ?? "unknown"}`,
    message: error?.message ?? "Request failed"
  };
}

async function requestJson(fetchImpl, url, options = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch-unavailable");
  }
  const response = await fetchImpl(url, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(options.headers ?? {})
    },
    body: options.body
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(text || `HTTP_${response.status}`);
    error.status = response.status;
    error.payload = parseOptionalJson(text);
    throw error;
  }
  return text ? JSON.parse(text) : {};
}

function parseOptionalJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
