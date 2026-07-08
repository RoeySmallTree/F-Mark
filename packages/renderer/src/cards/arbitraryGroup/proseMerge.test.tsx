import { describe, expect, test } from "vitest";
import { installArbitraryGroupCardTestEnvironment } from "../arbitraryGroupCardTest";
import { renderGroup } from "../arbitraryGroupCardTest/render";
import { makeGroup, prose, tool } from "../arbitraryGroupCardTest/fixtures";
import { clickGroupToggle } from "../arbitraryGroupCardTest/queries";

installArbitraryGroupCardTestEnvironment();

/* These prose deltas are how F-Mark persists a streamed assistant message:
   one `arbitrary: true` .prose.md file per MessageDisplay delta, no
   coalescing. When the model streams a fenced code block across a delta
   boundary, parsing each delta as standalone markdown produces two empty
   <pre> boxes and spurious <em> from asterisks that should be literal
   inside the fence. The group must reconstruct the message by joining the
   run and parsing it as one document. */
describe("ArbitraryGroup prose-delta merge", () => {
  test("renders a code fence split across two prose deltas as one code block", () => {
    const deltaA = prose(
      "If you want to check it yourself in one shot:\n\n```bash\n",
      "20260523T100000Z",
    );
    const deltaB = prose(
      "grep -rn foo --include=*.ts --include=*.json | grep -v node_modules\n```\n",
      "20260523T100001Z",
    );
    const group = makeGroup({
      status: "concluded",
      items: [deltaA, deltaB],
      toolCount: 0,
      timeRangeStart: "20260523T100000Z",
      timeRangeEnd: "20260523T100001Z",
    });

    const { container } = renderGroup({ group });
    clickGroupToggle(); // concluded groups are collapsed by default

    const codeBlocks = container.querySelectorAll(".toolbox-body .fm-prose pre");
    expect(codeBlocks).toHaveLength(1);
    expect(codeBlocks[0]?.textContent).toContain(
      "grep -rn foo --include=*.ts --include=*.json | grep -v node_modules",
    );
    // Asterisks inside the fence stay literal — no emphasis leaks out.
    expect(container.querySelector(".toolbox-body .fm-prose em")).toBeNull();
  });

  test("merges deltas into one live message card while streaming", () => {
    const group = makeGroup({
      status: "streaming",
      items: [
        prose("Looking ", "20260523T100000Z"),
        prose("into ", "20260523T100001Z"),
        prose("the failure now.", "20260523T100002Z"),
      ],
      toolCount: 0,
      timeRangeStart: "20260523T100000Z",
      timeRangeEnd: "20260523T100002Z",
    });

    // Streaming groups are open by default — no toggle needed.
    const { container } = renderGroup({ group });

    const messages = container.querySelectorAll(".msg-card");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.textContent).toContain("Looking into the failure now.");
    // A group that mounts with a batch (load/switch) does NOT word-reveal — the
    // scramble fires only on live in-place growth, never on initial render.
    expect(container.querySelectorAll(".fm-word-reveal").length).toBe(0);
  });

  test("exposes one commentable surface for the whole merged message", () => {
    const group = makeGroup({
      status: "concluded",
      items: [
        prose("Line one of the answer.\n\n", "20260523T100000Z"),
        prose("Line two of the answer.\n", "20260523T100001Z"),
      ],
      toolCount: 0,
      timeRangeStart: "20260523T100000Z",
      timeRangeEnd: "20260523T100001Z",
    });

    const { container } = renderGroup({ group });
    clickGroupToggle();

    // A single coherent comment rail over the joined message, not one per delta.
    const rails = container.querySelectorAll(".commentable");
    expect(rails).toHaveLength(1);
    expect(rails[0]?.textContent).toContain("Line one of the answer.");
    expect(rails[0]?.textContent).toContain("Line two of the answer.");
  });

  test("keeps a tool-use between two prose runs as its own card", () => {
    const group = makeGroup({
      status: "concluded",
      items: [
        prose("First paragraph before the tool.\n", "20260523T100000Z"),
        tool("Bash", "20260523T100001Z"),
        prose("Second paragraph after the tool.\n", "20260523T100002Z"),
      ],
      toolCount: 1,
      timeRangeStart: "20260523T100000Z",
      timeRangeEnd: "20260523T100002Z",
    });

    const { container } = renderGroup({ group });
    clickGroupToggle();

    // Two distinct prose messages (the tool-use breaks the run), not one merge.
    const messages = container.querySelectorAll(".msg-card");
    expect(messages).toHaveLength(2);
    expect(messages[0]?.textContent).toContain("First paragraph before the tool.");
    expect(messages[1]?.textContent).toContain("Second paragraph after the tool.");
  });
});
