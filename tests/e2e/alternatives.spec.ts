import { expect, test, type Page } from "@playwright/test";

/* E2E for the visual-alternatives feature (fmark_post_alternatives → a choices
   widget whose options each render an HTML preview, with a fullscreen modal).
   Self-contained: mocks every API route the shell needs, serves raw bundles,
   and records posted choices. */

type EventRecord = {
  filename: string;
  timestamp: string;
  participant_id: string;
  kind: string;
  payload: Record<string, unknown>;
};

const now = "2026-06-14T12:00:00.000Z";
const pathState = {
  activePath: "/tmp/fmark-alt",
  activePathId: "path-alt",
  activeRevision: 1,
  knownPaths: ["/tmp/fmark-alt"],
  favorites: [],
};

const user = { kind: "user" as const, name: "You", color: "#2563eb" };
const agent = {
  kind: "agent" as const,
  name: "Claude",
  color: "#b45309",
  runtime_id: "claude",
  active_session: "s-main",
};

function alternativesEvents(): EventRecord[] {
  return [
    {
      filename: "20260614T120000.001Z_ag-claude.html",
      timestamp: "2026-06-14T12:00:00.001Z",
      participant_id: "ag-claude",
      kind: "html",
      payload: { id: "opt-a", title: "Hero first" },
    },
    {
      filename: "20260614T120000.002Z_ag-claude.html",
      timestamp: "2026-06-14T12:00:00.002Z",
      participant_id: "ag-claude",
      kind: "html",
      payload: { id: "opt-b", title: "Split layout" },
    },
    {
      filename: "20260614T120001Z_ag-claude.choices.json",
      timestamp: "2026-06-14T12:00:01.000Z",
      participant_id: "ag-claude",
      kind: "choices",
      payload: {
        id: "design",
        question: "Which landing design?",
        multi: false,
        options: [
          {
            id: "a",
            label: "Hero first",
            html: "20260614T120000.001Z_ag-claude.html",
          },
          {
            id: "b",
            label: "Split layout",
            html: "20260614T120000.002Z_ag-claude.html",
          },
        ],
      },
    },
  ];
}

async function installMocks(page: Page): Promise<{ choicePosts: unknown[] }> {
  const choicePosts: unknown[] = [];
  // Suppress the first-run onboarding wizard so it doesn't overlay the app.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("fmark:settings:onboarded", "true");
    } catch {
      /* localStorage unavailable — ignore */
    }
  });
  await page.route("**/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (method === "GET" && path === "/paths") return json(pathState);
    if (method === "GET" && path === "/sessions") {
      return json({
        sessions: [
          {
            id: "s-main",
            slug: "main",
            created_at: now,
            path: pathState.activePath,
            path_id: pathState.activePathId,
          },
        ],
      });
    }
    if (method === "GET" && path === "/participants") {
      return json({
        participants: { "user-main": user, "ag-claude": agent },
      });
    }
    if (method === "GET" && path === "/health") {
      return json({ status: "ok", version: "alt-e2e", processApiEnabled: true });
    }
    if (method === "GET" && path === "/managed-agents") {
      return json({ agents: [], terminals: [] });
    }
    if (method === "GET" && path === "/managed-agents/status") {
      return json({ agents: [] });
    }
    if (method === "GET" && path === "/env-probe") {
      return json({ os: "linux", shell: "zsh", tmux: true, runtimes: { claude: true } });
    }
    if (method === "GET" && /^\/sessions\/[^/]+\/events$/.test(path)) {
      return json({ events: alternativesEvents() });
    }
    if (method === "GET" && /^\/sessions\/[^/]+\/todos$/.test(path)) {
      return json({ open: [], wip: [], done: [], tree: [] });
    }
    if (method === "GET" && /\/raw\/[^/]+\/index\.html$/.test(path)) {
      const bundle = path.split("/raw/")[1]?.split("/")[0] ?? "bundle";
      return route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><html><body><h1 data-bundle="${bundle}">marker ${bundle}</h1></body></html>`,
      });
    }
    if (method === "POST" && /^\/sessions\/[^/]+\/events\/choice$/.test(path)) {
      choicePosts.push(route.request().postDataJSON());
      return json({ filename: "20260614T120100Z_user-main.choice.json" });
    }
    return route.continue();
  });
  return { choicePosts };
}

test("visual alternatives: option iframes, hidden child embeds, fullscreen modal, and selection", async ({
  page,
}) => {
  const { choicePosts } = await installMocks(page);
  await page.goto("/");

  // The visual multi-option grid renders one preview card + iframe per option.
  await expect(page.locator(".choices-options-grid")).toBeVisible();
  await expect(page.locator(".choice-preview-card")).toHaveCount(2);
  const frames = page.locator(".choice-preview-frame iframe");
  await expect(frames).toHaveCount(2);

  // The child html bundles are consumed by the widget, never standalone embeds.
  await expect(page.locator(".embed-card")).toHaveCount(0);

  // The option iframe loads the bundle's raw index.html.
  await expect(frames.first()).toHaveAttribute(
    "src",
    /raw\/20260614T120000\.001Z_ag-claude\.html\/index\.html/,
  );

  // Fullscreen opens the modal with a large iframe of the same bundle.
  await page
    .getByRole("button", { name: /Fullscreen/ })
    .first()
    .click();
  const modal = page.locator(".html-preview-modal");
  await expect(modal).toBeVisible();
  await expect(modal.locator("iframe")).toHaveAttribute(
    "src",
    /raw\/20260614T120000\.001Z_ag-claude\.html\/index\.html/,
  );

  // Escape closes the modal.
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();

  // Selecting an option posts a choice with the widget id + option id.
  await page.getByRole("button", { name: /Hero first/ }).click();
  await expect.poll(() => choicePosts.length).toBe(1);
  expect(choicePosts[0]).toMatchObject({ choices_id: "design", selected: ["a"] });
});
