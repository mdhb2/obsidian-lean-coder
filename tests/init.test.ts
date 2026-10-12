import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";

import { initProject, proposeProjectId } from "../src/init/index.js";
import { validateIdentity } from "../src/core/project-identity.js";
import { loadConfig } from "../src/config/index.js";

function makeRepo(name = "demo-app"): string {
  const dir = join(mkdtempSync(join(tmpdir(), "olc022-")), name);
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  writeFileSync(join(dir, "f.txt"), "x\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

function makeVault(): string {
  return mkdtempSync(join(tmpdir(), "olc022-vault-"));
}

test("fresh init proposes id first, then creates everything on approval", () => {
  const repo = makeRepo();
  const vault = makeVault();
  const first = initProject({ projectRoot: repo, vaultPath: vault, env: {} });
  assert.equal(first.status, "needs-decision");
  assert.match(first.decision ?? "", /demo-app/);
  assert.equal(existsSync(join(repo, ".olc", "config.json")), false);

  const second = initProject({ projectRoot: repo, projectId: first.projectId, vaultPath: vault, env: {} });
  assert.equal(second.status, "ready");
  assert.ok(second.entries.some((e) => e.path.endsWith(".olc/config.json") && e.action === "created"));
  assert.ok(second.entries.some((e) => e.path.endsWith("index.md") && e.action === "created"));
  assert.ok(second.entries.some((e) => e.path.endsWith("registry.json") && e.action === "created"));

  // The result must pass the OLC-021 identity gate.
  const config = loadConfig(repo, {});
  const id = validateIdentity(repo, config);
  assert.equal(id.projectId, "demo-app");
  assert.equal(id.vaultRoot, vault);
});

test("rerun preserves customized files byte-identical", () => {
  const repo = makeRepo();
  const vault = makeVault();
  const init = (extra = {}) =>
    initProject({ projectRoot: repo, projectId: "demo-app", vaultPath: vault, env: {}, ...extra });
  const first = init();
  assert.equal(first.status, "ready");
  writeFileSync(join(repo, ".olc", "AGENTS.md"), "MY CUSTOM RULES\n");
  const configBefore = readFileSync(join(repo, ".olc", "config.json"), "utf8");

  const second = init();
  assert.equal(second.status, "ready");
  assert.ok(second.entries.every((e) => e.action !== "created"), "rerun must create nothing");
  assert.equal(readFileSync(join(repo, ".olc", "AGENTS.md"), "utf8"), "MY CUSTOM RULES\n");
  assert.equal(readFileSync(join(repo, ".olc", "config.json"), "utf8"), configBefore);
});

test("pre-existing config and custom instructions are preserved", () => {
  const repo = makeRepo("shop");
  const vault = makeVault();
  mkdirSync(join(repo, ".olc"), { recursive: true });
  writeFileSync(
    join(repo, ".olc", "config.json"),
    JSON.stringify({ schemaVersion: 1, projectId: "shop", vaultPath: vault }) + "\n",
  );
  writeFileSync(join(repo, ".olc", "AGENTS.md"), "HAND-WRITTEN\n");
  const report = initProject({ projectRoot: repo, env: {} });
  assert.equal(report.status, "ready");
  assert.equal(report.projectId, "shop");
  assert.ok(report.entries.filter((e) => e.action === "preserved").length >= 2);
  assert.equal(readFileSync(join(repo, ".olc", "AGENTS.md"), "utf8"), "HAND-WRITTEN\n");
});

test("duplicate project_id aborts with zero writes", () => {
  const repoA = makeRepo("same-name");
  const repoB = makeRepo("same-name");
  const vault = makeVault();
  const done = initProject({ projectRoot: repoA, projectId: "same-name", vaultPath: vault, env: {} });
  assert.equal(done.status, "ready");
  const dup = initProject({ projectRoot: repoB, projectId: "same-name", vaultPath: vault, env: {} });
  assert.equal(dup.status, "needs-decision");
  assert.match(dup.decision ?? "", /already registered to another repository/);
  assert.equal(existsSync(join(repoB, ".olc")), false);
});

test("dry-run writes nothing but reports would-create", () => {
  const repo = makeRepo();
  const vault = makeVault();
  const report = initProject({ projectRoot: repo, projectId: "demo-app", vaultPath: vault, env: {}, dryRun: true });
  assert.equal(report.status, "ready");
  assert.equal(report.dryRun, true);
  assert.ok(report.entries.some((e) => e.action === "created"));
  assert.equal(existsSync(join(repo, ".olc")), false);
  assert.equal(existsSync(join(vault, "OLC")), false);
});

test("missing vault path asks instead of inventing one", () => {
  const repo = makeRepo();
  const report = initProject({ projectRoot: repo, projectId: "demo-app", env: {} });
  assert.equal(report.status, "needs-decision");
  assert.match(report.decision ?? "", /OLC_VAULT_PATH/);
  assert.equal(existsSync(join(repo, ".olc")), false);
});

test("invalid existing config is flagged, never overwritten", () => {
  const repo = makeRepo();
  const vault = makeVault();
  mkdirSync(join(repo, ".olc"), { recursive: true });
  writeFileSync(join(repo, ".olc", "config.json"), "{ broken");
  const report = initProject({ projectRoot: repo, projectId: "x", vaultPath: vault, env: {} });
  assert.equal(report.status, "needs-decision");
  assert.ok(report.entries.some((e) => e.action === "attention"));
  assert.equal(readFileSync(join(repo, ".olc", "config.json"), "utf8"), "{ broken");
});

test("proposeProjectId sanitizes repository names", () => {
  assert.equal(proposeProjectId("/x/demo-app"), "demo-app");
  assert.equal(proposeProjectId("/x/My Cool_App!"), "my-cool_app");
});
