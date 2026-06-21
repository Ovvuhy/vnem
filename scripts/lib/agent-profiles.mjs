import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PROFILES = {
  schema_version: "vnem-agent-profiles/v0.1",
  generated_at: null,
  profiles: [
    {
      id: "unknown",
      display_name: "Unknown Agent/Model",
      applies_to: ["unknown"],
      known_mcp_support_status: "unknown",
      known_skill_support_status: "unknown",
      function_tool_calling_notes: "Use generic schema/function-calling guidance only; do not assume MCP, skill, filesystem, terminal, or browser support.",
      recommended_vnem_usage_style: ["Return compact task contracts and evidence requirements."],
      strengths: ["can consume compact guidance"],
      weaknesses: ["actual tools and instruction hierarchy are unknown"],
      avoid_instructions: ["Do not provide client-specific setup steps.", "Do not claim unsupported capability."],
      token_efficiency_tips: ["Use compact mode by default."],
      confidence: "low",
      source_urls: []
    }
  ]
};

export async function loadAgentProfiles(rootDir) {
  const filePath = path.join(rootDir, "capabilities", "agent-profiles.json");
  if (!existsSync(filePath)) {
    return { ...DEFAULT_PROFILES, loaded: false, file_path: filePath };
  }
  const data = JSON.parse(await readFile(filePath, "utf8"));
  return {
    ...DEFAULT_PROFILES,
    ...data,
    loaded: true,
    file_path: filePath,
    profiles: Array.isArray(data.profiles) ? data.profiles : DEFAULT_PROFILES.profiles
  };
}

export function getAgentProfile(profilesData, options = {}) {
  const requested = normalize([options.agent_client, options.model_family].filter(Boolean).join(" "));
  const profiles = profilesData?.profiles || DEFAULT_PROFILES.profiles;
  const found = profiles.find((profile) => {
    const applies = (profile.applies_to || []).map(normalize);
    return applies.some((token) => requested === token || requested.includes(token) || token.includes(requested));
  }) || profiles.find((profile) => profile.id === "unknown") || DEFAULT_PROFILES.profiles[0];
  return compactProfile(found, options.token_budget || "compact", options.task);
}

function compactProfile(profile, tokenBudget, task) {
  const expanded = tokenBudget === "expanded";
  const normal = tokenBudget === "normal" || expanded;
  return {
    profile_id: profile.id,
    display_name: profile.display_name,
    applies_to: profile.applies_to || [],
    confidence: profile.confidence || "unknown",
    known_mcp_support_status: profile.known_mcp_support_status || "unknown",
    known_skill_support_status: profile.known_skill_support_status || "unknown",
    function_tool_calling_notes: profile.function_tool_calling_notes,
    recommended_vnem_usage_style: take(profile.recommended_vnem_usage_style, expanded ? 5 : normal ? 3 : 2),
    strengths: take(profile.strengths, expanded ? 5 : 3),
    weaknesses: take(profile.weaknesses, expanded ? 5 : 2),
    avoid_instructions: take(profile.avoid_instructions, expanded ? 5 : normal ? 3 : 2),
    token_efficiency_tips: take(profile.token_efficiency_tips, expanded ? 5 : 2),
    relevant_vnem_rules: [
      "Use Core MCP for read-only task contracts and capability guidance.",
      "Use Precision/Tools MCP only if separately configured and approved."
    ],
    incompatible_or_irrelevant_sections_to_ignore: [
      "Ignore other-client setup instructions unless the requested agent/client matches them.",
      task && !/\bvnem\b/i.test(task) ? "Do not redirect this task into VNEM self-improvement." : null
    ].filter(Boolean),
    source_urls: normal ? (profile.source_urls || []) : take(profile.source_urls, 2)
  };
}

function take(value, limit) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9+#._/-]+/g, " ").replace(/\s+/g, " ").trim();
}
