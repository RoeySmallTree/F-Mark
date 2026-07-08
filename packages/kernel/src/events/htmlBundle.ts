export interface HtmlBundleAssets {
  css?: string;
  js?: string;
}

function escapeStyleRawText(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

function escapeScriptRawText(js: string): string {
  return js.replace(/<\/script/gi, "<\\/script");
}

function removeCompanionAssetTags(html: string, assets: HtmlBundleAssets): string {
  let next = html;
  if (typeof assets.css === "string" && assets.css.length > 0) {
    next = next.replace(
      /<link\b(?=[^>]*\bhref=(["'])(?:\.\/)?style\.css(?:\?[^"']*)?\1)[^>]*>/gi,
      "",
    );
  }
  if (typeof assets.js === "string" && assets.js.length > 0) {
    next = next.replace(
      /<script\b(?=[^>]*\bsrc=(["'])(?:\.\/)?script\.js(?:\?[^"']*)?\1)[^>]*>\s*<\/script>/gi,
      "",
    );
  }
  return next;
}

function headTags(assets: HtmlBundleAssets): string[] {
  const tags: string[] = [];
  if (typeof assets.css === "string" && assets.css.length > 0) {
    tags.push(
      `<style data-fmark-bundle="style.css">\n${escapeStyleRawText(assets.css)}\n</style>`,
    );
  }
  return tags;
}

function bodyEndTags(assets: HtmlBundleAssets): string[] {
  const tags: string[] = [];
  if (typeof assets.js === "string" && assets.js.length > 0) {
    tags.push(
      `<script data-fmark-bundle="script.js">\n${escapeScriptRawText(assets.js)}\n</script>`,
    );
  }
  return tags;
}

function hasDocumentShell(html: string): boolean {
  return /<!doctype\s+html\b/i.test(html) ||
    /<html(?:\s|>)/i.test(html) ||
    /<head(?:\s|>)/i.test(html) ||
    /<body(?:\s|>)/i.test(html);
}

function injectHeadTags(html: string, tags: string[]): string {
  if (tags.length === 0) return html;
  const tagBlock = `${tags.map((tag) => `  ${tag}`).join("\n")}\n`;

  if (/<\/head\s*>/i.test(html)) {
    return html.replace(/<\/head\s*>/i, `${tagBlock}</head>`);
  }
  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(
      /<head(?:\s[^>]*)?>/i,
      (match) => `${match}\n${tagBlock}`,
    );
  }
  if (/<html(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(
      /<html(?:\s[^>]*)?>/i,
      (match) => `${match}\n<head>\n${tagBlock}</head>`,
    );
  }
  if (/<body(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(
      /<body(?:\s[^>]*)?>/i,
      (match) => `<head>\n${tagBlock}</head>\n${match}`,
    );
  }
  return wrapHtmlFragment(html, tags);
}

function injectBodyEndTags(html: string, tags: string[]): string {
  if (tags.length === 0) return html;
  const tagBlock = `\n${tags.map((tag) => `  ${tag}`).join("\n")}\n`;

  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${tagBlock}</body>`);
  }
  if (/<\/html\s*>/i.test(html)) {
    return html.replace(/<\/html\s*>/i, `<body>${tagBlock}</body>\n</html>`);
  }
  return `${html}${tagBlock}`;
}

function wrapHtmlFragment(
  html: string,
  head: string[],
  bodyEnd: string[] = [],
): string {
  const headBlock = head.length > 0
    ? `\n${head.map((tag) => `  ${tag}`).join("\n")}`
    : "";
  const bodyEndBlock = bodyEnd.length > 0
    ? `\n${bodyEnd.map((tag) => `  ${tag}`).join("\n")}`
    : "";
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `${headBlock}</head>`,
    "<body>",
    html,
    bodyEndBlock,
    "</body>",
    "</html>",
  ].join("\n");
}

export function assembleHtmlBundleIndex(
  html: string,
  assets: HtmlBundleAssets,
): string {
  const nextHtml = removeCompanionAssetTags(html, assets);
  const head = headTags(assets);
  const bodyEnd = bodyEndTags(assets);
  if (hasDocumentShell(nextHtml)) {
    return injectBodyEndTags(injectHeadTags(nextHtml, head), bodyEnd);
  }
  return wrapHtmlFragment(nextHtml, head, bodyEnd);
}
