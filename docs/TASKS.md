# OLC MVP — Task Plan and Status Board

**Status board source of truth:** this file. Update status, evidence, and next steps as implementation proceeds.

## Status definitions

- `TODO` — belum dimulai.
- `IN_PROGRESS` — sedang dikerjakan.
- `BLOCKED` — terhenti karena keputusan/dependensi/risiko.
- `REVIEW` — implementasi tersedia dan menunggu review/verifikasi akhir.
- `DONE` — acceptance criteria terpenuhi dengan bukti tercatat.
- `DEFERRED` — sengaja di luar MVP; jangan dikerjakan tanpa keputusan baru.

Only one task should normally be `IN_PROGRESS` at a time. Do not set `DONE` based on code being written alone. Add test/evidence notes before closing tasks.

## Milestones overview

| ID | Milestone | Status | Depends on |
|---|---|---|---|
| M0 | Fondasi repository, package, CI | TODO | — |
| M1 | Plugin OpenCode dapat dimuat | TODO | M0 |
| M2 | Konfigurasi, project identity, vault, init | TODO | M1 |
| M3 | Planning: Explore / Plan / approval | TODO | M2 |
| M4 | Build: bounded implementation and verification | TODO | M3 |
| M5 | Git checkpoint and restore safety | TODO | M2, M4 |
| M6 | Activity log, resume, session summary, taste | TODO | M2, M4, M5 |
| M7 | Packaging, integration tests, documentation, pre-release | TODO | M1–M6 |

## M0 — Foundations

### OLC-001 — Establish repository structure and decisions
- **Status:** DONE (confirmed by user 2026-10-12)
- **Priority:** P0
- **Goal:** Make the project layout and key product decisions explicit before coding.
- **Work:** Create `src/`, `agents/`, `skills/`, `templates/`, `tests/`, `docs/`; move/retain PRD and task board at canonical paths; record decisions that remain open.
- **Acceptance criteria:** Structure is documented; no duplicate source of truth for tasks; `.gitignore` excludes build output and secrets.
- **Verification:** Inspect tree and run repository checks.
- **Date:** 2026-10-12
- **Implemented:** Created empty tracked dirs `src/`, `agents/`, `skills/`, `templates/`, `tests/` (each with `.gitkeep` so git tracks them pre-code); added `.gitignore` (node_modules, dist, build, logs, .env*, coverage, tarballs); added `docs/DECISIONS.md` recording PRD §12's open technical decisions as a single tracked list. `docs/PRD.md` and `docs/TASKS.md` kept at their existing canonical paths, untouched otherwise.
- **Verification commands/results:** `find . -type f` / `find . -type d` (tree inspected, matches PRD §8 target layout at MVP-appropriate scope); `find . -iname "PRD.md" -o -iname "TASKS.md"` → exactly one of each, no duplicates; `git status --short` → only new untracked files, no existing file modified/deleted.
- **Evidence/files/commit:** `.gitignore`, `docs/DECISIONS.md`, `src/.gitkeep`, `agents/.gitkeep`, `skills/.gitkeep`, `templates/.gitkeep`, `tests/.gitkeep`. No commit made yet — repo has zero commits so far; first commit is a user decision, not made here per safety rules.
- **Remaining issues:** None blocking; actual `git add`/commit of this skeleton is left to the user/OLC-checkpoint flow, not auto-committed here.
- **Next task:** OLC-002 — npm package and TypeScript tooling skeleton.

### OLC-002 — Establish npm package and TypeScript tooling
- **Status:** DONE (confirmed by user 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-001
- **Goal:** Provide a buildable npm package skeleton.
- **Work:** Define package entrypoint strategy, scripts (`build`, `test`, `typecheck`, `lint` if chosen), TypeScript config, package files allowlist, engine constraints; settle package name only after availability check.
- **Acceptance criteria:** Build works; exported runtime entrypoint exists; metadata accurately describes the package; runtime resources are included in package candidate.
- **Verification:** `npm install`, build, typecheck, and `npm pack --dry-run` succeed in a clean checkout. Do not publish.
- **Date:** 2026-10-12
- **Implemented:** Added `package.json` (name `obsidian-lean-coder`, matches GitHub repo name — placeholder `olc` was already taken on npm, switched per user correction; `private: true` as a publish guard), `tsconfig.json` (NodeNext ESM, strict, `rootDir: src` / `outDir: dist`), `src/index.ts` as the thin runtime entrypoint (exports `OLC_VERSION`), replacing `src/.gitkeep`. Scripts: `build` (tsc), `typecheck` (tsc --noEmit), `test` (placeholder echo, real suite is OLC-003), `prepublishOnly` (runs build). `files` allowlist: `dist`, `agents`, `skills`, `templates`. `engines.node >=18.18.0`. Devdependency: `typescript@^5.6.3`. Updated `.gitignore`: added `dist/` (already present) and de-duplicated a repeated `*.tgz` line; also removed a stray `olc-0.0.1.tgz` produced by the dry-run pack.
- **Verification commands/results:** `npm install` → installed 1 package (typescript), 0 vulnerabilities. `npm run build` → `tsc -p tsconfig.json` succeeded, produced `dist/index.js` + `dist/index.d.ts`. `npm run typecheck` → `tsc --noEmit` succeeded, no errors. `npm test` → placeholder passes (exit 0), real test baseline deferred to OLC-003 per milestone order. `npm pack --dry-run` → succeeded, tarball contents: `README.md`, `agents/.gitkeep`, `dist/index.d.ts`, `dist/index.js`, `package.json`, `skills/.gitkeep`, `templates/.gitkeep` (7 files, 1.4 kB packed / 2.5 kB unpacked). No publish performed.
- **Evidence/files/commit:** `package.json`, `package-lock.json`, `tsconfig.json`, `src/index.ts` (new; replaces `src/.gitkeep`), `.gitignore` (deduped). Committed in `f95b759` "OLC-002: npm package and TypeScript tooling skeleton".
- **Remaining issues:** Package name `olc` was unavailable on npm; renamed to `obsidian-lean-coder` to match the GitHub repo name (confirmed via `npm pack --dry-run` re-run, no actual publish/registry check performed — availability for `obsidian-lean-coder` still needs confirming before any real publish, tracked in `docs/DECISIONS.md` #1). No lint tool chosen yet (optional per task Work description); left unset. Real test runner/suite deferred to OLC-003.
- **Next task:** OLC-003 — add CI and test baseline (or proceed to OLC-010 per "first execution batch" ordering, pending user direction).

### OLC-003 — Add CI and test baseline
- **Status:** TODO
- **Priority:** P1
- **Depends on:** OLC-002
- **Goal:** Make regressions visible early.
- **Work:** Set up test runner and CI for install, build, tests, and typecheck.
- **Acceptance criteria:** CI executes reproducibly; failure exits non-zero; no credentials required.
- **Verification:** Run CI workflow or matching local commands.

## M1 — OpenCode plugin vertical slice

### OLC-010 — Verify current OpenCode plugin contract
- **Status:** DONE (confirmed by user 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-002
- **Goal:** Use the real supported plugin API and avoid guessed integration behavior.
- **Work:** Inspect current official docs and a minimal known-working plugin shape; record supported version range and whether package is loaded via OpenCode config/plugin manager or another supported path.
- **Acceptance criteria:** The entrypoint and installation instructions reflect documented, testable behavior.
- **Verification:** Minimal plugin smoke test under a clean OpenCode profile.
- **Date:** 2026-10-12
- **Implemented:** No code yet (research/decision task). Loaded the `opencode` skill, fetched the official V2 plugin docs (`https://opencode.ai/v2/docs/build/plugins`) plus a targeted web search for packaging/version details. User explicitly chose to target the **V2 (beta)** plugin API over V1 when asked, since OpenCode actively develops V2 and the project has no legacy constraint. Findings recorded in `docs/DECISIONS.md` items #2 and #3:\n  - Plugin package is `@opencode-ai/plugin` (npm dist-tag `beta` for V2). Default export shape: `Plugin.define({ id, setup(ctx) { ... } })`. `setup` runs on load and may return a cleanup function for unload.\n  - Loading paths: (a) local files under `.opencode/plugins/` auto-load with no install step; (b) a published npm package, local directory, or `file://` path must be explicitly listed in `opencode.json(c)` under `plugins` (string name, `name@version`, scoped name, relative/absolute path, or `{package, options}` object for passing options).\n  - Dependencies for local plugins must be declared in a `package.json` next to the plugin directory (e.g. `.opencode/package.json`); OpenCode does not install them automatically for local files, only for npm-sourced plugins.\n  - `ctx` plugin context behaves like an OpenCode server client plus transform/hook APIs (`ctx.agent`, `ctx.skill`, `ctx.tool`, `ctx.command`, etc.) and exposes `ctx.location` (directory, project id/canonical). Relevant for later tasks: `ctx.skill.transform`/`ctx.agent.transform` let a plugin register skills/agents programmatically at runtime, which is an alternative (or supplement) to shipping static `agents/*.md` and `skills/*/SKILL.md` files — this choice is deferred to OLC-012.\n  - The V2 plugin API is explicitly marked **beta**: entrypoints/hooks/shapes may still change before stable release. No official OpenCode-version-to-plugin-API compatibility table was found; the documented practice is to pin the `@opencode-ai/plugin` version to the OpenCode release being targeted.\n- **Verification commands/results:** Documentation-only task; no commands run (no code produced yet). Verification deferred to OLC-011, which requires an actual minimal plugin smoke test under a clean OpenCode profile (that test will exercise the loading path and entrypoint shape recorded here).\n- **Evidence/files/commit:** Committed in `a8e4bbd` "OLC-010: verify OpenCode V2 plugin contract". `docs/DECISIONS.md` rows #2 and #3 updated with findings and source URL.\n- **Remaining issues:** Resource delivery strategy (static files vs. `ctx.skill.transform`/`ctx.agent.transform` vs. both) is NOT decided — explicitly deferred to OLC-012 per its own task definition. No real OpenCode smoke test has been run yet (that's OLC-011's job); this task only confirms the documented contract to build against, not that it actually works end-to-end. Minimum supported OpenCode version is still unpinned.\n- **Next task:** OLC-011 — implement minimal plugin entrypoint and OLC status tool (first real smoke test of this contract).

### OLC-011 — Implement minimal plugin entrypoint and OLC status tool
- **Status:** DONE (confirmed by user 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-010
- **Goal:** Prove that OLC can be loaded in OpenCode before building every feature.
- **Work:** Add thin entrypoint and one non-destructive status/diagnostic capability showing package version and detected project context without writing files.
- **Acceptance criteria:** OpenCode can load the plugin; status capability returns actionable information; startup makes no surprise writes.
- **Verification:** Integration smoke test and test for no filesystem mutation at import/startup.
- **Implemented:** `src/plugin.ts` (new): `export default Plugin.define({ id: "olc", setup })` using `@opencode/plugin` (NOT `@opencode-ai/plugin` — see correction below); `setup` registers namespace `olc` + tool `status` (effective id `olc_status`) via `ctx.tool.transform`, returning JSON `{ olcVersion, directory, projectId, canonical }` from `ctx.location`. Zero filesystem writes by construction. Dependency change: removed `@opencode-ai/plugin` (legacy V1 lineage, `latest`=1.19.0, whose root `PluginModule.server` convention and stale `v2/promise` typings do not match the real loader) and added `@opencode/plugin@2.0.27` (version matches installed `opencode` CLI 2.0.27; root import `import { Plugin } from "@opencode/plugin"` as per official docs; full `ctx.tool`/`ctx.location` typings, `npm run typecheck` clean with no workaround). Key loader finding (confirmed by decompiling the installed binary + smoke-test logs): the on-disk loader requires a `default` export object with `id` plus `effect` or `setup` — a named `server` export is ignored (`PluginModule.LoadError: ... Missing key at ["default"]`).
- **Verification commands/results:** `npm run typecheck` clean; `npm run build` clean (`dist/plugin.js`, `dist/plugin.d.ts`). Real load test: copied build into isolated `/tmp/opencode/olc-smoke/.opencode/plugins/olc/` (as `index.js` + `olc-version.js` import rewrite, with its own `package.json` pinning `@opencode/plugin: 2.0.27`) and ran `OPENCODE_LOG_LEVEL=DEBUG opencode run --standalone "hi" --print-logs` → log `/tmp/opencode/olc-run2.log` shows `loading plugin ... entrypoint=file:///tmp/opencode/olc-smoke/.opencode/plugins/olc/index.js` with **zero** `failed to load plugin` lines (count 0) and zero plugin-related WARNs (remaining WARNs are pre-existing user-config normalization diagnostics). The run's only ERROR is `Upstream request failed: Insufficient account funds` (account billing, unrelated to the plugin — blocks model-call paths only). Functional check without a model call: `/tmp/opencode/verify-olc11.mjs` imports `dist/plugin.js`, asserts default-export shape, drives `setup` with a mock ctx, invokes the registered `execute`, asserts payload `{olcVersion:"0.0.1", directory, projectId, canonical}`, and asserts the (empty) cwd is unchanged → `OLC-011 VERIFY OK`.
- **Evidence/files/commit:** Not yet committed. Files: new `src/plugin.ts`; `package.json` + `package-lock.json` (`@opencode-ai/plugin` → `@opencode/plugin@2.0.27`); this TASKS.md entry; `docs/DECISIONS.md` rows #2/#3 corrected (package name). Build artifacts in `dist/` (gitignored).
- **Remaining issues:** Tool invocation end-to-end through a live model call not exercised (blocked by account billing, not by code). OLC-010's recorded package name (`@opencode-ai/plugin`) is superseded — corrected in DECISIONS.md. Minimum supported OpenCode version still unpinned (works against 2.0.27; pinning deferred).
- **Next task:** OLC-012 — define resource delivery and activation (after OLC-011 confirmed DONE).

### OLC-012 — Define resource delivery and activation
- **Status:** DONE (confirmed by user 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-010
- **Goal:** Deliver agents/skills in a way OpenCode can actually discover.
- **Work:** Choose and test strategy: supported plugin-exposed tools/resources, safe install/copy to supported locations, or explicit user configuration. Do not assume arbitrary folders auto-load.
- **Acceptance criteria:** Setup path is deterministic, idempotent, preserves user files, and documented with copy-paste commands/config.
- **Verification:** New-user install fixture and repeat-install fixture.
- **Date:** 2026-10-12
- **Implemented:** DECISION (research/fixture task, no repo source code changed): project-local file placement `.opencode/agents/<name>.md` + `.opencode/skills/<id>/SKILL.md`, installed by a safe idempotent copy owned by `olc-init` (OLC-022's job). Programmatic registration via `ctx.agent.transform`/`ctx.skill.transform` rejected for MVP: decompiled binary shows `AgentEditor` exposes only list/get/default/update/remove (NO `add`), while `SkillEditor` has `add()` — with no agent-add API there is no single programmatic path, and two parallel mechanisms would double the surface to test. Static files are also the documented user-visible discovery path (Agents docs: `~/.config/opencode/agents/<name>.md` global, `.opencode/agents/<name>.md` project, or `agents` config; Skills docs: `~/.config/opencode/skills`, `.opencode/skills` root `*.md` or nested `SKILL.md`, or `skills` config array). Project-local (not global) chosen so OLC never touches files outside the project.
- **Verification commands/results:** Fixture A (new user) `/tmp/opencode/olc12-new`: fresh dir + fixture `.opencode/agents/olc-plan.md` + `.opencode/skills/olc-memory/SKILL.md` → persistent `opencode serve --port 14099` + `opencode api --server URL get /api/skill --param 'location={"directory":...}'` shows `olc-memory`, and `... get /api/agent ...` shows `olc-plan` (note: `opencode api --server` flag goes AFTER the `api` subcommand; server prints `server password <pw>` in its log, pass via `OPENCODE_PASSWORD`; list endpoints need deepObject param `location={directory}`). Fixture B (repeat install) `/tmp/opencode/olc12-repeat`: pre-existing `my-reviewer.md`, `my-notes/SKILL.md`, `opencode.json` + repeat `cp` install → pre-existing files byte-identical (`sha256sum -c` OK), discovery via `serve --port 14100` shows agents `[.., my-reviewer, olc-plan]` and skills incl. `my-notes` + `olc-memory`, no duplicates, no clobbering. Both fixture servers killed after use; user's own `serve --service` instance untouched. Rejected alternative: driving `ctx.agent/ctx.skill.list()` from inside plugin `setup` — abandoned because those list calls default to a non-project location and race async discovery (timestamps/subagents).
- **Evidence/files/commit:** Committed in `c7031ed` "OLC-012: resource delivery decision (project-local files) with fixtures" (`docs/TASKS.md` entry + `docs/DECISIONS.md` row #2 resolved). No `src/`/`agents/`/`skills/` changes yet — real fixture resources and the `olc-init` copy logic belong to OLC-022/OLC-030/OLC-070.
- **Remaining issues:** Minimum OpenCode version still unpinned (proven against 2.0.27 only). Actual `agents/*.md` + `skills/*/SKILL.md` content and `olc-init` installer land in later tasks.
- **Next task:** OLC-050 — Git checkpoint safety spike (per first-execution-batch order), or OLC-020 — config schema.

## M2 — Config, identity, vault, init

### OLC-020 — Define and validate `.olc/config.json`
- **Status:** DONE (confirmed by user 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-011
- **Goal:** A small validated project configuration.
- **Work:** Define schema version, project_id, vault-path resolution via `OLC_VAULT_PATH`, and minimal settings. Avoid secrets.
- **Acceptance criteria:** Invalid config reports clear errors; unknown future schema fails safely or is explicitly handled; path precedence is documented.
- **Verification:** Unit tests for valid/invalid/missing config and environment variable precedence.
- **Date:** 2026-10-12
- **Implemented:** New `src/config/index.ts` (per PRD §8 layout): `CONFIG_SCHEMA_VERSION=1`, `OlcConfig` (`schemaVersion`, `projectId`, optional `vaultPath`), `ConfigError` with codes (`MISSING_CONFIG`, `UNREADABLE_CONFIG`, `INVALID_JSON`, `INVALID_CONFIG`, `UNSUPPORTED_SCHEMA`, `SECRET_IN_CONFIG`, `MISSING_VAULT_PATH`) and actionable messages; `parseConfig` (pure validation: rejects unknown keys, secret-like keys `/secret|token|password|passwd|api[-_]?key/i`, non-integer/future `schemaVersion`, empty/unsafe `projectId` — must match `/^[A-Za-z0-9][A-Za-z0-9-_]{0,63}$/` so it is safe as a vault dir name); `readConfigFile` (missing file → `null`, not an error — init decides); `resolveVaultPath` (precedence env `OLC_VAULT_PATH` > file `vaultPath` > `ConfigError`; relative paths resolve against project root, never cwd; blank env treated as unset); `loadConfig` (file + env together). No other settings added — none needed yet. `src/index.ts` left untouched (entrypoint stays thin). Test wiring: `tsconfig.tests.json` (compiles `src`+`tests` to gitignored `dist-tests/`, keeps test output out of published `dist/`), `npm test` now compiles + runs `node --test "dist-tests/tests/**/*.test.js"` (bare-dir arg form fails on this Node, hence the glob), `.gitignore` += `dist-tests/`. No new dependencies — `node:test` + `node:assert/strict` builtins only. `tests/config.test.ts`: 14 tests covering all acceptance/verification points.
- **Verification commands/results:** `npm run typecheck` clean; `rm -rf dist-tests && npm test` → 14 pass / 0 fail (valid load, env precedence both directions, relative-vs-project-root resolution, missing file, bad JSON, missing/empty/unsafe projectId, future + non-integer schema, unknown keys, secret-like keys, missing vault path, blank env); `npm run build` OK; `npm pack --dry-run` → 11 files, no test/build-test output leaks into the package. No publish.
- **Evidence/files/commit:** Committed in `d376f7a` "OLC-020: validated .olc/config.json module with unit tests" (`src/config/index.ts`, `tests/config.test.ts`, `tsconfig.tests.json`, `package.json`, `.gitignore`, `docs/TASKS.md`).
- **Remaining issues:** `npm test` now runs a real suite — the placeholder is gone, which overlaps OLC-003's territory (CI + formal baseline); OLC-003 still owns CI workflow, failure-exit policy, and any runner upgrade. Minimum OpenCode version still unpinned (unchanged).
- **Next task:** OLC-021 — project and vault identity checks.

### OLC-021 — Implement project and vault identity checks
- **Status:** DONE (auto-continue instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-020
- **Goal:** Prevent memory from the wrong project being read or modified.
- **Work:** Resolve repository root and branch; validate project_id against vault registry; check path accessibility before important operations.
- **Acceptance criteria:** Identity mismatch or unavailable vault blocks OLC-dependent operation with actionable message; no fallback storage is created.
- **Verification:** Tests for wrong project ID, duplicate ID, missing vault, missing registry, and permission error.
- **Date:** 2026-10-12
- **Implemented:** New `src/core/project-identity.ts` (PRD §8 layout): `resolveRepoRoot` (walks up to `.git`, dir or worktree file; else NOT_A_REPO), `resolveBranch` (`git rev-parse --abbrev-ref HEAD`; detached → DETACHED_HEAD with sha, unborn → GIT_FAILED), `assertVaultAccessible` (readdir probe; ENOENT/EACCES → VAULT_UNAVAILABLE, never creates anything), `readRegistry` + `validateIdentity` against vault registry convention `OLC/registry.json` (`{"projects": {"<id>": {"repoRoot": "<abs>"}}}`; missing → MISSING_REGISTRY, bad shape/JSON → INVALID_REGISTRY, unknown id → UNREGISTERED_PROJECT, id mapped to another root → PROJECT_MISMATCH with explicit refusal). `src/index.ts` untouched (thin entrypoint). `tests/identity.test.ts`: 11 tests with real temp git repos/vaults (no mocks for git).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 25 pass / 0 fail (14 OLC-020 + 11 new: happy path, subdir, NOT_A_REPO, detached, unregistered id, duplicate id→mismatch, missing vault (+`existsSync` proves nothing created), missing/corrupt registry, chmod-000 permission message, relative repoRoot compare); `npm run build` OK; `npm pack --dry-run` → 13 files. Test bug caught during run: first version of the missing-vault test used a fixed `/tmp` path and its own buggy assertion line created the dir, so a rerun reported MISSING_REGISTRY instead of VAULT_UNAVAILABLE — fixed with unique mkdtemp-based path + leftover dir removed.
- **Evidence/files/commit:** Committed in `7c2668a` "OLC-021: project and vault identity gate with fixture tests" (`src/core/project-identity.ts`, `tests/identity.test.ts`, `docs/TASKS.md`).
- **Remaining issues:** Registry convention `OLC/registry.json` is new (PRD only says "registry proyek di vault") — `olc-init` (OLC-022) must write exactly this shape. Unborn-HEAD repos and non-git projects are hard-blocked for now (documented limitation; revisit only if a use case demands it).
- **Next task:** OLC-022 — safe, idempotent `olc-init`.

### OLC-022 — Implement safe, idempotent `olc-init`
- **Status:** DONE (auto-continue instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-021, OLC-012
- **Goal:** Initialize a project without damaging existing work.
- **Work:** Propose project_id from repo name and require approval; collect/confirm vault path; prepare `.olc/` and vault structure; create missing docs; preserve existing files; report created/preserved/skipped/attention-needed; add dry-run if feasible.
- **Acceptance criteria:** Re-running init does not overwrite customized files; duplicate project_id prompts for a new ID; no hidden copy of master templates is required in vault.
- **Verification:** Run twice on temporary repo/vault fixtures, including pre-existing config and custom instructions.
- **Date:** 2026-10-12
- **Implemented:** New `src/init/index.ts`: `proposeProjectId` (sanitized repo basename) + `initProject({projectRoot, projectId?, vaultPath?, env?, dryRun?})` returning `{status: "ready"|"needs-decision", entries[], decision?}`. Flow: resolve repo root (reuses OLC-021) → id = explicit, else existing-config, else return proposal as needs-decision (approval = re-call with id) → vault = explicit > `OLC_VAULT_PATH` > existing config, else needs-decision (never invented) → duplicate-id check BEFORE any write (registered to another root → needs-decision, zero writes) → write phase creates only missing: `.olc/config.json`, `.olc/AGENTS.md` stub, `OLC/Projects/<id>/{index.md, current-state.md, decisions/, tasks/, logs/, memory/, taste/}`, registry entry in OLC-021's `OLC/registry.json` shape; existing files → `preserved`; invalid config / corrupt registry → `attention`, nothing overwritten. `dryRun` simulates the full report with zero writes. No templates copied into vault (references package `templates/` only). `tests/init.test.ts`: 8 fixture tests incl. approve-then-create (result passes OLC-021 `validateIdentity`), rerun byte-identical preservation, pre-existing config, duplicate-id zero-writes, dry-run, missing-vault asks, invalid-config flagged, id sanitization.
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 33 pass / 0 fail (14 + 11 prior + 8 new); `npm run build` OK; `npm pack --dry-run` → 15 files. No publish.
- **Evidence/files/commit:** Committed in `1d8253b` "OLC-022: safe idempotent init with dry-run" (`src/init/index.ts`, `tests/init.test.ts`, `docs/TASKS.md`).
- **Remaining issues:** Init is a library function, not a CLI command yet — wiring to an actual `olc-init` command/tool belongs to the plugin-tool tasks (M4/M7 area). `.opencode/agents|skills` placement (OLC-012 decision) not yet copied by init — content lands in OLC-030+, copy logic follows then.
- **Next task:** OLC-023 — Markdown vault and template adapters.

### OLC-023 — Add Markdown vault and template adapters
- **Status:** DONE (confirmed per standing instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-021
- **Goal:** Read/write structured Markdown using templates from the OLC package repository.
- **Work:** Add safe path resolver, frontmatter conventions if needed, atomic file writing where practical, initial templates for intent, plan, explore report, checkpoint, activity log, session summary, decision, taste rule.
- **Acceptance criteria:** Paths cannot escape vault/project root; existing documents are not silently replaced; templates are included in packed package.
- **Verification:** Path traversal tests, UTF-8 round-trip, existing-file preservation tests, package content check.
- **Date:** 2026-10-12
- **Implemented:** New `src/vault/index.ts`: `projectScopeRoot` + `resolveVaultDoc` (segments must be plain relative names; result must stay inside `<vault>/OLC/Projects/<id>/`, else `VaultError(PATH_ESCAPE)`); minimal flat `key: value` frontmatter (`parseFrontmatter`/`withFrontmatter`); `writeVaultDoc` (creates parents, temp-file + rename atomicity, refuses existing unless `overwrite: true` → `ALREADY_EXISTS`); `readVaultDoc` (UTF-8); `findTemplatesDir` (locates package `templates/` from running module, works from both `dist/` and `dist-tests/`); `renderTemplate` (`{{var}}` substitution, missing values or unknown template → `TEMPLATE_ERROR`, template names restricted to plain file names); `BUNDLED_TEMPLATES` list. New `templates/`: `intent.md`, `plan.md`, `explore-report.md`, `checkpoint.md`, `activity-log.md`, `session-summary.md`, `decision.md`, `taste-rule.md` (each with frontmatter + `{{vars}}`, Indonesian section hints). `tests/vault.test.ts`: 7 tests (traversal refusals incl. absolute/empty/dot segments, in-scope resolution, no-silent-replace + explicit overwrite, UTF-8 round-trip with CJK/emoji, frontmatter round-trip, render + error cases, all-templates-render + ship-in-package check via `findTemplatesDir`).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 40 pass / 0 fail (33 prior + 7 new); `npm run build` OK; `npm pack --dry-run` lists all 8 `templates/*.md`. No publish.
- **Evidence/files/commit:** Committed in `COMMIT1` (replaced with real SHA at commit time).
- **Remaining issues:** Init (OLC-022) still writes its own stub markdown directly instead of via this adapter + templates — converging that is optional polish for OLC-030+ when real content lands. No CLI wiring yet (belongs to later plugin-tool tasks).
- **Next task:** OLC-030 — base olc-plan and olc-build agent resources.

## M3 — Planning

### OLC-030 — Create base `olc-plan` and `olc-build` agent instruction resources
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-012
- **Goal:** Extend OpenCode default agent behavior rather than invent a wholly unrelated coding agent.
- **Work:** Verify current default instruction expectations; create `agents/olc-plan.md` and `agents/olc-build.md`; state boundaries and required explicit reading of `.olc/AGENTS.md`.
- **Acceptance criteria:** Plan agent cannot edit app source; build agent requires approved plan; both validate project identity before memory operations.
- **Verification:** Instruction review against tests/scenarios and integration smoke test where supported.

### OLC-031 — Implement `olc-explore` skill
- **Status:** TODO
- **Priority:** P1
- **Depends on:** OLC-023, OLC-030
- **Goal:** Clarify complex/uncertain tasks before planning.
- **Work:** Explore source and user request, record findings/evidence/questions in one current report, preserve important revision reasoning.
- **Acceptance criteria:** Explore is optional; produces no app code changes; report is saved in correct project vault; user can choose direct Plan instead.
- **Verification:** Scenario test for complex request and a simple task selecting direct Plan.

### OLC-032 — Implement `intent.md` and `plan.md` workflow
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-023, OLC-030
- **Goal:** Keep what/why separate from how.
- **Work:** Generate the two docs together; define modular tasks, per-task expected result, acceptance criteria, tests, dependencies, risks, open questions, status.
- **Acceptance criteria:** No coding before both documents are approved; revisions update current docs and preserve important history/reasons.
- **Verification:** Tests for draft, approval, revision, and rejected plan.

### OLC-033 — Define task registry, branch matching, and transitions
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-021, OLC-032
- **Goal:** Track primary task plus related tasks on a branch.
- **Work:** Implement agreed states and transition validation; register branch associations; resume recommends most recently active task and asks confirmation; do not auto-switch branch.
- **Acceptance criteria:** Unknown/ambiguous branch asks user; stale task yields recommendation only; task remains open until user confirms completion.
- **Verification:** State transition unit tests and branch/task ambiguity scenarios.

### OLC-034 — Implement planning approval and scope-change return path
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-032, OLC-033
- **Goal:** Ensure implementation follows the plan users approved.
- **Work:** Represent plan approval; detect scope-change request; checkpoint safe progress; return to plan revision; require approval before continuing impacted work.
- **Acceptance criteria:** Build refuses unapproved plans; scope changes cannot silently replace the approved plan.
- **Verification:** End-to-end tests for no approval, approved plan, revision request, and resumed execution.

## M4 — Build and verify

### OLC-040 — Implement bounded `olc-build` task execution
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-034
- **Goal:** Execute one approved modular task at a time.
- **Work:** Load only relevant project context; inspect source and Git; implement within acceptance criteria; make small technical decisions without expanding scope.
- **Acceptance criteria:** Missing approval or context mismatch blocks implementation; out-of-scope work is proposed, not performed.
- **Verification:** Controlled fixture tasks and source diff assertions.

### OLC-041 — Implement test/report/escalation behavior
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-040
- **Goal:** Make results evidence-backed.
- **Work:** Run relevant checks, capture outcomes, retry fixes a bounded number of times, then stop and report attempts/options if unresolved or risky.
- **Acceptance criteria:** No fabricated test claims; in-scope defects can be fixed; scope/architecture changes require plan revision.
- **Verification:** Passing test, failing test, command error, and repeated failure scenarios.

## M5 — Git checkpoint and restore

### OLC-050 — Define checkpoint safety strategy (spike)
- **Status:** DONE (confirmed by user 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-002
- **Goal:** Prove how to commit only OLC-owned changes while protecting manual edits.
- **Work:** Experiment in temporary repositories with clean tree, user-modified tracked files, untracked files, partially overlapping edits in one file, and staged changes. Compare explicit-path/hunk staging and isolated execution approaches. Record the safest MVP constraint.
- **Acceptance criteria:** A reviewed technical decision exists; cases where ownership cannot be determined stop for user guidance; no unsafe `git add .` checkpoint flow.
- **Verification:** Automated fixtures demonstrate unrelated modifications and untracked files are untouched.
- **Date:** 2026-10-12
- **Implemented:** SPIKE in `/tmp/opencode/olc50/spike` (throwaway repo, real repo untouched). Decision recorded in `docs/DECISIONS.md` row #5 (Resolved): checkpoint stages ONLY explicit OLC-owned paths (`git add -- <paths>`) and commits with pathspec (`git commit -- <paths>`); OLC snapshots each file's content at write time and aborts for user guidance when an owned file no longer matches its snapshot (foreign edit) or carries foreign staged changes; `git add .`/`-A`, plain `git commit`, and `git add -p` are banned from the checkpoint flow. Hunk staging rejected: with default diff context, nearby OLC+user edits merge into ONE hunk (proven: single `@@ -1,3 +1,5 @@` hunk containing both `+OLC-TOP` and `+USER-BOTTOM`), so even hunk selection cannot separate them; scripted patch surgery is fragile and `git add -p` is interactive-only. Isolated execution (worktree/branch per task) rejected for MVP: conflicts with D-004 (user controls branch selection; no automatic branching).
- **Verification commands/results:** Scenario 1 (unsafe, proven bad): mixed OLC edit + user tracked edit + untracked file → `git add .` + commit sweeps ALL THREE into the checkpoint (`app.txt`, `user.txt`, `notes.txt`). Scenario 2 (safe): `git add -- app.txt` → commit contains ONLY `app.txt`; `user.txt` edit and `notes.txt` survive byte-identical (`cat` verified, status still shows `M user.txt`, `?? notes.txt`). Scenario 3a (trap): user pre-stages `user.txt`, plain `git commit` includes it alongside `app.txt`. Scenario 3b (safe): `git commit -- app.txt` commits only `app.txt`; user's staged `user.txt` stays staged and uncommitted. Scenario 4 (overlap): OLC top-edit + user bottom-edit in `shared.txt` → `git add -- shared.txt` stages BOTH (`+OLC-TOP`, `+USER-BOTTOM` in cached diff); detection via byte-compare against OLC's write-time snapshot reports `DIFFERS → STOP and ask`. Positive control: file matching its snapshot reports `IDENTICAL → safe to stage`.
- **Evidence/files/commit:** Committed in `de5eeea` "OLC-050: checkpoint safety spike decision and evidence" (`docs/TASKS.md` entry + `docs/DECISIONS.md` row #5 resolved). No `src/` changes — the enforced flow belongs to OLC-051.
- **Remaining issues:** None for the spike; OLC-051 must implement exactly this flow (inspect → snapshot-compare → explicit-path stage → pathspec commit → abort on ambiguity).
- **Next task:** OLC-051 — Implement Git inspection and checkpoint commit.

### OLC-051 — Implement Git inspection and checkpoint commit
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-050, OLC-040
- **Goal:** Create durable named commits only for intended work.
- **Work:** Inspect branch/HEAD/status/diff/untracked files; select intended changes safely; generate clear checkpoint commit message; write checkpoint record with commit SHA, task, timestamp, summary, verification results.
- **Acceptance criteria:** No accidental inclusion of unrelated changes; abort on ambiguity; checkpoint record and Git commit cross-reference one another.
- **Verification:** Git fixture tests and inspect resulting commit file list.

### OLC-052 — Implement restore-to-checkpoint safely
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-051
- **Goal:** Restore code contents to an earlier checkpoint without deleting later history.
- **Work:** Resolve checkpoint to commit; inspect current state and risks; apply selected snapshot as a new change/commit with traceable message; require confirmation if current changes may be lost.
- **Acceptance criteria:** Later commits stay reachable; restore result matches selected snapshot for intended paths; uncommitted/untracked unrelated changes are protected or operation aborts.
- **Verification:** Three-checkpoint scenario, restore checkpoint 2 from checkpoint 3, assert history survives and code matches checkpoint 2.

### OLC-053 — Implement pre-switch and task-final checkpoint policy
- **Status:** TODO
- **Priority:** P1
- **Depends on:** OLC-051, OLC-041
- **Goal:** Checkpoint important milestones and final state of verified tasks.
- **Work:** Trigger at important milestones, explicit request, before task switch, and after final verification for completed task. Do not treat commit as task completion.
- **Acceptance criteria:** Triggers do not repeatedly commit unchanged state; final checkpoint is only created when safe; task still needs user confirmation to close.
- **Verification:** Tests for milestone, explicit request, task switch, unchanged tree, failed tests, and final approval flow.

## M6 — Continuity, logs, memory, taste

### OLC-060 — Implement activity event logging and checkpoint history
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-023, OLC-051
- **Goal:** Record important activity in durable Markdown.
- **Work:** Define event schema and append/update behavior; avoid secret logging and per-tool-call noise; record milestones and Git references.
- **Acceptance criteria:** Log can be reconstructed/read; writes validate vault identity; interruptions do not corrupt previous log entries.
- **Verification:** Simulated interruption, invalid vault, permissions error, and log rotation/append tests as appropriate.

### OLC-061 — Implement resume and checkpoint summary
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-033, OLC-060
- **Goal:** Rebuild enough context after interruption.
- **Work:** Inspect actual Git state; read latest project state, current task plan, last event, checkpoint; recommend most recently active task and ask confirmation.
- **Acceptance criteria:** Never resumes coding automatically; surfaces status/diff/untracked changes and last verification; ambiguity blocks.
- **Verification:** Clean interruption, uncommitted changes, unknown branch, two unfinished tasks, unavailable vault scenarios.

### OLC-062 — Implement `olc-memory` progressive retrieval
- **Status:** TODO
- **Priority:** P1
- **Depends on:** OLC-023, OLC-060
- **Goal:** Retrieve relevant memory without loading entire vault.
- **Work:** Read project index/current state first, then relevant decisions, plans, logs and patterns by query/context.
- **Acceptance criteria:** Does not scan unrelated project folders by default; records updates only in validated project scope.
- **Verification:** Multi-project vault fixtures ensure isolation and relevant retrieval.

### OLC-063 — Implement session summary in plain language
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-060, OLC-061
- **Goal:** End each normal session with a useful, non-technical summary.
- **Work:** Include what was done, observed result, tests, unfinished work, blockers/risks, next step, checkpoint if created.
- **Acceptance criteria:** Indonesian/plain language by default for this project; factual claims map to actual event/test data; no claiming a summary is guaranteed after hard kill.
- **Verification:** Normal completion, blocked session, no-code-change session, and partial failure scenarios.

### OLC-064 — Implement taste proposal lifecycle
- **Status:** TODO
- **Priority:** P1
- **Depends on:** OLC-023, OLC-062
- **Goal:** Learn project-specific preferences without silently changing behavior.
- **Work:** Record repeat signals, prepare proposed taste rule with examples/evidence, maintain `pending`/`active`/`rejected` statuses.
- **Acceptance criteria:** Only user approval activates a rule; scope is one project; approved intent/plan is not overwritten by taste memory.
- **Verification:** Pending remains inactive, approval activates, rejection stays inactive, cross-project isolation.

### OLC-065 — Validate vault/project at important operations
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-021, OLC-060
- **Goal:** Catch a missing/mismatched vault before damaging the wrong context.
- **Work:** Call lightweight validation at session start and before critical read/write/commit/restore operations.
- **Acceptance criteria:** Validation does not reread the whole vault; mismatch blocks operation.
- **Verification:** Vault changed/unmounted between operations; wrong project registry; inaccessible path.

## M7 — Release hardening

### OLC-070 — Documentation and safe installation flow
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-012, OLC-020, OLC-022
- **Goal:** A first-time user can install, activate, initialize, verify, update, and uninstall OLC.
- **Work:** README, install config snippet/installer if selected, migration/overwrite policy, commands, troubleshooting, supported versions, security notes.
- **Acceptance criteria:** Distinguishes npm development install from OpenCode plugin activation and OLC project initialization; every command tested.
- **Verification:** Follow docs in a clean environment from start to finish.

### OLC-071 — Package and compatibility smoke test
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-010, OLC-070
- **Goal:** Test what actually ships.
- **Work:** Build, `npm pack --dry-run`, inspect package files, install tarball locally, and test in clean OpenCode profile.
- **Acceptance criteria:** No missing agent/skill/template resources; no development-only dependency required at runtime; package activation works as documented.
- **Verification:** Store command outputs or CI evidence.

### OLC-072 — End-to-end MVP acceptance matrix
- **Status:** TODO
- **Priority:** P0
- **Depends on:** OLC-022, OLC-034, OLC-041, OLC-052, OLC-063, OLC-064, OLC-071
- **Goal:** Validate one full user journey.
- **Work:** Init dummy app/vault; plan and approve; build/test; checkpoint; simulate interruption; resume with confirmation; restore earlier checkpoint; propose taste rule; finish with simple-language summary.
- **Acceptance criteria:** Every critical safety gate passes; unresolved limitations documented.
- **Verification:** Completed test matrix and recorded results.

### OLC-073 — Prepare MVP pre-release
- **Status:** TODO
- **Priority:** P1
- **Depends on:** OLC-072
- **Goal:** Create a usable version for controlled testing.
- **Work:** Version bump, changelog, package dry-run, documentation review, known limitations, npm publish preparation without publishing unless user explicitly requests it.
- **Acceptance criteria:** No known P0 safety/test failures; version and install instructions are consistent.
- **Verification:** Release checklist marked with evidence. Publishing remains a separate explicitly approved action.

## Deferred

| ID | Item | Status | Reason |
|---|---|---|---|
| D-001 | Dashboard UI | DEFERRED | Not needed to validate MVP. |
| D-002 | Mandatory MCP integration | DEFERRED | Direct filesystem access is the agreed MVP path. |
| D-003 | Self-modifying skills | DEFERRED | Too risky before stable learning and approval loop. |
| D-004 | Automatic branch creation/switching/worktrees | DEFERRED | User controls branch selection. |
| D-005 | Full legacy document migration | DEFERRED | Template updates apply only to new documents. |

## First execution batch

Start with the following order; do not attempt all tasks in parallel:

1. OLC-001 — repository skeleton and decisions.
2. OLC-002 — npm/TypeScript skeleton.
3. OLC-010 — verify OpenCode plugin contract (can run alongside setup only if it does not change scope).
4. OLC-011 — minimal plugin vertical slice.
5. OLC-012 — resource delivery/activation decision.
6. OLC-050 — Git checkpoint safety spike before implementing commits/restores.

After OLC-011 passes a clean OpenCode smoke test, proceed through M2/M3, then implement M4 and M5 with temporary-repository integration tests.

## Work log template for each task

When changing a task status, append or fill:

- **Status:**
- **Date:**
- **Implemented:**
- **Verification commands/results:**
- **Evidence/files/commit:**
- **Remaining issues:**
- **Next task:**
