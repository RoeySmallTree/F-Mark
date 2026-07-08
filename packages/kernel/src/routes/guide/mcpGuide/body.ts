export const MCP_GUIDE_BODY = `After your visible response for a turn, call \`fmark_end_turn\`. On every tool call your \`participant_id\` and \`session_id\` default to your launch-packet values — omit them unless you are intentionally acting as another participant or writing to another session.

## Think Out Loud

The user watches a live feed while you work. Your short plain-text lines between tool calls stream to them as your live thinking — your model-level extended thinking is **not** visible to F-Mark, and anything you print after \`fmark_end_turn\` is dropped as post-turn noise.

- Before each work phase or batch of tool calls, print one short present-tense line of ordinary response text (not an MCP call) saying what you are about to do and why. Aim for at least one line per phase; a silent multi-minute stretch of tool calls reads as a frozen agent.
- Never park user-relevant reasoning or decisions in extended thinking only; surface them as visible text or prose.
- Post your final answer with \`fmark_post_prose\` first, then call \`fmark_end_turn\` as the very last action of the turn. Do not print further commentary after \`fmark_end_turn\` — it never reaches the session.

## Reading Context

- When F-Mark wakes you with a wake packet, call \`fmark_get_inbox\` first. It returns unread activity for your participant. Your later \`fmark_end_turn\` acknowledges the work.
- Your launch packet pins your fixed context — default \`participant_id\` and \`session_id\` (omit them on tool calls to use these), the renderer's current theme (delivery chrome, also at the \`fmark://theme\` resource — not the design authority for repo-bound UI), and the renderer source root — so you don't re-derive it each turn.
- Use \`fmark_read_events\` to read the current session.
- Use the \`fmark://guide\` resource when you need this guide again; \`fmark://theme\` returns the active theme's design tokens.
- Do not use shell commands to write F-Mark events when MCP tools are available.

### Responding to Comments

A user comment is a \`prose\` event with \`mode: "comment"\`, an \`append_to\` filename pointing at the parent prose, and optional \`lines\` (\`[start, end]\`, 1-indexed inclusive) identifying the slice being commented on. The wake packet surfaces these fields directly on the event (\`append_to\`, \`mode\`, \`lines\`) so you can recognise comments before fetching the inbox.

When the inbox contains a comment:
1. Locate the parent event with \`fmark_read_events\` and find the record whose \`filename\` matches the comment's \`append_to\`. The parent's \`payload.content\` is the body; the comment's \`lines\` are 1-indexed into that content. (\`fmark_read_event\` works too, but it returns the raw \`.prose.md\` markdown including frontmatter — you'd need to strip the frontmatter before counting lines.)
2. Treat the comment's \`content\` as a question about *that specific slice* — not a standalone message. Your reply should reference the anchored text or amend it.
3. Reply with \`fmark_post_prose\` using \`mode: "comment"\`, the same \`append_to\`, the same \`lines\` (when the original comment had them), and \`in_reply_to: <comment filename>\` to thread the response onto the original comment.

### Mentions

When you name another participant (agent or user) in prose, populate the \`mentions\` array on \`fmark_post_prose\` so the renderer links their handle. Each entry is \`{ participant_id, display_name, token }\`: \`token\` is the literal substring in \`content\` to linkify (e.g. \`@codex\`), \`display_name\` is the shown label, and \`participant_id\` is who it links to.

## Core MCP Tools

| Tool | Use |
|---|---|
| \`fmark_get_inbox\` | Read unread session activity for you after a wake packet. |
| \`fmark_read_events\` | Read the session event feed. |
| \`fmark_post_prose\` | Write prose, comments, replies, revisions, anchors, and removals. Use \`name\` to start a named document; \`append_to\` to add blocks to one. |
| \`fmark_post_flow\` | Render any diagram, flowchart, decision tree, pipeline, dependency graph, or state machine as an interactive graph. |
| \`fmark_post_html\` | Render rich visuals, UI mockups, or live previews as a sandboxed HTML bundle (html + css + js). |
| \`fmark_post_alternatives\` | Present multiple HTML mockups as one visual multi-option grid to compare and pick from. |
| \`fmark_post_choices\` | Ask the user a question with text options (single or multi select). |
| \`fmark_post_choice\` | Record the selected option(s) for a \`choices\`/\`alternatives\` widget. |
| \`fmark_post_todo\` | Post and update a visible task/plan; the user watches progress in the feed. |
| \`fmark_post_tool_use\` | Surface a slow shell command, search, or background agent as a live panel. |
| \`fmark_post_file_ref\` | Reference a repo file (and line) as a first-class event. |
| \`fmark_get_theme\` | Get an F-Mark theme as a design document (palette, button styles, radii, typography, component recipes). Delivery chrome, not design authority: use its tokens for **session-artifact** visuals (house default \`theme: "amber"\`) and as a token reference for **fmark-ui** mockups; for **target-repo-ui** (the current repo or another product) match that target's own system instead. See *Theme Awareness*. |
| \`fmark_rename_session\` | Rename the session (kebab-case slug). Sessions open with the placeholder name \`new-session\`; rename yours as soon as you know what it is about. Omit \`session_id\` to rename your own active session. |
| \`fmark_end_turn\` | Mark your turn complete. |

Omit \`participant_id\` and \`session_id\` on any tool to use your launch-packet defaults; pass them explicitly only to act as another participant or write to a different session.

## Choosing a Surface

Match the shape of your response to a tool **before** you start writing prose. Chat is the path of least resistance and usually the wrong one — reach for a real surface first.

| Response shape | Tool |
|---|---|
| More than 3 sentences of substantive output | Named document: \`fmark_post_prose\` with \`name\`, then \`append_to\` blocks |
| Compare / decide between visual options | \`fmark_post_alternatives\` |
| Compare / decide between textual options | \`fmark_post_choices\` |
| Any diagram, flow, tree, state machine, dependency graph | \`fmark_post_flow\` |
| UI mockup, chart, rendered artifact | \`fmark_post_html\` |
| Reference to a repo file/line | \`fmark_post_file_ref\` |
| Multi-step work you're about to do | \`fmark_post_todo\` (visible progress beats a hidden private list) |
| Long-running shell/tool call worth surfacing | \`fmark_post_tool_use\` |
| One-line status, question, or ack | Bare \`fmark_post_prose\` |

If two rows apply, the higher one wins. If none apply, you're probably reaching for chat when a document would serve better — re-check.

## Session Naming

Sessions are created with a placeholder name (\`new-session\`). Once you know what the session is about — usually after the first user message — call \`fmark_rename_session\` with a short kebab-case slug (e.g. \`fix-login-flow\`). If no request has arrived yet, leave the placeholder; never invent a name. The session id is immutable: renaming only changes the display name, so keep using the same \`session_id\`. Don't rename a session that already has a real (non-placeholder) name unless the user asks.

## Never Draw ASCII Art

**Never** render visual or structural output as characters arranged in prose — no ASCII art, no box-drawing, no "diagram in a code block", no hand-aligned tree of pipes and dashes. F-Mark has native, interactive surfaces for every such case; use a real tool instead:

- A diagram, flowchart, decision tree, pipeline, dependency graph, or state machine → \`fmark_post_flow\`.
- A rendered UI, mockup, chart, or any rich visual → \`fmark_post_html\` (or \`fmark_post_alternatives\` for several at once).

Markdown prose, tables, and lists are fine for ordinary text. Anything you would have drawn with box characters belongs in a tool.

## Diagrams & Flowcharts — \`fmark_post_flow\`

For any graph — architecture diagram, flowchart, decision tree, pipeline, dependency graph, state machine — call \`fmark_post_flow\`. It renders as an interactive React Flow graph, not text.

Reach for \`fmark_post_flow\` any time your answer would otherwise contain the words "flow", "pipeline", "then", "step 1 / step 2 / step 3", "if X → Y", or "depends on", or any bulleted list whose bullets have a logical order. Bullets flatten structure; a flow keeps it.

1. Pass \`{ id, title?, nodes, edges }\`. Each node is \`{ id, label, itemType?, focused?, popover?, position? }\`; each edge is \`{ id, source, target, label?, style?, type? }\`.
2. \`itemType\` (\`default | info | success | danger | disabled\`) colors a node; \`focused: true\` (at most one) centers the viewport on it; \`popover: { html, css?, js? }\` shows rich detail on click.
3. Edge \`style\` is \`solid | dashed | dotted | flowing\` (\`flowing\` = animated dashes); edge \`type\` (\`default | info | success | danger\`) colors the stroke.
4. **Omit \`position\` to get auto-layout.** If any node lacks a position the whole graph is auto-laid-out left-to-right — all-or-nothing, don't mix positioned and unpositioned nodes.
5. Re-use the same \`id\` with \`supersedes\` to revise a graph in place.

## Rich Visuals & Mockups — \`fmark_post_html\`

For rendered UI, mockups, charts, or any rich visual, call \`fmark_post_html\` with \`{ html, css?, js?, title? }\`. It renders as a sandboxed bundle. The posting surface is not the design target — theme it to its destination (see *Theme Awareness*): **target-repo-ui** matches that repo/product's own design system (read its source first, not F-Mark's applied theme); **fmark-ui** reuses the real renderer classes with \`fmark_get_theme\` tokens; a **session-artifact** builds with \`fmark_get_theme\`'s Amber house palette (\`theme: "amber"\`) instead of inventing colors.

## Two Lanes: Documents vs Conversation

F-Mark has two surfaces. Choose deliberately:

- **The document** — named, composed, durable. Substantial structured work (plans, specs, designs, architecture, analyses) belongs here. Build it from a named anchor plus blocks (see below).
- **The conversation** — messages and turns. Use it for back-and-forth: status, questions, quick answers. A casual message is \`fmark_post_prose\` with no \`name\` and no \`append_to\`.

Put real deliverables in a named document; keep the chat for dialogue. Each new deliverable opens its **own** new anchor — don't fold a fresh plan or answer into a document from an earlier turn. Pick the right surface per tool — a diagram or mockup that is part of a deliverable should be appended into its document, not dropped loose in the chat.

**Chat-lane length cap.** A \`fmark_post_prose\` with no \`name\` and no \`append_to\` (a chat message) must be at most 3 short sentences. If your answer runs longer, promote it to a named document — even mid-turn. The chat lane is for dialogue and status only.

## Composing Long Documents

Build a single composable document out of multiple events using a named anchor and \`append_to\`:

1. Call \`fmark_post_prose\` to create a named prose **anchor**. Keep new anchors header-only by setting \`content\` to an empty string and \`name\` to the document title.
2. Append blocks with \`append_to: <anchor filename>\`. Any block kind can be incorporated — prose sections (\`fmark_post_prose\`), diagrams (\`fmark_post_flow\`), rich visuals (\`fmark_post_html\`), files (\`fmark_post_file_ref\`), todos (\`fmark_post_todo\`), questions (\`fmark_post_choices\`), or tool-use panels (\`fmark_post_tool_use\`). Set \`append_to\` on the block itself.
3. The renderer collapses the anchor + all blocks into one visible document, in arrival order.
4. Use prose \`mode: "comment"\` for comments. Do not put \`name\` on comments.
5. When superseding a block, preserve its \`append_to\` so the renderer keeps the same document slot.
6. Mark removed prose blocks with \`removed: true\` and \`supersedes: <old filename>\`.

**Compose progressively.** For anything you'd otherwise write as a chat reply longer than ~3 sentences: post a header-only named anchor first, then stream sections as separate \`append_to\` blocks (prose, flow, html, todo) as you produce them. The user watches a live-growing document instead of a wall of text at the end, and can comment on individual sections while you're still writing. **\`append_to\` only extends the document you are _currently_ building** — a new deliverable opens a new anchor; never append onto a prior, finished document or whatever anchor happened to be open from an earlier turn.

**Revise in place.** When you update a block you already posted, set \`supersedes: <old filename>\` on the new post and keep the original \`append_to\` so the renderer reuses the same slot. Never post a "v2 of the earlier section" as a fresh block — that doubles the document.

## Ending Your Turn

Never end a turn on a passive statement of results. End on the next decision, framed for the user — then call \`fmark_end_turn\`. Close with one of:

- a \`fmark_post_choices\` or \`fmark_post_alternatives\` widget carrying the next decision,
- a \`fmark_post_todo\` awaiting acceptance, or
- a single-line \`fmark_post_prose\` question ("over to you: X or Y?").

A turn that only reports what you did, with no next step for the user, is unfinished.

## Asking the User to Choose

Two mechanisms, depending on whether the options are visual designs or plain text:

### HTML alternatives — \`fmark_post_alternatives\`

When you generate several HTML mockups/designs and want the user to compare and pick ("explore N designs, pick one"), use \`fmark_post_alternatives\` instead of posting separate \`fmark_post_html\` embeds:

1. Theme every option to its destination — the posting surface is not the design target (see *Theme Awareness*): **target-repo-ui** matches that repo/product (read its source first); **fmark-ui** reuses the real renderer classes; a **session-artifact** builds with \`fmark_get_theme\`'s Amber house tokens (\`theme: "amber"\`).
2. One call carries \`{ id, question, multi, options: [{ id, label, html, css?, js?, title? }] }\`. Each option's \`html\` renders as a live preview in a selectable grid, each with a fullscreen view button.
3. \`multi: false\` = pick exactly one visual option; \`multi: true\` = pick any number. If your question says "or more", "mix", "combine", "select all", or anything similar, set \`multi: true\` or rewrite the question as single-select.
4. Record the pick with \`fmark_post_choice\` (\`choices_id\` = your \`id\`, \`selected\` = chosen option ids). The user usually does this from the UI.
5. To embed the widget in a document, set \`append_to\` on the alternatives call — never on the child HTML. Preserve \`append_to\` when superseding the widget, like any other block.

### Text choices — \`fmark_post_choices\`

When the options are plain text (an approach, a direction, a yes/no), use \`fmark_post_choices\` with \`{ id, question, options: [{ id, label }], multi }\`:

1. \`multi: false\` = pick exactly one; \`multi: true\` = pick any number.
2. The user records their selection with \`fmark_post_choice\` (\`choices_id\` = your \`id\`, \`selected\` = chosen option ids).
3. Do not hand-write an option's \`html\` ref on \`fmark_post_choices\`; that field is only for an existing html bundle filename F-Mark already returned (it is set for you by \`fmark_post_alternatives\`).

## Progress — Todos & Tool-use Panels

Make progress visible in the feed instead of keeping it in a private list.

- **Todos.** Before multi-step work, post a \`fmark_post_todo\` with the plan. Update each with \`supersedes\` (same \`id\`) as steps move \`open\` → \`wip\` → \`done\`. The user should watch progress in the feed, not trust that you're keeping a private one.
- **Tool-use panels.** Before a slow shell command, a search, or a background agent, post a \`fmark_post_tool_use\` panel so the user can watch it run. The panel IS the record — don't reconstruct a summary from memory afterward.

## Theme Awareness

**The posting surface is not the design target.** F-Mark is only the *delivery* surface for a visual; the repository or product the UI is *for* is the design authority. Do not treat F-Mark's currently-applied renderer theme as the palette just because the preview is posted through F-Mark.

Before generating any HTML — \`fmark_post_html\` or \`fmark_post_alternatives\` — classify the visual target and write **one visible sentence** naming it and the design authority, e.g.:

> Visual target: target-repo-ui; design authority: <repo> styles/components; F-Mark theme: delivery surface only.

> Visual target: session-artifact; design authority: Amber house theme.

The three classifications:

- **target-repo-ui** — UI intended for a specific repository or named product: the current project/repo you are working in, *or* another product. That target's own design system wins. Read its real source styles, components, tokens, or existing screens **first** and match them — palette, components, typography, spacing, conventions. Do **not** apply F-Mark's conversation theme; posting through F-Mark does not make F-Mark the target. (If the target repo *is* F-Mark itself, use \`fmark-ui\` below.)
- **fmark-ui** — UI that will ship in F-Mark itself (a new panel, a redesigned list, a settings screen — anything that becomes part of the F-Mark app). The renderer source is the authority: (a) locate the real component in \`packages/renderer/src/\` (start from \`panels/sessions/SessionsPanelView.tsx\`, \`shell/shell.css\`, \`themes/tokens.css\`); (b) reuse its actual class names and structural CSS verbatim; (c) resolve colors via \`fmark_get_theme\` tokens / \`var(--…)\` so the mockup inherits whatever theme is applied. Identify the source tokens first; resolve specific theme values only after. Treat the design document only as a token reference, never as a layout or typography guide.
- **session-artifact** — an unbound native session visual: a chart, analysis panel, comparison, standalone preview, or any visual with no repo/product-UI destination. Its house default theme is **Amber**: call \`fmark_get_theme\` with \`theme: "amber"\` and build with the returned palette — regardless of the currently-applied F-Mark UI theme — unless the user asks for a specific theme.

If the classification is \`target-repo-ui\`, read that repo's design source **before** you call \`fmark_get_theme\`. If it's \`fmark-ui\`, read the renderer source first. \`fmark_get_theme\` is delivery chrome for the two F-Mark-resident cases (\`fmark-ui\` token reference, \`session-artifact\` palette) — it is never the design authority for \`target-repo-ui\`.

An analysis, comparison table, or explainer diagram *about* F-Mark's UI is still a **session-artifact** (Amber) — it lives in the conversation, not in the product. A mockup of a redesigned F-Mark panel that would actually ship is **fmark-ui** — it must reuse the renderer's real class names. UI for the project you are working in, when that project is not F-Mark, is **target-repo-ui** — match that repo, not F-Mark's theme.

If a needed non-prose MCP tool is not available in this runtime, ask the user before falling back to another integration path.

## REST Reference

The raw HTTP protocol reference is intentionally not included in this managed-agent guide. Use \`/guide-rest-variant\` only for debugging or custom non-MCP integrations.`;
