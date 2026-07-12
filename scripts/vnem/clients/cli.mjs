import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PermissionRuntime } from "../permissions/runtime.mjs";
import { applyClientSetup, detectSupportedClients, planClientSetup, publicSetupPlan, rollbackClientSetup, setupStatus, verifySetup } from "./setup.mjs";

export async function runSetupCommand(rawArgs = [], io = {}) {
  const options = parseClientArgs(rawArgs);
  if (isInteractive(io) && rawArgs.length === 0) return interactiveSetup(io);
  const plan = await planClientSetup(options);
  const result = options.yes
    ? await applyClientSetup({ ...options, plan, yes: true, verifyMcp: options.verifyMcp })
    : { ...publicSetupPlan(plan), applied: false };
  emit(result, options.json, io);
  return result;
}

export async function runConfigPreviewCommand(rawArgs = [], io = {}) {
  const options = parseClientArgs(rawArgs.filter((arg) => arg !== "--yes"));
  const plan = publicSetupPlan(await planClientSetup(options));
  const result = { ...plan, applied: false };
  emit(result, options.json, io);
  return result;
}

export async function runClientsCommand(rawArgs = [], io = {}) {
  const options = parseClientArgs(rawArgs);
  const result = await detectSupportedClients(options);
  emit(result, options.json, io);
  return result;
}

export async function runClientDoctorCommand(rawArgs = [], io = {}) {
  const options = parseClientArgs(rawArgs);
  if (!options.clients.length) {
    const current = await setupStatus(options);
    if (current.latest_transaction) {
      options.clients = current.latest_transaction.clients;
      options.components = current.latest_transaction.components;
      options.safetyProfile = current.latest_transaction.safety_profile;
      options.root = current.latest_transaction.root;
      options.workspace = current.latest_transaction.workspace;
    }
  }
  const plan = await planClientSetup(options);
  const proof = await verifySetup({ ...plan, runMcp: options.verifyMcp });
  const result = { operation: "doctor", ok: proof.ok, clients: plan.clients, components: plan.components, proof };
  emit(result, options.json, io);
  if (!proof.ok && io.setExitCode !== false) process.exitCode = 1;
  return result;
}

export async function runRollbackCommand(rawArgs = [], io = {}) {
  const options = parseClientArgs(rawArgs);
  const result = await rollbackClientSetup({ ...options, transactionId: valueAfter(rawArgs, "--transaction") });
  emit(result, options.json, io);
  return result;
}

export async function runStatusCommand(rawArgs = [], io = {}) {
  const options = parseClientArgs(rawArgs);
  const setup = await setupStatus(options);
  const safetyWorkspace = setup.latest_transaction?.workspace || options.workspace;
  const safety = await PermissionRuntime.create({ workspaceRoot: safetyWorkspace, allowedRoots: [safetyWorkspace] }).then((runtime) => runtime.status());
  const result = {
    operation: "status",
    setup: setup.latest_transaction,
    clients: setup.clients,
    safety: {
      active_profile: safety.profile.profile_name,
      configured_by: safety.configured_by,
      hard_blocks_present: safety.hard_blocked_actions.length > 0
    },
    secrets_in_output: false
  };
  emit(result, options.json, io);
  return result;
}

async function interactiveSetup(io = {}) {
  const detected = await detectSupportedClients();
  write(io, "\nVNEM setup\nUse Up/Down to move, Space to toggle, Enter to continue, Q to cancel.\n\n");
  const selected = await interactiveMultiSelect(detected.clients, io);
  if (!selected.length) throw new Error("No clients selected.");
  const rl = createInterface({ input: io.input || input, output: io.output || output });
  try {
    const componentText = (await rl.question("Components [core,tools] (add precision for compatibility): ")).trim() || "core,tools";
    const safetyProfile = (await rl.question("Safety profile [safe-local-dev]: ")).trim() || "safe-local-dev";
    const options = { clients: selected, components: splitList(componentText), safetyProfile };
    const plan = await planClientSetup(options);
    printPreview(plan, io);
    const confirmation = await rl.question("Type APPLY VNEM to apply all listed changes: ");
    if (confirmation !== "APPLY VNEM") {
      write(io, "Setup canceled; no files changed.\n");
      return { operation: "setup", applied: false, canceled: true };
    }
    const result = await applyClientSetup({ ...options, plan, yes: true, verifyMcp: true });
    emit(result, false, io);
    return result;
  } finally {
    rl.close();
  }
}

async function interactiveMultiSelect(clients, io = {}) {
  const stream = io.input || input;
  const out = io.output || output;
  if (!stream.isTTY || typeof stream.setRawMode !== "function") {
    return clients.filter((client) => client.installed).map((client) => client.id);
  }
  emitKeypressEvents(stream);
  const selected = new Set(clients.filter((client) => client.installed).map((client) => client.id));
  let cursor = 0;
  const render = () => {
    out.write("\x1b[2J\x1b[H");
    out.write("VNEM setup\nUp/Down: move  Space: toggle  Enter: continue  Q: cancel\n\n");
    clients.forEach((client, index) => {
      const pointer = index === cursor ? ">" : " ";
      const checked = selected.has(client.id) ? "[x]" : "[ ]";
      const detected = client.installed ? "detected" : "not detected";
      out.write(`${pointer} ${checked} ${client.display_name} (${detected}; ${client.support}; ${client.proof_level})\n`);
    });
  };
  stream.setRawMode(true);
  stream.resume();
  render();
  try {
    return await new Promise((resolve, reject) => {
      const onKey = (_value, key = {}) => {
        if (key.name === "up") cursor = (cursor - 1 + clients.length) % clients.length;
        else if (key.name === "down") cursor = (cursor + 1) % clients.length;
        else if (key.name === "space") selected.has(clients[cursor].id) ? selected.delete(clients[cursor].id) : selected.add(clients[cursor].id);
        else if (key.name === "return") {
          stream.off("keypress", onKey);
          resolve(clients.filter((client) => selected.has(client.id)).map((client) => client.id));
          return;
        } else if (key.name === "q" || (key.ctrl && key.name === "c")) {
          stream.off("keypress", onKey);
          reject(new Error("Setup canceled; no files changed."));
          return;
        }
        render();
      };
      stream.on("keypress", onKey);
    });
  } finally {
    stream.setRawMode(false);
    out.write("\n");
  }
}

function parseClientArgs(args) {
  return {
    clients: splitList(valueAfter(args, "--clients") || valueAfter(args, "--client")),
    components: splitList(valueAfter(args, "--components")),
    safetyProfile: valueAfter(args, "--profile") || "safe-local-dev",
    root: path.resolve(valueAfter(args, "--vnem-root") || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")),
    workspace: path.resolve(valueAfter(args, "--workspace") || process.cwd()),
    home: valueAfter(args, "--home") ? path.resolve(valueAfter(args, "--home")) : undefined,
    stateDir: valueAfter(args, "--state-dir") ? path.resolve(valueAfter(args, "--state-dir")) : undefined,
    yes: args.includes("--yes"),
    json: args.includes("--json"),
    verifyMcp: !args.includes("--no-verify-mcp")
  };
}

function printPreview(plan, io) {
  write(io, `\nClients: ${plan.clients.join(", ")}\nComponents: ${plan.components.join(", ")}\nSafety: ${plan.safety_profile}\n`);
  write(io, `Changes (${plan.change_count}):\n`);
  for (const file of plan.files) {
    write(io, `- ${file.changed ? "change" : "unchanged"} ${file.path} [${file.clients.join(", ")}] ${file.before_sha256.slice(0, 12)} -> ${file.after_sha256.slice(0, 12)}\n`);
  }
  write(io, "Every changed file is backed up before the one confirmed transaction.\n\n");
}

function emit(value, json, io) {
  if (json) return write(io, `${JSON.stringify(value, null, 2)}\n`);
  if (value.operation === "clients") {
    for (const client of value.clients) write(io, `${client.installed ? "[x]" : "[ ]"} ${client.display_name}: ${client.support}; ${client.proof_level}\n`);
    return;
  }
  if (value.operation === "setup_preview") return printPreview(value, io);
  if (value.operation === "status") {
    write(io, `${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  write(io, `${JSON.stringify(value, null, 2)}\n`);
}

function isInteractive(io) {
  if (io.interactive !== undefined) return io.interactive;
  return Boolean((io.input || input).isTTY && (io.output || output).isTTY);
}

function write(io, value) {
  (io.output || output).write(String(value));
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function splitList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}
