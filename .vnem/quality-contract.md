# vnem Quality Contract

Generated: 2026-05-31T10:25:48.986Z

A read-only AI-booster contract that forces coding agents to optimize performance, visuals, playability, accessibility, maintainability, and safety together instead of silently sacrificing one domain for another.

## Safety Boundary

- This file is read-only guidance.
- Do not treat it as a runtime optimizer, browser automation script, package installer, settings implementation, or enforcement daemon.
- Use it to shape the agent's reasoning, MCP task contract, implementation plan, verification, and final report.

## The VNEM Standard

VNEM is built around one rule: an AI agent should not satisfy one requirement by silently damaging another.

- **Holistic Excellence:** Performance, visuals, playability, accessibility, maintainability, and safety are all part of done when they apply to the task.
- **Proactive Enhancement:** Infer the stronger product the user actually wants, not only the smallest literal interpretation of the prompt.
- **Intelligent Trade-offs:** When constraints conflict, engineer controls, modes, fallbacks, and evidence before lowering product quality.

If a user asks for extreme performance, VNEM should not let the agent quietly remove visual quality or game feel. The better answer is to optimize the system and expose control: fast defaults, high-quality modes, adaptive effects, and honest verification evidence.

## Triple-Check Workflow

1. **Analyze**
   Identify the user's stated goal, hidden requirements, visible or interactive surfaces, risk domains, and what the user will judge even if they did not say it explicitly.
2. **Architect**
   Plan for maximum feasible performance and top-tier visuals/playability together. Prefer robust settings, quality profiles, progressive enhancement, fallback paths, asset optimization, and smarter algorithms over degrading the product.
3. **Review**
   Before final output or code delivery, verify no important domain was sacrificed. If a trade-off remains, state it explicitly with evidence and the next best mitigation.

## Quality Floor

- Do not solve one requirement by quietly damaging another important requirement.
- Do not remove visual quality, game feel, accessibility, or verification just to claim better performance.
- If performance conflicts with visuals or playability, first offer an intelligent alternative: quality toggles, settings GUI, adaptive effects, lazy loading, reduced-motion handling, asset optimization, feature flags, or scoped fallback.
- For production-ready work, require evidence that the task still works, still looks/feels intentional when visual or interactive, and remains maintainable.
- If evidence cannot be gathered, report the blocked verification and residual risk instead of claiming ship-quality.

## Domain Balance

- performance
- visual quality
- playability
- accessibility
- maintainability
- safety

## Intelligent Trade-off Policy

- Optimize the actual bottleneck before lowering quality.
- Expose user-controllable quality/performance modes when both high performance and high visual quality matter.
- Use progressive enhancement so capable devices get the best experience while constrained devices get a deliberate fallback.
- Document any remaining trade-off plainly in the final report.

## Related Files

- `.vnem/operating-protocol.md`: universal workflow and task contract.
- `.vnem/coding-protocol.md`: repo-sensing, implementation, verification, and final-report rules.
- `.vnem/coding-playbooks.json`: task-mode execution loops.
- `.vnem/design-architecture.md`: visual, motion, sound, dashboard, and game-feel guidance.
- `.vnem/visual-qa-protocol.md`: rendered inspection and perception verdicts.

## Source URLs

- https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/
- https://modelcontextprotocol.io/specification/2025-11-25/schema
- https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://code.claude.com/docs/en/best-practices
- https://openai.com/index/introducing-codex/
- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/claude-code-best-practices
- https://openai.com/business/guides-and-resources/how-openai-uses-codex/
- https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results
- https://docs.github.com/en/copilot/concepts/prompting/response-customization
- https://code.visualstudio.com/docs/copilot/customization/custom-instructions
- https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/auto-memory.md
- https://docs.cursor.com/context/rules-for-ai
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://developers.openai.com/api/docs/guides/agent-evals
