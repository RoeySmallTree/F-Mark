import { useState } from "react";
import { useStore } from "../state/store.js";
import { createClient } from "../api/client.js";

export function Composer(): JSX.Element {
  const token = useStore((s) => s.token);
  const sessionId = useStore((s) => s.currentSessionId);
  const userId = useStore((s) => s.currentUserId);
  const mode = useStore((s) => s.composeMode);
  const setMode = useStore((s) => s.setComposeMode);
  const commentTarget = useStore((s) => s.commentTarget);
  const setCommentTarget = useStore((s) => s.setCommentTarget);
  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit =
    sessionId !== null &&
    userId !== null &&
    content.trim().length > 0 &&
    (mode !== "named" || name.trim().length > 0);

  async function submit(): Promise<void> {
    if (!canSubmit || sessionId === null || userId === null) return;
    setBusy(true);
    try {
      const client = createClient({ baseUrl: "", token });
      const body: {
        participant_id: string;
        content: string;
        name?: string;
        target?: { file: string; lines?: [number, number] };
      } = { participant_id: userId, content };
      if (mode === "named") body.name = name.trim();
      if (mode === "comment" && commentTarget !== null) body.target = commentTarget;
      await client.postProse(sessionId, body);
      setContent("");
      if (mode === "comment") setCommentTarget(null);
    } finally {
      setBusy(false);
    }
  }

  async function endTurn(): Promise<void> {
    if (sessionId === null || userId === null) return;
    const client = createClient({ baseUrl: "", token });
    await client.postTurnEnd(sessionId, userId);
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2 text-xs">
        <button
          onClick={() => setMode("message")}
          className={[
            "rounded px-2 py-1",
            mode === "message" ? "bg-neutral-200" : "hover:bg-neutral-100",
          ].join(" ")}
        >
          💬 Message
        </button>
        <button
          onClick={() => setMode("named")}
          className={[
            "rounded px-2 py-1",
            mode === "named" ? "bg-neutral-200" : "hover:bg-neutral-100",
          ].join(" ")}
        >
          📝 Name it
        </button>
        {mode === "comment" && commentTarget !== null && (
          <span className="rounded bg-yellow-100 px-2 py-1 text-yellow-900">
            Commenting on {commentTarget.file}
            <button
              onClick={() => setCommentTarget(null)}
              className="ml-2 text-yellow-700"
            >
              ✕
            </button>
          </span>
        )}
        <button
          onClick={() => void endTurn()}
          className="ml-auto rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
        >
          End turn
        </button>
      </div>
      {mode === "named" && (
        <input
          type="text"
          placeholder="Name (e.g. Launch Plan v1)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      )}
      <div className="flex gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            mode === "comment" ? "Add a comment…" : "Write something…"
          }
          rows={3}
          className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <button
          onClick={() => void submit()}
          disabled={!canSubmit || busy}
          className="rounded bg-neutral-900 px-3 text-sm text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
