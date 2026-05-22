/* Settings modal — Phase 11 test suite.
   Covers:
     - side-nav renders all 5 items;
     - clicking each item swaps the main content (asserted via the section's
       <h3 className="settings-h"> heading);
     - Appearance: clicking a theme card calls applyTheme(name);
     - Profile: clicking Save calls updateParticipant via the client (fetch
       is stubbed);
     - About: the ASCII logo is in the DOM;
     - Shortcuts: every registered combo shows up as a row. */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Participant } from "@f-mark/shared";
import { SettingsModal } from "../../src/modals/settings/SettingsModal.js";
import { useStore } from "../../src/state/store.js";
import { SHORTCUTS } from "../../src/modals/settings/shortcut-registry.js";

vi.mock("../../src/themes/index.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/themes/index.js")>(
    "../../src/themes/index.js",
  );
  return {
    ...actual,
    applyTheme: vi.fn(),
    getCurrentTheme: () => "light",
    subscribeTheme: () => () => {},
  };
});

vi.mock("../../src/themes/density.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/themes/density.js")>(
    "../../src/themes/density.js",
  );
  return {
    ...actual,
    applyDensity: vi.fn(),
    getCurrentDensity: () => "comfortable",
    subscribeDensity: () => () => {},
  };
});

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-c92e": { kind: "agent", name: "Claude", color: "#b86a1f" },
};

function resetStore(): void {
  useStore.setState({
    token: null,
    sessions: [],
    currentSessionId: null,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: [],
    composeMode: "message",
    commentTarget: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    activeModal: "settings",
  });
}

describe("SettingsModal — side nav", () => {
  beforeEach(() => {
    resetStore();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", version: "0.1.0" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("renders all five side-nav items", () => {
    render(<SettingsModal />);
    const nav = screen.getByRole("tablist", { name: /settings sections/i });
    const tabs = within(nav).getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    expect(tabs[0]).toHaveTextContent(/profile/i);
    expect(tabs[1]).toHaveTextContent(/connected agents/i);
    expect(tabs[2]).toHaveTextContent(/appearance/i);
    expect(tabs[3]).toHaveTextContent(/keyboard shortcuts/i);
    expect(tabs[4]).toHaveTextContent(/about/i);
  });

  test("clicking each item switches the main content", async () => {
    const user = userEvent.setup();
    render(<SettingsModal />);

    // Default opens on Profile.
    expect(
      screen.getByRole("heading", { level: 3, name: /^profile$/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /connected agents/i }));
    expect(
      screen.getByRole("heading", { level: 3, name: /connected agents/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /appearance/i }));
    expect(
      screen.getByRole("heading", { level: 3, name: /appearance/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /keyboard shortcuts/i }));
    expect(
      screen.getByRole("heading", { level: 3, name: /keyboard shortcuts/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /about/i }));
    expect(
      screen.getByRole("heading", { level: 3, name: /about f-mark/i }),
    ).toBeInTheDocument();
  });

  test("close button calls store.closeModal", async () => {
    const user = userEvent.setup();
    render(<SettingsModal />);
    expect(useStore.getState().activeModal).toBe("settings");
    await user.click(screen.getByRole("button", { name: /close settings/i }));
    expect(useStore.getState().activeModal).toBeNull();
  });
});

describe("SettingsModal — Appearance", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  test("clicking a theme card calls applyTheme(name)", async () => {
    const themesModule = await import("../../src/themes/index.js");
    const applyTheme = themesModule.applyTheme as ReturnType<typeof vi.fn>;

    const user = userEvent.setup();
    render(<SettingsModal />);
    await user.click(screen.getByRole("tab", { name: /appearance/i }));

    const terminalCard = screen.getByRole("radio", { name: /terminal/i });
    await user.click(terminalCard);
    expect(applyTheme).toHaveBeenCalledWith("terminal");

    const cyberCard = screen.getByRole("radio", { name: /cyberpunk/i });
    await user.click(cyberCard);
    expect(applyTheme).toHaveBeenCalledWith("cyber");
  });

  test("clicking a density option calls applyDensity(name)", async () => {
    const densityModule = await import("../../src/themes/density.js");
    const applyDensity = densityModule.applyDensity as ReturnType<typeof vi.fn>;

    const user = userEvent.setup();
    render(<SettingsModal />);
    await user.click(screen.getByRole("tab", { name: /appearance/i }));

    const densityGroup = screen.getByRole("radiogroup", {
      name: /feed density/i,
    });
    const compactBtn = within(densityGroup).getByRole("radio", {
      name: /compact/i,
    });
    await user.click(compactBtn);
    expect(applyDensity).toHaveBeenCalledWith("compact");

    const spaciousBtn = within(densityGroup).getByRole("radio", {
      name: /spacious/i,
    });
    await user.click(spaciousBtn);
    expect(applyDensity).toHaveBeenCalledWith("spacious");
  });
});

describe("SettingsModal — Profile save", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("Save → PATCH /participants/:id with name + color", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.startsWith("/participants/")) {
        return new Response(
          JSON.stringify({
            id: "us-a7f3",
            kind: "user",
            name: "Roey Updated",
            color: "#3d7a4f",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<SettingsModal />);
    const nameInput = screen.getByLabelText(/display name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Roey");
    await user.clear(nameInput);
    await user.type(nameInput, "Roey Updated");

    const greenSwatch = screen.getByLabelText(/color #3d7a4f/i);
    await user.click(greenSwatch);

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    // Wait for the call.
    await vi.waitFor(() => {
      const calls = fetchMock.mock.calls;
      const patch = calls.find(
        (c) =>
          typeof c[0] === "string" &&
          c[0].startsWith("/participants/us-a7f3") &&
          (c[1] as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patch).toBeDefined();
    });

    const patchCall = fetchMock.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        c[0].startsWith("/participants/us-a7f3") &&
        (c[1] as RequestInit | undefined)?.method === "PATCH",
    )!;
    const body = JSON.parse(
      (patchCall[1] as RequestInit).body as string,
    ) as { name: string; color: string };
    expect(body.name).toBe("Roey Updated");
    expect(body.color.toLowerCase()).toBe("#3d7a4f");
  });
});

describe("SettingsModal — About", () => {
  beforeEach(() => {
    resetStore();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", version: "0.4.2" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("renders the ASCII logo and the live version", async () => {
    const user = userEvent.setup();
    render(<SettingsModal />);
    await user.click(screen.getByRole("tab", { name: /about/i }));
    const logo = screen.getByTestId("ascii-logo");
    // Truncated check — the leading ↑ rows uniquely identify our logo.
    expect(logo.textContent ?? "").toContain("↑↑↑↑↑");
    await vi.waitFor(() => {
      expect(screen.getByText(/v0\.4\.2/)).toBeInTheDocument();
    });
  });
});

describe("SettingsModal — Shortcuts", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("renders one .kbd-row per registered shortcut", async () => {
    const user = userEvent.setup();
    render(<SettingsModal />);
    await user.click(screen.getByRole("tab", { name: /keyboard shortcuts/i }));
    for (const entry of SHORTCUTS) {
      const row = document.querySelector(
        `[data-shortcut="${CSS.escape(entry.combo)}"]`,
      );
      expect(row, `expected a row for ${entry.combo}`).not.toBeNull();
      expect(row).toHaveTextContent(entry.description);
    }
  });
});

describe("SettingsModal — Agents", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("lists existing agents and toggles the +Add form", async () => {
    const user = userEvent.setup();
    render(<SettingsModal />);
    await user.click(screen.getByRole("tab", { name: /connected agents/i }));

    const list = screen.getByTestId("agent-list");
    // 1 agent (Claude) + 1 + Add button.
    expect(within(list).getByText(/claude/i)).toBeInTheDocument();
    expect(within(list).getByText(/· ag-c92e/i)).toBeInTheDocument();
    expect(
      within(list).getByRole("button", { name: /\+ add agent/i }),
    ).toBeInTheDocument();

    await user.click(
      within(list).getByRole("button", { name: /\+ add agent/i }),
    );
    expect(screen.getByLabelText(/new agent name/i)).toBeInTheDocument();
  });
});
