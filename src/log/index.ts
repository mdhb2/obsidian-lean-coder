/**
 * Activity event log (OLC-060).
 *
 * Important OLC activity is recorded as durable Markdown under the validated
 * project scope: `<vault>/OLC/Projects/<project_id>/logs/YYYY-MM-DD.md`
 * (one file per day — that date split IS the rotation; no size-based
 * rotation for MVP).
 *
 * Design constraints (from the task spec):
 * - Every write validates vault identity first (OLC-021); invalid vault →
 *   throw with zero files created.
 * - Appends use a single O_APPEND write, so an interruption can never
 *   corrupt previously written entries. A file missing its trailing newline
 *   (crash remnant) is normalized before the next append.
 * - Secrets are scrubbed, never stored: known credential patterns in
 *   summary/details are replaced with `[redacted]` and the entry is marked.
 * - This module never hooks tool calls; events are recorded only by explicit
 *   `logEvent` calls, so there is no per-tool-call noise by construction.
 * - Readers take explicit paths; callers that cross project boundaries
 *   (e.g. resume) must run `validateIdentity` themselves first.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ResolvedConfig } from "../config/index.js";
import { validateIdentity } from "../core/project-identity.js";
import { projectScopeRoot, withFrontmatter } from "../vault/index.js";

export type LogErrorCode = "INVALID_EVENT" | "INVALID_DATE" | "LOG_WRITE_FAILED" | "LOG_READ_FAILED";

export class LogError extends Error {
  readonly code: LogErrorCode;
  constructor(code: LogErrorCode, message: string) {
    super(message);
    this.name = "LogError";
    this.code = code;
  }
}

export type LogEventKind =
  | "milestone"
  | "checkpoint"
  | "task-status"
  | "decision"
  | "verify"
  | "session"
  | "scope-change";

export interface LogEventInput {
  kind: LogEventKind;
  summary: string;
  taskId?: string;
  details?: string;
  gitSha?: string;
  /** ISO timestamp; defaults to now. Inject a fixed value in tests. */
  date?: string;
}

export interface LoggedEvent {
  kind: string;
  summary: string;
  taskId?: string;
  details?: string;
  gitSha?: string;
  date: string;
  redacted: boolean;
}

/** Credential shapes that must never reach the vault. Documented, minimal. */
const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /gh[pousr]_[A-Za-z0-9_]+/g,
  /xox[bpas]-[A-Za-z0-9-]+/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g,
  /(password|passwd|secret|token)\s*[:=]\s*\S+/gi,
];

function scrubSecrets(text: string): { text: string; redacted: boolean } {
  let out = text;
  let redacted = false;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(out)) {
      redacted = true;
      pattern.lastIndex = 0;
      out = out.replace(pattern, "[redacted]");
    }
  }
  return { text: out, redacted };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function dayOf(iso: string): string {
  if (!ISO_DATE_RE.test(iso)) {
    throw new LogError(
      "INVALID_DATE",
      `Invalid log event date ${JSON.stringify(iso)}: expected an ISO timestamp like 2026-10-12T14:03:22Z.`,
    );
  }
  return iso.slice(0, 10);
}

function logsDir(vaultRoot: string, projectId: string): string {
  return join(projectScopeRoot(vaultRoot, projectId), "logs");
}

function ensureDayFile(path: string, projectId: string, day: string): void {
  if (existsSync(path)) return;
  mkdirSync(join(path, ".."), { recursive: true });
  // "wx" fails when another process won the race — that is fine, the file
  // (with an identical header) already exists and we just append below.
  try {
    const header =
      withFrontmatter({ project: projectId, type: "activity-log", date: day }, "") +
      "## Terkait\n\n- [[../index]] — hub memori proyek\n- [[../current-state]] — status terbaru proyek\n\n";
    appendFileSync(path, header.endsWith("\n") ? header : header + "\n", { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw new LogError(
        "LOG_WRITE_FAILED",
        `Cannot create log file at ${path}: ${(error as Error).message}. Check vault permissions.`,
      );
    }
  }
}

function formatEntry(event: Required<Pick<LogEventInput, "kind" | "summary">> & LogEventInput, iso: string): string {
  const scrubbedSummary = scrubSecrets(event.summary);
  const scrubbedDetails = event.details !== undefined ? scrubSecrets(event.details) : null;
  const redacted = scrubbedSummary.redacted || (scrubbedDetails?.redacted ?? false);
  const lines = [`## ${iso} — ${event.kind}${event.taskId ? ` — task ${event.taskId}` : ""}`];
  lines.push(`- summary: ${scrubbedSummary.text}`);
  if (scrubbedDetails !== null) lines.push(`- details: ${scrubbedDetails.text}`);
  if (event.gitSha) lines.push(`- sha: ${event.gitSha}`);
  if (redacted) lines.push(`- redacted: true`);
  // Obsidian graph links toward the task docs. parseEntries does not know the
  // `terkait` key and safely ignores it; it exists purely so every log entry
  // is a clickable node in the vault graph (second-brain navigation).
  if (event.taskId) {
    lines.push(
      `- terkait: [[../tasks/${event.taskId}/intent]], [[../tasks/${event.taskId}/plan]]`,
    );
  }
  return lines.join("\n") + "\n";
}

export interface LogEventArgs {
  projectRoot: string;
  config: ResolvedConfig;
  event: LogEventInput;
}

/**
 * Validate identity, then append one event to the day's log file.
 * Returns the file path and the stored (scrubbed) entry.
 */
export function logEvent(args: LogEventArgs): { file: string; entry: LoggedEvent } {
  const { event } = args;
  if (!event || typeof event.summary !== "string" || event.summary.trim() === "") {
    throw new LogError("INVALID_EVENT", "Invalid log event: a non-empty summary is required.");
  }
  if (typeof event.kind !== "string" || event.kind.trim() === "") {
    throw new LogError("INVALID_EVENT", "Invalid log event: a kind is required (e.g. milestone, checkpoint, session).");
  }
  const identity = validateIdentity(args.projectRoot, args.config);
  const iso = event.date ?? new Date().toISOString();
  const day = dayOf(iso);
  const dir = logsDir(identity.vaultRoot, identity.projectId);
  const file = join(dir, `${day}.md`);
  ensureDayFile(file, identity.projectId, day);
  // Normalize a crash remnant: a file not ending in newline gets one, so the
  // new entry always starts on its own line and prior entries stay intact.
  // An unreadable target fails here as LOG_WRITE_FAILED, before any append.
  let tail: string;
  try {
    tail = readFileSync(file, "utf8");
  } catch (error) {
    throw new LogError(
      "LOG_WRITE_FAILED",
      `Cannot read log file at ${file}: ${(error as Error).message}. Check vault permissions.`,
    );
  }
  const prefix = tail === "" || tail.endsWith("\n") ? "" : "\n";
  const body = formatEntry(event as LogEventInput & { kind: LogEventKind; summary: string }, iso);
  try {
    appendFileSync(file, prefix + body);
  } catch (error) {
    throw new LogError(
      "LOG_WRITE_FAILED",
      `Cannot append to log file at ${file}: ${(error as Error).message}. Check vault permissions.`,
    );
  }
  const parsed = parseEntries(prefix + body);
  return { file, entry: parsed[parsed.length - 1] };
}

/** Parse entries from log Markdown (frontmatter header ignored). */
export function parseEntries(text: string): LoggedEvent[] {
  const events: LoggedEvent[] = [];
  const normalized = text.startsWith("## ") ? "\n" + text : text;
  const chunks = normalized.split("\n## ");
  for (let i = 1; i < chunks.length; i++) {
    const lines = chunks[i].split("\n");
    const head = lines[0].split(" — ");
    if (head.length < 2) continue;
    const [iso, kind, taskPart] = head;
    if (!ISO_DATE_RE.test(iso) || !kind) continue;
    const entry: LoggedEvent = { kind, summary: "", date: iso, redacted: false };
    if (taskPart?.startsWith("task ")) entry.taskId = taskPart.slice(5);
    let current: "summary" | "details" | null = null;
    for (const line of lines.slice(1)) {
      if (line.startsWith("## ") || line === "") break;
      const m = /^- (summary|details|sha|redacted): ?(.*)$/.exec(line);
      if (m) {
        const [, key, value] = m;
        if (key === "summary") { entry.summary = value; current = "summary"; }
        else if (key === "details") { entry.details = value; current = "details"; }
        else if (key === "sha") { entry.gitSha = value; current = null; }
        else if (key === "redacted" && value.trim() === "true") { entry.redacted = true; current = null; }
        else current = null;
      } else if (line.startsWith("  ") && (current === "summary" || current === "details")) {
        entry[current] += "\n" + line.slice(2);
      } else {
        current = null;
      }
    }
    events.push(entry);
  }
  return events;
}

/** Read one day's log file; missing file → empty list (not an error). */
export function readLogDay(vaultRoot: string, projectId: string, day: string): LoggedEvent[] {
  const file = join(logsDir(vaultRoot, projectId), `${day}.md`);
  if (!existsSync(file)) return [];
  try {
    return parseEntries(readFileSync(file, "utf8"));
  } catch (error) {
    throw new LogError(
      "LOG_READ_FAILED",
      `Cannot read log file at ${file}: ${(error as Error).message}. Check vault permissions.`,
    );
  }
}

/**
 * Newest-first events across day files, up to `limit`. Day files sort
 * lexicographically (YYYY-MM-DD), so no directory walk beyond `logs/`.
 */
export function readLastEvents(
  vaultRoot: string,
  projectId: string,
  limit: number,
): LoggedEvent[] {
  const dir = logsDir(vaultRoot, projectId);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new LogError(
      "LOG_READ_FAILED",
      `Cannot list log directory at ${dir}: ${(error as Error).message}. Check vault permissions.`,
    );
  }
  const out: LoggedEvent[] = [];
  for (const file of files) {
    const events = readLogDay(vaultRoot, projectId, file.slice(0, 10));
    for (let i = events.length - 1; i >= 0 && out.length < limit; i--) out.push(events[i]);
    if (out.length >= limit) break;
  }
  return out;
}
