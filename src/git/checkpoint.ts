/**
 * Safe Git checkpoint commits (OLC-051, enforces the OLC-050 decision).
 *
 * Flow: validate identity → normalize owned paths → refuse when an owned
 * path is already staged → byte-compare every owned file against the
 * caller-supplied write-time snapshot (any difference = someone else
 * touched it → abort, zero git mutation) → `git add -- <owned paths>` →
 * re-verify staged bytes against the snapshots (race guard; reset ours on
 * mismatch) → `git commit -- <owned paths>` (pathspec, so foreign staged
 * changes on other paths survive untouched) → append the checkpoint record
 * (with commit SHA) to `tasks/<taskId>/checkpoint.md` in the vault.
 *
 * Banned from this flow, always: `git add .` / `git add -A`, plain
 * `git commit` without a pathspec, and `git add -p`.
 *
 * MVP limits: owned paths must currently exist as files (file deletions by
 * OLC are not checkpointable yet); snapshots are UTF-8 strings.
 */

import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import type { ResolvedConfig } from "../config/index.js";
import { validateIdentity } from "../core/project-identity.js";
import {
  parseFrontmatter,
  readVaultDoc,
  renderTemplate,
  resolveVaultDoc,
  writeVaultDoc,
} from "../vault/index.js";
import { git, gitRaw, inspectTree } from "./inspection.js";

export type CheckpointErrorCode =
  | "PATH_OUTSIDE_REPO"
  | "OWNED_PATH_PRESTAGED"
  | "FOREIGN_EDIT"
  | "MISSING_OWNED_FILE";

export class CheckpointError extends Error {
  readonly code: CheckpointErrorCode;
  constructor(code: CheckpointErrorCode, message: string) {
    super(message);
    this.name = "CheckpointError";
    this.code = code;
  }
}

export interface CheckpointInput {
  /** Any directory inside the project (identity resolution starts here). */
  projectRoot: string;
  config: ResolvedConfig;
  taskId: string;
  /** Repo-relative paths OLC owns for this checkpoint (files must exist). */
  ownedPaths: string[];
  /** Write-time content snapshot per repo-relative owned path. */
  snapshots: Record<string, string>;
  summary: string;
  verification?: string;
  /** Defaults to current time (pass explicit dates in tests). */
  date?: string;
}

export type CheckpointResult =
  | { status: "clean"; branch: string; head: string }
  | {
      status: "committed";
      branch: string;
      sha: string;
      committedPaths: string[];
      recordPath: string;
    };

function normalizeOwned(repoRoot: string, ownedPaths: string[]): string[] {
  return ownedPaths.map((p) => {
    const abs = resolve(repoRoot, p);
    const rel = relative(repoRoot, abs);
    if (rel === "" || rel === "." || rel.startsWith(`..${sep}`) || rel === "..") {
      throw new CheckpointError(
        "PATH_OUTSIDE_REPO",
        `Refused checkpoint path ${JSON.stringify(p)}: it is not inside the repository ${repoRoot}. ` +
          "Checkpoint only stages repo-relative owned paths.",
      );
    }
    return rel.split(sep).join("/");
  });
}

export function createCheckpoint(input: CheckpointInput): CheckpointResult {
  const identity = validateIdentity(input.projectRoot, input.config);
  const { repoRoot, branch, vaultRoot, projectId } = identity;
  const owned = normalizeOwned(repoRoot, input.ownedPaths);

  const before = inspectTree(repoRoot);
  const prestaged = before.staged.filter((p) => owned.includes(p));
  if (prestaged.length > 0) {
    throw new CheckpointError(
      "OWNED_PATH_PRESTAGED",
      `Refusing checkpoint: owned path(s) already staged by someone else: ${prestaged.join(", ")}. ` +
        "Unstage them or confirm who staged what before retrying — OLC stages only what it verified itself.",
    );
  }

  for (const rel of owned) {
    const abs = resolve(repoRoot, rel);
    const expected = input.snapshots[rel];
    let actual: string;
    try {
      actual = readFileSync(abs, "utf8");
    } catch {
      throw new CheckpointError(
        "MISSING_OWNED_FILE",
        `Refusing checkpoint: owned file ${rel} cannot be read (deleted or moved since OLC wrote it?). ` +
          "Confirm the current tree state before retrying.",
      );
    }
    if (expected === undefined || actual !== expected) {
      throw new CheckpointError(
        "FOREIGN_EDIT",
        `Refusing checkpoint: owned file ${rel} no longer matches what OLC wrote ` +
          "(edited by someone/something else, or no snapshot was recorded). " +
          "Ask the user how to proceed — OLC never commits mixed ownership.",
      );
    }
  }

  const pending = git(repoRoot, ["status", "--porcelain=v1", "-uall", "--", ...owned]);
  if (pending === "") {
    return { status: "clean", branch, head: before.head };
  }

  git(repoRoot, ["add", "--", ...owned]);

  const cached = git(repoRoot, ["diff", "--cached", "--name-only", "--", ...owned]);
  const cachedSet = new Set(cached === "" ? [] : cached.split("\n"));
  for (const rel of owned) {
    if (!cachedSet.has(rel)) continue;
    const stagedBytes = gitRaw(repoRoot, ["show", `:${rel}`]).toString("utf8");
    if (stagedBytes !== input.snapshots[rel]) {
      git(repoRoot, ["reset", "-q", "--", ...owned]);
      throw new CheckpointError(
        "FOREIGN_EDIT",
        `Refusing checkpoint: staged content of ${rel} changed between verification and staging (race detected). ` +
          "Our staged copy was reset; worktree untouched. Ask the user how to proceed.",
      );
    }
  }
  const committedPaths = [...cachedSet].filter((p) => owned.includes(p)).sort();

  const date = input.date ?? new Date().toISOString();
  const message = `olc checkpoint: ${input.taskId}\n\n${input.summary}`;
  git(repoRoot, ["commit", "-m", message, "--", ...owned]);
  const sha = git(repoRoot, ["rev-parse", "HEAD"]);

  const entry = renderTemplate("checkpoint", {
    task_id: input.taskId,
    project_id: projectId,
    commit_sha: sha,
    date,
    summary: input.summary,
    verification: input.verification ?? "(no verification recorded)",
  });
  const recordPath = resolveVaultDoc(vaultRoot, projectId, "tasks", input.taskId, "checkpoint.md");
  let record: string;
  try {
    const existing = readVaultDoc(recordPath);
    record = `${existing.replace(/\s+$/, "")}\n\n---\n\n${parseFrontmatter(entry).body}`;
  } catch {
    record = entry;
  }
  writeVaultDoc(recordPath, record, { overwrite: true });

  return { status: "committed", branch, sha, committedPaths, recordPath };
}
