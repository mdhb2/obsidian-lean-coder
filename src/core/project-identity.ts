/**
 * Project and vault identity checks (OLC-021, PRD §7.5 items 1–5 subset).
 *
 * Before any OLC-dependent operation, `validateIdentity` proves:
 * 1. The working directory is inside a git repository (`resolveRepoRoot`).
 * 2. The repository has an active branch (`resolveBranch`).
 * 3. The vault root exists and is accessible (no fallback storage is created).
 * 4. The vault registry (`OLC/registry.json`) exists, parses, and contains
 *    this config's `projectId` mapped to THIS repository root.
 *
 * Any failure throws `IdentityError` with an actionable message. The caller
 * must block the operation — never work around a failed check.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import type { ResolvedConfig } from "../config/index.js";

/** Vault registry location, relative to the vault root. */
export const REGISTRY_REL_PATH = "OLC/registry.json";

export type IdentityErrorCode =
  | "NOT_A_REPO"
  | "GIT_FAILED"
  | "DETACHED_HEAD"
  | "VAULT_UNAVAILABLE"
  | "MISSING_REGISTRY"
  | "INVALID_REGISTRY"
  | "UNREGISTERED_PROJECT"
  | "PROJECT_MISMATCH";

export class IdentityError extends Error {
  readonly code: IdentityErrorCode;
  constructor(code: IdentityErrorCode, message: string) {
    super(message);
    this.name = "IdentityError";
    this.code = code;
  }
}

export interface ProjectIdentity {
  repoRoot: string;
  branch: string;
  projectId: string;
  vaultRoot: string;
}

/**
 * Walk up from `startDir` to find the repository root (directory holding
 * `.git`, which may be a dir or a worktree pointer file). Throws NOT_A_REPO.
 */
export function resolveRepoRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(resolve(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new IdentityError(
        "NOT_A_REPO",
        `Not a git repository: no .git found from ${resolve(startDir)} up to the filesystem root. ` +
          "Run OLC inside a git repository (checkpoints and identity need one).",
      );
    }
    dir = parent;
  }
}

/** Run a git command, converting any failure into an IdentityError. */
function git(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const detail = (error as { stderr?: unknown }).stderr ?? (error as Error).message;
    throw new IdentityError(
      "GIT_FAILED",
      `git ${args.join(" ")} failed in ${cwd}: ${String(detail).trim()}. Is git installed and the repository intact?`,
    );
  }
}

/**
 * Current branch of the repository. Throws DETACHED_HEAD when HEAD is
 * detached (identity needs an explicit branch) and GIT_FAILED when the
 * branch cannot be determined (e.g. unborn HEAD with no commits yet).
 */
export function resolveBranch(repoRoot: string): string {
  const name = git(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  if (name === "HEAD") {
    const sha = git(["rev-parse", "HEAD"], repoRoot);
    throw new IdentityError(
      "DETACHED_HEAD",
      `Repository at ${repoRoot} has a detached HEAD (${sha}). ` +
        "Check out a branch before running OLC so checkpoints land somewhere traceable.",
    );
  }
  return name;
}

/** Registry shape: project_id -> repository root that owns it. */
export interface VaultRegistry {
  projects: Record<string, { repoRoot: string }>;
}

function isRegistry(value: unknown): value is VaultRegistry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const projects = (value as Record<string, unknown>).projects;
  if (typeof projects !== "object" || projects === null || Array.isArray(projects)) return false;
  return Object.values(projects as Record<string, unknown>).every(
    (entry) =>
      typeof entry === "object" && entry !== null && typeof (entry as Record<string, unknown>).repoRoot === "string",
  );
}

/** Throw VAULT_UNAVAILABLE unless `vaultRoot` exists and is a readable directory. */
export function assertVaultAccessible(vaultRoot: string): void {
  try {
    readdirSync(vaultRoot);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    const reason =
      err.code === "ENOENT"
        ? "it does not exist"
        : err.code === "EACCES" || err.code === "EPERM"
          ? "permission denied"
          : (err.message ?? "it is not accessible");
    throw new IdentityError(
      "VAULT_UNAVAILABLE",
      `Vault at ${vaultRoot} is unavailable (${reason}). ` +
        "Check the path (OLC_VAULT_PATH or vaultPath) and permissions. OLC never creates fallback storage.",
    );
  }
}

/** Read and validate the vault registry. Throws MISSING_REGISTRY / INVALID_REGISTRY. */
export function readRegistry(vaultRoot: string): VaultRegistry {
  const path = resolve(vaultRoot, REGISTRY_REL_PATH);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new IdentityError(
        "MISSING_REGISTRY",
        `No vault registry at ${path}. Run init to register this project in the vault.`,
      );
    }
    throw new IdentityError(
      "VAULT_UNAVAILABLE",
      `Cannot read vault registry at ${path}: ${(error as Error).message}. Check permissions.`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new IdentityError(
      "INVALID_REGISTRY",
      `Vault registry at ${path} is not valid JSON (${(error as Error).message}). Fix it or re-run init.`,
    );
  }
  if (!isRegistry(json)) {
    throw new IdentityError(
      "INVALID_REGISTRY",
      `Vault registry at ${path} has the wrong shape. Expected {"projects": {"<project_id>": {"repoRoot": "<abs path>"}}}. Fix it or re-run init.`,
    );
  }
  return json;
}

/**
 * Full identity gate. `startDir` is any directory inside the project
 * (usually cwd); `config` is the loaded + vault-resolved OLC config.
 */
export function validateIdentity(startDir: string, config: ResolvedConfig): ProjectIdentity {
  const repoRoot = resolveRepoRoot(startDir);
  const branch = resolveBranch(repoRoot);
  const vaultRoot = config.vaultPath;
  if (!isAbsolute(vaultRoot)) {
    throw new IdentityError(
      "VAULT_UNAVAILABLE",
      `Resolved vault path ${JSON.stringify(vaultRoot)} is not absolute. This is an OLC bug — report it.`,
    );
  }
  assertVaultAccessible(vaultRoot);
  const registry = readRegistry(vaultRoot);
  const entry = registry.projects[config.projectId];
  if (!entry) {
    throw new IdentityError(
      "UNREGISTERED_PROJECT",
      `project_id "${config.projectId}" is not registered in vault ${vaultRoot}. ` +
        "Run init to register it before using project memory, plans, or checkpoints.",
    );
  }
  if (resolve(entry.repoRoot) !== repoRoot) {
    throw new IdentityError(
      "PROJECT_MISMATCH",
      `project_id "${config.projectId}" is registered to a different repository ` +
        `(${resolve(entry.repoRoot)}) than the one you are in (${repoRoot}). ` +
        "Refusing to touch the wrong project's memory. Use init with a new project_id for this checkout, or move to the registered repository.",
    );
  }
  return { repoRoot, branch, projectId: config.projectId, vaultRoot };
}
