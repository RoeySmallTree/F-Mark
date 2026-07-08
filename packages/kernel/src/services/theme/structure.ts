import type { ThemeTokens } from "@f-mark/shared";
import type { MarkdownDocument } from "./markdown.js";

export function addTypography(doc: MarkdownDocument, t: ThemeTokens): void {
  doc.line("## Typography");
  doc.line();
  doc.table(
    ["Role", "Font stack"],
    [
      ["Sans (UI / body)", `\`${t.sans}\``],
      ["Serif (headings / prose)", `\`${t.serif}\``],
      ["Mono (code / timestamps / badges)", `\`${t.mono}\``],
    ],
  );
  doc.line();
  doc.line("Type scale used across the app:");
  doc.line();
  doc.table(
    ["Element", "Size", "Weight"],
    [
      ["Card / prose title", "18px", "600 (serif)"],
      ["Body text", "14px", "400 (sans)"],
      ["Secondary / meta", "12.5px", "400"],
      ["Badge / timestamp", "10.5–11.5px", "400 (mono)"],
      ["Button label", "13px", "500"],
    ],
  );
  doc.line();
}

export function addBorderSystem(doc: MarkdownDocument, t: ThemeTokens): void {
  doc.line("## Border radii & borders");
  doc.line();
  doc.table(
    ["Token", "Value", "Use"],
    [
      [
        "`--radius`",
        `\`${t.radius}\``,
        "Default radius — inputs, buttons, small cards",
      ],
      [
        "`--radius-lg`",
        `\`${t["radius-lg"]}\``,
        "Large radius — cards, modals",
      ],
      [
        "`--radius-pill`",
        `\`${t["radius-pill"]}\``,
        "Pills — badges, chips",
      ],
      ["`--border-w`", `\`${t["border-w"]}\``, "Default border width"],
    ],
  );
  doc.line();
  doc.table(
    ["Token", "Value"],
    [
      ["`--shadow` (resting)", `\`${t.shadow}\``],
      ["`--shadow-2` (raised)", `\`${t["shadow-2"]}\``],
    ],
  );
  doc.line();
}
