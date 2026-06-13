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
    },
    runArdPipeline(options = {}) {
      return requestJson(fetchImpl, `${baseUrl}/api/ard/pipeline/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          run_id: options.runId,
          mission: options.mission ?? "ARD Browser Pipeline v1",
          push_mode: options.pushMode ?? "fixture-remote"
        })
      });
    },
    latestArdPipeline() {
      return requestJson(fetchImpl, `${baseUrl}/api/ard/pipeline/latest`);
    },
    ardChangesStatus() {
      return requestJson(fetchImpl, `${baseUrl}/api/ard/changes/status`);
    },
    previewArdChanges(plan = {}) {
      return requestJson(fetchImpl, `${baseUrl}/api/ard/changes/preview`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(plan)
      });
    },
    prepareArdChanges(plan = {}) {
      return requestJson(fetchImpl, `${baseUrl}/api/ard/changes/prepare`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(plan)
      });
    },
    pushArdChanges(plan = {}) {
      return requestJson(fetchImpl, `${baseUrl}/api/ard/changes/push`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(plan)
      });
    },
    reviewQueue() {
      return requestJson(fetchImpl, `${baseUrl}/api/intelligence/review-queue`);
    },
    builderSession() {
      return requestJson(fetchImpl, `${baseUrl}/api/builder/session`);
    },
    refreshTriage() {
      return requestJson(fetchImpl, `${baseUrl}/api/intelligence/triage/refresh`, {
        method: "POST"
      });
    },
    reviewCandidate(id, review) {
      return requestJson(fetchImpl, `${baseUrl}/api/intelligence/candidate/${encodeURIComponent(id)}/review`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(review)
      });
    },
    previewGivingBranch(plan) {
      return requestJson(fetchImpl, `${baseUrl}/api/giving/branch/preview`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(plan)
      });
    },
    prepareGivingBranch(plan) {
      return requestJson(fetchImpl, `${baseUrl}/api/giving/branch/prepare`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(plan)
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
