import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FolderStep } from "../../src/modals/onboarding/FolderStep.js";

const PROJECT_ROOT = "/home/roey/workspace/CABAL/cabal-be";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFolderPickerFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.includes("/fs/list")) {
        return Promise.resolve(
          jsonResponse({
            path: PROJECT_ROOT,
            parent: "/home/roey/workspace/CABAL",
            entries: [],
            truncated: false,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("FolderStep", () => {
  test("has no session-name input; explains the placeholder rename flow", () => {
    stubFolderPickerFetch();
    render(<FolderStep folder={PROJECT_ROOT} onPickFolder={vi.fn()} />);

    expect(screen.queryByLabelText(/session name/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/opens as “new-session”/i),
    ).toBeInTheDocument();
  });

  test("prompts for a folder before showing the placeholder hint", () => {
    stubFolderPickerFetch();
    render(<FolderStep folder={null} onPickFolder={vi.fn()} />);

    expect(screen.getByText("Pick a project folder below.")).toBeInTheDocument();
  });
});
