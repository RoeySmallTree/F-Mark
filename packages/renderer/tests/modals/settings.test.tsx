/* Settings modal — Phase 11 test suite.
   Covers:
     - side-nav renders all settings items;
     - clicking each item swaps the main content (asserted via the section's
       <h3 className="settings-h"> heading);
     - Appearance: clicking a theme card calls applyTheme(name);
     - Profile: clicking Save calls updateUserProfile via the client (fetch
       is stubbed);
     - Profile: custom non-preset hex colors get a live preview swatch;
     - About: the ASCII logo is in the DOM;
     - Shortcuts: every registered combo shows up as a row. */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type MockInstance,
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

const SESSION = {
  id: "profile-session",
  slug: "profile-session",
  created_at: "2026-06-18T10:00:00.000Z",
  path: "/repo-a",
  path_id: "repo-a-id",
};

function resetStore(): void {
  useStore.setState({
    token: null,
    sessions: [SESSION],
    currentSessionId: SESSION.id,
    selectedPath: SESSION.path,
    selectedPathId: SESSION.path_id,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: [],
    activePath: "/activated-from-path",
    activePathId: "activated-from-path-id",
    composeMode: "message",
    commentTarget: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    activeModal: "settings",
    settingsSection: "profile",
  });
}

describe("SettingsModal — side nav", () => {
  beforeEach(() => {
    resetStore();
    const fetchMock = vi.fn(async () =>
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

  test("renders all seven side-nav items", () => {
    render(<SettingsModal />);
    const nav = screen.getByRole("tablist", { name: /settings sections/i });
    const tabs = within(nav).getAllByRole("tab");
    expect(tabs).toHaveLength(7);
    expect(tabs[0]).toHaveTextContent(/profile/i);
    expect(tabs[1]).toHaveTextContent(/connected agents/i);
    expect(tabs[2]).toHaveTextContent(/runtimes/i);
    expect(tabs[3]).toHaveTextContent(/appearance/i);
    expect(tabs[4]).toHaveTextContent(/git ?\/ ?diff/i);
    expect(tabs[5]).toHaveTextContent(/keyboard shortcuts/i);
    expect(tabs[6]).toHaveTextContent(/about/i);
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

    await user.click(screen.getByRole("tab", { name: /^runtimes$/i }));
    expect(
      screen.getByRole("heading", { level: 3, name: /^runtimes$/i }),
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

  test("can open directly on the Runtimes section", () => {
    useStore.setState({ settingsSection: "runtimes" });
    render(<SettingsModal />);
    expect(
      screen.getByRole("heading", { level: 3, name: /^runtimes$/i }),
    ).toBeInTheDocument();
  });

  test("Runtimes section shows built-ins and Add runtime when env probe has no runtimes", () => {
    useStore.setState({
      settingsSection: "runtimes",
      envProbe: {
        tmux: true,
        tmuxVersion: "3.4",
        runtimes: {},
        installer: "apt",
        os: "linux",
      },
    });
    render(<SettingsModal />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Claude Code")).toBeInTheDocument();
    expect(within(table).getByText("Codex")).toBeInTheDocument();
    expect(within(table).getByText("Opencode")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add runtime/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("runtime-probe-os")).toHaveTextContent(/linux/i);
    expect(screen.getByTestId("runtime-probe-installer")).toHaveTextContent(
      /apt/i,
    );
    expect(screen.getByTestId("runtime-probe-tmux")).toHaveTextContent(/3\.4/);
    expect(screen.queryByText(/kernel does not yet expose/i)).toBeNull();
  });

  test("Runtimes section hydrates editable fields from /runtimes", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/runtimes") {
        return new Response(
          JSON.stringify({
            version: "1.0",
            runtimes: {
              mybot: {
                displayName: "My Bot",
                executable: "mybot-bin",
                args: ["--quiet"],
                env: { FOO: "bar" },
              },
            },
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
    useStore.setState({
      settingsSection: "runtimes",
      envProbe: {
        tmux: true,
        tmuxVersion: "3.4",
        runtimes: { mybot: true },
        installer: "apt",
        os: "linux",
      },
    });

    render(<SettingsModal />);

    await vi.waitFor(() => {
      expect(screen.getByTestId("runtime-row-mybot")).toHaveTextContent(
        /mybot-bin/i,
      );
    });
  });

  test("Runtimes section filters retired runtimes from registry and env probe", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/runtimes") {
        return new Response(
          JSON.stringify({
            version: "1.0",
            runtimes: {
              gemini: {
                displayName: "Gemini",
                executable: "gemini",
                args: [],
              },
              mybot: {
                displayName: "My Bot",
                executable: "mybot-bin",
                args: [],
              },
            },
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
    useStore.setState({
      settingsSection: "runtimes",
      envProbe: {
        tmux: true,
        tmuxVersion: "3.4",
        runtimes: { gemini: true, mybot: true },
        installer: "apt",
        os: "linux",
      },
    });

    render(<SettingsModal />);

    expect(await screen.findByTestId("runtime-row-mybot")).toHaveTextContent(
      /mybot-bin/i,
    );
    expect(screen.queryByTestId("runtime-row-gemini")).toBeNull();
    expect(screen.queryByText(/^gemini$/i)).toBeNull();
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

  test("renders the populated profile without storage and identity helper copy", () => {
    render(<SettingsModal />);

    expect(document.querySelector(".settings-sub")).toBeNull();
    expect(
      screen.queryByText(/Your identity in this project/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Your identity across F-Mark/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/generated when project initialized/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText("us-a7f3")).toBeInTheDocument();
    expect(document.querySelector(".profile-photo-control")).not.toBeNull();
    expect(document.querySelector(".profile-name-input")).not.toBeNull();
    expect(document.querySelector(".avatar-preset-trigger")).not.toBeNull();
  });

  test("hydrates the form from the machine profile over stale participant state", async () => {
    useStore.setState({
      participants: {
        "us-a7f3": { kind: "user", name: "You", color: "#3b82f6" },
        "ag-c92e": PARTICIPANTS["ag-c92e"]!,
      },
      currentUserId: "us-a7f3",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/profile") {
          return new Response(
            JSON.stringify({
              profile: {
                name: "Roey Saved",
                color: "#8a2a8a",
                avatar_preset: "02",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const user = userEvent.setup();
    render(<SettingsModal />);

    const nameInput = screen.getByLabelText(/display name/i) as HTMLInputElement;
    await vi.waitFor(() => {
      expect(nameInput.value).toBe("Roey Saved");
    });
    await user.click(screen.getByRole("button", { name: /avatar/i }));
    expect(screen.getByLabelText(/custom hex color/i)).toHaveValue("#8a2a8a");
    expect(
      document.querySelector(".profile-photo-control [data-avatar-preset]")?.getAttribute(
        "data-avatar-preset",
      ),
    ).toBe("02");
  });

  test("Save → PATCH /profile with name, color, and avatar preset", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (
        typeof url === "string" &&
        url === "/profile" &&
        init?.method === "PATCH"
      ) {
        const reqBody = JSON.parse(
          String(init?.body ?? "{}"),
        ) as Partial<Participant>;
        return new Response(
          JSON.stringify({
            profile: {
              name: reqBody.name ?? "Roey Updated",
              color: reqBody.color ?? "#3d7a4f",
              avatar_preset: reqBody.avatar_preset,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (typeof url === "string" && url === "/profile") {
        return new Response(
          JSON.stringify({
            profile: {
              name: "Roey",
              color: "#2a5fa8",
            },
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

    await user.click(screen.getByRole("button", { name: /avatar/i }));
    const greenSwatch = screen.getByLabelText(/color #3d7a4f/i);
    await user.click(greenSwatch);

    const presetOption = await screen.findByRole("option", { name: "Star" });
    await user.click(presetOption);

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await vi.waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        (c) =>
          c[0] === "/profile" &&
          (c[1] as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patch).toBeDefined();
    });

    const patchCall = fetchMock.mock.calls.find(
      (c) =>
        c[0] === "/profile" &&
        (c[1] as RequestInit | undefined)?.method === "PATCH",
    )!;
    const body = JSON.parse(
      (patchCall[1] as RequestInit).body as string,
    ) as { name: string; color: string; avatar_preset?: string };
    const patchUrl = new URL(patchCall[0] as string, "http://f-mark.test");
    expect(patchUrl.pathname).toBe("/profile");
    expect(patchUrl.searchParams.get("root")).toBeNull();
    expect(patchUrl.searchParams.get("path_id")).toBeNull();
    expect(body.name).toBe("Roey Updated");
    expect(body.color.toLowerCase()).toBe("#3d7a4f");
    expect(body.avatar_preset).toBe("04");
  });

  test("shows a live preview swatch for a valid non-preset custom color", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const user = userEvent.setup();
    render(<SettingsModal />);
    await user.click(screen.getByRole("button", { name: /avatar/i }));

    const hexInput = screen.getByLabelText(
      /custom hex color/i,
    ) as HTMLInputElement;
    await user.clear(hexInput);
    await user.type(hexInput, "#00ffaa");

    const preview = screen.getByRole("img", {
      name: /custom color preview #00ffaa/i,
    });
    expect(preview).toHaveClass("swatch-custom-preview");
    expect(preview).toHaveClass("active");
    expect(preview).toHaveAttribute("title", "#00ffaa");
    expect(screen.queryByText(/invalid hex/i)).toBeNull();
  });

  test("does not show a custom preview for invalid or preset values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const user = userEvent.setup();
    render(<SettingsModal />);
    await user.click(screen.getByRole("button", { name: /avatar/i }));

    const hexInput = screen.getByLabelText(
      /custom hex color/i,
    ) as HTMLInputElement;
    await user.clear(hexInput);
    await user.type(hexInput, "#12zzzz");

    expect(
      screen.queryByRole("img", { name: /custom color preview/i }),
    ).toBeNull();
    expect(screen.getByText(/invalid hex/i)).toBeInTheDocument();

    await user.clear(hexInput);
    await user.type(hexInput, "#3d7a4f");

    expect(
      screen.queryByRole("img", { name: /custom color preview/i }),
    ).toBeNull();
    expect(screen.queryByText(/invalid hex/i)).toBeNull();
    expect(screen.getByLabelText(/color #3d7a4f/i)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("SettingsModal — About", () => {
  beforeEach(() => {
    resetStore();
    const fetchMock = vi.fn(async () =>
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
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    resetStore();
    useStore.setState({
      token: "tok",
      settingsSection: "agents",
      currentSessionId: "profile-session",
      selectedPath: SESSION.path,
      selectedPathId: SESSION.path_id,
    });
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/sessions?scope=all") || url.startsWith("/sessions")) {
        return jsonResponse({
          sessions: [SESSION],
        });
      }
      if (url.startsWith("/managed-agents/status")) {
        return jsonResponse({
          agents: [
            {
              participant_id: "ag-c92e",
              display_name: "Claude",
              runtime_id: "claude",
              active_session: SESSION.id,
              membership_session_id: SESSION.id,
              membership_state: "active",
              pane_lifecycle: "live",
              controllable: true,
              runtime_session: null,
              managed: true,
              paused: false,
              connection_state: "connected",
              activity_state: "running",
              tmux_session: "fmark-ag-c92e",
              mcp_status: "installed",
              hook_status: "installed",
              context: { status: "reported", percent_used: null },
              access: { mode: "default", status: "reported" },
              pending_access_count: 0,
            },
            {
              participant_id: "ag-idle",
              display_name: "Idle",
              runtime_id: "claude",
              active_session: SESSION.id,
              membership_session_id: SESSION.id,
              membership_state: "active",
              pane_lifecycle: "no-pane",
              controllable: false,
              runtime_session: null,
              managed: true,
              paused: false,
              connection_state: "offline",
              activity_state: "idle",
              tmux_session: null,
              mcp_status: "installed",
              hook_status: "installed",
              context: { status: "reported", percent_used: null },
              access: { mode: "default", status: "reported" },
              pending_access_count: 0,
            },
          ],
          capabilities: {},
        });
      }
      return jsonResponse({});
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    cleanup();
  });

  test("lists connected agents grouped by path and session without add/snippet UI", async () => {
    render(<SettingsModal />);

    const list = await screen.findByTestId("agent-list");
    expect(within(list).getByRole("heading", { level: 4, name: "repo-a" })).toBeInTheDocument();
    expect(
      within(list).getByTestId("agent-session-group"),
    ).toHaveAttribute("data-session-slug", "profile-session");
    expect(within(list).getByText(/· ag-c92e/i)).toBeInTheDocument();
    expect(within(list).queryByText(/idle/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\+ add agent/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /copy snippet/i })).toBeNull();
    expect(
      within(list).getByRole("button", { name: /go to session/i }),
    ).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: /goodbye/i })).toBeInTheDocument();
  });

  test("go to session switches the current session and closes settings", async () => {
    const user = userEvent.setup();
    const closeModal = vi.fn();
    useStore.setState({ closeModal });

    render(<SettingsModal />);
    const list = await screen.findByTestId("agent-list");
    await user.click(within(list).getByRole("button", { name: /go to session/i }));

    expect(useStore.getState().currentSessionId).toBe(SESSION.id);
    expect(closeModal).toHaveBeenCalledTimes(1);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
