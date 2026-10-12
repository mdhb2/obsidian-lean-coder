import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ResolvedConfig } from "../src/config/index.js";
import { IdentityError } from "../src/core/project-identity.js";
import { logEvent } from "../src/log/index.js";
import { MemoryError, recallMemory, recordMemory } from "../src/memory/index.js";
import { draftTaskDocs } from "../src/planning/index.js";
import { registerTask } from "../src/tasks/index.js";
import { VaultError, resolveVaultDoc, writeVaultDoc } from "../src/vault/index.js";

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function makeRepo(tag: string, branch = "main"): string {
  const dir = mkdtempSync(join(tmpdir(), tag));
  git(dir, "init", "-q", "-b", branch);
  git(dir, "config", "user.email", "t@t.local");
  git(dir, "config", "user.name", "t");
  writeFileSync(join(dir, "f.txt"), "x\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

function makeVault(): string {
  const dir = mkdtempSync(join(tmpdir(), "olc062-vault-"));
  mkdirSync(join(dir, "OLC"), { recursive: true });
  writeFileSync(join(dir, "OLC", "registry.json"), JSON.stringify({ projects: {} }));
  return dir;
}

function addProject(vault: string, projectId: string, repoRoot: string): void {
  const path = join(vault, "OLC", "registry.json");
  const registry = JSON.parse(readFileSync(path, "utf8")) as {
    projects: Record<string, { repoRoot: string }>;
  };
  registry.projects[projectId] = { repoRoot };
  writeFileSync(path, JSON.stringify(registry));
}

function configFor(vaultRoot: string, projectId: string): ResolvedConfig {
  return { schemaVersion: 1, projectId, vaultPath: vaultRoot };
}

const DATE = "2026-10-12T10:00:00.000Z";
const INTENT = { what: "w", why: "y", nonGoals: "n", openQuestions: "q" };
const PLAN = { approach: "a", steps: "s", acceptanceCriteria: "c", tests: "t", risks: "r" };

function seedProjectA(vault: string, repo: string): ResolvedConfig {
  addProject(vault, "projA", repo);
  const config = configFor(vault, "projA");
  writeVaultDoc(resolveVaultDoc(vault, "projA", "index.md"), "# ProjA index\n\nAuth service owns sessions.\n");
  writeVaultDoc(resolveVaultDoc(vault, "projA", "current-state.md"), "# State\n\nWorking on sessions.\n");
  writeVaultDoc(
    resolveVaultDoc(vault, "projA", "memory", "auth-notes.md"),
    "# Auth notes\n\nSession cookies refresh flow with rotation.\n",
  );
  writeVaultDoc(
    resolveVaultDoc(vault, "projA", "memory", "deploy-notes.md"),
    "# Deploy notes\n\nPipeline ships containers on tags.\n",
  );
  writeVaultDoc(
    resolveVaultDoc(vault, "projA", "decisions", "adr-auth.md"),
    "# ADR auth\n\nChose session cookies over JWT for revocation.\n",
  );
  registerTask(vault, "projA", "T1", "main", DATE);
  draftTaskDocs(vault, "projA", "T1", INTENT, PLAN);
  logEvent({ projectRoot: repo, config, event: { kind: "session", summary: "session cookie work", date: "2026-10-12T10:01:00.000Z" } });
  logEvent({ projectRoot: repo, config, event: { kind: "checkpoint", summary: "deploy pipeline green", date: "2026-10-12T10:02:00.000Z" } });
  return config;
}

function seedProjectB(vault: string, repo: string): ResolvedConfig {
  addProject(vault, "projB", repo);
  const config = configFor(vault, "projB");
  writeVaultDoc(resolveVaultDoc(vault, "projB", "index.md"), "# ProjB index\n\nBilling service owns invoices.\n");
  writeVaultDoc(
    resolveVaultDoc(vault, "projB", "memory", "auth-notes.md"),
    "# Auth notes\n\nProject B uses LDAP bind for staff login.\n",
  );
  return config;
}

test("base context without query reads index and state, scans no docs", () => {
  const vault = makeVault();
  const repoA = makeRepo("olc062-a-repo-");
  const repoB = makeRepo("olc062-b-repo-");
  const configA = seedProjectA(vault, repoA);
  seedProjectB(vault, repoB);

  const result = recallMemory({ projectRoot: repoA, config: configA });
  assert.equal(result.projectId, "projA");
  assert.equal(result.branch, "main");
  assert.match(result.index ?? "", /Auth service owns sessions/);
  assert.match(result.currentState ?? "", /Working on sessions/);
  assert.deepEqual(result.matches, []);
  assert.equal(result.taskDocs, null);
  // Base context still surfaces recent logs unfiltered.
  assert.equal(result.logEvents.length, 2);
});

test("query retrieves only relevant scope docs, best first", () => {
  const vault = makeVault();
  const repoA = makeRepo("olc062-a-repo-");
  seedProjectA(vault, repoA);
  seedProjectB(vault, makeRepo("olc062-b-repo-"));
  const configA = configFor(vault, "projA");

  const result = recallMemory({ projectRoot: repoA, config: configA, query: "session cookies authentication" });
  const files = result.matches.map((m) => `${m.dir}/${m.file}`);
  assert.ok(files.includes("memory/auth-notes.md"), `expected auth-notes, got ${files}`);
  assert.ok(files.includes("decisions/adr-auth.md"), `expected adr-auth, got ${files}`);
  assert.ok(!files.includes("memory/deploy-notes.md"), `deploy-notes must not match: ${files}`);
  assert.ok(result.matches.every((m) => m.dir === "memory" || m.dir === "decisions"));
  for (let i = 1; i < result.matches.length; i++) {
    assert.ok(result.matches[i - 1].score >= result.matches[i].score);
  }
});

test("long doc excerpt is capped and marked truncated", () => {
  const vault = makeVault();
  const repoA = makeRepo("olc062-a-repo-");
  seedProjectA(vault, repoA);
  const configA = configFor(vault, "projA");
  writeVaultDoc(
    resolveVaultDoc(vault, "projA", "memory", "long.md"),
    `# Long\n\n${"session cookie ".repeat(200)}\n`,
  );

  const result = recallMemory({ projectRoot: repoA, config: configA, query: "session cookie" });
  const long = result.matches.find((m) => m.file === "long.md");
  assert.ok(long, "expected long.md in matches");
  assert.equal(long.truncated, true);
  assert.match(long.excerpt, /…\(truncated\)$/);
});

test("task docs included on request; unknown task yields nulls", () => {
  const vault = makeVault();
  const repoA = makeRepo("olc062-a-repo-");
  seedProjectA(vault, repoA);
  const configA = configFor(vault, "projA");

  const withTask = recallMemory({ projectRoot: repoA, config: configA, taskId: "T1" });
  assert.equal(withTask.taskDocs?.taskId, "T1");
  assert.match(withTask.taskDocs?.intent ?? "", /w/);
  assert.match(withTask.taskDocs?.plan ?? "", /a/);

  const unknown = recallMemory({ projectRoot: repoA, config: configA, taskId: "NOPE" });
  assert.equal(unknown.taskDocs?.taskId, "NOPE");
  assert.equal(unknown.taskDocs?.intent, null);
  assert.equal(unknown.taskDocs?.plan, null);
});

test("logs are query-filtered when a query is set", () => {
  const vault = makeVault();
  const repoA = makeRepo("olc062-a-repo-");
  seedProjectA(vault, repoA);
  const configA = configFor(vault, "projA");

  const result = recallMemory({ projectRoot: repoA, config: configA, query: "deploy pipeline" });
  assert.equal(result.logEvents.length, 1);
  assert.match(result.logEvents[0].summary, /deploy pipeline/);

  const none = recallMemory({ projectRoot: repoA, config: configA, query: "xyzzy-nothing-matches-anything" });
  assert.deepEqual(none.logEvents, []);
  assert.deepEqual(none.matches, []);
});

test("isolation: project B recall never surfaces project A content", () => {
  const vault = makeVault();
  const repoA = makeRepo("olc062-a-repo-");
  const repoB = makeRepo("olc062-b-repo-");
  seedProjectA(vault, repoA);
  const configB = seedProjectB(vault, repoB);

  const result = recallMemory({ projectRoot: repoB, config: configB, query: "authentication LDAP" });
  assert.match(result.index ?? "", /Billing service/);
  assert.ok(!JSON.stringify(result).includes("Session cookies refresh flow"));
  const files = result.matches.map((m) => `${m.dir}/${m.file}`);
  assert.ok(files.includes("memory/auth-notes.md"));
  assert.match(result.matches[0].excerpt, /LDAP/);
});

test("record then recall round-trip stays in validated scope", () => {
  const vault = makeVault();
  const repoA = makeRepo("olc062-a-repo-");
  const repoB = makeRepo("olc062-b-repo-");
  seedProjectA(vault, repoA);
  seedProjectB(vault, repoB);
  const configA = configFor(vault, "projA");

  const rel = recordMemory({ projectRoot: repoA, config: configA, name: "retro-1", content: "# Retro\n\nZebra quorum patterns.\n" });
  assert.equal(rel, "memory/retro-1.md");
  assert.ok(existsSync(resolveVaultDoc(vault, "projA", "memory", "retro-1.md")));
  assert.equal(existsSync(resolveVaultDoc(vault, "projB", "memory", "retro-1.md")), false);

  const result = recallMemory({ projectRoot: repoA, config: configA, query: "zebra quorum" });
  assert.ok(result.matches.some((m) => m.file === "retro-1.md"));

  // Existing notes are never silently replaced.
  assert.throws(
    () => recordMemory({ projectRoot: repoA, config: configA, name: "retro-1", content: "other\n" }),
    (e: unknown) => e instanceof VaultError && e.code === "ALREADY_EXISTS",
  );
  const replaced = recordMemory({ projectRoot: repoA, config: configA, name: "retro-1", content: "# Retro\n\nUpdated.\n", overwrite: true });
  assert.equal(replaced, "memory/retro-1.md");
  assert.match(readFileSync(resolveVaultDoc(vault, "projA", "memory", "retro-1.md"), "utf8"), /Updated/);
});

test("invalid name and empty content rejected before any vault touch", () => {
  const vault = makeVault();
  const repoA = makeRepo("olc062-a-repo-");
  seedProjectA(vault, repoA);
  const configA = configFor(vault, "projA");

  assert.throws(
    () => recordMemory({ projectRoot: repoA, config: configA, name: "../escape", content: "x\n" }),
    (e: unknown) => e instanceof MemoryError && e.code === "INVALID_NAME",
  );
  assert.throws(
    () => recordMemory({ projectRoot: repoA, config: configA, name: "empty", content: "   \n" }),
    (e: unknown) => e instanceof MemoryError && e.code === "INVALID_INPUT",
  );
  assert.equal(existsSync(resolveVaultDoc(vault, "projA", "memory", "empty.md")), false);
});

test("wrong project fails identity before any read or write", () => {
  const vault = makeVault();
  const repoA = makeRepo("olc062-a-repo-");
  const repoB = makeRepo("olc062-b-repo-");
  seedProjectA(vault, repoA);
  seedProjectB(vault, repoB);
  // projA is registered to repoA; calling from repoB must fail closed.
  const wrongConfig = configFor(vault, "projA");

  assert.throws(
    () => recallMemory({ projectRoot: repoB, config: wrongConfig, query: "session" }),
    (e: unknown) => e instanceof IdentityError,
  );
  assert.throws(
    () => recordMemory({ projectRoot: repoB, config: wrongConfig, name: "nope", content: "x\n" }),
    (e: unknown) => e instanceof IdentityError,
  );
  assert.equal(existsSync(resolveVaultDoc(vault, "projA", "memory", "nope.md")), false);
});
