const NO_LOOSE_STRING_VALUES = {
  pathLink: "path-link",
  href: "href",
  dataFmarkPath: "data-fmark-path",
  title: "title",
} as const;

/* Post-render DOM walker that turns file-path-looking strings inside a
   rendered markdown subtree into clickable links. The walker writes
   plain `<a>` anchors (not React components) because the source HTML
   was injected via dangerouslySetInnerHTML — there's no React
   reconciler over this subtree. Click handling is wired up via event
   delegation on the parent element. */

/* Conservative path regex: must contain at least one `/` and end in an
   extension. Bounded by whitespace/punct so prose like "and/or" or
   "a / b" doesn't match. Captures the path with optional ./ or ../
   prefix and at least one /-separated segment before the file. */
const PATH_RX =
  /(?:^|[\s(\[`'"])((?:\.{0,2}\/)?(?:[\w.\-]+\/)+[\w.\-]+\.[a-zA-Z0-9]{1,8})(?=[\s)\]`'".,;:!?]|$)/g;

/* HTML tags whose text content is already part of a larger meaningful
   element (code blocks, links, scripts). Skipping them avoids
   double-linkifying and avoids breaking syntax-highlighted code. */
const SKIP_PARENT_TAGS = new Set([
  "A",
  "CODE",
  "PRE",
  "SCRIPT",
  "STYLE",
  "TEXTAREA",
]);

function hasSkippableAncestor(node: Node, until: Node): boolean {
  let cur: Node | null = node.parentNode;
  while (cur !== null && cur !== until) {
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const tag = (cur as Element).tagName;
      if (SKIP_PARENT_TAGS.has(tag)) return true;
    }
    cur = cur.parentNode;
  }
  return false;
}

function replaceTextNode(text: Text): void {
  const value = text.nodeValue ?? "";
  if (value.length < 5) return; /* too short to contain `a/b.c` */
  PATH_RX.lastIndex = 0;
  const matches: Array<{ start: number; end: number; path: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = PATH_RX.exec(value)) !== null) {
    const cap = m[1];
    if (cap === undefined) continue;
    const captureStart = m.index + m[0].indexOf(cap);
    matches.push({
      start: captureStart,
      end: captureStart + cap.length,
      path: cap,
    });
  }
  if (matches.length === 0) return;

  const doc = text.ownerDocument ?? document;
  const fragment = doc.createDocumentFragment();
  let cursor = 0;
  for (const { start, end, path } of matches) {
    if (start > cursor) {
      fragment.appendChild(doc.createTextNode(value.slice(cursor, start)));
    }
    const a = doc.createElement("a");
    a.className = NO_LOOSE_STRING_VALUES.pathLink;
    a.setAttribute(NO_LOOSE_STRING_VALUES.href, "#");
    a.setAttribute(NO_LOOSE_STRING_VALUES.dataFmarkPath, path);
    a.setAttribute(NO_LOOSE_STRING_VALUES.title, path);
    a.textContent = path;
    fragment.appendChild(a);
    cursor = end;
  }
  if (cursor < value.length) {
    fragment.appendChild(doc.createTextNode(value.slice(cursor)));
  }
  text.parentNode?.replaceChild(fragment, text);
}

export function linkifyPathsInElement(root: HTMLElement): void {
  /* Snapshot text nodes first so replacement doesn't disturb the walk. */
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const collected: Text[] = [];
  let n = walker.nextNode();
  while (n !== null) {
    const text = n as Text;
    if (!hasSkippableAncestor(text, root)) {
      collected.push(text);
    }
    n = walker.nextNode();
  }
  for (const t of collected) replaceTextNode(t);
}
