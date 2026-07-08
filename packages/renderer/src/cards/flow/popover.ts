import type { FlowNodePopover } from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  htmlHead: "<html><head>",
  headBody: "</head><body>",
  bodyHtml: "</body></html>",
} as const;

// The iframe is sandboxed and isolated from the host page, so its baseline
// styles can't inherit from F-Mark's CSS variables. We hand-roll a tiny base
// so popovers without explicit css still look like F-Mark (light ink color,
// system font, 12px padding) — matching the Default theme. Models that want
// theme-aware popovers can override these in their own css block.
const BASE_STYLE = [
  "html,body{margin:0;padding:12px;font-family: system-ui,sans-serif;",
  "color: #1a1714;font-size:13px;line-height:1.5;}",
  "*{box-sizing:border-box;}",
].join("");

export function assemblePopoverSrcdoc(p: FlowNodePopover): string {
  const css =
    p.css !== undefined && p.css.length > 0 ? `<style>${p.css}</style>` : "";
  const js =
    p.js !== undefined && p.js.length > 0 ? `<script>${p.js}</script>` : "";
  return [
    "<!doctype html>",
    NO_LOOSE_STRING_VALUES.htmlHead,
    `<style>${BASE_STYLE}</style>`,
    css,
    NO_LOOSE_STRING_VALUES.headBody,
    p.html,
    js,
    NO_LOOSE_STRING_VALUES.bodyHtml,
  ].join("");
}
