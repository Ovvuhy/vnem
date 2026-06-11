import { useEffect, useRef, useState } from "react";
import { createVnemApiClient, normalizeRequestError } from "../lib/vnemApiClient.js";

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
  reviewQueue: null,
  branchCandidateSet: null,
  ardBrowserPipeline: null,
  intelligenceProvider: null,
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
  const apiOptions = {
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL
  };
  if (Object.hasOwn(options, "fetchImpl")) {
    apiOptions.fetchImpl = options.fetchImpl;
  }
  const apiClient = createVnemApiClient(apiOptions);
  const streamUrl = apiClient.streamUrl;
  const EventSourceImpl = Object.hasOwn(options, "EventSourceImpl")
    ? options.EventSourceImpl
    : globalThis.EventSource;
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
    if (apiClient.hasFetch) {
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
      const history = await apiClient.telemetryHistory();
      setState({
        activeIngestions: normalizeIngestions(history.active_ingestions),
        routeErrors: normalizeIngestions(history.route_errors),
        mission: history.mission ?? null,
        pipeline: history.pipeline ?? null,
        reviewQueue: history.review_queue ?? null,
        branchCandidateSet: history.branch_candidate_set ?? null,
        ardBrowserPipeline: history.ard_browser_pipeline ?? null,
        intelligenceProvider: history.intelligence_provider ?? null,
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
    const targetingStatus = nextTargetingStatus(event, state.targetingStatus);

    setState({
      status: "connected",
      lastEvent: event,
      events: [event, ...state.events].slice(0, 60),
      activeIngestions,
      routeErrors: event.route_errors ? normalizeIngestions(event.route_errors) : state.routeErrors,
      mission,
      pipeline: event.pipeline ?? state.pipeline,
      reviewQueue: event.review_queue ?? state.reviewQueue,
      branchCandidateSet: event.branch_candidate_set ?? state.branchCandidateSet,
      ardBrowserPipeline: event.ard_browser_pipeline ?? state.ardBrowserPipeline,
      intelligenceProvider: event.intelligence_provider ?? event.pipeline?.intelligence_provider ?? state.intelligenceProvider,
      targetingStatus,
      targetingError: shouldClearTargetingError(event) ? null : state.targetingError,
      systemError: null
    });
  }

  async function deployTarget(target) {
    if (!apiClient.hasFetch) {
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
      const result = await apiClient.deployIntelligenceTarget(target);
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

function nextTargetingStatus(event, currentStatus) {
  if (event.type === "pipeline_research_noop") {
    return "cache_standby";
  }
  if (event.type === "mission_updated") {
    return "confirmed";
  }
  const status = event.active_ingestion?.status;
  if (status === "staged_for_review") {
    return "completed";
  }
  if (status === "isolated_by_protection") {
    return "isolated";
  }
  return currentStatus;
}

function shouldClearTargetingError(event) {
  return ["mission_updated", "pipeline_research_noop"].includes(event.type) ||
    ["researching", "sandboxing", "staged_for_review", "isolated_by_protection"].includes(event.active_ingestion?.status);
}
