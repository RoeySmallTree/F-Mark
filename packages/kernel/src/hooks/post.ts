import type { HookContext } from "./bootstrap.js";
import type { ProjectedEvent } from "./projectTurn.js";

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
      });
      lastWasConcluding = !ev.arbitrary;
    } else {
      await httpPost(`${ctx.kernelUrl}/sessions/${sessionId}/events/tool-use`, ctx.token, {
        participant_id: participantId,
        tool_name: ev.tool_name,
        tool_use_id: ev.tool_use_id,
        input: ev.input,
        result: ev.result,
        success: ev.success,
      });
      lastWasConcluding = false;
    }
  }
  if (lastWasConcluding && emitTurnEnd) {
    await httpPost(`${ctx.kernelUrl}/sessions/${sessionId}/events/turn-end`, ctx.token, {
      participant_id: participantId,
    });
  }
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
