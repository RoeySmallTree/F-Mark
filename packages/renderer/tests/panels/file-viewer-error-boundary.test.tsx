import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FileViewerErrorBoundary } from "../../src/panels/fileViewer/FileViewerErrorBoundary.js";

function Boom({ message }: { message: string }): JSX.Element {
  throw new TypeError(message);
}

describe("FileViewerErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("turns stale dynamic import failures into a reload affordance", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();

    render(
      <FileViewerErrorBoundary
        reloadApp={reload}
        resetKey="/repo/src/index.ts"
      >
        <Boom message="Failed to fetch dynamically imported module: http://localhost:7778/assets/index-BjtbifiZ.js" />
      </FileViewerErrorBoundary>,
    );

    expect(
      screen.getByText("This file viewer code is unavailable."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/app was updated while this browser tab still has an older build open/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/index-BjtbifiZ\.js/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reload app" }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
  });

  test("resets after switching to another active file", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(
      <FileViewerErrorBoundary resetKey="/repo/a.ts">
        <Boom message="Failed to fetch dynamically imported module: /assets/a.js" />
      </FileViewerErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <FileViewerErrorBoundary resetKey="/repo/b.ts">
        <div>next file loaded</div>
      </FileViewerErrorBoundary>,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("next file loaded")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
  });
});
