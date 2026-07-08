import {
  fmarkFetch,
  resolveFmarkMcpContext,
} from "../../context.js";
import { optionalRef } from "../schemas.js";
import { readOnlyToolAnnotations, textResult } from "../shared.js";
import type { ResourceToolRegistration } from "./types.js";

export function registerThemeResourceTool({
  server,
  options,
}: ResourceToolRegistration): void {
  server.registerTool(
    "fmark_get_theme",
    {
      title: "Get F-Mark Theme",
      description:
        "Get an F-Mark theme as a design document (palette, buttons, radii, typography, component recipes) for on-brand HTML. F-Mark is a delivery surface, not the design authority: this doc serves two of the three visual targets — session-artifact visuals (charts, analyses, previews; house default theme Amber — pass theme:\"amber\") and fmark-ui mockups of F-Mark's OWN product UI (reuse the real renderer class names and structural CSS from packages/renderer/src for layout and treat this document as a token reference only, never a layout or typography guide). For target-repo-ui — UI meant to ship in a specific repo or another product — match that target system's own design language instead of F-Mark's theme. Pass `theme` or `font` to document a specific F-Mark appearance instead of the active one; the active appearance is also on your launch packet and at the fmark://theme resource.",
      inputSchema: {
        theme: optionalRef(),
        font: optionalRef(),
      },
      annotations: readOnlyToolAnnotations,
    },
    async ({ theme, font }) => {
      const ctx = await resolveFmarkMcpContext(options);
      const params = new URLSearchParams();
      if (theme !== undefined) params.set("theme", theme);
      if (font !== undefined) params.set("font", font);
      const qs = params.size > 0 ? `?${params.toString()}` : "";
      return textResult(await fmarkFetch(ctx, `/theme${qs}`));
    },
  );
}
