import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ResolvedConfig } from "../src/config/index.js";
import { maybeCheckpointPolicy } from "../src/git/policy.js";
import { registerTask, setTaskStatus } from "../src/tasks/index.js";
import { verifyChecks, type VerifyOutcome } from "../src/verify/index.js";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).replace(/\s+$/, "");
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "olc053-repo-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@local");
  git(dir, "config", "user.name", "test");
  writeFileSync(join(dir, "app.txt"), "v1\n");
  writeFileSync(join(dir, "user.txt"), "user base\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

function makeVault(projectId: string, repoRoot: string): string {
  const dir = mkdtempSync(join(tmpdir(), "olc053-vault-"));
  mkdirSync(join(dir, "OLC"), { recursive: true });
  writeFileSync(
    join(dir, "OLC", "registry.json"),
    JSON.stringify({ projects: { [projectId]: { repoRoot } } }),
  );
  return dir;
}

const DATE = "2026-10-12T00:00:00.000Z";

function setup(status: "in_progress" | "review" | "done" = "in_progress"): {
  repo: string;
  vault: string;
  config: ResolvedConfig;
} {
  const repo = makeRepo();
  const vault = makeVault("proj", repo);
  registerTask(vault, "proj", "T-1", "main", DATE);
  setTaskStatus(vault, "proj", "T-1", "approved", DATE);
  setTaskStatus(vault, "proj", "T-1", "in_progress", DATE);
  if (status === "review" || status === "done") {
    setTaskStatus(vault, "proj", "T-1", "review", DATE);
  }
  if (status === "done") {
    setTaskStatus(vault, "proj", "T-1", "done", DATE);
  }
  const config: ResolvedConfig = { schemaVersion: 1, projectId: "proj", vaultPath: vault };
  return { repo, vault, config };
}

function commitCount(repo: string): string {
  return git(repo, "rev-list", "--count", "HEAD");
}

function failingOutcome(): VerifyOutcome {
  return {
    ok: false,
    results: [
      {
        name: "typecheck",
        command: ["node", "-e", "process.exit(1)"],
        ok: false,
        attempts: [
          { attempt: 1, exitCode: 1, stdout: "", stderr: "boom", timedOut: false, durationMs: 1, ok: false },
        ],
      },
    ],
    escalated: ["typecheck"],
  };
}

test("milestone with changes commits; repeated trigger on unchanged tree is clean", () => {
  const { repo, config } = setup();
  writeFileSync(join(repo, "app.txt"), "v1\nWORK\n");
  const first = maybeCheckpointPolicy({
    projectRoot: repo,
    config,
    taskId: "T-1",
    trigger: "milestone",
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": "v1\nWORK\n" },
    date: DATE,
  });
  assert.equal(first.status, "committed");
  if (first.status !== "committed") return;
  assert.equal(first.needsUserConfirmation, false);
  const count = commitCount(repo);

  const second = maybeCheckpointPolicy({
    projectRoot: repo,
    config,
    taskId: "T-1",
    trigger: "milestone",
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": "v1\nWORK\n" },
    date: DATE,
  });
  assert.equal(second.status, "clean");
  assert.equal(commitCount(repo), count);
});

test("explicit and pre-switch triggers commit with the given message", () => {
  const { repo, config } = setup();
  writeFileSync(join(repo, "app.txt"), "v1\nWORK\n");
  const result = maybeCheckpointPolicy({
    projectRoot: repo,
    config,
    taskId: "T-1",
    trigger: "pre-switch",
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": "v1\nWORK\n" },
    message: "pre-switch checkpoint before T-2",
    date: DATE,
  });
  assert.equal(result.status, "committed");
  if (result.status !== "committed") return;
  assert.equal(result.needsUserConfirmation, false);
  assert.ok(readFileSync(result.recordPath, "utf8").includes("before T-2"));
});

test("unchanged tree creates no commit and no record", () => {
  const { repo, vault, config } = setup();
  const result = maybeCheckpointPolicy({
    projectRoot: repo,
    config,
    taskId: "T-1",
    trigger: "explicit",
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": "v1\n" },
    date: DATE,
  });
  assert.equal(result.status, "clean");
  assert.equal(commitCount(repo), "1");
  assert.equal(existsSync(join(vault, "OLC", "Projects", "proj", "tasks", "T-1", "checkpoint.md")), false);
});

test("task-final without a verification outcome is not-ready with zero mutation", () => {
  const { repo, config } = setup("review");
  writeFileSync(join(repo, "app.txt"), "v1\nWORK\n");
  const result = maybeCheckpointPolicy({
    projectRoot: repo,
    config,
    taskId: "T-1",
    trigger: "task-final",
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": "v1\nWORK\n" },
    date: DATE,
  });
  assert.equal(result.status, "not-ready");
  assert.equal(commitCount(repo), "1");
});

test("task-final with failing verification returns verify-failed, registry untouched", () => {
  const { repo, vault, config } = setup("in_progress");
  writeFileSync(join(repo, "app.txt"), "v1\nWORK\n");
  const result = maybeCheckpointPolicy({
    projectRoot: repo,
    config,
    taskId: "T-1",
    trigger: "task-final",
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": "v1\nWORK\n" },
    verifyOutcome: failingOutcome(),
    date: DATE,
  });
  assert.equal(result.status, "verify-failed");
  if (result.status !== "verify-failed") return;
  assert.deepEqual(result.escalated, ["typecheck"]);
  assert.match(result.report, /typecheck/);
  assert.equal(commitCount(repo), "1");
  const registry = JSON.parse(
    readFileSync(join(vault, "OLC", "Projects", "proj", "tasks", "registry.json"), "utf8"),
  );
  assert.equal(registry.tasks["T-1"].status, "in_progress");
});

test("task-final with passing checks but task not in review is not-ready", () => {
  const { repo, config } = setup("in_progress");
  writeFileSync(join(repo, "app.txt"), "v1\nWORK\n");
  const outcome = verifyChecks(
    [{ name: "ok", command: ["node", "-e", "process.exit(0)"] }],
    repo,
  );
  assert.equal(outcome.ok, true);
  const result = maybeCheckpointPolicy({
    projectRoot: repo,
    config,
    taskId: "T-1",
    trigger: "task-final",
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": "v1\nWORK\n" },
    verifyOutcome: outcome,
    date: DATE,
  });
  assert.equal(result.status, "not-ready");
  if (result.status !== "not-ready") return;
  assert.match(result.reason, /review/);
  assert.equal(commitCount(repo), "1");
});

test("task-final full flow commits, flags user confirmation, leaves registry in review", () => {
  const { repo, vault, config } = setup("review");
  writeFileSync(join(repo, "app.txt"), "v1\nWORK\n");
  const outcome = verifyChecks(
    [{ name: "checks", command: ["node", "-e", "process.exit(0)"] }],
    repo,
  );
  const result = maybeCheckpointPolicy({
    projectRoot: repo,
    config,
    taskId: "T-1",
    trigger: "task-final",
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": "v1\nWORK\n" },
    verifyOutcome: outcome,
    date: DATE,
  });
  assert.equal(result.status, "committed");
  if (result.status !== "committed") return;
  assert.equal(result.needsUserConfirmation, true);
  assert.ok(readFileSync(result.recordPath, "utf8").includes("all 1 check(s) passed"));
  const registry = JSON.parse(
    readFileSync(join(vault, "OLC", "Projects", "proj", "tasks", "registry.json"), "utf8"),
  );
  assert.equal(registry.tasks["T-1"].status, "review");
});

test("task-final on an already closed task is not-ready", () => {
  const { repo, config } = setup("done");
  writeFileSync(join(repo, "app.txt"), "v1\nWORK\n");
  const outcome = verifyChecks(
    [{ name: "checks", command: ["node", "-e", "process.exit(0)"] }],
    repo,
  );
  const result = maybeCheckpointPolicy({
    projectRoot: repo,
    config,
    taskId: "T-1",
    trigger: "task-final",
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": "v1\nWORK\n" },
    verifyOutcome: outcome,
    date: DATE,
  });
  assert.equal(result.status, "not-ready");
  assert.equal(commitCount(repo), "1");
});
