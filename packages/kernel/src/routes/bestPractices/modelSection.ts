export function buildModelSection(): string {
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

`;
}
