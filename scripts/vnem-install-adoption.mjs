#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, "..");
const clients = ["codex", "claude", "antigravity", "generic"];
const outputBase = path.join(".vnem", "install-adoption");
const portableCheckout = "${VNEM_CHECKOUT}";
const serverNames = ["vnem", "vnem-tools"];
const disallowedControlPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
const secretValuePattern = /(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;
const packageScripts = [
  "setup",
  "clients",
  "status",
  "config:preview",
  "rollback",
  "test:clients",
  "vnem:install:doctor",
  "vnem:install:emit",
  "test:vnem-install-adoption-1-regression",
  "test:vnem-install-emit-generic",
  "test:vnem-install-emit-codex",
  "test:vnem-install-emit-claude",
  "test:vnem-install-emit-antigravity",
  "test:vnem-install-doctor",
  "runtime:readiness",
  "registry:check"
];
const fallbackCoreEntryTools = ["vnem_entrypoint", "vnem_usage_contract", "vnem_mcp_visibility_doctor", "vnem_install_adoption_guide"];
const fallbackToolsEntryTools = ["vnem_tools_entrypoint", "vnem_tools_capability_router", "vnem_tools_adoption_readiness", "vnem_tools_install_profile_emit", "vnem_tools_install_doctor"];

export function supportedInstallAdoptionClients() {
  return [...clients];
}

export function buildInstallAdoptionFiles(root = defaultRoot, { portable = false } = {}) {
  const files = {};
  for (const client of clients) {
    const profile = buildInstallAdoptionProfile({ client, root, portable });
    for (const file of profile.files) {
      files[file.path] = file.content;
    }
  }
  files[path.join(outputBase, "prompts", "vnem-agent-use-instruction.md")] = buildAgentUseInstruction();
  files[path.join(outputBase, "verify", "install-doctor-report.json")] = `${JSON.stringify(buildStaticDoctorSeed(root, { portable }), null, 2)}\n`;
  return files;
}

export function buildInstallAdoptionProfile({ client = "generic", root = defaultRoot, portable = false } = {}) {
  const normalizedClient = normalizeClient(client);
  const absoluteRoot = path.resolve(root || defaultRoot);
  const profileRoot = portable ? portableCheckout : absoluteRoot;
  const serverConfig = buildMcpServersConfig(absoluteRoot, { portable });
  const files = [];
  const base = path.join(outputBase, normalizedClient);
  if (normalizedClient === "codex") {
    files.push({
      path: path.join(base, "config-snippet.toml"),
      content: codexTomlSnippet(serverConfig, profileRoot, { portable })
    });
    files.push({
      path: path.join(base, "README.md"),
      content: codexReadme(profileRoot, serverConfig.vnem.command, { portable })
    });
  } else {
    files.push({
      path: path.join(base, "mcp.json"),
      content: `${JSON.stringify({ mcpServers: serverConfig }, null, 2)}\n`
    });
    files.push({
      path: path.join(base, "README.md"),
      content: clientReadme(normalizedClient, profileRoot, serverConfig.vnem.command, { portable })
    });
  }

  return {
    client: normalizedClient,
    root: profileRoot,
    portable_template: portable,
    output_base: outputBase,
    files,
    server_names: serverNames,
    safety: safetySummary()
  };
}

export async function emitInstallAdoptionProfile({ client = "generic", root = defaultRoot } = {}) {
  const profile = buildInstallAdoptionProfile({ client, root });
  await writeProfileFiles(root, profile.files);
  const promptPath = path.join(outputBase, "prompts", "vnem-agent-use-instruction.md");
  await writeProfileFiles(root, [{ path: promptPath, content: buildAgentUseInstruction() }]);
  return {
    action: "emit",
    client: profile.client,
    root: path.resolve(root || defaultRoot),
    written_files: [...profile.files.map((file) => file.path), promptPath],
    outside_repo_writes: false,
    servers: serverNames,
    safe_next_step: "Merge or import the emitted snippet into the selected client's MCP settings, then call vnem_install_adoption_guide or vnem_tools_install_doctor to verify visibility."
  };
}

export async function emitAllInstallAdoptionProfiles({ root = defaultRoot } = {}) {
  const results = [];
  for (const client of clients) {
    results.push(await emitInstallAdoptionProfile({ client, root }));
  }
  return {
    action: "emit_all",
    root: path.resolve(root || defaultRoot),
    clients: [...clients],
    written_files: [...new Set(results.flatMap((result) => result.written_files))],
    outside_repo_writes: false,
    servers: serverNames,
    safe_next_step: "Run node scripts/vnem-install-adoption.mjs doctor, then import only the client profile you intend to use."
  };
}

export async function installAdoptionDoctor({ root = defaultRoot, emit = true, writeReport = true } = {}) {
  const absoluteRoot = path.resolve(root || defaultRoot);
  const runtimeRegistry = readRuntimeRegistry(absoluteRoot);
  const coreEntryTools = entryTools(runtimeRegistry, "core", fallbackCoreEntryTools);
  const toolsEntryTools = entryTools(runtimeRegistry, "tools", fallbackToolsEntryTools);
  if (emit) await emitAllInstallAdoptionProfiles({ root: absoluteRoot });
  if (emit) {
    await writeProfileFiles(absoluteRoot, [{
      path: path.join(outputBase, "verify", "install-doctor-report.json"),
      content: `${JSON.stringify(buildStaticDoctorSeed(absoluteRoot), null, 2)}\n`
    }]);
  }
  const checks = [];
  const add = (id, ok, detail = "") => checks.push({ id, ok: Boolean(ok), detail });
  const pkgPath = path.join(absoluteRoot, "package.json");
  const coreServerPath = path.join(absoluteRoot, "scripts", "vnem-mcp-server.mjs");
  const toolsServerPath = path.join(absoluteRoot, "scripts", "vnem-tools-mcp-server.mjs");
  const cliPath = path.join(absoluteRoot, "scripts", "vnem-install-adoption.mjs");
  const packageJson = existsSync(pkgPath) ? JSON.parse(await readFile(pkgPath, "utf8")) : {};
  const coreSource = existsSync(coreServerPath) ? await readFile(coreServerPath, "utf8") : "";
  const toolsSource = existsSync(toolsServerPath) ? await readFile(toolsServerPath, "utf8") : "";
  const coreRegistryNames = runtimeRegistry?.servers?.core?.tools?.map((tool) => tool.name) || [];
  const toolsRegistryNames = runtimeRegistry?.servers?.tools?.tools?.map((tool) => tool.name) || [];

  add("repo_exists", existsSync(absoluteRoot), absoluteRoot);
  add("node_available", Boolean(process.version), `${process.execPath} ${process.version}`);
  add("package_json_exists", existsSync(pkgPath), "package.json");
  add("core_server_exists", existsSync(coreServerPath), "scripts/vnem-mcp-server.mjs");
  add("tools_server_exists", existsSync(toolsServerPath), "scripts/vnem-tools-mcp-server.mjs");
  add("install_adoption_cli_exists", existsSync(cliPath), "scripts/vnem-install-adoption.mjs");
  add("core_node_check", nodeCheck(coreServerPath), "node --check scripts/vnem-mcp-server.mjs");
  add("tools_node_check", nodeCheck(toolsServerPath), "node --check scripts/vnem-tools-mcp-server.mjs");
  add("install_adoption_node_check", nodeCheck(cliPath), "node --check scripts/vnem-install-adoption.mjs");
  add("runtime_registry_available", Boolean(runtimeRegistry), runtimeRegistry ? ".vnem/runtime-tool-registry.json" : "source-scan compatibility fallback");
  add("runtime_registry_valid", runtimeRegistry ? runtimeRegistry.validation?.valid === true : true, runtimeRegistry ? `tools=${runtimeRegistry.total_tools}` : "not available; source fallback used");
  add("core_entrypoint_tools_registered", coreEntryTools.every((tool) => coreRegistryNames.length ? coreRegistryNames.includes(tool) : sourceRegistersTool(coreSource, tool)), `${coreEntryTools.join(", ")} (${coreRegistryNames.length ? "runtime registry" : "source fallback"})`);
  add("tools_entrypoint_tools_registered", toolsEntryTools.every((tool) => toolsRegistryNames.length ? toolsRegistryNames.includes(tool) : sourceRegistersTool(toolsSource, tool)), `${toolsEntryTools.join(", ")} (${toolsRegistryNames.length ? "runtime registry" : "source fallback"})`);
  add("package_scripts_exist", packageScripts.every((script) => packageJson.scripts?.[script]), packageScripts.join(", "));

  const expectedFiles = expectedInstallAdoptionFiles();
  for (const relativePath of expectedFiles) {
    add(`profile_exists:${toPortable(relativePath)}`, existsSync(path.join(absoluteRoot, relativePath)), relativePath);
  }
  for (const relativePath of expectedFiles.filter((file) => file.endsWith(".json"))) {
    add(`json_parseable:${toPortable(relativePath)}`, parsesJson(path.join(absoluteRoot, relativePath)), relativePath);
  }
  add("codex_toml_plausible", tomlSnippetPlausible(path.join(absoluteRoot, outputBase, "codex", "config-snippet.toml")), "Codex TOML snippet has two MCP server blocks");
  add("both_mcps_present", profilesIncludeBothMcps(absoluteRoot), "vnem and vnem-tools appear in every profile");
  add("mcp_launch_commands_plausible", launchCommandsPlausible(absoluteRoot), "node command, script args, cwd and stdio transport are present");

  const profileTexts = await readInstallAdoptionTexts(absoluteRoot);
  const hiddenControlHits = profileTexts.filter((file) => disallowedControlPattern.test(file.content)).map((file) => file.path);
  const secretHits = profileTexts.filter((file) => secretValuePattern.test(file.content)).map((file) => file.path);
  add("no_hidden_bidi_or_control_chars", hiddenControlHits.length === 0, hiddenControlHits.join(", ") || "none");
  add("no_secret_values_in_profiles", secretHits.length === 0, secretHits.join(", ") || "none");
  add("outside_repo_writes_default_blocked", true, "emit/doctor write only under .vnem/install-adoption by default");
  add("windows_path_escaping_valid", windowsEscapingValid(absoluteRoot), "JSON parses and TOML backslashes are quoted");

  const report = {
    schema_version: "1.0.0",
    status: checks.every((check) => check.ok) ? "pass" : "fail",
    root: absoluteRoot,
    node: { version: process.version, command: process.execPath },
    clients,
    servers: serverNames,
    checks,
    safe_next_step: "Import or merge one generated client profile, restart or reload the AI client if required, then verify the MCP tool list contains vnem_install_adoption_guide and vnem_tools_install_doctor.",
    what_is_not_proven: [
      "The current AI client has actually imported the emitted profile.",
      "Codex, Claude, Antigravity-style clients share one universal config path.",
      "GitHub/network/auth capabilities are available inside every downstream client session."
    ],
    safety: safetySummary()
  };
  if (writeReport) {
    await writeProfileFiles(absoluteRoot, [{
      path: path.join(outputBase, "verify", "install-doctor-report.json"),
      content: `${JSON.stringify(report, null, 2)}\n`
    }]);
  }
  return report;
}

function readRuntimeRegistry(root) {
  try {
    return JSON.parse(readFileSync(path.join(root, ".vnem", "runtime-tool-registry.json"), "utf8"));
  } catch {
    return null;
  }
}

function entryTools(registry, server, fallback) {
  const names = registry?.servers?.[server]?.tools?.map((tool) => tool.name) || [];
  return names.length ? fallback.filter((name) => names.includes(name)) : fallback;
}

export function buildInstallAdoptionGuide({ client = "generic", root = defaultRoot } = {}) {
  const normalizedClient = normalizeClient(client);
  const absoluteRoot = path.resolve(root || defaultRoot);
  const profile = buildInstallAdoptionProfile({ client: normalizedClient, root: absoluteRoot });
  return {
    client: normalizedClient,
    root: absoluteRoot,
    generated_profile_files: profile.files.map((file) => file.path),
    required_servers: [
      { name: "vnem", transport: "stdio", script: path.join(absoluteRoot, "scripts", "vnem-mcp-server.mjs") },
      { name: "vnem-tools", transport: "stdio", script: path.join(absoluteRoot, "scripts", "vnem-tools-mcp-server.mjs") }
    ],
    steps: [
      "Run node scripts/vnem-install-adoption.mjs emit --client <client> or emit --all.",
      "Merge/import the emitted profile into the client settings; do not replace unrelated existing MCP config.",
      "Reload the client if it caches MCP servers.",
      "Verify Core exposes vnem_install_adoption_guide and Tools exposes vnem_tools_install_doctor.",
      "Call vnem_entrypoint first for repo/code/proof tasks, then route execution through vnem-tools."
    ],
    safety: safetySummary(),
    safe_next_step: `Run node scripts/vnem-install-adoption.mjs emit --client ${normalizedClient} && node scripts/vnem-install-adoption.mjs doctor`
  };
}

export function formatInstallAdoptionGuide(guide) {
  return [
    `vnem_install_adoption_guide: ${guide.client}`,
    `root=${guide.root}`,
    `servers=${guide.required_servers.map((server) => `${server.name}:${server.transport}`).join(", ")}`,
    `files=${guide.generated_profile_files.join(", ")}`,
    `next=${guide.safe_next_step}`,
    `not_proven=${guide.safety.not_proven.join("; ")}`
  ].join("\n");
}

export function formatInstallProfileEmit(result) {
  return [
    `vnem_tools_install_profile_emit: ${result.client || result.clients?.join(",")}`,
    `servers=${result.servers.join(", ")}`,
    `outside_repo_writes=${result.outside_repo_writes}`,
    `files=${result.written_files.join(", ")}`,
    `next=${result.safe_next_step}`
  ].join("\n");
}

export function formatInstallDoctor(report) {
  const failed = report.checks.filter((check) => !check.ok);
  return [
    `vnem_tools_install_doctor: ${report.status}`,
    `root=${report.root}`,
    `checks=${report.checks.filter((check) => check.ok).length}/${report.checks.length}`,
    `failed=${failed.map((check) => check.id).join(", ") || "none"}`,
    `next=${report.safe_next_step}`,
    `not_proven=${report.what_is_not_proven.join("; ")}`
  ].join("\n");
}

function buildMcpServersConfig(root, { portable = false } = {}) {
  const absoluteRoot = path.resolve(root || defaultRoot);
  const configRoot = portable ? portableCheckout : absoluteRoot;
  const joinConfigPath = (...parts) => portable ? [configRoot, ...parts].join("/") : path.join(absoluteRoot, ...parts);
  return {
    vnem: {
      command: portable ? "node" : process.execPath,
      args: [joinConfigPath("scripts", "vnem-mcp-server.mjs")],
      cwd: configRoot,
      transport: "stdio",
      env: {
        VNEM_ROOT: configRoot
      }
    },
    "vnem-tools": {
      command: portable ? "node" : process.execPath,
      args: [joinConfigPath("scripts", "vnem-tools-mcp-server.mjs")],
      cwd: configRoot,
      transport: "stdio",
      env: {
        VNEM_TOOLS_ALLOWED_ROOTS: configRoot,
        VNEM_TOOLS_EVIDENCE_ROOT: joinConfigPath(".vnem", "tool-runs"),
        VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1",
        VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH: "0",
        VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH: "0",
        VNEM_TOOLS_GITHUB_ALLOW_REPO_DELETE: "0",
        VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION: "0"
      }
    }
  };
}

function codexTomlSnippet(serverConfig, root, { portable = false } = {}) {
  const lines = [
    "# VNEM Codex MCP snippet.",
    "# Merge these tables into your existing Codex config.toml; do not replace unrelated settings.",
    "# This file is repo-local guidance only. It does not write to a Codex config path.",
    portable ? "# Portable template: replace ${VNEM_CHECKOUT} with the absolute checkout path, or run the local emitter." : "# Local profile: absolute paths were resolved by the emitter on this machine.",
    "# Verify local CLI syntax with `codex mcp --help` before using any codex mcp command.",
    "",
    "[mcp_servers.vnem]",
    `command = ${tomlString(serverConfig.vnem.command)}`,
    `args = [${serverConfig.vnem.args.map(tomlString).join(", ")}]`,
    `cwd = ${tomlString(root)}`,
    `transport = ${tomlString("stdio")}`,
    "",
    "[mcp_servers.vnem.env]",
    `VNEM_ROOT = ${tomlString(serverConfig.vnem.env.VNEM_ROOT)}`,
    "",
    "[mcp_servers.vnem-tools]",
    `command = ${tomlString(serverConfig["vnem-tools"].command)}`,
    `args = [${serverConfig["vnem-tools"].args.map(tomlString).join(", ")}]`,
    `cwd = ${tomlString(root)}`,
    `transport = ${tomlString("stdio")}`,
    "",
    "[mcp_servers.vnem-tools.env]",
    ...Object.entries(serverConfig["vnem-tools"].env).map(([key, value]) => `${key} = ${tomlString(value)}`),
    ""
  ];
  return lines.join("\n");
}

function codexReadme(root, nodeCommand, { portable = false } = {}) {
  return [
    "# Codex VNEM MCP Profile",
    "",
    "Use `config-snippet.toml` as a merge snippet. Do not replace the whole Codex config file, and do not overwrite unrelated MCP servers.",
    "",
    "This kit does not guess the Codex config path. It emits repo-local guidance only.",
    portable ? "This tracked file is a portable template. Replace `${VNEM_CHECKOUT}` with the absolute VNEM checkout path, or run `node scripts/vnem-install-adoption.mjs emit --client codex` from a checkout to generate a local profile." : "This file is a local generated profile with machine-resolved paths.",
    "",
    "Suggested flow:",
    "",
    "1. Review `config-snippet.toml`.",
    "2. Merge the `mcp_servers.vnem` and `mcp_servers.vnem-tools` tables into your active Codex MCP configuration.",
    "3. If your installed Codex CLI supports MCP management, run `codex mcp --help` first and use only the syntax it documents locally.",
    "4. Reload Codex, then verify the tool list includes `vnem_install_adoption_guide` and `vnem_tools_install_doctor`.",
    "",
    "Rollback: remove only the two added `mcp_servers` tables from your Codex config and reload the client.",
    "",
    `Repo root: ${root}`,
    `Node command: ${nodeCommand}`,
    portable ? "Node version: resolved by the target client environment" : `Node version: ${process.version}`,
    "Transport: stdio",
    "Servers: vnem, vnem-tools",
    "Secrets: none are embedded in this profile.",
    ""
  ].join("\n");
}

function clientReadme(client, root, nodeCommand, { portable = false } = {}) {
  const title = {
    claude: "Claude VNEM MCP Profile",
    antigravity: "Antigravity-Style VNEM MCP Profile",
    generic: "Generic MCP Stdio VNEM Profile"
  }[client];
  const notes = {
    claude: [
      "Use `mcp.json` as a project-safe MCP JSON object using the `mcpServers` shape.",
      "This kit does not claim a universal Claude or Claude Desktop path. Import or copy the JSON into the settings location documented by your installed Claude-style client."
    ],
    antigravity: [
      "Use `mcp.json` as a generic/importable MCP stdio JSON profile.",
      "This kit does not claim an Antigravity universal config path. Import or copy the JSON through your IDE or agent MCP settings UI."
    ],
    generic: [
      "Use `mcp.json` with any MCP stdio client that accepts a `mcpServers` object.",
      "If your client uses a different key name, translate the two server objects without changing command, args, cwd, env, or transport."
    ]
  }[client];
  return [
    `# ${title}`,
    "",
    ...notes,
    "",
    portable ? "This tracked file is a portable template. Replace `${VNEM_CHECKOUT}` with the absolute VNEM checkout path, or run the local emitter for this client." : "This file is a local generated profile with machine-resolved paths.",
    "",
    "Both VNEM MCP servers are included:",
    "",
    "- `vnem`: Core MCP for routing, planning, proof contracts, and install guidance.",
    "- `vnem-tools`: Tools MCP for safe repo/code/debug/test/GitHub/proof actions.",
    "",
    "Verification after import:",
    "",
    "1. Reload the client if required.",
    "2. Confirm the client lists `vnem_entrypoint` and `vnem_install_adoption_guide`.",
    "3. Confirm the client lists `vnem_tools_entrypoint`, `vnem_tools_install_profile_emit`, and `vnem_tools_install_doctor`.",
    "4. Run the install doctor through the Tools MCP or locally with `node scripts/vnem-install-adoption.mjs doctor`.",
    "",
    `Repo root: ${root}`,
    `Node command: ${nodeCommand}`,
    portable ? "Node version: resolved by the target client environment" : `Node version: ${process.version}`,
    "Transport: stdio",
    "Secrets: none are embedded in this profile.",
    ""
  ].join("\n");
}

function buildAgentUseInstruction() {
  return [
    "# VNEM Agent Use Instruction",
    "",
    "When VNEM Core and VNEM Tools MCP are available, use them naturally for repo, code, debugging, testing, GitHub, CI, proof, recovery, MCP, and generated-artifact work.",
    "",
    "- Call `vnem_entrypoint` first for repo/code/proof tasks.",
    "- Use Core MCP for routing, planning, quality gates, proof contracts, and deciding which Tools calls are needed.",
    "- Use Tools MCP for bounded actions: repo inspection, code search, patch targeting, dry-run/action planning, tests, GitHub/CI proof, local session recovery, evidence packs, and install doctor checks.",
    "- Do not claim a file change, command result, PR, remote SHA, CI status, browser proof, or install success without direct evidence.",
    "- If VNEM Core or Tools MCP is missing in the current client, say it is unavailable and continue with normal safe local evidence instead of inventing tool calls.",
    "- Keep final handoffs compact and include what is proven, what is not proven, and the exact next safe task.",
    ""
  ].join("\n");
}

function buildStaticDoctorSeed(root, { portable = false } = {}) {
  return {
    schema_version: "1.0.0",
    status: "run-doctor-to-refresh",
    root: portable ? portableCheckout : path.resolve(root || defaultRoot),
    portable_template: portable,
    clients,
    servers: serverNames,
    note: "Run node scripts/vnem-install-adoption.mjs doctor to refresh this repo-local report."
  };
}

function expectedInstallAdoptionFiles() {
  return [
    path.join(outputBase, "codex", "config-snippet.toml"),
    path.join(outputBase, "codex", "README.md"),
    path.join(outputBase, "claude", "mcp.json"),
    path.join(outputBase, "claude", "README.md"),
    path.join(outputBase, "antigravity", "mcp.json"),
    path.join(outputBase, "antigravity", "README.md"),
    path.join(outputBase, "generic", "mcp.json"),
    path.join(outputBase, "generic", "README.md"),
    path.join(outputBase, "prompts", "vnem-agent-use-instruction.md"),
    path.join(outputBase, "verify", "install-doctor-report.json")
  ];
}

async function writeProfileFiles(root, files) {
  const absoluteRoot = path.resolve(root || defaultRoot);
  for (const file of files) {
    const absolutePath = path.resolve(absoluteRoot, file.path);
    if (!isInside(absolutePath, absoluteRoot)) throw new Error(`Refusing to write outside repo: ${file.path}`);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content, "utf8");
  }
}

async function readInstallAdoptionTexts(root) {
  const absoluteBase = path.join(root, outputBase);
  if (!existsSync(absoluteBase)) return [];
  const files = [];
  await walkTextFiles(absoluteBase, files);
  const result = [];
  for (const file of files) {
    result.push({ path: path.relative(root, file), content: await readFile(file, "utf8") });
  }
  return result;
}

async function walkTextFiles(dir, results) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkTextFiles(absolute, results);
    } else if (entry.isFile() && /\.(json|toml|md|txt)$/i.test(entry.name)) {
      results.push(absolute);
    }
  }
}

function profilesIncludeBothMcps(root) {
  for (const client of ["claude", "antigravity", "generic"]) {
    const file = path.join(root, outputBase, client, "mcp.json");
    if (!parsesJson(file)) return false;
    const data = JSON.parse(execRead(file));
    if (!data.mcpServers?.vnem || !data.mcpServers?.["vnem-tools"]) return false;
  }
  const codex = execRead(path.join(root, outputBase, "codex", "config-snippet.toml"));
  return /\[mcp_servers\.vnem\]/.test(codex) && /\[mcp_servers\.vnem-tools\]/.test(codex);
}

function launchCommandsPlausible(root) {
  for (const client of ["claude", "antigravity", "generic"]) {
    const file = path.join(root, outputBase, client, "mcp.json");
    if (!parsesJson(file)) return false;
    const data = JSON.parse(execRead(file));
    for (const name of serverNames) {
      const server = data.mcpServers?.[name];
      if (!server || server.command !== process.execPath || server.cwd !== root || server.transport !== "stdio") return false;
      if (!server.args?.every((arg) => existsSync(arg))) return false;
    }
  }
  return true;
}

function windowsEscapingValid(root) {
  const toml = execRead(path.join(root, outputBase, "codex", "config-snippet.toml"));
  return toml.includes("\\\\") || !root.includes("\\");
}

function nodeCheck(filePath) {
  if (!existsSync(filePath)) return false;
  try {
    execFileSync(process.execPath, ["--check", filePath], { cwd: path.dirname(filePath), stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function sourceRegistersTool(source, tool) {
  return new RegExp(`registerTool\\(\\s*["']${escapeRegExp(tool)}["']`).test(source) || new RegExp(`["']${escapeRegExp(tool)}["']`).test(source);
}

function parsesJson(filePath) {
  try {
    JSON.parse(execRead(filePath));
    return true;
  } catch {
    return false;
  }
}

function tomlSnippetPlausible(filePath) {
  if (!existsSync(filePath)) return false;
  const text = execRead(filePath);
  return /\[mcp_servers\.vnem\]/.test(text) &&
    /\[mcp_servers\.vnem-tools\]/.test(text) &&
    /command = ".+"/.test(text) &&
    /args = \[".+"]/s.test(text) &&
    /Merge these tables/.test(text);
}

function execRead(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function normalizeClient(client) {
  const normalized = String(client || "generic").toLowerCase();
  if (!clients.includes(normalized)) throw new Error(`Unsupported client: ${client}. Expected one of ${clients.join(", ")}`);
  return normalized;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function toPortable(value) {
  return value.split(path.sep).join("/");
}

function isInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safetySummary() {
  return {
    default_mode: "repo-local-emit-only",
    outside_repo_writes: false,
    overwrite_external_config: false,
    secrets_embedded: false,
    transport: "stdio",
    not_proven: [
      "client-specific config path",
      "client has reloaded MCP settings",
      "remote/network/GitHub auth inside downstream clients"
    ]
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  const root = path.resolve(valueAfter(args, "--root") || defaultRoot);
  if (command === "emit") {
    const result = args.includes("--all")
      ? await emitAllInstallAdoptionProfiles({ root })
      : await emitInstallAdoptionProfile({ client: valueAfter(args, "--client") || "generic", root });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "doctor" || command === "verify") {
    const report = await installAdoptionDoctor({ root, emit: command === "doctor" || args.includes("--emit"), writeReport: true });
    if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else console.log(formatInstallDoctor(report));
    if (report.status !== "pass") process.exitCode = 1;
  } else if (command === "plan") {
    const guide = buildInstallAdoptionGuide({ client: valueAfter(args, "--client") || "generic", root });
    console.log(JSON.stringify(guide, null, 2));
  } else if (command === "help" || command === "--help" || command === "-h") {
    console.log([
      "Usage:",
      "  node scripts/vnem-install-adoption.mjs emit --client codex|claude|antigravity|generic",
      "  node scripts/vnem-install-adoption.mjs emit --all",
      "  node scripts/vnem-install-adoption.mjs plan --client codex",
      "  node scripts/vnem-install-adoption.mjs doctor [--json]",
      "  node scripts/vnem-install-adoption.mjs verify [--json]",
      "",
      "Default behavior writes only repo-local files under .vnem/install-adoption."
    ].join("\n"));
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`vnem-install-adoption: ${error.message}`);
    process.exitCode = 1;
  });
}
