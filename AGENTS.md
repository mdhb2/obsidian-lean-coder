# AGENTS.md — OLC Project Instructions

## Project goal

Build OLC (Obsidian Lean Coder), an installable OpenCode extension distributed
through npm as **`obsidian-lean-coder`** (current: **v0.7.0**, MIT, published —
republishing always needs separate explicit approval, never automatic).

What OLC is now (post-MVP, all `docs/TASKS.md` M0–M7 DONE):

- Two **primary-mode** agents that behave like OpenCode's default Plan/Build
  agents first, then add OLC rules: `olc-plan` (never writes app code; writes
  `intent.md` + `plan.md` to the vault) and `olc-build` (one approved task at
  a time, evidence-backed verification). On conflict between root `AGENTS.md`
  and `.olc/AGENTS.md`, the OpenCode default wins — show conflict, suggest
  fix, stop for user choice.
- Four shipped skills: `olc-init`, `olc-explore`, `olc-task`, `olc-log`.
  There are intentionally **no** `olc-memory` / `olc-taste` skills and no
  `memory_*` / `taste_*` / `decision_record` tools (removed in 0.7.0).
- Plugin tools under namespace `olc`: `olc_status`, `olc_log_event`,
  `olc_session_summary`, `olc_next_task`, `olc_project_status`,
  `olc_task_finalize`. No writes happen at plugin load — only inside a tool's
  `execute`.
- Resource installer `npx obsidian-lean-coder setup` (`bin/olc-setup.js`):
  copies `agents/*.md` + `skills/*/SKILL.md` into `.opencode/` (project scope
  default, `--global` for global, `--dry-run` to preview). Re-running after an
  upgrade is safe; owned agent/skill files are overwritten with package
  versions (narrow, documented exception — vault notes are never touched).
- Vault layout: `<vault>/OLC/Projects/<project_id>/{index.md,
  current-state.md, tasks/active/<id>/, tasks/done/<id>/, knowledge/<id>.md,
  logs/}` + `OLC/registry.json`. Task states: `draft → active ⇄ pending →
  done` plus `rejected` (`pending` = paused but resumable, `done` = terminal
  and immutable — follow-ups go in a new task). One-level sub-tasks live at
  `tasks/active/<parent>/sub/<sub>/`. Old layouts migrate automatically on
  init/resume.

Sources of truth: `docs/PRD.md` (what), `docs/TASKS.md` (status + evidence),
`docs/DECISIONS.md` (open technical decisions — #1 name resolved, #2 API +
delivery resolved, #5 checkpoint strategy resolved, #7 transition table
resolved; #3 version range, #4 git strategy, #6 auto-logging still open),
`CHANGELOG.md` (per-version behavior + upgrade notes), `README.md`
(install/reference/troubleshooting). If PRD and repo disagree, trust source +
Git state and say so.

## Working style

- This repo is **post-MVP maintenance**, not greenfield: all milestone tasks
  are DONE. New work gets a new task entry in `docs/TASKS.md` (or a short
  direct fix for trivial items) — do not reopen DONE tasks silently.
- Prefer simple, understandable, maintainable designs over abstractions.
- Do not begin work whose acceptance criteria or scope are unclear. Ask one
  focused question only when a consequential choice cannot be resolved from
  PRD/repo/CHANGELOG.
- Work one task at a time. Update `docs/TASKS.md` status as work progresses
  and record evidence/results at completion.
- Do not claim success unless supported by test output, build output,
  inspected files, or other concrete evidence.
- Standard loop for OLC itself: `npm ci && npm run build && npm test &&
  npm run typecheck` (currently **156 tests** green). `npm pack --dry-run`
  to verify shipped files (`dist/`, `agents/`, `skills/`, `templates/`).
  Never publish to npm without explicit user approval.
- At the end of each working session, write a plain-language summary (see
  closeout below). Avoid unexplained technical jargon.

## Agent responsibilities

### olc-plan
- Read root `AGENTS.md` (if present) and `.olc/AGENTS.md` (if present) at
  session start; OpenCode default wins on conflict.
- Inspect repository source and Git state before proposing a plan.
- May write OLC planning documents in the configured vault under
  `tasks/active/<id>/` only; must not modify application source files.
- Offer Explore (`olc-explore`, read-only, one report per task) vs direct
  Plan based on complexity; user chooses.
- Produce/revise `intent.md` + `plan.md` together. Do not start coding before
  the user explicitly approves both.

### olc-build
- Read root `AGENTS.md`, `.olc/AGENTS.md`, and the APPROVED `intent.md` +
  `plan.md` for the task.
- Implement only a task with an approved plan and bounded acceptance criteria.
- Inspect actual repository root, current branch, HEAD, working tree, diff,
  and untracked files before Git-sensitive operations.
- Use source and test results as ground truth. Do not infer test success.
  Prefer tools guaranteed by OLC prerequisites (node, npm, git) for checks;
  a check failing due to a missing environment binary is an **environment
  limitation**, not a task failure — report separately.
- Small technical decisions and fixes are allowed within the approved task.
  Scope, product behavior, accepted risks, or architecture changes require
  user approval and a plan revision (propose, don't perform).
- Several tasks may be open (`draft`/`active`/`pending`); use `olc_next_task`
  / `olc_project_status` to triage, ask which to continue. Finalize
  (`olc_task_finalize`: knowledge file, move to `tasks/done/`, mark `done`,
  re-point log links) ONLY on explicit user request ("task X selesai").
- If a blocker cannot be resolved after bounded attempts, stop, document
  attempts and evidence, and ask for direction.

## Safety rules — mandatory

1. Never run destructive Git operations (including `reset --hard`, force
   checkout, clean, branch deletion, or force-push) as a convenience or
   without explicit, informed user approval.
2. Never overwrite, discard, stage, or commit user/manual changes that are
   not clearly part of the current task.
3. Before creating a checkpoint commit, inspect `git status --short`,
   relevant diffs, and untracked files. Stage explicit paths and commit with
   a pathspec only (`git add -- <paths>`, `git commit -- <paths>`); never
   `git add .`/`-A` or plain `git commit` in OLC flows.
4. If changes by OLC and the user are mixed and cannot be separated with
   confidence (owned file differs from write-time snapshot, foreign staged
   changes), stop and ask. Do not claim file ownership based only on who
   last edited the file.
5. Restoring a checkpoint must preserve later Git history. Prefer applying
   the selected snapshot as a new change/commit. Never silently move the
   branch backward or erase subsequent commits.
6. Before restore, verify the working tree and warn/stop if there are
   uncommitted or untracked changes at risk.
7. Never access or modify the wrong project's vault notes. Validate
   `project_id`, repo root, and vault registry (`validateIdentity`) before
   important reads/writes.
8. If configured vault is missing or unavailable, stop OLC-dependent
   operations. Do not create a hidden local fallback.
9. Never silently overwrite existing config, instructions, templates, plans,
   logs, or notes. `olc-init`/`initProject` is create-only and idempotent
   (existing files → `preserved`); the only overwrite exception is
   `olc-setup` refreshing its own owned agent/skill files under `.opencode/`.
10. Do not revise approved scope, mark a task done, or continue after an
    ambiguous resume without the required user approval. `done` is immutable
    and only via explicit finalize.
11. Do not expose credentials, access tokens, secrets, or private vault
    contents in logs, docs, or test fixtures. Config rejects secret-like
    keys; log writes are secret-scrubbed (safety net, not a vault).
12. Do not make network calls or publish packages during tests unless
    explicitly requested.

## Implementation rules

- Source layout (actual): `src/{index.ts, plugin.ts, tools.ts,
  config/, core/project-identity.ts, init/, vault/, planning/, tasks/,
  approval/, build/, verify/, git/, log/, resume/, session/, finalize/,
  validation/}`, `agents/{olc-plan.md, olc-build.md}`, `skills/{olc-init,
  olc-explore, olc-task, olc-log}/SKILL.md`, `templates/{intent, plan,
  explore-report, checkpoint, activity-log, session-summary, knowledge}.md`,
  `tests/`, `bin/olc-setup.js`. There is no `src/memory/`, `src/taste/`,
  `decision.md`, or `taste-rule.md` — do not reintroduce them without a new
  approved task.
- Validate all external input and file paths. Resolve paths and ensure writes
  remain within the intended project/vault roots (vault resolver rejects
  traversal; task ids match `/^[A-Za-z0-9][A-Za-z0-9-_]{0,63}$/`).
- Prefer Node.js built-ins for filesystem/path/process needs unless a
  dependency materially simplifies a tested requirement. Runtime deps:
  `@opencode/plugin` only (pinned to targeted OpenCode 2.x CLI).
  Engines: Node `>=18.18.0`. Entrypoint `dist/index.js` re-exports the
  plugin default alongside `OLC_VERSION` (npm loaders resolve package root).
- Keep the plugin runtime entrypoint thin; isolate configuration, project
  identity, vault, Git, logging, state transitions, and OpenCode integration
  into testable modules.
- Follow the actual supported OpenCode plugin API (`Plugin.define({ id,
  setup })`, `ctx.tool.transform`, `ctx.location`); do not assume files in
  arbitrary `agents/` or `skills/` directories auto-load — delivery is the
  project-local `.opencode/` copy via `olc-setup`.
- Separate package installation, OpenCode plugin registration
  (`opencode.json` `plugins: ["obsidian-lean-coder@latest"]`), and project
  initialization (`olc-init` skill) in documentation.
- Package name is settled (`obsidian-lean-coder`); do not rename without a
  new decision entry.
- Templates must be included in the published package and carry relative
  `[[wikilinks]]` (`## Terkait`) so vault docs stay in the Obsidian graph;
  `session-summary.md` stays link-free (returned in chat, never written).
  Never auto-migrate old vault documents when templates change.
- Avoid writes during module import/startup. Side effects happen only in an
  explicit command/tool/action and are observable.
- Errors say what failed, which resource is involved (without leaking
  secrets), and the safe next action; tools return `{ ok: true, ... }` /
  `{ ok: false, error: { code, message } }`, never throw across the boundary.

## Verification expectations

For each relevant change, run the smallest meaningful checks and record exact
results. Before declaring a task complete, run available tests plus
typecheck/build as appropriate.

Minimum release checks:
- `npm run typecheck` clean, `npm run build` clean, `npm test` green
  (full suite; currently 156 tests incl. finalize, subtask, migration,
  triage-tool, link-integrity).
- Unit tests for config validation, project identity, vault path handling,
  status transitions, and checkpoint safety; integration tests in a temporary
  git repo + temporary vault fixture; tests that preserve unrelated modified
  and untracked files.
- `npm pack --dry-run` contains `dist/`, `agents/`, `skills/`, `templates/`
  (+ `bin/`, README, CHANGELOG) and no memory/taste/decision remnants,
  dev deps, or test output.
- A clean OpenCode profile smoke test against the documented supported
  version (2.x; pinned `@opencode/plugin` matches CLI).
- Verify resume/triage (`olc_next_task`, `olc_project_status`), scope
  escalation, finalize-only-on-request, and end-of-session plain-language
  summary.

If a check cannot be run in the current environment, explicitly mark it NOT
RUN and explain why. Never fabricate results.

## Required session closeout

At the end of every normal working session:

1. **Reflection pass (log what's worth keeping).** Evidence only — never
   fabricate. Use the OLC tools (namespace `olc`): important event →
   `olc_log_event`. If the tools or vault are unavailable, say so — never
   claim a save that did not happen.
2. **Summarize.** Call `olc_session_summary` and show its markdown
   (Indonesian, plain language; claims mapped to logged events, real
   checkpoint SHA only).
3. **Report in simple language**: what was done, the observed result,
   tests/checks run with their outcomes, what remains or is blocked, the next
   suggested task, and the checkpoint commit reference if one was safely
   created.

The plain-language summary is mandatory even when the code changes are small.

## Uteke Memory — OLC
Read .uteke/uteke-rule.md
