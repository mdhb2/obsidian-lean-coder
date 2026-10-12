import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ResolvedConfig } from "../src/config/index.js";
import { IdentityError } from "../src/core/project-identity.js";
import {
  LogError,
  logEvent,
  readLastEvents,
  readLogDay,
} from "../src/log/index.js";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).replace(/\s+$/, "");
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "olc060-repo-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@local");
  git(dir, "config", "user.name", "test");
  writeFileSync(join(dir, "app.txt"), "v1\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

function makeVault(projectId: string, repoRoot: string): string {
  const dir = mkdtempSync(join(tmpdir(), "olc060-vault-"));
  mkdirSync(join(dir, "OLC"), { recursive: true });
  writeFileSync(
    join(dir, "OLC", "registry.json"),
    JSON.stringify({ projects: { [projectId]: { repoRoot } } }),
  );
  return dir;
}

function setup(): { repo: string; vault: string; config: ResolvedConfig } {
  const repo = makeRepo();
  const vault = makeVault("proj", repo);
  const config: ResolvedConfig = { schemaVersion: 1, projectId: "proj", vaultPath: vault };
  return { repo, vault, config };
}

const DAY1 = "2026-10-12T10:00:00.000Z";
const DAY1_LATER = "2026-10-12T15:30:00.000Z";
const DAY2 = "2026-10-13T09:00:00.000Z";

test("append then read round-trips entries in order", () => {
  const { repo, vault, config } = setup();
  logEvent({
    projectRoot: repo,
    config,
    event: { kind: "milestone", taskId: "T-1", summary: "First milestone", date: DAY1 },
  });
  const { file, entry } = logEvent({
    projectRoot: repo,
    config,
    event: {
      kind: "checkpoint",
      taskId: "T-1",
      summary: "Checkpoint done",
      details: "all checks green",
      gitSha: "abc123",
      date: DAY1_LATER,
    },
  });
  assert.equal(file, join(vault, "OLC", "Projects", "proj", "logs", "2026-10-12.md"));
  assert.equal(entry.kind, "checkpoint");
  assert.equal(entry.gitSha, "abc123");
  assert.equal(entry.redacted, false);
  const raw = readFileSync(file, "utf8");
  assert.match(raw, /^---\nproject: proj\n/m);
  const events = readLogDay(vault, "proj", "2026-10-12");
  assert.equal(events.length, 2);
  assert.equal(events[0].summary, "First milestone");
  assert.equal(events[0].taskId, "T-1");
  assert.equal(events[1].details, "all checks green");
  assert.equal(events[1].date, DAY1_LATER);
});

test("invalid vault blocks the write with zero files created", () => {
  const { repo, vault } = setup();
  const bad: ResolvedConfig = { schemaVersion: 1, projectId: "other", vaultPath: vault };
  assert.throws(() => logEvent({ projectRoot: repo, config: bad, event: { kind: "session", summary: "hi", date: DAY1 } }), IdentityError);
  assert.equal(existsSync(join(vault, "OLC", "Projects", "other")), false);
  assert.equal(existsSync(join(vault, "OLC", "Projects", "proj", "logs")), false);
});

test("secrets are scrubbed and never stored", () => {
  const { repo, vault, config } = setup();
  const { file, entry } = logEvent({
    projectRoot: repo,
    config,
    event: {
      kind: "session",
      summary: "used token ghp_abcdef1234567890 for the demo",
      details: "login with password=hunter2-s3cret; key -----BEGIN RSA PRIVATE KEY-----",
      date: DAY1,
    },
  });
  assert.equal(entry.redacted, true);
  const raw = readFileSync(file, "utf8");
  assert.doesNotMatch(raw, /ghp_abcdef1234567890/);
  assert.doesNotMatch(raw, /hunter2-s3cret/);
  assert.doesNotMatch(raw, /BEGIN RSA PRIVATE KEY/);
  assert.match(raw, /\[redacted\]/);
  assert.match(raw, /- redacted: true/);
  const [back] = readLogDay(vault, "proj", "2026-10-12");
  assert.equal(back.redacted, true);
  assert.match(back.summary, /\[redacted\]/);
});

test("crash remnant (no trailing newline) does not corrupt prior entries", () => {
  const { repo, vault, config } = setup();
  logEvent({ projectRoot: repo, config, event: { kind: "milestone", summary: "Complete entry", date: DAY1 } });
  const file = join(vault, "OLC", "Projects", "proj", "logs", "2026-10-12.md");
  writeFileSync(file, readFileSync(file, "utf8").replace(/\n$/, "") + "\n- summ");
  logEvent({ projectRoot: repo, config, event: { kind: "session", summary: "After crash", date: DAY1_LATER } });
  const raw = readFileSync(file, "utf8");
  assert.ok(raw.endsWith("\n"), "file ends cleanly after append");
  const events = readLogDay(vault, "proj", "2026-10-12");
  assert.equal(events[0].summary, "Complete entry");
  assert.equal(events[events.length - 1].summary, "After crash");
});

test("different days rotate into different files; newest-first read", () => {
  const { repo, vault, config } = setup();
  logEvent({ projectRoot: repo, config, event: { kind: "session", summary: "day one", date: DAY1 } });
  logEvent({ projectRoot: repo, config, event: { kind: "session", summary: "day two", date: DAY2 } });
  assert.ok(existsSync(join(vault, "OLC", "Projects", "proj", "logs", "2026-10-12.md")));
  assert.ok(existsSync(join(vault, "OLC", "Projects", "proj", "logs", "2026-10-13.md")));
  const last = readLastEvents(vault, "proj", 10);
  assert.equal(last.length, 2);
  assert.equal(last[0].summary, "day two");
  assert.equal(last[1].summary, "day one");
  assert.deepEqual(readLogDay(vault, "proj", "2026-10-01"), []);
  assert.deepEqual(readLastEvents(mkdtempSync(join(tmpdir(), "olc060-empty-")), "proj", 5), []);
});

test("checkpoint events carry the git sha cross-reference", () => {
  const { repo, vault, config } = setup();
  const sha = git(repo, "rev-parse", "HEAD");
  logEvent({
    projectRoot: repo,
    config,
    event: { kind: "checkpoint", taskId: "T-9", summary: "Checkpoint", gitSha: sha, date: DAY1 },
  });
  const [back] = readLastEvents(vault, "proj", 1);
  assert.equal(back.kind, "checkpoint");
  assert.equal(back.gitSha, sha);
  assert.equal(back.taskId, "T-9");
});

test("unwritable log target reports LOG_WRITE_FAILED without losing prior entries", () => {
  const { repo, vault, config } = setup();
  logEvent({ projectRoot: repo, config, event: { kind: "session", summary: "kept", date: DAY1 } });
  const file = join(vault, "OLC", "Projects", "proj", "logs", "2026-10-12.md");
  const before = readFileSync(file, "utf8");
  writeFileSync(file + ".bak", before);
  // Replace the file with a directory: appends must fail deterministically
  // (no chmod games — those are unreliable under root).
  execFileSync("rm", [file]);
  mkdirSync(file);
  assert.throws(
    () => logEvent({ projectRoot: repo, config, event: { kind: "session", summary: "lost?", date: DAY1_LATER } }),
    (e: unknown) => e instanceof LogError && e.code === "LOG_WRITE_FAILED",
  );
  execFileSync("rmdir", [file]);
  writeFileSync(file, readFileSync(file + ".bak", "utf8"));
  const events = readLogDay(vault, "proj", "2026-10-12");
  assert.equal(events.length, 1);
  assert.equal(events[0].summary, "kept");
});

test("invalid event input is rejected before any vault touch", () => {
  const { repo, vault, config } = setup();
  assert.throws(
    () => logEvent({ projectRoot: repo, config, event: { kind: "session", summary: "   ", date: DAY1 } }),
    (e: unknown) => e instanceof LogError && e.code === "INVALID_EVENT",
  );
  assert.throws(
    () => logEvent({ projectRoot: repo, config, event: { kind: "session", summary: "x", date: "not-a-date" } }),
    (e: unknown) => e instanceof LogError && e.code === "INVALID_DATE",
  );
  assert.equal(existsSync(join(vault, "OLC", "Projects", "proj", "logs")), false);
});
