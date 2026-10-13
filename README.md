# OLC — Obsidian Lean Coder

OpenCode extension for project-scoped planning, memory, and safe Git checkpoints. On npm as `obsidian-lean-coder` (v0.1.1 fixes plugin activation — see CHANGELOG).

## Three separate steps

Do not confuse these. They are different operations with different commands:

| # | Step | What it does | Command |
|---|------|--------------|---------|
| 1 | **Dev install** | Install npm deps to hack on OLC itself | `npm ci && npm run build` |
| 2 | **Plugin activation** | Load OLC as an OpenCode plugin | `npm i obsidian-lean-coder` + `opencode.json` snippet below |
| 3 | **Project init** | Register one app repo + vault with OLC (`initProject`, idempotent, create-only) | via the `olc-init` skill in OpenCode (the tested path) |

## 1. Dev install

Requirements: Node >= 18.18, npm, git.

```sh
git clone <this-repo> olc && cd olc
npm ci
npm run build    # tsc -p tsconfig.json → dist/
npm test         # tsc -p tsconfig.tests.json && node --test "dist-tests/tests/**/*.test.js"
npm run typecheck
```

Expected: build clean, typecheck clean. `npm test` runs the full suite (currently 140 tests). `npm pack --dry-run` shows what would ship (`dist/`, `agents/`, `skills/`, `templates/`).

> Published on npm as `obsidian-lean-coder` (MIT). Republishing needs a separate explicit approval — never publish by accident.

## 2. Plugin activation

```sh
npm install obsidian-lean-coder
```

Then list it in your project's `opencode.json` (npm loaders resolve the package root `dist/index.js`, which since v0.1.1 carries the plugin default export alongside `OLC_VERSION`):

```json
{
  "plugins": ["obsidian-lean-coder"]
}
```

Verify it loads (from the consuming project directory; the model call itself will fail without account funds, but plugin loading happens first):

```sh
OPENCODE_LOG_LEVEL=DEBUG opencode run --standalone "hi" --print-logs 2>&1 | grep -E "loading plugin.*obsidian-lean-coder|failed to load plugin"
```

Expected: a `loading plugin ... obsidian-lean-coder` line and **zero** `failed to load plugin` lines. (Verified 2026-10-13 via the equivalent local-file shape against the real loader; npm-registry install itself verified in OLC-071.)

> `npm install` alone shows nothing in OpenCode — that is normal. The package must be listed under `plugins`, and agents/skills never auto-appear: they are project-local files you copy yourself (next step). No restart or rebuild needed after editing `opencode.json`.

### Local dev path (this checkout, no npm)

An `index.js` under `.opencode/plugins/<name>/` auto-loads with no install step (proven in OLC-011, re-verified in OLC-071). The plugin entrypoint is `dist/plugin.js` (`src/plugin.ts` → `Plugin.define({ id: "olc" })`, one read-only `olc_status` tool, zero writes on load).

In your consuming project (replace `/home/you/olc` with your OLC checkout):

```sh
PKG=/home/you/olc   # your OLC checkout — build it first (step 1)
mkdir -p .opencode/plugins/olc
printf '%s\n' 'export { default } from "file://'"$PKG"'/dist/plugin.js";' > .opencode/plugins/olc/index.js
printf '%s\n' '{ "type": "module", "dependencies": { "@opencode/plugin": "2.0.27" } }' > .opencode/plugins/olc/package.json
```

Verify with the same `grep` as above, expecting `.opencode/plugins/olc/index.js` in the loading line.

Then place the agent/skill resources project-locally (DECISIONS.md #2 — programmatic registration was rejected for MVP):

```sh
PKG=/home/you/olc   # your OLC checkout
mkdir -p .opencode/agents .opencode/skills/olc-explore
cp "$PKG"/agents/olc-plan.md "$PKG"/agents/olc-build.md .opencode/agents/
cp "$PKG"/skills/olc-explore/SKILL.md .opencode/skills/olc-explore/
```

Discovery note: `/api/agent` and `/api/skill` returned `[]` for project-local files in this build — even for a minimal probe agent — so API listing is not a valid verification (OLC-012 evidence did not reproduce; TUI-side discovery untested). Verify by file presence instead:

```sh
ls .opencode/agents/olc-plan.md .opencode/agents/olc-build.md .opencode/skills/olc-explore/SKILL.md
```

`olc-plan`/`olc-build` agents and the `olc-explore` skill are picked up by OpenCode from these paths. Re-running the `cp` commands is safe as long as you have not customized the destination files — `cp` overwrites; the no-clobber guarantee belongs to `olc-init`, which reports existing files as `preserved` instead of overwriting them.

Supported versions: OpenCode 2.x with the V2 plugin API. OLC pins `@opencode/plugin` 2.0.27 to match the CLI it was smoke-tested against (see OLC-011). Other 2.x versions will likely work; 1.x will not. The exact minimum version is still open (DECISIONS.md #3).

## 3. Project init

`initProject` (`src/init/index.ts`) registers one app repo + vault. It is idempotent and **create-only**: existing files are reported `preserved`, never overwritten. Anything needing a human choice comes back as `status: "needs-decision"` — no prompting inside the module.

Run it via the `olc-init` skill inside OpenCode (recommended — the only tested path for MVP). A programmatic import is not yet wired: the package entrypoint (`dist/index.js`) exports `OLC_VERSION` plus the plugin default, and `initProject` lives in `src/init/index.ts` for internal/agent use.

What it creates (only when missing):

- `<repo>/.olc/config.json` — `{ schemaVersion, projectId, vaultPath }`. No secrets (keys matching `secret|token|password|api-key` are rejected).
- `<repo>/.olc/AGENTS.md` — stub instructions for agents. Review and customize.
- `<vault>/OLC/Projects/<project_id>/{index.md, current-state.md, decisions/, tasks/, logs/, memory/, taste/}`
- `<vault>/OLC/registry.json` — `{ projects: { "<id>": { repoRoot } } }` entry for this repo.

Vault path precedence: explicit `vaultPath` > `OLC_VAULT_PATH` env > existing config. OLC never invents a vault location — missing path returns `needs-decision`, never a silent default.

Re-running init is always safe: run it again after pulling updates; `created` becomes `preserved`. To preview without writing: `initProject({ ..., dryRun: true })`.

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
       .opencode/skills/olc-explore .olc
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
