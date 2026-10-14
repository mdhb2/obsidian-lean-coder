/**
 * Planning approval and scope-change return path.
 *
 * Combines the document gate (both intent.md and plan.md approved) with the
 * registry gate (task status allows implementation), and implements the
 * scope-change loop: an active task whose scope changes goes back to pending
 * for re-approval instead of silently continuing.
 *
 * - `assertBuildReady`: build gate — registry status must be `active` or
 *   `pending` AND both docs must be `approved`. Anything else throws.
 * - `requestScopeChange`: park an active/pending task for revision.
 *   Registry moves `active → pending` (already-`pending` stays put); docs
 *   are revised WITHOUT body changes, so statuses flip back to `draft` and
 *   re-approval becomes mandatory. History records the reason plus a
 *   reminder that a safe code checkpoint is required before continuing
 *   impacted work.
 * - `resumeAfterRevision`: explicit re-entry after re-approval — approves
 *   the docs again and moves the registry `pending → active`.
 *   Nothing resumes implicitly.
 */

import {
  PlanningError,
  approveTaskDocs,
  assertApproved,
  reviseTaskDocs,
} from "../planning/index.js";
import {
  TaskRegistryError,
  getTask,
  setTaskStatus,
  type TaskStatus,
} from "../tasks/index.js";

export type ApprovalErrorCode = "NOT_APPROVED" | "INVALID_STATE";

export class ApprovalError extends Error {
  readonly code: ApprovalErrorCode;
  constructor(code: ApprovalErrorCode, message: string) {
    super(message);
    this.name = "ApprovalError";
    this.code = code;
  }
}

/** Registry statuses under which implementation work may proceed (docs permitting). */
const BUILDABLE_STATUSES: TaskStatus[] = ["active", "pending"];

/**
 * Build gate: throws unless the task is registered with a buildable
 * registry status AND both planning docs are approved. Call before any
 * implementation work.
 */
export function assertBuildReady(
  vaultRoot: string,
  projectId: string,
  taskId: string,
): void {
  const entry = getTask(vaultRoot, projectId, taskId);
  if (!entry) {
    throw new ApprovalError(
      "NOT_APPROVED",
      `Task ${taskId} is not registered. Register it, draft intent.md/plan.md, and get them approved before coding.`,
    );
  }
  if (!BUILDABLE_STATUSES.includes(entry.status)) {
    throw new ApprovalError(
      "NOT_APPROVED",
      `Task ${taskId} is not approved for implementation: registry status is ${entry.status} ` +
        "(needs active or pending). Move it through the transition table first.",
    );
  }
  try {
    assertApproved(vaultRoot, projectId, taskId);
  } catch (error) {
    if (error instanceof PlanningError) {
      throw new ApprovalError("NOT_APPROVED", error.message);
    }
    throw error;
  }
}

/**
 * Park a build-ready task for scope revision. Only `active` and `pending`
 * tasks can enter the scope-change path; anything else is an error (there
 * is no approved scope to change). Doc bodies are never touched — only
 * statuses flip to `draft`, so re-approval is mandatory and the approved
 * plan cannot be silently replaced.
 */
export function requestScopeChange(
  vaultRoot: string,
  projectId: string,
  taskId: string,
  reason: string,
  date: string,
): { registryFrom: TaskStatus; registryTo: TaskStatus } {
  const entry = getTask(vaultRoot, projectId, taskId);
  if (!entry) {
    throw new ApprovalError(
      "INVALID_STATE",
      `Cannot request a scope change for unknown task ${taskId}. Register and approve it first.`,
    );
  }
  if (entry.status !== "active" && entry.status !== "pending") {
    throw new ApprovalError(
      "INVALID_STATE",
      `Cannot request a scope change for task ${taskId}: registry status is ${entry.status}, ` +
        "not active or pending. There is no approved scope to change — revise the draft instead.",
    );
  }
  // Docs must currently be approved, otherwise the task is already parked.
  try {
    assertApproved(vaultRoot, projectId, taskId);
  } catch (error) {
    if (error instanceof PlanningError) {
      throw new ApprovalError(
        "INVALID_STATE",
        `Task ${taskId} is already parked for revision (${error.message}). Re-approve the docs instead of opening another scope change.`,
      );
    }
    throw error;
  }
  const registryTo: TaskStatus = "pending";
  if (entry.status === "active") {
    try {
      setTaskStatus(vaultRoot, projectId, taskId, registryTo, date);
    } catch (error) {
      if (error instanceof TaskRegistryError) {
        throw new ApprovalError("INVALID_STATE", error.message);
      }
      throw error;
    }
  }
  reviseTaskDocs(
    vaultRoot,
    projectId,
    taskId,
    `SCOPE CHANGE requested: ${reason}\n\nSafe code checkpoint of current progress is required before continuing impacted work. Re-approval of both documents is mandatory.`,
    date,
  );
  return { registryFrom: entry.status, registryTo };
}

/**
 * Explicit re-entry after a scope revision: re-approve both docs and move
 * the registry forward (`pending → active`). Only valid for tasks parked by
 * `requestScopeChange`; anything else is an error. Never runs implicitly.
 */
export function resumeAfterRevision(
  vaultRoot: string,
  projectId: string,
  taskId: string,
  date: string,
): { registryFrom: TaskStatus; registryTo: TaskStatus } {
  const entry = getTask(vaultRoot, projectId, taskId);
  if (!entry) {
    throw new ApprovalError(
      "INVALID_STATE",
      `Cannot resume unknown task ${taskId}. Register it first.`,
    );
  }
  if (entry.status !== "pending") {
    throw new ApprovalError(
      "INVALID_STATE",
      `Task ${taskId} is not parked for revision (registry status ${entry.status}). ` +
        "Only pending tasks parked by a scope change can resume here.",
    );
  }
  approveTaskDocs(vaultRoot, projectId, taskId, date);
  try {
    setTaskStatus(vaultRoot, projectId, taskId, "active", date);
  } catch (error) {
    if (error instanceof TaskRegistryError) {
      throw new ApprovalError("INVALID_STATE", error.message);
    }
    throw error;
  }
  return { registryFrom: entry.status, registryTo: "active" };
}
