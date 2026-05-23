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
