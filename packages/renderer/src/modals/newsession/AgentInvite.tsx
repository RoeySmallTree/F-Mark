/* AgentInvite — lists currently-registered agents as toggleable chips, plus a
   trailing "+ Invite new agent" chip that opens an inline form (name + suggested
   id). On submit the new agent gets registered via client.registerAgent and added
   to the selection. */

import { useState, type JSX } from "react";
import type { Participant, RegisteredAgent } from "@f-mark/shared";
import { createClient } from "../../api/client.js";
import { useStore } from "../../state/store.js";

export interface AgentInviteProps {
  /** Map of participant_id → Participant (filtered to agents internally). */
  participants: Record<string, Participant>;
  /** Toggled-on agent ids (existing or newly invited). */
  selected: Set<string>;
  onToggle(agentId: string): void;
  /** Called when a new agent has just been registered through the inline form. */
  onAgentRegistered?(agent: RegisteredAgent): void;
}

function suggestId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
  // Append a short random tag — kernel will accept or normalize.
  const rand = Math.random().toString(36).slice(2, 6);
  return `ag-${slug.length > 0 ? `${slug}-${rand}` : rand}`;
}

export function AgentInvite(props: AgentInviteProps): JSX.Element {
  const token = useStore((s) => s.token);
  const setParticipants = useStore((s) => s.setParticipants);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agents = Object.entries(props.participants).filter(
    ([, p]) => p.kind === "agent",
  );

  async function submitInvite(): Promise<void> {
    const name = newName.trim();
    if (name.length === 0) {
      setError("Name required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const client = createClient({ baseUrl: "", token });
      const suggested = suggestId(name);
      const agent = await client.registerAgent({
        name,
        suggested_id: suggested,
      });
      // Refresh participants so the new agent surfaces.
      const next = await client.listParticipants();
      setParticipants(next);
      props.onAgentRegistered?.(agent);
      props.onToggle(agent.id);
      setNewName("");
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to invite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="assign-picker" role="group" aria-label="Invite agents">
        {agents.map(([id, agent]) => {
          const on = props.selected.has(id);
          return (
            <button
              key={id}
              type="button"
              className={`pick${on ? " on" : ""}`}
              aria-pressed={on}
              onClick={() => props.onToggle(id)}
            >
              <span className="pick-dot" aria-hidden="true">
                {agent.name.slice(0, 1).toUpperCase()}
              </span>
              {agent.name}
            </button>
          );
        })}
        <button
          type="button"
          className="pick invite-new"
          onClick={() => setShowForm((v) => !v)}
          aria-expanded={showForm}
          aria-controls="invite-new-form"
        >
          <span className="pick-dot" aria-hidden="true">
            +
          </span>
          Invite new agent
        </button>
      </div>
      {showForm && (
        <div className="invite-new-form" id="invite-new-form">
          <input
            className="form-input"
            placeholder="Agent name (e.g. Claude)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label="New agent name"
          />
          <button
            type="button"
            className="btn-solid"
            disabled={busy || newName.trim().length === 0}
            onClick={() => void submitInvite()}
          >
            {busy ? "Inviting…" : "Invite"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setShowForm(false);
              setNewName("");
              setError(null);
            }}
          >
            Cancel
          </button>
          {error !== null && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
