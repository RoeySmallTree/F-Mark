/* Agents section — Settings → Connected agents.
   Lists every agent participant. Each row shows name + ID + status pill
   (`on` iff this agent has at least one event in the last 7 days, `off`
   otherwise) and a "Copy orientation snippet" button. An inline +Add form
   at the bottom registers a brand new agent. */

import { useMemo, useState, type JSX } from "react";
import { createClient } from "../../api/client.js";
import { ParticipantAvatar } from "../../components/ParticipantAvatar.js";
import { useStore } from "../../state/store.js";

interface AgentRow {
  id: string;
  name: string;
  color: string;
  runtimeId: string | null;
  recentEventCount: number;
  active: boolean; // ≥1 event in the last 7d
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function buildOrientationSnippet(origin: string, token: string | null): string {
  const tokenPart =
    token !== null && token.length > 0
      ? `?token=${encodeURIComponent(token)}`
      : "";
  return `You're joining an F-Mark project as an agent. Fetch ${origin}/guide${tokenPart} for the full protocol — connection URL, bearer token usage, the event schema, and your first action.`;
}

export function Agents(): JSX.Element {
  const token = useStore((s) => s.token);
  const participants = useStore((s) => s.participants);
  const setParticipants = useStore((s) => s.setParticipants);
  const events = useStore((s) => s.events);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSuggested, setNewSuggested] = useState("");
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const now = Date.now();
  const agents = useMemo<AgentRow[]>(() => {
    const counts = new Map<string, number>();
    for (const ev of events) {
      const t = Date.parse(ev.timestamp);
      if (Number.isNaN(t)) continue;
      if (now - t > SEVEN_DAYS_MS) continue;
      counts.set(ev.participant_id, (counts.get(ev.participant_id) ?? 0) + 1);
    }
    const rows: AgentRow[] = [];
    for (const [id, p] of Object.entries(participants)) {
      if (p.kind !== "agent") continue;
      const c = counts.get(id) ?? 0;
      rows.push({
        id,
        name: p.name,
        color: p.color,
        runtimeId: p.runtime_id ?? null,
        recentEventCount: c,
        active: c > 0,
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [participants, events, now]);

  async function copySnippet(id: string): Promise<void> {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost:7777";
    const snippet = buildOrientationSnippet(origin, token);
    try {
      await navigator.clipboard?.writeText(snippet);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((cur) => (cur === id ? null : cur));
      }, 1600);
    } catch {
      /* clipboard not available — silently ignore. The user can still read
         the snippet from the box below. */
    }
  }

  async function registerNew(): Promise<void> {
    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      setError("Name is required.");
      return;
    }
    setRegistering(true);
    setError(null);
    try {
      const client = createClient({ baseUrl: "", token });
      const created = await client.registerAgent({
        name: trimmed,
        suggested_id:
          newSuggested.trim().length > 0 ? newSuggested.trim() : undefined,
      });
      // Re-fetch participants so the new agent shows up.
      const next = await client.listParticipants();
      setParticipants(next);
      setNewName("");
      setNewSuggested("");
      setShowAdd(false);
      // Briefly highlight the new agent via the copied state on its snippet
      // button so the user can see which one is new.
      setCopiedId(created.id);
      setTimeout(() => {
        setCopiedId((cur) => (cur === created.id ? null : cur));
      }, 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegistering(false);
    }
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:7777";
  const previewSnippet = buildOrientationSnippet(origin, token);

  return (
    <>
      <h3 className="settings-h">Connected agents</h3>
      <div className="settings-sub">
        Agents registered to read and write events in this project. They use
        the orientation snippet below to bootstrap.
      </div>

      <div className="agent-list" data-testid="agent-list">
        {agents.length === 0 ? (
          <div
            style={{
              padding: 16,
              border: "1px dashed var(--line)",
              borderRadius: 8,
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              color: "var(--ink-3)",
              fontSize: 13,
            }}
          >
            No agents registered yet. Click + Add agent above.
          </div>
        ) : (
          agents.map((a) => (
            <div key={a.id} className="agent-card" data-agent-id={a.id}>
              <ParticipantAvatar
                participantId={a.id}
                kind="agent"
                name={a.name}
                color={a.color}
                runtimeId={a.runtimeId}
                className="agent-dot"
              />
              <div className="agent-info">
                <div className="agent-name">
                  {a.name}
                  <span className="agent-id">· {a.id}</span>
                </div>
                <div className="agent-meta">
                  {a.recentEventCount === 0
                    ? "No events in the last 7 days"
                    : `${a.recentEventCount} event${a.recentEventCount === 1 ? "" : "s"} in the last 7 days`}
                </div>
              </div>
              <div className="agent-actions">
                <button
                  type="button"
                  className={`copy-snippet-btn${copiedId === a.id ? " copied" : ""}`}
                  onClick={() => {
                    void copySnippet(a.id);
                  }}
                  title="Copy /guide orientation snippet"
                >
                  {copiedId === a.id ? "Copied" : "Copy snippet"}
                </button>
                <span className={`status-pill ${a.active ? "on" : "off"}`}>
                  {a.active ? "● active" : "○ idle"}
                </span>
              </div>
            </div>
          ))
        )}

        {showAdd ? (
          <div
            style={{
              padding: 12,
              border: "1px solid var(--line)",
              borderRadius: 8,
              background: "var(--bg)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div className="invite-new-form">
              <input
                className="form-input"
                placeholder="Agent name (e.g. gpt-cli)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                aria-label="New agent name"
              />
              <input
                className="form-input"
                placeholder="Suggested id (optional, ag-xxxx)"
                value={newSuggested}
                onChange={(e) => setNewSuggested(e.target.value)}
                aria-label="Suggested agent id"
                style={{ flex: 1, minWidth: 180 }}
              />
            </div>
            {error !== null ? (
              <div className="form-error">{error}</div>
            ) : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn-solid"
                disabled={registering || newName.trim().length === 0}
                onClick={() => {
                  void registerNew();
                }}
              >
                {registering ? "Registering…" : "Register agent"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setShowAdd(false);
                  setError(null);
                  setNewName("");
                  setNewSuggested("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="agent-add"
            onClick={() => setShowAdd(true)}
          >
            + Add agent
          </button>
        )}
      </div>

      <div className="snippet-box">
        <div className="snippet-head">
          Orientation snippet — paste into any agent
        </div>
        <pre className="snippet-body">{previewSnippet}</pre>
        <button
          type="button"
          className={`copy-btn${copiedId === "__preview__" ? " copied" : ""}`}
          onClick={() => {
            void (async () => {
              try {
                await navigator.clipboard?.writeText(previewSnippet);
                setCopiedId("__preview__");
                setTimeout(() => {
                  setCopiedId((cur) =>
                    cur === "__preview__" ? null : cur,
                  );
                }, 1600);
              } catch {
                /* ignore */
              }
            })();
          }}
        >
          {copiedId === "__preview__" ? "Copied" : "Copy"}
        </button>
      </div>
    </>
  );
}
