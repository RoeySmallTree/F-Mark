import { beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import {
  createPresenceSlice,
  type PresenceSlice,
} from "../../src/state/presence.js";

const useStore = create<PresenceSlice>()((set) => createPresenceSlice(set));

describe("PresenceSlice", () => {
  beforeEach(() => {
    useStore.setState({
      presence: {},
      managedAgents: [],
      managedTerminals: [],
      envProbe: null,
      managedAgentLiveRevision: 0,
    });
  });

  it("setPresence stores by participant id", () => {
    useStore.getState().setPresence("ag-1", { state: "online", last_hook_at: 123 });
    expect(useStore.getState().presence["ag-1"]).toEqual({
      state: "online",
      last_hook_at: 123,
    });
  });

  it("removePresence deletes", () => {
    useStore.getState().setPresence("ag-1", { state: "online", last_hook_at: 1 });
    useStore.getState().removePresence("ag-1");
    expect(useStore.getState().presence["ag-1"]).toBeUndefined();
  });

  it("addManagedAgent upserts (replaces if same id)", () => {
    useStore
      .getState()
      .addManagedAgent({
        participant_id: "ag-1",
        tmux_session: "s1",
        runtime_id: "claude",
      });
    useStore
      .getState()
      .addManagedAgent({
        participant_id: "ag-1",
        tmux_session: "s2",
        runtime_id: "claude",
      });
    const agents = useStore.getState().managedAgents;
    expect(agents).toHaveLength(1);
    expect(agents[0]?.tmux_session).toBe("s2");
  });

  it("addManagedAgent is a no-op when the row is unchanged", () => {
    const agent = {
      participant_id: "ag-1",
      tmux_session: "s1",
      runtime_id: "claude",
      alive: true,
    };
    useStore.getState().addManagedAgent(agent);
    const before = useStore.getState().managedAgents;
    useStore.getState().addManagedAgent({ ...agent });
    expect(useStore.getState().managedAgents).toBe(before);
  });

  it("bumpManagedAgentLiveRevision increments monotonically", () => {
    expect(useStore.getState().managedAgentLiveRevision).toBe(0);
    useStore.getState().bumpManagedAgentLiveRevision();
    useStore.getState().bumpManagedAgentLiveRevision();
    expect(useStore.getState().managedAgentLiveRevision).toBe(2);
  });

  it("removeManagedAgent filters", () => {
    useStore
      .getState()
      .addManagedAgent({
        participant_id: "ag-1",
        tmux_session: "s",
        runtime_id: "claude",
      });
    useStore.getState().removeManagedAgent("ag-1");
    expect(useStore.getState().managedAgents).toEqual([]);
  });

  it("addManagedTerminal upserts by tmux_session and carries index", () => {
    useStore
      .getState()
      .addManagedTerminal({ tmux_session: "t1", label: "terminal 1", index: 1 });
    useStore
      .getState()
      .addManagedTerminal({ tmux_session: "t1", label: "renamed", index: 1 });
    const terminals = useStore.getState().managedTerminals;
    expect(terminals).toHaveLength(1);
    expect(terminals[0]).toEqual({
      tmux_session: "t1",
      label: "renamed",
      index: 1,
    });
  });

  it("removeManagedTerminal filters by tmux_session", () => {
    useStore
      .getState()
      .addManagedTerminal({ tmux_session: "t1", label: "terminal 1", index: 1 });
    useStore
      .getState()
      .addManagedTerminal({ tmux_session: "t2", label: "terminal 2", index: 2 });
    useStore.getState().removeManagedTerminal("t1");
    expect(useStore.getState().managedTerminals).toEqual([
      { tmux_session: "t2", label: "terminal 2", index: 2 },
    ]);
  });

  it("setEnvProbe replaces", () => {
    const r = {
      tmux: true,
      tmuxVersion: "3.4",
      runtimes: { claude: true },
      installer: "apt",
      os: "linux",
    };
    useStore.getState().setEnvProbe(r);
    expect(useStore.getState().envProbe).toEqual(r);
  });
});
