# OLC — Obsidian Lean Coder

OpenCode extension for project-scoped planning, memory, and safe Git checkpoints. On npm as `obsidian-lean-coder` (v0.5.1: English skill docs, concise install — see CHANGELOG).

## Install

```sh
npm install obsidian-lean-coder
```

Add it to your project's `opencode.json`:

```json
{ "plugins": ["obsidian-lean-coder"] }
```

Copy the agents/skills into `.opencode/` (idempotent — safe to re-run after upgrading):

```sh
npx obsidian-lean-coder setup
```

Then open OpenCode in the project and run the **olc-init** skill to register the repo with a vault — that's it. Everything below is reference detail (requirements, what each step actually does, uninstall, troubleshooting).

Requirements: OpenCode 2.x (V2 plugin API), Node >= 18.18.

## Reference

### What `npx obsidian-lean-coder setup` does

Installs `agents/olc-plan.md`, `agents/olc-build.md`, and the five skills
(`olc-init`, `olc-explore`, `olc-memory`, `olc-log`, `olc-taste`) under
`.opencode/` (project scope by default). `--global` installs under
`~/.config/opencode` instead; `--dry-run` previews with no writes. Missing
directories are created; existing OLC agent/skill files are overwritten with
the package versions (a deliberate exception to the create-only rule, scoped
to these files only — your own vault notes are never touched by this).

Both agents behave exactly like OpenCode's default Plan/Build agents first,
then add OLC rules: each session they read the project root `AGENTS.md` (if
present) and `.olc/AGENTS.md` (if present). If the two disagree, the OpenCode
default wins — the agent shows the conflict, suggests a fix, and stops for
your choice.

### What `olc-init` does

`initProject` (`src/init/index.ts`) registers one app repo + vault. It is
idempotent and **create-only**: existing files are reported `preserved`,
never overwritten. Anything needing a human choice comes back as
`status: "needs-decision"` — no prompting inside the module. During init you
are asked whether the project has extra rules beyond the main agents file;
confirmed additions go under "Additional project rules" in `.olc/AGENTS.md`.

What it creates (only when missing):

- `<repo>/.olc/config.json` — `{ schemaVersion, projectId, vaultPath }`. No secrets (keys matching `secret|token|password|api-key` are rejected).
- `<repo>/.olc/AGENTS.md` — stub instructions for agents. Review and customize.
- `<vault>/OLC/Projects/<project_id>/{index.md, current-state.md, decisions/, tasks/, logs/, memory/, taste/}`
- `<vault>/OLC/registry.json` — `{ projects: { "<id>": { repoRoot } } }` entry for this repo.

Vault path precedence: explicit `vaultPath` > `OLC_VAULT_PATH` env > existing
config. OLC never invents a vault location — missing path returns
`needs-decision`, never a silent default. Re-running init is always safe:
`created` becomes `preserved`.

### Contributing to OLC itself

```sh
git clone <this-repo> olc && cd olc
npm ci
npm run build    # tsc -p tsconfig.json → dist/
npm test         # tsc -p tsconfig.tests.json && node --test "dist-tests/tests/**/*.test.js"
npm run typecheck
```

Expected: build clean, typecheck clean, full suite green (currently 152
tests). `npm pack --dry-run` shows what would ship (`dist/`, `agents/`,
`skills/`, `templates/`).

A local checkout can be loaded without publishing: `.opencode/plugins/<name>/index.js`
re-exporting `file://<checkout>/dist/plugin.js` auto-loads with no install
step. See `docs/DECISIONS.md` and `docs/TASKS.md` for the full history if you
need it.

> Published on npm as `obsidian-lean-coder` (MIT). Republishing needs a separate explicit approval — never publish by accident.

### Vault linking rules (second brain)

The vault is meant as the project's long-term memory, so every document a
template produces must be a node in Obsidian's link graph, not an isolated
file. Rules:

- Every bundled template carries a `## Terkait` section with **relative**
  `[[wikilinks]]` to its natural neighbours — e.g. `intent.md` ↔ `plan.md` ↔
  `history.md` ↔ `checkpoint.md`; `explore-report.md` and `taste-rule.md`
  back to the project hub (`index.md`, `current-state.md`); each daily log
  file links to the hub, and each logged event with a `taskId` links to that
  task's `intent.md`/`plan.md`.
- `index.md` and `current-state.md` link to each other — they are the hub a
  reader lands on first.
- Links are relative path-form (`[[../T-1/plan]]`, not a bare `[[plan]]`),
  so they resolve correctly whether Obsidian's vault root is `<vault>` or
  `<vault>/OLC/Projects/<id>`, and stay correct across multiple projects
  sharing one vault (a bare `[[plan]]` would be ambiguous between projects).
- `decision.md` takes a `related` template variable — the caller supplies
  the links relevant to that specific decision; there is no fixed set.
- `session-summary.md` is the one exception: it has no fixed vault location
  (it's returned in chat for the user to read, never written to a file), so
  it carries no links by design.
- **Limitation:** linking only applies to newly rendered documents. Older
  vault files written by a previous OLC version are not backfilled with
  links (see D-005 in `docs/TASKS.md`).
- Writing to `memory/<name>.md` via the `olc-memory` skill is free-form
  (no template), but should still include a `## Terkait` section linking
  back to `[[../index]]`/`[[../current-state]]` and any related task or
  decision, to keep the memory graph connected.

## Updating

1. `git pull` the OLC checkout.
2. `npm ci && npm run build && npm test`.
3. Re-run init for each consuming project (creates only missing files; your vault notes, checkpoints, and taste rules are untouched).

No migration step exists yet — templates live in the package (`templates/`); old vault documents are never auto-migrated.

## Uninstalling

Per consuming project:

```sh
# 1. Remove OLC resources from the project
rm -rf .opencode/agents/olc-plan.md .opencode/agents/olc-build.md \
       .opencode/skills/olc-init .opencode/skills/olc-explore .opencode/skills/olc-memory \
       .opencode/skills/olc-log .opencode/skills/olc-taste .olc
# 2. Remove the plugin entry from opencode.json ("plugin": ["file:///..."])
# 3. Optionally remove the vault scope (YOUR NOTES — back up first):
#    rm -rf "$VAULT/OLC/Projects/<project_id>"
# 4. Optionally remove the registry entry in "$VAULT/OLC/registry.json"
```

No global state, no daemons, no background processes — nothing else to clean up.

## Security notes

- **Never store secrets in `.olc/config.json`** — credential-looking keys are rejected at parse time. Use env vars or a secret manager.
- **Memory/log writes are secret-scrubbed** (`src/log/index.ts`): known token/key patterns become `[redacted]` before reaching the vault. The scrub list is documented and minimal — treat it as a safety net, not a vault for secrets.
- **Git safety**: checkpoints stage only explicit OLC-owned paths (`git add -- <paths>`) and commit with a pathspec. `git add .`/`-A`, plain `git commit`, `reset --hard`, and force-push are banned in OLC flows. Ambiguous ownership aborts and asks you.
- **Wrong-project protection**: every read/write validates `project_id` → repo-root → vault registration first (`validateIdentity`). Mismatches block with zero writes.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `project_id "x" is not registered` | Run init for this repo, or you are in the wrong checkout. |
| `Refusing to touch the wrong project's memory` | `project_id` maps to a different repo root. Use a new `projectId` for this checkout or move to the registered repo. |
| `No vault path configured` | Pass `vaultPath` or set `OLC_VAULT_PATH`. OLC never guesses. |
| Plugin not listed by `/api/plugin` | Check the `file://` path in `opencode.json` points at the OLC checkout root (containing `dist/`). Rebuild (`npm run build`) — the entrypoint is compiled output. |
| Agent/skill not discovered | Files must be at `.opencode/agents/<name>.md` / `.opencode/skills/<id>/SKILL.md` relative to the project dir you pass in `location`. Check frontmatter has `description`. |
| `Detached HEAD` / `SESSION_DRIFT` | Confirm branch + task before continuing — nothing was switched or closed. |
| `OWNED_PATH_PRESTAGED` / `FOREIGN_EDIT` on checkpoint | Someone (you or a tool) touched OLC-owned files outside the task. Unstage / reconcile, then retry. |

## Docs map

- `docs/PRD.md` — requirements (source of truth for *what*).
- `docs/TASKS.md` — task board with verification evidence (source of truth for *status*).
- `docs/DECISIONS.md` — open technical decisions (#1 name, #3 version pin still open).
- `AGENTS.md` — working rules for agents in this repo.
