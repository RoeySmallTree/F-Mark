/* Phase 8 — PresetsPopover unit + integration tests.

   What we verify:
     - Opens via store.openPopover('presets', rect) → PopoverRoot renders it.
     - Loads from `GET /presets` (mocked fetch); 8 builtins land in the right
       groups (generate / critique / format) in that order.
     - Search input filters by name + body case-insensitively.
     - Clicking a preset writes the body to store.composeDraft and closes.
     - Closes on backdrop click + Escape.
     - Project group appears when project[] is non-empty.
*/

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Preset } from "@f-mark/shared";
import { PresetsPopover } from "../../src/popovers/PresetsPopover.js";
import { PopoverRoot } from "../../src/popovers/PopoverRoot.js";
import { useStore } from "../../src/state/store.js";

const BUILTIN: Preset[] = [
  {
    name: "Alternative approach",
    group: "generate",
    icon: "🔀",
    body: "Propose an alternative approach. Identify what we lose vs. the current path.",
    source: "builtin",
    path: "/builtin/alternative-approach.md",
  },
  {
    name: "Critique this",
    group: "critique",
    icon: "🧐",
    body: "Critique the most recent contribution. Be specific about weaknesses.",
    source: "builtin",
    path: "/builtin/critique.md",
  },
  {
    name: "Generate variations",
    group: "generate",
    icon: "✨",
    body: "Generate 3 variations of this approach. Highlight tradeoffs for each.",
    source: "builtin",
    path: "/builtin/generate-variations.md",
  },
  {
    name: "Make it concrete",
    group: "format",
    icon: "🪨",
    body: "Rewrite this with concrete examples. Replace abstract claims with specifics.",
    source: "builtin",
    path: "/builtin/make-concrete.md",
  },
  {
    name: "Make it shorter",
    group: "format",
    icon: "✂️",
    body: "Rewrite the most recent contribution at half the length. Preserve the substance.",
    source: "builtin",
    path: "/builtin/make-shorter.md",
  },
  {
    name: "Plan in phases",
    group: "generate",
    icon: "📐",
    body: "Break this into 3–5 implementation phases. Each phase ships working software.",
    source: "builtin",
    path: "/builtin/plan-in-phases.md",
  },
  {
    name: "Summarize so far",
    group: "format",
    icon: "📋",
    body: "Summarize the current state of the session in 3–5 bullets.",
    source: "builtin",
    path: "/builtin/summarize.md",
  },
  {
    name: "What am I missing?",
    group: "critique",
    icon: "❓",
    body: "Look at this from a contrarian angle. What's overlooked?",
    source: "builtin",
    path: "/builtin/what-am-i-missing.md",
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function rect(): DOMRect {
  return {
    x: 100,
    y: 100,
    top: 100,
    left: 100,
    right: 200,
    bottom: 130,
    width: 100,
    height: 30,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

function resetStore(): void {
  useStore.setState({
    token: null,
    sessions: [],
    currentSessionId: null,
    participants: {},
    currentUserId: null,
    events: [],
    composeMode: "message",
    commentTarget: null,
    composeDraft: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    activeModal: null,
    activePopover: { key: null, anchorRect: null },
  });
}

describe("PresetsPopover — initial fetch and grouping", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("loads /presets and renders the three builtin groups in order", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ builtin: BUILTIN, project: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PresetsPopover anchorRect={rect()} onClose={() => {}} />,
    );
    /* Wait for the async fetch to resolve and react to render. */
    await screen.findByText("Generate");

    /* Group headers in the prescribed order. */
    expect(screen.getByText("Generate")).toBeInTheDocument();
    expect(screen.getByText("Critique")).toBeInTheDocument();
    expect(screen.getByText("Format")).toBeInTheDocument();

    /* The 8 builtin presets all rendered. */
    expect(
      screen.getByRole("button", { name: /Generate variations/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Critique this/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Make it shorter/i }),
    ).toBeInTheDocument();

    /* Group ordering: find DOM positions of the group headers. */
    const headers = screen.getAllByText(/^(Generate|Critique|Format)$/);
    expect(headers.map((h) => h.textContent)).toEqual([
      "Generate",
      "Critique",
      "Format",
    ]);
    /* Each builtin preset belongs to its claimed group container. */
    const generateGroup = screen.getByTestId("presets-group-generate");
    expect(
      within(generateGroup).getByText(/Generate variations/i),
    ).toBeInTheDocument();
    expect(
      within(generateGroup).getByText(/Plan in phases/i),
    ).toBeInTheDocument();

    /* Fetch URL: no session means no query string. */
    expect(fetchMock).toHaveBeenCalledWith(
      "/presets",
      expect.objectContaining({}),
    );
  });

  test("passes session id as ?session= when set", async () => {
    useStore.setState({ currentSessionId: "2026-05-22-launch" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ builtin: BUILTIN, project: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PresetsPopover anchorRect={rect()} onClose={() => {}} />,
    );
    await screen.findByText("Generate");
    expect(fetchMock).toHaveBeenCalledWith(
      "/presets?session=2026-05-22-launch",
      expect.objectContaining({}),
    );
  });

  test("renders the Project group when project[] is non-empty", async () => {
    const projectPreset: Preset = {
      name: "My Custom Preset",
      group: "generate",
      icon: "🎯",
      body: "Try this custom approach.",
      source: "project",
      path: "/.f-mark/presets/custom.md",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ builtin: BUILTIN, project: [projectPreset] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PresetsPopover anchorRect={rect()} onClose={() => {}} />,
    );
    await screen.findByText("Project");
    const proj = screen.getByTestId("presets-group-project");
    expect(
      within(proj).getByRole("button", { name: /My Custom Preset/i }),
    ).toBeInTheDocument();
  });

  test("shows a graceful empty state when no presets exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ builtin: [], project: [] })),
    );
    render(
      <PresetsPopover anchorRect={rect()} onClose={() => {}} />,
    );
    expect(
      await screen.findByText(/No presets available\./i),
    ).toBeInTheDocument();
  });

  test("shows an error message when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, 500)),
    );
    render(
      <PresetsPopover anchorRect={rect()} onClose={() => {}} />,
    );
    expect(
      await screen.findByText(/Couldn’t load presets/i),
    ).toBeInTheDocument();
  });
});

describe("PresetsPopover — search filtering", () => {
  beforeEach(() => {
    resetStore();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ builtin: BUILTIN, project: [] })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("typing in search narrows to presets matching name OR body", async () => {
    const user = userEvent.setup();
    render(
      <PresetsPopover anchorRect={rect()} onClose={() => {}} />,
    );
    await screen.findByText(/Generate variations/i);

    const search = screen.getByLabelText(/Search presets/i);
    await user.click(search);
    await user.type(search, "variations");

    /* Only "Generate variations" matches (its body says "variations"). */
    expect(
      screen.getByRole("button", { name: /Generate variations/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Plan in phases/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Critique this/i }),
    ).not.toBeInTheDocument();
  });

  test("case-insensitive match", async () => {
    const user = userEvent.setup();
    render(
      <PresetsPopover anchorRect={rect()} onClose={() => {}} />,
    );
    await screen.findByText(/Critique this/i);
    const search = screen.getByLabelText(/Search presets/i);
    await user.click(search);
    await user.type(search, "CRITIQUE");
    expect(
      screen.getByRole("button", { name: /Critique this/i }),
    ).toBeInTheDocument();
  });

  test("no matches → empty message", async () => {
    const user = userEvent.setup();
    render(
      <PresetsPopover anchorRect={rect()} onClose={() => {}} />,
    );
    await screen.findByText(/Generate variations/i);
    const search = screen.getByLabelText(/Search presets/i);
    await user.click(search);
    await user.type(search, "zzzzz-no-match-zzzzz");
    expect(
      screen.getByText(/No presets match that search/i),
    ).toBeInTheDocument();
  });
});

describe("PresetsPopover — interactions", () => {
  beforeEach(() => {
    resetStore();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ builtin: BUILTIN, project: [] })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("clicking a preset writes the body to store.composeDraft and calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PresetsPopover anchorRect={rect()} onClose={onClose} />,
    );
    const btn = await screen.findByRole("button", {
      name: /Generate variations/i,
    });
    await user.click(btn);
    expect(useStore.getState().composeDraft).toBe(
      "Generate 3 variations of this approach. Highlight tradeoffs for each.",
    );
    /* Close is animated now (usePopoverExit): the panel stays mounted
       for its exit, so the callback lands a tick later. */
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  test("clicking the backdrop calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PresetsPopover anchorRect={rect()} onClose={onClose} />,
    );
    await screen.findByText(/Generate variations/i);
    await user.click(screen.getByTestId("popover-backdrop"));
    /* Close is animated now (usePopoverExit): the panel stays mounted
       for its exit, so the callback lands a tick later. */
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  test("pressing Escape calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PresetsPopover anchorRect={rect()} onClose={onClose} />,
    );
    await screen.findByText(/Generate variations/i);
    await user.keyboard("{Escape}");
    /* Close is animated now (usePopoverExit): the panel stays mounted
       for its exit, so the callback lands a tick later. */
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});

describe("PresetsPopover — opens via store + PopoverRoot routing", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("openPopover('presets', rect) mounts PresetsPopover via PopoverRoot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ builtin: BUILTIN, project: [] })),
    );
    render(<PopoverRoot />);
    expect(screen.queryByLabelText("Presets")).not.toBeInTheDocument();
    act(() => {
      useStore.getState().openPopover("presets", rect());
    });
    expect(await screen.findByLabelText("Presets")).toBeInTheDocument();
    /* The first preset eventually appears. */
    await screen.findByText(/Generate variations/i);
  });

  test("PopoverRoot returns null when no popover is 'presets'", () => {
    const { container } = render(<PopoverRoot />);
    expect(container.firstChild).toBeNull();
  });
});
