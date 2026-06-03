import { useCallback, useRef, useState } from "react";

const DEFAULT_BASE_URL = import.meta.env?.VITE_VNEM_APP_SERVER_URL ?? "http://127.0.0.1:9099";

export const initialVnemConnectorState = Object.freeze({
  clients: [],
  previewData: {},
  isProcessing: false,
  systemError: null,
  lastStatusPayload: null,
  lastPreviewPayload: null,
  lastMutationResult: null
});

export function useVnemConnector(options = {}) {
  const [state, setState] = useState(initialVnemConnectorState);
  const controllerRef = useRef(null);

  if (!controllerRef.current) {
    controllerRef.current = createVnemConnectorStateController({
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      fetchImpl: options.fetchImpl,
      onStateChange: setState
    });
  }

  const refreshStatus = useCallback(() => controllerRef.current.refreshStatus(), []);
  const fetchPreview = useCallback(() => controllerRef.current.fetchPreview(), []);
  const toggleClientLink = useCallback((clientId, targetAction) => {
    return controllerRef.current.toggleClientLink(clientId, targetAction);
  }, []);

  return {
    ...state,
    refreshStatus,
    fetchPreview,
    toggleClientLink
  };
}

export function createVnemConnectorStateController(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const onStateChange = typeof options.onStateChange === "function" ? options.onStateChange : () => {};
  let state = { ...initialVnemConnectorState };
  let mutationLocked = false;

  if (!fetchImpl) {
    throw new Error("fetch-unavailable");
  }

  function setState(patch) {
    state = {
      ...state,
      ...patch
    };
    onStateChange(state);
    return state;
  }

  async function refreshStatus() {
    try {
      const payload = await requestJson(fetchImpl, baseUrl, "/api/connector/status", { method: "GET" });
      setState({
        clients: normalizeClients(payload),
        lastStatusPayload: payload,
        systemError: null
      });
      return payload;
    } catch (error) {
      setState({ systemError: normalizeSystemError(error) });
      return null;
    }
  }

  async function fetchPreview() {
    try {
      const payload = await requestJson(fetchImpl, baseUrl, "/api/connector/preview", { method: "GET" });
      setState({
        previewData: payload?.previews ?? {},
        lastPreviewPayload: payload,
        systemError: null
      });
      return payload;
    } catch (error) {
      setState({ systemError: normalizeSystemError(error) });
      return null;
    }
  }

  async function toggleClientLink(clientId, targetAction) {
    const action = normalizeAction(targetAction);
    if (mutationLocked) {
      const locked = {
        error: "mutation-in-progress",
        client_id: clientId,
        target_action: action
      };
      setState({ systemError: locked });
      return { ok: false, error: locked };
    }

    mutationLocked = true;
    setState({
      isProcessing: true,
      systemError: null
    });

    try {
      const payload = await requestJson(fetchImpl, baseUrl, `/api/connector/${action}`, { method: "POST" });
      setState({
        lastMutationResult: {
          client_id: clientId,
          target_action: action,
          payload
        }
      });
      await Promise.all([refreshStatus(), fetchPreview()]);
      return { ok: true, payload };
    } catch (error) {
      const systemError = normalizeSystemError(error, { client_id: clientId, target_action: action });
      setState({
        systemError,
        lastMutationResult: {
          client_id: clientId,
          target_action: action,
          error: systemError
        }
      });
      return { ok: false, error: systemError };
    } finally {
      mutationLocked = false;
      setState({ isProcessing: false });
    }
  }

  return {
    getState: () => state,
    refreshStatus,
    fetchPreview,
    toggleClientLink
  };
}

export function normalizeClients(payload) {
  const clients = payload?.detected_clients ?? {};
  return Object.entries(clients).map(([id, client]) => ({
    id,
    ...client
  }));
}

async function requestJson(fetchImpl, baseUrl, route, options) {
  const response = await fetchImpl(`${baseUrl}${route}`, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options?.headers ?? {})
    }
  });
  const text = await response.text();
  const body = parseJsonBody(text, response.status);

  if (!response.ok) {
    throw {
      kind: "http-error",
      status_code: response.status,
      route,
      body
    };
  }

  return body;
}

function parseJsonBody(text, statusCode) {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw {
      kind: "invalid-json",
      status_code: statusCode,
      body: text.slice(0, 240)
    };
  }
}

function normalizeSystemError(error, context = {}) {
  const body = error?.body && typeof error.body === "object" ? error.body : {};
  const nested = findNestedFailure(body);
  const errorCode = body.error_code ?? nested?.error_code ?? httpErrorCode(error?.status_code);
  return {
    error: body.error ?? nested?.error ?? error?.kind ?? error?.message ?? "connector-request-failed",
    error_code: errorCode,
    status_code: error?.status_code ?? null,
    target_path: body.target_path ?? nested?.target_path ?? nested?.selected_config_path ?? nested?.backup_path ?? null,
    route: error?.route ?? null,
    ...context
  };
}

function findNestedFailure(value, seen = new Set()) {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  if (value.error_code || value.action === "permission-denied" || value.target_path) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findNestedFailure(child, seen);
    if (found) {
      return found;
    }
  }
  return null;
}

function normalizeAction(targetAction) {
  if (targetAction === "apply" || targetAction === "rollback") {
    return targetAction;
  }
  throw new Error(`Unsupported connector action: ${targetAction}`);
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function httpErrorCode(statusCode) {
  if (statusCode === 403) return "HTTP_403";
  if (statusCode === 500) return "HTTP_500";
  return statusCode ? `HTTP_${statusCode}` : "unavailable";
}
