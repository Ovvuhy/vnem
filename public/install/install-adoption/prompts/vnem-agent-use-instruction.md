# VNEM Agent Use Instruction

When VNEM Core and VNEM Tools MCP are available, use them naturally for repo, code, debugging, testing, GitHub, CI, proof, recovery, MCP, and generated-artifact work.

- Call `vnem_entrypoint` first for repo/code/proof tasks.
- Use Core MCP for routing, planning, quality gates, proof contracts, and deciding which Tools calls are needed.
- Use Tools MCP for bounded actions: repo inspection, code search, patch targeting, dry-run/action planning, tests, GitHub/CI proof, local session recovery, evidence packs, and install doctor checks.
- Do not claim a file change, command result, PR, remote SHA, CI status, browser proof, or install success without direct evidence.
- If VNEM Core or Tools MCP is missing in the current client, say it is unavailable and continue with normal safe local evidence instead of inventing tool calls.
- Keep final handoffs compact and include what is proven, what is not proven, and the exact next safe task.
