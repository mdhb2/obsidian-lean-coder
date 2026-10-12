/**
 * Git tree inspection for OLC checkpoints (OLC-051).
 *
 * Read-only helpers: parse `git status --porcelain` without touching the
 * index or worktree. The mutating checkpoint flow lives in `checkpoint.ts`
 * and must follow the OLC-050 decision (explicit paths only, abort on
 * ambiguity — never `git add .`, plain `git commit`, or `git add -p`).
 */

import { execFileSync } from "node:child_process";

import { resolveBranch } from "../core/project-identity.js";

export class GitError extends Error {
  readonly code: "GIT_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "GitError";
    this.code = "GIT_FAILED";
  }
}

/** Run git and return stdout (trailing whitespace only trimmed). */
export function git(repoRoot: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).replace(/\s+$/, "");
  } catch (error) {
    const detail = (error as { stderr?: unknown }).stderr ?? (error as Error).message;
    throw new GitError(
      `git ${args.join(" ")} failed in ${repoRoot}: ${String(detail).trim()}. Is git installed and the repository intact?`,
    );
  }
}

/** Run git and return raw stdout bytes (for byte-exact content comparison). */
export function gitRaw(repoRoot: string, args: string[]): Buffer {
  try {
    return execFileSync("git", args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const detail = (error as { stderr?: unknown }).stderr ?? (error as Error).message;
    throw new GitError(
      `git ${args.join(" ")} failed in ${repoRoot}: ${String(detail).trim()}. Is git installed and the repository intact?`,
    );
  }
}

export interface PorcelainSets {
  /** Paths with staged (index) changes. */
  staged: string[];
  /** Paths with unstaged (worktree) changes. */
  unstaged: string[];
  /** Untracked paths. */
  untracked: string[];
}

/**
 * Parse `git status --porcelain=v1` output (pure, no I/O).
 * Rename entries (`R  old -> new`) resolve to the new path.
 */
export function parsePorcelain(output: string): PorcelainSets {
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];
  for (const rawLine of output.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (line === "") continue;
    const x = line[0];
    const y = line[1];
    let path = line.slice(3);
    const arrow = path.indexOf(" -> ");
    if (arrow !== -1) path = path.slice(arrow + 4);
    if (x === "?" && y === "?") {
      untracked.push(path);
      continue;
    }
    if (x !== " " && x !== "?" && x !== "!") staged.push(path);
    if (y !== " " && y !== "?" && y !== "!") unstaged.push(path);
  }
  return { staged, unstaged, untracked };
}

export interface TreeState extends PorcelainSets {
  branch: string;
  head: string;
}

/** Read-only snapshot of branch, HEAD, and porcelain status. */
export function inspectTree(repoRoot: string): TreeState {
  const branch = resolveBranch(repoRoot);
  const head = git(repoRoot, ["rev-parse", "HEAD"]);
  const { staged, unstaged, untracked } = parsePorcelain(
    git(repoRoot, ["status", "--porcelain=v1", "-uall"]),
  );
  return { branch, head, staged, unstaged, untracked };
}
