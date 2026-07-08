import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LineMarker } from "../../src/cards/lineCommentRail/LineMarker.js";

describe("LineMarker icons", () => {
  const box = { line: 1, top: 0, bottom: 20, center: 10 };

  it("uses Add comment label for draft markers", () => {
    render(
      <div className="line-comment-anchor draft">
        <LineMarker
          lines={[1, 1]}
          box={box}
          count={null}
          color="var(--user)"
          active={false}
          kind="draft"
          label="Add comment on line 1"
          onClick={() => {}}
        />
      </div>,
    );
    expect(screen.getByLabelText("Add comment on line 1")).toBeInTheDocument();
    expect(document.querySelector(".line-comment-marker.draft")).not.toBeNull();
  });

  it("uses Open comment label for existing markers", () => {
    render(
      <div className="line-comment-anchor existing">
        <LineMarker
          lines={[2, 2]}
          box={box}
          count={1}
          color="var(--agent)"
          active={false}
          kind="existing"
          label="Open comment on line 2"
          onClick={() => {}}
        />
      </div>,
    );
    expect(screen.getByLabelText("Open comment on line 2")).toBeInTheDocument();
    expect(document.querySelector(".line-comment-marker.existing")).not.toBeNull();
  });
});
