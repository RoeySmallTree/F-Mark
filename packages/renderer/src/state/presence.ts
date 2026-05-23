import type {
  EnvProbeResult,
  ManagedAgent,
  ManagedTerminal,
  PresenceState,
} from "@f-mark/shared";

export interface AgentPresence {
  state: PresenceState;
  last_hook_at: number | null;
}

export interface PresenceSlice {
  presence: Record<string, AgentPresence>;
  managedAgents: ManagedAgent[];
  managedTerminals: ManagedTerminal[];
  envProbe: EnvProbeResult | null;
  setPresence(participantId: string, p: AgentPresence): void;
  removePresence(participantId: string): void;
  setManagedAgents(agents: ManagedAgent[]): void;
  setManagedTerminals(terminals: ManagedTerminal[]): void;
  addManagedAgent(agent: ManagedAgent): void;
  removeManagedAgent(participantId: string): void;
  addManagedTerminal(t: ManagedTerminal): void;
  setEnvProbe(r: EnvProbeResult): void;
}

/* Generic shape: a Zustand `set` that accepts a producer returning a partial
   of the slice. We accept any wider store state via a generic so the slice
   composes into a larger store without forcing every other slice to be
   aware of presence state. We type the producer as returning the wider
   store's partial — the slice itself only ever returns presence-slice
   keys, all of which exist on the wider store. */
export type PresenceSetState<S extends PresenceSlice> = (
  fn: (state: S) => Partial<S>,
) => void;

export function createPresenceSlice<S extends PresenceSlice = PresenceSlice>(
  set: PresenceSetState<S>,
): PresenceSlice {
  /* Narrow the wider `set` to a presence-slice-only signature inside this
     factory. Every produced patch contains only PresenceSlice keys, which
     are guaranteed to be present on S because S extends PresenceSlice. */
  const sliceSet = set as unknown as (
    fn: (state: PresenceSlice) => Partial<PresenceSlice>,
  ) => void;
  return {
    presence: {},
    managedAgents: [],
    managedTerminals: [],
    envProbe: null,
    setPresence: (id, p) =>
      sliceSet((s) => ({ presence: { ...s.presence, [id]: p } })),
    removePresence: (id) =>
      sliceSet((s) => {
        if (!(id in s.presence)) return { presence: s.presence };
        const next: Record<string, AgentPresence> = {};
        for (const [k, v] of Object.entries(s.presence)) {
          if (k !== id) next[k] = v;
        }
        return { presence: next };
      }),
    setManagedAgents: (agents) => sliceSet(() => ({ managedAgents: agents })),
    setManagedTerminals: (terminals) =>
      sliceSet(() => ({ managedTerminals: terminals })),
    addManagedAgent: (agent) =>
      sliceSet((s) => ({
        managedAgents: [
          ...s.managedAgents.filter(
            (a) => a.participant_id !== agent.participant_id,
          ),
          agent,
        ],
      })),
    removeManagedAgent: (id) =>
      sliceSet((s) => ({
        managedAgents: s.managedAgents.filter((a) => a.participant_id !== id),
      })),
    addManagedTerminal: (t) =>
      sliceSet((s) => ({
        managedTerminals: [
          ...s.managedTerminals.filter((x) => x.tmux_session !== t.tmux_session),
          t,
        ],
      })),
    setEnvProbe: (r) => sliceSet(() => ({ envProbe: r })),
  };
}
