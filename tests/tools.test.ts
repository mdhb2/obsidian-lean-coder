import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { registerOlcTools } from "../src/tools.js";
import type { ResolvedConfig } from "../src/config/index.js";

/**
 * Minimal in-memory fake of the OpenCode tool editor + plugin context, enough
 * to register and exercise the OLC tool `execute` handlers.
 */
function makeCtx(repo: string) {
  const tools = new Map<string, { execute: (raw: unknown) => Promise<{ content: string }> }>();
  const editor = {
    namespace: (_n: unknown) => {},
    add: (tool: { name: string; execute: (raw: unknown) => Promise<{ content: string }> }) => {
      tools.set(tool.name, tool);
    },
  };
  const ctx = {
    location: { directory: repo, project: { id: "proj", canonical: "proj" } },
    tool: {
      transform: async (cb: (e: typeof editor) => void) => {
        cb(editor);
      },
    },
  } as unknown as Parameters<typeof registerOlcTools>[0];
  return { ctx, tools };
}

function setup(): { repo: string; config: ResolvedConfig; cleanup: () => void } {
  const repo = mkdtempSync(join(tmpdir(), "olc080-repo-"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "test@local");
  git(repo, "config", "user.name", "test");
  writeFileSync(join(repo, "app.txt"), "v1\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "init");
  const vault = mkdtempSync(join(tmpdir(), "olc080-vault-"));
  mkdirSync(join(vault, "OLC"), { recursive: true });
  writeFileSync(
    join(vault, "OLC", "registry.json"),
    JSON.stringify({ projects: { proj: { repoRoot: repo } } }),
  );
  // .olc/config.json
  mkdirSync(join(repo, ".olc"), { recursive: true });
  writeFileSync(
    join(repo, ".olc", "config.json"),
    JSON.stringify({ schemaVersion: 1, projectId: "proj", vaultPath: vault }),
  );
  const config: ResolvedConfig = { schemaVersion: 1, projectId: "proj", vaultPath: vault };
  return { repo, config, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).replace(/\s+$/, "");
}

function parse(content: string): any {
  return JSON.parse(content);
}

test("registers all 5 olc tools", async () => {
  const { repo, cleanup } = setup();
  try {
    const { ctx, tools } = makeCtx(repo);
    await registerOlcTools(ctx);
    const names = [...tools.keys()].sort();
    assert.deepEqual(
      names,
      [
        "log_event",
        "next_task",
        "project_status",
        "session_summary",
        "task_finalize",
      ].sort(),
    );
  } finally {
    cleanup();
  }
});

test("log_event appends through the tool handler", async () => {
  const { repo, cleanup } = setup();
  try {
    const { ctx, tools } = makeCtx(repo);
    await registerOlcTools(ctx);

    const out = parse(
      (await tools.get("log_event")!.execute({ kind: "milestone", summary: "Token check shipped." })).content,
    );
    assert.equal(out.ok, true);
    assert.match(out.file, /logs\/.*\.md$/);
    assert.equal(out.entry.summary, "Token check shipped.");
  } finally {
    cleanup();
  }
});

test("tools surface actionable error (ok:false) instead of throwing on missing config", async () => {
  const repo = mkdtempSync(join(tmpdir(), "olc080-nocfg-"));
  try {
    const { ctx, tools } = makeCtx(repo);
    await registerOlcTools(ctx);
    const res = parse((await tools.get("log_event")!.execute({ kind: "milestone", summary: "x" })).content);
    assert.equal(res.ok, false);
    assert.equal(res.error.code, "MISSING_CONFIG");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("session_summary builds markdown and returns ok", async () => {
  const { repo, cleanup } = setup();
  try {
    const { ctx, tools } = makeCtx(repo);
    await registerOlcTools(ctx);
    const res = parse(
      (await tools.get("session_summary")!.execute({
        whatDone: ["Fixed token check."],
        remaining: [],
        nextStep: "Close task.",
      })).content,
    );
    assert.equal(res.ok, true);
    assert.match(res.markdown, /Fixed token check/);
  } finally {
    cleanup();
  }
});

test("next_task recommends the most recently active open task", async () => {
  const { repo, config, cleanup } = setup();
  try {
    const { registerTask, setTaskStatus } = await import("../src/tasks/index.js");
    registerTask(config.vaultPath, "proj", "T-2", "main", "d1");
    registerTask(config.vaultPath, "proj", "T-1", "main", "d2");
    setTaskStatus(config.vaultPath, "proj", "T-1", "active", "d3");
    const { ctx, tools } = makeCtx(repo);
    await registerOlcTools(ctx);
    const res = parse((await tools.get("next_task")!.execute({ branch: "main" })).content);
    assert.equal(res.ok, true);
    assert.equal(res.recommendedTaskId, "T-1");
    assert.equal(res.openTasks.length, 2);
  } finally {
    cleanup();
  }
});

test("project_status reports open tasks and asks which to continue", async () => {
  const { repo, config, cleanup } = setup();
  try {
    const { registerTask, setTaskStatus } = await import("../src/tasks/index.js");
    registerTask(config.vaultPath, "proj", "T-1", "main", "d1");
    setTaskStatus(config.vaultPath, "proj", "T-1", "active", "d2");
    setTaskStatus(config.vaultPath, "proj", "T-1", "pending", "d3");
    const { ctx, tools } = makeCtx(repo);
    await registerOlcTools(ctx);
    const res = parse((await tools.get("project_status")!.execute({})).content);
    assert.equal(res.ok, true);
    assert.equal(res.recommendedTaskId, "T-1");
    assert.equal(res.openTasks.length, 1);
    assert.equal(res.needsConfirmation, true);
  } finally {
    cleanup();
  }
});

test("task_finalize closes the task and writes knowledge", async () => {
  const { repo, config, cleanup } = setup();
  try {
    const { registerTask, setTaskStatus, getTask } = await import("../src/tasks/index.js");
    const { draftTaskDocs } = await import("../src/planning/index.js");
    registerTask(config.vaultPath, "proj", "T-1", "main", "d1");
    setTaskStatus(config.vaultPath, "proj", "T-1", "active", "d2");
    draftTaskDocs(
      config.vaultPath,
      "proj",
      "T-1",
      { what: "w", why: "y", nonGoals: "n", openQuestions: "q" },
      { approach: "a", steps: "s", acceptanceCriteria: "c", tests: "t", risks: "r" },
    );
    const { ctx, tools } = makeCtx(repo);
    await registerOlcTools(ctx);
    const res = parse(
      (await tools.get("task_finalize")!.execute({ taskId: "T-1", highlights: "Shipped." })).content,
    );
    assert.equal(res.ok, true);
    assert.equal(res.taskId, "T-1");
    assert.match(res.knowledgeFile, /knowledge\/T-1\.md$/);
    assert.equal(getTask(config.vaultPath, "proj", "T-1")?.status, "done");
  } finally {
    cleanup();
  }
});

test("task_finalize without explicit task refuses loudly", async () => {
  const { repo, cleanup } = setup();
  try {
    const { ctx, tools } = makeCtx(repo);
    await registerOlcTools(ctx);
    const res = parse((await tools.get("task_finalize")!.execute({ taskId: "ghost" })).content);
    assert.equal(res.ok, false);
  } finally {
    cleanup();
  }
});
