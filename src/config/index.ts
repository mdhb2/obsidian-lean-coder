/**
 * OLC project configuration (`.olc/config.json`).
 *
 * Minimal validated config per PRD §7.5 and OLC-020:
 * - `schemaVersion` (currently 1; unknown future versions fail safely)
 * - `projectId` (required; also used as the vault directory name)
 * - `vaultPath` (optional in file; see precedence below)
 *
 * Vault-path precedence (highest first):
 * 1. `OLC_VAULT_PATH` environment variable
 * 2. `vaultPath` field in `.olc/config.json`
 * 3. Neither → `ConfigError` (no silent default or fallback directory)
 *
 * Relative paths (env or file) resolve against the project root, never cwd,
 * so results are deterministic regardless of where the process runs.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export const CONFIG_SCHEMA_VERSION = 1;
export const CONFIG_REL_PATH = ".olc/config.json";
export const VAULT_PATH_ENV = "OLC_VAULT_PATH";

/** Safe as a single vault directory name: no separators, no leading dots. */
const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-_]{0,63}$/;

/** Top-level keys that look like credentials are rejected (PRD: no secrets in config). */
const SECRET_KEY_PATTERN = /secret|token|password|passwd|api[-_]?key/i;

export type ConfigErrorCode =
  | "MISSING_CONFIG"
  | "UNREADABLE_CONFIG"
  | "INVALID_JSON"
  | "INVALID_CONFIG"
  | "UNSUPPORTED_SCHEMA"
  | "SECRET_IN_CONFIG"
  | "MISSING_VAULT_PATH";

export class ConfigError extends Error {
  readonly code: ConfigErrorCode;
  constructor(code: ConfigErrorCode, message: string) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
  }
}

export interface OlcConfig {
  schemaVersion: number;
  projectId: string;
  vaultPath?: string;
}

export interface ResolvedConfig extends OlcConfig {
  /** Absolute vault path after applying precedence rules. Always present. */
  vaultPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate unknown parsed JSON into an `OlcConfig`. Pure (no I/O).
 * Throws `ConfigError` with an actionable message on any problem.
 */
export function parseConfig(json: unknown): OlcConfig {
  if (!isRecord(json)) {
    throw new ConfigError(
      "INVALID_CONFIG",
      "Invalid OLC config: expected a JSON object at the top level. " +
        `Fix ${CONFIG_REL_PATH} or re-run init to regenerate it.`,
    );
  }
  for (const key of Object.keys(json)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new ConfigError(
        "SECRET_IN_CONFIG",
        `Invalid OLC config: key "${key}" looks like a credential. ` +
          "Do not store secrets in .olc/config.json — remove the key and use your shell or secret manager instead.",
      );
    }
  }
  const allowed = new Set(["schemaVersion", "projectId", "vaultPath"]);
  const unknownKeys = Object.keys(json).filter((k) => !allowed.has(k));
  if (unknownKeys.length > 0) {
    throw new ConfigError(
      "INVALID_CONFIG",
      `Invalid OLC config: unknown key(s) ${unknownKeys.map((k) => `"${k}"`).join(", ")}. ` +
        `Allowed keys are "schemaVersion", "projectId", "vaultPath". Fix ${CONFIG_REL_PATH}.`,
    );
  }
  const { schemaVersion, projectId, vaultPath } = json;
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion)) {
    throw new ConfigError(
      "INVALID_CONFIG",
      'Invalid OLC config: "schemaVersion" must be an integer. ' +
        `Fix ${CONFIG_REL_PATH} (expected ${CONFIG_SCHEMA_VERSION}).`,
    );
  }
  if (schemaVersion !== CONFIG_SCHEMA_VERSION) {
    throw new ConfigError(
      "UNSUPPORTED_SCHEMA",
      `Unsupported OLC config schema version ${schemaVersion} (this OLC supports ${CONFIG_SCHEMA_VERSION}). ` +
        "Upgrade OLC to a version that understands this config, or regenerate the config with init.",
    );
  }
  if (typeof projectId !== "string" || projectId.trim() === "") {
    throw new ConfigError(
      "INVALID_CONFIG",
      'Invalid OLC config: "projectId" must be a non-empty string. ' +
        `Fix ${CONFIG_REL_PATH} (it becomes the vault directory name).`,
    );
  }
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new ConfigError(
      "INVALID_CONFIG",
      `Invalid OLC config: "projectId" ${JSON.stringify(projectId)} is not allowed. ` +
        "Use 1–64 characters of letters, digits, dash or underscore, starting with a letter or digit " +
        `(it becomes a vault directory name, so separators and dots are forbidden). Fix ${CONFIG_REL_PATH}.`,
    );
  }
  if (vaultPath !== undefined && (typeof vaultPath !== "string" || vaultPath.trim() === "")) {
    throw new ConfigError(
      "INVALID_CONFIG",
      'Invalid OLC config: "vaultPath" must be a non-empty string when present. ' +
        `Remove it or set a real path in ${CONFIG_REL_PATH}.`,
    );
  }
  const config: OlcConfig = { schemaVersion, projectId };
  if (typeof vaultPath === "string") config.vaultPath = vaultPath;
  return config;
}

/**
 * Read and validate `.olc/config.json` under `projectRoot`.
 * Returns `null` when the file does not exist (missing ≠ invalid;
 * callers such as init decide what missing means). Throws `ConfigError`
 * when the file exists but cannot be read or parsed.
 */
export function readConfigFile(projectRoot: string): OlcConfig | null {
  const path = resolve(projectRoot, CONFIG_REL_PATH);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ConfigError(
      "UNREADABLE_CONFIG",
      `Cannot read OLC config at ${path}: ${(error as Error).message}. Check file permissions.`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(
      "INVALID_JSON",
      `Invalid OLC config: ${path} is not valid JSON (${(error as Error).message}). Fix the file or re-run init.`,
    );
  }
  return parseConfig(json);
}

/**
 * Resolve the vault path applying precedence: env > config file > error.
 * Returns an absolute path (relative inputs resolve against `projectRoot`).
 */
export function resolveVaultPath(
  config: OlcConfig,
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = env[VAULT_PATH_ENV]?.trim();
  const raw = fromEnv ? fromEnv : config.vaultPath?.trim();
  if (!raw) {
    throw new ConfigError(
      "MISSING_VAULT_PATH",
      `No vault path configured: set the ${VAULT_PATH_ENV} environment variable ` +
        `or add "vaultPath" to ${CONFIG_REL_PATH}. OLC never invents a vault location.`,
    );
  }
  return isAbsolute(raw) ? raw : resolve(projectRoot, raw);
}

/**
 * Load `.olc/config.json` under `projectRoot` and resolve the vault path.
 * Throws `ConfigError` when the file is missing, invalid, or no vault path
 * is configured from either source.
 */
export function loadConfig(
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedConfig {
  const path = resolve(projectRoot, CONFIG_REL_PATH);
  const config = readConfigFile(projectRoot);
  if (config === null) {
    throw new ConfigError(
      "MISSING_CONFIG",
      `No OLC config found at ${path}. Run init to create one (it asks for project_id and vault path).`,
    );
  }
  return { ...config, vaultPath: resolveVaultPath(config, projectRoot, env) };
}
