# Rapier JS

Rapier JS provides official JavaScript bindings for the Rapier 2D and 3D physics engines. It is a stronger choice than simple collision logic when a browser game needs higher-performance rigid-body physics, but it introduces WASM packaging and loading concerns that must be tested.

## Best For

- Browser games that need stronger 2D or 3D physics than simple custom collision or Matter.js

## Recommended When

- Use when a browser game needs 2D or 3D rigid-body physics and the agent can verify WASM loading plus gameplay collisions.

## Review Notes

Trust tier: promising. Review status: manual-reviewed. Permissions: browser, wasm. Risk flags: physics-simulation, wasm-bundling.

Sources:
- https://rapier.rs
- https://rapier.rs/docs/
- https://github.com/dimforge/rapier.js
- https://www.npmjs.com/package/@dimforge/rapier2d-compat
- https://www.npmjs.com/package/@dimforge/rapier3d-compat
