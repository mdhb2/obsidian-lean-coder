/**
 * OLC OpenCode plugin entrypoint (OLC-011).
 *
 * Deliberately minimal: registers one read-only diagnostic tool
 * (`olc_status`) that reports the OLC package version and the detected
 * project location. No file writes happen at import or setup time —
 * acceptance criteria for OLC-011 requires no surprise writes on load.
 *
 * Uses `@opencode/plugin` (v2 promise API, matching the running
 * `opencode` CLI): `Plugin.define({ id, setup })` with
 * `ctx.tool.transform` for tool registration and `ctx.location`
 * for project context.
 */
import { Plugin } from "@opencode/plugin";
import { OLC_VERSION } from "./index.js";
import { registerOlcTools } from "./tools.js";

export default Plugin.define({
  id: "olc",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "olc",
        description: "Obsidian Lean Coder diagnostics",
      });
    });
    await registerOlcTools(ctx);
    await ctx.tool.transform((editor) => {
      editor.add({
        name: "status",
        description:
          "Report the OLC package version and the detected project location. Read-only, makes no writes.",
        input: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        options: { namespace: "olc" },
        execute: async () => {
          return {
            content: JSON.stringify(
              {
                olcVersion: OLC_VERSION,
                directory: ctx.location.directory,
                projectId: ctx.location.project.id,
                canonical: ctx.location.project.canonical,
              },
              null,
              2,
            ),
          };
        },
      });
    });
  },
});
