import { useEffect, useRef, useState } from "react";

const DEFAULT_BASE_URL = import.meta.env?.VITE_VNEM_APP_SERVER_URL ?? "http://127.0.0.1:9099";

export const initialTelemetryState = Object.freeze({
  status: "idle",
  streamUrl: null,
  lastEvent: null,
  events: [],
  activeIngestions: [],
  routeErrors: [],
  mission: null,
  pipeline: null,
  targetingStatus: "idle",
  targetingError: null,
  systemError: null
});

export function useTelemetry(options = {}) {
  const [state, setState] = useState(initialTelemetryState);
  const controllerRef = useRef(null);

  if (!controllerRef.current) {
    const controllerOptions = {
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      consoleImpl: options.consoleImpl,
      onStateChange: setState
    };
    if (Object.hasOwn(options, "EventSourceImpl")) {
      controllerOptions.EventSourceImpl = options.EventSourceImpl;
    }
    if (Object.hasOwn(options, "fetchImpl")) {
      controllerOptions.fetchImpl = options.fetchImpl;
    }
    controllerRef.current = createTelemetryReceiver(controllerOptions);
  }

  useEffect(() => {
    const controller = controllerRef.current;
    controller.connect();
    return () => {
      controller.disconnect({ notify: false });
    };
  }, []);

  return {
    ...state,
    deployTarget: controllerRef.current.deployTarget,
    refreshTelemetryHistory: controllerRef.current.loadHistory
  };
}

export function createTelemetryReceiver(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const streamUrl = `${baseUrl}/api/telemetry/stream`;
  const EventSourceImpl = Object.hasOwn(options, "EventSourceImpl")
    ? options.EventSourceImpl
    : globalThis.EventSource;
  const fetchImpl = Object.hasOwn(options, "fetchImpl")
    ? options.fetchImpl
    : globalThis.fetch?.bind(globalThis);
  const consoleImpl = options.consoleImpl ?? console;
  const onStateChange = typeof options.onStateChange === "function" ? options.onStateChange : () => {};

  let state = {
    ...initialTelemetryState,
    streamUrl
  };
  let source = null;

  function setState(patch, options = {}) {
    state = {
      ...state,
      ...patch
    };
    if (options.notify !== false) {
      onStateChange(state);
    }
    return state;
  }

  function connect() {
    if (source) {
      return source;
    }
    if (fetchImpl) {
      void loadHistory();
    }
    if (!EventSourceImpl) {
      setState({
        status: "unavailable",
        systemError: {
          error: "eventsource-unavailable",
          stream_url: streamUrl
        }
      });
      return null;
    }

    source = new EventSourceImpl(streamUrl);
    setState({
      status: "connecting",
      streamUrl,
      systemError: null
    });

    source.onopen = () => {
      setState({
        status: "connected",
        systemError: null
      });
    };

    source.onmessage = (event) => {
      consoleImpl.log("[Telemetry Receiver]", event.data);
      applyTelemetryEvent(parseTelemetryEvent(event.data));
    };

    source.onerror = () => {
      setState({
        status: "error",
        systemError: {
          error: "telemetry-stream-error",
          stream_url: streamUrl
        }
      });
    };

    return source;
  }

  async function loadHistory() {
    try {
      const history = await requestJson(fetchImpl, `${baseUrl}/api/telemetry/history`);
      setState({
        activeIngestions: normalizeIngestions(history.active_ingestions),
        routeErrors: normalizeIngestions(history.route_errors),
        mission: history.mission ?? null,
        pipeline: history.pipeline ?? null,
        systemError: null
      });
    } catch (error) {
      setState({
        systemError: {
          error: "telemetry-history-unavailable",
          stream_url: streamUrl,
          message: error?.message ?? "Unable to load telemetry history"
        }
      });
    }
  }

  function applyTelemetryEvent(event) {
    const activeIngestions = event.active_ingestions
      ? normalizeIngestions(event.active_ingestions)
      : event.active_ingestion
        ? normalizeIngestions([event.active_ingestion, ...state.activeIngestions.filter((item) => item.id !== event.active_ingestion.id)])
        : state.activeIngestions;

    const mission = event.mission ?? state.mission;
    const targetingStatus = event.type === "mission_updated" ? "confirmed" : state.targetingStatus;

    setState({
      status: "connected",
      lastEvent: event,
      events: [event, ...state.events].slice(0, 60),
      activeIngestions,
      routeErrors: event.route_errors ? normalizeIngestions(event.route_errors) : state.routeErrors,
      mission,
      pipeline: event.pipeline ?? state.pipeline,
      targetingStatus,
      targetingError: event.type === "mission_updated" ? null : state.targetingError,
      systemError: null
    });
  }

  async function deployTarget(target) {
    if (!fetchImpl) {
      const error = {
        error: "fetch-unavailable",
        message: "The browser fetch API is unavailable."
      };
      setState({
        targetingStatus: "error",
        targetingError: error
      });
      return { ok: false, error };
    }

    setState({
      targetingStatus: "submitting",
      targetingError: null
    });

    try {
      const result = await requestJson(fetchImpl, `${baseUrl}/api/intelligence/target`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          query: target.query,
          threat_tolerance: target.threatTolerance
        })
      });
      setState({
        targetingStatus: "awaiting_confirmation",
        mission: result.mission ?? state.mission,
        targetingError: null
      });
      return result;
    } catch (error) {
      const structured = normalizeRequestError(error);
      setState({
        targetingStatus: "error",
        targetingError: structured
      });
      return {
        ok: false,
        error: structured
      };
    }
  }

  function disconnect(options = {}) {
    if (source?.close) {
      source.close();
    }
    source = null;
    setState({ status: "closed" }, options);
  }

  return {
    connect,
    disconnect,
    deployTarget,
    loadHistory,
    getState: () => state
  };
}

async function requestJson(fetchImpl, url, options = {}) {
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

function normalizeIngestions(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function parseTelemetryEvent(data) {
  try {
    return JSON.parse(data);
  } catch {
    return {
      type: "raw",
      message: String(data ?? "")
    };
  }
}

function parseOptionalJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function normalizeRequestError(error) {
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

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}
