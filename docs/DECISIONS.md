# OLC — Open Decisions Log

Status board for technical decisions that must be validated/resolved during implementation (see `PRD.md` §12). Update each row with the outcome and task/commit evidence when resolved.

| # | Decision needed | Resolved? | Resolution / evidence |
|---|---|---|---|
| 1 | Final npm package name/scope and availability | Open | — |
| 2 | Exact OpenCode plugin API/entrypoint and resource delivery method (package, generated files, or both) | Partially resolved (OLC-010) | API confirmed: OpenCode V2 beta plugin API, `@opencode-ai/plugin` package (dist-tag `beta`), default export via `Plugin.define({ id, setup(ctx) {...} })`. Resource delivery still open — candidates found: local files under `.opencode/plugins/` (auto-load, no install needed), or a published npm package registered in `opencode.json(c)` `plugins` array (string/`pkg@version`/path/`{package, options}`); agents/skills can additionally be registered programmatically at runtime via `ctx.agent.transform` / `ctx.skill.transform`, not only as static files. Final delivery strategy decided in OLC-012. |
| 3 | Exact supported OpenCode version range | Open | V2 plugin API is explicitly **beta**: "Entrypoints, hooks, draft shapes, and configuration may change before the stable release." No published compatibility table found; docs instruct pinning `@opencode-ai/plugin` version to match the targeted OpenCode release manually. Exact minimum OpenCode version still to be pinned once OLC-011 does a real smoke test. |
| 4 | Git CLI invocation strategy and supported platforms | Open | — |
| 5 | How to safely separate OLC-owned changes from unrelated manual changes (checkpoint safety spike, OLC-050) | Open | — |
| 6 | Whether automatic event logging is reliable via plugin hooks or needs a local recorder | Open | — |
| 7 | Final task status transition table | Open | — |

## Notes

- This file is the single source of truth for open product/technical decisions. Do not duplicate this list elsewhere.
- `docs/PRD.md` and `docs/TASKS.md` remain the sources of truth for requirements and task status respectively; this file only tracks decisions still pending resolution.
