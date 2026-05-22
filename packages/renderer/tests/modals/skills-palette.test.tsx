/* Phase 9 — Skills Palette (⌘⇧K) test suite.
   Covers:
     - ⌘⇧K opens the palette from App-level (registered in Compose).
     - SkillsPaletteModal mounts when activeModal === 'skills'.
     - listSkills() returns 3 skills across 2 agents → 2 group headers.
     - Fuzzy search filters by name.
     - Agent dropdown switches active agent and refetches.
     - Enter inserts `/skill-name <args>` into composeDraft and closes.
     - Mouse click activates a skill row.
     - Active agent persists to localStorage. */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Participant, SkillRef } from "@f-mark/shared";
import { SkillsPaletteModal } from "../../src/modals/SkillsPaletteModal.js";
import { ModalRoot } from "../../src/modals/ModalRoot.js";
import { Compose } from "../../src/compose/Compose.js";
import { useStore } from "../../src/state/store.js";
import { _isMacPlatform } from "../../src/hooks/useHotkeys.js";
import {
  ACTIVE_AGENT_STORAGE_KEY,
  deriveActiveAgent,
} from "../../src/modals/skills/active-agent.js";
import type { SessionMeta } from "../../src/api/client.js";

const MOD_OPEN = _isMacPlatform() ? "{Meta>}" : "{Control>}";
const MOD_CLOSE = _isMacPlatform() ? "{/Meta}" : "{/Control}";

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-claude-c92e": { kind: "agent", name: "Claude", color: "#b86a1f" },
};

const MOCK_SESSION: SessionMeta = {
  id: "2026-05-22-skills-demo",
  slug: "skills-demo",
  created_at: "2026-05-22T10:00:00Z",
};

/* Three skills across two agents — used by most tests. */
const SKILLS_3: SkillRef[] = [
  {
    source: "/proj/.claude/skills/review-pr",
    agent: "claude",
    name: "review-pr",
    description: "Read a PR and post a structured review.",
    args: "<pr-url>",
    path: "/proj/.claude/skills/review-pr/SKILL.md",
  },
  {
    source: "/proj/.claude/skills/standup",
    agent: "claude",
    name: "standup",
    description: "Summarize yesterday into a standup update.",
    path: "/proj/.claude/skills/standup/SKILL.md",
  },
  {
    source: "/proj/.codex/skills/refactor",
    agent: "codex",
    name: "refactor",
    description: "Bulk-refactor the codebase with a given prompt.",
    args: "[path]",
    path: "/proj/.codex/skills/refactor/SKILL.md",
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resetStore(
  overrides: Partial<ReturnType<typeof useStore.getState>> = {},
): void {
  useStore.setState({
    token: null,
    sessions: [MOCK_SESSION],
    currentSessionId: MOCK_SESSION.id,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: [],
    composeMode: "message",
    commentTarget: null,
    composeDraft: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    activeModal: null,
    activePopover: { key: null, anchorRect: null },
    ...overrides,
  });
}

function stubFetch(skills: SkillRef[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
    const u = String(input);
    if (u.startsWith("/skills")) {
      return Promise.resolve(jsonResponse({ skills }));
    }
    return Promise.resolve(jsonResponse({}));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  /* Clear any cross-test localStorage for active agent. */
  try {
    globalThis.localStorage?.removeItem(ACTIVE_AGENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

describe("deriveActiveAgent (pure helper)", () => {
  test("returns null when no agent participants are present", () => {
    expect(deriveActiveAgent({})).toBeNull();
  });

  test("picks 'claude' when a single ag-claude-* agent is present", () => {
    const p: Record<string, Participant> = {
      "us-1": { kind: "user", name: "U", color: "#000" },
      "ag-claude-abc": { kind: "agent", name: "Claude", color: "#b86a1f" },
    };
    expect(deriveActiveAgent(p)).toBe("claude");
  });

  test("picks the most-recently-registered when multiple agents exist", () => {
    /* Insertion order in object literals is preserved → codex (last) wins. */
    const p: Record<string, Participant> = {
      "ag-claude-old": { kind: "agent", name: "Claude", color: "#b86a1f" },
      "ag-codex-new": { kind: "agent", name: "Codex", color: "#3aa6c0" },
    };
    expect(deriveActiveAgent(p)).toBe("codex");
  });

  test("recognizes gemini agents", () => {
    const p: Record<string, Participant> = {
      "ag-gemini-zzz": { kind: "agent", name: "Gemini", color: "#33c" },
    };
    expect(deriveActiveAgent(p)).toBe("gemini");
  });
});

describe("SkillsPaletteModal — opening via hotkey", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("⌘⇧K (or Ctrl+Shift+K) opens the palette when Compose is mounted", async () => {
    resetStore();
    stubFetch([]);
    const user = userEvent.setup();
    render(<Compose />);
    expect(useStore.getState().activeModal).toBeNull();
    await user.keyboard(`${MOD_OPEN}{Shift>}k{/Shift}${MOD_CLOSE}`);
    expect(useStore.getState().activeModal).toBe("skills");
  });

  test("clicking the ⚡ Skills button opens the modal", async () => {
    resetStore();
    stubFetch([]);
    const user = userEvent.setup();
    render(<Compose />);
    const btn = screen.getByRole("button", { name: /Open skills palette/i });
    expect(btn).not.toBeDisabled();
    await user.click(btn);
    expect(useStore.getState().activeModal).toBe("skills");
  });
});

describe("SkillsPaletteModal — rendering & grouping", () => {
  beforeEach(() => {
    resetStore({ activeModal: "skills" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("ModalRoot mounts SkillsPaletteModal when activeModal === 'skills'", async () => {
    stubFetch([]);
    render(<ModalRoot />);
    expect(
      screen.getByRole("dialog", { name: /skills palette/i }),
    ).toBeInTheDocument();
  });

  test("renders 2 group headers when 3 skills span 2 agents", async () => {
    stubFetch(SKILLS_3);
    render(<SkillsPaletteModal />);
    /* Wait for the fetch to resolve and render. */
    await screen.findByText("Claude skills");
    expect(screen.getByText("Claude skills")).toBeInTheDocument();
    expect(screen.getByText("Codex skills")).toBeInTheDocument();
    /* All 3 skill names should render. */
    expect(screen.getByText(/\/review-pr/)).toBeInTheDocument();
    expect(screen.getByText(/\/standup/)).toBeInTheDocument();
    expect(screen.getByText(/\/refactor/)).toBeInTheDocument();
  });

  test("renders skill name in mono and args separately", async () => {
    stubFetch(SKILLS_3);
    const { container } = render(<SkillsPaletteModal />);
    await screen.findByText("Claude skills");
    /* The args span is rendered next to the name with class `.skill-args`. */
    const args = container.querySelectorAll(".skill-args");
    /* review-pr has "<pr-url>", refactor has "[path]"; standup has none. */
    expect(args.length).toBe(2);
  });

  test("renders the description as `.skill-desc`", async () => {
    stubFetch(SKILLS_3);
    render(<SkillsPaletteModal />);
    await screen.findByText(/Read a PR and post a structured review/i);
    expect(
      screen.getByText(/Read a PR and post a structured review/i),
    ).toBeInTheDocument();
  });

  test("empty list shows the install-skills hint", async () => {
    stubFetch([]);
    render(<SkillsPaletteModal />);
    expect(
      await screen.findByText(/No skills found\. Install agent-specific/i),
    ).toBeInTheDocument();
  });

  test("backend error shows an error banner", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "boom" }, 500));
    vi.stubGlobal("fetch", fetchMock);
    render(<SkillsPaletteModal />);
    expect(
      await screen.findByText(/Couldn’t load skills/i),
    ).toBeInTheDocument();
  });
});

describe("SkillsPaletteModal — search filter", () => {
  beforeEach(() => {
    resetStore({ activeModal: "skills" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("typing 'refactor' narrows to the refactor skill only", async () => {
    stubFetch(SKILLS_3);
    const user = userEvent.setup();
    render(<SkillsPaletteModal />);
    await screen.findByText(/\/refactor/);

    const input = screen.getByLabelText(/Search skills/i);
    await user.type(input, "refactor");
    expect(screen.getByText(/\/refactor/)).toBeInTheDocument();
    expect(screen.queryByText(/\/review-pr/)).toBeNull();
    expect(screen.queryByText(/\/standup/)).toBeNull();
  });

  test("typing matches against description text too", async () => {
    stubFetch(SKILLS_3);
    const user = userEvent.setup();
    render(<SkillsPaletteModal />);
    await screen.findByText(/\/review-pr/);

    const input = screen.getByLabelText(/Search skills/i);
    /* "structured" only appears in the review-pr description. */
    await user.type(input, "structured");
    expect(screen.getByText(/\/review-pr/)).toBeInTheDocument();
    expect(screen.queryByText(/\/standup/)).toBeNull();
  });

  test("totally-unmatched query shows 'no matches' empty state", async () => {
    stubFetch(SKILLS_3);
    const user = userEvent.setup();
    render(<SkillsPaletteModal />);
    await screen.findByText(/\/review-pr/);
    const input = screen.getByLabelText(/Search skills/i);
    await user.type(input, "zzzqqxqx");
    expect(screen.getByText(/No skills match/i)).toBeInTheDocument();
  });
});

describe("SkillsPaletteModal — agent dropdown switching", () => {
  beforeEach(() => {
    resetStore({ activeModal: "skills" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("changing the dropdown triggers a refetch with the new agent", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.startsWith("/skills")) {
        return Promise.resolve(jsonResponse({ skills: SKILLS_3 }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<SkillsPaletteModal />);
    await screen.findByText(/\/review-pr/);

    /* First fetch should have used `claude` (the resolved default from
       PARTICIPANTS which contains `ag-claude-c92e`). */
    const firstUrl = String(fetchMock.mock.calls[0]![0]);
    expect(firstUrl).toBe("/skills?agent=claude");

    /* Change to codex. */
    const select = screen.getByLabelText(/^Active agent$/i);
    await user.selectOptions(select, "codex");

    /* After the change, the effect refires. */
    await act(async () => {
      await Promise.resolve();
    });
    const lastUrl = String(
      fetchMock.mock.calls[fetchMock.mock.calls.length - 1]![0],
    );
    expect(lastUrl).toBe("/skills?agent=codex");
  });

  test("agent choice persists to localStorage", async () => {
    stubFetch(SKILLS_3);
    const user = userEvent.setup();
    render(<SkillsPaletteModal />);
    await screen.findByText(/\/review-pr/);
    const select = screen.getByLabelText(/^Active agent$/i);
    await user.selectOptions(select, "gemini");
    expect(
      globalThis.localStorage?.getItem(ACTIVE_AGENT_STORAGE_KEY),
    ).toBe("gemini");
  });

  test("preloaded localStorage drives the initial fetch", async () => {
    globalThis.localStorage?.setItem(ACTIVE_AGENT_STORAGE_KEY, "gemini");
    const fetchMock = stubFetch([]);
    render(<SkillsPaletteModal />);
    await act(async () => {
      await Promise.resolve();
    });
    const firstUrl = String(fetchMock.mock.calls[0]![0]);
    expect(firstUrl).toBe("/skills?agent=gemini");
  });
});

describe("SkillsPaletteModal — activation (Enter & click)", () => {
  beforeEach(() => {
    resetStore({ activeModal: "skills" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("Enter on first row writes `/<name> <args>` to composeDraft and closes", async () => {
    stubFetch(SKILLS_3);
    const user = userEvent.setup();
    render(<SkillsPaletteModal />);
    await screen.findByText(/\/review-pr/);

    /* Default selection is index 0 — first row alphabetically across all
       Claude skills (review-pr). */
    await user.keyboard("{Enter}");
    expect(useStore.getState().composeDraft).toBe("/review-pr <pr-url>");
    expect(useStore.getState().activeModal).toBeNull();
  });

  test("Enter on a skill without args writes `/<name> ` (trailing space)", async () => {
    stubFetch(SKILLS_3);
    const user = userEvent.setup();
    render(<SkillsPaletteModal />);
    await screen.findByText(/\/standup/);

    /* Move down: review-pr → standup. (Alphabetical inside Claude group.) */
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(useStore.getState().composeDraft).toBe("/standup ");
    expect(useStore.getState().activeModal).toBeNull();
  });

  test("clicking a row activates it (mouse path)", async () => {
    stubFetch(SKILLS_3);
    const user = userEvent.setup();
    render(<SkillsPaletteModal />);
    const row = (await screen.findByText(/\/refactor/)).closest(
      ".cmdk-row",
    );
    expect(row).not.toBeNull();
    await user.click(row as HTMLElement);
    expect(useStore.getState().composeDraft).toBe("/refactor [path]");
    expect(useStore.getState().activeModal).toBeNull();
  });

  test("ArrowDown / ArrowUp navigate across group boundaries", async () => {
    stubFetch(SKILLS_3);
    const user = userEvent.setup();
    const { container } = render(<SkillsPaletteModal />);
    await screen.findByText(/\/review-pr/);

    /* Three rows total: review-pr (claude), standup (claude), refactor
       (codex). Step three times and we should wrap to row 0. */
    for (let i = 0; i < 3; i++) await user.keyboard("{ArrowDown}");
    const sel = container.querySelector(".cmdk-row.sel");
    expect(sel?.getAttribute("data-skill-idx")).toBe("0");
  });
});

describe("SkillsPaletteModal — Escape & close", () => {
  beforeEach(() => {
    resetStore({ activeModal: "skills" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("Escape closes via ModalRoot's window listener", async () => {
    stubFetch(SKILLS_3);
    const user = userEvent.setup();
    render(<ModalRoot />);
    await screen.findByText(/\/review-pr/);
    expect(useStore.getState().activeModal).toBe("skills");
    await user.keyboard("{Escape}");
    expect(useStore.getState().activeModal).toBeNull();
  });

  test("backdrop click closes via ModalRoot", async () => {
    stubFetch(SKILLS_3);
    const user = userEvent.setup();
    const { container } = render(<ModalRoot />);
    await screen.findByText(/\/review-pr/);
    const backdrop = container.querySelector(".modal-backdrop");
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as HTMLElement);
    expect(useStore.getState().activeModal).toBeNull();
  });
});
