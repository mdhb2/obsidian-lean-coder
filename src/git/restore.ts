/**
 * Safe restore-to-checkpoint (OLC-052).
 *
 * Restoring NEVER moves the branch backward or deletes history: the selected
 * checkpoint's file contents are applied as a NEW commit on top of HEAD, with
 * a traceable message. Later commits stay reachable by construction.
 *
 * Flow: validate identity → resolve + verify the checkpoint SHA (must be a
 * commit AND an ancestor of HEAD) → read each intended path's bytes at that
 * commit (a path absent there aborts — MVP never deletes/creates files on
 * restore) → inspect the current tree and abort on ANY risk to an intended
 * path (staged, unstaged, or untracked-same-name content would be lost) →
 * write checkpoint bytes → `git add -- <paths>` → re-verify staged bytes
 * (race guard; reset ours on mismatch) → `git commit -m <msg> -- <paths>`
 * (pathspec, so foreign staged changes elsewhere survive) → append the
 * restore record (with BOTH shas) to `tasks/<taskId>/checkpoint.md`.
 *
 * There is no force flag: on any risk the function aborts listing the exact
 * paths, and the caller (build agent) surfaces that list to the user as the
 * confirmation step. Banned here as in checkpoint.ts: `git add .` / `-A`,
 * plain `git commit` without a pathspec, `git add -p`, `git reset --hard`,
 * `git checkout <sha> -- .`, and any form of `git reset` to an older commit.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import type { ResolvedConfig } from "../config/index.js";
import { validateIdentity } from "../core/project-identity.js";
import { assertContextCurrent, type SessionContext } from "../validation/index.js";
import { appendCheckpointRecord } from "./checkpoint.js";
import { GitError, git, gitRaw, inspectTree } from "./inspection.js";

export type RestoreErrorCode =
  | "UNKNOWN_CHECKPOINT"
  | "NOT_ANCESTOR"
  | "PATH_OUTSIDE_REPO"
  | "PATH_NOT_IN_CHECKPOINT"
  | "RESTORE_PATH_PRESTAGED"
  | "UNSTAGED_RISK"
  | "UNTRACKED_RISK"
  | "STAGE_MISMATCH";

export class RestoreError extends Error {
  readonly code: RestoreErrorCode;
  constructor(code: RestoreErrorCode, message: string) {
    super(message);
    this.name = "RestoreError";
    this.code = code;
  }
}

export interface RestoreInput {
  /** Any directory inside the project (identity resolution starts here). */
  projectRoot: string;
  config: ResolvedConfig;
  taskId: string;
  /** Full or abbreviated SHA of the checkpoint commit to restore. */
  checkpointSha: string;
  /** Repo-relative paths to restore (must all exist at the checkpoint). */
  restorePaths: string[];
  /** Why this restore happens (commit message + vault record). */
  reason: string;
  /** Defaults to current time (pass explicit dates in tests). */
  date?: string;
  /**
   * Session context from `startSession`. When present the restore is also
   * revalidated against it (vault unmounted / re-registered / branch
   * switched between operations blocks with zero writes).
   */
  session?: SessionContext;
}

export interface RestoreResult {
  /** "already-matches" when the tree already holds the checkpoint contents (no commit, no record). */
  status: "restored" | "already-matches";
  branch: string;
  /** The verified checkpoint commit that was restored from. */
  restoredFrom: string;
  /** The NEW commit applying the restored contents (absent when already-matches). */
  sha?: string;
  restoredPaths: string[];
  /** Vault record path (absent when already-matches — nothing to cross-reference). */
  recordPath?: string;
}

function normalizeRestorePaths(repoRoot: string, restorePaths: string[]): string[] {
  return restorePaths.map((p) => {
    const abs = resolve(repoRoot, p);
    const rel = relative(repoRoot, abs);
    if (rel === "" || rel === "." || rel.startsWith(`..${sep}`) || rel === "..") {
      throw new RestoreError(
        "PATH_OUTSIDE_REPO",
        `Refused restore path ${JSON.stringify(p)}: it is not inside the repository ${repoRoot}. ` +
          "Restore only touches repo-relative paths.",
      );
    }
    return rel.split(sep).join("/");
  });
}

function isAncestor(repoRoot: string, sha: string): boolean {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new GitError(
    `git merge-base --is-ancestor failed in ${repoRoot} (status ${result.status}). Is git installed and the repository intact?`,
  );
}

export function restoreCheckpoint(input: RestoreInput): RestoreResult {
  const identity = input.session
    ? assertContextCurrent({ projectRoot: input.projectRoot, config: input.config, session: input.session })
    : validateIdentity(input.projectRoot, input.config);
  const { repoRoot, branch, vaultRoot, projectId } = identity;
  const paths = normalizeRestorePaths(repoRoot, input.restorePaths);

  let full: string;
  try {
    full = git(repoRoot, ["rev-parse", "--verify", `${input.checkpointSha}^{commit}`]);
  } catch {
    throw new RestoreError(
      "UNKNOWN_CHECKPOINT",
      `Refusing restore: ${JSON.stringify(input.checkpointSha)} does not resolve to a commit in ${repoRoot}. ` +
        "Run `git log --oneline` to find the checkpoint SHA from its record first.",
    );
  }
  if (!isAncestor(repoRoot, full)) {
    throw new RestoreError(
      "NOT_ANCESTOR",
      `Refusing restore: commit ${full} is not an ancestor of HEAD. ` +
        "OLC only restores checkpoints on the current branch history — later commits must stay reachable. " +
        "Ask the user how to proceed.",
    );
  }

  const wanted = new Map<string, Buffer>();
  for (const rel of paths) {
    try {
      wanted.set(rel, gitRaw(repoRoot, ["show", `${full}:${rel}`]));
    } catch {
      throw new RestoreError(
        "PATH_NOT_IN_CHECKPOINT",
        `Refusing restore: path ${rel} does not exist at checkpoint ${full.slice(0, 12)}. ` +
          "MVP restore never deletes or creates files — remove or create the file manually, checkpoint that, and retry.",
      );
    }
  }

  const tree = inspectTree(repoRoot);
  const prestaged = tree.staged.filter((p) => paths.includes(p));
  if (prestaged.length > 0) {
    throw new RestoreError(
      "RESTORE_PATH_PRESTAGED",
      `Refusing restore: path(s) already staged: ${prestaged.join(", ")}. ` +
        "Unstaging is itself a destructive choice — confirm who staged what before retrying.",
    );
  }
  const atRisk = tree.unstaged.filter((p) => paths.includes(p));
  if (atRisk.length > 0) {
    throw new RestoreError(
      "UNSTAGED_RISK",
      `Refusing restore: uncommitted worktree changes would be lost at: ${atRisk.join(", ")}. ` +
        "Commit or checkpoint them first, or confirm with the user that they may be discarded.",
    );
  }
  const shadowed = tree.untracked.filter((p) => paths.includes(p));
  if (shadowed.length > 0) {
    throw new RestoreError(
      "UNTRACKED_RISK",
      `Refusing restore: untracked file(s) would be overwritten at: ${shadowed.join(", ")}. ` +
        "Move them aside or confirm with the user before retrying.",
    );
  }

  for (const [rel, bytes] of wanted) {
    writeFileSync(resolve(repoRoot, rel), bytes);
  }
  git(repoRoot, ["add", "--", ...paths]);

  const stagedList = git(repoRoot, ["diff", "--cached", "--name-only", "--", ...paths]);
  if (stagedList === "") {
    return { status: "already-matches", branch, restoredFrom: full, restoredPaths: [...paths].sort() };
  }

  for (const [rel, bytes] of wanted) {
    const stagedBytes = gitRaw(repoRoot, ["show", `:${rel}`]);
    if (!stagedBytes.equals(bytes)) {
      git(repoRoot, ["reset", "-q", "--", ...paths]);
      throw new RestoreError(
        "STAGE_MISMATCH",
        `Refusing restore: staged content of ${rel} changed between write and staging (race detected). ` +
          "Our staged copy was reset; ask the user how to proceed.",
      );
    }
  }

  const short = full.slice(0, 12);
  const date = input.date ?? new Date().toISOString();
  const message =
    `olc restore: ${input.taskId} (${[...paths].sort().join(", ")}) to ${short}\n\n${input.reason}`;
  git(repoRoot, ["commit", "-m", message, "--", ...paths]);
  const sha = git(repoRoot, ["rev-parse", "HEAD"]);

  const recordPath = appendCheckpointRecord(vaultRoot, projectId, input.taskId, {
    task_id: input.taskId,
    project_id: projectId,
    commit_sha: sha,
    date,
    summary: `Restore ${[...paths].sort().join(", ")} to checkpoint ${short}: ${input.reason}`,
    verification: `(restore of ${short}; later history preserved)`,
  });

  return {
    status: "restored",
    branch,
    restoredFrom: full,
    sha,
    restoredPaths: [...paths].sort(),
    recordPath,
  };
}
