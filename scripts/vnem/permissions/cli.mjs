import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { PermissionRuntime } from "./runtime.mjs";

export async function runSafetyCommand(rawArgs = [], options = {}) {
  const parsed = parseSafetyArgs(rawArgs);
  const workspaceRoot = path.resolve(parsed.root || process.cwd());
  const runtime = await PermissionRuntime.create({ workspaceRoot, allowedRoots: [workspaceRoot] });

  if (parsed.listProfiles) return emit({ operation: "list_profiles", profiles: runtime.profiles().map(profileSummary) }, parsed.json, options);
  if (parsed.doctor) return emit({ operation: "doctor", ...runtime.doctor() }, parsed.json, options);
  if (parsed.rollback) {
    if (!parsed.yes) return emit({ operation: "rollback_preview", applied: false, reason: "Add --yes to restore the latest safety backup.", status: runtime.status() }, parsed.json, options);
    return emit({ operation: "rollback", applied: true, ...(await runtime.rollbackLatestConfig()) }, parsed.json, options);
  }
  if (parsed.profile) {
    if (!runtime.profiles().some((profile) => profile.profile_name === parsed.profile)) throw new Error(`Unknown permission profile: ${parsed.profile}`);
    const preview = runtime.previewConfig({ ...runtime.config, profile: parsed.profile, custom_allowed_actions: parsed.customActions });
    if (!parsed.yes) return emit({ operation: "profile_preview", applied: false, preview, reason: "Review the preview, then rerun with --yes to save or --session --yes for this process only." }, parsed.json, options);
    const changed = await runtime.setProfile(parsed.profile, { persist: !parsed.session, custom_allowed_actions: parsed.customActions });
    return emit({ operation: "set_profile", applied: true, ...changed }, parsed.json, options);
  }
  if (parsed.status || parsed.json || !isInteractive(options)) return emit({ operation: "status", ...runtime.status() }, parsed.json, options);
  return await interactiveSafety(runtime, options);
}

async function interactiveSafety(runtime, options = {}) {
  const rl = createInterface({ input: options.input || input, output: options.output || output });
  try {
    while (true) {
      printStatus(runtime.status(), options);
      write(options, "\nVNEM Safety\n1. Select profile\n2. Edit custom profile\n3. Doctor\n4. Roll back latest saved configuration\n5. Exit\n");
      const choice = (await rl.question("Choose: ")).trim();
      if (choice === "5" || /^q(?:uit)?$/i.test(choice)) return { operation: "interactive", exited: true, status: runtime.status() };
      if (choice === "3") {
        write(options, `${JSON.stringify(runtime.doctor(), null, 2)}\n`);
        continue;
      }
      if (choice === "4") {
        const confirm = await rl.question("Restore the latest safety backup? Type ROLLBACK: ");
        if (confirm === "ROLLBACK") write(options, `${JSON.stringify(await runtime.rollbackLatestConfig(), null, 2)}\n`);
        else write(options, "Rollback canceled.\n");
        continue;
      }
      if (choice === "1") {
        const profiles = runtime.profiles();
        profiles.forEach((profile, index) => write(options, `${index + 1}. ${profile.profile_name} power=${profile.power_level} risk=${profile.risk_level}\n`));
        const selected = Number.parseInt(await rl.question("Profile number: "), 10) - 1;
        if (!profiles[selected]) {
          write(options, "Invalid profile.\n");
          continue;
        }
        await previewAndSave(runtime, rl, profiles[selected].profile_name, [], options);
        continue;
      }
      if (choice === "2") {
        const known = runtime.profiles().find((profile) => profile.profile_name === "expert")?.allowed_actions || [];
        write(options, `Grantable actions:\n${known.join(", ")}\n`);
        const actions = splitList(await rl.question("Custom allowed actions (comma separated): "));
        await previewAndSave(runtime, rl, "custom", actions, options);
        continue;
      }
      write(options, "Invalid choice.\n");
    }
  } finally {
    rl.close();
  }
}

async function previewAndSave(runtime, rl, profileName, customActions, options) {
  const preview = runtime.previewConfig({ ...runtime.config, profile: profileName, custom_allowed_actions: customActions });
  write(options, `\nPreview:\n${JSON.stringify(preview, null, 2)}\n`);
  const persistence = (await rl.question("Save persistently? [y/N] (N applies for this process only): ")).trim().toLowerCase() === "y";
  const confirm = await rl.question(`Type APPLY ${profileName} to continue: `);
  if (confirm !== `APPLY ${profileName}`) {
    write(options, "Profile change canceled.\n");
    return;
  }
  const result = await runtime.setProfile(profileName, { persist: persistence, custom_allowed_actions: customActions });
  write(options, `Applied ${result.profile.profile_name}; persisted=${result.persisted}; backup=${result.backup || "none"}.\n`);
}

function parseSafetyArgs(args) {
  return {
    root: valueAfter(args, "--root"),
    profile: valueAfter(args, "--profile") || valueAfter(args, "--set-profile"),
    customActions: splitList(valueAfter(args, "--custom-actions") || ""),
    json: args.includes("--json"),
    yes: args.includes("--yes"),
    session: args.includes("--session"),
    status: args.includes("--status"),
    doctor: args.includes("--doctor"),
    rollback: args.includes("--rollback"),
    listProfiles: args.includes("--list-profiles")
  };
}

function profileSummary(profile) {
  return {
    profile_name: profile.profile_name,
    description: profile.description,
    power_level: profile.power_level,
    risk_level: profile.risk_level,
    enabled_categories: Object.entries(profile.capability_categories).filter(([, value]) => value.enabled).map(([name]) => name),
    allowed_actions: profile.allowed_actions,
    hard_blocked_actions: profile.blocked_actions.filter((action) => /force_push|repo_delete|secret|credential|malware|root_level|protected_branch|hidden_persistence|disable_security|telemetry|package_publish/.test(action))
  };
}

function printStatus(status, options) {
  const profile = status.profile;
  write(options, [
    "\nCurrent safety state",
    `Profile: ${profile.profile_name}`,
    `Power level: ${profile.power_level}`,
    `Risk level: ${profile.risk_level}`,
    `Enabled categories: ${Object.entries(profile.capability_categories).filter(([, value]) => value.enabled).map(([name]) => name).join(", ") || "none"}`,
    `Session grants: ${status.session_grants.length}`,
    `Persistent grants: ${status.persistent_grants.length}`,
    `Hard blocks: ${status.hard_blocked_actions.join(", ")}`,
    `Config: ${status.config_path}`,
    `Backups: ${status.backup_root}`
  ].join("\n") + "\n");
}

function emit(value, json, options) {
  if (json) write(options, `${JSON.stringify(value, null, 2)}\n`);
  else if (value.operation === "status") printStatus(value, options);
  else write(options, `${JSON.stringify(value, null, 2)}\n`);
  return value;
}

function isInteractive(options) {
  if (options.interactive !== undefined) return options.interactive;
  return Boolean(input.isTTY && output.isTTY);
}

function write(options, value) {
  (options.output || output).write(String(value));
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function splitList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}
