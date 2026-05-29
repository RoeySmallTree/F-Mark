import type { HookContext } from "./bootstrap.js";
import type { ProjectedEvent } from "./projectTurn.js";
import type {
  CurrentRuntimeState,
  PostAccessRequestBody,
  PostAccessResponseBody,
} from "@f-mark/shared";

async function httpPost(url: string, token: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${url} → ${res.status}`);
  }
}

export async function postProjectedEvents(
  ctx: HookContext,
  participantId: string,
  sessionId: string,
  events: ProjectedEvent[],
  options: { emitTurnEnd?: boolean } = {},
): Promise<void> {
  const emitTurnEnd = options.emitTurnEnd ?? true;
  let lastWasConcluding = false;
  for (const ev of events) {
    if (ev.kind === "prose") {
      await httpPost(`${ctx.kernelUrl}/sessions/${sessionId}/events/prose`, ctx.token, {
        participant_id: participantId,
        content: ev.content,
        arbitrary: ev.arbitrary,
        source: "hook",
        path: ctx.path,
      });
      lastWasConcluding = !ev.arbitrary;
    } else if (ev.kind === "tool-use") {
      await httpPost(`${ctx.kernelUrl}/sessions/${sessionId}/events/tool-use`, ctx.token, {
        participant_id: participantId,
        tool_name: ev.tool_name,
        tool_use_id: ev.tool_use_id,
        input: ev.input,
        result: ev.result,
        success: ev.success,
        path: ctx.path,
      });
      lastWasConcluding = false;
    } else if (ev.kind === "subagent-run") {
      const { kind: _kind, ...body } = ev;
      await httpPost(
        `${ctx.kernelUrl}/sessions/${sessionId}/events/subagent-run`,
        ctx.token,
        {
          participant_id: participantId,
          ...body,
          path: ctx.path,
        },
      );
      lastWasConcluding = false;
    } else {
      const { kind: _kind, ...body } = ev;
      await httpPost(
        `${ctx.kernelUrl}/sessions/${sessionId}/events/subagent-output`,
        ctx.token,
        {
          participant_id: participantId,
          ...body,
          path: ctx.path,
        },
      );
      lastWasConcluding = false;
    }
  }
  if (lastWasConcluding && emitTurnEnd) {
    await httpPost(`${ctx.kernelUrl}/sessions/${sessionId}/events/turn-end`, ctx.token, {
      participant_id: participantId,
      source: "hook",
      path: ctx.path,
    });
  }
}

export async function postAccessRequest(
  ctx: HookContext,
  sessionId: string,
  body: PostAccessRequestBody,
): Promise<void> {
  await httpPost(
    `${ctx.kernelUrl}/sessions/${sessionId}/events/access-request`,
    ctx.token,
    { ...body, path: ctx.path },
  );
}

export async function postAccessResponse(
  ctx: HookContext,
  sessionId: string,
  body: PostAccessResponseBody,
): Promise<void> {
  await httpPost(
    `${ctx.kernelUrl}/sessions/${sessionId}/events/access-response`,
    ctx.token,
    { ...body, path: ctx.path },
  );
}

export async function postPing(ctx: HookContext, participantId: string): Promise<void> {
  try {
    await fetch(`${ctx.kernelUrl}/agents/${participantId}/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.token}` },
      body: "{}",
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // best-effort: network errors, non-2xx, and timeouts are all swallowed
  }
}

/* Best-effort POST of the latest observed runtime state for a managed
   agent. Called by autoStream after adapter.readCurrent. The kernel
   service stores it and broadcasts a managed-agent.updated row with
   runtime_state populated; renderer dispatches to its store. Errors are
   swallowed — runtime state is a UX nice-to-have, never blocks a turn. */
export async function postRuntimeState(
  ctx: HookContext,
  participantId: string,
  state: CurrentRuntimeState,
): Promise<void> {
  try {
    await fetch(
      `${ctx.kernelUrl}/managed-agents/${participantId}/runtime-state`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ctx.token}`,
        },
        body: JSON.stringify(state),
        signal: AbortSignal.timeout(2000),
      },
    );
  } catch {
    // best-effort
  }
}
