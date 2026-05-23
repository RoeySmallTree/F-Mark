import type { FastifyInstance } from "fastify";

/* Long-form composable-prose authoring guide returned at /best-practices.
   Linked from /guide. Audience: an LLM building a document via the
   composable-prose block-composition model. */

function buildBestPractices(): string {
  return `# F-Mark — Composing documents (best practices)

This is the long-form companion to the short \`/guide\` recipe. Read it once
before authoring any long-form document.

## The block-composition model

A document in F-Mark is **one named prose anchor** plus a series of **blocks**
that point at the anchor via \`append_to: <anchor filename>\`. The renderer
collapses every block back into a single visible ProseCard, in event-arrival
order, with the anchor's name as the title.

A block can be any of:

- \`prose\` — a markdown section. Optionally carries its own \`name\` for a
  sub-section header.
- \`flow\` — a flow chart, diagram, or pipeline.
- \`file\` — a file/image embed.
- \`html\` — an interactive HTML widget.
- \`choices\` — a user-facing decision panel.
- \`todo\` — a todo card.
- \`tool-use\` — a tool-use panel.

Anything that supports \`append_to\` can be a block. The list will grow.

## Canonical four-event recipe

The minimum useful document is an **anchor + at least one block**. Here is a
four-event document that interleaves prose and a flow chart.

### Step 1 — POST the anchor

The anchor is **header-only**: it has \`name\`, no markdown content.

\`\`\`bash
POST /sessions/<sid>/events/prose
{
  "participant_id": "ag-claude",
  "name": "Architecture overview",
  "content": ""
}
\`\`\`

The response returns the anchor's \`filename\`. Capture it; every block points
at it.

### Step 2 — Append an intro prose block

\`\`\`bash
POST /sessions/<sid>/events/prose
{
  "participant_id": "ag-claude",
  "append_to": "20260524T140000Z_ag-claude.prose.md",
  "content": "## The use-line thesis\\n\\nA collaboration session is a folder of timestamped, append-only event files…"
}
\`\`\`

### Step 3 — Append a flow chart

\`\`\`bash
POST /sessions/<sid>/events/flow
{
  "participant_id": "ag-claude",
  "id": "fl_pipeline",
  "title": "Event flow",
  "append_to": "20260524T140000Z_ag-claude.prose.md",
  "nodes": [
    { "id": "n1", "label": "Author" },
    { "id": "n2", "label": "Kernel" },
    { "id": "n3", "label": "Renderer" }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "style": "solid" },
    { "id": "e2", "source": "n2", "target": "n3", "style": "flowing" }
  ]
}
\`\`\`

### Step 4 — Append a named sub-section

\`\`\`bash
POST /sessions/<sid>/events/prose
{
  "participant_id": "ag-claude",
  "name": "Data flow",
  "append_to": "20260524T140000Z_ag-claude.prose.md",
  "content": "After the kernel writes the event, the renderer reads it back…"
}
\`\`\`

The \`name\` on a block becomes a sub-section header inside the doc and the
fold label in accordion view. Anchors and sub-blocks both use \`name\`; only
anchors appear in the global Named rail.

## Patterns

### Comment on a block

A comment is a prose event with \`mode: "comment"\` (and optionally \`lines\`
for a line-range comment on a prose-text target).

\`\`\`bash
POST /sessions/<sid>/events/prose
{
  "participant_id": "us-roey",
  "append_to": "20260524T140005Z_ag-claude.prose.md",
  "mode": "comment",
  "lines": [3, 5],
  "content": "Tighten this paragraph."
}
\`\`\`

For non-prose targets (flow chart, file, html), use card-level comments —
\`mode: "comment"\` without \`lines\`.

### Block supersession (edit in place)

A block can supersede another block; the supersedor **must preserve** its
\`append_to\` so the renderer keeps the original slot. The supersedor's
content replaces the predecessor's content; the supersedor's timestamp is
ignored for ordering (the renderer sorts by the *root* block's timestamp).

\`\`\`bash
POST /sessions/<sid>/events/prose
{
  "participant_id": "ag-claude",
  "append_to": "20260524T140000Z_ag-claude.prose.md",
  "supersedes": "20260524T140005Z_ag-claude.prose.md",
  "content": "## The use-line thesis (revised)\\n\\nA collaboration session is…"
}
\`\`\`

### Remove a block (tombstone)

To delete a block, write a prose event with \`removed: true\` and
\`supersedes: <block filename>\`. The block kind doesn't matter — a prose
tombstone marks the chain dead regardless. Empty content alone is NOT
removal — a deliberately-empty prose block stays visible.

\`\`\`bash
POST /sessions/<sid>/events/prose
{
  "participant_id": "ag-claude",
  "append_to": "20260524T140000Z_ag-claude.prose.md",
  "supersedes": "20260524T140007Z_ag-claude.flow.json",
  "removed": true,
  "content": ""
}
\`\`\`

### Image / file embed inside a doc

\`\`\`bash
POST /sessions/<sid>/events/file
{
  "participant_id": "ag-claude",
  "append_to": "20260524T140000Z_ag-claude.prose.md",
  "id": "diagram-v2",
  "path": "diagram-v2.png",
  "mime_type": "image/png",
  "description": "Annotated event flow"
}
\`\`\`

## Stream order guarantee

Blocks render in the order their events were written. Filenames embed the
timestamp; the renderer sorts by \`timestamp || filename\` so simultaneous
writes from different participants order deterministically.

Build your document top-to-bottom: anchor → block → block → … and the
visible result matches the author's intent.

## Common mistakes

These all 400 at the kernel:

- \`mode\` set without \`append_to\` — \`mode\` only makes sense on a block.
- \`lines\` set without \`mode: "comment"\` — \`lines\` is comment-only.
- \`mode: "comment"\` with \`name\` — comments can't have sub-section names.
- \`removed: true\` with non-empty content — tombstones are pure markers.
- Body containing BOTH legacy \`target\` and any new field — pick one shape.
- \`append_to: ""\` (empty string) — must be a real filename or absent.
- Setting \`mode\`, \`lines\`, or \`target\` on a non-prose body — those fields
  are prose-only.
- Setting \`append_to\` on \`turn-end\` or \`choice\` — those kinds can't be
  embedded.

## What if my block points at a non-existent anchor?

The renderer **does not** drop your block. It renders as a top-level card
with an "orphaned embed" badge. The block re-binds automatically once the
anchor exists (e.g. if the writes raced).

## Anchor supersession

If the anchor itself is superseded, the renderer walks the supersession
chain and reassigns blocks to the live anchor. Forks (two events
superseding the same anchor) are resolved deterministically — the
lexicographically-smallest filename wins. The other branch renders as an
orphan.

Best practice: **don't supersede an anchor unless you have to**. Supersede
individual blocks instead.

## When to use a single message vs an anchor doc

Use a regular unnamed prose event (a "message") for back-and-forth chat,
acknowledgements, and short replies. Use a named anchor + blocks for
durable contributions — design docs, runbooks, post-mortems, plans, code
reviews — anything you'd want to scroll back to later or comment on.
`;
}

export function registerBestPracticesRoute(app: FastifyInstance): void {
  app.get("/best-practices", async (_req, reply) => {
    reply.type("text/markdown; charset=utf-8");
    return buildBestPractices();
  });
}
