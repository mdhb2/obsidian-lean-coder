---
name: olc-memory
description: Search and update project memory notes progressively — read small first, only what's relevant to the query. Never scans the whole vault.
---

# olc-memory

Project-scoped memory: read `index.md` + `current-state.md` first, then only the `memory/` + `decisions/` documents, task docs, and log events relevant to the query. Write back only within the validated project scope.

## Hard rules

1. **Identity first.** `validateIdentity` must pass before any read/write. Wrong project or unavailable vault → fail with zero files touched.
2. **Never scans other projects' folders.** Every path resolves inside `<vault>/OLC/Projects/<id>/`; other folders are untouched by construction.
3. **Controlled writes.** `recordMemory` requires a plain name (letters/digits/dash/underscore, no path/extension) plus non-empty content; existing files are never silently overwritten (`overwrite` must be explicit).

## Flow

1. Call `recallMemory({ projectRoot, config, query?, taskId?, includeLogs?, logLimit?, limit? })` — no query = base context (index + state + recent log, unfiltered).
2. With a query: query tokens are filtered for stopwords, each `memory/` + `decisions/` document is scored (filename weighted), excerpts are capped at 1200 characters with a truncation flag, best score first.
3. With `taskId`: include that task's intent/plan doc status (missing → null, not an error).
4. To save: `recordMemory({ projectRoot, config, name, content, overwrite? })` → atomic write to `memory/<name>.md`. `content` must include a `## Terkait` section with relative wikilinks to `[[../index]]`, `[[../current-state]]`, and any related task/decision document — this keeps the memory note connected in the vault graph (second brain) instead of an isolated island.

## Verifying this skill

- Project A's memory never shows up on recall in project B (multi-project isolation).
- Every relevance claim is traceable to a document + line, not invented.
