# vnem Visual QA Protocol

Generated: 2026-06-11T11:56:42.965Z

A compact rendered-quality loop for UI, game, dashboard, canvas, motion, sound, and brand-facing work. Use it to make aesthetic inspection and screenshot evidence part of done.

## Safety Boundary

- This file is read-only guidance.
- Do not treat it as a browser automation script, screenshot daemon, design runtime, generated asset pack, or install recipe.
- Use it only when the task has a visible, interactive, motion, sound, dashboard, canvas, or brand-facing surface.
- Ask before fetching remote assets, calling generation services, adding UI dependencies, changing client config, or using copyrighted media.

## Verdicts

- `ship-quality`: rendered evidence shows a polished, proportional, readable, responsive first screen and key interaction.
- `needs-polish`: the behavior works, but the visible surface still has fixable aesthetic, scale, spacing, motion, sound, or reference-fidelity issues.
- `blocked`: evidence cannot be gathered or the visible result has obvious ugliness, unreadable text, oversized surfaces, broken mobile fit, noisy effects, or inaccessible motion/audio.

## Repo-First Sensing

- Before visual edits, inspect the repo for existing assets, public images, fonts, icons, screenshots, CSS variables, Tailwind/theme config, design tokens, layout components, and current routes.
- Use local reference assets and established component/style conventions before inventing new visuals or adding dependencies.
- If the user supplied images or brand files, translate their palette, texture, silhouette, mood, and focal elements into the interface instead of pasting unrelated decoration.
- Do not fetch remote media, call generation services, add UI libraries, or use copyrighted assets without explicit approval.

## Rendered QA Loop

- Serve or open the actual app surface when possible; static code inspection is not enough for visual work.
- Inspect desktop and mobile states and check that text, controls, canvas, hero, cards, and HUD elements fit without overlap or awkward scale.
- Name the single ugliest visible issue after inspection, fix it, then re-check before claiming ship-quality.
- Check that performance fixes did not silently strip visual quality, interaction feedback, playability, accessibility, or settings/fallback controls.
- Use the verdicts `ship-quality`, `needs-polish`, or `blocked`; do not call a surface done when the first screen is ugly, oversized, unreadable, or mismatched to the reference.

## Interaction Moment

- For games and interactive tools, verify one meaningful interaction or reward moment, not only the initial screen.
- Reward glow, particles, score pulses, flashes, and audio must originate from the event location or user action unless the design intentionally explains a global effect.
- Keep flashes restrained, motion readable, and sound short, pleasant, throttled, and muteable.
- Check reduced-motion behavior for motion-heavy surfaces and audio unlock/mute behavior when sound is present.

## Final Evidence Contract

- Report the visual route used, the perception verdict, the ugliest issue found and fixed, and the verification evidence.
- For successful delivery, mention desktop screenshot or inspection, mobile screenshot or inspection, and interaction/reward evidence when applicable.
- If browser or screenshot verification cannot run, say exactly what could not be verified and mark the remaining polish risk.
- Keep the evidence concise; the goal is to prove the artifact was seen, not to write a design essay.

## Related Files

- `.vnem/design-architecture.md`: source-backed design architecture and guidance classification.
- `.vnem/operating-protocol.md`: universal Sense -> Route -> Choose -> Constrain -> Quality Gate -> Build/Review/Debug -> Verify -> Report loop.
- `.vnem/quality-contract.md`: holistic excellence and intelligent trade-off policy.
- `.vnem/task-rubrics.json`: task-specific quality bars and verification contracts.
