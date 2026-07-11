# VNEM GIGA Baseline Repository Audit

Captured from `b585a0edf52136c9000da33f41593da78963b31a` on `feat/vnem-giga-evolution-1`.

## Inventory

| Category | Files | Bytes |
| --- | ---: | ---: |
| client/install profiles | 20 | 19288 |
| configuration | 3 | 282335 |
| dashboard/ARD | 63 | 798069 |
| deployment | 10 | 17111 |
| documentation | 293 | 719362 |
| generated binary/archive | 10 | 13194905 |
| generated text | 13 | 5798269 |
| obsolete or suspicious duplication | 14 | 30063 |
| primary source | 93 | 3736708 |
| registry/capability data | 232 | 3622906 |
| runtime state that should not be tracked | 6 | 125733 |
| tests | 144 | 934281 |
| website/public assets | 5 | 55249 |

## Current Architecture

Three stdio MCP server entry files contain transport composition and substantial domain behavior; shared helpers live under scripts/lib; generated install/API/search outputs are committed.

### Monoliths

- `scripts/vnem-mcp-server.mjs`: 6547 lines, 384921 bytes
- `scripts/vnem-tools-mcp-server.mjs`: 8763 lines, 692881 bytes
- `scripts/generate-artifacts.mjs`: 5796 lines, 365721 bytes

### Findings That Feed Implementation

- P0: Core and Tools entry files are 6k+ and 8k+ lines; registration, handlers, policy, and formatting are coupled. Next: Introduce shared runtime contracts and authoritative registries before adding domain families.
- P0: Tools metadata is represented in registration blocks, buildToolCatalog, statusObject, and readiness regexes. Next: Make one registry authoritative and derive manifest/readiness from it.
- P0: Precision is a separate server with overlapping patch, command, docs, and verification policy. Next: Move implementation into Tools modules and retain a compatibility shim.
- P1: 14 tests infer behavior partly by scanning server source text. Next: Keep source guards only for static invariants and move behavior proof through SDK calls.
- P1: Generated mirrors and archives have multiple committed destinations. Next: Add one deterministic generation manifest and verify all destinations in one command.
- P1: Client adoption emits profiles but has no unified detect/setup/backup/rollback command. Next: Build vnem setup with explicit preview, backup, validation, and rollback.
- P1: Current entrypoint routing covers generic repo/code/browser/GitHub/Cloudflare work but lacks dedicated Windows, game, Roblox, package, database, API, and skill execution routes. Next: Implement behavior-backed domain modules and add them to the authoritative registry.
- P2: Repeated deep source scans parse the large Tools entry file and test corpus per call. Next: Cache immutable indexes by file metadata and lazy-load heavy modules.

## Proof Boundaries

- The JSON companion classifies every path returned by `git ls-files` and preserves checksums.
- Dead-code entries are heuristic review candidates, not deletion proof.
- Generated archives require the separate deterministic generation check.
- Capability quality and latency are measured by the SDK benchmark and performance artifacts.
