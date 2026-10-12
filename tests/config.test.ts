import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  CONFIG_SCHEMA_VERSION,
  ConfigError,
  loadConfig,
  parseConfig,
  readConfigFile,
  resolveVaultPath,
  type OlcConfig,
} from "../src/config/index.js";

function makeProject(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "olc020-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

function validConfig(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ schemaVersion: 1, projectId: "my-proj", ...overrides });
}

function assertConfigError(fn: () => unknown, code: string): ConfigError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof ConfigError, `expected ConfigError, got ${error}`);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 20, "message should be actionable");
    return error;
  }
  assert.fail("expected ConfigError to be thrown");
}

test("valid full config file loads and resolves absolute vault path", () => {
  const root = makeProject({ ".olc/config.json": validConfig({ vaultPath: "/vaults/main" }) });
  const loaded = loadConfig(root, {});
  assert.equal(loaded.projectId, "my-proj");
  assert.equal(loaded.schemaVersion, CONFIG_SCHEMA_VERSION);
  assert.equal(loaded.vaultPath, resolve("/vaults/main"));
});

test("env OLC_VAULT_PATH wins over config file vaultPath", () => {
  const root = makeProject({ ".olc/config.json": validConfig({ vaultPath: "/vaults/file" }) });
  const loaded = loadConfig(root, { OLC_VAULT_PATH: "/vaults/env" });
  assert.equal(loaded.vaultPath, resolve("/vaults/env"));
});

test("env provides vault path when config file has none", () => {
  const root = makeProject({ ".olc/config.json": validConfig() });
  const loaded = loadConfig(root, { OLC_VAULT_PATH: "/vaults/env-only" });
  assert.equal(loaded.vaultPath, resolve("/vaults/env-only"));
});

test("relative vault paths resolve against project root, not cwd", () => {
  const root = makeProject({ ".olc/config.json": validConfig({ vaultPath: "vault/dir" }) });
  const cfg: OlcConfig = { schemaVersion: 1, projectId: "p" };
  assert.equal(
    resolveVaultPath({ ...cfg, vaultPath: "vault/dir" }, root, {}),
    resolve(root, "vault/dir"),
  );
  assert.equal(
    resolveVaultPath(cfg, root, { OLC_VAULT_PATH: "rel-env" }),
    resolve(root, "rel-env"),
  );
});

test("missing config file reports MISSING_CONFIG", () => {
  const root = makeProject();
  assert.equal(readConfigFile(root), null);
  const err = assertConfigError(() => loadConfig(root, {}), "MISSING_CONFIG");
  assert.match(err.message, /init/i);
});

test("malformed JSON reports INVALID_JSON", () => {
  const root = makeProject({ ".olc/config.json": "{ not json" });
  assertConfigError(() => loadConfig(root, {}), "INVALID_JSON");
});

test("missing projectId reports INVALID_CONFIG", () => {
  assertConfigError(() => parseConfig({ schemaVersion: 1 }), "INVALID_CONFIG");
  assertConfigError(
    () => parseConfig({ schemaVersion: 1, projectId: "   " }),
    "INVALID_CONFIG",
  );
});

test("unsafe projectId values are rejected", () => {
  for (const bad of ["../escape", "a/b", ".hidden", "-lead", "with space", "x".repeat(65)]) {
    assertConfigError(
      () => parseConfig({ schemaVersion: 1, projectId: bad }),
      "INVALID_CONFIG",
    );
  }
  const ok = parseConfig({ schemaVersion: 1, projectId: "Abc-123_x" });
  assert.equal(ok.projectId, "Abc-123_x");
});

test("future schema version fails safely with UNSUPPORTED_SCHEMA", () => {
  const err = assertConfigError(
    () => parseConfig({ schemaVersion: 999, projectId: "p" }),
    "UNSUPPORTED_SCHEMA",
  );
  assert.match(err.message, /999/);
});

test("non-integer schema version is INVALID_CONFIG", () => {
  assertConfigError(() => parseConfig({ projectId: "p" }), "INVALID_CONFIG");
  assertConfigError(
    () => parseConfig({ schemaVersion: "1", projectId: "p" }),
    "INVALID_CONFIG",
  );
});

test("unknown top-level keys are rejected", () => {
  const err = assertConfigError(
    () => parseConfig({ schemaVersion: 1, projectId: "p", bogus: true }),
    "INVALID_CONFIG",
  );
  assert.match(err.message, /bogus/);
});

test("secret-like keys are rejected", () => {
  for (const key of ["apiKey", "GITHUB_TOKEN", "db_password", "clientSecret"]) {
    assertConfigError(
      () => parseConfig({ schemaVersion: 1, projectId: "p", [key]: "x" }),
      "SECRET_IN_CONFIG",
    );
  }
});

test("no vault path from either source reports MISSING_VAULT_PATH", () => {
  const root = makeProject({ ".olc/config.json": validConfig() });
  const err = assertConfigError(() => loadConfig(root, {}), "MISSING_VAULT_PATH");
  assert.match(err.message, /OLC_VAULT_PATH/);
});

test("blank env value is treated as unset", () => {
  const root = makeProject({ ".olc/config.json": validConfig({ vaultPath: "/vaults/file" }) });
  const loaded = loadConfig(root, { OLC_VAULT_PATH: "   " });
  assert.equal(loaded.vaultPath, resolve("/vaults/file"));
  const bare = makeProject({ ".olc/config.json": validConfig() });
  assertConfigError(() => loadConfig(bare, { OLC_VAULT_PATH: "" }), "MISSING_VAULT_PATH");
});
