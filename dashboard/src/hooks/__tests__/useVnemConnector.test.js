#!/usr/bin/env node
import assert from "node:assert/strict";
import { createVnemConnectorStateController, normalizeClients } from "../useVnemConnector.js";

const statusPayload = {
  generated_at: "2026-06-01T00:00:00.000Z",
  scan_metadata: {
    mode: "read-only"
  },
  detected_clients: {
    claude_desktop: {
      display_name: "Claude Desktop",
      installed: true,
      config_profile_present: true,
      custom_mcp_hook_present: true,
      vnem_connection_present: false,
      config_files: []
    }
  }
};

const previewPayload = {
  preview_metadata: {
    mode: "read-only-preview",
    writes_performed: false
  },
  previews: {
    claude_desktop: {
      id: "claude_desktop",
      selected_config_path: "C:\\VNEM\\.tmp\\claude_desktop_config.json",
      preview_status: "would-add-vnem-mcp",
      would_change: true,
      target_config_state: {
        mcpServers: {
          vnem: {
            command: "node",
            args: ["C:\\VNEM\\vnem-src\\scripts\\vnem-mcp-server.mjs"]
          }
        }
      }
    }
  }
};

assert.deepEqual(normalizeClients(statusPayload).map((client) => client.id), ["claude_desktop"]);
await testStatusPreviewAndMutationLock();
await testPermissionFailureCapture();
console.log("useVnemConnector tests passed");

async function testStatusPreviewAndMutationLock() {
  const states = [];
  const calls = [];
  let releaseApply;

  const fetchImpl = async (url, options = {}) => {
    const requestUrl = new URL(url);
    calls.push({ method: options.method ?? "GET", path: requestUrl.pathname });

    if (requestUrl.pathname === "/api/connector/status") {
      return jsonResponse(statusPayload);
    }
    if (requestUrl.pathname === "/api/connector/preview") {
      return jsonResponse(previewPayload);
    }
    if (requestUrl.pathname === "/api/connector/apply") {
      return new Promise((resolve) => {
        releaseApply = () => resolve(jsonResponse({
          mode: "apply",
          results: {
            claude_desktop: {
              action: "applied",
              changed: true
            }
          }
        }));
      });
    }
    throw new Error(`unexpected route ${requestUrl.pathname}`);
  };

  const controller = createVnemConnectorStateController({
    baseUrl: "http://127.0.0.1:9099",
    fetchImpl,
    onStateChange: (state) => states.push(state)
  });

  await controller.refreshStatus();
  assert.equal(controller.getState().clients[0].display_name, "Claude Desktop");

  await controller.fetchPreview();
  assert.equal(controller.getState().previewData.claude_desktop.preview_status, "would-add-vnem-mcp");

  const mutation = controller.toggleClientLink("claude_desktop", "apply");
  assert.equal(controller.getState().isProcessing, true, "mutation must lock immediately");

  const duplicate = await controller.toggleClientLink("claude_desktop", "apply");
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.error, "mutation-in-progress");

  releaseApply();
  const result = await mutation;
  assert.equal(result.ok, true);
  assert.equal(controller.getState().isProcessing, false, "mutation must unlock after completion");
  assert.equal(controller.getState().systemError, null);
  assert.ok(calls.some((call) => call.path === "/api/connector/status"));
  assert.ok(calls.some((call) => call.path === "/api/connector/preview"));
  assert.ok(states.some((state) => state.isProcessing === true));
  assert.ok(states.at(-1).isProcessing === false);
}

async function testPermissionFailureCapture() {
  const fetchImpl = async (url) => {
    const requestUrl = new URL(url);
    if (requestUrl.pathname === "/api/connector/apply") {
      return jsonResponse({
        tool: "vnem-apply-connector-changes",
        mode: "apply",
        results: {
          claude_desktop: {
            action: "permission-denied",
            error_code: "EPERM",
            selected_config_path: "C:\\Users\\ovvuh\\AppData\\Roaming\\Claude\\claude_desktop_config.json"
          }
        }
      }, 500);
    }
    return jsonResponse(statusPayload);
  };

  const controller = createVnemConnectorStateController({
    baseUrl: "http://127.0.0.1:9099",
    fetchImpl
  });

  const result = await controller.toggleClientLink("claude_desktop", "apply");
  assert.equal(result.ok, false);
  assert.equal(controller.getState().isProcessing, false);
  assert.equal(controller.getState().systemError.error_code, "EPERM");
  assert.equal(
    controller.getState().systemError.target_path,
    "C:\\Users\\ovvuh\\AppData\\Roaming\\Claude\\claude_desktop_config.json"
  );
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}
