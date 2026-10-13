/**
 * OLC package entrypoint. Thin on purpose — see docs/PRD.md §8 for planned
 * module layout (config, core, git, logging, tools, validation).
 *
 * The plugin default export is re-exported here (not only from
 * `./plugin.js`) because OpenCode's npm loader resolves the package root,
 * i.e. `dist/index.js` — without a `default` export carrying `{ id, setup }`
 * the loader ignores the package entirely (found by OLC-071 smoke test:
 * zero load attempts for 0.1.0). `OLC_VERSION` is only consumed inside
 * `plugin.ts` tool `execute` (deferred to call time), so this re-export
 * cycle is safe under ESM live bindings.
 */
export const OLC_VERSION = "0.3.0";
export { default } from "./plugin.js";
