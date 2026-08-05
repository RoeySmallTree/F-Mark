/* H1 — the "everything" view mode previously fell through to the
   catch-all and always rendered the loading spinner, even once loading
   had finished and the feed was genuinely empty. */

import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FeedEmptyState } from "../../src/shell/FeedEmptyState.js";

afterEach(() => {
  cleanup();
});

describe("FeedEmptyState — everything mode", () => {
  test("renders the empty vignette, not the loading state, once loading is done", () => {
    render(<FeedEmptyState viewMode="everything" loading={false} />);
    expect(screen.getByText(/Nothing here yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /loading/i })).toBeNull();
  });

  test("still renders the loading state while loading is true", () => {
    render(<FeedEmptyState viewMode="everything" loading={true} />);
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByText(/Nothing here yet/i)).toBeNull();
  });
});
