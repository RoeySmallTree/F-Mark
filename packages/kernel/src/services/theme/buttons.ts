import type { ThemeTokens } from "@f-mark/shared";
import type { MarkdownDocument } from "./markdown.js";

export function addPrimaryButton(doc: MarkdownDocument, t: ThemeTokens): void {
  doc.line("## Primary button");
  doc.line();
  doc.line(
    `Solid, ink-on-canvas. Border radius \`${t.radius}\`, 7×14px padding, 13px/500 sans label. Hover darkens slightly.`,
  );
  doc.line();
  doc.codeFence(
    "html",
    `<button style="background:${t.ink};color:${t.canvas};border:0;border-radius:${t.radius};padding:7px 14px;font:500 13px ${t.sans};cursor:pointer">Primary action</button>`,
  );
  doc.line();
}

export function addSecondaryButton(doc: MarkdownDocument, t: ThemeTokens): void {
  doc.line("## Secondary button");
  doc.line();
  doc.line(
    `Ghost / outlined: transparent fill, \`${t["ink-2"]}\` label, \`${t["border-w"]} solid ${t.line}\` border. Hover fills with \`${t.bg}\` and deepens the label to \`${t.ink}\`.`,
  );
  doc.line();
  doc.codeFence(
    "html",
    `<button style="background:transparent;color:${t["ink-2"]};border:${t["border-w"]} solid ${t.line};border-radius:${t.radius};padding:7px 14px;font:13px ${t.sans};cursor:pointer">Secondary action</button>`,
  );
  doc.line();
}
