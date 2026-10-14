# Changelog

All notable changes to OLC (Obsidian Lean Coder) are recorded here.
OLC is pre-release: versions are `0.x` until a controlled-testing release says otherwise.
`package.json` shipped `"private": true` through 0.1.0; the flag was removed at publish time with explicit user approval, and 0.1.0 is live as [`obsidian-lean-coder`](https://www.npmjs.com/package/obsidian-lean-coder). Publishing a new version is still a separate explicitly approved action, never automatic.

## [0.8.0] — 2026-10-14 — new standalone `olc-todoc` skill

New fifth skill `olc-todoc`: writes any information, request, or conversation
context into a reusable Markdown document. Content-first (no forced template),
faithful to the source (fact vs decision vs assumption kept apart, nothing
invented), with a recommended `kebab-case.md` filename and a user-confirmed
storage location — nothing is created before both are settled, and existing
files are checked before any update. Standalone by design: no new `src/`
module and no new plugin tool. `npx obsidian-lean-coder setup` now installs
8 owned files (2 agents + 5 skills).

- **Verification:** typecheck/build clean; full suite green (156 tests,
  including updated setup counts 6→7); `npm pack --dry-run` ships
  `skills/olc-todoc/SKILL.md` with no memory/taste/decision remnants.
- **Upgrade:** `npm install obsidian-lean-coder@0.8.0`, re-run `npx
  obsidian-lean-coder setup` (skill set changed).

## [0.7.0] — 2026-10-14 — drop memory/taste/decision, multitask state

Two changes since 0.6.0. First, the memory, taste, and decision features are
removed entirely; the activity log (`olc_log_event`, `olc_session_summary`)
is kept. Deleted: `src/memory/`, `src/taste/`, the `memory_*`, `taste_*`,
and `decision_record` plugin tools, `recordDecision` in `src/build`, the
`olc-memory`/`olc-taste` skills, and the `decision.md`/`taste-rule.md`
templates. `init` no longer creates `decisions/`, `memory/`, or `taste/`
folders and removes them from existing vaults (reported as `removed`).

Second, tasks are now multitask-aware. Registry statuses are simplified to
`draft → active ⇄ pending → done` (plus `rejected`; `pending` = paused but
resumable, `done` = terminal and immutable — follow-ups go in a new task).
Open work lives in `tasks/active/<id>/`, finished work moves to
`tasks/done/<id>/`, and one-level sub-tasks with their own statuses live at
`tasks/active/<parent>/sub/<sub>/`. Each finalized task keeps one knowledge
file at `knowledge/<id>.md`, composed from its own records. New plugin tools
`olc_next_task` ("tugas selanjutnya"), `olc_project_status` ("status
project", lists unfinished work and asks which task to continue), and
`olc_task_finalize` (explicit user request only — writes knowledge, moves the
folder, marks `done`, logs the event), plus a new `olc-task` skill (four
shipped skills total). Pre-multitask vaults migrate automatically on init and
resume (old statuses mapped, `tasks/<id>/` folders moved). Finalization also
re-points the task's log links to `tasks/done/`, and copied record content is
sanitized to plain text, so the Obsidian link graph stays unbroken —
`templates/intent.md`, `plan.md`, and `explore-report.md` hub links were
adjusted one level deeper for the new layout.

- **Verification:** typecheck/build clean; full suite green (156 tests,
  including new finalize, subtask, migration, triage-tool, and
  post-finalize link-integrity tests); `npm pack --dry-run` ships no
  memory/taste/decision remnants.
- **Upgrade:** `npm install obsidian-lean-coder@0.7.0`, re-run `npx
  obsidian-lean-coder setup` (skill set changed), and re-run init per
  consuming project (migrates the task layout; legacy
  `decisions/`/`memory/`/`taste/` folders are removed).

## [0.6.0] — 2026-10-14 — OLC plugin tools + end-of-session reflection
Agents can finally persist learnings. Previously the memory/taste/log/session modules were library-internal and the skills only described pseudo-function calls the agent could not invoke, so completing tasks saved nothing. `src/tools.ts` now exposes 8 `olc`-namespace tools that call those modules: `olc_memory_recall`, `olc_memory_record`, `olc_taste_propose`, `olc_taste_list`, `olc_taste_review`, `olc_log_event`, `olc_session_summary`, and a new `olc_decision_record` (renders `templates/decision.md` to `decisions/<YYYY-MM-DD>-<slug>.md`, create-only). Each tool returns `{ ok: true, ... }` or `{ ok: false, error: { code, message } }` with the module's own actionable message; no writes happen at plugin load. Reflection is now a required instruction (no new tool) in root `AGENTS.md`, `agents/olc-build.md`, and `agents/olc-plan.md`, and the skill Flow sections reference the real tools.
- **Verification:** typecheck/build clean; full suite green (158 tests, 8 new covering every tool + error mapping); `npm pack --dry-run` file check.
- **Upgrade:** `npm install obsidian-lean-coder@0.6.0`. No vault or config changes required.

## [0.5.1] — 2026-10-14 — English skill docs, concise install instructions

All 5 bundled skills (`olc-log`, `olc-explore`, `olc-init`, `olc-memory`,
`olc-taste`) are now written in English; code identifiers, paths, and
examples are unchanged. The README's install section is now a 3-command
quick start right under the brief, instead of a long three-step walkthrough;
the previous detailed content (dev install path, plugin activation, API
caveats) is preserved under a new `## Reference` section.

- **Verification:** typecheck/build clean; full suite green (152 tests,
  no test changes needed — docs-only); `npm pack --dry-run` file check.
- **Upgrade:** `npm install obsidian-lean-coder@0.5.1`. No vault or config
  changes required.

## [0.5.0] — 2026-10-14 — vault cross-linking for the second-brain graph

Vault documents were isolated islands: no `[[wikilinks]]` connected intent to
plan, checkpoints to history, or the daily log to the task it recorded. Since
the vault is meant as the project's second brain, every bundled template now
ships a `## Terkait` section with relative wikilinks to its natural
neighbours (intent ↔ plan ↔ history ↔ checkpoint; explore reports and taste
rules back to the project hub; daily logs to the hub and, per entry, to the
task it concerns). `index.md` and `current-state.md` link to each other.
`decision.md` takes a new `related` variable so its links reflect the actual
decision (callers must supply it). `session-summary.md` stays link-free by
design — it has no fixed vault location, so it is returned in chat, never
written to a file.

This only affects newly rendered documents; pre-existing vault files from
earlier versions are not backfilled.

- **Verification:** typecheck/build clean; full suite green (152 tests,
  including a new end-to-end fixture that walks every markdown file in a
  generated vault and resolves every `[[...]]` target on disk);
  `npm pack --dry-run` file check.
- **Upgrade:** `npm install obsidian-lean-coder@0.5.0`, then re-run any task
  that still needs its docs drafted — existing docs keep their old content.

## [0.4.1] — 2026-10-14 — verification tooling rule for minimal harnesses

`agents/olc-build.md` gains a verification rule from a real field report: prefer
tools guaranteed by OLC's own prerequisites (node, npm, git) over extra
shellutils (cat/grep/awk/sed) a minimal harness may lack, and classify a check
failure caused by a missing environment binary as an **environment limitation**,
separate from a task failure. This fixes the *reporting* of such incidents, not
the environment itself — no instruction can conjure a missing binary.

- **Verification:** typecheck/build clean; full suite green; `npm pack --dry-run` file check.
- **Upgrade:** `npm install obsidian-lean-coder@0.4.1`, then

## [0.4.0] — 2026-10-14 — default-like agents + project rules

Agents `olc-plan`/`olc-build` rewritten per user request to behave exactly like
OpenCode's default Plan/Build agents first, then add concise OLC rules: each
session they read the project root `AGENTS.md` (if present) and `.olc/AGENTS.md`
(if present); on conflict the OpenCode default wins and the agent shows the
conflict, suggests a fix, and stops for the user's choice. The `.olc/AGENTS.md`
template gains an "Aturan tambahan proyek" section, and the `olc-init` skill now
asks whether the project has extra rules beyond the main agents file
(`initProject` itself stays non-interactive; existing files are still never
overwritten).

- **Verification:** typecheck/build clean; full suite green; `npm pack --dry-run` file check.
- **Upgrade:** `npm install obsidian-lean-coder@0.4.0`, then
  `npx obsidian-lean-coder setup` (existing OLC agent/skill files are overwritten
  with package versions).

## [0.3.0] — 2026-10-13 — primary agents + all PRD skills

Agents `olc-plan`/`olc-build` move from `mode: subagent` (@-only invocation) to `mode: primary`,
so they appear in the OpenCode agent switcher (user decision).
Ships the four missing PRD §7.3 skill wrappers — `olc-init`, `olc-memory`, `olc-log`, `olc-taste` —
alongside the existing `olc-explore`; `olc-setup` installs all 7 owned files (2 agents + 5 skills).
Each SKILL.md documents its module's real contract (init create-only flow, progressive recall,
secret-scrubbed append-only log + session summary, pending→active taste lifecycle).

- **Verification:** `tests/setup.test.ts` counts updated (7 created/skipped); full suite green;
  typecheck/build clean.
- **Upgrade:** `npm install obsidian-lean-coder@0.3.0`, then
  `npx obsidian-lean-coder setup` (existing files are overwritten with package versions).

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
