/**
 * Task finalization: close a task for good and keep its knowledge.
 *
 * Only ever runs on explicit user request ("task X selesai"). The flow:
 * 1. Validate identity and migrate pre-multitask layouts.
 * 2. Refuse sub-tasks (finalize the parent instead), already-done tasks,
 *    draft tasks (nothing approved to close), and tasks with still-open
 *    sub-tasks (finish or drop them first).
 * 3. Compose project knowledge from the task's own records (intent, plan,
 *    history, checkpoint log events) plus optional agent highlights, and
 *    write it once to `knowledge/<taskId>.md` (create-only).
 * 4. Move the whole task folder to `tasks/done/<taskId>/`, flip the registry
 *    to `done` (terminal, immutable), and log a `task-status` event.
 */

import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ResolvedConfig } from "../config/index.js";
import { validateIdentity } from "../core/project-identity.js";
import { readLastEvents } from "../log/index.js";
import { logEvent } from "../log/index.js";
import {
  TERMINAL_STATUSES,
  getTask,
  migrateTaskLayout,
  readRegistry,
  resolveTaskDir,
  setTaskStatus,
} from "../tasks/index.js";
import {
  projectScopeRoot,
  readVaultDoc,
  renderTemplate,
  resolveVaultDoc,
  writeVaultDoc,
} from "../vault/index.js";

export type FinalizeErrorCode =
  | "UNKNOWN_TASK"
  | "NOT_FINALIZABLE"
  | "OPEN_SUBTASKS"
  | "ALREADY_EXISTS";

export class FinalizeError extends Error {
  readonly code: FinalizeErrorCode;
  constructor(code: FinalizeErrorCode, message: string) {
    super(message);
    this.name = "FinalizeError";
    this.code = code;
  }
}

export interface FinalizeInput {
  /** Any directory inside the project (identity resolution starts here). */
  projectRoot: string;
  config: ResolvedConfig;
  taskId: string;
  /** Optional agent/user notes to append to the knowledge file. */
  highlights?: string;
  /** ISO timestamp; defaults to now. Inject a fixed value in tests. */
  date?: string;
}

export interface FinalizeResult {
  taskId: string;
  /** Vault-absolute path of the written knowledge file. */
  knowledgeFile: string;
  /** Vault-absolute path of the moved task folder (`tasks/done/<id>/`). */
  taskDir: string;
  /** How many daily log files had task links rewritten to `tasks/done/`. */
  linksRewritten: number;
  date: string;
}

function readOrNull(path: string): string | null {
  try {
    return readVaultDoc(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Wikilinks copied from other documents resolve from their own directory, so
 * they would point nowhere inside the knowledge file. Render them as plain
 * text (`[[target|label]]` → `label`); the template's own Dokumen/Terkait
 * sections carry the links that are valid from `knowledge/`.
 */
function plainTextLinks(body: string): string {
  return body.replace(/\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
    const parts = inner.split("|").map((p) => p.trim()).filter((p) => p !== "");
    return parts.length > 0 ? parts[parts.length - 1] : inner;
  });
}

/**
 * Re-point this task's `terkait` links in every daily log file from
 * `tasks/active/<id>/` to `tasks/done/<id>/`, so the log graph stays
 * unbroken after the folder move. Only `- terkait:` lines are touched;
 * entry text is never altered. Sub-task links resolve under the parent
 * folder, so one prefix rewrite covers them as well. Returns how many
 * day files were rewritten.
 */
function rewriteTaskLogLinks(vaultRoot: string, projectId: string, taskId: string): number {
  const dir = join(projectScopeRoot(vaultRoot, projectId), "logs");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  const from = `tasks/active/${taskId}/`;
  const to = `tasks/done/${taskId}/`;
  let rewritten = 0;
  for (const file of files) {
    const path = join(dir, file);
    let text: string;
    try {
      text = readVaultDoc(path);
    } catch {
      continue;
    }
    const updated = text
      .split("\n")
      .map((line) => (line.startsWith("- terkait:") ? line.split(from).join(to) : line))
      .join("\n");
    if (updated !== text) {
      writeVaultDoc(path, updated, { overwrite: true });
      rewritten++;
    }
  }
  return rewritten;
}

export function finalizeTask(input: FinalizeInput): FinalizeResult {
  const identity = validateIdentity(input.projectRoot, input.config);
  const { vaultRoot, projectId } = identity;
  migrateTaskLayout(vaultRoot, projectId);

  const entry = getTask(vaultRoot, projectId, input.taskId);
  if (!entry) {
    throw new FinalizeError(
      "UNKNOWN_TASK",
      `Task ${input.taskId} is not registered. Register and approve it before finalizing.`,
    );
  }
  if (entry.parent) {
    throw new FinalizeError(
      "NOT_FINALIZABLE",
      `Task ${input.taskId} is a sub-task of ${entry.parent}: finalize the parent task instead — sub-tasks move along with it.`,
    );
  }
  if (entry.status === "done") {
    throw new FinalizeError(
      "NOT_FINALIZABLE",
      `Task ${input.taskId} is already done and immutable. Start a new task for follow-up work.`,
    );
  }
  if (entry.status === "draft" || entry.status === "rejected") {
    throw new FinalizeError(
      "NOT_FINALIZABLE",
      `Task ${input.taskId} is ${entry.status}: approve and work it before finalizing — there is nothing to close yet.`,
    );
  }

  const openSubtasks = Object.entries(readRegistry(vaultRoot, projectId).tasks)
    .filter(([, e]) => e.parent === input.taskId && !TERMINAL_STATUSES.includes(e.status))
    .map(([id]) => id)
    .sort();
  if (openSubtasks.length > 0) {
    throw new FinalizeError(
      "OPEN_SUBTASKS",
      `Task ${input.taskId} still has open sub-task(s): ${openSubtasks.join(", ")}. ` +
        "Finish or reject them first, then finalize the parent.",
    );
  }

  const iso = input.date ?? new Date().toISOString();
  const day = iso.slice(0, 10);
  const dir = resolveTaskDir(vaultRoot, projectId, input.taskId);
  const intent = readOrNull(join(dir, "intent.md")) ?? "(intent.md tidak ditemukan)";
  const plan = readOrNull(join(dir, "plan.md")) ?? "(plan.md tidak ditemukan)";
  const history = readOrNull(join(dir, "history.md")) ?? "(belum ada riwayat tercatat)";
  const checkpoints = readLastEvents(vaultRoot, projectId, 50)
    .filter((e) => e.taskId === input.taskId && e.kind === "checkpoint" && e.gitSha)
    .map((e) => `- ${e.date} — ${e.summary} (sha ${e.gitSha})`);
  const rendered = renderTemplate("knowledge", {
    project_id: projectId,
    task_id: input.taskId,
    date: day,
    objective: plainTextLinks(intent),
    plan: plainTextLinks(plan),
    history: plainTextLinks(history),
    checkpoints: checkpoints.length > 0 ? checkpoints.join("\n") : "(tidak ada checkpoint tercatat)",
    highlights:
      input.highlights !== undefined && input.highlights.trim() !== ""
        ? plainTextLinks(input.highlights.trim())
        : "(tidak ada)",
  });
  const knowledgeFile = resolveVaultDoc(vaultRoot, projectId, "knowledge", `${input.taskId}.md`);
  if (existsSync(knowledgeFile)) {
    throw new FinalizeError(
      "ALREADY_EXISTS",
      `Knowledge file for task ${input.taskId} already exists at ${knowledgeFile}. Remove it explicitly before finalizing again — nothing was moved or closed.`,
    );
  }
  mkdirSync(dirname(knowledgeFile), { recursive: true });
  writeVaultDoc(knowledgeFile, rendered);

  const doneDir = resolveVaultDoc(vaultRoot, projectId, "tasks", "done", input.taskId);
  mkdirSync(join(doneDir, ".."), { recursive: true });
  renameSync(dir, doneDir);
  setTaskStatus(vaultRoot, projectId, input.taskId, "done", iso);

  logEvent({
    projectRoot: input.projectRoot,
    config: input.config,
    event: {
      kind: "task-status",
      summary: `Task ${input.taskId} selesai dan difinalisasi. Knowledge tersimpan di knowledge/${input.taskId}.md.`,
      taskId: input.taskId,
      date: iso,
    },
  });
  // Rewrite AFTER logging: the new event's own links point at tasks/active/
  // until the folder move is reflected here.
  const linksRewritten = rewriteTaskLogLinks(vaultRoot, projectId, input.taskId);
  return { taskId: input.taskId, knowledgeFile, taskDir: doneDir, linksRewritten, date: iso };
}
