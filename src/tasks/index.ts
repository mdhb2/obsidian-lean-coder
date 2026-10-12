/**
 * Task registry, branch matching, and status transitions (OLC-033).
 *
 * Stored at `tasks/registry.json` inside the project vault scope:
 * `{ "tasks": { "<taskId>": { "status", "branch", "updatedAt" } } }`.
 *
 * Status transition table (also recorded in docs/DECISIONS.md #7):
 *
 * - draft      → approved, rejected
 * - approved   → in_progress, draft
 * - in_progress→ review, blocked
 * - blocked    → in_progress
 * - review     → done, in_progress
 * - rejected   → draft
 * - done       → (terminal; no outgoing transitions)
 *
 * Rules: a task reaches `done` only through an explicit `setTaskStatus`
 * call after user confirmation — nothing transitions implicitly, and
 * `in_progress` can never jump straight to `done` (must pass `review`).
 * Resume only recommends; it never switches branches or tasks by itself.
 */

import { readVaultDoc, resolveVaultDoc, writeVaultDoc } from "../vault/index.js";

export type TaskStatus =
  | "draft"
  | "approved"
  | "in_progress"
  | "review"
  | "blocked"
  | "rejected"
  | "done";

export const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft: ["approved", "rejected"],
  approved: ["in_progress", "draft"],
  in_progress: ["review", "blocked"],
  blocked: ["in_progress"],
  review: ["done", "in_progress"],
  rejected: ["draft"],
  done: [],
};

export const TERMINAL_STATUSES: TaskStatus[] = ["done", "rejected"];

export class TaskRegistryError extends Error {
  readonly code: "INVALID_TRANSITION" | "ALREADY_REGISTERED" | "UNKNOWN_TASK" | "CORRUPT_REGISTRY";
  constructor(
    code: "INVALID_TRANSITION" | "ALREADY_REGISTERED" | "UNKNOWN_TASK" | "CORRUPT_REGISTRY",
    message: string,
  ) {
    super(message);
    this.name = "TaskRegistryError";
    this.code = code;
  }
}

export interface TaskEntry {
  status: TaskStatus;
  branch: string | null;
  updatedAt: string;
}

export interface TaskRegistry {
  tasks: Record<string, TaskEntry>;
}

const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-_]{0,63}$/;

function registryPath(vaultRoot: string, projectId: string): string {
  return resolveVaultDoc(vaultRoot, projectId, "tasks", "registry.json");
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" &&
    (Object.keys(TRANSITIONS) as TaskStatus[]).includes(value as TaskStatus)
  );
}

function parseRegistry(text: string, path: string): TaskRegistry {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new TaskRegistryError(
      "CORRUPT_REGISTRY",
      `Task registry at ${path} is not valid JSON (${(error as Error).message}). Fix or delete it to start fresh.`,
    );
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new TaskRegistryError(
      "CORRUPT_REGISTRY",
      `Task registry at ${path} must be a JSON object with a "tasks" map.`,
    );
  }
  const tasks = (json as Record<string, unknown>)["tasks"];
  if (typeof tasks !== "object" || tasks === null || Array.isArray(tasks)) {
    throw new TaskRegistryError(
      "CORRUPT_REGISTRY",
      `Task registry at ${path} must contain a "tasks" object.`,
    );
  }
  for (const [id, entry] of Object.entries(tasks as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new TaskRegistryError("CORRUPT_REGISTRY", `Task registry entry "${id}" must be an object.`);
    }
    const e = entry as Record<string, unknown>;
    if (!isTaskStatus(e["status"])) {
      throw new TaskRegistryError(
        "CORRUPT_REGISTRY",
        `Task registry entry "${id}" has unknown status ${JSON.stringify(e["status"])}.`,
      );
    }
    if (e["branch"] !== null && typeof e["branch"] !== "string") {
      throw new TaskRegistryError(
        "CORRUPT_REGISTRY",
        `Task registry entry "${id}" has a non-string branch.`,
      );
    }
    if (typeof e["updatedAt"] !== "string") {
      throw new TaskRegistryError(
        "CORRUPT_REGISTRY",
        `Task registry entry "${id}" is missing string "updatedAt".`,
      );
    }
  }
  return { tasks: tasks as Record<string, TaskEntry> };
}

export function readRegistry(vaultRoot: string, projectId: string): TaskRegistry {
  const path = registryPath(vaultRoot, projectId);
  try {
    return parseRegistry(readVaultDoc(path), path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { tasks: {} };
    throw error;
  }
}

function saveRegistry(vaultRoot: string, projectId: string, registry: TaskRegistry): void {
  writeVaultDoc(registryPath(vaultRoot, projectId), JSON.stringify(registry, null, 2) + "\n", {
    overwrite: true,
  });
}

function checkTaskId(taskId: string): void {
  if (!TASK_ID_PATTERN.test(taskId)) {
    throw new TaskRegistryError(
      "UNKNOWN_TASK",
      `Invalid task id ${JSON.stringify(taskId)}: use 1–64 letters, digits, dash or underscore.`,
    );
  }
}

/** Register a new task as `draft`. Duplicate ids are an error, never merged. */
export function registerTask(
  vaultRoot: string,
  projectId: string,
  taskId: string,
  branch: string | null,
  date: string,
): TaskEntry {
  checkTaskId(taskId);
  const registry = readRegistry(vaultRoot, projectId);
  if (registry.tasks[taskId]) {
    throw new TaskRegistryError(
      "ALREADY_REGISTERED",
      `Task ${taskId} is already registered (status ${registry.tasks[taskId].status}). Use setTaskStatus to move it.`,
    );
  }
  const entry: TaskEntry = { status: "draft", branch, updatedAt: date };
  registry.tasks[taskId] = entry;
  saveRegistry(vaultRoot, projectId, registry);
  return entry;
}

/** (Re)associate a task with a branch. Never switches the actual Git branch. */
export function attachBranch(
  vaultRoot: string,
  projectId: string,
  taskId: string,
  branch: string | null,
  date: string,
): TaskEntry {
  const registry = readRegistry(vaultRoot, projectId);
  const entry = registry.tasks[taskId];
  if (!entry) {
    throw new TaskRegistryError(
      "UNKNOWN_TASK",
      `Task ${taskId} is not registered. Register it before attaching a branch.`,
    );
  }
  entry.branch = branch;
  entry.updatedAt = date;
  saveRegistry(vaultRoot, projectId, registry);
  return entry;
}

/**
 * Move a task to a new status. Only table-allowed transitions pass;
 * anything else throws `INVALID_TRANSITION` listing what is allowed.
 */
export function setTaskStatus(
  vaultRoot: string,
  projectId: string,
  taskId: string,
  to: TaskStatus,
  date: string,
): TaskEntry {
  const registry = readRegistry(vaultRoot, projectId);
  const entry = registry.tasks[taskId];
  if (!entry) {
    throw new TaskRegistryError(
      "UNKNOWN_TASK",
      `Task ${taskId} is not registered. Register it before changing status.`,
    );
  }
  if (!TRANSITIONS[entry.status].includes(to)) {
    const allowed = TRANSITIONS[entry.status];
    throw new TaskRegistryError(
      "INVALID_TRANSITION",
      `Task ${taskId} cannot move from ${entry.status} to ${to}. ` +
        (allowed.length === 0
          ? `${entry.status} is terminal — the task stays open as history.`
          : `Allowed from ${entry.status}: ${allowed.join(", ")}.`),
    );
  }
  entry.status = to;
  entry.updatedAt = date;
  saveRegistry(vaultRoot, projectId, registry);
  return entry;
}

export function getTask(
  vaultRoot: string,
  projectId: string,
  taskId: string,
): TaskEntry | null {
  return readRegistry(vaultRoot, projectId).tasks[taskId] ?? null;
}

export interface ResumeRecommendation {
  /** The recommended task, or null when there is nothing unambiguous to suggest. */
  taskId: string | null;
  /** Human-readable note: what was found and what confirmation is needed. */
  note: string;
}

/**
 * Recommend the most recently active non-terminal task on `currentBranch`.
 * Recommendation only: never resumes, switches, or closes anything.
 * Unknown/empty branch or no matching task yields a note asking the user.
 */
export function recommendResume(
  vaultRoot: string,
  projectId: string,
  currentBranch: string | null,
): ResumeRecommendation {
  if (!currentBranch) {
    return {
      taskId: null,
      note: "Current branch is unknown — tell me which branch and task to resume, and confirm before I continue.",
    };
  }
  const registry = readRegistry(vaultRoot, projectId);
  const onBranch = Object.entries(registry.tasks)
    .filter(([, e]) => e.branch === currentBranch && !TERMINAL_STATUSES.includes(e.status))
    .sort((a, b) => (a[1].updatedAt < b[1].updatedAt ? 1 : -1));
  if (onBranch.length === 0) {
    const total = Object.keys(registry.tasks).length;
    return {
      taskId: null,
      note:
        total === 0
          ? `No tasks are registered yet. Tell me which task to start on branch ${currentBranch}.`
          : `No open tasks are attached to branch ${currentBranch} (${total} registered elsewhere). Tell me which task to resume, and confirm.`,
    };
  }
  const [taskId, entry] = onBranch[0];
  return {
    taskId,
    note:
      `Most recently active open task on ${currentBranch} is ${taskId} ` +
      `(status ${entry.status}, updated ${entry.updatedAt}). Confirm before I resume it — nothing was switched or closed.`,
  };
}
