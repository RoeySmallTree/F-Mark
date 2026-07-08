import type { ThemeTokens } from "@f-mark/shared";
import type { MarkdownDocument } from "./markdown.js";

export function addComponentRecipes(
  doc: MarkdownDocument,
  t: ThemeTokens,
): void {
  doc.line("## Component recipes");
  doc.line();
  addCardRecipe(doc, t);
  addInputRecipe(doc, t);
  addBadgeRecipe(doc, t);
  addLinkRecipe(doc, t);
}

function addCardRecipe(doc: MarkdownDocument, t: ThemeTokens): void {
  doc.line("### Card");
  doc.line(
    `Surface \`${t.canvas}\`, \`${t["border-w"]} solid ${t["line-2"]}\` border, \`--radius-lg\` (\`${t["radius-lg"]}\`) corners, resting shadow. Title in serif, body in sans.`,
  );
  doc.codeFence(
    "html",
    [
      `<div style="background:${t.canvas};border:${t["border-w"]} solid ${t["line-2"]};border-radius:${t["radius-lg"]};box-shadow:${t.shadow};padding:16px;font-family:${t.sans};color:${t.ink}">`,
      `  <div style="font:600 18px ${t.serif};color:${t.ink};margin-bottom:6px">Card title</div>`,
      `  <div style="font-size:14px;color:${t["ink-2"]};line-height:1.55">Body copy sits in the sans stack at the secondary ink level.</div>`,
      `</div>`,
    ].join("\n"),
  );
  doc.line();
}

function addInputRecipe(doc: MarkdownDocument, t: ThemeTokens): void {
  doc.line("### Input");
  doc.line(
    `Fill \`${t.bg}\`, \`${t["border-w"]} solid ${t.line}\` border, \`--radius\` (\`${t.radius}\`) corners. On focus the border deepens to \`${t["ink-4"]}\` with a soft 3px ring.`,
  );
  doc.codeFence(
    "html",
    `<input placeholder="Type here…" style="background:${t.bg};border:${t["border-w"]} solid ${t.line};border-radius:${t.radius};padding:8px 12px;font-size:14px;color:${t.ink};font-family:${t.sans}" />`,
  );
  doc.line();
}

function addBadgeRecipe(doc: MarkdownDocument, t: ThemeTokens): void {
  doc.line("### Badge");
  doc.line(
    `Pill on the agent accent: \`${t.agent}\` text on \`${t["agent-tint"]}\` fill, mono, 10.5px, \`--radius-pill\`.`,
  );
  doc.codeFence(
    "html",
    `<span style="display:inline-block;color:${t.agent};background:${t["agent-tint"]};font:10.5px ${t.mono};padding:2px 8px;border-radius:${t["radius-pill"]}">agent</span>`,
  );
  doc.line();
}

function addLinkRecipe(doc: MarkdownDocument, t: ThemeTokens): void {
  doc.line("### Link");
  doc.line(
    `Accent-colored (\`${t.user}\`) with a soft underline in \`${t["user-tint-2"]}\` that lifts to the full accent on hover.`,
  );
  doc.codeFence(
    "css",
    [
      `a {`,
      `  color: ${t.user};`,
      `  text-decoration: underline;`,
      `  text-decoration-color: ${t["user-tint-2"]};`,
      `  text-underline-offset: 2px;`,
      `}`,
      `a:hover { text-decoration-color: ${t.user}; }`,
    ].join("\n"),
  );
  doc.line();
}
