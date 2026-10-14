/**
 * Task registry, branch matching, and status transitions.
 *
 * Stored at `tasks/registry.json` inside the project vault scope:
 * `{ "tasks": { "<taskId>": { "status", "branch", "updatedAt", "parent?" } } }`.
 *
 * Status model (simplified multi-task flow):
 *
 * - draft      → active, rejected     (planned, not started)
 * - active     → pending, done        (currently worked on)
 * - pending    → active, done         (paused, resumable at any time)
 * - rejected   → draft                (dropped, can be re-drafted)
 * - done       → (terminal, immutable — never reopens; continue in a new task)
 *
 * Task documents live under `tasks/active/<taskId>/` while open and move to
 * `tasks/done/<taskId>/` on finalization. Sub-tasks (one level only) live at
 * `tasks/active/<parentId>/sub/<subId>/` with their own registry entries and
 * statuses, and move along with their parent on finalization.
 *
 * Rules: a task reaches `done` only through an explicit finalization after
 * user confirmation — nothing transitions implicitly. Resume only recommends;
 * it never switches branches or tasks by itself.
 */

import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

import { readVaultDoc, resolveVaultDoc, writeVaultDoc } from "../vault/index.js";

export type TaskStatus = "draft" | "active" | "pending" | "rejected" | "done";

export const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft: ["active", "rejected"],
  active: ["pending", "done"],
  pending: ["active", "done"],
  rejected: ["draft"],
  done: [],
};

export const TERMINAL_STATUSES: TaskStatus[] = ["done", "rejected"];

/** Old (pre-multitask) statuses mapped onto the current model. */
export const STATUS_MIGRATION: Record<string, TaskStatus> = {
  draft: "draft",
  approved: "active",
  in_progress: "active",
  review: "active",
  blocked: "pending",
  rejected: "rejected",
  done: "done",
  active: "active",
  pending: "pending",
};

export class TaskRegistryError extends Error {
  readonly code:
    | "INVALID_TRANSITION"
    | "ALREADY_REGISTERED"
    | "UNKNOWN_TASK"
    | "CORRUPT_REGISTRY";
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
  /** Set for sub-tasks: the top-level parent task id. Absent for top-level tasks. */
  parent?: string;
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
    if (e["parent"] !== undefined && typeof e["parent"] !== "string") {
      throw new TaskRegistryError(
        "CORRUPT_REGISTRY",
        `Task registry entry "${id}" has a non-string parent.`,
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

/** `tasks/active` holds open tasks, `tasks/done` holds finalized ones. */
export function taskStatusDir(status: TaskStatus): "active" | "done" {
  return status === "done" ? "done" : "active";
}

/**
 * Resolve a task's document directory inside the validated project scope.
 * Sub-tasks resolve under their parent (`tasks/active/<parent>/sub/<id>`);
 * finalized tasks (and their sub-tasks) resolve under `tasks/done/`.
 * Unregistered ids fall back to `tasks/active/<taskId>/` (draft-before-register
 * flow); callers that need registration guarantees check `getTask` first.
 */
export function resolveTaskDir(vaultRoot: string, projectId: string, taskId: string): string {
  const registry = readRegistry(vaultRoot, projectId);
  const entry = registry.tasks[taskId];
  if (!entry) {
    return resolveVaultDoc(vaultRoot, projectId, "tasks", "active", taskId);
  }
  if (entry.parent) {
    const parent = registry.tasks[entry.parent];
    if (!parent) {
      throw new TaskRegistryError(
        "CORRUPT_REGISTRY",
        `Sub-task ${taskId} points at unknown parent ${entry.parent}. Fix or delete the entry.`,
      );
    }
    const parentDir = resolveVaultDoc(
      vaultRoot,
      projectId,
      "tasks",
      taskStatusDir(parent.status),
      entry.parent,
    );
    return join(parentDir, "sub", taskId);
  }
  return resolveVaultDoc(vaultRoot, projectId, "tasks", taskStatusDir(entry.status), taskId);
}

export interface TaskMigrationReport {
  migrated: boolean;
  moved: string[];
  statusChanges: string[];
}

/**
 * Migrate a pre-multitask vault layout in place: map old registry statuses
 * onto the current model and move `tasks/<id>/` folders to
 * `tasks/active/<id>/` (or `tasks/done/<id>/` for done tasks).
 * Idempotent: a current layout reports `migrated: false` and writes nothing.
 */
export function migrateTaskLayout(vaultRoot: string, projectId: string): TaskMigrationReport {
  const path = registryPath(vaultRoot, projectId);
  let raw: string;
  try {
    raw = readVaultDoc(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { migrated: false, moved: [], statusChanges: [] };
    }
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new TaskRegistryError(
      "CORRUPT_REGISTRY",
      `Task registry at ${path} is not valid JSON (${(error as Error).message}). Fix or delete it to start fresh.`,
    );
  }
  const tasks = (json as Record<string, unknown>)?.["tasks"];
  if (typeof tasks !== "object" || tasks === null || Array.isArray(tasks)) {
    throw new TaskRegistryError(
      "CORRUPT_REGISTRY",
      `Task registry at ${path} must contain a "tasks" object.`,
    );
  }
  const moved: string[] = [];
  const statusChanges: string[] = [];
  let dirty = false;
  const registry: TaskRegistry = { tasks: {} };
  for (const [id, value] of Object.entries(tasks as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TaskRegistryError("CORRUPT_REGISTRY", `Task registry entry "${id}" must be an object.`);
    }
    const e = value as Record<string, unknown>;
    const mapped = typeof e["status"] === "string" ? STATUS_MIGRATION[e["status"]] : undefined;
    if (!mapped) {
      throw new TaskRegistryError(
        "CORRUPT_REGISTRY",
        `Task registry entry "${id}" has unknown status ${JSON.stringify(e["status"])}.`,
      );
    }
    if (e["status"] !== mapped) {
      statusChanges.push(`${id}: ${e["status"]} → ${mapped}`);
      dirty = true;
    }
    registry.tasks[id] = {
      status: mapped,
      branch: (e["branch"] as string | null) ?? null,
      updatedAt: typeof e["updatedAt"] === "string" ? e["updatedAt"] : new Date().toISOString(),
    };
    const from = resolveVaultDoc(vaultRoot, projectId, "tasks", id);
    if (existsSync(from)) {
      const to = resolveVaultDoc(vaultRoot, projectId, "tasks", taskStatusDir(mapped), id);
      if (!existsSync(to)) {
        mkdirSync(join(to, ".."), { recursive: true });
        renameSync(from, to);
        moved.push(`${id} → tasks/${taskStatusDir(mapped)}/${id}`);
        dirty = true;
      }
    }
  }
  if (dirty) saveRegistry(vaultRoot, projectId, registry);
  return { migrated: dirty, moved, statusChanges };
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

/**
 * Register a sub-task under a top-level task. One level only: the parent must
 * exist, must itself be top-level, and must not be done (done is immutable).
 * The sub-task starts as `draft` and inherits the parent's branch by default.
 */
export function registerSubtask(
  vaultRoot: string,
  projectId: string,
  parentId: string,
  subtaskId: string,
  branch: string | null,
  date: string,
): TaskEntry {
  checkTaskId(subtaskId);
  const registry = readRegistry(vaultRoot, projectId);
  const parent = registry.tasks[parentId];
  if (!parent) {
    throw new TaskRegistryError(
      "UNKNOWN_TASK",
      `Parent task ${parentId} is not registered. Register it before adding sub-tasks.`,
    );
  }
  if (parent.parent) {
    throw new TaskRegistryError(
      "INVALID_TRANSITION",
      `Task ${parentId} is itself a sub-task — sub-tasks nest one level only.`,
    );
  }
  if (parent.status === "done") {
    throw new TaskRegistryError(
      "INVALID_TRANSITION",
      `Task ${parentId} is done and immutable. Start a new task instead of adding sub-tasks to it.`,
    );
  }
  if (registry.tasks[subtaskId]) {
    throw new TaskRegistryError(
      "ALREADY_REGISTERED",
      `Task ${subtaskId} is already registered (status ${registry.tasks[subtaskId].status}). Use setTaskStatus to move it.`,
    );
  }
  const entry: TaskEntry = {
    status: "draft",
    branch: branch ?? parent.branch,
    updatedAt: date,
    parent: parentId,
  };
  registry.tasks[subtaskId] = entry;
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
 * `done` is terminal and immutable — finalized tasks never reopen.
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
          ? `${entry.status} is terminal and immutable — continue the work in a new task.`
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

export interface OpenTask {
  taskId: string;
  entry: TaskEntry;
}

/** All non-terminal tasks, newest `updatedAt` first. Read-only. */
export function listOpenTasks(vaultRoot: string, projectId: string): OpenTask[] {
  return Object.entries(readRegistry(vaultRoot, projectId).tasks)
    .filter(([, e]) => !TERMINAL_STATUSES.includes(e.status))
    .sort((a, b) => (a[1].updatedAt < b[1].updatedAt ? 1 : -1))
    .map(([taskId, entry]) => ({ taskId, entry }));
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

/**
 * Answer "what is the next task?": prefer the most recently active open task
 * on the current branch, fall back to the most recently active open task
 * overall. Recommendation only — the user confirms before anything resumes.
 */
export function recommendNext(
  vaultRoot: string,
  projectId: string,
  currentBranch: string | null,
): ResumeRecommendation {
  const open = listOpenTasks(vaultRoot, projectId);
  if (open.length === 0) {
    const total = Object.keys(readRegistry(vaultRoot, projectId).tasks).length;
    return {
      taskId: null,
      note:
        total === 0
          ? "No tasks are registered yet. Tell me what to work on first."
          : "No open tasks remain — every registered task is done or rejected. Tell me what to work on next.",
    };
  }
  if (currentBranch) {
    const onBranch = open.filter((t) => t.entry.branch === currentBranch);
    if (onBranch.length > 0) {
      const [task] = onBranch;
      const others =
        open.length > 1
          ? ` ${open.length - 1} other open task(s) exist besides it.`
          : "";
      return {
        taskId: task.taskId,
        note:
          `Next task: ${task.taskId} (status ${task.entry.status}, updated ${task.entry.updatedAt}).${others} ` +
          "Confirm before I continue it — nothing was switched or closed.",
      };
    }
  }
  const [task] = open;
  const branchNote =
    currentBranch !== null && currentBranch !== undefined
      ? ` No open tasks are attached to branch ${currentBranch}, so this is the most recently active task overall.`
      : "";
  return {
    taskId: task.taskId,
    note:
      `Next task: ${task.taskId} (status ${task.entry.status}, updated ${task.entry.updatedAt}).${branchNote} ` +
      "Confirm before I continue it — nothing was switched or closed.",
  };
}
