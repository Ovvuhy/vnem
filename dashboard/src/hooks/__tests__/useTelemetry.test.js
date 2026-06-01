#!/usr/bin/env node
import assert from "node:assert/strict";
import { createTelemetryReceiver } from "../useTelemetry.js";

class MockEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.closed = false;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emitOpen() {
    this.onopen?.({ type: "open" });
  }

  emitMessage(data) {
    this.onmessage?.({ data });
  }

  emitError() {
    this.onerror?.({ type: "error" });
  }
}

const logs = [];
const states = [];
MockEventSource.instances = [];

const receiver = createTelemetryReceiver({
  baseUrl: "http://127.0.0.1:9099/",
  EventSourceImpl: MockEventSource,
  fetchImpl: async (url) => {
    assert.equal(url, "http://127.0.0.1:9099/api/telemetry/history");
    return jsonResponse({
      active_ingestions: [
        {
          id: "ingestion-test",
          title: "Pipeline baseline",
          current_agent: "research",
          status: "researching"
        }
      ],
      pipeline: {
        active_agent: "research"
      },
      route_errors: [
        {
          route: "github-search",
          error_code: "GITHUB_RATE_LIMITED"
        }
      ]
    });
  },
  consoleImpl: {
    log: (...args) => logs.push(args)
  },
  onStateChange: (state) => states.push(state)
});

const source = receiver.connect();
assert.equal(source.url, "http://127.0.0.1:9099/api/telemetry/stream");
assert.equal(receiver.getState().status, "connecting");
await waitFor(() => receiver.getState().activeIngestions.length > 0);
assert.equal(receiver.getState().activeIngestions[0].id, "ingestion-test");
assert.equal(receiver.getState().pipeline.active_agent, "research");
assert.equal(receiver.getState().routeErrors[0].error_code, "GITHUB_RATE_LIMITED");

source.emitOpen();
assert.equal(receiver.getState().status, "connected");

source.emitMessage(JSON.stringify({
  type: "pipeline_ingestion_updated",
  message: "Telemetry bridge active",
  active_ingestion: {
    id: "ingestion-test",
    title: "Pipeline baseline",
    current_agent: "protection",
    status: "sandboxing"
  },
  route_errors: []
}));
assert.equal(receiver.getState().lastEvent.type, "pipeline_ingestion_updated");
assert.equal(receiver.getState().events.length, 1);
assert.equal(receiver.getState().activeIngestions[0].current_agent, "protection");
assert.equal(receiver.getState().routeErrors.length, 0);
assert.deepEqual(logs[0], [
  "[Telemetry Receiver]",
  "{\"type\":\"pipeline_ingestion_updated\",\"message\":\"Telemetry bridge active\",\"active_ingestion\":{\"id\":\"ingestion-test\",\"title\":\"Pipeline baseline\",\"current_agent\":\"protection\",\"status\":\"sandboxing\"},\"route_errors\":[]}"
]);

source.emitError();
assert.equal(receiver.getState().status, "error");
assert.equal(receiver.getState().systemError.error, "telemetry-stream-error");

receiver.disconnect();
assert.equal(source.closed, true);
assert.equal(receiver.getState().status, "closed");
assert.ok(states.some((state) => state.status === "connecting"));
assert.ok(states.some((state) => state.status === "connected"));

const unavailable = createTelemetryReceiver({
  baseUrl: "http://127.0.0.1:9099",
  EventSourceImpl: null,
  fetchImpl: null
});
assert.equal(unavailable.connect(), null);
assert.equal(unavailable.getState().status, "unavailable");

console.log("useTelemetry tests passed");

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}

async function waitFor(predicate) {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for telemetry state update");
}
