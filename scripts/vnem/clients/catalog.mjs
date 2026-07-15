import os from "node:os";
import path from "node:path";

const SUPPORTED_PLATFORMS = ["win32", "linux", "darwin"];

export function clientCatalog(options = {}) {
  const platform = normalizePlatform(options.platform || process.platform);
  const home = path.resolve(options.home || os.homedir());
  const workspace = path.resolve(options.workspace || process.cwd());
  const appData = options.appData || (platform === "win32" ? path.join(home, "AppData", "Roaming") : null);
  const localAppData = options.localAppData || (platform === "win32" ? path.join(home, "AppData", "Local") : null);

  return [
    descriptor({
      id: "codex_app",
      displayName: "Codex App",
      priority: 1,
      configFormat: "codex-toml",
      configPath: path.join(home, ".codex", "config.toml"),
      instructionPath: path.join(workspace, "AGENTS.md"),
      commands: ["codex"],
      installPaths: compact([
        localAppData && path.join(localAppData, "Programs", "Codex", "Codex.exe"),
        platform === "darwin" && "/Applications/Codex.app"
      ]),
      support: "direct-merge",
      proofLevel: "official-documented-and-local-verified",
      reload: "In Codex App, open Settings > MCP servers and select Restart. Then open a new task and inspect the MCP server list.",
      source: "https://developers.openai.com/codex/mcp"
    }),
    descriptor({
      id: "codex_cli",
      displayName: "Codex CLI",
      priority: 2,
      configFormat: "codex-toml",
      configPath: path.join(home, ".codex", "config.toml"),
      instructionPath: path.join(workspace, "AGENTS.md"),
      commands: ["codex"],
      support: "direct-merge",
      proofLevel: "official-documented-and-local-verified",
      reload: "Restart the Codex CLI, then run /mcp or codex mcp list to inspect active servers.",
      source: "https://developers.openai.com/codex/mcp"
    }),
    descriptor({
      id: "claude_code",
      displayName: "Claude Code",
      priority: 3,
      configFormat: "json-mcp-servers",
      configPath: path.join(workspace, ".mcp.json"),
      instructionPath: path.join(workspace, "CLAUDE.md"),
      commands: ["claude"],
      support: "project-merge",
      proofLevel: "official-documented-fixture-verified",
      reload: "Restart Claude Code in this project, then run /mcp or claude mcp list.",
      source: "https://docs.anthropic.com/en/docs/claude-code/mcp"
    }),
    descriptor({
      id: "claude_desktop",
      displayName: "Claude Desktop",
      priority: 4,
      configFormat: "json-mcp-servers",
      configPath: claudeDesktopPath({ platform, home, appData }),
      installPaths: compact([
        localAppData && path.join(localAppData, "Programs", "Claude", "Claude.exe"),
        platform === "darwin" && "/Applications/Claude.app"
      ]),
      support: "direct-merge",
      proofLevel: "official-documented-fixture-verified",
      reload: "Fully quit and restart Claude Desktop, then inspect its MCP integrations.",
      source: "https://docs.anthropic.com/en/docs/mcp"
    }),
    descriptor({
      id: "antigravity",
      displayName: "Antigravity",
      priority: 5,
      commands: ["antigravity"],
      support: "import-profile",
      proofLevel: "profile-only-unverified-client-contract",
      profilePath: path.join(workspace, ".vnem", "client-profiles", "antigravity", "mcp.json"),
      reload: "Import the generated profile through the client's documented MCP settings, then restart the client.",
      caveat: "No current official configuration contract was verified; VNEM will not guess a global path."
    }),
    descriptor({
      id: "generic_stdio",
      displayName: "Generic MCP stdio",
      priority: 6,
      configFormat: "json-mcp-servers",
      support: "import-profile",
      proofLevel: "protocol-and-fixture-verified",
      profilePath: path.join(workspace, ".vnem", "client-profiles", "generic", "mcp.json"),
      reload: "Import the generated stdio profile using the client's own MCP configuration flow, then restart or reload that client.",
      source: "https://modelcontextprotocol.io/docs/develop/connect-local-servers"
    }),
    descriptor({
      id: "hermes",
      displayName: "Hermes",
      priority: 7,
      commands: ["hermes", "hermes-agent"],
      instructionPath: path.join(workspace, "AGENTS.md"),
      support: "import-profile",
      proofLevel: "cli-detected-profile-only",
      profilePath: path.join(workspace, ".vnem", "client-profiles", "hermes", "mcp.json"),
      reload: "Import the generated profile using the installed Hermes version's MCP flow, then restart Hermes.",
      caveat: "The local CLI can be detected, but a stable global MCP config contract was not verified."
    }),
    descriptor({
      id: "cursor",
      displayName: "Cursor",
      priority: 8,
      configFormat: "json-mcp-servers",
      configPath: path.join(home, ".cursor", "mcp.json"),
      commands: ["cursor", "cursor-agent"],
      installPaths: compact([
        localAppData && path.join(localAppData, "Programs", "cursor", "Cursor.exe"),
        platform === "darwin" && "/Applications/Cursor.app"
      ]),
      support: "direct-merge",
      proofLevel: "official-documented-fixture-verified",
      reload: "Restart Cursor and inspect Settings > MCP before using the servers.",
      source: "https://docs.cursor.com/context/model-context-protocol"
    }),
    descriptor({
      id: "windsurf",
      displayName: "Windsurf",
      priority: 9,
      commands: ["windsurf"],
      support: "import-profile",
      proofLevel: "profile-only-unverified-client-contract",
      profilePath: path.join(workspace, ".vnem", "client-profiles", "windsurf", "mcp.json"),
      reload: "Import the generated profile through Windsurf's current MCP settings, then restart Windsurf.",
      caveat: "VNEM does not write a global Windsurf path without a verified current contract."
    }),
    descriptor({
      id: "cline",
      displayName: "Cline",
      priority: 10,
      support: "import-profile",
      proofLevel: "profile-only-unverified-client-contract",
      profilePath: path.join(workspace, ".vnem", "client-profiles", "cline", "mcp.json"),
      reload: "Import the profile through Cline's MCP Servers UI, then reload the extension host if requested.",
      caveat: "Extension storage is client-managed, so VNEM will not edit it directly."
    }),
    descriptor({
      id: "gemini_cli",
      displayName: "Gemini CLI",
      priority: 11,
      configFormat: "json-mcp-servers",
      configPath: path.join(home, ".gemini", "settings.json"),
      commands: ["gemini"],
      support: "direct-merge",
      proofLevel: "official-documented-fixture-verified",
      reload: "Restart Gemini CLI in a trusted folder, then run gemini mcp list.",
      source: "https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md"
    })
  ];
}

export function catalogById(options = {}) {
  return new Map(clientCatalog(options).map((client) => [client.id, client]));
}

export function supportedClientIds() {
  return clientCatalog({ home: path.parse(process.cwd()).root, workspace: process.cwd() }).map((client) => client.id);
}

function descriptor(input) {
  return {
    configFormat: null,
    configPath: null,
    instructionPath: null,
    profilePath: null,
    commands: [],
    installPaths: [],
    source: null,
    caveat: null,
    platforms: [...SUPPORTED_PLATFORMS],
    ...input
  };
}

function claudeDesktopPath({ platform, home, appData }) {
  if (platform === "win32") return path.join(appData, "Claude", "claude_desktop_config.json");
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  return path.join(home, ".config", "Claude", "claude_desktop_config.json");
}

function normalizePlatform(platform) {
  if (!SUPPORTED_PLATFORMS.includes(platform)) throw new Error(`Unsupported platform: ${platform}`);
  return platform;
}

function compact(values) {
  return values.filter(Boolean);
}
