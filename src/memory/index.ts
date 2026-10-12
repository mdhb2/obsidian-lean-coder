/**
 * Progressive memory retrieval (OLC-062).
 *
 * Read the small things first (`index.md`, `current-state.md`), then pull
 * only the memory/decision docs, task docs, and log events relevant to the
 * caller's query. Never scans the whole vault: every read is resolved inside
 * the validated project's scope, so unrelated project folders are untouched
 * by construction. Writes (`recordMemory`) go through the same identity gate
 * and land only inside the validated project scope.
 *
 * Reuses: identity gate (OLC-021), scope-enforced vault paths + atomic
 * writes (OLC-023), newest-first log readers (OLC-060).
 */

import { readdirSync } from "node:fs";

import type { ResolvedConfig } from "../config/index.js";
import { validateIdentity } from "../core/project-identity.js";
import { readLastEvents, type LoggedEvent } from "../log/index.js";
import {
  readVaultDoc,
  resolveVaultDoc,
  writeVaultDoc,
} from "../vault/index.js";

export type MemoryErrorCode = "INVALID_NAME" | "INVALID_INPUT";

export class MemoryError extends Error {
  readonly code: MemoryErrorCode;
  constructor(code: MemoryErrorCode, message: string) {
    super(message);
    this.name = "MemoryError";
    this.code = code;
  }
}

/** Directories searched for relevant docs — always inside one project scope. */
const SEARCH_DIRS = ["memory", "decisions"] as const;

/** Tokens this short or this common never match (noise guard for scoring). */
const STOPWORDS = new Set(
  "a,an,the,and,or,for,with,that,this,from,are,was,were,has,have,had,will,would,should,could,about,into,over,after,before,between,under,what,when,where,which,while,also,just,then,than,them,they,their,to,of,in,on,at,is,it,as,be,by,we,us,do,if,so,no,my,me,our,your,his,her,its,not,but,all,any,can,how,why,who".split(
    ",",
  ),
);

/** Max matches returned and max excerpt chars per match (output-token caps). */
const DEFAULT_MATCH_LIMIT = 8;
const EXCERPT_CHARS = 1200;

function tokenize(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 2 && !STOPWORDS.has(t)),
    ),
  ];
}

function checkName(name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) {
    throw new MemoryError(
      "INVALID_NAME",
      `Invalid memory name ${JSON.stringify(name)}: use letters, digits, dash or underscore, starting with a letter or digit. No paths, no extensions (".md" is added).`,
    );
  }
}

function readOrNull(path: string): string | null {
  try {
    return readVaultDoc(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function listMdFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function scoreDoc(fileName: string, content: string, tokens: string[]): number {
  const lowerName = fileName.toLowerCase();
  const lowerBody = content.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (lowerName.includes(token)) score += 2;
    // Count occurrences, capped so one long file can't dominate.
    let count = 0;
    let from = 0;
    for (;;) {
      const hit = lowerBody.indexOf(token, from);
      if (hit === -1 || count >= 5) break;
      count++;
      from = hit + token.length;
    }
    score += count;
  }
  return score;
}

export interface MemoryMatch {
  /** Which scope dir the doc lives in (`memory/` or `decisions/`). */
  dir: (typeof SEARCH_DIRS)[number];
  file: string;
  score: number;
  excerpt: string;
  truncated: boolean;
}

export interface RecallTaskDocs {
  taskId: string;
  intent: string | null;
  plan: string | null;
}

export interface RecallInput {
  /** Any directory inside the project (identity resolution starts here). */
  projectRoot: string;
  config: ResolvedConfig;
  /** Free-text query; empty/omitted means "base context only, no doc scan". */
  query?: string;
  /** When set, that task's intent/plan docs are included (missing → null). */
  taskId?: string;
  /** Default true: include recent log events (query-filtered when set). */
  includeLogs?: boolean;
  /** Max log events to consider. Default 10. */
  logLimit?: number;
  /** Max doc matches. Default 8. */
  limit?: number;
}

export interface RecallResult {
  projectId: string;
  branch: string;
  /** Project index, or null when not yet written. */
  index: string | null;
  /** Current state, or null when not yet written. */
  currentState: string | null;
  taskDocs: RecallTaskDocs | null;
  /** Relevant docs, best score first (empty without a query). */
  matches: MemoryMatch[];
  /** Recent log events, newest first (query-filtered when a query is set). */
  logEvents: LoggedEvent[];
}

function matchesQuery(event: LoggedEvent, tokens: string[]): boolean {
  const haystack = `${event.kind} ${event.taskId ?? ""} ${event.summary} ${event.details ?? ""}`.toLowerCase();
  return tokens.some((t) => haystack.includes(t));
}

/**
 * Recall relevant memory. Validates identity first (wrong project or
 * unavailable vault throws before any read), then reads index + state,
 * the requested task's docs, query-matching scope docs, and recent logs.
 * Read-only: never writes, never leaves the validated project scope.
 */
export function recallMemory(input: RecallInput): RecallResult {
  const identity = validateIdentity(input.projectRoot, input.config);
  const { vaultRoot, projectId, branch } = identity;
  const tokens = tokenize(input.query ?? "");

  const index = readOrNull(resolveVaultDoc(vaultRoot, projectId, "index.md"));
  const currentState = readOrNull(
    resolveVaultDoc(vaultRoot, projectId, "current-state.md"),
  );

  let taskDocs: RecallTaskDocs | null = null;
  if (input.taskId !== undefined) {
    taskDocs = {
      taskId: input.taskId,
      intent: readOrNull(
        resolveVaultDoc(vaultRoot, projectId, "tasks", input.taskId, "intent.md"),
      ),
      plan: readOrNull(
        resolveVaultDoc(vaultRoot, projectId, "tasks", input.taskId, "plan.md"),
      ),
    };
  }

  const matches: MemoryMatch[] = [];
  if (tokens.length > 0) {
    for (const dir of SEARCH_DIRS) {
      const absDir = resolveVaultDoc(vaultRoot, projectId, dir);
      for (const file of listMdFiles(absDir)) {
        const content =
          readOrNull(resolveVaultDoc(vaultRoot, projectId, dir, file)) ?? "";
        const score = scoreDoc(file, content, tokens);
        if (score <= 0) continue;
        const truncated = content.length > EXCERPT_CHARS;
        matches.push({
          dir,
          file,
          score,
          excerpt: truncated
            ? content.slice(0, EXCERPT_CHARS) + "\n…(truncated)"
            : content,
          truncated,
        });
      }
    }
    matches.sort((a, b) => b.score - a.score || (a.file < b.file ? -1 : 1));
  }

  let logEvents: LoggedEvent[] = [];
  if (input.includeLogs ?? true) {
    const events = readLastEvents(vaultRoot, projectId, input.logLimit ?? 10);
    logEvents = tokens.length > 0 ? events.filter((e) => matchesQuery(e, tokens)) : events;
  }

  return {
    projectId,
    branch,
    index,
    currentState,
    taskDocs,
    matches: matches.slice(0, input.limit ?? DEFAULT_MATCH_LIMIT),
    logEvents,
  };
}

export interface RecordMemoryInput {
  /** Any directory inside the project (identity resolution starts here). */
  projectRoot: string;
  config: ResolvedConfig;
  /** Plain name (`auth-notes` → `memory/auth-notes.md`). No paths. */
  name: string;
  /** Markdown body. Must be non-empty. */
  content: string;
  /** Must be true to replace an existing note. Default false. */
  overwrite?: boolean;
}

/**
 * Record one memory note inside the validated project scope.
 * Identity failures throw before any write; existing notes are never
 * silently replaced (`overwrite: true` required).
 * Returns the vault-relative path of the note.
 */
export function recordMemory(input: RecordMemoryInput): string {
  checkName(input.name);
  if (typeof input.content !== "string" || input.content.trim() === "") {
    throw new MemoryError("INVALID_INPUT", "Memory content must be a non-empty string.");
  }
  const identity = validateIdentity(input.projectRoot, input.config);
  writeVaultDoc(
    resolveVaultDoc(
      identity.vaultRoot,
      identity.projectId,
      "memory",
      `${input.name}.md`,
    ),
    input.content.endsWith("\n") ? input.content : input.content + "\n",
    { overwrite: input.overwrite ?? false },
  );
  return `memory/${input.name}.md`;
}
