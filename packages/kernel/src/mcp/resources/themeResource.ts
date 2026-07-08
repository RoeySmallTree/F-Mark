import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  fmarkFetch,
  resolveFmarkMcpContext,
  type ResolveContextOptions,
} from "../context.js";
import { markdownContent } from "./content.js";

/**
 * `fmark://theme` — the active F-Mark theme as a markdown design document
 * (palette, tokens, radii, typography, component recipes). Theme state is
 * app-wide (not session- or path-scoped), so unlike the guide resource this
 * needs no session/agent querystring. The MCP server is a separate process
 * from the kernel, so it fetches `/theme` over HTTP to reflect the live
 * renderer-reported theme rather than building the doc locally.
 */
export function registerThemeResource(
  server: McpServer,
  options: ResolveContextOptions,
): void {
  server.registerResource(
    "fmark-theme",
    "fmark://theme",
    {
      title: "F-Mark Theme",
      description:
        "The active F-Mark theme as a design document (palette, tokens, radii, typography, component recipes) for on-brand HTML.",
      mimeType: "text/markdown",
    },
    async () => {
      const ctx = await resolveFmarkMcpContext(options);
      const doc = await fmarkFetch(ctx, "/theme");
      return markdownContent("fmark://theme", doc);
    },
  );
}
