# OLC — Open Decisions Log

Status board for technical decisions that must be validated/resolved during implementation (see `PRD.md` §12). Update each row with the outcome and task/commit evidence when resolved.

| # | Decision needed | Resolved? | Resolution / evidence |
|---|---|---|---|
| 1 | Final npm package name/scope and availability | Open | — |
| 2 | Exact OpenCode plugin API/entrypoint and resource delivery method (package, generated files, or both) | Resolved (OLC-012; API side in OLC-010/OLC-011) | API: OpenCode V2 plugin API, package **`@opencode/plugin`** (2.0.27, pinned to CLI), `import { Plugin } from "@opencode/plugin"`, `export default Plugin.define({ id, setup })`; loader requires default export with `id` + `effect`/`setup`. DELIVERY: project-local file placement — agents at `.opencode/agents/<name>.md`, skills at `.opencode/skills/<id>/SKILL.md` (each skill its own dir with `SKILL.md` + `description` in frontmatter; agents need `description` frontmatter) — installed by safe idempotent copy owned by `olc-init` (never overwrites user-customized files; re-runnable). Programmatic `ctx.agent/ctx.skill.transform` registration rejected for MVP (`AgentEditor` has no `add`; would need two parallel mechanisms). Proven by fixtures: fresh-dir install discovered (`/api/skill` → `olc-memory`, `/api/agent` → `olc-plan` via `opencode serve` + `opencode api --server URL get ... --param 'location={\"directory\":...}'`); repeat install leaves pre-existing user files byte-identical (`sha256sum -c` OK), no duplicates. Setup snippet: `mkdir -p .opencode/agents .opencode/skills && cp <pkg>/agents/olc-plan.md .opencode/agents/ && mkdir -p .opencode/skills/olc-memory && cp <pkg>/skills/olc-memory/SKILL.md .opencode/skills/olc-memory/` (replace `<pkg>` with the installed package path; `olc-init` automates this in OLC-022; verify with `opencode api get /api/skill --param 'location={\"directory\":\"$(pwd)\"}'`). |
| 3 | Exact supported OpenCode version range | Open | V2 plugin API is still evolving ("Entrypoints, hooks, draft shapes, and configuration may change before the stable release" per docs). No published compatibility table found; practice is to pin `@opencode/plugin` to the targeted OpenCode release (OLC currently pins 2.0.27 = installed CLI version; proven by OLC-011 smoke test). Exact minimum OpenCode version still to be pinned. |
| 4 | Git CLI invocation strategy and supported platforms | Open | — |
| 5 | How to safely separate OLC-owned changes from unrelated manual changes (checkpoint safety spike, OLC-050) | Open | — |
| 6 | Whether automatic event logging is reliable via plugin hooks or needs a local recorder | Open | — |
| 7 | Final task status transition table | Open | — |

## Notes

- This file is the single source of truth for open product/technical decisions. Do not duplicate this list elsewhere.
- `docs/PRD.md` and `docs/TASKS.md` remain the sources of truth for requirements and task status respectively; this file only tracks decisions still pending resolution.
