/* Settings modal — Phase 11 test suite.
   Covers:
     - side-nav renders all settings items;
     - clicking each item swaps the main content (asserted via the section's
       <h3 className="settings-h"> heading);
     - Appearance: clicking a theme card calls applyTheme(name);
     - Profile: clicking Save calls updateParticipant via the client (fetch
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
    expect(tabs[3]).toHaveTextContent(/hooks/i);
    expect(tabs[4]).toHaveTextContent(/appearance/i);
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

    await user.click(screen.getByRole("tab", { name: /^hooks$/i }));
    expect(
      screen.getByRole("heading", { level: 3, name: /hook status/i }),
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

  test("Save → PATCH /participants/:id with name, color, and avatar", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.startsWith("/participants/")) {
        const reqBody = JSON.parse(
          String(init?.body ?? "{}"),
        ) as Partial<Participant>;
        return new Response(
          JSON.stringify({
            id: "us-a7f3",
            kind: "user",
            name: reqBody.name ?? "Roey Updated",
            color: reqBody.color ?? "#3d7a4f",
            avatar_data_url: reqBody.avatar_data_url,
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

    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/upload profile image/i), file);

    await vi.waitFor(() => {
      const preview = document.querySelector(
        ".profile-photo-control .avatar-img",
      ) as HTMLImageElement | null;
      expect(preview?.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    });

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
    ) as { name: string; color: string; avatar_data_url?: string };
    expect(body.name).toBe("Roey Updated");
    expect(body.color.toLowerCase()).toBe("#3d7a4f");
    expect(body.avatar_data_url).toMatch(/^data:image\/png;base64,/);
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
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    delete (navigator as unknown as { clipboard?: unknown }).clipboard;
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

  test("per-agent copy includes that agent id while project copy stays generic", async () => {
    useStore.setState({ settingsSection: "agents", token: "tok" });
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<SettingsModal />);

    await user.click(screen.getByRole("button", { name: /copy snippet/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const perAgent = writeText.mock.calls[0]![0] as string;
    expect(perAgent).toContain("/guide?token=tok&agent_id=ag-c92e");
    expect(perAgent).toContain("MCP tool guide");
    expect(perAgent).toContain("first action");
    expect(perAgent).toContain("fmark MCP tools instead of raw HTTP calls");
    expect(perAgent.toLowerCase()).not.toContain("bearer token");
    expect(perAgent.toLowerCase()).not.toContain("event schema");
    expect(perAgent.toLowerCase()).not.toContain("full protocol");

    await user.click(screen.getByRole("button", { name: /^copy$/i }));
    expect(writeText).toHaveBeenCalledTimes(2);
    const projectLevel = writeText.mock.calls[1]![0] as string;
    expect(projectLevel).toContain("/guide?token=tok");
    expect(projectLevel).not.toContain("agent_id=");
  });
});
