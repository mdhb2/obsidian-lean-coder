/**
 * Pre-switch and task-final checkpoint policy (OLC-053).
 *
 * Thin policy over OLC-051 `createCheckpoint`:
 * - `milestone` / `explicit` / `pre-switch`: delegate directly. Unchanged
 *   owned files return `clean` (no commit, no record), so repeated triggers
 *   never stack empty commits.
 * - `task-final`: the final checkpoint of a verified task. Created only when
 *   safe: verification fully passed AND the task registry already shows
 *   `active` (i.e. `completeTaskWithVerification` ran). Anything
 *   else returns `not-ready` / `verify-failed` with zero git mutation.
 *
 * A commit is never treated as task completion: every result carries
 * `needsUserConfirmation`, and the registry status is left untouched
 * (closing the task stays a user-confirmed OLC-033 transition).
 *
 * Checkpoint safety aborts (`CheckpointError`: foreign edit, pre-staged
 * owned paths, paths outside the repo) propagate to the caller unchanged.
 */

import type { ResolvedConfig } from "../config/index.js";
import { getTask } from "../tasks/index.js";
import { formatVerifyReport, type VerifyOutcome } from "../verify/index.js";
import {
  createCheckpoint,
  type CheckpointResult,
} from "./checkpoint.js";

export type CheckpointTrigger =
  | "milestone"
  | "explicit"
  | "pre-switch"
  | "task-final";

export interface CheckpointPolicyInput {
  /** Any directory inside the project (identity resolution starts here). */
  projectRoot: string;
  config: ResolvedConfig;
  taskId: string;
  trigger: CheckpointTrigger;
  /** Repo-relative paths OLC owns for this checkpoint (files must exist). */
  ownedPaths: string[];
  /** Write-time content snapshot per repo-relative owned path. */
  snapshots: Record<string, string>;
  /** Custom summary; defaults to a trigger-specific message. */
  message?: string;
  /**
   * Required for `task-final`: the verification outcome that must have
   * fully passed. Omitted or failing outcome → no checkpoint is created.
   */
  verifyOutcome?: VerifyOutcome;
  /** Defaults to current time (pass explicit dates in tests). */
  date?: string;
}

export type PolicyResult =
  | (Extract<CheckpointResult, { status: "committed" }> & {
      needsUserConfirmation: boolean;
    })
  | (Extract<CheckpointResult, { status: "clean" }> & {
      needsUserConfirmation: boolean;
    })
  | { status: "not-ready"; reason: string }
  | { status: "verify-failed"; report: string; escalated: string[] };

const DEFAULT_SUMMARY: Record<CheckpointTrigger, string> = {
  milestone: "milestone checkpoint",
  explicit: "explicit checkpoint requested",
  "pre-switch": "checkpoint before task switch",
  "task-final": "final checkpoint of verified task",
};

function oneLineVerifySummary(outcome: VerifyOutcome): string {
  const total = outcome.results.length;
  return `verification: all ${total} check(s) passed`;
}

/**
 * Apply the checkpoint policy for one trigger. Returns the checkpoint
 * outcome, or a no-mutation `not-ready` / `verify-failed` refusal.
 * Throws `CheckpointError` / `IdentityError` exactly as `createCheckpoint`.
 */
export function maybeCheckpointPolicy(input: CheckpointPolicyInput): PolicyResult {
  const {
    projectRoot,
    config,
    taskId,
    trigger,
    ownedPaths,
    snapshots,
    message,
    verifyOutcome,
    date,
  } = input;
  const summary = message ?? DEFAULT_SUMMARY[trigger];

  if (trigger === "task-final") {
    if (!verifyOutcome) {
      return {
        status: "not-ready",
        reason:
          "task-final checkpoint needs a verification outcome: pass verifyOutcome from verifyChecks " +
          "after the final checks pass. No checkpoint created.",
      };
    }
    if (!verifyOutcome.ok) {
      return {
        status: "verify-failed",
        report: formatVerifyReport(verifyOutcome),
        escalated: verifyOutcome.escalated,
      };
    }
    const task = getTask(config.vaultPath, config.projectId, taskId);
    if (!task || task.status !== "active") {
      return {
        status: "not-ready",
        reason:
          `task-final checkpoint needs task ${taskId} in "active" status ` +
          `(found: ${task ? `"${task.status}"` : "unregistered"}). ` +
          "Run completeTaskWithVerification first; the task still needs user confirmation to close. " +
          "No checkpoint created.",
      };
    }
    const result = createCheckpoint({
      projectRoot,
      config,
      taskId,
      ownedPaths,
      snapshots,
      summary,
      verification: oneLineVerifySummary(verifyOutcome),
      date,
    });
    return { ...result, needsUserConfirmation: true };
  }

  const result = createCheckpoint({
    projectRoot,
    config,
    taskId,
    ownedPaths,
    snapshots,
    summary,
    date,
  });
  return { ...result, needsUserConfirmation: false };
}
