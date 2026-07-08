function buildAnchorStep(): string {
  return `### Step 1 — POST the anchor

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

`;
}

function buildIntroBlockStep(): string {
  return `### Step 2 — Append an intro prose block

\`\`\`bash
POST /sessions/<sid>/events/prose
{
  "participant_id": "ag-claude",
  "append_to": "20260524T140000Z_ag-claude.prose.md",
  "content": "## The use-line thesis\\n\\nA collaboration session is a folder of timestamped, append-only event files…"
}
\`\`\`

`;
}

function buildFlowChartStep(): string {
  return `### Step 3 — Append a flow chart

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

`;
}

function buildNamedSubsectionStep(): string {
  return `### Step 4 — Append a named sub-section

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

`;
}

export function buildCanonicalRecipeSection(): string {
  return `## Canonical four-event recipe

The minimum useful document is an **anchor + at least one block**. Here is a
four-event document that interleaves prose and a flow chart.

${buildAnchorStep()}${buildIntroBlockStep()}${buildFlowChartStep()}${buildNamedSubsectionStep()}`;
}
