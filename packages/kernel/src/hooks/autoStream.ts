import { readFile } from "fs/promises";
import { readActiveSession } from "../agents/activeSession.js";
import { loadHookContext } from "./bootstrap.js";
import { postProjectedEvents } from "./post.js";
import { projectTurnToEvents } from "./projectTurn.js";
import { extractLastAssistantTurn } from "./transcript.js";

export type AutoStreamKind = "assistant" | "user";

interface AssistantStdin {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  stop_hook_active?: boolean;
}

interface UserStdin {
  cwd: string;
  hook_event_name: string;
  prompt?: string;
  user_input?: string;
}

export async function runAutoStream(
  participantId: string,
  kind: AutoStreamKind,
  stdinRaw: string,
): Promise<number> {
  let payload: AssistantStdin | UserStdin;
  try {
    payload = JSON.parse(stdinRaw);
  } catch {
    process.stderr.write("f-mark auto-stream: invalid JSON on stdin\n");
    return 0;
  }

  const cwd = (payload as { cwd?: string }).cwd ?? process.cwd();
  let ctx;
  try {
    ctx = await loadHookContext(cwd);
  } catch (err: any) {
    process.stderr.write(`f-mark auto-stream: ${err.message}\n`);
    return 0;
  }

  const sessionId = await readActiveSession(ctx.fmarkDir, participantId);
  if (!sessionId) {
    process.stderr.write(
      `f-mark auto-stream: no active session for ${participantId}; run POST /agents/${participantId}/link first\n`,
    );
    return 0;
  }

  if (kind === "assistant") {
    const a = payload as AssistantStdin;
    if (a.stop_hook_active === true) return 0;
    let transcript: string;
    try {
      transcript = await readFile(a.transcript_path, "utf8");
    } catch (err: any) {
      process.stderr.write(
        `f-mark auto-stream: cannot read transcript ${a.transcript_path}: ${err.message}\n`,
      );
      return 0;
    }
    const blocks = extractLastAssistantTurn(transcript);
    const events = projectTurnToEvents(blocks);
    if (events.length === 0) return 0;
    await postProjectedEvents(ctx, participantId, sessionId, events);
    return 0;
  }

  // kind === "user"
  const u = payload as UserStdin;
  const text = (u.prompt ?? u.user_input ?? "").trim();
  if (!text) return 0;
  // User prompts post a single prose event and never emit turn-end (turns are
  // owned by assistants). Skip postProjectedEvents (which appends turn-end
  // after concluding prose) and POST directly.
  const res = await fetch(`${ctx.kernelUrl}/sessions/${sessionId}/events/prose`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.token}`,
    },
    body: JSON.stringify({
      participant_id: participantId,
      content: text,
      arbitrary: false,
    }),
  });
  if (!res.ok) {
    process.stderr.write(
      `f-mark auto-stream: POST /events/prose → ${res.status}\n`,
    );
  }
  return 0;
}
