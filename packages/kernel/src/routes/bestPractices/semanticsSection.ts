function buildStreamOrderSection(): string {
  return `## Stream order guarantee

Blocks render in the order their events were written. Filenames embed the
timestamp; the renderer sorts by \`timestamp || filename\` so simultaneous
writes from different participants order deterministically.

Build your document top-to-bottom: anchor → block → block → … and the
visible result matches the author's intent.

`;
}

function buildCommonMistakesSection(): string {
  return `## Common mistakes

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

`;
}

function buildOrphanedBlockSection(): string {
  return `## What if my block points at a non-existent anchor?

The renderer **does not** drop your block. It renders as a top-level card
with an "orphaned embed" badge. The block re-binds automatically once the
anchor exists (e.g. if the writes raced).

`;
}

function buildAnchorSupersessionSection(): string {
  return `## Anchor supersession

If the anchor itself is superseded, the renderer walks the supersession
chain and reassigns blocks to the live anchor. Forks (two events
superseding the same anchor) are resolved deterministically — the
lexicographically-smallest filename wins. The other branch renders as an
orphan.

Best practice: **don't supersede an anchor unless you have to**. Supersede
individual blocks instead.

`;
}

function buildUsageChoiceSection(): string {
  return `## When to use a single message vs an anchor doc

Use a regular unnamed prose event (a "message") for back-and-forth chat,
acknowledgements, and short replies. Use a named anchor + blocks for
durable contributions — design docs, runbooks, post-mortems, plans, code
reviews — anything you'd want to scroll back to later or comment on.
`;
}

export function buildSemanticsSection(): string {
  return `${buildStreamOrderSection()}${buildCommonMistakesSection()}${buildOrphanedBlockSection()}${buildAnchorSupersessionSection()}${buildUsageChoiceSection()}`;
}
