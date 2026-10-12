# OLC — Open Decisions Log

Status board for technical decisions that must be validated/resolved during implementation (see `PRD.md` §12). Update each row with the outcome and task/commit evidence when resolved.

| # | Decision needed | Resolved? | Resolution / evidence |
|---|---|---|---|
| 1 | Final npm package name/scope and availability | Open | — |
| 2 | Exact OpenCode plugin API/entrypoint and resource delivery method (package, generated files, or both) | Partially resolved (OLC-010, corrected OLC-011) | API confirmed: OpenCode V2 plugin API, package **`@opencode/plugin`** (CORRECTION: OLC-010 recorded `@opencode-ai/plugin`, which is the legacy V1 lineage — its `latest`=1.19.0 does not match the V2 loader; the correct V2 package is `@opencode/plugin`, versioned in lockstep with the CLI, e.g. 2.0.27), root import `import { Plugin } from "@opencode/plugin"`, default export via `Plugin.define({ id, setup(ctx) {...} })`. Loader requires a `default` export with `id` + `effect`/`setup` (verified by binary inspection + smoke test; a named `server` export is ignored). Proven in OLC-011: `src/plugin.ts` registers namespace `olc` + tool `status` via `ctx.tool.transform`, reads `ctx.location`; loads in real OpenCode 2.0.27 with zero load warnings and clean typecheck (full typings, no workaround). Resource delivery still open — candidates found: local files under `.opencode/plugins/` (auto-load, no install needed), or a published npm package registered in `opencode.json(c)` `plugins` array (string/`pkg@version`/path/`{package, options}`); agents/skills can additionally be registered programmatically at runtime via `ctx.agent.transform` / `ctx.skill.transform`, not only as static files. Final delivery strategy decided in OLC-012. |
| 3 | Exact supported OpenCode version range | Open | V2 plugin API is still evolving ("Entrypoints, hooks, draft shapes, and configuration may change before the stable release" per docs). No published compatibility table found; practice is to pin `@opencode/plugin` to the targeted OpenCode release (OLC currently pins 2.0.27 = installed CLI version; proven by OLC-011 smoke test). Exact minimum OpenCode version still to be pinned. |
| 4 | Git CLI invocation strategy and supported platforms | Open | — |
| 5 | How to safely separate OLC-owned changes from unrelated manual changes (checkpoint safety spike, OLC-050) | Open | — |
| 6 | Whether automatic event logging is reliable via plugin hooks or needs a local recorder | Open | — |
| 7 | Final task status transition table | Open | — |

## Notes

- This file is the single source of truth for open product/technical decisions. Do not duplicate this list elsewhere.
- `docs/PRD.md` and `docs/TASKS.md` remain the sources of truth for requirements and task status respectively; this file only tracks decisions still pending resolution.
