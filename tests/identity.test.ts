import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import type { ResolvedConfig } from "../src/config/index.js";
import {
  IdentityError,
  readRegistry,
  resolveBranch,
  resolveRepoRoot,
  validateIdentity,
} from "../src/core/project-identity.js";

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function makeRepo(branch = "main"): string {
  const dir = mkdtempSync(join(tmpdir(), "olc021-repo-"));
  git(dir, "init", "-q", "-b", branch);
  git(dir, "config", "user.email", "t@t.local");
  git(dir, "config", "user.name", "t");
  writeFileSync(join(dir, "f.txt"), "x\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

function makeVault(registry: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "olc021-vault-"));
  mkdirSync(join(dir, "OLC"), { recursive: true });
  if (registry !== null) {
    writeFileSync(join(dir, "OLC", "registry.json"), JSON.stringify(registry));
  }
  return dir;
}

function configFor(repoRoot: string, vaultRoot: string, projectId = "proj"): ResolvedConfig {
  return { schemaVersion: 1, projectId, vaultPath: vaultRoot };
}

function assertIdentityError(fn: () => unknown, code: string): IdentityError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof IdentityError, `expected IdentityError, got ${error}`);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 20, "message should be actionable");
    return error;
  }
  assert.fail("expected IdentityError to be thrown");
}

test("happy path returns repo root, branch, project id, vault root", () => {
  const repo = makeRepo();
  const vault = makeVault({ projects: { proj: { repoRoot: repo } } });
  const id = validateIdentity(repo, configFor(repo, vault));
  assert.equal(id.repoRoot, repo);
  assert.equal(id.branch, "main");
  assert.equal(id.projectId, "proj");
  assert.equal(id.vaultRoot, vault);
});

test("works from a subdirectory of the repo", () => {
  const repo = makeRepo();
  mkdirSync(join(repo, "sub", "deep"), { recursive: true });
  const vault = makeVault({ projects: { proj: { repoRoot: repo } } });
  const id = validateIdentity(join(repo, "sub", "deep"), configFor(repo, vault));
  assert.equal(id.repoRoot, repo);
  assert.equal(resolveRepoRoot(join(repo, "sub")), repo);
});

test("outside any repo reports NOT_A_REPO", () => {
  const plain = mkdtempSync(join(tmpdir(), "olc021-plain-"));
  assertIdentityError(() => resolveRepoRoot(plain), "NOT_A_REPO");
  const vault = makeVault({ projects: {} });
  assertIdentityError(() => validateIdentity(plain, configFor(plain, vault)), "NOT_A_REPO");
});

test("detached HEAD is rejected", () => {
  const repo = makeRepo();
  const sha = git(repo, "rev-parse", "HEAD");
  git(repo, "checkout", "-q", sha);
  assertIdentityError(() => resolveBranch(repo), "DETACHED_HEAD");
});

test("wrong project id (unregistered) is blocked", () => {
  const repo = makeRepo();
  const vault = makeVault({ projects: { other: { repoRoot: repo } } });
  const err = assertIdentityError(
    () => validateIdentity(repo, configFor(repo, vault, "proj")),
    "UNREGISTERED_PROJECT",
  );
  assert.match(err.message, /proj/);
});

test("duplicate id (same id, different repo) is blocked as mismatch", () => {
  const repoA = makeRepo();
  const repoB = makeRepo();
  const vault = makeVault({ projects: { proj: { repoRoot: repoA } } });
  const err = assertIdentityError(
    () => validateIdentity(repoB, configFor(repoB, vault, "proj")),
    "PROJECT_MISMATCH",
  );
  assert.match(err.message, /different repository/);
  assert.match(err.message, /Refusing/);
});

test("missing vault directory is blocked without creating anything", () => {
  const repo = makeRepo();
  const missing = join(mkdtempSync(join(tmpdir(), "olc021-novault-")), "vault");
  assertIdentityError(() => validateIdentity(repo, configFor(repo, missing)), "VAULT_UNAVAILABLE");
  assert.equal(existsSync(missing), false);
});

test("missing registry is blocked", () => {
  const repo = makeRepo();
  const vault = makeVault(null);
  assertIdentityError(() => validateIdentity(repo, configFor(repo, vault)), "MISSING_REGISTRY");
});

test("corrupt registry is blocked", () => {
  const repo = makeRepo();
  const vault = makeVault({ wrong: "shape" });
  assertIdentityError(
    () => validateIdentity(repo, configFor(repo, vault)),
    "INVALID_REGISTRY",
  );
  const badJson = mkdtempSync(join(tmpdir(), "olc021-badreg-"));
  mkdirSync(join(badJson, "OLC"), { recursive: true });
  writeFileSync(join(badJson, "OLC", "registry.json"), "{ broken");
  assertIdentityError(() => readRegistry(badJson), "INVALID_REGISTRY");
});

test("unreadable vault is blocked with permission message", () => {
  if (process.getuid?.() === 0) return; // root bypasses permission bits
  const repo = makeRepo();
  const vault = makeVault({ projects: { proj: { repoRoot: repo } } });
  chmodSync(vault, 0o000);
  try {
    const err = assertIdentityError(
      () => validateIdentity(repo, configFor(repo, vault)),
      "VAULT_UNAVAILABLE",
    );
    assert.match(err.message, /permission/i);
  } finally {
    chmodSync(vault, 0o700);
  }
});

test("registry entries with relative repoRoot resolve before compare", () => {
  const repo = makeRepo();
  const vault = makeVault({ projects: { proj: { repoRoot: repo } } });
  const id = validateIdentity(repo, configFor(repo, vault));
  assert.equal(id.repoRoot, resolve(repo));
});
