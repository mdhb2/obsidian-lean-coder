/**
 * Safe, idempotent project initialization (OLC-022, PRD §7.4 init flow).
 *
 * `initProject` never overwrites an existing file: every target is either
 * created (when missing) or reported as preserved / attention-needed.
 * Anything requiring a human choice (confirming the proposed project_id,
 * providing a vault path, resolving a duplicate id) is returned as
 * `status: "needs-decision"` with an actionable message — the caller
 * (agent or user) supplies the answer on a follow-up call. No prompting
 * happens inside this module, so it stays testable and non-interactive.
 *
 * Report entry actions: `created` | `preserved` | `attention`.
 * With `dryRun: true` nothing is written; `created` then means "would create".
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { CONFIG_SCHEMA_VERSION, VAULT_PATH_ENV, parseConfig } from "../config/index.js";
import { REGISTRY_REL_PATH, resolveRepoRoot, type VaultRegistry } from "../core/project-identity.js";

export const OLC_DIR = ".olc";
export const CONFIG_FILE = "config.json";
export const AGENTS_FILE = "AGENTS.md";

const AGENTS_STUB = (projectId: string): string =>
  `# OLC project instructions — ${projectId}\n\n` +
  "Review and customize this file. OLC agents read it before memory operations.\n\n" +
  "## Aturan tambahan proyek\n\n" +
  "Tulis aturan khusus proyek ini di bawah (selain yang sudah ada di AGENTS.md utama).\n" +
  "Bila bertentangan dengan perilaku default OpenCode, default yang menang — agen akan\n" +
  "menunjukkan konfliknya dan meminta keputusan Anda sebelum lanjut.\n\n" +
  "- (belum ada — tambahkan sesuai kebutuhan proyek)\n";

const VAULT_INDEX = (projectId: string): string =>
  `# ${projectId}\n\nOLC project memory root. See current-state.md for the latest status.\n` +
  `\n## Terkait\n\n- [[current-state]] — status terbaru proyek\n`;

const VAULT_STATE = (projectId: string): string =>
  `# Current state — ${projectId}\n\nInitialized. No activity recorded yet.\n` +
  `\n## Terkait\n\n- [[index]] — hub memori proyek\n`;

export interface InitEntry {
  path: string;
  action: "created" | "preserved" | "attention";
  note?: string;
}

export interface InitReport {
  status: "ready" | "needs-decision";
  projectRoot: string;
  repoRoot: string;
  projectId: string;
  vaultRoot: string | null;
  dryRun: boolean;
  entries: InitEntry[];
  /** Present when status is needs-decision: what the caller must supply. */
  decision?: string;
}

export interface InitOptions {
  projectRoot: string;
  /** Explicitly approved project_id. Omit to get a proposal (needs-decision). */
  projectId?: string;
  /** Explicit vault path. Falls back to OLC_VAULT_PATH, then existing config. */
  vaultPath?: string;
  env?: NodeJS.ProcessEnv;
  dryRun?: boolean;
}

/** Derive a safe project_id proposal from the repository directory name. */
export function proposeProjectId(repoRoot: string): string {
  const cleaned = basename(resolve(repoRoot))
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return cleaned || "project";
}

function readRegistryFile(path: string): { registry: VaultRegistry; existed: boolean } {
  if (!existsSync(path)) return { registry: { projects: {} }, existed: false };
  const json = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error("invalid registry shape");
  }
  const projects = (json as Record<string, unknown>).projects;
  if (typeof projects !== "object" || projects === null) throw new Error("invalid registry shape");
  return { registry: json as VaultRegistry, existed: true };
}

function planFile(path: string, content: string, dryRun: boolean): InitEntry {
  if (existsSync(path)) return { path, action: "preserved" };
  if (!dryRun) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
  return { path, action: "created" };
}

export function initProject(options: InitOptions): InitReport {
  const dryRun = options.dryRun === true;
  const env = options.env ?? process.env;
  const projectRoot = resolve(options.projectRoot);
  const repoRoot = resolveRepoRoot(projectRoot);

  const base: Omit<InitReport, "status" | "projectId" | "vaultRoot" | "decision"> & {
    projectId: string;
    vaultRoot: string | null;
    decision?: string;
  } = { projectRoot, repoRoot, projectId: "", vaultRoot: null, dryRun, entries: [] };

  // 1. Project id: explicit, existing config, or proposal needing approval.
  let projectId = options.projectId?.trim();
  const configPath = join(projectRoot, OLC_DIR, CONFIG_FILE);
  let existingConfigId: string | null = null;
  if (existsSync(configPath)) {
    try {
      existingConfigId = parseConfig(JSON.parse(readFileSync(configPath, "utf8"))).projectId;
    } catch {
      base.entries.push({
        path: configPath,
        action: "attention",
        note: "Existing config is invalid — fix or delete it, then re-run init. It was NOT overwritten.",
      });
      return { ...base, status: "needs-decision", decision: "repair-or-remove-invalid-config" };
    }
  }
  if (!projectId) {
    if (existingConfigId) {
      projectId = existingConfigId;
    } else {
      return {
        ...base,
        projectId: proposeProjectId(repoRoot),
        status: "needs-decision",
        decision:
          `Proposed project_id "${proposeProjectId(repoRoot)}" (from repository name). ` +
          "Re-run init with projectId set to this value to approve, or pass a different one.",
      };
    }
  }
  base.projectId = projectId;

  // 2. Vault path: explicit > env > existing config > ask.
  let vaultInput = options.vaultPath?.trim() || env[VAULT_PATH_ENV]?.trim() || null;
  if (!vaultInput && existingConfigId && existingConfigId === projectId) {
    try {
      const parsed = parseConfig(JSON.parse(readFileSync(configPath, "utf8")));
      vaultInput = parsed.vaultPath?.trim() || null;
    } catch {
      /* already validated above; unreachable */
    }
  }
  if (!vaultInput) {
    return {
      ...base,
      status: "needs-decision",
      decision:
        `No vault path for project "${projectId}". Re-run init with vaultPath set, ` +
          `or set the ${VAULT_PATH_ENV} environment variable. OLC never invents a vault location.`,
    };
  }
  const vaultRoot = resolve(repoRoot, vaultInput);
  base.vaultRoot = vaultRoot;

  // 3. Duplicate project_id check BEFORE any write.
  const registryPath = join(vaultRoot, REGISTRY_REL_PATH);
  let registry: VaultRegistry;
  let registryExisted: boolean;
  try {
    ({ registry, existed: registryExisted } = readRegistryFile(registryPath));
  } catch {
    base.entries.push({
      path: registryPath,
      action: "attention",
      note: "Existing registry is corrupt — fix it or back it up, then re-run init. Nothing was written.",
    });
    return { ...base, status: "needs-decision", decision: "repair-corrupt-registry" };
  }
  const owner = registry.projects[projectId]?.repoRoot;
  if (owner && resolve(owner) !== repoRoot) {
    return {
      ...base,
      status: "needs-decision",
      decision:
        `project_id "${projectId}" is already registered to another repository (${resolve(owner)}). ` +
          "Re-run init with a different projectId for this checkout. Nothing was written.",
    };
  }

  // 4. Write phase (skipped entirely under dryRun): create only missing files.
  const entries = base.entries;
  if (!existsSync(configPath)) {
    const content = JSON.stringify(
      { schemaVersion: CONFIG_SCHEMA_VERSION, projectId, vaultPath: vaultInput },
      null,
      2,
    ) + "\n";
    if (!dryRun) {
      mkdirSync(join(configPath, ".."), { recursive: true });
      writeFileSync(configPath, content);
    }
    entries.push({ path: configPath, action: "created" });
  } else {
    entries.push({ path: configPath, action: "preserved" });
  }
  entries.push(planFile(join(projectRoot, OLC_DIR, AGENTS_FILE), AGENTS_STUB(projectId), dryRun));

  const projectDir = join(vaultRoot, "OLC", "Projects", projectId);
  entries.push(planFile(join(projectDir, "index.md"), VAULT_INDEX(projectId), dryRun));
  entries.push(planFile(join(projectDir, "current-state.md"), VAULT_STATE(projectId), dryRun));
  for (const sub of ["decisions", "tasks", "logs", "memory", "taste"]) {
    const dir = join(projectDir, sub);
    if (existsSync(dir)) {
      entries.push({ path: dir, action: "preserved" });
    } else {
      if (!dryRun) mkdirSync(dir, { recursive: true });
      entries.push({ path: dir, action: "created" });
    }
  }
  if (!registryExisted || !owner) {
    if (!dryRun) {
      mkdirSync(join(registryPath, ".."), { recursive: true });
      writeFileSync(
        registryPath,
        JSON.stringify({ projects: { ...registry.projects, [projectId]: { repoRoot } } }, null, 2) + "\n",
      );
    }
    entries.push({ path: registryPath, action: "created" });
  } else {
    entries.push({ path: registryPath, action: "preserved" });
  }
  return { ...base, status: "ready" };
}
