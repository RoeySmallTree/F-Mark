# Sub-Agent Streaming Plan

> Date: 2026-05-25  
> Purpose: track and present output from sub-agents launched by a managed agent, while preserving parent-agent attribution.

## Product Goal

When an agent launches a sub-agent, F-Mark should show that sub-agent's work in the chat instead of flattening it into anonymous tool output.

The UI should make the relationship clear:

- parent agent invoked the sub-agent,
- sub-agent has the name/title the parent runtime gave it,
- sub-agent output appears inside a dedicated nested box within the parent agent's turn,
- final parent response remains the main visible answer.

Research inputs now integrated:

- `planning/mcp/research-mcp-kernel-architecture.md`: prefer explicit event kinds `subagent-run` and `subagent-output`, with source/source confidence/correlation fields so the renderer can group by parent ids instead of relying on participant contiguity.
- `planning/mcp/research-fmark-ui-backend-integration.md`: host grouping in `projectFeed.ts`, render nested cards in `ArbitraryGroupCard.tsx`, keep fallback display in `EventCard.tsx`, and style in `cards.css`.
- `planning/mcp/research-claude-runtime.md`: Claude exposes sub-agent final data through the `Agent` tool plus `SubagentStart`/`SubagentStop`; progressive TUI output still needs smoke tests.
- `planning/mcp/research-codex-runtime.md`: Codex exposes `SubagentStart`/`SubagentStop`; final-result boxes are viable, while progressive/nested tool visibility likely needs app-server or transcript fixtures.
- `planning/mcp/research-gemini-runtime.md`: Gemini exposes `invoke_agent` with `agent_name` and a final result; v1 should be final-result-only unless stream fixtures prove progress events.

## User-Facing Presentation

Render sub-agent work as a nested "sub-agent box" inside the parent agent's live output group.

Visual contract:

- Header: sub-agent name plus parent agent name.
- Status: running, completed, failed, cancelled, unknown.
- Body: streamed text chunks when available.
- Tool calls: compact cards nested inside the sub-agent box when attributable.
- Result: final returned content or summary.
- Collapse by default after the parent turn ends unless the sub-agent failed or produced an important result.

Example:

```text
Ada is working

  Researcher
  launched by Ada
  [running]
  ... streamed sub-agent output ...

Ada
Final answer...
```

Do not create a top-level participant chip for every sub-agent in v1. Treat it as a subentity of the invoking agent unless we later decide sub-agents can become durable F-Mark participants.

## Data Model

Add sub-agent run records as explicit event kinds. Research recommends this over attaching opaque metadata to arbitrary prose/tool-use events because grouping must survive arbitrary stream ordering.

Event model:

```ts
interface SubagentRunEvent {
  schema: "fmark.subagent-run.v1";
  parent_participant_id: string;
  parent_runtime_id: string;
  parent_turn_id?: string;
  parent_tool_use_id?: string;
  subagent_id: string;
  name: string;
  role?: string;
  prompt_preview?: string;
  status: "started" | "running" | "completed" | "failed" | "cancelled" | "unknown";
  started_at: string;
  ended_at?: string;
  correlation_id?: string;
  source_confidence: "high" | "medium" | "low";
  source:
    | "hook"
    | "transcript"
    | "terminal-stream"
    | "mcp-middleware"
    | "unknown";
}

interface SubagentOutputEvent {
  schema: "fmark.subagent-output.v1";
  parent_participant_id: string;
  parent_runtime_id: string;
  parent_turn_id?: string;
  parent_tool_use_id?: string;
  subagent_id: string;
  content: string;
  arbitrary: boolean;
  sequence?: number;
  correlation_id?: string;
  source_confidence: "high" | "medium" | "low";
  source: "hook" | "transcript" | "terminal-stream" | "unknown";
}
```

Minimum v1 fields:

- parent participant id,
- parent runtime id,
- sub-agent id,
- sub-agent name/title,
- output content,
- status when known,
- source confidence.
- correlation id or derived grouping key.
- sequence number for chunk ordering.

## Attribution Rules

Parent attribution:

- Always attribute the visible parent turn to the invoking F-Mark agent.
- Sub-agent box header shows the sub-agent name and "launched by <parent display name>".
- If the runtime exposes a sub-agent role/type, show it as secondary metadata.

Sub-agent naming:

- Prefer the runtime-provided sub-agent name/title.
- If runtime exposes only a task description, derive a short display label from it.
- If neither is available, use `Sub-agent`.
- Keep the raw runtime name in metadata for debugging.

Sub-agent identity:

- Use runtime sub-agent id when available.
- Else derive a stable id from parent turn id + tool-use id + sequence.
- Do not reuse ids across parent turns unless the runtime proves the sub-agent identity is durable.

## Capture Sources

Possible data sources:

- structured hook payloads,
- per-session transcript files,
- tool-use records for "Task", "agent", "subagent", or equivalent tools,
- terminal stream markers,
- MCP middleware if a future runtime exposes sub-agent events through tools.

Capture priority:

1. Structured hook/live stream event with explicit sub-agent fields.
2. Transcript records with parent/child/tool-use correlation.
3. Tool-use start/result records containing sub-agent name and final output.
4. Terminal stream pattern detection as a fallback only.

If only final result is available, render a completed sub-agent box with the final result instead of progressive streaming.

## Runtime Adapter Plan

| Runtime | V1 capture | Key fields | Remaining smoke checks |
|---|---|---|---|
| Claude | Final-result box from `Agent` tool hooks plus `SubagentStart`/`SubagentStop`. | `tool_use_id`, `subagent_type`, `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`, final content/status. | Progressive child output and nested tool attribution from TUI/transcript fixtures. |
| Codex | Final-result box from `SubagentStart`/`SubagentStop`. | `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`, `turn_id`. | Progressive output and nested tool/failure attribution through app-server or transcript fixtures. |
| Gemini | Final-result box from `invoke_agent`. | `tool_name: "invoke_agent"`, `tool_id` when stream JSON is available, `parameters.agent_name`, final tool result. | Whether hooks/transcripts expose stable tool ids and progressive `SubagentProgress`. |

V1 default:

- Ship final-result-only nested boxes for runtimes with verified fixtures.
- Enable progressive output only behind per-runtime capability flags.
- Do not infer sub-agent structure from arbitrary terminal text unless a future fixture gives high-confidence markers.

## Backend Implementation Checklist

- [ ] Add sub-agent stream parser abstraction.
- [ ] Add runtime capability flags for sub-agent visibility.
- [ ] Add explicit `subagent-run` and `subagent-output` event types.
- [ ] Add per-runtime adapters for Claude `Agent`, Codex `SubagentStart`/`SubagentStop`, and Gemini `invoke_agent`.
- [ ] Correlate sub-agent runs to parent participant and parent turn.
- [ ] Correlate sub-agent runs to parent tool-use id when available.
- [ ] Store sub-agent name/title.
- [ ] Store source, source confidence, correlation id, sequence, and runtime ids.
- [ ] Store progressive output chunks when available.
- [ ] Store final result when only final output is available.
- [ ] Mark source confidence and capability fallback.
- [ ] Ensure parent agent session/auth defaults still apply.
- [ ] Add tests for final-result-only sub-agent capture.
- [ ] Add tests for progressive sub-agent output capture where fixtures allow it.
- [ ] Add tests that unattributable output remains parent arbitrary output, not a fake sub-agent.

## Frontend Implementation Checklist

- [ ] Add `SubagentBox` component.
- [ ] Update `projectFeed.ts` grouping to attach `subagent-run`/`subagent-output` events to the parent live output group.
- [ ] Nest sub-agent boxes inside the parent agent's working/live output group in `ArbitraryGroupCard.tsx`.
- [ ] Add fallback presentation in `EventCard.tsx` when an event cannot be grouped.
- [ ] Render sub-agent name and parent relationship.
- [ ] Render running/completed/failed/cancelled status.
- [ ] Render streamed chunks progressively when available.
- [ ] Render final result when only final output exists.
- [ ] Render sub-agent tool calls inside the nested box when attributable.
- [ ] Collapse completed sub-agent boxes after parent turn end.
- [ ] Keep failed sub-agent boxes expanded by default.
- [ ] Add renderer tests for nested presentation and collapse behavior.

## Open Questions

- Should sub-agents ever become durable F-Mark participants?
- Should users be able to mention or assign todos to a sub-agent, or only to its parent agent?
- Should sub-agent output be searchable as independent events or only as nested turn detail?
- Do Claude or Codex progressive sub-agent streams pass smoke tests strongly enough to enable live child output in v1?
- Should terminal-pattern fallback be omitted entirely until a user explicitly enables an experimental detector?
