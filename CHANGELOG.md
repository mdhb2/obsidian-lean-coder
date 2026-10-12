# Changelog

All notable changes to OLC (Obsidian Lean Coder) are recorded here.
OLC is pre-release: versions are `0.x` until a controlled-testing release says otherwise.
`package.json` keeps `"private": true` — npm publishing is a separate explicitly approved action, never automatic.

## [0.1.0] — 2026-10-13 — MVP pre-release

First usable version for controlled testing. One full user journey is covered by an automated end-to-end test (`tests/e2e.test.ts`, OLC-072).

**What works**
- Safe, idempotent project init (`initProject`): create-only, `preserved` reporting, `needs-decision` flow, `dryRun` preview.
- Planning workflow: draft/approve/revise/reject `intent.md` + `plan.md`, approval gate (`assertBuildReady`), scope-change return path.
- Bounded build frame: `beginTask` (identity + approval gate), `recordDecision`, `completeTask` (out-of-scope changes throw `SCOPE_CHANGED`, nothing completed silently).
- Evidence-backed verification: real command outcomes, bounded retries, escalation list; completion only on full pass.
- Safe Git checkpoints (`createCheckpoint`) and history-preserving restore (`restoreCheckpoint`): explicit owned paths only, pathspec commits, race guards; `git add .`/`-A`, plain `git commit`, `reset --hard`, and force-push are banned in OLC flows.
- Continuity: activity log (secret-scrubbed, append-only), resume context (read-only, confirmation-gated), plain-language Indonesian session summaries with event-mapped claims, progressive memory retrieval with project isolation, user-approved taste rules (`pending`→`active`/`rejected`, never silent).
- Session validation: `startSession` + `assertContextCurrent` revalidation wired into checkpoint/restore (vault unmounted, registry rewritten, or branch switched between operations blocks with zero writes).
- Packaging: `npm pack` ships `dist/` (17 modules), `agents/olc-plan.md` + `olc-build.md`, `skills/olc-explore/SKILL.md`, 8 `templates/*.md` (56 files, verified OLC-071). No dev-only dependency at runtime (`typescript` excluded).
- Docs: `README.md` distinguishes dev install vs plugin activation vs project init, with verified commands, troubleshooting, and security notes.

**Known limitations (not fixed in this release)**
- npm package name/scope unreserved (DECISIONS.md #1); minimum OpenCode version unpinned — smoke-tested against 2.0.27 only (#3).
- `dist/index.js` exports only `OLC_VERSION`; npm loaders resolve `dist/index.js`, so npm-package activation cannot work until the entrypoint is wired AND a name is reserved. Verified load path is local-file `.opencode/plugins/<name>/index.js` (README §2).
- `opencode.json` `plugins`/`plugin` pointing at a package directory produced zero load attempts in this build.
- `/api/agent` + `/api/skill` returned `[]` for project-local files in this build (OLC-012 evidence did not reproduce); README verifies resource placement by file presence.
- Tool invocation end-to-end through a live model call not exercised (account billing); OLC-072 journey runs fully offline.
- Raw `approval`/`planning`/`tasks` vault helpers are ungated by design for MVP — all agent-facing write paths go through validated entry points.
- Pre-existing unrelated change in the working tree (`D .opencode/goals/...` claim file) is not part of this release and was left untouched.

## [0.0.1] — 2026-10-12 — development baseline

Internal scaffolding milestone: repo skeleton, TypeScript ESM build, plugin entrypoint (`olc_status`), config/identity/vault foundations. Not released.
