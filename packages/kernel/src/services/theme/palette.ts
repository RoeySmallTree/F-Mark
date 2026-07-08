import type { ThemeTokens } from "@f-mark/shared";
import type { MarkdownDocument } from "./markdown.js";

interface PaletteRow {
  token: string;
  value: string;
  role: string;
}

export function addColorPalette(
  doc: MarkdownDocument,
  t: ThemeTokens,
): void {
  doc.line("## Color palette");
  doc.line();
  doc.table(
    ["Token", "Value", "Role"],
    paletteRows(t).map((r) => [`\`${r.token}\``, `\`${r.value}\``, r.role]),
  );
  doc.line();
  doc.line(
    `**At a glance:** background \`${t.canvas}\`, text \`${t.ink}\`, primary accent \`${t.agent}\` (agent / brand), secondary accent \`${t.user}\` (user), borders \`${t.line}\`. The accent token is \`--agent\` — there is no \`--accent\`.`,
  );
  doc.line();
}

function paletteRows(t: ThemeTokens): PaletteRow[] {
  return [
    { token: "--bg", value: t.bg, role: "Outer chrome / app background" },
    { token: "--canvas", value: t.canvas, role: "Feed canvas / card surface" },
    { token: "--panel", value: t.panel, role: "Side panels" },
    { token: "--panel-2", value: t["panel-2"], role: "Panel hover surface" },
    { token: "--ink", value: t.ink, role: "Primary text" },
    { token: "--ink-2", value: t["ink-2"], role: "Secondary text" },
    { token: "--ink-3", value: t["ink-3"], role: "Tertiary / muted text" },
    { token: "--ink-4", value: t["ink-4"], role: "Faint text / placeholders" },
    { token: "--line", value: t.line, role: "Primary borders" },
    { token: "--line-2", value: t["line-2"], role: "Subtle borders" },
    { token: "--line-3", value: t["line-3"], role: "Faintest dividers" },
    { token: "--user", value: t.user, role: "User accent" },
    { token: "--user-tint", value: t["user-tint"], role: "User accent wash" },
    {
      token: "--user-tint-2",
      value: t["user-tint-2"],
      role: "User accent wash (stronger)",
    },
    {
      token: "--agent",
      value: t.agent,
      role: "Agent accent (de-facto brand accent)",
    },
    { token: "--agent-tint", value: t["agent-tint"], role: "Agent accent wash" },
    {
      token: "--agent-tint-2",
      value: t["agent-tint-2"],
      role: "Agent accent wash (stronger)",
    },
    { token: "--green", value: t.green, role: "Success / positive" },
    { token: "--green-tint", value: t["green-tint"], role: "Success wash" },
    { token: "--rose", value: t.rose, role: "Error / destructive" },
  ];
}
