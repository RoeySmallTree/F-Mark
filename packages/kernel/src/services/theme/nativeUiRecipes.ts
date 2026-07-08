import type { ThemeTokens } from "@f-mark/shared";
import type { MarkdownDocument } from "./markdown.js";

/**
 * Recipes for mocking up F-Mark's OWN product UI — a new panel, a redesigned
 * list, a settings screen. Unlike the generic component recipes (card / input /
 * badge / link), which are self-contained prose/document surfaces, a
 * product-UI mockup must mirror the REAL renderer structure: reuse the live
 * class names and copy their structural CSS from `packages/renderer/src`
 * rather than inventing a card layout. This document is a token reference for
 * such a mockup, never a layout or typography guide.
 */
export function addNativeUiRecipes(doc: MarkdownDocument, t: ThemeTokens): void {
  doc.line("## F-Mark native UI recipes");
  doc.line();
  doc.line(
    `Use these **only** when mocking up a change to F-Mark's own product UI (a new panel, a redesigned list, a settings screen — anything that would ship in the F-Mark app). Locate the real component under \`packages/renderer/src/\` (start from \`panels/sessions/SessionsPanelView.tsx\`, \`shell/shell.css\`, \`themes/tokens.css\`), reuse its class names and structural CSS verbatim, and resolve tokens against the active theme/font documented above. Treat this document as a token reference only — never as a layout or typography guide. (An analysis, comparison table, or explainer diagram *about* F-Mark's UI is still a native session artifact; use the component recipes above for those.)`,
  );
  doc.line();
  doc.line("### Left session panel");
  doc.line(
    `The left session panel is \`.left-panel\` → \`.panel-head\` → \`.panel-search\` → \`.panel-list\` → \`<details class="repo-session-group">\`. Titles are \`--mono\` 11.5px on \`--panel\` (\`${t.panel}\`), not serif on \`--canvas\`. Counts are \`.repo-session-count\` pills (5px radius), not agent-tinted badges. Extend this structure; do not invent card layouts.`,
  );
  doc.line();
  doc.line("### Panels are not documents");
  doc.line(
    `Panels use the \`--panel\` background (\`${t.panel}\`) and \`--mono\` type (\`${t.mono}\`). Serif type and \`--canvas\` surfaces (\`${t.canvas}\`) are prose/document language and must not appear inside \`.left-panel\` or \`.right-panel\` mockups.`,
  );
  doc.line();
}
