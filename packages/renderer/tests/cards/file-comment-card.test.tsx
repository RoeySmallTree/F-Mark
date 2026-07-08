import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EVENT_KINDS } from "@f-mark/shared";
import { FileCommentCard } from "../../src/cards/FileCommentCard.js";
import { PARTICIPANTS, resetStore } from "./_helpers.js";

const presentFile = vi.fn();

vi.mock("../../src/shell/usePresentFile.js", () => ({
  usePresentFile: () => presentFile,
}));

describe("FileCommentCard", () => {
  beforeEach(() => {
    resetStore();
    presentFile.mockReset();
  });
  afterEach(() => cleanup());

  it("shows quoted line context and file ref", () => {
    render(
      <FileCommentCard
        event={{
          filename: "c1.prose.md",
          kind: EVENT_KINDS.prose,
          participant_id: "us-a7f3",
          timestamp: "2026-01-01T00:00:00.000Z",
          payload: {
            content: "see this?",
            file_path: "skills/SKILL.md",
            lines: [6, 6],
            line_context: { selected: "# Skill title", sha256: "abc" },
          },
        }}
        participants={PARTICIPANTS}
        allEvents={[]}
      />,
    );
    expect(screen.getByText("# Skill title")).toBeInTheDocument();
    expect(screen.getByText("SKILL.md:6")).toBeInTheDocument();
    expect(screen.getByText("see this?")).toBeInTheDocument();
  });

  it("file ref click opens the file without focusing the comment card", async () => {
    const user = userEvent.setup();
    render(
      <FileCommentCard
        event={{
          filename: "c1.prose.md",
          kind: EVENT_KINDS.prose,
          participant_id: "us-a7f3",
          timestamp: "2026-01-01T00:00:00.000Z",
          payload: {
            content: "note",
            file_path: "src/a.ts",
            lines: [2, 2],
            line_context: { selected: "const x = 1", sha256: "abc" },
          },
        }}
        participants={PARTICIPANTS}
        allEvents={[]}
      />,
    );
    await user.click(screen.getByText("a.ts:2"));
    expect(presentFile).toHaveBeenCalledWith("src/a.ts");
  });
});
