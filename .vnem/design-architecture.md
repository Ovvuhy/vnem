# vnem Design Architecture

Generated: 2026-05-30T14:32:16.710Z

Source-backed design intelligence for UI, game, visual, dashboard, and conversational-agent work. Use it to make aesthetics a delivery requirement, not a decoration pass.

## Safety Boundary

- This file is read-only guidance.
- Do not treat it as a UI library, style runtime, generated asset pack, or install recipe.
- Use it only after task routing shows the work is visual, interactive, dashboard, agent UI, game, animation, or brand-facing.
- Keep third-party assets, paid image/audio generation, remote media fetches, and design-system dependency changes behind explicit user approval.

## Source Posture

- Hard guidance is grounded in current browser and accessibility sources such as MDN CSS, Web Audio, reduced-motion media queries, and W3C WCAG 2.2.
- WCAG 3 and APCA-style contrast work are watchlist/directional only in this pack; do not present them as final normative requirements.
- The user-provided UI research is directional input, not source-backed benchmark evidence.

## Guidance Classification

### standard

- Use W3C WCAG 2.2 and current accessibility guidance as the hard baseline for contrast, focus visibility, non-color cues, labels, keyboard access, and reduced-motion accommodations.
- Treat browser feature behavior from MDN and linked specifications as source-backed capability guidance, then verify in the target browser when the effect matters.

### browser capability

- CSS Grid, `repeat()`, `minmax()`, `clamp()`, container queries, `backdrop-filter`, Web Audio, and `prefers-reduced-motion` are browser primitives to use deliberately, with fallbacks when support or accessibility matters.
- Browser capabilities are implementation tools, not proof that a design is good; rendered screenshots and interaction checks still decide the perception verdict.

### heuristic

- 8-point spacing, bento topology, optical alignment, grayscale-first hierarchy, modular type scales, layered shadows, dark-mode surface ladders, and motion timing windows are design heuristics.
- Use heuristics to produce better taste and consistency, but allow repo conventions, brand references, accessibility, and actual screenshots to override them.

### watchlist

- WCAG 3 and APCA-style contrast work are draft/watchlist material in this pack, useful for future-facing review but not encoded as normative compliance.
- Do not report APCA numeric targets as required pass/fail criteria unless the project explicitly adopts them.

## Delivery Rule

- A visual surface is not complete just because it builds or responds to input. It must pass a perception gate in a real rendered state.
- Visual quality, performance, playability, accessibility, and maintainability must be balanced together; do not make the interface faster by making it feel unfinished.
- Ship-quality means the first screen looks intentional, readable, proportional, responsive, and aligned with the user's reference or domain.
- Needs-polish means the core behavior works but visual balance, scale, contrast, motion, sound, or reference fidelity is visibly weak.
- Blocked means browser evidence shows obvious ugliness, unreadable content, oversized canvases, noisy effects, inaccessible motion/audio, or mismatched assets.

## Perceptual Hierarchy And Optical Alignment

- Build hierarchy with contrast, weight, spacing, and color role before simply making everything larger.
- Use muted icon color or weight to keep dense icons from overpowering adjacent text.
- Prefer perceived alignment over bounding-box math for asymmetric icons, play triangles, punctuation, badges, and visually heavy shapes.
- Start complex surfaces in grayscale when hierarchy is unclear; add color after the reading order works without it.

## Spacing And Grid Rhythm

- Use the repo's existing spacing tokens first. When none exist, prefer an 8-point scale for layout, padding, gaps, and stable rhythm.
- Keep internal component padding less than or equal to the external space separating unrelated groups.
- For dashboards and dense agent UIs, use CSS Grid for two-dimensional layouts instead of forcing row/column spans through Flexbox.
- Use bento grids only when spatial size communicates priority; avoid them for long-form reading or strictly sequential workflows.

## Typography

- Use readable body sizes and line heights. Large display text can use tighter line height; body copy needs looser line height for scanning.
- Use `clamp()` for bounded fluid typography when text must scale smoothly across viewports.
- Use container queries or container query units when a component's typography should respond to its own container rather than the whole viewport.
- Do not use viewport-only type scaling that makes compact panels, cards, or mobile views feel oversized.

## Material, Depth, And Glass

- Use shadows, highlights, and translucent materials to clarify depth, not to decorate every surface.
- Use `backdrop-filter` glass only when text remains readable and a solid or higher-opacity fallback is available.
- Layered shadows and glows should support state, focus, or brand atmosphere without muddying the interface.
- In dark mode, prefer deep neutral surfaces over pure black for large areas, and use surface luminance, borders, or subtle glow to show elevation.

## Color And Accessibility

- Use current WCAG/W3C guidance as the hard accessibility baseline for contrast, focus visibility, input targets, reduced motion, and non-color cues.
- Treat WCAG 3 and APCA-style contrast ideas as watchlist and review material until the relevant W3C algorithm is finalized.
- Desaturate intense accents in dark environments when they vibrate or damage readability.
- Do not let glow, blur, gradients, glass, or image backgrounds reduce text contrast below an acceptable reading level.

## Motion, Sound, And Game Feel

- Immediate interaction feedback should feel fast; longer transitions must explain spatial movement or state change.
- Prefer natural easing, short durations, and reduced-motion fallbacks for nonessential animation.
- Reward effects must originate at the user action or game event. A center flash is wrong unless the center is the event.
- Sound should be short, pleasant, throttled, and muteable. Constant movement ticks or harsh tones are ship blockers unless intentionally subtle.

## Conversational And Agent UI

- Use sequential disclosure for chat, but hand off complex evidence into compact cards, tables, or micro-dashboards instead of long text walls.
- Reduce verification debt by showing sources, steps, confidence, and checks in a readable evidence layer.
- Agent dashboards should make current state, next action, approval need, and verification evidence visible without overwhelming the first screen.
- Use bento or card layouts for evidence only when they improve scanability and priority, not because every agent response needs a card.

## Verification Checklist

- Capture or inspect desktop and mobile screenshots before final for meaningful visual work.
- Check one interaction or reward moment, not only the static initial state.
- Check reduced-motion behavior for motion-heavy work and mute/audio unlock behavior for sound.
- Name the ugliest visible issue after inspection and fix it before reporting ship-quality.

## Source URLs

- https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/repeat
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/clamp
- https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- https://www.w3.org/TR/WCAG22/
- https://www.w3.org/TR/wcag-3.0/
