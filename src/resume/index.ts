/**
 * Resume context (OLC-061): rebuild enough context after an interruption.
 *
 * Read-only. Never resumes coding, switches branches, or closes tasks —
 * every result carries `needsConfirmation: true`, and ambiguous situations
 * set `blocked` with an actionable message instead of guessing.
 *
 * Contents: actual Git state (branch/HEAD/staged/unstaged/untracked),
 * `current-state.md`, open registry tasks (newest first), the recommended
 * task (via OLC-033 `recommendResume`), that task's intent/plan doc
 * statuses, the most recent log events (last verification visible there),
 * and the most recent checkpoint event. Identity is validated first, so an
 * unavailable vault or mismatched project fails before anything is read.
 * A detached HEAD does not nuke the context: branch is reported as null
 * (vault-side checks still apply) and the result is marked blocked.
 */

import { resolve } from "node:path";
import type { ResolvedConfig } from "../config/index.js";
import {
  IdentityError,
  assertVaultAccessible,
  readRegistry as readVaultRegistry,
  resolveRepoRoot,
  validateIdentity,
} from "../core/project-identity.js";
import { git, parsePorcelain } from "../git/inspection.js";
import { readLastEvents, type LoggedEvent } from "../log/index.js";
import { getDocStatuses } from "../planning/index.js";
import {
  TERMINAL_STATUSES,
  readRegistry,
  recommendResume,
  type TaskEntry,
} from "../tasks/index.js";
import { readVaultDoc, resolveVaultDoc } from "../vault/index.js";

export interface ResumeTask {
  taskId: string;
  entry: TaskEntry;
}

export interface ResumeCheckpoint {
  taskId?: string;
  gitSha: string;
  date: string;
  summary: string;
}

export interface ResumeContext {
  branch: string | null;
  head: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  currentState: string | null;
  /** Non-terminal registry tasks, newest `updatedAt` first. */
  openTasks: ResumeTask[];
  recommendedTaskId: string | null;
  recommendationNote: string;
  /** Intent/plan doc statuses for the recommended task, null when none. */
  taskDocs: { intent: string; plan: string } | null;
  /** Newest-first log events (surfaces the last verification). */
  lastEvents: LoggedEvent[];
  lastCheckpoint: ResumeCheckpoint | null;
  /** Always true: resuming requires explicit user confirmation. */
  needsConfirmation: true;
  /** Non-null when ambiguity blocks even a recommendation. */
  blocked: string | null;
}

export interface ResumeArgs {
  projectRoot: string;
  config: ResolvedConfig;
  /** How many recent log events to include. Default 5. */
  lastEventsLimit?: number;
}

function readCurrentState(vaultRoot: string, projectId: string): string | null {
  try {
    return readVaultDoc(resolveVaultDoc(vaultRoot, projectId, "current-state.md"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function buildResumeContext(args: ResumeArgs): ResumeContext {
  const limit = args.lastEventsLimit ?? 5;
  let branch: string | null;
  let repoRoot: string;
  let vaultRoot: string;
  let projectId: string;
  try {
    const identity = validateIdentity(args.projectRoot, args.config);
    repoRoot = identity.repoRoot;
    branch = identity.branch;
    vaultRoot = identity.vaultRoot;
    projectId = identity.projectId;
  } catch (error) {
    if (error instanceof IdentityError && error.code === "DETACHED_HEAD") {
      // Unknown branch must not hide everything else: the vault-side
      // checks still apply, branch is reported as null, and the result
      // is marked blocked below.
      repoRoot = resolveRepoRoot(args.projectRoot);
      vaultRoot = args.config.vaultPath;
      projectId = args.config.projectId;
      assertVaultAccessible(vaultRoot);
      const entry = readVaultRegistry(vaultRoot).projects[projectId];
      if (!entry || resolve(entry.repoRoot) !== repoRoot) {
        throw new IdentityError(
          "PROJECT_MISMATCH",
          `project_id "${projectId}" is not registered to repository ${repoRoot} in vault ${vaultRoot}. ` +
            "Refusing to touch the wrong project's data.",
        );
      }
      branch = null;
    } else {
      throw error;
    }
  }
  const head = git(repoRoot, ["rev-parse", "HEAD"]);
  const sets = parsePorcelain(git(repoRoot, ["status", "--porcelain=v1", "-uall"]));
  const registry = readRegistry(vaultRoot, projectId);
  const openTasks: ResumeTask[] = Object.entries(registry.tasks)
    .filter(([, e]) => !TERMINAL_STATUSES.includes(e.status))
    .sort((a, b) => (a[1].updatedAt < b[1].updatedAt ? 1 : -1))
    .map(([taskId, entry]) => ({ taskId, entry }));
  const recommendation = recommendResume(vaultRoot, projectId, branch);
  const lastEvents = readLastEvents(vaultRoot, projectId, limit);
  const checkpointEvent = lastEvents.find((e) => e.kind === "checkpoint" && e.gitSha);
  const lastCheckpoint: ResumeCheckpoint | null = checkpointEvent?.gitSha
    ? {
        taskId: checkpointEvent.taskId,
        gitSha: checkpointEvent.gitSha,
        date: checkpointEvent.date,
        summary: checkpointEvent.summary,
      }
    : null;
  let blocked: string | null = null;
  if (branch === null) {
    blocked =
      "Current branch is unknown (detached HEAD). Tell me which branch and task to resume, and confirm — nothing was switched or closed.";
  } else if (recommendation.taskId === null && openTasks.length > 0) {
    blocked =
      `${openTasks.length} open task(s) exist but none is attached to branch ${branch}. ` +
      "Tell me which task to resume, and confirm — nothing was switched or closed.";
  } else {
    const onBranch = openTasks.filter((t) => t.entry.branch === branch);
    if (onBranch.length > 1 && onBranch[0].entry.updatedAt === onBranch[1].entry.updatedAt) {
      blocked =
        `Tasks ${onBranch[0].taskId} and ${onBranch[1].taskId} are equally recent on branch ${branch}. ` +
        "Tell me which one to resume, and confirm — nothing was switched or closed.";
    }
  }
  return {
    branch,
    head,
    staged: sets.staged,
    unstaged: sets.unstaged,
    untracked: sets.untracked,
    currentState: readCurrentState(vaultRoot, projectId),
    openTasks,
    recommendedTaskId: recommendation.taskId,
    recommendationNote: recommendation.note,
    taskDocs:
      recommendation.taskId === null
        ? null
        : getDocStatuses(vaultRoot, projectId, recommendation.taskId),
    lastEvents,
    lastCheckpoint,
    needsConfirmation: true,
    blocked,
  };
}
