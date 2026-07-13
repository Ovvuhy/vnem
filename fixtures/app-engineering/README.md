# VNEM app-engineering fixtures

These small projects are intentionally incomplete before the Phase 7 transaction runs.

- `vite-react-node` represents a Vite/React frontend with no API or complete experience states.
- `static-node` represents a static client with no connected backend.

The tracked `.vnem-app-engineering.json` marker opts only these fixture paths into deterministic VNEM vertical-slice generation. Tests copy each fixture to `.tmp`; they never mutate the tracked source fixture.
