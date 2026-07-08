function buildCommentPattern(): string {
  return `### Comment on a block

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

`;
}

function buildSupersessionPattern(): string {
  return `### Block supersession (edit in place)

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

`;
}

function buildTombstonePattern(): string {
  return `### Remove a block (tombstone)

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

`;
}

function buildFileEmbedPattern(): string {
  return `### Image / file embed inside a doc

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

`;
}

export function buildPatternsSection(): string {
  return `## Patterns

${buildCommentPattern()}${buildSupersessionPattern()}${buildTombstonePattern()}${buildFileEmbedPattern()}`;
}
