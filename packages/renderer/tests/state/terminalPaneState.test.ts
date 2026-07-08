import { beforeEach, describe, expect, it } from "vitest";
import {
  getActiveAgentTmux,
  getTerminalPaneMode,
  openAgentTerminalPane,
  setActiveAgentTerminal,
  setTerminalPaneMode,
} from "../../src/state/terminalPaneState.js";

beforeEach(() => {
  window.localStorage.clear();
  // Reset module-level state between tests.
  setTerminalPaneMode("agents");
  setActiveAgentTerminal(null);
});

describe("terminalPaneState", () => {
  it("defaults to agents mode with no active agent", () => {
    expect(getTerminalPaneMode()).toBe("agents");
    expect(getActiveAgentTmux()).toBeNull();
  });

  it("setTerminalPaneMode toggles the mode", () => {
    setTerminalPaneMode("agents");
    expect(getTerminalPaneMode()).toBe("agents");
    setTerminalPaneMode("terminals");
    expect(getTerminalPaneMode()).toBe("terminals");
  });

  it("setActiveAgentTerminal records the selected agent session", () => {
    setActiveAgentTerminal("fmark-x-ag-claude-1");
    expect(getActiveAgentTmux()).toBe("fmark-x-ag-claude-1");
  });

  it("openAgentTerminalPane flips to agents mode focused on the session", () => {
    openAgentTerminalPane("fmark-x-ag-codex-9");
    expect(getTerminalPaneMode()).toBe("agents");
    expect(getActiveAgentTmux()).toBe("fmark-x-ag-codex-9");
  });
});
