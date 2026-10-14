/**
 * OLC-040 — bounded `olc-build` task execution frame.
 *
 * The agent does the coding; this module enforces the bounds:
 * 1. `beginTask` — identity (OLC-021, via the loaded OLC-020 config) and the
 *    approval gate (OLC-034) must pass, otherwise implementation is blocked
 *    before it starts. Returns a frame carrying ONLY the approved task's
 *    context (intent/plan bodies), never the whole vault. The caller declares
 *    which repo-relative paths it will touch; a `pending` task is resumed
 *    (moved back to `active`), an `active` task stays put.
 * 2. `completeTask` — identity re-checked, then the working tree is diffed:
 *    any change outside the declared paths throws SCOPE_CHANGED (out-of-scope
 *    work is proposed via the error, not performed). Clean frames stay
 *    `active` and record a history entry (closing the task is a separate,
 *    user-confirmed finalization).
 *
 * Git access here is deliberately minimal (HEAD sha + porcelain status);
 * the full inspection module is OLC-051's job and may consolidate these.
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { assertBuildReady } from "../approval/index.js";
import type { ResolvedConfig } from "../config/index.js";
import { validateIdentity } from "../core/project-identity.js";
import { getTask, resolveTaskDir, setTaskStatus } from "../tasks/index.js";
import { readVaultDoc, writeVaultDoc } from "../vault/index.js";

export type BuildErrorCode =
  | "NOT_READY"
  | "CONTEXT_MISMATCH"
  | "SCOPE_CHANGED"
  | "NO_TASK";

export class BuildError extends Error {
  readonly code: BuildErrorCode;
  readonly details?: string[];
  constructor(code: BuildErrorCode, message: string, details?: string[]) {
    super(message);
    this.name = "BuildError";
    this.code = code;
    this.details = details;
  }
}

export interface BeginTaskInput {
  /** Loaded + vault-resolved project config (OLC-020). */
  config: ResolvedConfig;
  taskId: string;
  /** Repo-relative paths the implementation may touch. Empty = docs-only task. */
  touchPaths?: string[];
  /** Directory inside the project repo (identity is checked from here). */
  startDir?: string;
  /** Override for today (tests); defaults to current UTC date. */
  date?: string;
}

export interface BuildFrame {
  taskId: string;
  intentBody: string;
  planBody: string;
  declaredPaths: string[];
  baseHead: string;
  startedAt: string;
}

function today(input?: string): string {
  return input ?? new Date().toISOString().slice(0, 10);
}

function git(projectRoot: string, ...args: string[]): string {
  try {
    // trimEnd only: porcelain's leading XY column may start with a space
    // (e.g. " M file" for unstaged changes) and .trim() would eat it.
    return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).replace(/\s+$/, "");
  } catch (error) {
    throw new BuildError(
      "CONTEXT_MISMATCH",
      `Build blocked: cannot inspect git state in ${projectRoot} (${(error as Error).message}).`,
    );
  }
}

function normalize(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Repo-relative changed paths (staged + unstaged + untracked) vs current HEAD. */
export function changedPaths(projectRoot: string): string[] {
  const out = git(projectRoot, "status", "--porcelain=v1", "-uall");
  const paths: string[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    let path = line.slice(3).trim();
    const arrow = path.indexOf(" -> ");
    if (arrow >= 0) path = path.slice(arrow + 4);
    if (path.startsWith('"') && path.endsWith('"')) path = JSON.parse(path) as string;
    paths.push(normalize(path));
  }
  return paths;
}

function appendTaskHistory(
  vaultRoot: string,
  projectId: string,
  taskId: string,
  kind: string,
  reason: string,
  date: string,
): void {
  const history = join(resolveTaskDir(vaultRoot, projectId, taskId), "history.md");
  let existing = "";
  try {
    existing = readVaultDoc(history);
  } catch {
    existing = "";
  }
  const entry = `## ${date} — ${kind}\n\n${reason}\n`;
  writeVaultDoc(
    history,
    existing === "" ? `# History — ${taskId}\n\n${entry}` : `${existing}\n${entry}`,
    { overwrite: true },
  );
}

export function beginTask(input: BeginTaskInput): BuildFrame {
  const vaultRoot = input.config.vaultPath;
  const projectId = input.config.projectId;
  const startDir = input.startDir ?? process.cwd();
  // Identity is checked from the caller's directory; the resolved repo root
  // comes from git itself (OLC-021), never from config.
  let repoRoot: string;
  try {
    repoRoot = git(startDir, "rev-parse", "--show-toplevel");
  } catch (error) {
    throw new BuildError(
      "CONTEXT_MISMATCH",
      `Build blocked: cannot determine repository root (${(error as Error).message}).`,
    );
  }
  try {
    validateIdentity(repoRoot, input.config);
  } catch (error) {
    throw new BuildError("CONTEXT_MISMATCH", `Build blocked: ${(error as Error).message}`);
  }
  try {
    assertBuildReady(vaultRoot, projectId, input.taskId);
  } catch (error) {
    throw new BuildError("NOT_READY", `Build blocked: ${(error as Error).message}`);
  }
  const task = getTask(vaultRoot, projectId, input.taskId);
  if (task === null) {
    throw new BuildError("NO_TASK", `Build blocked: task "${input.taskId}" is not registered.`);
  }
  if (task.status === "pending") {
    setTaskStatus(vaultRoot, projectId, input.taskId, "active", today(input.date));
  }
  const taskDir = resolveTaskDir(vaultRoot, projectId, input.taskId);
  return {
    taskId: input.taskId,
    intentBody: readVaultDoc(join(taskDir, "intent.md")),
    planBody: readVaultDoc(join(taskDir, "plan.md")),
    declaredPaths: (input.touchPaths ?? []).map(normalize),
    baseHead: git(repoRoot, "rev-parse", "HEAD"),
    startedAt: new Date().toISOString(),
  };
}

export function completeTask(
  frame: BuildFrame,
  config: ResolvedConfig,
  repoRoot: string,
  date?: string,
): { changed: string[] } {
  try {
    validateIdentity(repoRoot, config);
  } catch (error) {
    throw new BuildError("CONTEXT_MISMATCH", `Completion blocked: ${(error as Error).message}`);
  }
  const declared = new Set(frame.declaredPaths);
  const changed = changedPaths(repoRoot);
  const outOfScope = changed.filter((p) => !declared.has(p));
  if (outOfScope.length > 0) {
    throw new BuildError(
      "SCOPE_CHANGED",
      `Completion blocked: ${outOfScope.length} changed path(s) outside the declared scope: ${outOfScope.join(", ")}. ` +
        "Propose a plan revision instead — out-of-scope work is not completed silently.",
      outOfScope,
    );
  }
  const task = getTask(config.vaultPath, config.projectId, frame.taskId);
  if (task !== null && task.status === "pending") {
    setTaskStatus(config.vaultPath, config.projectId, frame.taskId, "active", today(date));
  }
  appendTaskHistory(
    config.vaultPath,
    config.projectId,
    frame.taskId,
    "build-complete",
    `Build completed within declared scope (${changed.length} path(s)).`,
    today(date),
  );
  return { changed };
}
