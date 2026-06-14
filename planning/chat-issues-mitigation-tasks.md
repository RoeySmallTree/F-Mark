# Chat issues mitigation task accumulator

Status: implementation authorized by the user on 2026-06-09. Use this document as the issue ledger and dispatch guide for the subagent pass.

This file accumulates the current chat/session issues as dispatchable tasks. The mitigation notes are intentionally broad: they define ownership, likely fix direction, and verification shape without prescribing final code before the agent pass.

## Operating constraints

- Keep this as a coordination document and implementation checklist now that launch is authorized.
- Launch separate subagents with disjoint ownership and integrate their patches deliberately.
- Have each subagent verify the current tree before editing. Several related planning files already exist, and this worktree has many active changes.
- Prefer narrow fixes at the real state owner: kernel event extraction, MCP install, hook install, or renderer compose behavior, depending on the bug.
- Require a focused hot or unit test per task, plus one cross-cutting smoke pass after the tasks compose.

## Task 1: Preserve comment context when waking agents

Problem:
When a user comments on prose lines, the agent wake packet can lose the fact that the message is a line-anchored comment. If the packet only includes a short summary, the agent cannot reliably infer the parent prose, line range, or expected reply threading.

Broad mitigation:
- Carry the prose anchor through the packet contract: parent event id, comment mode, and line tuple when available.
- Keep packets compact. Do not embed full parent prose in the wake payload; guide the agent to dereference the parent when needed.
- Update agent guidance so comments are treated as anchored questions about a prose slice, not generic inbox messages.

Likely owners:
- Shared event/packet types.
- Kernel compass packet construction.
- Kernel guide route.

Verification shape:
- Unit tests for anchored and non-anchored prose packet projection.
- Guard tests for malformed line ranges and null payloads.
- Guide test proving the agent instruction names the dereference flow and reply threading.

## Task 2: Render meaningful access request bodies for MCP tools

Problem:
Permission/access request cards can render with only title and metadata when the tool input does not expose the expected `command` or `description` field. F-Mark MCP tools often use fields like `content`, `title`, `question`, `html`, or `path`.

Broad mitigation:
- Fix extraction at the kernel hook layer rather than special-casing renderer display.
- Preserve command/description as first-class sources, then fall back through known MCP payload fields.
- Use a bounded JSON preview when no known field is available, so the card is never silently empty for structured inputs.

Likely owners:
- Kernel auto-stream access request extraction.
- Renderer card tests only if behavior coverage is missing.

Verification shape:
- Pure extractor tests for representative F-Mark MCP shapes.
- Renderer tests for command, message, and no-body branches.
- A non-F-Mark MCP access request case to ensure the fallback remains generic.

## Task 3: Silence F-Mark MCP permission prompts in Claude installs

Problem:
Claude-managed agents can prompt for every `mcp__fmark__*` tool if install only writes the MCP server config and does not add matching `permissions.allow` entries. This blocks smooth agent work and interacts badly with hook timing.

Broad mitigation:
- Keep the canonical F-Mark MCP tool list beside tool registration.
- Derive exact Claude allow-list entries from that list and merge them idempotently into the correct Claude settings file for the selected scope.
- Detect stale installs when the MCP server exists but the allow list is incomplete.
- Treat malformed settings files as blocked rather than partially mutating configuration.

Likely owners:
- Kernel MCP tool registration metadata.
- Kernel Claude MCP install/detect path.
- MCP install tests.

Verification shape:
- Sync test between registered tools and exported allow-list names.
- Apply/detect tests for project, local, and user scope.
- Idempotency and malformed JSON preflight tests.
- Manual smoke: Apply-and-Launch Claude, then confirm no prompts for F-Mark MCP tools.

## Task 4: Wake agents only on turn-end or deliberate mention

Problem:
Compose can wake an agent on every send even when the user is still drafting a multi-message turn. That creates premature responses based on partial context.

Broad mitigation:
- In message mode, wake selected mentions immediately because they are deliberate pages.
- For non-mentioned sends, wake only when the send also ends the turn.
- Make the empty-draft End Turn action wake after a real turn-end is posted.
- Avoid changing comment wake behavior; comment wakes are separately anchored and intentional.

Likely owners:
- Renderer compose submit/end-turn flow.
- Compose tests.

Verification shape:
- Send with no mentions and `messageEndsTurn=false` does not wake.
- Send with mention wakes the selected agent.
- Send with `messageEndsTurn=true` wakes once.
- Empty End Turn button and shortcut both wake once only after turn-end succeeds.

## Task 5: Stream live tool-use events and dedupe final transcript projection

Problem:
Tool calls may only appear after the agent turn ends, leaving the chat feed blind while the agent is actively working. Adding live hook capture can create duplicates unless Stop-time transcript projection is deduped.

Broad mitigation:
- Install Claude `PostToolUse` hooks alongside Stop and PermissionRequest hooks.
- Emit one live `tool-use` event per completed tool call.
- Suppress tool families that already produce structured F-Mark events, especially `mcp__fmark__*`.
- Suppress Claude subagent tool calls if they have a separate subagent event path.
- Dedupe Stop-time projected tool-use events by `tool_use_id` and by F-Mark self-emitting tool family.
- Version the hook install so older managed installs are reported stale until reapplied.

Likely owners:
- Kernel Claude hook install and detection.
- Kernel auto-stream hook handler.
- Kernel transcript projection/dedup.
- Hook install fixtures and hot tests.

Verification shape:
- Hook install tests requiring Stop, PermissionRequest, and PostToolUse.
- Extractor tests for successful, failed, malformed, F-Mark MCP, and subagent tool calls.
- Integration test: live PostToolUse emits, later Stop with same `tool_use_id` does not duplicate.
- Integration test: suppressed `mcp__fmark__*` does not fall through into generic Stop-time tool-use.

## Task 6: Render tool cards from provider-specific tool structure

Problem:
Tool-use cards currently expose raw JSON sections for `input` and `result`. For tools like Bash, this produces a noisy card where the user sees escaped provider payloads instead of the real command description, command text, stdout, stderr, and execution status. The chat should interpret the tool structure per provider/tool and present a dedicated, readable description/result view.

Concrete example:
- Bash input can include `description` and `command`; render those as labeled fields, with the command in a shell/code block.
- Bash result can include `stdout`, `stderr`, `interrupted`, `isImage`, and `noOutputExpected`; render stdout/stderr as separate output blocks, surface interruption or empty-output status as compact metadata, and avoid showing the whole JSON object as the primary UI.

Broad mitigation:
- Add a tool presentation normalization layer for `ToolUseCard` instead of formatting every payload with `JSON.stringify`.
- Key formatters by provider/runtime and tool name where the provider is known; infer conservatively from payload shape when the provider is absent.
- Preserve the raw `input`/`result` data in the event model and expose it behind a fallback/details path, so debugging fidelity is not lost.
- Start with high-impact adapters: Bash/shell, file read/edit/write, search/glob, web/fetch, and MCP tool-use outputs. Unknown tools keep the current raw JSON fallback.
- Normalize stringified JSON result payloads before rendering when providers return an object encoded as a string.
- Keep renderer layout stable: collapsed header stays compact; expanded body shows human sections in a predictable order.

Likely owners:
- Renderer tool-use card presentation.
- Optional shared helper types if provider/tool display adapters need reuse.
- Kernel hook projection only if current events lack enough provider identity to choose the right adapter.

Verification shape:
- Renderer tests for Bash input/result formatting using the screenshot shape.
- Tests for stringified JSON result parsing and malformed JSON fallback.
- Tests for empty stdout, stderr-only, failed/interrupted, and no-result cases.
- Snapshot or DOM tests proving unknown tools still render the raw fallback.
- Manual smoke with at least one live Bash tool call from each supported provider/runtime.

## Task 7: Anchor feed navigation to the compose input, not the far chat edge

Problem:
The feed navigation pill currently sits at the far right of the chat/feed container. Visually it feels detached from the input it controls and lands outside the user's active compose zone, especially on wide layouts. The navigation should sit directly above the input, aligned to the right edge of the input/compose frame.

Concrete example:
- The prev/next/follow/to-bottom controls should appear above the compose input area, right-aligned to the same visual width as the input.
- They should not float at the far right of the full chat container when the compose box is centered and narrower.

Broad mitigation:
- Treat the compose/input frame as the layout anchor for feed navigation.
- Move or wrap `FeedNavCluster` so its positioning is derived from the compose column width, or share the exact compose width/padding variables instead of using fixed `right: 16px` against the feed column.
- Preserve the current button semantics and keyboard labels; this is a placement/ownership fix, not a navigation behavior rewrite.
- Keep the controls out of the text input's hit area and avoid overlap with the End turn button, attachments, popovers, and mobile safe areas.
- Define responsive behavior: on narrow screens, the cluster should remain aligned to the input edge or collapse into an input-adjacent control row, never cover typed text.

Likely owners:
- `packages/renderer/src/shell/FeedNavCluster.tsx`.
- `packages/renderer/src/shell/Feed.tsx` if the cluster needs a different parent.
- `packages/renderer/src/shell/shell.css` around `.feed-nav-cluster`, `.compose-inner`, and `.compose-box`.
- Compose tests or shell layout tests if the current suite can assert placement classes/structure.

Verification shape:
- DOM/class test proving feed navigation is mounted in, or layout-bound to, the compose/input region rather than the feed column edge.
- Visual/manual smoke at desktop wide, desktop narrow, and mobile widths.
- Check expanded compose states: empty input, typed text, attachments, named contribution, comment target, and settings popover.
- Ensure the unread floater and feed navigation do not collide.

## Task 8: Do not expire access requests while the runtime is still waiting

Problem:
An access request can show `expired` in the chat after a short delay even though the provider terminal is still waiting for approval. The UI then hides or de-emphasizes the decision path while the agent is actually blocked. This is a lifecycle/state-owner bug, not merely a badge-label problem.

Concrete example:
- The chat card shows an Edit access request as `expired`.
- The Claude terminal still shows the permission prompt and is waiting for a user decision.
- The agent status may still show live tool activity around the same blocked turn, making the expired card actively misleading.

Broad mitigation:
- Treat provider wait state as the source of truth for whether the request is still actionable.
- Separate "F-Mark hook bridge timed out" from "provider request expired/cannot be answered." If the hook process can no longer deliver a response, the card should say that specifically and offer the correct recovery path instead of pretending the provider prompt is gone.
- Revisit the hard timeout in `handleAccessRequest`. It should not write a terminal-looking `expired` response while the runtime remains blocked and waiting.
- Late approval behavior must be explicit: either support late approvals while the provider is still waiting, or disable the buttons with a precise explanation that the bridge has timed out and the user must answer in the terminal.
- Pending counts and agent activity should agree with the visible card state. A request cannot be both expired and counted as actionable unless the UI names that split state.

Likely owners:
- `packages/kernel/src/hooks/autoStream.ts` access-request wait/timeout handling.
- `packages/kernel/src/routes/managedAgents.ts` open-request lookup, response writing, and pending count derivation.
- `packages/renderer/src/cards/AccessRequestCard.tsx` status label/action state only after backend lifecycle semantics are corrected.
- Phase 16 access-request hot tests.

Verification shape:
- Unit/integration test where the hook timeout window elapses but the runtime/provider is still waiting: the card must not show plain `expired`.
- Test late approval after the previous timeout boundary, if supported.
- Test true expiration/disconnect path still clears pending count and shows a non-actionable state.
- Hot/manual smoke with a real Claude permission prompt: wait past the old expiry threshold, confirm the card remains accurate, then approve/deny from F-Mark or verify the instructed terminal fallback.

## Task 9: Show animated ASCII activity as the last chat item while an agent runs

Problem:
When an agent is actively running, the chat feed should show an animated ASCII art activity item as the last message. Currently the chat can show no tail placeholder, leaving the user with no in-feed indication that the agent is still working unless they look at chips, panels, or the terminal.

Concrete example:
- User sends a message and the agent starts running.
- The final visible chat item should become an animated ASCII activity card/message.
- As tool-use cards, prose, access requests, or final assistant output arrive, the running indicator should remain the tail item until the agent is no longer running, or be replaced by the actual final item at turn end.

Broad mitigation:
- Drive the placeholder from managed-agent activity state (`running`, `notified`, and probably `access-pending` with a distinct blocked variant), not from a fixed timer.
- Append the placeholder at feed projection/render time so it behaves like the last chat item without writing fake durable events to disk.
- Reuse or formalize the ASCII art frames already captured in `planning/ascii-art.md`, but make the production asset compact enough for the chat width and accessible to reduced-motion users.
- Keep the card visually part of the feed, not a panel-only loading state. Existing `LoadingAnimation`/`PixelBlast` can inform loading treatment, but the requested surface is ASCII animation in the chat.
- Stop showing the placeholder promptly when the agent reaches `turn-ended`, `idle`, `failed`, `offline`, or when the active session changes.

Likely owners:
- `packages/renderer/src/shell/Feed.tsx` and/or `packages/renderer/src/feed/projectFeed.ts` for appending a non-durable tail item.
- Managed-agent status state in `packages/renderer/src/state/store.ts` if the feed does not currently have enough agent activity state.
- A new renderer card/component for ASCII running activity.
- `planning/ascii-art.md` as the visual source/reference, after trimming into production-ready frames.

Verification shape:
- Renderer test: when the active agent is `running`, the feed renders one ASCII activity item after the latest real event.
- Renderer test: when real tool/prose events append during the run, the ASCII activity remains the last visible item.
- Renderer test: when the agent becomes idle/turn-ended/offline, the ASCII item disappears.
- Reduced-motion test or manual check: animation pauses or uses a static frame.
- Manual smoke with a real managed agent run: send a message, observe the ASCII animation as the last chat item while the terminal is busy.

## Task 10: Open and fill the current tool box in real time

Problem:
When the agent is streaming and a tool is active, the current tool box should open automatically and fill in as data arrives. Today tool-use rendering is effectively result-oriented: the feed can show closed tool cards or completed result blobs, but the user cannot watch the currently running tool populate in place.

Concrete example:
- Agent starts a Bash/Edit/Read tool.
- The corresponding tool card should appear open immediately with the known input/description.
- As stdout, stderr, file diff, or provider result chunks arrive, the same card should update in place.
- When the tool completes, the card should settle into a completed/failed state without creating a duplicate final card.

Broad mitigation:
- Model tool-use as a lifecycle keyed by stable `tool_use_id`: `started`/`running`/`completed`/`failed`/`cancelled`.
- Capture a tool-start event when the provider exposes one (`PreToolUse`, equivalent runtime hook, or parsed live stream), then patch/upsert that same logical card as partial output and final result arrive.
- Do not append a new card for every chunk. Accumulate/update the current tool card so the feed remains readable.
- Auto-open only the currently running tool card; preserve the user's manual collapse choice for older completed cards.
- Use provider-specific adapters from Task 6 so the live content is readable while it fills, not raw JSON.
- Decide whether updates are durable superseding events, transient websocket state, or a hybrid. The visible UI must be real-time either way, and the final durable event must remain replayable after reload.
- If a provider cannot expose true partial output, still show the running card immediately with input and status, then fill it at the earliest authoritative result hook.

Likely owners:
- Kernel hook projection in `packages/kernel/src/hooks/autoStream.ts` for start/update/finish tool lifecycle events.
- Shared event contract in `packages/shared/src/events.ts` / `eventContracts.ts` if tool-use needs status, partial output, or supersession support.
- Event writer and websocket publication paths if tool updates become durable or live transient messages.
- Renderer feed projection in `packages/renderer/src/feed/projectFeed.ts`.
- `packages/renderer/src/cards/ToolUseCard.tsx` for controlled auto-open and live update rendering.
- `packages/renderer/src/cards/ArbitraryGroupCard.tsx` if group open state needs to follow the active child tool.

Verification shape:
- Unit test: tool start creates an open running card with input but no final result.
- Unit/integration test: multiple chunks for the same `tool_use_id` update one card, not multiple cards.
- Unit/integration test: final result completes the same card and dedupes Stop-time projection.
- Renderer test: active running tool is auto-open, completed older tools do not forcibly reopen after user collapse.
- Hot/manual smoke with a real long-running Bash command: stdout appears progressively inside the open current tool card.

## Task 11: Render file-aware tool results with pressable file cards and line snippets

Problem:
File-related tools (`Read`, `Edit`, `Write`, `MultiEdit`, search tools, and file MCP tools) currently surface raw paths, params, and JSON content inside generic tool boxes. The user should see a dedicated file card item that is pressable and opens the referenced file in the file viewer/file system surface. Queried or changed lines should render inside the tool box with a focused line/diff component, not as a giant escaped JSON blob. Tool params such as `limit`, offsets, search pattern, and edit mode should be formatted as meaningful metadata.

Concrete example:
- A `Read` tool with `file_path` and `limit: 15` should show a pressable file card for the file path, a compact params row (`limit 15`, plus any offset/start line), and a code excerpt component for the returned lines.
- An `Edit` tool should show the target file card, changed line context when available, and an old/new diff component instead of raw `old_string`/`new_string` JSON.
- Search/glob tools should show file-result rows as pressable file cards, with match counts, line numbers, and snippets where available.

Broad mitigation:
- Extend the Task 6 provider/tool presentation adapters with a file-aware adapter layer.
- Normalize file path keys across providers: `file_path`, `filePath`, `path`, nested `file.filePath`, and result arrays of file hits.
- Reuse the existing file viewer state path (`openFile(absPath)`) so clicking a file reference opens the file in the same UI as the Files panel.
- Add a dedicated reusable component for tool-file references, with file icon, basename, relative path, optional absolute path tooltip, and click/keyboard activation.
- Add a dedicated code excerpt/diff component for line ranges and edit changes. It should display line numbers, preserve whitespace, highlight queried/changed lines, and truncate long content intentionally.
- Render tool parameters as compact structured metadata rather than raw JSON: `limit`, `offset`, `start_line`, `end_line`, search `pattern`, `glob`, `replace_all`, and provider-specific flags.
- Preserve a raw payload/details fallback for debugging, but keep it secondary.

Likely owners:
- `packages/renderer/src/cards/ToolUseCard.tsx` and the new Task 6 tool presentation adapter module.
- `packages/renderer/src/state/store.ts` `openFile(absPath)` integration.
- Existing file viewer components under `packages/renderer/src/panels/fileViewer/`.
- Existing file row/icon affordances under `packages/renderer/src/panels/right/files/`.
- Optional shared types only if normalized file refs need to travel across renderer/kernel boundaries.

Verification shape:
- Renderer test: `Read` payload with `file_path`, `limit`, and returned content renders a pressable file card, params metadata, and a line/code excerpt.
- Renderer test: clicking or keyboard-activating the file card calls `openFile(absPath)`.
- Renderer test: `Edit` payload renders target file card plus old/new diff with changed lines.
- Renderer test: nested provider result shape (`file.filePath`, `file.content`) is recognized.
- Renderer test: unknown file tool shapes fall back to raw payload without crashing.
- Manual smoke: run `Read` and `Edit` against a real file, click the file card, and confirm the viewer opens the target file.

## Task 12: Render approval/confirmation requests with provider-aware review UI

Problem:
Access/confirmation cards currently collapse rich provider payloads into a raw string or JSON blob. For dangerous or meaningful actions like `Edit`, this makes the approval decision too hard: the user sees escaped `file_path`, `old_string`, `new_string`, and `replace_all` fields instead of a real review interface. Confirmation UI should be purpose-built for the request type and provider, not a generic dump.

Concrete example:
- An `Edit` approval should show the target file as a pressable file card, the operation type, the exact old/new change as a diff, and the `replace_all` setting as structured metadata.
- A `Bash` approval should show the command description, shell command, cwd, and risk/permission mode clearly.
- F-Mark MCP approvals should render the intended F-Mark content by type: prose body preview, todo fields, choices options, HTML/file refs, tool-use payload, or flow metadata.
- Unknown provider shapes should still be readable: show a concise generated summary plus expandable raw details, never an unformatted JSON wall as the primary interface.

Broad mitigation:
- Add an access-request presentation adapter layer, parallel to the Task 6 tool-card adapters, keyed by `runtime_id`, `hook_event_name`, `tool_name`, and `request_type`.
- Use `tool_input` and `raw` as the source of truth for structured rendering; keep `message` as a fallback preview, not the main display when structured data is available.
- Share file-reference and diff components with Task 11 so file edits look consistent across approval cards and completed tool cards.
- Design per-request sections: target, action, parameters, content preview, risk/permission mode, and response channel.
- Keep Approve/Deny actions visually persistent and unambiguous, with disabled/error states that explain whether the request is open, expired, already answered, or terminal-only.
- Cover all current provider families: Claude hook permission requests, terminal-channel requests, Codex/OpenCode/Gemini shapes as they exist in `raw`, and F-Mark MCP tools.
- Preserve compact rendering for side panels, but do not let compact mode hide the key decision content.

Likely owners:
- `packages/renderer/src/cards/AccessRequestCard.tsx`.
- A new renderer access-request adapter module shared with Task 6/Task 11 presentation helpers where useful.
- `packages/kernel/src/hooks/autoStream.ts` only if extraction must preserve additional structured fields for providers.
- `packages/shared/src/events.ts` / `eventContracts.ts` only if the current `AccessRequestPayload` cannot express required normalized request metadata.
- Access-request renderer tests and Phase 16 access-request hot tests.

Verification shape:
- Renderer test: Claude `Edit` approval renders a file card, structured params, and old/new diff instead of raw JSON.
- Renderer test: Bash approval renders description, command block, cwd, and permission mode.
- Renderer test: F-Mark MCP approvals render appropriate content previews for prose, todo, choices, HTML, file ref, and tool-use requests.
- Renderer test: terminal-channel and unknown-provider requests render readable summary plus expandable raw details.
- Renderer test: compact mode keeps the decisive content visible and the Approve/Deny actions accessible when the request is open.
- Manual smoke: trigger real Claude Edit/Bash approvals and verify the decision card is understandable before approving.

## Task 13: Morph Stop run into Pending approval controls when approval is blocking

Problem:
When an agent is blocked on a pending approval, the primary compose action still reads `Stop run`. That hides the more useful action: the user should see that approval is pending and get immediate choices to show the approval item, approve, deny, or choose provider-specific options such as "always allow" when available.

Concrete example:
- Agent requests approval for an Edit tool.
- The primary action changes from `Stop run` to `Pending approval`.
- Opening/clicking the control shows: `Show request`, `Approve`, `Deny`, plus any extra provider suggestion such as `Always allow`.
- `Show request` scrolls the chat to the access-request card.
- Approval actions send the selected decision/suggestion through the same request lifecycle used by the card.

Broad mitigation:
- Make pending approval outrank generic agent-running state in the primary action derivation. `access-pending` should be distinct from `running`.
- Thread pending access-request data into the compose action: count, first/current request id, participant id, status, and provider suggestions.
- Add a compact popover/menu from the primary action with `Show request`, `Approve`, `Deny`, and provider-specific suggestion actions.
- Reuse the same response API as `AccessRequestCard` so card decisions and compose-button decisions stay consistent.
- Implement scroll-to-request by locating the request event in the feed and bringing it into view, then visibly highlighting it briefly.
- Extend shared/backend response types if needed. Current managed response schema only accepts `approve`/`deny`; provider suggestions like "always allow" must be represented and translated into the correct provider hook output instead of being faked as ordinary approve.
- If provider suggestions are present but unsupported by the hook bridge, show them disabled with a precise reason rather than silently dropping them.
- Preserve access to interrupt/stop, but demote it into the pending-approval menu while a request is blocking so the main call to action stays approval-focused.

Likely owners:
- `packages/renderer/src/compose/SendButton.tsx` and `packages/renderer/src/compose/Compose.tsx` primary-action state derivation.
- `packages/renderer/src/cards/AccessRequestCard.tsx` shared response helper or extracted action API.
- Feed scrolling/highlight support in `packages/renderer/src/shell/Feed.tsx`.
- `packages/shared/src/events.ts` / `eventContracts.ts` if response decisions need suggestion identifiers.
- `packages/kernel/src/routes/managedAgents.ts` response schema and delivery.
- `packages/kernel/src/hooks/autoStream.ts` `permissionHookOutput` mapping for provider-specific approval behaviors.

Verification shape:
- Renderer test: with a pending access request, the primary button shows `Pending approval` instead of `Stop run`.
- Renderer test: clicking `Show request` scrolls/highlights the matching access-request card.
- Renderer test: Approve/Deny from the primary-action menu posts the same response body as the card.
- Renderer/backend test: provider suggestions are rendered when present and sent with the selected suggestion id/value.
- Backend test: unsupported suggestion choices are rejected or disabled clearly, not coerced into plain approve.
- Manual smoke: trigger a real Claude permission request, approve/deny from the primary action, and confirm the terminal resumes.

## Task 14: Use a real diff component for Edit and MultiEdit tools

Problem:
`Edit` and `MultiEdit` tool cards currently render raw `old_string`, `new_string`, `originalFile`, `filePath`, and similar JSON fields. This makes changes hard to review, especially for long class strings or dense source code. Edits need a first-class diff component with line context, additions/removals, and file metadata, not generic input/result JSON.

Concrete example:
- An `Edit` card should show a pressable file reference, then a compact diff between `old_string` and `new_string`.
- The result should not repeat the full escaped original file as the primary UI. It should show applied status, changed range if known, and optionally an expandable full-file/details view.
- A `MultiEdit` card should render each edit as a separate hunk with its own old/new pair and replacement metadata.

Broad mitigation:
- Add a reusable `EditDiff` or `ToolDiff` component for tool cards and approval cards.
- Normalize provider edit shapes:
  - Claude input: `file_path`, `old_string`, `new_string`, `replace_all`.
  - Claude result: `filePath`, `oldString`, `newString`, `originalFile`, structured success/error fields when present.
  - Multi-edit arrays: `edits`, `old_string`/`new_string` pairs, `replace_all`, and line/range hints when present.
- Generate a compact inline diff when only old/new strings are available, with removed/added rows, whitespace preservation, and optional wrapping for long single-line strings.
- Use a line-based diff when full original/updated content or line ranges are available, including line numbers and a small amount of surrounding context.
- For long strings, detect common-prefix/common-suffix and focus the changed segment while preserving an expandable full diff/details affordance.
- Keep raw payload available behind a secondary details disclosure for debugging.
- Make the same component usable in Task 12 approval cards so users can review the exact edit before approving.

Likely owners:
- New renderer component under `packages/renderer/src/cards/` or a shared card presentation folder.
- `packages/renderer/src/cards/ToolUseCard.tsx` and Task 6/Task 11 adapter code.
- `packages/renderer/src/cards/AccessRequestCard.tsx` and Task 12 adapter code.
- CSS in `packages/renderer/src/cards/cards.css`, with stable dimensions and no text overflow.

Verification shape:
- Renderer test: `Edit` input renders file card plus removed/added diff rows for `old_string`/`new_string`.
- Renderer test: long single-line class strings wrap or focus the changed segment without horizontal layout breakage.
- Renderer test: `MultiEdit` renders multiple labeled hunks.
- Renderer test: result payload with `originalFile` does not dump the whole file as primary UI.
- Renderer test: the same diff component renders inside an open access-request card before approval.
- Manual smoke: trigger a real Edit approval/tool result and verify the diff is readable in the chat.

## Task 15: Fix line/comment hit testing and text-selection targeting

Problem:
The prose comment affordance can highlight a different text slice than the pointer or selection. Hovering the lower part of rendered text can mark an upper area, single-line intent can become a batch/range selection, and selecting text plus clicking the comment affordance can attach the comment to the wrong prose range. This makes the feature feel unreliable and can poison the agent wake context from Task 1.

Concrete example:
- Hovering near the lower half of a rendered prose message shows the comment affordance or highlight above the actual pointer.
- Selecting what visually reads as one line can default to a larger range/batch target.
- Clicking the comment affordance after marking text catches a different part of the message than the selected text.

Broad mitigation:
- Treat rendered text geometry as the source of interaction truth. The current rail path uses fixed `lineHeight` arithmetic such as `Math.floor(y / lineHeight)`, but rendered markdown can wrap, include margins, and vary by element.
- Decide the canonical target model explicitly. If comments are source-line based, render line-addressable spans so DOM hit testing maps back to source line numbers. If comments need text-selection precision inside wrapped prose, extend the target metadata with selected text, character offsets, or quote anchors rather than pretending a raw `[start, end]` line tuple is enough.
- Separate hover targeting from text-selection targeting. Hover should target only the line or slice under the pointer; selection should target only a real non-collapsed DOM selection inside the same commentable root.
- Default to a single target unless a true multi-line or multi-slice selection exists. Do not promote ordinary hover or single-line selection into a batch/range target.
- Derive selection boundaries from `Range.getClientRects()` and text-node geometry clipped to `.commentable-content`, not only from the bounding box of the whole selection.
- Handle wrapped paragraphs, inline code, links, lists, blockquotes, code blocks, bold text, and compact line-height variants.
- Show an explicit target preview in the popover: selected text or line snippet plus line/range label, so the user sees what will be posted before submitting.
- Ensure the posted target, feed highlight, right-panel quote, scroll-to-anchor behavior, and agent wake packet anchor all come from the same normalized target object.
- Keep comment threading, mention defaults, and reply behavior unchanged except for using corrected target metadata.

Likely owners:
- `packages/renderer/src/cards/LineCommentRail.tsx` hover, selection, marker positioning, and highlight math.
- `packages/renderer/src/cards/ProseCard.tsx` and `packages/renderer/src/cards/MessageCard.tsx` where rendered prose is wrapped by the rail.
- `packages/renderer/src/panels/right/RightComments.tsx` scroll-to-anchor and quote rendering, especially fixed `LINE_HEIGHT` assumptions.
- Shared comment target helpers if range normalization needs to become reusable.
- Renderer CSS for `.commentable`, `.commentable-content`, `.line-comment-highlight`, and marker hit targets.

Verification shape:
- Renderer or Playwright test: hovering the lower part of wrapped prose targets the visible text under the pointer, not an upper slice.
- Test single-line text selection posts exactly one target unless the DOM selection truly spans multiple rendered/source slices.
- Test multi-line selection maps to the same range highlighted in the feed and quoted in the right comments panel.
- Test wrapped paragraphs, inline code, lists, blockquotes, and code blocks.
- Test click on a marker opens a popover whose preview matches the text/range that will be submitted.
- Manual smoke on screenshot-like prose: hover, select, click comment, submit, and verify right-panel quote plus agent wake context match the chosen slice.

## Task 16: Show comment activity items in the chat feed

Problem:
Posting or receiving a comment only updates the inline/right-panel comment surfaces. The chat feed itself does not show a compact item such as "You commented on X" or "T responded on X", so comment activity can feel invisible, especially when the right panel is closed or the user is scanning the chronological conversation.

Concrete example:
- User comments on a prose slice. The feed should show a small activity item: `You commented on <target title/snippet>`, with a short preview of the comment body and the target slice.
- Agent T replies to that comment. The feed should show `T responded on <target title/snippet>`, again with a small preview.
- Clicking either item should open the comments tab on the right pane, focus the exact comment/thread, and scroll to the correct part of the right panel and feed anchor.

Broad mitigation:
- Introduce a compact feed representation for comment prose events instead of suppressing them completely. Today `aggregate.feed` filters `isProseComment(e)` out and `EventCard` returns `null` for comment roles.
- Preserve the right-panel thread as the detailed owner. The feed item is an activity/entry point, not a second full comment renderer.
- Decide whether the feed item is a real `EventCard` branch for comment prose or a projected/synthetic feed item. Either way, it must preserve chronological ordering, unread dots, fresh-item animation, and durable replay after reload.
- Render participant-aware copy:
  - Current user root comment: `You commented on X`.
  - Other participant root comment: `<Name> commented on X`.
  - Reply/comment response: `You responded on X` or `<Name> responded on X`.
- Use a robust target label: named contribution title if available, otherwise a short target snippet; include line/range text when present.
- Show two small previews: the comment body and, when available, the target slice. Keep both bounded so comment activity does not dominate the feed.
- On click, set `commentTarget`, set the right tab to `comments`, and focus the specific root/reply if possible. Group-level focus is acceptable only as a fallback.
- Extend `RightComments` focus state if needed so the right panel can scroll to a specific comment event, not only the target group.
- Keep comments hidden from document-only feed modes unless the product decision says comment activity belongs there. Conversation/everything views should show them.
- Avoid loops with wake/agent responses: a comment activity item should not be treated as a new prose message to wake agents again.

Likely owners:
- `packages/renderer/src/state/aggregate.ts` feed filtering and/or a feed projection layer for comment activity items.
- `packages/renderer/src/cards/EventCard.tsx` comment-role dispatch, or a new `CommentActivityCard` if comments remain special projected items.
- `packages/renderer/src/panels/right/RightComments.tsx` focus/scroll APIs, especially if focusing a specific reply/comment is required.
- `packages/renderer/src/shell/Feed.tsx` click handling, unread/fresh behavior, and right-tab integration.
- Shared prose/comment helpers if comment root vs reply detection and target labels need reuse.

Verification shape:
- Renderer test: posting a user comment produces one compact feed item with `You commented on ...` and bounded previews.
- Renderer test: an agent reply/comment response produces `<Agent> responded on ...`.
- Renderer test: clicking a comment activity item opens the right comments tab and focuses/scrolls to the matching thread or exact comment.
- Renderer test: comment activity items preserve chronological ordering and unread/fresh behavior without duplicating the detailed right-panel comment body.
- Renderer test: document-only feed mode behavior is explicit and stable.
- Manual smoke: post a comment, receive an agent reply, click both feed items, and verify the right panel plus feed anchor land on the right thread/comment.

## Task 17: Give subagents stable random names and dedicated subagent title rendering

Problem:
Subagent activity currently looks like generic tool activity or raw metadata instead of a first-class agent run. The group header can expose a raw participant id and a bare count such as `1 sub-agent`, while the subagent card itself reuses `tool-use-card` chrome and often falls back to generic labels like `Claude sub-agent`. Subagents should feel like regular agents: named, recognizable, and rendered through a dedicated component.

Concrete example:
- A parent run that spawned one subagent should not only show `ag-claude-c0ab ... 1 sub-agent`.
- The subagent should have a stable generated display name, similar in spirit to regular random agent names.
- The subagent title/header should render as its own designed UI: name, role/title/task summary, status, provider/source, and compact output state.
- Raw ids such as `subagent_id`, `correlation_id`, and `parent_tool_use_id` should stay available in details, not be the primary title.

Broad mitigation:
- Add a stable subagent display-name strategy. When the provider supplies a human name, use it. When it does not, generate a random-style name using the same naming vocabulary or design language as regular agents.
- Make generated subagent names deterministic per subagent identity (`correlation_id`, `subagent_id`, or parent tool id), so the name does not change on reload.
- Store or derive display names at the projection/normalization layer, not only inside the renderer. Current projection in `projectSubagentTool` falls back to generic provider labels; that is too late/weak for a durable UI identity.
- Keep provider/task metadata separate from display name. For example: display name as the actor, role/task summary as the title, status/source as metadata.
- Replace `SubagentCard`'s generic `tool-use-card` rendering with a dedicated subagent card component.
- Make `SubagentBox` and standalone `SubagentCard` share a subagent presentation helper/component so grouped and standalone subagent events render consistently.
- Update `ArbitraryGroupCard` header so it uses participant display names via participants data, valid elapsed fallback, and a richer subagent summary when subagents are present. Do not leak raw participant ids as the headline when a display name exists.
- Support multiple subagents in one group with distinct names and a compact summary, not only a count.
- Keep raw ids, correlation, transcript path, provider source, and confidence in an expandable technical details section.
- Coordinate visual style with Task 10 and Task 6 so subagents do not look like ordinary tools, but still compose cleanly inside mid-turn groups.

Likely owners:
- `packages/kernel/src/hooks/projectTurn.ts` subagent projection and fallback naming.
- Shared event types in `packages/shared/src/events.ts` if a normalized `display_name` or `title` field is needed beyond the existing `name`.
- Regular agent naming utilities such as `packages/renderer/src/lib/agentNaming.ts`, or a shared/kernel equivalent if names must be generated before renderer time.
- `packages/renderer/src/cards/SubagentCard.tsx`.
- `packages/renderer/src/cards/SubagentBox.tsx`.
- `packages/renderer/src/cards/ArbitraryGroupCard.tsx` group header/title rendering.
- CSS for dedicated subagent card/header states.

Verification shape:
- Projection test: unnamed Claude/Codex subagent gets a stable generated display name instead of generic `Claude sub-agent` or `Codex sub-agent`.
- Projection test: provider-supplied subagent name is preserved.
- Renderer test: standalone subagent events render with dedicated subagent chrome, not `tool-use-card` classes as the primary card.
- Renderer test: grouped subagent runs show the generated subagent name/title/status inside `SubagentBox`.
- Renderer test: arbitrary group header uses participant display name when available and summarizes subagents without raw ids as the headline.
- Renderer test: multiple subagents in one group are distinguishable by name.
- Regression test: raw ids remain visible in expanded technical details.
- Manual smoke using a real subagent run: screenshot-level check that the group header, subagent title, and details read like a first-class agent run.

## Task 18: Auto-focus newly created sessions

Problem:
Creating a session should immediately make that session the active/focused session. Some creation paths already do this, but others can create the session, refresh the list, and leave the user focused on the previous session or no obvious active row.

Concrete example:
- `NewSessionModal` creates a session and calls `setCurrentSession(session.id)`.
- The inline creator in the Sessions panel creates a session, calls its refresh/collapse path, but does not select the returned session.
- After creation, the user should land in the new session, see it selected, and be ready to type into that session.

Broad mitigation:
- Audit every user-initiated session creation entry point: new-session modal, Sessions panel inline creator, command palette if present, fork/create flows, and any path-switch create affordance.
- Use the created session response as the source of truth. Do not infer the new session from list ordering after refresh.
- After successful create, update session/path state as needed, then call `setCurrentSession(created.id)` exactly once.
- If the session was created for a different project path, switch the active path first, refresh sessions/participants for that path, then select the created session.
- Keep externally-created sessions from stealing focus just because a websocket refresh saw them. Auto-focus should apply to the local user action that initiated creation.
- Reset per-session UI appropriately on focus: events clear/load, view mode defaults/restores, right tab defaults/restores, compose should be ready for the new session, and stale comment/file targets should not point at the old session.
- Ensure the selected row is visible in the Sessions panel after creation and the main chat/feed reflects the new current session.

Likely owners:
- `packages/renderer/src/modals/NewSessionModal.tsx` as the already-working reference path.
- `packages/renderer/src/panels/Sessions.tsx` inline session creator and session list refresh path.
- `packages/renderer/src/state/store.ts` `setCurrentSession` side effects if stale per-session UI state needs additional clearing.
- Command palette or other create-session surfaces if they exist.
- Kernel session route only if response data lacks enough path/session metadata.

Verification shape:
- Renderer test: creating through `NewSessionModal` still sets the created session as current.
- Renderer test: creating through the Sessions panel inline creator sets the returned session id as current, not the old session or the first list item.
- Renderer test: creating a session for a different path switches path state before selecting the new session.
- Regression test: websocket refresh from an externally-created session does not steal focus from the current session.
- Manual smoke: create a session from each visible UI entry point and confirm the selected session, feed, right panel, and compose all belong to the new session.

## Task 19: Restore last focused session and workspace UI state on app open

Problem:
Opening the app should restore the user's last focused working context: session, feed position, right tab, panel scroll, file viewer state, and related per-session UI state. Some per-session state already persists, but the app bootstrap currently falls back to selecting the first listed session when `currentSessionId` is null, and the last focused session itself is not restored as a first-class startup preference.

Concrete example:
- User is working in session B with the right pane on Comments or Files, a specific feed position, and a panel scroll position.
- User closes/reloads the app.
- Reopening should focus session B, restore its view mode/right tab/scrolls/file tabs where valid, and leave the user where they were instead of jumping to the newest/list-first session.

Broad mitigation:
- Persist the last focused session id per active project/path, not only a single global session id. Multi-path workspaces must restore the last session for the active path.
- On `setCurrentSession`, write the selected session to localStorage or another renderer persistence layer keyed by active path id/path.
- During `App` bootstrap, load sessions first, validate the persisted session id still exists in the current path's list, then call `setCurrentSession(persistedId)`. Fall back to the newest/list-first session only when no valid saved session exists.
- Keep the existing per-session restores coherent: `viewModeBySession`, `rightTabBySession`, `rightScrollBySession`, `lastSeenBySession`, file viewer tabs/active files, panel widths, and files favorites/search defaults.
- Decide whether to restore exact feed `scrollTop` or the current anchor model. The current feed restore uses `lastSeenBySession` as an anchor; if exact scroll position is required, add a bounded per-session feed-scroll map and reconcile it with unread behavior.
- Restore right panel tab and scroll after the tab content has mounted, without visible jumping.
- Restore the selected session row in the Sessions panel and scroll it into view if the panel is open.
- Avoid restoring stale transient surfaces that cannot survive reload safely: open modals/popovers, in-progress approval dialogs unless backed by live runtime state, stale comment targets for missing events, and disconnected runtime terminals.
- Handle deleted/moved sessions and path changes gracefully by clearing only invalid persisted entries.
- Keep Task 18 precedence: a user-created session should become the persisted focused session immediately.

Likely owners:
- `packages/renderer/src/state/store.ts` for persisted last-focused-session state and `setCurrentSession` side effects.
- `packages/renderer/src/App.tsx` bootstrap selection logic.
- `packages/renderer/src/shell/Feed.tsx` feed restore behavior and possible exact scroll persistence.
- `packages/renderer/src/shell/RightPanel.tsx` right tab/scroll restore, already partially implemented.
- File viewer state under `packages/renderer/src/panels/fileViewer/` and existing file-viewer persistence maps.
- `packages/renderer/src/panels/Sessions.tsx` if selected-row scroll/focus needs explicit handling.

Verification shape:
- Renderer/bootstrap test: with a valid persisted last-focused session, app startup selects it instead of `list[0]`.
- Renderer/bootstrap test: invalid/deleted persisted session falls back cleanly and clears the stale entry.
- Renderer test: switching sessions persists the last focused session per active path.
- Renderer test: right tab, view mode, right-panel scroll, file viewer active tab, and feed position restore for the selected session.
- Regression test: externally-created sessions and websocket refreshes do not overwrite the user's last focused session.
- Manual smoke: open session B, scroll feed/right panel, switch right tab/file tab, reload app, and verify the same session/context is restored.

## Task 20: Make the Sessions and Workspaces list fully manageable and state-aware

Problem:
The Sessions panel is currently mostly a grouped click-to-select list with a fork action. It does not expose the session/workspace management interactions the user expects: edit names, delete sessions, edit/remove workspaces, drag-to-reorder, double-click inline rename, right-click context menus, and visible session state such as working, done unread, done read, and awaiting input.

Concrete example:
- A session row should support double-click inline rename, context-menu actions, delete/remove, fork, and drag reorder.
- A workspace/repo group should support edit display name, remove workspace, favorite/unfavorite where applicable, and drag reorder.
- Session rows should show a state badge/tone:
  - `working` when an agent in that session is currently running or streaming work.
  - `awaiting input` when the latest turn state indicates the user needs to respond, or when an access approval is blocking.
  - `done unread` when the session has new events after the user's saved read anchor.
  - `done read` when the session is idle and fully read.

Broad mitigation:
- Split the surface into reusable row components: `SessionRow`, `WorkspaceGroupRow`, context-menu components, inline rename editor, and drag handle affordances.
- Add or expose backend session CRUD if missing. Current session routes support list/create/fork, but not obvious rename/delete endpoints; session rename/delete should be real durable operations, not renderer-only aliases.
- Add client API methods and shared contracts for session rename/delete, including confirmation/recovery semantics for destructive deletion.
- Use existing path APIs for workspaces where they fit: `removeKnownPath`, `removeFavorite`, `renameFavorite`, `setActivePath`. Add missing workspace display-name/order persistence if known paths need user-facing names beyond favorites.
- Persist custom ordering for sessions and workspace groups. Existing UI sorts sessions by `created_at`; drag reorder requires an explicit order model and clear fallback for new/unordered sessions.
- Keep date grouping compatible with manual reorder. Either reorder within groups only, or replace date grouping with a user-order-first model that still exposes recency metadata.
- Implement double-click inline rename without interfering with single-click select, keyboard activation, drag start, or context-menu open.
- Implement right-click/context-menu actions with keyboard access and touch-friendly fallback buttons.
- Derive a clear session-state model from authoritative sources:
  - events/turn-end state for whose turn is next;
  - managed-agent status/presence for running/working;
  - pending access counts for approval-blocked or awaiting-input states;
  - `lastSeenBySession` and latest event filename for unread/read.
- If deriving state across all sessions requires more data than the list currently has, extend `GET /sessions?scope=all` or use `GET /sessions/events?scope=all` carefully with bounded summary data instead of loading huge event histories into the list.
- Ensure state badges update on websocket events (`event_added`, `managed-agent.*`, `presence`, `path-switched`, `session.forked`) without stealing focus.
- Make destructive actions safe: confirm delete, describe whether only F-Mark session data is removed, and never delete arbitrary project/workspace files by accident.
- Coordinate with Task 18 and Task 19 so rename/delete/reorder does not break newly-created focus or cold-start restore.

Likely owners:
- `packages/renderer/src/panels/Sessions.tsx` current list/group rendering, inline creator, and session row actions.
- `packages/renderer/src/shell/PathSwitcher.tsx` and/or shared workspace-list components for workspace edit/remove/reorder.
- `packages/renderer/src/api/client.ts` session/workspace management methods.
- `packages/shared/src/sessions.ts` contracts for rename/delete/order/state summaries if added.
- `packages/kernel/src/routes/sessions.ts` for session rename/delete/order endpoints and optional state summaries.
- `packages/kernel/src/routes/paths.ts` for workspace display-name/order/remove semantics if existing known/favorite endpoints are insufficient.
- Renderer state persistence in `packages/renderer/src/state/store.ts` if ordering or row UI state is local.
- Existing managed-agent/presence state under `packages/renderer/src/state/presence.ts` for state badge derivation.

Verification shape:
- Renderer test: double-clicking a session row opens inline rename, saves via API, and updates the visible slug/name without selecting the wrong session.
- Renderer test: right-clicking a session row opens a menu with rename, delete/remove, fork, and focus/select actions; keyboard users can reach the same actions.
- Renderer/backend test: session delete removes the intended session data and updates the list/current selection safely.
- Renderer test: workspace group rows expose edit/remove actions and update path state/favorites/known paths correctly.
- Renderer test: drag reorder persists and survives reload for sessions and workspace groups.
- Renderer test: session state badges correctly show working, awaiting input, done unread, and done read from mocked event/presence/access/read-anchor states.
- Regression test: external websocket refreshes update badges/list contents without overwriting manual order or current focus.
- Manual smoke: rename, delete, reorder, right-click, double-click, remove workspace, reload, and verify the list and selected/restored session stay coherent.

## Task 21: Scope todo assignee options to current-session agents

Problem:
Todo creation and editing can show assignee options from the global participant set instead of only agents attached to the current session. This lets the user assign or wake an agent that is not participating in the active session, which makes todo creation feel leaky across sessions.

Concrete example:
- The Create Todo popover should show `(unassigned)` plus only agents whose `active_session` matches `currentSessionId`.
- Inline todo creation, subtask creation, random default assignment, and reassign menus should use the same current-session agent list.
- Agents from another session, stale detached agents, system participants, and ordinary users should not appear as assignable options in the creation flow.

Broad mitigation:
- Replace global participant filtering in todo creation with a shared helper such as `getSessionAgentIds(participants, currentSessionId)`.
- Use the scoped helper everywhere todo assignees are chosen:
  - Create Todo popover assignee select and random default.
  - Todo tree inline draft creation and random default.
  - Todo card inline subtasks and commit-and-create-below defaults.
  - Todo item assignee dropdown/reassign menu.
- Preserve an existing out-of-session assignee as a readable label on historical todos, but do not offer that participant as a selectable new target unless it belongs to the current session.
- When there are no current-session agents, default new todos to unassigned and render an empty/disabled agent section without confusing stale options.
- Wake only current-session agents after todo assignment. Do not call `wakeSession` for an assigned participant that is not an active agent in the current session.
- Keep parent todo selection scoped to the current session's todos, as it already fetches by `sessionId`.

Likely owners:
- `packages/renderer/src/compose/CreateTodoPopover.tsx` participant options and initial `assignedTo`.
- `packages/renderer/src/panels/todoPanelUtils.ts` `getAgentIds` or a new session-scoped helper.
- `packages/renderer/src/panels/TodoTreeList.tsx` inline drafts, random defaults, and `postTodo` wake targeting.
- `packages/renderer/src/cards/TodoCard.tsx` feed todo subtasks and inline creation defaults.
- `packages/renderer/src/cards/TodoItem.tsx` assignee menu rendering.
- Shared participant type already exposes `active_session`; backend work is only needed if renderer participants are stale or missing that field.

Verification shape:
- Renderer test: Create Todo assignee options include only agents with `active_session === currentSessionId`, plus unassigned.
- Renderer test: users, system participants, agents from other sessions, and detached/null-session agents are excluded from new-assignee options.
- Renderer test: random default assignment never picks an out-of-session agent.
- Renderer test: inline draft/subtask creation in `TodoTreeList` and `TodoCard` uses the same scoped agent list.
- Renderer test: an existing todo assigned to an out-of-session agent still displays its assignee label but the dropdown does not offer that agent for new assignment.
- Renderer/API test: todo wake calls target only current-session agents.
- Manual smoke: create and reassign todos while two sessions have different active agents; confirm only the active session's agents appear.

## Task 22: Fork sessions without moving agents out of the source session

Problem:
Forking a session can make agents disappear from the session it forked from. The fork flow appears to rebind the same agent participants to the fork, so UI that filters agents by `active_session` no longer shows those agents in the source session. From the user's perspective, the agent moved to the fork instead of being duplicated.

Concrete example:
- Source session has agent T attached.
- User forks the session.
- The fork receives T or a handoff to T, but the source session no longer shows T as present.
- Expected behavior: the source keeps its original agent participant/process/session binding, and the fork gets its own copied/relaunched agent identity or clearly separate fork agent.

Broad mitigation:
- Treat fork agent handling as clone/copy semantics, not move/rebind semantics.
- Do not call `writeActiveSession(originalParticipantId, forkSessionId)` for the source agent when the intent is to duplicate work into the fork. That mutates the source agent's session binding.
- Create fork-local agent participants for the fork, with new participant ids, display names/colors, runtime metadata, and active session set to the fork session.
- Relaunch or attach new runtime panes for the fork-local agents where supported. If true runtime duplication is unsupported, preserve the original source agent and report the fork agent as skipped/unavailable instead of moving it.
- Keep the source session's agent state, managed-agent rows, presence, and participant strip unchanged after fork.
- Make response semantics explicit:
  - `duplicated` or `relaunched` for a new fork-local agent;
  - `skipped-paused`, `skipped-detached`, or `failed` when the fork cannot get a copy;
  - avoid using `rebound` to mean "moved original agent" unless that becomes an explicit user-selected mode.
- If an advanced "move agent to fork" mode is ever offered, make it opt-in and label the consequence clearly.
- Update fork handoff prompts so the new fork-local agent writes to the fork session, while the original agent remains oriented to the source session.
- Publish websocket updates for both sessions accurately: source participants remain attached; fork participants appear in the fork.
- Ensure participants, managed-agent state, tmux/runtime naming, MCP orientation, and status rows all agree on which agent belongs to which session.

Likely owners:
- `packages/kernel/src/routes/sessions.ts` fork route, `rebindForkAgents`, and fork websocket publication.
- `packages/kernel/src/participants.ts` participant creation/duplication helpers.
- Agent state storage under `.f-mark/agents` via `createAgentStateStore`.
- Runtime/tmux spawn or relaunch helpers in managed-agent routes if fork-local runtime panes must be created.
- `packages/shared/src/sessions.ts` `ForkedAgentResult` statuses and response contract.
- `packages/renderer/src/components/ForkSessionPopover.tsx` result messaging and warnings.
- `packages/renderer/src/state/presence.ts` and managed-agent websocket handling if new fork-local agents are published.
- Sessions/agent strip UI under `packages/renderer/src/shell/TopBar.tsx` and right-panel agents list for smoke verification.

Verification shape:
- Backend test: forking a session with an attached agent does not change the original participant's `active_session`.
- Backend test: fork response returns a distinct fork-local participant id when an agent is duplicated/relaunched.
- Backend test: fork failure/skipped paths never move the source agent.
- Backend/websocket test: source agent update remains bound to the source, fork agent update is bound to the fork.
- Renderer test: after fork, switching back to the source session still shows the original agent present.
- Renderer test: fork popover result distinguishes duplicated/relaunched/skipped agents without implying the source agent was moved.
- Manual smoke: start an agent in source, fork the session, verify source and fork each show the correct agent presence and that messages/tools go to the intended session.

## Task 23: Suppress or natively render F-Mark internal tool plumbing

Problem:
When agents use F-Mark tools, internal tool plumbing can appear in the chat as ugly generic tool cards below the interface. The screenshot shows `ToolSearch` for `select:mcp__fmark__fmark_post_choices` rendered with raw JSON input/result. This is not useful primary chat content: the actual user-visible result should be the native F-Mark event or a compact internal trace, not a raw provider/deferred-tool box.

Concrete example:
- Agent searches/selects an F-Mark MCP tool such as `mcp__fmark__fmark_post_choices`.
- The chat renders a generic `ToolSearch` card with raw JSON:
  - input: `{ "query": "select:mcp__fmark__fmark_post_choices", "max_results": 3 }`
  - result: `{ "matches": [...], "total_deferred_tools": ... }`
- Expected behavior: either no primary feed card appears for internal F-Mark tool discovery, or it appears as a tiny collapsed internal trace/debug item. The native F-Mark event created by the tool should be the visible interface.

Broad mitigation:
- Classify F-Mark MCP tool calls and F-Mark tool-discovery calls as internal plumbing, distinct from user-relevant external tools.
- Suppress direct `mcp__fmark__*` transcript projections wherever the MCP tool itself creates a structured F-Mark event. Live hook suppression already exists in parts of `autoStream`; stop/transcript projection and deferred-tool search paths must follow the same rule.
- Suppress or compact `ToolSearch`/deferred-tool discovery cards when their query/result is only selecting `mcp__fmark__*` tools.
- Do not suppress genuinely user-relevant tools that happen to mention F-Mark in ordinary content. The rule should key off provider/tool name and structured select/query shape, not substring-only body text.
- Keep internal traceability in a secondary surface if needed: right log, raw transcript/debug disclosure, or collapsed "internal F-Mark tool selection" line. The main chat feed should not show the raw JSON wall.
- Coordinate with Task 6's provider-aware adapters: unknown tools still get a raw fallback, but known internal F-Mark plumbing gets a deliberate hide/compact/native-render policy.
- Coordinate with Task 10 live tool lifecycle so an internal F-Mark discovery card does not flash open live and then disappear or duplicate native output.
- Preserve F-Mark MCP tools that intentionally post `tool-use` events through `fmark_post_tool_use`; those should render as the explicitly posted tool-use event, not the provider's transport call.

Likely owners:
- `packages/kernel/src/hooks/projectTurn.ts` transcript projection, which currently projects generic tool calls into `tool-use`.
- `packages/kernel/src/hooks/autoStream.ts` stop-time dedupe/suppression and live PostToolUse suppression.
- Shared MCP tool naming metadata in `packages/kernel/src/mcp/tools.ts`.
- `packages/renderer/src/feed/projectFeed.ts` only if internal/hidden tool-use events are still persisted but should not appear in primary feed.
- `packages/renderer/src/cards/ToolUseCard.tsx` only for compact/internal trace rendering if suppression is not purely at projection time.
- Right log/debug surfaces if raw internal traces remain accessible outside the main chat.

Verification shape:
- Projection test: direct `mcp__fmark__fmark_post_choices` transcript tool-use is not emitted as a generic `tool-use` card when the MCP call creates a native choices event.
- Projection test: `ToolSearch` with `query: "select:mcp__fmark__..."` is suppressed or rendered as compact internal trace, not raw JSON in the primary feed.
- Renderer test: native F-Mark events created by MCP tools still render normally.
- Regression test: non-F-Mark `ToolSearch` or external tool discovery still renders according to Task 6 adapters/fallbacks.
- Live integration test: a real agent using F-Mark MCP tools does not flash or persist raw internal tool cards in the chat feed.
- Manual smoke: ask an agent to create choices/todos/prose through F-Mark MCP tools; verify the chat shows the choices/todo/prose UI, not the provider's selection JSON.

## Task 24: Keep approval cards chronological with their tool boxes

Problem:
Approval/access-request cards can render above related tool boxes instead of appearing chronologically in the chat. This breaks the run narrative: the user sees a permission/approval interruption before the tool context it belongs to, or the approval card is separated from the running/completed tool card that explains why the approval is needed.

Concrete example:
- Agent attempts a tool that requires approval.
- The chat renders the approval box above the relevant tool box, or above unrelated tool boxes.
- The provider terminal/runtime is still waiting for that approval.
- Expected behavior: the feed follows the provider/logical event order, and the approval request appears at the exact point in the related tool lifecycle.

Current-code clue:
- `packages/renderer/src/feed/projectFeed.ts` currently treats `tool-use`, subagent events, and arbitrary prose as mid-turn group items, but `access-request` stays a standalone event.
- `packages/renderer/src/cards/EventCard.tsx` renders `access-request` independently through `AccessRequestCard`.
- `packages/kernel/src/hooks/autoStream.ts` can emit access requests live from permission hooks while tool-use events may arrive through a different live/projection path, so write order and display order can diverge unless they are explicitly correlated.

Broad mitigation:
- Define a single chronological ordering contract for live and transcript-projected run events using provider sequence/timestamp where available, then stable synthesized sequence numbers where the provider does not expose one.
- Link approval requests to the relevant tool lifecycle using `tool_use_id`, request id, parent tool id, command/tool name, or a new explicit correlation field if existing payloads are insufficient.
- Treat tool-related `access-request` events as mid-turn timeline items, not top-level interrupts that can float away from the tool group.
- Prefer rendering tool-related approvals inline inside the active tool card or immediately adjacent beneath it, with the tool card opened and marked `pending approval`.
- Preserve standalone approval cards for access requests that are not tied to a specific tool.
- When a permission request arrives before the matching tool-use event, synthesize or reserve a pending tool placeholder so the approval does not jump above or detach from its context.
- On stop-time transcript projection, merge/dedupe live approval and tool events without reordering already visible items unexpectedly.
- For concurrent tools and multiple pending approvals, keep per-tool ordering stable and keep scroll anchors targeted to the correct request.
- Ensure Task 13's `Pending approval` primary action scrolls to the chronologically placed approval/tool item, not to a separately sorted or stale request card.

Likely owners:
- `packages/renderer/src/feed/projectFeed.ts` feed grouping and mid-turn ordering rules.
- `packages/kernel/src/hooks/autoStream.ts` live permission/tool event emission, correlation, and stop-time dedupe.
- `packages/shared/src/events.ts` if access-request payloads need an explicit `tool_use_id`, `parent_tool_use_id`, `sequence`, or correlation field.
- `packages/renderer/src/cards/AccessRequestCard.tsx` and `packages/renderer/src/cards/ToolUseCard.tsx` if approval UI moves inline or adjacent to tool cards.
- `packages/renderer/src/cards/ArbitraryGroupCard.tsx` if grouped mid-turn rendering owns the final order.
- `packages/renderer/src/shell/Feed.tsx` for scroll-to-request anchors and pending-approval navigation.

Verification shape:
- Feed projection test: a sequence of tool-start, access-request, access-response, tool-result renders in that same relative order.
- Feed projection test: `access-request` from the same participant stays inside the relevant mid-turn group instead of being promoted above tool cards.
- Kernel/live integration test: a `PermissionRequest` emitted before the final tool transcript still renders as one pending tool/approval lifecycle, not as a detached approval above the tool.
- Stop-time projection test: finalized tool-use events merge with live access requests without duplicates or visual jumps.
- Concurrent approval test: two tools awaiting approval keep their own request cards/actions attached to the correct tool.
- Manual smoke: run an approval-gated Bash/Edit action and verify the approval box appears chronologically with the tool box, while the `Pending approval` control scrolls to that exact item.

## Task 25: Move participant strip into the row above the input

Problem:
The participant/agent strip currently sits in the far top-right shell chrome, away from the active compose area and visually colliding with the right-pane/header region. The user wants the participants moved into the row immediately above the input, in the main chat column, where the screenshot marks the empty horizontal space.

Concrete example:
- The active participant chip, agent model badge, and avatar controls appear at the top-right of the app.
- The compose input and Stop run button are at the bottom center.
- The empty row above the compose input is the intended location for participant presence/chips.
- Expected behavior: participant chips live in the composer-adjacent row above the input, aligned to the main input width, not floating at the far right of the whole chat container.

Current-code clue:
- `packages/renderer/src/shell/TopBar.tsx` renders the unified participant strip inside `.topbar-right` / `.topbar-chips`.
- `packages/renderer/src/components/AgentChip.tsx`, `ParticipantAvatar`, `TerminalChip`, and `PlusButton` make up the existing participant/runtime strip.
- `packages/renderer/src/compose/Compose.tsx` owns the input and compose action dock, while `packages/renderer/src/shell/shell.css` currently positions `.feed-nav-cluster` as a floating control above compose.

Broad mitigation:
- Extract the participant/runtime strip from `TopBar` into a reusable component that can render inside the composer/feed shell without duplicating business logic.
- Place that component in a dedicated composer-adjacent row above the input, sharing the same horizontal coordinate system as the compose box and feed navigation.
- Keep the row visually quiet and scannable: participants/agents on one side, feed navigation on the opposite side, with stable height and no overlap with feed cards or the right pane.
- Remove or simplify the old top-right participant strip so participants do not appear in two locations.
- Preserve all existing participant affordances after the move:
  - user avatar;
  - agent chip name/color;
  - active-turn pulse;
  - model/effort badge;
  - access-pending badge;
  - terminal chip;
  - spawn/add button;
  - chip click menus and reconnect/runtime actions.
- Ensure popover anchoring still works from the new lower location; menus should open into visible viewport space without covering the compose text when avoidable.
- Preserve keyboard/focus behavior and aria labels for the chips and add button.
- Handle overflow with horizontal scrolling or compacting inside the composer-width row, not by pushing into the right panel.
- On mobile or narrow widths, allow the row to wrap or collapse predictably while keeping the input usable.
- Coordinate with Task 7 so feed navigation and participant chrome share one deliberate above-input layout instead of becoming two unrelated floating controls.

Likely owners:
- `packages/renderer/src/shell/TopBar.tsx` for removing/extracting the current `.topbar-chips` strip.
- `packages/renderer/src/compose/Compose.tsx` or the compose/feed shell owner for rendering the new above-input participant row.
- `packages/renderer/src/shell/Feed.tsx` if the row is owned by the feed shell rather than the compose component.
- `packages/renderer/src/shell/shell.css` and `packages/renderer/src/components/chips.css` for positioning, overflow, and responsive behavior.
- `packages/renderer/src/components/AgentChip.tsx`, `TerminalChip`, `PlusButton`, and `AgentActionMenu` only if they need anchoring or compact-mode adjustments.
- `packages/renderer/src/hooks/useAgentSpawn.tsx` and `TopBarModalContext` wiring if spawn/reconnect/modals currently assume a topbar-only host.

Verification shape:
- Renderer/layout test or Playwright smoke: participant chips render in the row above the input and no participant strip remains at the far top-right.
- Playwright desktop screenshot: chips align to the compose/input column, feed navigation shares the same above-input row, and neither overlaps the right pane.
- Playwright narrow/mobile screenshot: the participant row remains usable without covering the textarea or action dock.
- Interaction smoke: click an agent chip, model badge, terminal chip, and plus button from the new row; each menu/modal opens in the correct place.
- State smoke: active-turn pulse, pending access badge, offline/pane-dead/hook-not-installed states, and Stop run visual state still update while an agent runs.
- Regression smoke: switching feed view modes, sessions, and right-panel tabs does not move the row back into global top chrome or duplicate the strip.

## Task 26: Add expandable, tweakable agent detail cards

Problem:
Agent cards/chips do not expose enough runtime detail or control. The user wants each agent card to show available context, used context, model used, effort used, permissions mode, and a terminal-opening shortcut. The details should be expandable, and the runtime/settings values should be tweakable through real options rather than static labels.

Concrete example:
- Agent chip/card currently shows the agent name, state, and a compact model badge when available.
- The right Agents panel currently has a `Context` metric that often reads `Unknown`, plus an `Access` value.
- Model/effort controls and access mode controls exist partly in backend routes, but they are not presented as one coherent agent-detail surface.
- Compact, clear, terminal, and goodbye/remove controls already exist in scattered icon/menu form, but they are not grouped with the context/runtime state where the user expects to act on them.
- Expected behavior: clicking or expanding an agent exposes a first-class card with context budget, runtime, effort, permission mode, and terminal controls in one place.

Current-code clue:
- `packages/shared/src/managedAgents.ts` already includes `AgentStatusRow.context`, `AgentStatusRow.access`, `AgentStatusRow.runtime_state`, `RuntimeControlCapabilities.access_modes`, and `access_change_supported`.
- `packages/shared/src/runtimeAdapters.ts` includes `CurrentRuntimeState` with observed and configured model/effort fields.
- `packages/kernel/src/routes/managedAgents.ts` already exposes runtime model/effort routes and access/context routes.
- `packages/renderer/src/api/managedAgents.ts` currently exposes `context`, `access`, and `setAccess`, but does not expose renderer helpers for runtime models/efforts/runtime override.
- `packages/renderer/src/panels/right/RightAgents.tsx` renders the existing right-panel agent row and terminal icon button.
- `packages/renderer/src/components/AgentChip.tsx` and `AgentActionMenu.tsx` render compact chip/menu behavior and already have an `Open terminal` action.

Broad mitigation:
- Create a dedicated expandable `AgentDetailsCard` or `AgentDetailsPopover` used by the participant strip and/or the right Agents panel, instead of scattering runtime data across chip badges, menus, and right-panel rows.
- Summary state should show:
  - agent name/color/status;
  - available context (`max_tokens`) and used context (`used_tokens`);
  - context percentage/progress when both values are known;
  - model used, distinguishing observed live model from configured override when they differ;
  - effort used, distinguishing observed live effort from configured override when they differ;
  - permission/access mode;
  - pending approval count;
  - terminal shortcut/action when a tmux session exists.
- Expandable sections should keep the dense info organized:
  - `Runtime`: model selector, effort selector, live/configured source labels, restart/apply behavior;
  - `Context`: used/available context, source, refresh, compact, clear, remove/goodbye, and runtime-supported context options if available;
  - `Permissions`: current mode, supported modes, reason when mode change is unsupported, pending requests link;
  - `Terminal`: open terminal button, visible shortcut hint, tmux/session id, reconnect when unavailable.
- Expose renderer API helpers for runtime model lists, effort lists, current runtime state, and runtime override application by wrapping the existing kernel endpoints.
- Model selector should fetch `/managed-agents/:id/runtime/models`, refresh on cache miss, and apply through `/managed-agents/:id/runtime`.
- Effort selector should fetch `/managed-agents/:id/runtime/efforts?model=...` and update when the selected model changes.
- Permission mode selector should use `agent.access.supported_modes` and `agent.access.change_supported`; unsupported modes should be visible but disabled with the backend reason.
- Context counters are observed data, not ordinary text fields. If "tweakable" context behavior is required, expose concrete runtime-safe actions/options near the context readout:
  - compact now;
  - clear context/session state;
  - remove/goodbye agent;
  - auto-compact threshold;
  - context window selection only when a runtime capability supports it.
- Compact should read as the everyday context-management action. Clear and remove/goodbye should be visually nearby but clearly marked as destructive or high-consequence, with confirmation and exact wording about what will be removed.
- Terminal shortcut should be visible on the card and wired to the existing `TopBarModalContext.openTerminalOverlay(tmux_session)` path. If no terminal session exists, show a disabled state with a reconnect/spawn path.
- Keep destructive controls (`clear`, `remove`/`goodbye`) separated enough from everyday tweak controls that the expanded card does not become a dangerous control wall, while still making them discoverable near the context controls.
- Preserve keyboard accessibility: expandable trigger, selects/menus, shortcut action, and focus return should work without a mouse.
- Keep unknown/unsupported states honest: display `Unknown`, `Unsupported`, or `Not reported by runtime` rather than fake numbers.

Likely owners:
- `packages/renderer/src/components/AgentChip.tsx` and `packages/renderer/src/components/AgentActionMenu.tsx` if the chip opens the new card/popover.
- `packages/renderer/src/panels/right/RightAgents.tsx` for replacing the current agent status row metrics with the richer expandable card.
- New shared renderer component under `packages/renderer/src/components/` or `packages/renderer/src/panels/right/` for the reusable agent details surface.
- `packages/renderer/src/api/managedAgents.ts` for runtime state/model/effort override client methods.
- `packages/shared/src/managedAgents.ts` and `packages/shared/src/runtimeAdapters.ts` if additional context-control capability metadata or response types are needed.
- `packages/kernel/src/routes/managedAgents.ts` if existing runtime/context/access endpoints need response-shape cleanup, context capability expansion, or permission-mode persistence improvements.
- Runtime adapters under `packages/kernel/src/runtimes/adapters/` for accurate model/effort lists and context availability reporting.
- `packages/renderer/src/modals/TerminalOverlay.tsx`, `TopBarModalContext`, and command-palette/shortcut owners if a global terminal-opening shortcut is added.
- CSS in `packages/renderer/src/components/chips.css`, right-panel styles, and `packages/renderer/src/shell/shell.css` for expanded card density and responsive layout.

Verification shape:
- Renderer test: an agent with known `used_tokens` and `max_tokens` renders available context, used context, and percentage/progress accurately.
- Renderer test: unknown or unsupported context renders honest fallback text without fake `0` values.
- Renderer/API test: model and effort selectors load options from the managed-agent runtime endpoints and apply overrides through the runtime override endpoint.
- Renderer test: configured model/effort and observed model/effort are both represented when they differ.
- Renderer/API test: permission mode options reflect `supported_modes`, disabled unsupported changes show `reason`, and successful changes update the card.
- Interaction smoke: expand/collapse the card, change model, change effort, change permission mode, compact context, clear context/session state, remove/goodbye an agent, and open terminal.
- Destructive-action smoke: clear and remove/goodbye require confirmation, use precise copy, and do not accidentally remove project files, sessions, or unrelated agents.
- Shortcut smoke: the displayed terminal shortcut opens the correct agent terminal and is disabled or rerouted when the agent has no tmux session.
- Accessibility smoke: all expandable sections and controls are reachable by keyboard and preserve focus after save/cancel.
- Regression smoke: pending approvals still appear through Task 13 controls and are not confused with persistent permission mode.

## Task 27: Render tool and approval errors as structured UI

Problem:
Errors currently appear as raw red strings inside cards. The screenshot shows an approval/action failure rendered as:
`POST /managed-agents/.../respond -> 409: {"error":"access request is not open"}`.
That leaks transport details as the primary UI, forces the user to parse JSON, and does not explain the recovery path.

Concrete example:
- User clicks approve/deny on an access request.
- The backend returns `409` because the access request is no longer open.
- The card still shows a large red raw HTTP method/path/status/body string under a `denied` card.
- Expected behavior: the card should show a concise, human-readable error state such as "Request already closed" or "Decision could not be sent", with raw HTTP details hidden behind a disclosure/copy affordance.

Current-code clue:
- `packages/renderer/src/cards/AccessRequestCard.tsx` catches errors from `respondAccessRequest`, stores `err.message`, and renders it directly in `<p className="access-request-error">`.
- `packages/renderer/src/api/managedAgents.ts` throws stringified request failures, so method/path/status/body can become user-facing copy.
- `packages/renderer/src/cards/ToolUseCard.tsx` marks failed tools with a `failed` pill, but expanded input/result still falls back to generic raw string/JSON rendering.
- Existing CSS has isolated `.access-request-error`, `.tool-use-card.error`, and other one-off error styles instead of a shared error presentation component.

Broad mitigation:
- Introduce a shared error normalizer for renderer API calls that preserves structured fields:
  - action/source label;
  - HTTP status;
  - method/path;
  - backend error code/message;
  - retryability;
  - raw body/details.
- Render errors with a dedicated `ErrorNotice`/`InlineError` component: icon, concise title, one-line explanation, optional recovery action, and a collapsed technical-details disclosure.
- Access approval errors should map common cases into meaningful states:
  - `409 access request is not open`: "Request already closed" or "This approval is no longer pending";
  - `404`: "Request was removed or belongs to another session";
  - network failure: "Could not reach F-Mark kernel";
  - origin/auth failure: "Request was blocked by auth/origin settings".
- On stale access-request errors, refresh or reconcile event state so the card stops offering approve/deny controls for a closed request.
- Keep raw method/path/status/body available for debugging through a collapsed details region and copy button, not as the primary red content.
- Apply the same structured error treatment to tool failures:
  - show failed command/tool, exit code/status when available, and concise stderr/stdout/error summary;
  - keep full raw result in a disclosure;
  - avoid rendering JSON blobs as the first thing the user sees.
- Error notices should integrate with Task 6 provider-aware tool adapters, Task 11 file-aware output, and Task 14 edit diffs so each tool type can present the most useful failure summary.
- Use accessible semantics (`role="alert"` only for newly surfaced actionable errors, otherwise `aria-live` or static status as appropriate) and do not rely on red text alone.
- Keep layout stable: errors should not stretch cards into unreadable walls or overlap action buttons.
- Provide clear next actions where safe: refresh request, show request, retry non-mutating action, open terminal/logs, copy details.

Likely owners:
- `packages/renderer/src/cards/AccessRequestCard.tsx` for approval-action error rendering and stale-request reconciliation.
- `packages/renderer/src/cards/ToolUseCard.tsx` and provider/tool adapter code from Task 6 for failed tool result formatting.
- `packages/renderer/src/api/managedAgents.ts` and `packages/renderer/src/api/client.ts` for typed/structured API errors instead of raw string-only exceptions.
- A new shared renderer component/helper under `packages/renderer/src/components/` or `packages/renderer/src/cards/` for reusable error notices.
- `packages/renderer/src/cards/cards.css`, `packages/renderer/src/shell/shell.css`, and component CSS for consistent error styling.
- `packages/kernel/src/routes/managedAgents.ts` and `packages/kernel/src/routes/events.ts` only if backend responses need stable machine-readable error codes.
- Right panel/agent card surfaces from Task 26, because their runtime/access-setting failures should reuse the same error component.

Verification shape:
- Renderer test: `AccessRequestCard` receives a thrown structured `409` "access request is not open" error and renders a friendly stale/closed-request notice with technical details collapsed.
- Renderer test: approval actions are disabled or reconciled after stale-request errors, rather than allowing repeated failed clicks.
- API test: managed-agent client preserves status/method/path/body in a typed error while exposing a concise user-facing message.
- Renderer test: failed tool results render a structured summary and keep raw JSON/stdout/stderr details behind disclosure.
- Accessibility test: error notice has appropriate semantic role/labels and is keyboard reachable.
- Visual smoke: approval errors, tool errors, file-preview errors, and agent-setting errors share one polished presentation style.
- Manual smoke: reproduce the screenshot's denied/stale approval case and confirm the card does not show raw `POST ... -> 409: {...}` as primary UI.

## Task 28: Fix Codex launch/runtime MCP approval handling

Problem:
Managed Codex agents do not reliably work after launch. One concrete failure is that Codex can get stuck in the terminal on the first F-Mark MCP call. The terminal prompt asks whether to allow the `fmark` MCP server to run `fmark_post_prose`, even though the managed launch prompt tells the agent to immediately call that tool to announce it is connected. The prompt is not shown as an approval card in chat, so the agent appears broken unless the user opens the terminal and answers there.

Concrete example:
- User launches a Codex managed agent.
- The launch prompt instructs it to call `fmark_post_prose` with `participant_id`, `session_id`, and `content: "Connected. What would you like to work on?"`.
- Codex opens an interactive terminal prompt: `Allow the fmark MCP server to run tool "fmark_post_prose"?`.
- No corresponding F-Mark approval/confirmation card appears in the chat.
- Expected behavior: either this trusted bootstrap F-Mark MCP call is already allowed, or the permission request appears in the chat with approve/deny controls and pending-approval state.

Current-code clue:
- `packages/kernel/src/routes/managedAgents.ts` calls `applyIntegration` before spawn, but this is best-effort and does not currently guarantee that Codex can run the first F-Mark MCP write without an interactive prompt.
- `packages/kernel/src/mcpInstall/codex.ts` explicitly notes that Codex has no Claude-style per-tool allow list; Codex tool gating goes through `approval_policy` and the F-Mark `PermissionRequest` hook.
- `packages/kernel/src/hooksInstall/codex.ts` currently installs a `PermissionRequest` hook with `matcher: "Bash"` only. That likely misses MCP permission requests for `fmark_post_prose` and other `fmark_post_*` tools.
- `packages/kernel/src/runtimes/defaults.ts` gives Codex empty default args, and `spawnArgsForRuntime` appends only the launch prompt for Codex, so there is no visible launch-time approval policy override.
- `packages/kernel/src/hooks/autoStream.ts` can extract and post access requests from `PermissionRequest` hook payloads, but it only helps if Codex actually invokes the hook for the MCP permission prompt.

Broad mitigation:
- Define an explicit Codex bootstrap trust contract for F-Mark MCP tools:
  - F-Mark-owned MCP tools needed for managed-agent operation should not strand the launch in an invisible terminal prompt.
  - Auto-approval, if used, must be scoped to the `fmark` MCP server, known `FMARK_MCP_TOOL_NAMES`, and matching `participant_id`/`session_id`/path where possible.
  - Arbitrary external MCP tools and mismatched participant/session writes must still go through normal approval.
- Expand Codex `PermissionRequest` hook installation so it captures MCP/tool permission prompts, not only `Bash`.
  - Prefer a Codex-supported matcher that covers `fmark_post_*`/MCP tools.
  - If Codex only supports broad matching reliably, use a broad `PermissionRequest` hook and filter/route inside `autoStream`.
  - Detect old `matcher: "Bash"`-only installs as stale and auto-apply the corrected hook JSON.
- Verify Codex's expected `PermissionRequest` hook output schema and make `permissionHookOutput` runtime-aware if Codex needs a different approval/deny response format from Claude.
- Decide whether the preferred UX is:
  - trusted auto-allow for F-Mark bootstrap MCP writes; or
  - chat-surfaced approval cards for all such prompts.
  The implementation can support both, but the default managed launch should not silently hang.
- Add a post-spawn launch health check:
  - wait briefly for a connected prose event or an open access request;
  - if neither appears, show the agent as `awaiting input`/`setup blocked` with a link to open terminal/logs and integration setup.
- If an approval is required, route it through the normal access-request lifecycle:
  - chat card appears chronologically with the attempted tool;
  - `Stop run` morphs to pending-approval controls;
  - right Agents panel and participant chip show pending access count;
  - terminal prompt receives the response from the hook.
- Update Codex MCP/hook preflight to report "installed but MCP approvals not captured" as stale/blocked, rather than green.
- Keep the terminal as a fallback debugging surface, not the primary approval UI for managed launches.
- Add telemetry/logging for launch-blocking permission prompts so future runtime integrations can detect the same failure mode.

Likely owners:
- `packages/kernel/src/hooksInstall/codex.ts` for `PermissionRequest` matcher coverage, stale detection, and hook JSON snippets.
- `packages/kernel/src/mcpInstall/codex.ts` for Codex MCP registration, approval-policy notes, and install/preflight status.
- `packages/kernel/src/hooks/autoStream.ts` for Codex `PermissionRequest` parsing, runtime-specific approval output, and optional scoped auto-approval for trusted F-Mark MCP tools.
- `packages/kernel/src/mcp/tools.ts` for the canonical F-Mark MCP tool list used in any auto-approval/filtering rule.
- `packages/kernel/src/routes/managedAgents.ts` for spawn integration preflight/apply behavior, launch health checks, and agent status updates.
- `packages/kernel/src/runtimes/defaults.ts` or runtime registry handling if Codex needs explicit default args/config for approval policy.
- `packages/shared/src/managedAgents.ts` if a new launch/setup-blocked or approval-capture status needs to be represented.
- `packages/renderer/src/shell/AgentLauncher.tsx`, `RightAgents.tsx`, and participant/agent-chip UI for blocked-launch/pending-approval presentation.
- `packages/renderer/src/cards/AccessRequestCard.tsx` and Task 13 pending-approval controls for the visible approval path.
- Codex integration setup modal/preflight UI if users need to repair old hooks/config.

Verification shape:
- Backend/unit test: Codex hook detection marks a `PermissionRequest` hook with only `matcher: "Bash"` as stale for managed F-Mark launches.
- Backend/unit test: applying Codex hooks writes a `PermissionRequest` hook that captures `fmark_post_prose` MCP permission prompts.
- Backend/unit test: a Codex `PermissionRequest` payload for `fmark_post_prose` either auto-approves when scoped to the current agent/session or posts an `access-request` event with full tool input.
- Backend/unit test: mismatched participant/session or non-F-Mark MCP tools are not silently auto-approved.
- Integration test: launch a managed Codex agent in a fresh setup; it posts the connected prose without requiring the user to open the terminal.
- Integration test: when approval is deliberately required, the chat shows a pending approval card and approving/denying it unblocks the terminal prompt.
- Renderer smoke: Codex launch stuck on permission shows `awaiting input`/pending-approval state in participant chip, right Agents panel, and primary compose action.
- Manual smoke: reproduce the screenshot by launching Codex; verify there is no invisible terminal-only `Allow fmark_post_prose` blocker.

## Task 29: Show multiple working agents concurrently

Problem:
When multiple agents are present or running in the same session, the UI does not clearly show multiple agents as working. The app has several binary or single-active-agent assumptions, so concurrent agent activity can collapse into one highlighted chip, one `Stop run` state, or one apparent active participant even when more than one agent is actually doing work.

Concrete example:
- User has multiple agents in the same chat/session.
- More than one agent is running, notified, or waiting on approval.
- The UI does not show multiple agents as working at the same time.
- Expected behavior: every current-session agent with active work should show its own working/pending state, and aggregate controls should make it clear how many agents are currently active.

Current-code clue:
- `packages/renderer/src/state/aggregate.ts` exposes only `currentTurnParticipantPrefix: "us" | "ag"`, not a set of active/working participant ids.
- `packages/renderer/src/shell/TopBar.tsx` resolves `activeParticipantId` to a single agent by picking `allAgentChips[0]` whenever `effectiveTurn === "ag"`.
- `packages/renderer/src/compose/Compose.tsx` computes `sessionAgentActive` and `isAgentTurn` as booleans, then renders one `Stop run` primary state even though `interruptSessionAgents` loops over every session agent.
- `packages/kernel/src/routes/managedAgents.ts` can return per-agent `activity_state`, but the renderer surfaces that mostly as individual chip dots/right-panel rows rather than a first-class multi-agent working summary.
- Control state appears to be updated on wake/notify paths, but launch/run/stop/hook transitions need audit to ensure each active agent's `activity_state` is authoritative.

Broad mitigation:
- Replace single-active-agent presentation with a per-agent working model for the current session.
- Derive and render a set of active agents, not just `ag`:
  - running;
  - notified;
  - access-pending;
  - launching;
  - stale but still expected to answer;
  - pane-dead or blocked when the agent should have been working.
- In the participant strip, allow multiple agent chips to show active/running treatment simultaneously. The currently focused or last-speaking agent can still be emphasized, but other working agents must remain visibly active.
- In the composer primary action, reflect aggregate state: `Stop 2 agents`, `Pending approval`, or a compact multi-agent status menu when more than one agent is active.
- Right Agents panel should list every current-session agent with accurate state, pending approvals, last event time, and terminal shortcut.
- Sessions list state from Task 20 should treat the session as working if any current-session agent is running/notified/access-pending.
- Backend status should update each agent independently:
  - spawn/launch sets launching or running appropriately;
  - wake sets notified/running per delivered agent;
  - hook/prose/tool activity updates the correct participant;
  - turn-end or idle detection clears the correct participant without clearing siblings;
  - access requests set only that participant to access-pending.
- Avoid using last `turn-end` alone as the source of truth for active agent count. Turn ownership and process activity are related but not identical in multi-agent sessions.
- Preserve the ability to stop/interrupt all active current-session agents, while also allowing per-agent stop from the expanded card.
- Keep mobile/narrow UI compact: show a count plus expandable active-agent list if every chip cannot fit.

Likely owners:
- `packages/renderer/src/state/aggregate.ts` if feed-derived turn state grows beyond a binary prefix.
- `packages/renderer/src/shell/TopBar.tsx` participant strip active-state derivation.
- `packages/renderer/src/compose/Compose.tsx` and `SendButton.tsx` for aggregate `Stop run`/pending approval copy and behavior.
- `packages/renderer/src/panels/right/RightAgents.tsx` and Task 26 agent detail cards for per-agent state display.
- `packages/renderer/src/panels/Sessions.tsx` and Task 20 session-state badges.
- `packages/kernel/src/routes/managedAgents.ts` and `packages/kernel/src/services/agentState.ts` for authoritative per-agent activity state transitions.
- `packages/kernel/src/hooks/autoStream.ts` if hooks should mark agents running/idle when activity is observed.
- Shared types in `packages/shared/src/managedAgents.ts` if active-agent summary fields need to be added.

Verification shape:
- Backend test: waking two agents in the same session marks both as notified/running without clobbering either control state.
- Backend test: one agent entering access-pending does not make sibling agents look access-pending or idle.
- Renderer test: when two current-session agents have active states, both chips show working treatment and the composer primary action reflects the count.
- Renderer test: interrupting from the aggregate Stop action targets every active current-session agent, not only the first chip.
- Renderer test: per-agent stop/terminal/action controls still target the correct participant.
- Playwright smoke: launch two agents, send a user turn, verify both can show active/pending independently in participant strip, right panel, and session list.

## Task 30: Ensure every current-session agent message appears in chat

Problem:
Agent messages are not reliably appearing in the chat. This is especially visible when multiple agents are present: some agent outputs may be written to the wrong session/path, hidden by feed filters, missed by websocket refresh, blocked by MCP approval, or only visible in the terminal/logs instead of the chat feed.

Concrete example:
- User starts or wakes multiple agents in a session.
- At least one agent writes or appears to write a message.
- The chat feed does not show that agent's message.
- Expected behavior: every prose/message event from every agent attached to the current session appears in the chronological chat feed with the correct participant identity, unless it is intentionally routed to a different surface such as a comment thread or document block.

Current-code clue:
- F-Mark MCP `fmark_post_prose` writes `/sessions/:id/events/prose` with `participant_id`, `content`, and `source: "mcp"`.
- `packages/kernel/src/routes/events.ts` publishes `event_added` after writing prose events.
- `packages/renderer/src/App.tsx` responds to `event_added` by refetching events only for the current session/path and `upsertEvent`ing the fresh list.
- `packages/renderer/src/state/aggregate.ts` hides comments, consumed child blocks, and some non-message prose from top-level feed slices, so agent output can look missing if it was posted with `mode`, `append_to`, or `name` unexpectedly.
- Task 28 can block Codex before its first message, which presents as "Codex messages do not appear" even if the renderer is otherwise correct.

Broad mitigation:
- Audit the full agent-message pipeline for every supported runtime:
  - managed launch/wake prompt;
  - MCP context resolution (`participant_id`, `session_id`, path);
  - event write route;
  - websocket broadcast;
  - renderer event refresh/upsert;
  - aggregate feed filtering;
  - card rendering.
- Ensure every managed agent process receives the correct `F_MARK_AGENT_ID`, `F_MARK_SESSION_ID`, `F_MARK_PATH`, and `F_MARK_RUNTIME_ID` at spawn/respawn/fork/wake time.
- Ensure MCP `resolveWriteContext` rejects mismatched session/participant/path clearly instead of silently writing somewhere else.
- Add diagnostics for agent output that lands outside the active session:
  - wrong session id;
  - stale path;
  - invalid participant id;
  - rejected write;
  - message posted as comment/content block rather than chat message.
- Keep feed filtering intentional:
  - plain `fmark_post_prose` with no `name`, `append_to`, `mode: "comment"`, or `removed` should appear as a chat message;
  - comments should be visible through Task 16 comment activity items;
  - named/document blocks should be visible in the document surface and not mistaken for missing chat.
- Renderer websocket refresh should handle rapid multi-agent writes without losing events, duplicating events, or racing with session/path switches.
- If an agent posts while the user is viewing a different session, update session unread/working state so the message is discoverable when returning.
- Add a small debug affordance in agent details/logs that shows last successful F-Mark write event for each agent, including session id and filename.
- Coordinate with Task 23 so F-Mark MCP transport/tool plumbing is not shown instead of the actual prose event.
- Coordinate with Task 29 so messages from each active agent update that agent's last-activity and working/read state.

Likely owners:
- `packages/kernel/src/mcp/context.ts` and `packages/kernel/src/mcp/tools.ts` for participant/session/path resolution on MCP writes.
- `packages/kernel/src/routes/events.ts`, `packages/kernel/src/services/events.ts`, and `packages/kernel/src/services/eventPublisher.ts` for write/publish behavior.
- `packages/kernel/src/routes/managedAgents.ts` for spawn/wake/fork env and active-session handling.
- `packages/renderer/src/App.tsx` websocket `event_added` refresh/upsert path.
- `packages/renderer/src/state/store.ts` `upsertEvent` ordering/dedupe.
- `packages/renderer/src/state/aggregate.ts` feed/message filtering.
- `packages/renderer/src/cards/EventCard.tsx`, `ProseCard.tsx`, and `MessageCard.tsx` for rendering message prose.
- Sessions/unread state owners from Task 20 for messages that arrive outside the current session.
- Task 28 Codex approval owners if Codex messages are missing because first MCP write is blocked.

Verification shape:
- Backend test: `fmark_post_prose` from two different agents in the same session writes two prose events with distinct participant ids.
- Backend test: stale/wrong session/path writes return clear errors and do not disappear silently.
- Renderer test: two agent prose events in the current session render as two chat messages with the correct names/avatars.
- Renderer test: rapid sequential `event_added` messages from multiple agents result in all events present in store.
- Renderer test: named/document/comment prose are routed intentionally and still discoverable through their expected surfaces.
- Integration smoke: launch two agents, have both post messages via MCP, verify both messages appear in Everything and Conversation feed modes.
- Cross-session smoke: agent posts in a background session; sessions list marks unread and the message appears when switching back.

## Task 31: Brief newly added agents that they are joining existing chat

Problem:
Adding an agent to an existing chat should tell the agent that it is joining an existing session with history and context, not starting a brand-new chat. The current launch prompt is mostly the generic MCP guide and a launch packet, so a newly added agent can greet as if there is no prior conversation or task state.

Concrete example:
- A session already has messages, tool outputs, comments, todos, or another agent's work.
- User adds a new agent to that session.
- The agent receives a generic launch prompt and may say "Connected. What would you like to work on?" without acknowledging the ongoing context.
- Expected behavior: the agent gets a short existing-chat brief, understands it is joining an ongoing session, and knows to read the context before responding.

Current-code clue:
- `packages/kernel/src/routes/managedAgents.ts` `buildLaunchPrompt` builds the same guide/launch packet whether the target session is empty or already active.
- Wake prompts use `readInbox` plus `buildCompassPacket`, but launch currently does not include recent session events.
- Respawn paths use `buildWakePrompt(buildCompassPacket({ events: [] }))` in places, which can also erase existing context when rejoining.
- `packages/kernel/src/compass/packet.ts` already has compact event-summary machinery that can be reused for a launch/join brief.

Broad mitigation:
- Make spawn/attach distinguish:
  - new empty session;
  - joining existing non-empty session;
  - respawning/reconnecting an existing agent;
  - fork-local copied agent joining a fork.
- For existing sessions, prepend a compact join brief to the launch prompt:
  - "You are joining an existing F-Mark session, not starting a new one";
  - session id and participant id;
  - current objective if inferable;
  - last N relevant events with participant names/kinds/summaries;
  - open todos/pending approvals/comments if available;
  - instruction to call `fmark_get_inbox` or `fmark_read_events` before making assumptions;
  - instruction not to post a generic "what would you like to work on?" if the chat already contains an active request.
- Keep the brief bounded and structured. Do not dump full transcripts into the launch prompt.
- If the session is truly empty, keep the current connected greeting flow.
- If the session has user messages but no prior agent response, tell the agent to answer the existing latest user request rather than ask for a new task.
- If multiple agents are already present, include their names/status and explain the new agent's role is collaborative, not replacing the others.
- Ensure the brief uses the same source-of-truth event summaries as wake packets so comment/file/tool context remains consistent.
- Update launch health logic from Task 28 so an agent blocked before its first post still retains the join brief after approval/resume.
- Avoid marking all existing events as seen for the newly added agent before it has a chance to read them, unless the join brief deliberately includes a cursor contract.

Likely owners:
- `packages/kernel/src/routes/managedAgents.ts` `buildLaunchPrompt`, spawn, reconnect, respawn, and fork-local launch paths.
- `packages/kernel/src/compass/packet.ts` for reusable compact event summaries.
- `packages/kernel/src/compass/inbox.ts` if launch should use an inbox-like snapshot without marking seen.
- `packages/kernel/src/routes/sessions.ts` fork handoff prompt if fork-local agents join non-empty fork context.
- Shared launch/wake packet types in `packages/shared` if a formal `fmark.launch_existing_session` packet is added.
- Renderer agent-launch surfaces only if they need to expose "joining existing chat" state or manual retry.

Verification shape:
- Backend test: spawning an agent into an empty session uses the normal connected/new-session launch prompt.
- Backend test: spawning an agent into a non-empty session includes an explicit existing-session brief and recent event summaries.
- Backend test: launch brief stays under the configured event/character limit and does not include full large file/tool outputs.
- Backend test: adding an agent to a session with a latest unanswered user message instructs the agent to answer that request, not ask for a new task.
- Integration smoke: add a second agent to an active chat and verify its first message acknowledges or acts on the existing context.
- Regression smoke: reconnect/respawn/fork prompts do not erase context or mark the wrong inbox cursor seen.

## Task 32: Align Opencode integration readiness with spawnable runtime registry

Problem:
The Opencode integration modal can report that the runtime, MCP, and hook are all ready, then fail on launch with `POST /managed-agents/spawn -> 400: {"error":"unknown runtime_id: opencode"}`. The setup/preflight surface and the backend spawn runtime registry disagree, so the user sees "We're all set up and ready to go" for an integration that cannot actually launch.

Concrete example:
- User opens the Opencode integration setup.
- Runtime, MCP, and Hook all show `Ready`.
- User clicks Launch.
- The spawn endpoint rejects `runtime_id: opencode` as unknown.
- Expected behavior: if Opencode is shown as ready, `/managed-agents/spawn` accepts `runtime_id: opencode` and launches it. If Opencode is installed but not registered/spawnable, the modal should block launch with a coherent setup action instead of showing all green.

Current-code clue:
- `packages/kernel/src/runtimes/defaults.ts` contains default runtime entries, including Opencode.
- The spawn route likely validates `runtime_id` against the effective runtime registry and returns `unknown runtime_id` when the id is missing.
- The integration preflight likely checks executable/MCP/hook readiness independently from the effective spawn registry, so a reachable binary can look ready even when spawn cannot use it.
- Agent launcher/runtime UI may expose Opencode from a hardcoded runtime list, env probe, or integration status instead of the exact registry source used by spawn.

Broad mitigation:
- Establish one launchability source of truth for runtime readiness:
  - runtime executable is reachable;
  - runtime id exists in the effective runtime registry;
  - registry entry contains the required executable/args/display metadata;
  - MCP and hook integration are ready for that same runtime id;
  - `/managed-agents/spawn` accepts the runtime id.
- Make Opencode setup/preflight include registry status. If the executable is installed but the runtime registry lacks `opencode`, show a blocked state such as `Installed but not registered`.
- Decide the intended registry semantics:
  - if defaults should always be present, make `loadRuntimeRegistry` merge `DEFAULT_RUNTIMES` consistently before spawn validation;
  - if users can intentionally remove defaults, make the launcher and integration modal respect that removal and stop advertising Opencode as launchable.
- Disable Launch while registry/spawnability is missing, and offer the exact repair action if one exists, such as restoring the default runtime entry or adding a runtime config.
- Format the spawn error through the structured error UI from Task 27 instead of rendering a raw red `POST ... -> 400` line.
- Add a preflight/spawn consistency check so every integration can answer: "would spawn accept this runtime id right now?"
- Keep this fix runtime-generic where possible so Claude, Codex, Opencode, and future runtimes cannot drift between setup readiness and spawnability.

Likely owners:
- `packages/kernel/src/runtimes/defaults.ts`.
- Runtime registry loading/validation under `packages/kernel/src/runtimes/`.
- `packages/kernel/src/routes/managedAgents.ts` spawn route and integration/preflight routes.
- `packages/kernel/src/mcpInstall/opencode.ts` and `packages/kernel/src/hooksInstall/opencode.ts` only if their ready state needs a registry gate.
- `packages/renderer/src/shell/AgentLauncher.tsx`.
- Integration setup modal/API files under `packages/renderer/src/`.
- Shared runtime/config types if registry status needs to travel to the renderer.

Verification shape:
- Backend test: with the default runtime registry, `/managed-agents/spawn` accepts `opencode`.
- Backend test: with a custom registry missing `opencode`, Opencode preflight reports blocked/registry-missing rather than all ready.
- Renderer test: the Opencode integration modal does not show "all set up" when spawn would reject the runtime id.
- Renderer test: Launch is disabled or replaced by a repair action when Opencode is installed but unregistered.
- Manual/Playwright smoke: open Opencode integration, verify readiness matches spawnability, click Launch, and observe either a running Opencode agent or a coherent blocked setup state.
- Regression smoke: Claude and Codex integration readiness still matches spawnability.

## Cross-task interaction risks

- Task 3 unlocks Task 5 in practice: fewer permission interrupts mean Stop hooks and live tool streaming have cleaner timing.
- Task 5 must respect Task 1: F-Mark MCP tools that post structured anchored prose should not also create unanchored generic tool-use cards.
- Task 2 still matters even if Task 3 reduces prompt frequency; other runtimes and non-F-Mark MCP servers can still emit permission requests.
- Task 4 is independent but affects perceived chat correctness because premature wakes can make any backend fix look unreliable.
- Task 6 builds on Task 5's live tool-use stream. Live visibility only helps if tool cards are readable enough to understand during the turn.
- Task 7 should not change Task 5 navigation behavior; it only changes where the existing feed controls live relative to the input.
- Task 8 interacts with Task 3: fewer F-Mark MCP prompts reduce access-request frequency, but true non-F-Mark permission prompts must still stay answerable and accurately represented.
- Task 9 should compose with Task 5: live tool-use cards can stream during a run, while the ASCII activity item remains the current tail until the run ends.
- Task 10 extends Task 5: completed-tool streaming is not enough; the active tool needs a start/update/final lifecycle with one visible card.
- Task 10 depends on Task 6 for readable live content inside the open tool card.
- Task 11 depends on Task 6's adapter structure and Task 10's live card updates so file snippets can appear progressively inside the active tool box.
- Task 12 builds on Task 2 for non-empty extraction, Task 8 for honest lifecycle state, and Task 11 for file/diff rendering inside approvals.
- Task 13 depends on Task 8 for accurate pending state and Task 12 for the approval item it scrolls to. It must not hide interrupt completely.
- Task 14 makes the diff requirement explicit for Task 11 and Task 12 so Edit/MultiEdit are not treated as generic file tools.
- Task 15 strengthens Task 1: agent wake packets can only preserve useful comment context if the UI first captures the correct comment target.
- Task 15 must compose with the right-panel comment flow. Feed highlights, comment quotes, and scroll-to-anchor cannot keep separate line math.
- Task 16 depends on Task 15 for correct target previews and click focus. A visible feed item that points at the wrong comment slice is worse than no item.
- Task 16 must stay read-only with respect to wake behavior from Task 4. Rendering comment activity in the feed must not cause another agent wake.
- Task 17 overlaps with Task 5 and Task 10 because live subagent capture and tool grouping share the same mid-turn group surface. Naming and title rendering should be normalized once and reused.
- Task 17 must remain distinct from ordinary tool presentation in Task 6. Subagents are child actors, not just another tool adapter.
- Task 18 should not interact with agent wake behavior from Task 4. Selecting a newly created session is a UI focus change, not a message send or wake event.
- Task 18 should preserve per-session panel state from existing `setCurrentSession` behavior while clearing stale session-scoped targets that cannot belong to the new session.
- Task 19 generalizes Task 18: newly created sessions should immediately become the persisted last-focused session, while cold-start restore should only select valid persisted sessions.
- Task 19 must not break unread behavior from the feed anchor model. Restoring scroll position and tracking read position need a single, predictable contract.
- Task 20 depends on Task 19 for persisted focus/order semantics. Deleting or reordering a session must update any saved focused-session and row-order state.
- Task 20 depends on Task 13 for accurate pending-approval state if `awaiting input` includes access approval blockers.
- Task 20 must not let drag/right-click/double-click gestures interfere with ordinary session selection from Task 18.
- Task 21 depends on the active-session restoration/focus work from Tasks 18 and 19. Todo assignee filtering is only correct if `currentSessionId` is correct.
- Task 21 must preserve Task 4 wake-gating semantics: assigning a todo can deliberately wake the selected current-session agent, but filtering must prevent accidental cross-session wakes.
- Task 22 directly affects Task 21: after a fork, both source and fork should have accurate current-session agent sets for todo assignment.
- Task 22 must compose with Task 20 session-state badges. Forking should not make the source falsely look agentless, done, or awaiting input because its agent was rebound away.
- Task 22 should feed Task 17's naming rules if duplicated fork-local agents need distinct but familiar names.
- Task 23 is a focused extension of Tasks 5, 6, and 10. It must suppress or compact internal F-Mark plumbing without breaking readable external tool cards or live native F-Mark events.
- Task 23 protects Task 12 and Task 13 from approval noise: internal F-Mark tool selection should not create misleading approval/tool surfaces when the native event is the actual user-facing result.
- Task 24 depends on Task 10's tool lifecycle model and Task 12/13's approval UI. Ordering should be solved through the same tool/request correlation, not with a separate visual-only sort.
- Task 24 must preserve Task 8's lifecycle semantics: an open approval should remain actionable and accurately pending even when grouped into a tool card.
- Task 24 also touches Tasks 5 and 6 because live provider adapters need to emit enough sequence/correlation data for renderer ordering to be deterministic.
- Task 25 should be implemented alongside or immediately after Task 7 because both controls belong in the same above-input layout row.
- Task 25 must preserve Task 13's pending-approval visibility because the participant strip carries access-pending agent badges.
- Task 25 must compose with Task 20 session-state work: participant chips should reflect the current session/workspace state after focus, rename, delete, reorder, or fork changes.
- Task 26 builds on Task 25 if the expanded card opens from the composer-adjacent participant strip, but it should also work from the right Agents panel.
- Task 26 must not blur Task 13 semantics: persistent permission mode and one-off pending approvals need distinct UI labels and actions.
- Task 26 depends on Task 20 and Task 22 for accurate current-session agent state, especially after session switches and forks.
- Task 26 should reuse Task 17's agent/subagent identity rules so expanded cards for subagents or fork-local agents do not regress to raw ids.
- Task 27 supports Tasks 12, 13, and 24: approval UI must distinguish request status, action failures, and stale closed requests without reordering or reopening cards.
- Task 27 builds on Tasks 6, 11, and 14 so tool, file, and diff failures use type-aware summaries rather than raw JSON walls.
- Task 27 should be reused by Task 26 for model/effort/permission-setting failures, keeping agent-card controls from inventing another error style.
- Task 28 is the Codex-specific counterpart to Task 3. Claude allow-list fixes do not cover Codex because Codex approval gating uses hooks/policy, not `permissions.allow`.
- Task 28 depends on Tasks 8, 12, 13, and 24 if the fallback path is chat-surfaced approval rather than bootstrap auto-allow.
- Task 28 must respect Task 23: F-Mark MCP tool calls used for native events should not become ugly generic tool cards while their approval state is still visible.
- Task 28 should feed Task 20 session-state badges and Task 26 agent details so a launch blocked on approval appears as awaiting input/setup blocked, not merely offline.
- Task 28 should reuse Task 27 error presentation for failed hook responses, stale approval requests, and broken Codex config/preflight results.
- Task 29 builds on Task 25 participant-strip placement and Task 26 agent detail cards: the new location must show multiple active agents, not just move the old single-active assumption.
- Task 29 must feed Task 20 session badges so sessions with more than one working agent show accurate aggregate state.
- Task 30 depends on Task 28 for Codex because a blocked first MCP write looks like a missing message.
- Task 30 must compose with Tasks 16 and 23 so comments/native F-Mark events are discoverable without showing internal MCP plumbing.
- Task 31 supports Task 30: a newly added agent cannot post the right message if its launch prompt says "new chat" instead of "join existing chat."
- Task 31 should reuse Task 1 and Task 4 packet/wake semantics so adding an agent does not accidentally wake the wrong participants or send context-free prompts.
- Task 32 is the Opencode counterpart to Task 28's Codex launch reliability work. Both need the integration setup, runtime registry, and spawn route to agree before user-facing readiness is shown.
- Task 32 should reuse Task 27 error presentation for failed spawn/preflight actions rather than introducing another raw endpoint-error style.
- Task 32 supports Task 30 because an Opencode agent that cannot launch cannot post chat messages, but message delivery should still be tested separately after launch succeeds.

## Suggested subagent dispatch

1. Packet/context subagent: Task 1.
2. Access-card extraction subagent: Task 2.
3. MCP install subagent: Task 3.
4. Compose wake-gating subagent: Task 4.
5. Hook streaming subagent: Task 5.
6. Tool-card presentation subagent: Task 6.
7. Compose/feed layout subagent: Task 7.
8. Access-request lifecycle subagent: Task 8.
9. Running-activity feed subagent: Task 9.
10. Live tool-card lifecycle subagent: Task 10.
11. File-aware tool UI subagent: Task 11.
12. Approval-card presentation subagent: Task 12.
13. Pending-approval primary action subagent: Task 13.
14. Edit diff component subagent: Task 14.
15. Comment targeting geometry subagent: Task 15.
16. Comment activity feed subagent: Task 16.
17. Subagent identity/title component subagent: Task 17.
18. Session creation focus subagent: Task 18.
19. Startup restoration subagent: Task 19.
20. Sessions/workspaces management subagent: Task 20.
21. Todo assignee scoping subagent: Task 21.
22. Fork agent duplication subagent: Task 22.
23. F-Mark internal tool rendering subagent: Task 23.
24. Approval/tool chronology subagent: Task 24.
25. Participant strip layout subagent: Task 25.
26. Agent detail card controls subagent: Task 26.
27. Error presentation subagent: Task 27.
28. Codex launch approval subagent: Task 28.
29. Multi-agent working-state subagent: Task 29.
30. Agent message delivery subagent: Task 30.
31. Existing-chat launch brief subagent: Task 31.
32. Opencode runtime registry/preflight subagent: Task 32.
33. Integration reviewer subagent: cross-task verification, duplicate detection, and manual smoke checklist.

Each implementation subagent should return:
- Files touched.
- Root cause confirmed from current code.
- Exact tests run.
- Remaining risk or manual smoke needed.

## Acceptance checklist

- [ ] Comment wake packets expose enough anchor metadata for an agent to reply in context.
- [ ] Access request cards no longer render empty for structured MCP payloads.
- [ ] Claude F-Mark MCP installs include a complete exact allow list and stale detection.
- [ ] Compose wakes agents only for mentions or real turn-end intent.
- [ ] Live tool-use events appear during agent work without duplicate final cards.
- [ ] Tool cards show provider-aware descriptions and results instead of raw JSON as the primary UI.
- [ ] Feed navigation sits directly above the compose input and aligns to the input's right edge.
- [ ] Access requests stay actionable and accurately labeled while the provider terminal is still waiting.
- [ ] Animated ASCII activity appears as the last chat item while an agent is running.
- [ ] The currently running tool card opens automatically and fills in real time without duplicate final cards.
- [ ] File-related tool cards render pressable file refs, structured params, and dedicated line/diff snippets.
- [ ] Approval/confirmation cards render provider-aware request content with clear decision context for every supported request type.
- [ ] Pending approvals morph the primary action into approval controls with show/approve/deny/provider-suggestion actions.
- [ ] Edit and MultiEdit tool/approval cards use a readable first-class diff component instead of raw JSON.
- [ ] Line/comment hover and selection target the exact rendered text/range, defaulting to a single target unless a true range is selected.
- [ ] Comment activity appears in the chat feed with previews, and clicking it opens/focuses the matching right-panel comment thread/comment.
- [ ] Subagents get stable regular-agent-style names and render through dedicated subagent title/card components instead of raw ids or generic tool chrome.
- [ ] User-initiated session creation immediately focuses/selects the newly created session across every creation surface.
- [ ] Opening the app restores the last focused valid session and its saved feed/right-panel/file-viewer context.
- [ ] Sessions/workspaces can be renamed, removed, reordered, context-managed, and show accurate working/read/unread/awaiting-input state.
- [ ] Todo creation/reassignment only offers agents attached to the current session, while preserving historical assignee labels.
- [ ] Forking a session duplicates/relaunches fork-local agents without moving agents out of the source session.
- [ ] F-Mark MCP tool calls and tool-discovery plumbing do not render as raw generic JSON cards in the primary chat feed.
- [ ] Approval/access-request cards render chronologically with their related tool boxes and never float above unrelated or later tool items.
- [ ] Participant/user/agent chips live in the composer-adjacent row above the input, aligned with the input, with no duplicate far-right topbar strip.
- [ ] Agent cards expose expandable context, runtime model/effort, permission mode, compact/clear/remove actions, and terminal controls with real editable options where supported.
- [ ] Tool, approval, file, and agent-control errors render as structured readable notices with raw technical details collapsed.
- [ ] Managed Codex launch does not strand the initial `fmark_post_prose` permission prompt in the terminal; it is either safely pre-approved or surfaced as a chat approval.
- [ ] Multiple current-session agents can show as working/pending at the same time across participant strip, composer action, right panel, and session list.
- [ ] Messages from every current-session managed agent appear in the chat/feed with the correct participant identity and session/path routing.
- [ ] Adding an agent to an existing non-empty chat gives it a bounded existing-session brief instead of a new-chat prompt.
- [ ] Opencode integration readiness agrees with `/managed-agents/spawn`: launch succeeds when ready, and registry-missing setups show a coherent blocked/repair state.
- [ ] Cross-task smoke confirms the mitigations compose in a real managed-agent session.
