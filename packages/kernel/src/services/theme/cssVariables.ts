import type { ThemeTokens } from "@f-mark/shared";
import type { MarkdownDocument } from "./markdown.js";

export function addCssVariables(doc: MarkdownDocument, t: ThemeTokens): void {
  doc.line("## Drop-in CSS variables");
  doc.line();
  doc.line(
    "Prefer tokens over hard-coded hex in anything non-trivial. Paste this `:root` block and reference the variables:",
  );
  doc.line();
  doc.codeFence(
    "css",
    [
      ":root {",
      `  --bg: ${t.bg};`,
      `  --canvas: ${t.canvas};`,
      `  --panel: ${t.panel};`,
      `  --ink: ${t.ink};`,
      `  --ink-2: ${t["ink-2"]};`,
      `  --ink-3: ${t["ink-3"]};`,
      `  --ink-4: ${t["ink-4"]};`,
      `  --line: ${t.line};`,
      `  --line-2: ${t["line-2"]};`,
      `  --user: ${t.user};`,
      `  --agent: ${t.agent};`,
      `  --green: ${t.green};`,
      `  --rose: ${t.rose};`,
      `  --sans: ${t.sans};`,
      `  --serif: ${t.serif};`,
      `  --mono: ${t.mono};`,
      `  --radius: ${t.radius};`,
      `  --radius-lg: ${t["radius-lg"]};`,
      `  --radius-pill: ${t["radius-pill"]};`,
      `  --shadow: ${t.shadow};`,
      "}",
    ].join("\n"),
  );
  doc.line();
}
