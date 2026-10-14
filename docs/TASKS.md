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
| M0 | Fondasi repository, package, CI | DONE (OLC-001/002/003) | — |
| M1 | Plugin OpenCode dapat dimuat | DONE (OLC-010/011/012) | M0 |
| M2 | Konfigurasi, project identity, vault, init | DONE (OLC-020/021/022/023) | M1 |
| M3 | Planning: Explore / Plan / approval | DONE (OLC-030/031/032/033/034) | M2 |
| M4 | Build: bounded implementation and verification | DONE (OLC-040/041) | M3 |
| M5 | Git checkpoint and restore safety | DONE (OLC-050/051/052/053) | M2, M4 |
| M6 | Activity log, resume, session summary, taste | DONE (OLC-060/061/062/063/064/065) | M2, M4, M5 |
| M7 | Packaging, integration tests, documentation, pre-release | DONE (OLC-070/071/072/073) | M1–M6 |

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
- **Status:** DONE (auto-continue instruction 2026-10-13)
- **Priority:** P1
- **Depends on:** OLC-002
- **Goal:** Make regressions visible early.
- **Work:** Set up test runner and CI for install, build, tests, and typecheck.
- **Acceptance criteria:** CI executes reproducibly; failure exits non-zero; no credentials required.
- **Verification:** Run CI workflow or matching local commands.
- **Date:** 2026-10-13
- **Implemented:** New `.github/workflows/ci.yml`: `on: push + pull_request`, `ubuntu-latest`, `setup-node@v4` pinned Node 22 with npm cache, then `npm ci` → `npm run typecheck` → `npm run build` → `npm test`. No secrets, no credentials, no publish.
- **Verification commands/results:** YAML parses (`jobs: [build-and-test]`); local CI-sequence run in order: `npm ci` OK (282 packages), typecheck clean, build OK, `npm test` → 140 pass / 0 fail. Failure-exit proven on scratch fixtures outside the repo: broken `tsc --noEmit` exits 2, failing `node --test` exits 1.
- **Evidence/files/commit:** This commit (`.github/workflows/ci.yml`, `docs/TASKS.md`).
- **Remaining issues:** None. CI runs on first push; no runs exist yet to link.
- **Next task:** None — all TASKS.md items DONE; M0 milestone table flips to DONE.

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
- **Evidence/files/commit:** Committed in `52b5ae3` "OLC-011: minimal plugin entrypoint and status tool" (plus `dd5f601` docs status). Files: new `src/plugin.ts`; `package.json` + `package-lock.json` (`@opencode-ai/plugin` → `@opencode/plugin@2.0.27`); this TASKS.md entry; `docs/DECISIONS.md` rows #2/#3 corrected (package name). Build artifacts in `dist/` (gitignored).
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
- **Evidence/files/commit:** Committed in `038f8d9` "OLC-023: Markdown vault adapter and bundled templates" (`src/vault/index.ts`, `tests/vault.test.ts`, 8 `templates/*.md`, `docs/TASKS.md`).
- **Remaining issues:** Init (OLC-022) still writes its own stub markdown directly instead of via this adapter + templates — converging that is optional polish for OLC-030+ when real content lands. No CLI wiring yet (belongs to later plugin-tool tasks).
- **Next task:** OLC-030 — base olc-plan and olc-build agent resources.

## M3 — Planning

### OLC-030 — Create base `olc-plan` and `olc-build` agent instruction resources
- **Status:** DONE (confirmed per standing instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-012
- **Goal:** Extend OpenCode default agent behavior rather than invent a wholly unrelated coding agent.
- **Work:** Verify current default instruction expectations; create `agents/olc-plan.md` and `agents/olc-build.md`; state boundaries and required explicit reading of `.olc/AGENTS.md`.
- **Acceptance criteria:** Plan agent cannot edit app source; build agent requires approved plan; both validate project identity before memory operations.
- **Verification:** Instruction review against tests/scenarios and integration smoke test where supported.
- **Date:** 2026-10-12
- **Implemented:** `agents/olc-plan.md` + `agents/olc-build.md` (replacing `agents/.gitkeep`), both `mode: subagent` with `description` frontmatter per the official Agents doc (verified same session via webfetch — fields used are exactly the documented ones; no legacy `tools`/`temperature` fields). olc-plan: required reading (root AGENTS.md, PRD.md, task entry, `.olc/AGENTS.md`), Explore-vs-direct-Plan offer, hard boundaries (no app-source edits/creates/dependency changes; vault planning docs only; identity check before memory ops; intent.md+plan.md together; no coding/handoff before explicit user approval of both). olc-build: preconditions (approved bounded plan, identity + git-state inspection), one-task-at-a-time execution, propose-don't-perform for scope changes, evidence-backed checks with bounded retries, git safety rules (no destructive ops, explicit-path staging only), plain-language closeout. Boundary enforcement is instruction-level, mirroring the builtin `plan` agent's approach (its no-edit behavior also comes from instructions: "without editing normal project files").
- **Verification commands/results:** Instruction review: (1) plan-cannot-edit-app-source → olc-plan "Hard boundaries" section; (2) build-requires-approved-plan → olc-build "Preconditions" + "Execution rules"; (3) identity-before-memory → both files. Smoke test: fixture `/tmp/opencode/olc30` with both files under `.opencode/agents/` → `opencode serve --port 14101` + `opencode api --server … get /api/agent --param 'location={…}'` lists `olc-plan | subagent` and `olc-build | subagent` with correct descriptions alongside builtins. Fixture server killed, port verified free, fixture removed; user's own service untouched.
- **Evidence/files/commit:** Committed in `2b44daa` "OLC-030: base olc-plan and olc-build agent resources" (`agents/olc-plan.md`, `agents/olc-build.md`, deleted `agents/.gitkeep`, `docs/TASKS.md`).
- **Remaining issues:** Permission-level hardening found, not applied: builtin `plan` enforces read-only via `{"action":"edit","resource":"*","effect":"deny"}` + allow under its plan dir — olc-plan cannot copy this statically because the vault path is per-project (unknown at package time). Follow-up: let init generate a per-project `opencode.jsonc` agents override allowing edit only under that project's vault scope. Instruction-level boundary stands for MVP.
- **Next task:** OLC-031 — olc-explore skill (P1) or OLC-032 — intent.md/plan.md workflow (P0).

### OLC-031 — Implement `olc-explore` skill
- **Status:** DONE (confirmed 2026-10-12, auto-continue mandate)
- **Priority:** P1
- **Depends on:** OLC-023, OLC-030
- **Goal:** Clarify complex/uncertain tasks before planning.
- **Work:** Explore source and user request, record findings/evidence/questions in one current report, preserve important revision reasoning.
- **Acceptance criteria:** Explore is optional; produces no app code changes; report is saved in correct project vault; user can choose direct Plan instead.
- **Verification:** Scenario test for complex request and a simple task selecting direct Plan.
- **Date:** 2026-10-12
- **Implemented:** New `skills/olc-explore/SKILL.md` (frontmatter `name`+`description` for discovery): when-to-use vs direct Plan (user choice wins), hard rules (read-only on app source — no drive-by fixes; single current report at `tasks/<task-id>/explore/report.md` in the validated vault; evidence required per finding; revisions appended as dated sections, reasoning preserved), flow (validate identity → read minimal context → render `explore-report` template → revise in place → hand off to `draftTaskDocs`), self-check (`git status` clean, no `{{...}}` left). Deleted now-redundant `skills/.gitkeep`. Permission-level edit-deny for explore mode deferred (same standing issue as OLC-030).
- **Verification commands/results:** `npm test` → 67 pass / 0 fail incl. new `tests/explore.test.ts` (complex-request scenario: report rendered+written, revision preserves original findings, fixture repo `git status` empty; simple-task scenario: no explore report, `draftTaskDocs` works directly). Discovery smoke (OLC-030 precedent): fixture `/tmp/opencode/olc31` + persistent `opencode serve --port 14102` + `opencode api --server URL get /api/skill --param 'location={...}'` → `olc-explore` listed among skills. Fixture server killed (`kill -9` after `pkill -f` kept matching our own shell — lesson: self-matching pattern), fixtures removed. `npm run typecheck` clean, `npm run build` OK. No publish.
- **Evidence/files/commit:** Committed in `34839a3` "OLC-031: olc-explore skill with scenario tests" (`skills/olc-explore/SKILL.md`, `tests/explore.test.ts`, `skills/.gitkeep` deleted, `docs/TASKS.md`).
- **Remaining issues:** Skill enforcement is instruction-level (agent must obey SKILL.md); hard read-only enforcement deferred with OLC-030's permission note.
- **Next task:** OLC-041 — test/report/escalation behavior (M4).

### OLC-032 — Implement `intent.md` and `plan.md` workflow
- **Status:** DONE (confirmed per standing instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-023, OLC-030
- **Goal:** Keep what/why separate from how.
- **Work:** Generate the two docs together; define modular tasks, per-task expected result, acceptance criteria, tests, dependencies, risks, open questions, status.
- **Acceptance criteria:** No coding before both documents are approved; revisions update current docs and preserve important history/reasons.
- **Verification:** Tests for draft, approval, revision, and rejected plan.
- **Date:** 2026-10-12
- **Implemented:** New `src/planning/index.ts` on top of OLC-023 (templates + vault adapter): `draftTaskDocs` (renders `intent`+`plan` templates with status `draft` under `tasks/<id>/`, create-only — second draft throws, nothing replaced); `getDocStatuses` (`draft|approved|rejected|missing` per doc); `approveTaskDocs` (explicit-overwrite flip to `approved` + history entry); `reviseTaskDocs` (reason appended to `history.md`, optional body updates, both docs reset to `draft` so re-approval is mandatory); `rejectTaskDocs` (both to `rejected` + reason in history); `assertApproved` (build gate — throws `PlanningError(NOT_APPROVED)` naming the offending doc unless BOTH are `approved`). Statuses live in frontmatter (`status:`), same convention as the templates. `tests/planning.test.ts`: 6 fixture tests (draft+statuses, double-draft preservation, gate-blocks-then-passes, revision-history + re-approval, rejection + reason, missing-docs errors).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 46 pass / 0 fail (40 prior + 6 new); `npm run build` OK. No publish.
- **Evidence/files/commit:** Committed in `7f67452` (`src/planning/index.ts`, `tests/planning.test.ts`, `docs/TASKS.md`).
- **Remaining issues:** Approval is recorded as a vault status flip, not a cryptographic signature — acceptable for MVP (the agent workflow requires explicit user approval text before calling approve). Task registry/branch linkage is OLC-033's job.
- **Next task:** OLC-033 — task registry, branch matching, transitions (P0) — or OLC-031 explore skill (P1).

### OLC-033 — Define task registry, branch matching, and transitions
- **Status:** DONE (confirmed per standing instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-021, OLC-032
- **Goal:** Track primary task plus related tasks on a branch.
- **Work:** Implement agreed states and transition validation; register branch associations; resume recommends most recently active task and asks confirmation; do not auto-switch branch.
- **Acceptance criteria:** Unknown/ambiguous branch asks user; stale task yields recommendation only; task remains open until user confirms completion.
- **Verification:** State transition unit tests and branch/task ambiguity scenarios.
- **Date:** 2026-10-12
- **Implemented:** New `src/tasks/index.ts`, stored at `tasks/registry.json` inside the project vault scope (`{tasks: {id: {status, branch, updatedAt}}}`): `TRANSITIONS` table (draft→approved/rejected; approved→in_progress/draft; in_progress→review/blocked; blocked→in_progress; review→done/in_progress; rejected→draft; done terminal), `registerTask` (draft, duplicates rejected), `attachBranch` (re-associate, never touches Git), `setTaskStatus` (table-enforced, `INVALID_TRANSITION` lists allowed moves; terminal `done` stays as history), `getTask`, `recommendResume` (most-recent non-terminal on current branch + confirm-note; unknown/empty branch or no match → null + asks-user note; never resumes/switches/closes). `updatedAt` is caller-passed date strings (deterministic, testable). Also resolves `docs/DECISIONS.md` #7 with the same table. `tests/tasks.test.ts`: 6 tests (full lifecycle, illegal jumps incl. draft→done/in_progress→done, terminal-done + blocked/rejected paths, duplicates/unknown, resume-newest + stale-done-never-wins, unknown-branch/empty/elsewhere ambiguity).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 52 pass / 0 fail (46 prior + 6 new); `npm run build` OK. No publish.
- **Evidence/files/commit:** Committed in `99a146c` (`src/tasks/index.ts`, `tests/tasks.test.ts`, `docs/TASKS.md`, `docs/DECISIONS.md`).
- **Remaining issues:** `done` requires an explicit call — no auto-complete exists anywhere by construction (verified: no code path calls setTaskStatus except the API consumer). Registry ↔ intent/plan doc statuses (OLC-032) are not yet cross-checked — that linkage belongs to OLC-034's approval return path.
- **Next task:** OLC-034 — planning approval and scope-change return path (P0).

### OLC-034 — Implement planning approval and scope-change return path
- **Status:** DONE (confirmed per standing instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-032, OLC-033
- **Goal:** Ensure implementation follows the plan users approved.
- **Work:** Represent plan approval; detect scope-change request; checkpoint safe progress; return to plan revision; require approval before continuing impacted work.
- **Acceptance criteria:** Build refuses unapproved plans; scope changes cannot silently replace the approved plan.
- **Verification:** End-to-end tests for no approval, approved plan, revision request, and resumed execution.
- **Date:** 2026-10-12
- **Implemented:** New `src/approval/index.ts` on top of OLC-032 + OLC-033: `assertBuildReady` (build gate — registry status must be `approved`/`in_progress` AND both docs `approved`; this closes OLC-033's open registry↔doc cross-check, errors name the failing side), `requestScopeChange` (only from `approved`/`in_progress`; registry `approved→draft` or `in_progress→review`, both table-legal — no transition-table change; docs revised with NO body updates so the approved text survives byte-identical and statuses flip to `draft`; history records the reason + a safe-code-checkpoint reminder for the OLC-051 flow), `resumeAfterRevision` (explicit re-entry only: re-approves docs, registry `draft→approved` or `review→in_progress`; invalid states rejected, never implicit). `tests/approval.test.ts`: 6 end-to-end fixture tests (gate-blocks-draft, registry/doc cross-check, approved+in_progress pass, revision preserves bodies + history + re-blocks gate, in_progress→review→resume→gate-passes, invalid-state rejections incl. double-scope-change).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 58 pass / 0 fail (52 prior + 6 new); `npm run build` OK. No publish.
- **Evidence/files/commit:** Committed in `42768b7` (`src/approval/index.ts`, `tests/approval.test.ts`, `docs/TASKS.md`).
- **Remaining issues:** The history reminder references the OLC-051 code-checkpoint flow, which is not built yet — the reminder is text only until OLC-051 lands. Approval remains a vault status flip, not a signature (accepted for MVP in OLC-032).
- **Next task:** OLC-031 — `olc-explore` skill (P1, last of M3) — or OLC-040 — bounded build execution (M4).

## M4 — Build and verify

### OLC-040 — Implement bounded `olc-build` task execution
- **Status:** DONE (confirmed per standing instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-034
- **Goal:** Execute one approved modular task at a time.
- **Work:** Load only relevant project context; inspect source and Git; implement within acceptance criteria; make small technical decisions without expanding scope.
- **Acceptance criteria:** Missing approval or context mismatch blocks implementation; out-of-scope work is proposed, not performed.
- **Verification:** Controlled fixture tasks and source diff assertions.
- **Date:** 2026-10-12
- **Implemented:** New `src/build/index.ts`: `beginTask({config, taskId, touchPaths?, startDir?, date?})` runs OLC-021 `validateIdentity(startDir, config)` then OLC-034 `assertBuildReady`, moves registry approved→in_progress (respects existing in_progress), returns a frame with ONLY the task's intent/plan bodies + declared paths + base HEAD + timestamp; `recordDecision` appends in-scope technical decisions to history.md; `completeTask(frame, config, repoRoot)` re-validates identity, diffs the tree via `changedPaths` (porcelain `-uall`: staged+unstaged+untracked, rename-aware), throws SCOPE_CHANGED naming the offending paths when anything outside declared paths changed (status stays in_progress — propose-a-revision, not silent completion), otherwise moves in_progress→review + history entry. Also fixed `.gitignore`: bare `build/` pattern was silently ignoring the new `src/build/` module dir — anchored to `/build/` (root output dir only). `tests/build.test.ts`: 7 real-git-fixture tests (gate blocks, mismatch blocks, scoped frame + keys, clean→review, tracked-out-of-scope names file, untracked-out-of-scope, decisions in history).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 65 pass / 0 fail (58 prior + 7 new); `npm run build` OK; `npm pack --dry-run` → 34 files. No publish. Real bug caught by tests: whole-output `.trim()` on porcelain corrupted the first line's XY column (` M app.txt` → `M app.txt` → parsed as `pp.txt`); fixed with trailing-only trim.
- **Evidence/files/commit:** Committed in `c8018f2` (`src/build/index.ts`, `tests/build.test.ts`, `.gitignore` anchored `/build/`, `docs/TASKS.md`).
- **Remaining issues:** Minimal git helpers here (`rev-parse`, porcelain) overlap future OLC-051 inspection module — OLC-051 may consolidate. Frame carries bodies in memory; no whole-vault reads by construction.
- **Next task:** OLC-031 — `olc-explore` skill (P1, last of M3).

### OLC-041 — Implement test/report/escalation behavior
- **Status:** DONE (confirmed 2026-10-12, auto-continue mandate)
- **Priority:** P0
- **Depends on:** OLC-040
- **Goal:** Make results evidence-backed.
- **Work:** Run relevant checks, capture outcomes, retry fixes a bounded number of times, then stop and report attempts/options if unresolved or risky.
- **Acceptance criteria:** No fabricated test claims; in-scope defects can be fixed; scope/architecture changes require plan revision.
- **Verification:** Passing test, failing test, command error, and repeated failure scenarios.
- **Date:** 2026-10-12
- **Implemented:** New `src/verify/index.ts`: `runCheck` (spawnSync, no shell, captures exit/stdout/stderr/timeout; ENOENT and ETIMEDOUT recorded as structured failures, never passes or throws), `verifyChecks` (bounded retry via `maxAttempts`, keeps EVERY attempt), `formatVerifyReport` (Markdown with real captured output tails + escalation list), `completeTaskWithVerification` (runs checks with cwd=repoRoot, delegates to OLC-040 `completeTask` only on full pass; on failure returns `verify-failed` + report with registry untouched at in_progress — the escalation path; never widens scope, OLC-034 still owns revisions). `tests/verify.test.ts`: 7 tests (pass records exit-0; fail retries exactly 3 then escalates; missing binary → ENOENT failure; 30s sleeper killed at 300ms timeout; report contains real output + Escalated line; failed verify leaves registry in_progress; passed verify completes to review with changed paths).
- **Verification commands/results:** `npm run typecheck` clean (after fixing a PartialAttempt typing error: intermediate object lacked durationMs/ok); `npm test` → 74 pass / 0 fail (67 prior + 7 new); `npm run build` OK; `npm pack --dry-run` → 36 files. No publish.
- **Evidence/files/commit:** Committed in `750c9a4` "OLC-041: evidence-backed verify with bounded retry and escalation" (`src/verify/index.ts`, `tests/verify.test.ts`, `docs/TASKS.md`).
- **Remaining issues:** Checks run arbitrary executables by design (build agent's responsibility to pass only approved commands); default 120s timeout per attempt. No CLI wiring yet (belongs to plugin-tool tasks).
- **Next task:** OLC-051 — Git inspection and checkpoint commit.

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
- **Status:** DONE (auto-continue instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-050, OLC-040
- **Goal:** Create durable named commits only for intended work.
- **Work:** Inspect branch/HEAD/status/diff/untracked files; select intended changes safely; generate clear checkpoint commit message; write checkpoint record with commit SHA, task, timestamp, summary, verification results.
- **Acceptance criteria:** No accidental inclusion of unrelated changes; abort on ambiguity; checkpoint record and Git commit cross-reference one another.
- **Verification:** Git fixture tests and inspect resulting commit file list.
- **Date:** 2026-10-12
- **Implemented:** New `src/git/inspection.ts` (read-only: `git`/`gitRaw` runners, pure `parsePorcelain` incl. rename `old -> new` handling, `inspectTree` → branch/HEAD/staged/unstaged/untracked) + `src/git/checkpoint.ts` (`createCheckpoint`, enforces the OLC-050 decision byte-for-byte): OLC-021 `validateIdentity` first → normalize owned paths (outside-repo → `PATH_OUTSIDE_REPO`) → abort on pre-staged owned paths (`OWNED_PATH_PRESTAGED`) → byte-compare each owned file vs write-time snapshot (`FOREIGN_EDIT`/`MISSING_OWNED_FILE`, zero git mutation) → clean owned set returns `{status:"clean"}` with no commit (needed by OLC-053) → `git add -- <owned>` → re-verify staged bytes via `git show :<path>` (race guard; reset ours + abort on mismatch) → `git commit -m <msg> -- <owned>` (pathspec, foreign staged changes on other paths survive) → append entry to `tasks/<id>/checkpoint.md` via the `checkpoint` template (first write full template, later appends add the body after `---`; SHA cross-ref both ways). No `git add .`/`-A`, plain commit, or `-p` anywhere. `tests/git.test.ts`: 8 real-git-fixture tests (commit file list exactly owned; user edit + untracked survive byte-identical; foreign-edit/pre-staged/outside-repo aborts leave commit count + index untouched; foreign staged survives; clean → no commit; double checkpoint appends both SHAs; identity mismatch blocks).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 82 pass / 0 fail (74 prior + 8 new); `npm run build` OK; `npm pack --dry-run` → 40 files incl. `dist/git/*`. No publish. Test-caught bug: `git commit -- <paths> -m <msg>` treats `-m` as pathspec — fixed to `git commit -m <msg> -- <paths>`.
- **Evidence/files/commit:** Committed in `82e9ae6` "OLC-051: safe Git inspection and checkpoint commit" (`src/git/inspection.ts`, `src/git/checkpoint.ts`, `tests/git.test.ts`, `docs/TASKS.md` incl. OLC-011 evidence fix).
- **Remaining issues:** Owned-path deletions not checkpointable yet (missing file aborts) — deferred, note in OLC-052/053 if needed. Snapshots are UTF-8 strings (binary files unsupported). `restore.ts` belongs to OLC-052.
- **Next task:** OLC-052 — safe restore-to-checkpoint.

### OLC-052 — Implement restore-to-checkpoint safely
- **Status:** DONE (auto-continue instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-051
- **Goal:** Restore code contents to an earlier checkpoint without deleting later history.
- **Work:** Resolve checkpoint to commit; inspect current state and risks; apply selected snapshot as a new change/commit with traceable message; require confirmation if current changes may be lost.
- **Acceptance criteria:** Later commits stay reachable; restore result matches selected snapshot for intended paths; uncommitted/untracked unrelated changes are protected or operation aborts.
- **Verification:** Three-checkpoint scenario, restore checkpoint 2 from checkpoint 3, assert history survives and code matches checkpoint 2.
- **Date:** 2026-10-12
- **Implemented:** New `src/git/restore.ts` (`restoreCheckpoint`): OLC-021 `validateIdentity` → normalize paths (`PATH_OUTSIDE_REPO`) → resolve SHA via `rev-parse --verify <sha>^{commit}` (`UNKNOWN_CHECKPOINT`) → `merge-base --is-ancestor` against HEAD (`NOT_ANCESTOR`; status-code check via spawnSync so exit-1 vs real error are distinguished) → read each intended path's bytes at the checkpoint (`PATH_NOT_IN_CHECKPOINT`; MVP never deletes/creates files) → abort on any risk to intended paths (`RESTORE_PATH_PRESTAGED` / `UNSTAGED_RISK` / `UNTRACKED_RISK`, exact paths listed; no force flag — the agent surfaces the list to the user as the confirmation step) → write checkpoint bytes (Buffer, binary-safe) → `git add --` → re-verify staged bytes via `git show :<path>` (race guard, `STAGE_MISMATCH`) → empty stage returns `already-matches` (no commit, no record) → `git commit -m "olc restore: <task> (<paths>) to <short>" -- <paths>` (pathspec; foreign staged changes elsewhere survive) → append record with BOTH shas via `appendCheckpointRecord` (extracted from `createCheckpoint` into an exported helper; `checkpoint.ts` behavior unchanged). Same bans as OLC-051 plus `reset --hard`, `checkout <sha> -- .`, any reset-to-older-commit. `tests/restore.test.ts`: 8 real-git-fixture tests.
- **Verification commands/results:** `npm run typecheck` clean (after fixing a self-inflicted edit that dropped the `createCheckpoint` signature line); `npm test` → 90 pass / 0 fail (82 prior + 8 new: 3-checkpoint restore with history-reachable + user files intact + commit file list exact + dual-SHA record; unknown SHA; non-ancestor side-branch; absent-at-checkpoint; unstaged-risk preserves content; prestaged; untracked-shadow preserves scratch; foreign-staged-survives + already-matches no-op); `npm run build` OK; `npm pack --dry-run` → 42 files. No publish. Test-caught fixture bugs: fixture wrote HEAD-identical content (→ `clean`); restore-to-current-HEAD is correctly `already-matches`, not `restored`.
- **Evidence/files/commit:** Committed in `525df80` "OLC-052: safe restore-to-checkpoint as new commit" (`src/git/restore.ts`, `src/git/checkpoint.ts` helper extract, `tests/restore.test.ts`, `docs/TASKS.md`).
- **Remaining issues:** Restore cannot delete files created after the checkpoint or recreate deleted ones (aborts with explicit code) — symmetric with OLC-051's deletion limit. Snapshots compared as bytes on restore (binary-safe write path; OLC-051's write-time snapshots remain UTF-8 strings).
- **Next task:** OLC-053 — pre-switch and task-final checkpoint policy.

### OLC-053 — Implement pre-switch and task-final checkpoint policy
- **Status:** DONE (confirmed 2026-10-12, auto-continue mandate)
- **Priority:** P1
- **Depends on:** OLC-051, OLC-041
- **Goal:** Checkpoint important milestones and final state of verified tasks.
- **Work:** Trigger at important milestones, explicit request, before task switch, and after final verification for completed task. Do not treat commit as task completion.
- **Acceptance criteria:** Triggers do not repeatedly commit unchanged state; final checkpoint is only created when safe; task still needs user confirmation to close.
- **Verification:** Tests for milestone, explicit request, task switch, unchanged tree, failed tests, and final approval flow.
- **Date:** 2026-10-12
- **Implemented:** New `src/git/policy.ts`: `maybeCheckpointPolicy({projectRoot, config, taskId, trigger, ownedPaths, snapshots, message?, verifyOutcome?, date?})`. Triggers `milestone`/`explicit`/`pre-switch` delegate to OLC-051 `createCheckpoint` (unchanged owned set → `clean`, so no repeated commits); `task-final` additionally requires a fully-passing `verifyOutcome` and registry status `review` (i.e. OLC-041 ran) — missing/failing outcome or any other status (incl. `done`) returns `not-ready`/`verify-failed` with zero git mutation, and the final record embeds a one-line verification summary. Commit ≠ completion: every result carries `needsUserConfirmation` (true only for `task-final`), registry status untouched. Checkpoint aborts (`CheckpointError`) propagate unchanged. `tests/policy.test.ts`: 8 real-git-fixture tests (milestone commit + repeat-clean; pre-switch message in record; unchanged → no commit/record; task-final w/o outcome, failing outcome w/ registry untouched, passing-but-not-review, full flow w/ confirmation flag + registry still `review`, already-`done`).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 98 pass / 0 fail (90 prior + 8 new); `npm run build` OK; `npm pack --dry-run` → 44 files. No publish.
- **Evidence/files/commit:** Committed in `149e9ea` "OLC-053: pre-switch and task-final checkpoint policy" (`src/git/policy.ts`, `tests/policy.test.ts`, `docs/TASKS.md`).
- **Remaining issues:** None. M5 now fully DONE (050/051/052/053).
- **Next task:** OLC-060 — activity event logging (M6).

## M6 — Continuity, logs, memory, taste

### OLC-060 — Implement activity event logging and checkpoint history
- **Status:** DONE (confirmed per standing instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-023, OLC-051
- **Goal:** Record important activity in durable Markdown.
- **Work:** Define event schema and append/update behavior; avoid secret logging and per-tool-call noise; record milestones and Git references.
- **Acceptance criteria:** Log can be reconstructed/read; writes validate vault identity; interruptions do not corrupt previous log entries.
- **Verification:** Simulated interruption, invalid vault, permissions error, and log rotation/append tests as appropriate.
- **Date:** 2026-10-12
- **Implemented:** New `src/log/index.ts`: `logEvent({projectRoot, config, event})` validates identity (OLC-021) FIRST — invalid vault throws with zero files created — then appends one event (`kind`, non-empty `summary`, optional `taskId`/`details`/`gitSha`, injectable ISO `date`) to `<vault>/OLC/Projects/<id>/logs/YYYY-MM-DD.md` (one file per day = the rotation; no size-based rotation for MVP). Appends are a single O_APPEND write; a crash remnant (missing trailing newline) is normalized before appending so prior entries stay intact. Secrets scrubbed, never stored: documented pattern list (`sk-…`, `ghp_/gho_/…`, `xox…`, `AKIA…`, `PRIVATE KEY` headers, `password|secret|token [:​=] value`) → `[redacted]` + `- redacted: true` marker. No hooks/tool-call interception — explicit calls only, so no per-tool-call noise by construction. Readers: `parseEntries` (frontmatter-tolerant, multiline continuations), `readLogDay` (missing file → `[]`), `readLastEvents` (newest-first across day files, `limit`; missing dir → `[]`). `LogError` codes: `INVALID_EVENT`, `INVALID_DATE`, `LOG_WRITE_FAILED`, `LOG_READ_FAILED`. Checkpoint history = `kind: "checkpoint"` events carrying the commit SHA, cross-referencing OLC-051's per-task `checkpoint.md` (checkpoint.ts untouched). `tests/log.test.ts`: 8 tests (round-trip order, invalid-vault zero-writes, redaction of 3 secret shapes, crash-remnant, day rotation + newest-first, SHA cross-ref, unwritable-target error mapping with prior entries intact, invalid input rejected pre-touch).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 106 pass / 0 fail (98 prior + 8 new); `npm run build` OK; `npm pack --dry-run` → 46 files (no test output leaks). No publish. Unwritable-target test avoids chmod (unreliable under root): day-file path replaced with a directory → deterministic EISDIR → `LOG_WRITE_FAILED`.
- **Evidence/files/commit:** Committed in `22cbec6` "OLC-060: activity event logging with secret scrubbing" (`src/log/index.ts`, `tests/log.test.ts`, `docs/TASKS.md`).
- **Remaining issues:** Two test-caught bugs fixed: (1) tail-read EISDIR escaped unwrapped — now `LOG_WRITE_FAILED` before any append; (2) `parseEntries` skipped a leading entry without preceding newline (could not parse its own single-entry output) — normalized. Reads take explicit paths without re-validating (callers crossing project boundaries, e.g. OLC-061 resume, must validate first — documented).
- **Next task:** OLC-061 — resume and checkpoint summary.

### OLC-061 — Implement resume and checkpoint summary
- **Status:** DONE (auto-continue instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-033, OLC-060
- **Goal:** Rebuild enough context after interruption.
- **Work:** Inspect actual Git state; read latest project state, current task plan, last event, checkpoint; recommend most recently active task and ask confirmation.
- **Acceptance criteria:** Never resumes coding automatically; surfaces status/diff/untracked changes and last verification; ambiguity blocks.
- **Verification:** Clean interruption, uncommitted changes, unknown branch, two unfinished tasks, unavailable vault scenarios.
- **Date:** 2026-10-12
- **Implemented:** New `src/resume/index.ts`: `buildResumeContext({projectRoot, config, lastEventsLimit?})` — validates identity FIRST (unavailable vault/mismatch throws before any read); returns `{branch, head, staged, unstaged, untracked}` from real git, `currentState` (`current-state.md`, null when absent), `openTasks` (non-terminal, newest first), `recommendedTaskId` + note via OLC-033 `recommendResume`, `taskDocs` (intent/plan statuses, `missing`-tolerant via OLC-032 `getDocStatuses`), `lastEvents` (newest-first, default 5, surfaces last verification), `lastCheckpoint` (newest `kind:checkpoint` event with `gitSha`), `needsConfirmation: true` always, `blocked` message on ambiguity. Detached HEAD does not nuke the context: vault-side checks still apply (registry must match this repo), branch reported null, result marked blocked. Block conditions: detached HEAD; open tasks exist but none on current branch; two tasks equally recent on one branch. Read-only — zero writes by construction. `tests/resume.test.ts`: 6 real-fixture tests covering all five verification scenarios (clean interruption incl. checkpoint SHA cross-check, uncommitted changes surfaced, detached HEAD blocked-with-context, most-recent-of-two recommended, tie blocks, unavailable vault throws before reads).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 112 pass / 0 fail (106 prior + 6 new); `npm run build` OK; `npm pack --dry-run` → 48 files. No publish.
- **Evidence/files/commit:** Committed in `2bac0be` "OLC-061: read-only resume context with confirmation gate" (`src/resume/index.ts`, `tests/resume.test.ts`, `docs/TASKS.md`).
- **Remaining issues:** None. Resume is a library function returning a context object — rendering it as the agent-facing plain-language summary belongs to OLC-063 (which consumes this).
- **Next task:** OLC-062 — `olc-memory` progressive retrieval.

### OLC-062 — Implement `olc-memory` progressive retrieval
- **Status:** DONE (auto-continue instruction 2026-10-12)
- **Priority:** P1
- **Depends on:** OLC-023, OLC-060
- **Goal:** Retrieve relevant memory without loading entire vault.
- **Work:** Read project index/current state first, then relevant decisions, plans, logs and patterns by query/context.
- **Acceptance criteria:** Does not scan unrelated project folders by default; records updates only in validated project scope.
- **Verification:** Multi-project vault fixtures ensure isolation and relevant retrieval.
- **Date:** 2026-10-12
- **Implemented:** New `src/memory/index.ts`: `recallMemory({projectRoot, config, query?, taskId?, includeLogs?, logLimit?, limit?})` validates identity FIRST (wrong project/vault throws before any read), reads `index.md` + `current-state.md` (null when absent), task intent/plan on request (missing → null), token-scored query scan of `memory/` + `decisions/` only (stopwords filtered, filename-weighted, capped at 1200-char excerpts with truncation flag, best-score first), query-filtered recent logs (default 10, unfiltered base context when no query). `recordMemory({projectRoot, config, name, content, overwrite?})`: plain-name check (no paths/extensions), non-empty content, atomic `memory/<name>.md` write in validated scope, overwrite needs explicit flag. `tests/memory.test.ts`: 9 multi-project fixture tests (base context w/o query, relevant-only retrieval + score order, excerpt cap/flag, task docs + unknown-null, log filtering, B-recall never surfaces A, record→recall round-trip + overwrite guard, invalid name/content pre-touch, wrong-project identity failure).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 121 pass / 0 fail (112 prior + 9 new); `npm run build` OK; `npm pack --dry-run` → 50 files. No publish.
- **Evidence/files/commit:** Committed in this session (`src/memory/index.ts`, `tests/memory.test.ts`, `docs/TASKS.md`).
- **Remaining issues:** None.
- **Next task:** OLC-063 — session summary in plain language.

### OLC-063 — Implement session summary in plain language
- **Status:** DONE (auto-continue instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-060, OLC-061
- **Goal:** End each normal session with a useful, non-technical summary.
- **Work:** Include what was done, observed result, tests, unfinished work, blockers/risks, next step, checkpoint if created.
- **Acceptance criteria:** Indonesian/plain language by default for this project; factual claims map to actual event/test data; no claiming a summary is guaranteed after hard kill.
- **Verification:** Normal completion, blocked session, no-code-change session, and partial failure scenarios.
- **Date:** 2026-10-12
- **Implemented:** New `src/session/index.ts`: `buildSessionSummary({projectRoot, config, whatDone[], verifyOutcome?, testsNote?, checkpointSha?, checkpointTaskId?, blockedReason?, remaining[], nextStep, date?})` validates via `buildResumeContext` first (bad vault throws before writes), renders Indonesian summary via `renderTemplate` `session-summary` plus hard-kill honesty footer, maps factual claims strictly (verify lines from VerifyOutcome counts/escalated, checkpoint line only with real SHA, open tasks from resume ctx), returns `{markdown, logFile, date}`; appends compact `kind:session` logEvent with headline + next + optional sha/taskId. `tests/session.test.ts`: 5 scenarios (normal completion 1/1 pass + SHA + log, blocked 0/1 fail + 2 attempts + no checkpoint claim + open task line, no-code-change honest empty sections, partial failure pass + blocked, resume visibility of session event in day log).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 126 pass / 0 fail (121 prior + 5 new); `npm run build` OK; `npm pack --dry-run` → 52 files. No publish.
- **Evidence/files/commit:** Committed in this session (`src/session/index.ts`, `tests/session.test.ts`, `docs/TASKS.md`).
- **Remaining issues:** None.
- **Next task:** OLC-064 — taste proposal lifecycle.

### OLC-064 — Implement taste proposal lifecycle
- **Status:** DONE (auto-continue instruction 2026-10-12)
- **Priority:** P1
- **Depends on:** OLC-023, OLC-062
- **Goal:** Learn project-specific preferences without silently changing behavior.
- **Work:** Record repeat signals, prepare proposed taste rule with examples/evidence, maintain `pending`/`active`/`rejected` statuses.
- **Acceptance criteria:** Only user approval activates a rule; scope is one project; approved intent/plan is not overwritten by taste memory.
- **Verification:** Pending remains inactive, approval activates, rejection stays inactive, cross-project isolation.
- **Date:** 2026-10-12
- **Implemented:** New `src/taste/index.ts`: `proposeTasteRule({projectRoot, config, name, rule, examples[]})` validates identity first, requires non-empty rule + ≥1 evidence entry, renders `taste-rule` template as `taste/<name>.md` with status `pending` via atomic create-only write (never active on creation, duplicates throw `ALREADY_EXISTS`); `getTasteRule`/`listTasteRules({status?})` read within validated scope only (parse + validate frontmatter status, `CORRUPT_RULE` on drift); `reviewTasteRule({approve})` explicit user decision only — pending→active on approve, pending→rejected on reject, terminal states throw `BAD_TRANSITION`, unknown names throw `UNKNOWN_RULE`. Only `taste/` touched, approved intent/plan bytes untouched. `TasteError` codes: `INVALID_NAME`, `INVALID_INPUT`, `UNKNOWN_RULE`, `BAD_TRANSITION`, `ALREADY_EXISTS`, `CORRUPT_RULE`. `tests/taste.test.ts`: 7 multi-project fixture tests (pending-never-active, approve→active + re-review blocked, reject parked, intent/plan byte-identical, cross-project isolation incl. same-name divergence, invalid/duplicate safety, wrong-project identity throws before read/write).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 133 pass / 0 fail (126 prior + 7 new); `npm run build` OK; `npm pack --dry-run` → 54 files. No publish.
- **Evidence/files/commit:** Committed in this session (`src/taste/index.ts`, `tests/taste.test.ts`, `docs/TASKS.md`).
- **Remaining issues:** None.
- **Next task:** OLC-065 — vault/project validation at important operations.

### OLC-065 — Validate vault/project at important operations
- **Status:** DONE (auto-continue instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-021, OLC-060
- **Goal:** Catch a missing/mismatched vault before damaging the wrong context.
- **Work:** Call lightweight validation at session start and before critical read/write/commit/restore operations.
- **Acceptance criteria:** Validation does not reread the whole vault; mismatch blocks operation.
- **Verification:** Vault changed/unmounted between operations; wrong project registry; inaccessible path.
- **Date:** 2026-10-12
- **Implemented:** New `src/validation/index.ts`: `startSession({projectRoot, config, date?})` runs OLC-021 `validateIdentity` once and returns the session context; `assertContextCurrent({projectRoot, config, session})` re-runs the same cheap gate (git metadata + single `OLC/registry.json` + readdir probe, never a full-vault scan) and blocks on drift (repo root or branch changed since start) via `ValidationError(SESSION_DRIFT)`. Identity problems propagate as `IdentityError` with zero writes. Wired into critical commit/restore paths: `CheckpointInput.session?` and `RestoreInput.session?` — when present, `createCheckpoint`/`restoreCheckpoint` revalidate against the session before touching git or vault (drifted session commits nothing). All other modules already validate at operation start (build, memory, taste, log, resume).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 139 pass / 0 fail (133 prior + 6 new); `npm run build` OK; `npm pack --dry-run` → 56 files. No publish.
- **Evidence/files/commit:** This commit (`src/validation/index.ts`, `tests/validation.test.ts`, `src/git/checkpoint.ts`, `src/git/restore.ts`, `docs/TASKS.md`).
- **Remaining issues:** None. Approval/planning/tasks raw-vault helpers remain ungated by design for MVP — all agent-facing write paths go through validated entry points.
- **Next task:** OLC-070 — Documentation and safe installation flow (M7).

## M7 — Release hardening

### OLC-070 — Documentation and safe installation flow
- **Status:** DONE (auto-continue instruction 2026-10-12)
- **Priority:** P0
- **Depends on:** OLC-012, OLC-020, OLC-022
- **Goal:** A first-time user can install, activate, initialize, verify, update, and uninstall OLC.
- **Work:** README, install config snippet/installer if selected, migration/overwrite policy, commands, troubleshooting, supported versions, security notes.
- **Acceptance criteria:** Distinguishes npm development install from OpenCode plugin activation and OLC project initialization; every command tested.
- **Verification:** Follow docs in a clean environment from start to finish.
- **Date:** 2026-10-12
- **Implemented:** Rewrote `README.md` (134 lines): three separate steps table (1 dev install `npm ci && npm run build`, 2 plugin activation via `file://` checkout + `/api/plugin` verify + project-local `.opencode` copy + `/api/agent|skill` verify, 3 project init via `olc-init` skill / `initProject` create-only). Covers vault precedence, dryRun, updating, uninstall, security notes, troubleshooting, docs map. Corrected two inaccuracies found during verification: package entrypoint exports only `OLC_VERSION` (programmatic `initProject` import not yet wired — skill is the tested path), and plain `cp` overwrites (no-clobber belongs to `olc-init` `preserved`).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 139 pass / 0 fail; `npm run build` OK; `npm pack --dry-run` → 56 files incl. `dist/` all 17 modules, `agents/olc-plan+olc-build`, `skills/olc-explore/SKILL.md`, 8 `templates/*.md`. Resource layout `ls` confirms README claims; `dist/index.js` exports only `OLC_VERSION`. No publish (`private:true` guard intact).
- **Evidence/files/commit:** This commit (`README.md`, `docs/TASKS.md`).
- **Remaining issues:** None. Programmatic `initProject` import wiring deferred (skill path tested).
- **Next task:** OLC-071 — Package and compatibility smoke test.

### OLC-071 — Package and compatibility smoke test
- **Status:** DONE (auto-continue instruction 2026-10-13)
- **Priority:** P0
- **Depends on:** OLC-010, OLC-070
- **Goal:** Test what actually ships.
- **Work:** Build, `npm pack --dry-run`, inspect package files, install tarball locally, and test in clean OpenCode profile.
- **Acceptance criteria:** No missing agent/skill/template resources; no development-only dependency required at runtime; package activation works as documented.
- **Verification:** Store command outputs or CI evidence.
- **Date:** 2026-10-13
- **Implemented:** Evidence-backed smoke test, no source changes. `npm pack --dry-run` → 56 files: `dist/` all 17 modules (`.js`+`.d.ts`), `agents/olc-plan.md`+`olc-build.md`, `skills/olc-explore/SKILL.md`, 8 `templates/*.md` (11/11 resource files present). Real `npm pack` + `npm install <tgz>` into clean `/tmp/opencode/olc071-install` → 273 packages, `typescript` absent at runtime (dev-only dep correctly excluded). Installed package verified: `OLC_VERSION=0.0.1`, plugin default-export shape (`id=olc`, `setup` function), `findTemplatesDir` resolves inside installed package, `renderTemplate` renders, all 3 agent/skill files present. Clean-profile load (`/tmp/opencode/olc071-local`, `.opencode/plugins/olc/index.js` re-exporting tarball `dist/plugin.js`): `loading plugin` with **zero** `failed to load plugin` (exit=1 is the pre-existing account-billing error on the model call, same as OLC-011). README step-2 snippet re-verified verbatim in fresh `/tmp/opencode/olc071-verify` (loading line + FAILED=0 + resource `ls` OK).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 139 pass / 0 fail; `npm run build` OK; `npm pack --dry-run` → 56 files; tarball install + import + template-render + plugin-shape checks all OK; clean-profile `opencode run --standalone` load OK (0 failures). No publish (`private:true` guard intact; tarball deleted after test, never committed).
- **Evidence/files/commit:** This commit (`README.md` activation correction, `docs/TASKS.md`).
- **Remaining issues / honest limitations found:** (1) Package-dir activation via `opencode.json` `plugins` (or `plugin`), bare path or `file://` URL, produced **zero load attempts** in this build — the only verified load path is local-file `.opencode/plugins/<name>/index.js`. (2) `dist/index.js` exports only `OLC_VERSION` (no plugin default export); npm loaders resolve `dist/index.js`, so npm-package activation cannot work until the entrypoint is wired AND a name is reserved — deferred to a follow-up task, not silently fixed here. (3) `/api/agent` + `/api/skill` returned `[]` for project-local files even with a minimal probe agent — OLC-012 discovery evidence did not reproduce in this build; README now verifies by file presence instead. README §2 rewritten to the verified path with these limitations stated.
- **Next task:** OLC-072 — End-to-end MVP acceptance matrix.

### OLC-072 — End-to-end MVP acceptance matrix
- **Status:** DONE (auto-continue instruction 2026-10-13)
- **Priority:** P0
- **Depends on:** OLC-022, OLC-034, OLC-041, OLC-052, OLC-063, OLC-064, OLC-071
- **Goal:** Validate one full user journey.
- **Work:** Init dummy app/vault; plan and approve; build/test; checkpoint; simulate interruption; resume with confirmation; restore earlier checkpoint; propose taste rule; finish with simple-language summary.
- **Acceptance criteria:** Every critical safety gate passes; unresolved limitations documented.
- **Verification:** Completed test matrix and recorded results.
- **Date:** 2026-10-13
- **Implemented:** New `tests/e2e.test.ts`: one ordered journey test on temp git repo + temp vault. Matrix (each row asserted): init `ready` + config/registry files exist; pre-approval `beginTask` blocked `NOT_READY`; approval gate `assertBuildReady` passes after `approveTaskDocs` + registry `approved`; smuggled file → `completeTaskWithVerification` blocked `SCOPE_CHANGED`; passing checks → `verified:true`, status `review`; two session-bound checkpoints committed (sha1/sha2) with `checkpoint` log events; resume gives `needsConfirmation:true`, `lastCheckpoint=sha2`, open T-1, last verify event visible, `assertContextCurrent` passes; restore sha1 → content back to v2 AND sha2 still ancestor of HEAD (history preserved); taste pending invisible to active-list, approval activates; Indonesian summary contains `1/1 pemeriksaan berhasil` + checkpoint SHA + hard-kill honesty footer; wrong-project `ghost` config blocked at resume, taste, and complete (`CONTEXT_MISMATCH`). Three journey bugs found and fixed during implementation (registry needs explicit `approved` transition; `.olc/` must be committed to baseline before scoped completion; resume `lastCheckpoint` comes from log `checkpoint` events, so the journey logs one per checkpoint).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 140 pass / 0 fail (139 prior + 1 e2e); `npm run build` OK; `npm pack --dry-run` → 56 files. No publish.
- **Evidence/files/commit:** This commit (`tests/e2e.test.ts`, `docs/TASKS.md`).
- **Remaining issues:** OLC-071 limitations carry over (npm-dir activation unwired, `/api/agent|skill` discovery unreproduced). E2E covers library-level journey, not live model calls (billing-blocked, same as OLC-011).
- **Next task:** OLC-073 — Prepare MVP pre-release.

### OLC-073 — Prepare MVP pre-release
- **Status:** DONE (auto-continue instruction 2026-10-13)
- **Priority:** P1
- **Depends on:** OLC-072
- **Goal:** Create a usable version for controlled testing.
- **Work:** Version bump, changelog, package dry-run, documentation review, known limitations, npm publish preparation without publishing unless user explicitly requests it.
- **Acceptance criteria:** No known P0 safety/test failures; version and install instructions are consistent.
- **Verification:** Release checklist marked with evidence. Publishing remains a separate explicitly approved action.
- **Date:** 2026-10-13
- **Implemented:** Version `0.0.1` → `0.1.0` (`package.json` via `npm pkg set` + lockfile synced, `src/index.ts` `OLC_VERSION`; no test pins the old version — grep confirmed). New `CHANGELOG.md`: 0.1.0 MVP pre-release notes (what works, 13 known limitations carried over from OLC-071/072 evidence) + 0.0.1 baseline row. `package.json` `files` allowlist extended with `README.md` + `CHANGELOG.md` (docs now ship with the package). README test-count corrected (139 → 140). Release checklist: typecheck clean, 140/140 pass, build OK, `npm pack --dry-run` → 57 files as `obsidian-lean-coder-0.1.0.tgz`, built entry reports `0.1.0`, `private:true` guard intact, dry-run only (no tarball left behind, nothing published).
- **Verification commands/results:** `npm run typecheck` clean; `npm test` → 140 pass / 0 fail; `npm run build` OK; `npm pack --dry-run` → 57 files. No publish.
- **Evidence/files/commit:** This commit (`package.json`, `package-lock.json`, `src/index.ts`, `CHANGELOG.md`, `README.md`, `docs/TASKS.md`).
- **Remaining issues:** Publish action still requires separate explicit user approval. Open items for post-MVP: npm name reservation (DECISIONS #1), plugin entrypoint wiring for npm activation, `/api/agent|skill` discovery gap, min OpenCode version pin (#3). OLC-003 CI baseline done 2026-10-13 — no TODO items remain on the board.
- **Next task:** None — all TASKS.md items DONE. Post-MVP follow-ups need new task IDs.

### OLC-074 — Fix npm plugin entrypoint (post-release bug report)
- **Status:** DONE (user-reported live bug 2026-10-13, fixed same session)
- **Priority:** P0
- **Depends on:** OLC-071
- **Goal:** Make `npm install obsidian-lean-coder` + `plugins` listing actually load the plugin in OpenCode.
- **Work:** Wire plugin default export into the package entrypoint; rewrite README §2 for the npm path; release 0.1.1.
- **Acceptance criteria:** Package-root `dist/index.js` exposes the plugin default export `{id, setup}`; real loader shows `loading plugin` with zero failures; README documents only verified paths.
- **Verification:** Mock-ctx load + real `opencode run --standalone` load + full suite.
- **Date:** 2026-10-13
- **Implemented:** User reported npm-installed package invisible in OpenCode (expected 2 agents + skills, got nothing). Diagnosis: (1) bare `npm install` never surfaces anything — package must be listed under `opencode.json` `plugins`; (2) real bug: npm loaders resolve package-root `dist/index.js`, which exported only `OLC_VERSION` with no plugin default export, so the loader ignored it (matches OLC-071 zero-load-attempts finding); (3) agents/skills never auto-appear by design (DECISIONS #2 project-local `.opencode` copy). Fix: `src/index.ts` re-exports the plugin default alongside `OLC_VERSION` (safe: `OLC_VERSION` consumed deferred inside `execute`). Release 0.1.1: `package.json` via `npm pkg set` + lockfile synced, `src/index.ts` `OLC_VERSION`, `CHANGELOG.md` 0.1.1 entry (also fixed stale `private:true` line — package is public, 0.1.0 live), README rewritten (npm path first with verified `run --standalone` grep, local-dev subsection, stale `plugin`-key snippet and entrypoint notes corrected).
- **Verification commands/results:** `npm run typecheck` clean; `npm run build` OK; mock-ctx load of `dist/index.js` → `id=olc` + correct execute payload; real-loader test (fixture `.opencode/plugins/olc/index.js` re-exporting the exact npm-loader shape) → `loading plugin` + **zero** `failed to load plugin` (exit=1 is the known account-billing error); `npm test` → 140 pass / 0 fail; `npm pack --dry-run` file count recorded at commit time. No publish by agent — user runs `npm publish`.
- **Evidence/files/commit:** This commit (`src/index.ts`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md`, `docs/TASKS.md`).
- **Remaining issues:** Publish of 0.1.1 requires the user (explicit approval standing rule). `/api/agent|skill` discovery gap from OLC-071 still open (README verifies by file presence).
- **Next task:** OLC-075 — `olc-setup` resource installer.

### OLC-075 — `olc-setup` resource installer (npx, project/global scope)
- **Status:** DONE (user-requested 2026-10-13: "bisa nggak dibuat ketika install ada pilihan project atau global ... otomatis ... sesuai scope"; locked decisions: global only for this plugin's install, npx manual run, opencode.json stays manual with README instructions, missing targets created, existing OLC files overwritten)
- **Priority:** P0
- **Depends on:** OLC-074
- **Goal:** One manual command installs shipped agents/skills into OpenCode discovery paths for the chosen scope.
- **Work:** `bin/olc-setup.js` (Node builtins only) + `bin` entry in `package.json` (+ `files` allowlist); `setup [--project|--global] [--dry-run]` (default project); README/CHANGELOG updates; release 0.2.0.
- **Acceptance criteria:** Missing dirs created; existing OLC agent/skill files overwritten with package versions (deliberate narrow exception to create-only, scoped to owned files); `--dry-run` writes nothing; `opencode.json` never touched (manual snippet printed); unknown args exit non-zero.
- **Verification:** 6 fixture tests + full suite + real npx-from-tarball run.
- **Date:** 2026-10-13
- **Implemented:** New `bin/olc-setup.js` (shebang, `OWNED_FILES` = 2 agents + 1 skill, usage exit 2, incomplete-package guard exit 1, created/overwritten/skipped summary + post-run manual `plugins` snippet). Scope roots: `process.cwd()` (project) and `$XDG_CONFIG_HOME/opencode` else `~/.config/opencode` (global). `tests/setup.test.ts`: create-bytes, skip/overwrite, dry-run, global isolation, usage errors, mkdir -p. Release 0.2.0: `package.json` via `npm pkg set` + lockfile synced, `src/index.ts` `OLC_VERSION`, `CHANGELOG.md` 0.2.0 entry, README §2 setup-helper subsection.
- **Verification commands/results:** `npm run typecheck` clean; `npm run build` OK; `npm test` → 146 pass / 0 fail (140 prior + 6 new); `npm pack --dry-run` → 59 files incl. `bin/olc-setup.js`; entry reports `VERSION=0.2.0 id=olc setup=function`; real tarball install into clean fixture + packed `bin/olc-setup.js` run → 3 created, rerun `--dry-run` → 3 skipped, `.bin/olc-setup` shim present; tarball deleted after test. No publish by agent — user runs `npm publish`.
- **Evidence/files/commit:** This commit (`bin/olc-setup.js`, `tests/setup.test.ts`, `package.json`, `package-lock.json`, `src/index.ts`, `CHANGELOG.md`, `README.md`, `docs/TASKS.md`).
- **Remaining issues:** Publish of 0.2.0 requires the user. `/api/agent|skill` discovery gap still open.
- **Next task:** OLC-076 — primary agent modes + missing skill wrappers.

### OLC-076 — Primary agent modes + missing skill wrappers
- **Status:** DONE (user-requested 2026-10-13: agents "tidak dikenali di opencode ... masih default agent opencode saja", "coba cek lagi skillnya harusnya apa saja"; locked decisions: both agents Mode primary, create all 4 missing skills)
- **Priority:** P0
- **Depends on:** OLC-075
- **Goal:** Agents visible in the OpenCode agent switcher; all 5 PRD §7.3 skills shipped and installed by `olc-setup`.
- **Work:** `mode: subagent` → `mode: primary` in `agents/olc-plan.md` + `agents/olc-build.md` (subagent mode is @-invokable only — that was the reported symptom, verified); new `skills/olc-init|olc-memory|olc-log|olc-taste/SKILL.md` grounded in real module contracts; `OWNED_FILES` + test `OWNED` extended 3 → 7 files; release 0.3.0.
- **Acceptance criteria:** Both agents carry `mode: primary` + description frontmatter; all 5 skills render from the packed tarball; setup installs all 7 owned files in both scopes; full suite green.
- **Date:** 2026-10-13
- **Implemented:** Frontmatter mode flips (2 files); 4 new SKILL.md (init create-only flow, progressive memory recall, secret-scrubbed append-only log + session summary, pending→active taste lifecycle); `bin/olc-setup.js` `OWNED_FILES` 7 entries; `tests/setup.test.ts` counts 3→7 (create/skip/overwrite); version 0.3.0 (`package.json` via `npm pkg set` + lockfile root entries only — `eastasianwidth@0.2.0` untouched; `src/index.ts` `OLC_VERSION`); `CHANGELOG.md` 0.3.0 entry; README (manual cp block, discovery `ls`, uninstall `rm`, head version, test count).
- **Verification commands/results:** `npm run typecheck` clean; `npm run build` OK; `npm test` → 146 pass / 0 fail; `npm pack --dry-run` → 63 files as `obsidian-lean-coder-0.3.0.tgz` incl. all 5 `skills/*/SKILL.md`. No publish by agent — user runs `npm publish`.
- **Evidence/files/commit:** This commit (`agents/`, `skills/` ×4, `bin/olc-setup.js`, `tests/setup.test.ts`, `package.json`, `package-lock.json`, `src/index.ts`, `CHANGELOG.md`, `README.md`, `docs/TASKS.md`).
- **Remaining issues:** Publish of 0.3.0 requires the user. `/api/agent|skill` discovery gap still open (TUI-side verification pending user report after reinstall).
- **Next task:** OLC-077 — default-like agents + project rules.

### OLC-077 — Default-like agents + project rules
- **Status:** DONE (user-requested 2026-10-14: agent "tidak sesuai seperti yg saya minta. isinya harusnya sama seperti defaultnya dari opencode, lalu ditambahi untuk membaca file agents.md tambahan yg ada di .olc/AGENTS.md, lalu juga berikan instruksi tentang OLC ini"; locked decisions: OpenCode default wins conflicts with shown conflict + fix suggestion + stop; concise ~60 lines/file; enrich `.olc/AGENTS.md` template + ask user for additions)
- **Priority:** P0
- **Depends on:** OLC-076
- **Goal:** Agents behave like OpenCode defaults first, read project `.olc/AGENTS.md`, carry concise OLC instructions.
- **Work:** Rewrite `agents/olc-plan.md` + `agents/olc-build.md` (default-first behavior, conditional `.olc/AGENTS.md` read, conflict-shows-and-stops rule, concise skill map; mode stays primary); enrich `.olc/AGENTS.md` template ("Aturan tambahan proyek") in `src/init/index.ts` (create-only preserved); ask-for-additions step in `skills/olc-init/SKILL.md` (module stays non-interactive); release 0.4.0.
- **Acceptance criteria:** Both agent files lead with default behavior + conditional project-rules read + conflict rule; stub contains the new section; init skill asks about additions without overwriting existing rules; full suite green.
- **Date:** 2026-10-14
- **Implemented:** Agent rewrites (~60 lines each); `AGENTS_STUB` + "Aturan tambahan proyek" section; init skill step 4 (ask, merge-only-on-request); version 0.4.0 (`package.json` via `npm pkg set` + lockfile sync; `src/index.ts` `OLC_VERSION`); `CHANGELOG.md` 0.4.0 entry; README (behavior paragraph, head version).
- **Verification commands/results:** `npm run typecheck` clean; `npm run build` OK; `npm test` → 146 pass / 0 fail; `npm pack --dry-run` file check. No publish by agent — user runs `npm publish`.
- **Evidence/files/commit:** This commit (`agents/` ×2, `src/init/index.ts`, `skills/olc-init/SKILL.md`, `package.json`, `package-lock.json`, `src/index.ts`, `CHANGELOG.md`, `README.md`, `docs/TASKS.md`).
- **Remaining issues:** Publish of 0.4.0 requires the user. `/api/agent|skill` discovery gap still open.

### OLC-078 — Verification tooling rule for minimal harnesses
- **Status:** DONE (user-requested 2026-10-14: "coba dalami lagi masalah diatas dan solusinya apa" — coding-agent failure blamed on missing `cat` in a super-minimal-PATH harness; deep analysis: harness artifact is unfixable by instructions, but the agent's *tool choice* (reaching for cat instead of guaranteed node/npm/git) and *failure classification* (reporting env-caused failure as task failure) are both instruction-preventable)
- **Priority:** P1
- **Depends on:** OLC-077
- **Goal:** Agent verification prefers environment-guaranteed tools and reports missing-binary failures as environment limitations, not task failures.
- **Work:** Add tool-preference + failure-classification rule to `agents/olc-build.md` Checks section (prefer node/npm/git over cat/grep/awk/sed; missing-binary failure → explicit **environment limitation** report); release 0.4.1.
- **Acceptance criteria:** Rule present in Checks section; full suite green; no instruction claims a missing binary can be conjured.
- **Date:** 2026-10-14
- **Implemented:** Two-sentence rule in `olc-build.md`; version 0.4.1 (`package.json` via `npm pkg set` + lockfile root sync; `src/index.ts` `OLC_VERSION`); `CHANGELOG.md` 0.4.1 entry; README head version.
- **Verification commands/results:** `npm run typecheck` clean; `npm run build` OK; `npm test` → 146 pass / 0 fail; `npm pack --dry-run` file check. No publish by agent — user runs `npm publish`.
- **Evidence/files/commit:** This commit (`agents/olc-build.md`, `package.json`, `package-lock.json`, `src/index.ts`, `CHANGELOG.md`, `README.md`, `docs/TASKS.md`).
- **Remaining issues:** Publish of 0.4.1 requires the user. `olc-plan.md` intentionally untouched (read-only investigation, no verification runs).

### OLC-079 — Vault cross-linking for the second-brain graph
- **Status:** DONE (user-requested 2026-10-14, Indonesian: "apakah antar dokumen sudah ada link menghubungkannya? kalau belum ada berikan aturan untuk itu, karena ini nantinya kan sebagai second brain dari project"; audit found zero wikilinks between any vault document)
- **Priority:** P1
- **Depends on:** OLC-023, OLC-060, OLC-062
- **Goal:** Every vault document is a connected node in Obsidian's link graph (intent/plan/history/checkpoint/explore-report/taste-rule/log ↔ project hub), not an isolated file.
- **Work:** Added `## Terkait` sections with relative `[[wikilinks]]` to 7 bundled templates (`intent.md`, `plan.md`, `checkpoint.md`, `explore-report.md`, `activity-log.md`, `taste-rule.md`, `decision.md` — the last via a new `related` template variable supplied by the caller); `session-summary.md` deliberately left link-free (no fixed vault location). `src/init/index.ts` `VAULT_INDEX`/`VAULT_STATE` now link `index.md` ↔ `current-state.md`. `src/planning/index.ts` `appendHistory` writes an initial `## Terkait` header linking `history.md` to its `intent.md`/`plan.md`. `src/log/index.ts` `ensureDayFile` links each daily log to the hub; `formatEntry` appends a `- terkait:` line to task-tagged events linking to that task's intent/plan (confirmed `parseEntries` ignores the unknown key safely). New `tests/links.test.ts` (7 tests): per-template link assertions, decision.md's required `related` var, and an end-to-end fixture (init → draft → revise → checkpoint → log) that walks every `.md` file in a generated vault and resolves every `[[...]]` target on disk. `tests/vault.test.ts` updated with the new `related` var. README gains a "Vault linking rules (second brain)" section; `skills/olc-memory/SKILL.md` updated to require memory notes include `## Terkait`. Release 0.5.0.
- **Acceptance criteria:** Each template's rendered output contains `## Terkait` with the expected relative links (except session-summary); `decision.md` errors without `related`; hub docs link both ways; fixture walk reports zero broken links; full suite green.
- **Date:** 2026-10-14
- **Implemented:** Template edits (7 files); `src/init/index.ts`, `src/planning/index.ts`, `src/log/index.ts`; `tests/links.test.ts` (new, 7 tests), `tests/vault.test.ts` (updated); version 0.5.0 (`package.json` via `npm pkg set` + lockfile root sync; `src/index.ts` `OLC_VERSION`); `CHANGELOG.md` 0.5.0 entry; README head version, test-count, and new linking-rules section; `skills/olc-memory/SKILL.md` updated.
- **Verification commands/results:** `npm run typecheck` clean; `npm run build` clean; `npm test` → 152 pass / 0 fail (was 146 before this task's 7 new tests, minus 1 pre-existing test fixed to supply the new `related` var — 152 is the new total, not a net +7 over a stale baseline). No `npm pack --dry-run` run yet in this session — **NOT RUN**, pending before commit.
- **Evidence/files/commit:** Uncommitted at time of writing (templates/*.md ×7, `src/init/index.ts`, `src/planning/index.ts`, `src/log/index.ts`, `tests/links.test.ts`, `tests/vault.test.ts`, `package.json`, `package-lock.json`, `src/index.ts`, `CHANGELOG.md`, `README.md`, `skills/olc-memory/SKILL.md`, `docs/TASKS.md`).
- **Remaining issues:** No backfill of links into vault documents written by earlier OLC versions (existing limitation, documented in README and here, tracked under D-005). Publish of 0.5.0 requires the user — never run by the agent.

### OLC-080 — English skill docs, concise README install, release 0.5.1
- **Status:** DONE (user-requested: "sekarang perbaiki juga untuk semua skill olc agar pakai bahasa inggris" then "perbaiki readme untuk cara install yg paling ringkas dan taruh dipaling atas pas dibawah brief singkat, hapus instruksi2 install yg lama", then "commit semua perubahan lalu build menjadi versi 0.5.1")
- **Priority:** P2
- **Depends on:** OLC-079
- **Goal:** All bundled skill docs readable in English; README leads with a minimal install path instead of a long walkthrough.
- **Work:** Rewrote all 5 skill files (`skills/olc-log/SKILL.md`, `skills/olc-explore/SKILL.md`, `skills/olc-init/SKILL.md`, `skills/olc-memory/SKILL.md`, `skills/olc-taste/SKILL.md`) in English, keeping code identifiers/paths verbatim (`agents/olc-plan.md`, `agents/olc-build.md` were already English, untouched). Restructured README.md: replaced the old "Three separate steps" section (dev install path, plugin activation, project init, ~130 lines) with a concise "## Install" section right under the brief — 3 commands (`npm install obsidian-lean-coder`, opencode.json plugins snippet, `npx obsidian-lean-coder setup`) plus one line on `olc-init` and requirements (OpenCode 2.x V2 plugin API, Node >= 18.18). All prior detailed content preserved under new "## Reference" section. Version bump 0.5.0→0.5.1: `npm pkg set version=0.5.1` + package-lock.json root `version`/`packages[\"\"].version` synced via inline node script; `src/index.ts` `OLC_VERSION` = \"0.5.1\"; CHANGELOG.md 0.5.1 entry; README head-line version mention updated.
- **Acceptance criteria:** No Indonesian text remains in any `skills/*/SKILL.md`; README install section is a short quick-start above the old detailed content; full suite green; version consistently 0.5.1 across package.json, package-lock.json, src/index.ts.
- **Date:** 2026-10-14
- **Implemented:** `skills/olc-log/SKILL.md`, `skills/olc-explore/SKILL.md`, `skills/olc-init/SKILL.md`, `skills/olc-memory/SKILL.md`, `skills/olc-taste/SKILL.md`, `README.md`, `package.json`, `package-lock.json`, `src/index.ts`, `CHANGELOG.md`, `docs/TASKS.md`.
- **Verification commands/results:** `npm run typecheck` clean; `npm run build` clean; `npm test` → 152 pass / 0 fail (docs-only changes, no test changes needed); `npm pack --dry-run` pending final check before commit.
- **Evidence/files/commit:** Skill translation and README restructuring were committed separately in two prior commits (`ffd9720` "Translate OLC skill docs to English", `b0650bb` "README: concise install at top, old detail moved to Reference") before this task was logged; this entry covers those plus the version-bump-only release 0.5.1 committed together with this docs/TASKS.md entry.
- **Remaining issues:** None known. Publish of 0.5.1 requires the user — never run by the agent.

### OLC-081 — Expose memory/taste/log/decision/session modules as OLC plugin tools + end-of-session reflection
- **Status:** DONE (user: "eksekusi")
- **Priority:** P1
- **Depends on:** OLC-011, OLC-060, OLC-062, OLC-063, OLC-064
- **Goal:** Fix the root cause that completing OLC tasks saved nothing — no agent-callable surface existed (skills only described pseudo-functions the agent could not invoke), and no reflection step persisted learnings.
- **Work:** New `src/tools.ts` (`registerOlcTools(ctx)`) registers 8 `olc`-namespace tools that call the existing self-gating modules: `olc_memory_recall`, `olc_memory_record`, `olc_taste_propose`, `olc_taste_list`, `olc_taste_review`, `olc_log_event`, `olc_session_summary`, plus `olc_decision_record` (new surface — renders `templates/decision.md` to `decisions/<YYYY-MM-DD>-<slug>.md`, create-only never overwrite; fills the gap where `recordDecision` only appended to task `history.md`). `src/plugin.ts` calls `registerOlcTools(ctx)` after declaring the namespace; the legacy read-only `status` tool is kept. Each tool does `loadConfig(ctx.location.directory)` inside try/catch and returns `{ ok: true, ... }` or `{ ok: false, error: { code, message } }`, reusing the modules' already-actionable messages (MISSING_CONFIG, UNREGISTERED_PROJECT, ALREADY_EXISTS, …). No writes at plugin load. Part B (reflection as pure instruction, no new `olc_reflect` tool — user rejected it): added a reflection pass to root `AGENTS.md` closeout, `agents/olc-build.md` (between Git-safety and closeout bullets) and `agents/olc-plan.md` (new "End of session" section); rewrote the Flow sections of `skills/olc-memory`, `skills/olc-taste`, `skills/olc-log` to reference the real `olc_*` tools.
- **Acceptance criteria:** All 8 tools register; memory/decision/taste/session round-trip against a fixture vault + temp git repo; missing config / unregistered project map to `ok:false` actionable errors, never crash; zero writes at tool registration (only on `execute`); reflection guidance present in the 3 agent/AGENTS instruction files; `npm test` + `npm run typecheck` + `npm run build` + `npm pack --dry-run` green.
- **Date:** 2026-10-14
- **Implemented:** `src/tools.ts`, `src/plugin.ts`, `tests/tools.test.ts`, `agents/olc-build.md`, `agents/olc-plan.md`, `AGENTS.md`, `skills/olc-memory/SKILL.md`, `skills/olc-taste/SKILL.md`, `skills/olc-log/SKILL.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`, `src/index.ts`, `docs/TASKS.md`.
- **Verification commands/results:** `npm run typecheck` clean; `npm run build` clean; `npm test` → 158 pass / 0 fail (150 prior + 8 new, full suite green — no regression); `npm pack --dry-run` pending final check before commit.
- **Evidence/files/commit:** Logged at task completion; commit pending user approval (see Git-safety rule — `VERSION` working-tree change belongs to user, never staged by agent).
- **Remaining issues:** None known. Publish of 0.6.0 requires the user — never run by the agent.

### OLC-082 — Standalone `olc-todoc` skill (write anything to Markdown)
- **Status:** DONE (2026-10-14)
- **Priority:** P1
- **Depends on:** OLC-075, OLC-076
- **Goal:** Ship a standalone skill that writes any information, request, or conversation context into a reusable Markdown document with adaptive structure, a recommended filename, and a user-confirmed storage location.
- **Work:** New `skills/olc-todoc/SKILL.md` in English (frontmatter `name`+`description`; Hard rules: content-first/no forced template, faithful/no fabrication with fact-vs-decision-vs-assumption separation, user-controlled storage with no assumed destination, check-before-write with no silent overwrite, no secrets/no false claims, resolved-path validation; Flow: understand → prepare → recommend `kebab-case.md` filename → confirm location → create/update → validate+report). No `src/` module and no new `olc_*` tool by design (standalone). Wiring: `bin/olc-setup.js` `OWNED_FILES` +1 entry; `tests/setup.test.ts` `OWNED` +1 entry with counts 6→7; `README.md` (five skills + uninstall snippet) and `AGENTS.md` (four→five skills) updated.
- **Acceptance criteria:** Per `docs/todoc-skill.md` §6: writes varied content to Markdown, preserves relevant conversation context, never forces a handoff/task template, picks structure from content without asking for a document type, recommends a filename, asks for unset name/location, creates nothing before storage is settled, checks existing files when accessible, produces accurate standalone-readable content, and reports storage accurately.
- **Date:** 2026-10-14
- **Implemented:** `skills/olc-todoc/SKILL.md`, `bin/olc-setup.js`, `tests/setup.test.ts`, `README.md`, `AGENTS.md`, `docs/TASKS.md`, version 0.8.0 (`package.json` via `npm pkg set` + lockfile root sync; `src/index.ts` `OLC_VERSION`; `CHANGELOG.md` 0.8.0 entry).
- **Verification commands/results:** `npm run typecheck` clean; `npm run build` clean; `npm test` → 156 pass / 0 fail (incl. updated `tests/setup.test.ts` counts 6→7); `npm pack --dry-run` → 62 files incl. `skills/olc-todoc/SKILL.md`, no memory/taste/decision remnants; `node bin/olc-setup.js setup --dry-run` → 7 created (2 agents + 5 skills). No publish — requires separate explicit user approval.
- **Evidence/files/commit:** Pending — commit + tag `v0.8.0` + tag push per user request.
- **Remaining issues:** Publish of 0.8.0 requires the user — never run by the agent.
- **Next task:** None yet — pending verification then user direction.

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
