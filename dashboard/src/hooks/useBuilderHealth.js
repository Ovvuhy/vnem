import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function createBuilderHealthController({ apiClient, onStateChange = () => {}, now = () => new Date().toISOString() } = {}) {
  let state = initialBuilderHealthState();

  function setState(patch) {
    state = { ...state, ...patch };
    onStateChange(state);
    return state;
  }

  async function refresh() {
    if (!apiClient || typeof apiClient.builderSession !== "function") {
      const error = new Error("builder-session-client-unavailable");
      setState({ status: "offline", session: null, error, lastCheckedAt: now(), source: "fallback" });
      return { ok: false, error };
    }
    setState({ status: "loading", error: null, lastCheckedAt: now() });
    try {
      const session = await apiClient.builderSession();
      setState({ status: "live", session, error: null, lastCheckedAt: now(), source: "backend" });
      return { ok: true, session };
    } catch (error) {
      setState({ status: "offline", session: null, error, lastCheckedAt: now(), source: "fallback" });
      return { ok: false, error };
    }
  }

  return {
    getState: () => state,
    refresh
  };
}

export function useBuilderHealth(apiClient, options = {}) {
  const [state, setState] = useState(() => initialBuilderHealthState());
  const controllerRef = useRef(null);
  const now = options.now ?? (() => new Date().toISOString());

  if (!controllerRef.current || controllerRef.currentApiClient !== apiClient) {
    controllerRef.current = createBuilderHealthController({ apiClient, onStateChange: setState, now });
    controllerRef.currentApiClient = apiClient;
  }

  const refresh = useCallback(() => controllerRef.current.refresh(), []);

  useEffect(() => {
    if (options.autoLoad === false) return;
    void refresh();
  }, [options.autoLoad, refresh]);

  return useMemo(() => ({ ...state, refresh }), [state, refresh]);
}

function initialBuilderHealthState() {
  return {
    status: "idle",
    session: null,
    error: null,
    lastCheckedAt: null,
    source: "fallback"
  };
}
