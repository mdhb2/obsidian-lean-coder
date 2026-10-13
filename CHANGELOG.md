# Changelog

All notable changes to OLC (Obsidian Lean Coder) are recorded here.
OLC is pre-release: versions are `0.x` until a controlled-testing release says otherwise.
`package.json` shipped `"private": true` through 0.1.0; the flag was removed at publish time with explicit user approval, and 0.1.0 is live as [`obsidian-lean-coder`](https://www.npmjs.com/package/obsidian-lean-coder). Publishing a new version is still a separate explicitly approved action, never automatic.

## [0.2.0] — 2026-10-13 — `olc-setup` resource installer

New `olc-setup setup [--project|--global]` command (run manually via `npx obsidian-lean-coder setup`
after install): copies the shipped agents/skills into OpenCode discovery paths —
`<cwd>/.opencode` (project, default) or `~/.config/opencode` (`$XDG_CONFIG_HOME/opencode` when set,
global; global use is allowed only for this plugin's own install). Missing directories are created;
existing OLC agent/skill files are overwritten with the package versions (a deliberate, narrow
exception to the create-only rule, scoped to the files this command owns — see README §2).
`--dry-run` previews without writing; `opencode.json` is never edited (manual snippet printed after
each run). Node builtins only, no runtime dependencies.

- **Verification:** 6 fixture tests (`tests/setup.test.ts`: create, skip/overwrite, dry-run,
  global scope, usage errors, mkdir -p); full suite 146/146 pass; typecheck/build clean.
- **Upgrade:** `npm install obsidian-lean-coder@0.2.0`, then `npx obsidian-lean-coder setup`
  (add `--global` for global scope).

## [0.1.1] — 2026-10-13 — plugin entrypoint fix

Fixes npm-package activation (reported: `npm install` worked but nothing appeared in OpenCode).
The package-root entrypoint `dist/index.js` exported only `OLC_VERSION`, so npm loaders —
which resolve the package root — never saw the plugin default export and ignored the package.
`src/index.ts` now re-exports the plugin default alongside `OLC_VERSION`.
Agents/skills still appear only via the project-local `.opencode` copy (by design, OLC-012).

- **Verification:** typecheck clean, build OK, mock-ctx plugin load (`id=olc`, correct payload),
  full suite 140/140 pass, real-loader test (`loading plugin`, zero `failed to load plugin`).
- **Upgrade:** `npm install obsidian-lean-coder@0.1.1`, then list the package in `opencode.json`
  `plugins` (see README §2).

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
