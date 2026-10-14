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

test("registers both olc tools (log_event, session_summary)", async () => {
  const { repo, cleanup } = setup();
  try {
    const { ctx, tools } = makeCtx(repo);
    await registerOlcTools(ctx);
    const names = [...tools.keys()].sort();
    assert.deepEqual(names, ["log_event", "session_summary"].sort());
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
