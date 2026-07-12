# VNEM Safety

VNEM is safe by default and can gain bounded power by explicit user choice. The default `safe-readonly` profile permits project inspection but no writes, commands, external reads, or account mutation.

## Safety Command

Open the interactive profile editor:

```text
vnem safety
```

Useful noninteractive forms:

```text
vnem safety --status --json
vnem safety --list-profiles --json
vnem safety --profile safe-local-dev --root <project>
vnem safety --profile safe-local-dev --root <project> --yes
vnem safety --profile expert --root <project> --session --yes
vnem safety --doctor --root <project> --json
vnem safety --rollback --root <project> --yes
```

Without `--yes`, profile changes return a preview and do not write. Persistent changes write `<project>/.vnem/safety.json`, back up the previous config under `<project>/.vnem/safety-backups/`, and can be rolled back. Session-only changes are not written.

## Profiles

- `safe-readonly`: bounded local inspection only.
- `safe-local-dev`: approved tests, builds, local servers, bounded scripts, browser proof, and direct-source reads.
- `approved-writes`: local patches, transactional restores, and local commits with approval and evidence.
- `approved-installs`: compatibility profile for future vetted repository-local dependency installation.
- `approved-github`: compatibility profile for approved feature-branch GitHub workflows.
- `creator-power`: broad creator/developer work with hard protections intact.
- `maintainer`: repository maintenance, CI, feature-branch GitHub work, and release preparation.
- `expert`: broad approved development and operations with evidence and rollback.
- `custom`: explicit user-selected actions; hard blocks cannot be enabled.
- `dangerous-disabled`: disables all actions.

## Scoped Grants

Tools MCP can request one narrow grant using `vnem_tools_permission_request`, then activate it with `vnem_tools_permission_grant` only after the exact generated acknowledgment matches. A grant can be limited by:

- action;
- path prefix;
- repository and branch;
- provider or domain;
- session or persistent lifetime;
- expiry up to 24 hours.

Calls inside an active exact scope do not require repeated approval. Calls outside it continue to use the active profile. Grants can be checked with `vnem_tools_permission_evaluate`, revoked with `vnem_tools_permission_revoke`, and audited with `vnem_tools_permission_doctor`.

## Hard Blocks

No profile or scoped grant can silently enable secret output, credential theft, cookie/session extraction, unknown malware execution, repository deletion, force-push, catastrophic root deletion, protected-branch writes, hidden persistence, security-product disabling, silent telemetry, package publishing, CAPTCHA bypass, or unrestricted crawling.
