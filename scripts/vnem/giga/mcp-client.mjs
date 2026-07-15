import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export async function connectMcp({ root, serverFile, name = "vnem-giga-benchmark", env = {} }) {
  const client = new Client({ name, version: "1.0.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, serverFile)],
    cwd: root,
    env: {
      ...process.env,
      VNEM_ROOT: root,
      VNEM_TOOLS_ALLOWED_ROOTS: root,
      VNEM_TOOLS_EVIDENCE_ROOT: path.join(root, ".vnem", "tool-runs"),
      VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1",
      ...env
    },
    stderr: "pipe"
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-32_000);
  });
  await client.connect(transport);
  return {
    client,
    transport,
    stderr: () => stderr,
    close: () => client.close().catch(() => {})
  };
}

export async function callTimed(client, name, args = {}) {
  const started = performance.now();
  const response = await client.callTool({ name, arguments: args });
  const latency_ms = Number((performance.now() - started).toFixed(2));
  const text = response.content?.filter((item) => item.type === "text").map((item) => item.text).join("\n") || "";
  return {
    latency_ms,
    output_bytes: Buffer.byteLength(text),
    text,
    structured: response.structuredContent || null,
    is_error: response.isError === true
  };
}

export function metricSummary(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { runs: 0, median_ms: null, p95_ms: null, worst_ms: null, min_ms: null };
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    runs: sorted.length,
    median_ms: Number(median.toFixed(2)),
    p95_ms: Number(percentile(sorted, 0.95).toFixed(2)),
    worst_ms: Number(sorted.at(-1).toFixed(2)),
    min_ms: Number(sorted[0].toFixed(2))
  };
}

function percentile(sorted, quantile) {
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function parseArg(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}
