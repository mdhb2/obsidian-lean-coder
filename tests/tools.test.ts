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

test("registers all 8 olc tools", async () => {
  const { repo, cleanup } = setup();
  try {
    const { ctx, tools } = makeCtx(repo);
    await registerOlcTools(ctx);
    const names = [...tools.keys()].sort();
    assert.deepEqual(
      names,
      [
        "decision_record",
        "log_event",
        "memory_recall",
        "memory_record",
        "session_summary",
        "taste_list",
        "taste_propose",
        "taste_review",
      ].sort(),
    );
  } finally {
    cleanup();
  }
});

test("memory_record + memory_recall round-trip through tool handlers", async () => {
  const { repo, cleanup } = setup();
  try {
    const { ctx, tools } = makeCtx(repo);
    await registerOlcTools(ctx);

    const write = parse(
      (await tools.get("memory_record")!.execute({ name: "auth-notes", content: "Token expiry uses <= not <." })).content,
    );
    assert.equal(write.ok, true);
    assert.equal(write.path, "memory/auth-notes.md");

    const read = parse(
      (await tools.get("memory_recall")!.execute({ query: "token expiry" })).content,
    );
    assert.equal(read.ok, true);
    assert.ok(read.matches.some((m: any) => m.file === "auth-notes.md"));
  } finally {
    cleanup();
  }
});

test("taste_propose creates pending; taste_review approves to active", async () => {
  const { repo, cleanup } = setup();
  try {
    const { ctx, tools } = makeCtx(repo);
    await registerOlcTools(ctx);

    const proposed = parse(
      (await tools.get("taste_propose")!.execute({
        name: "no-any",
        rule: "Avoid the `any` type in TypeScript.",
        examples: ["User corrected the `any` usage in utils.ts"],
      })).content,
    );
    assert.equal(proposed.ok, true);
    assert.equal(proposed.status, "pending");

    const approved = parse(
      (await tools.get("taste_review")!.execute({ name: "no-any", approve: true })).content,
    );
    assert.equal(approved.ok, true);
    assert.equal(approved.status, "active");
  } finally {
    cleanup();
  }
});

test("decision_record writes decisions/<date>-<slug>.md (create-only)", async () => {
  const { repo, cleanup } = setup();
  try {
    const { ctx, tools } = makeCtx(repo);
    await registerOlcTools(ctx);

    const out = parse(
      (await tools.get("decision_record")!.execute({
        title: "Use SQLite for MVP",
        context: "Postgres adds ops burden for local dev.",
        decision: "Ship with SQLite; migrate later if needed.",
        consequences: "db/migrations stay dialect-light.",
        date: "2026-10-12",
      })).content,
    );
    assert.equal(out.ok, true);
    assert.match(out.file, /decisions\/2026-10-12-use-sqlite-for-mvp\.md$/);

    const again = JSON.parse(
      (await tools.get("decision_record")!.execute({
        title: "Use SQLite for MVP",
        context: "x",
        decision: "y",
        consequences: "z",
        date: "2026-10-12",
      })).content,
    );
    assert.equal(again.ok, false);
    assert.equal(again.error.code, "ALREADY_EXISTS");
  } finally {
    cleanup();
  }
});

test("tools surface actionable error (ok:false) instead of throwing on missing config", async () => {
  const repo = mkdtempSync(join(tmpdir(), "olc080-nocfg-"));
  try {
    const { ctx, tools } = makeCtx(repo);
    await registerOlcTools(ctx);
    const res = parse((await tools.get("memory_recall")!.execute({})).content);
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
