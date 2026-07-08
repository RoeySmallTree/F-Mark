import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MarkdownRenderer } from "../../src/render/MarkdownRenderer.js";

afterEach(() => cleanup());

describe("MarkdownRenderer", () => {
  it("renders parsed HTML in 'rendered' mode (default)", () => {
    const { container } = render(
      <MarkdownRenderer content={"# Hello\n\nworld"} />,
    );
    const prose = container.querySelector(".fm-prose");
    expect(prose).not.toBeNull();
    const html = prose!.innerHTML;
    expect(html).toContain("<h1");
    expect(html).toContain("Hello");
    expect(html).toContain("</h1>");
    expect(html).toMatch(/<p[^>]*>\s*world\s*<\/p>/);
  });

  it("annotates rendered markdown blocks with source line ranges", () => {
    const md = "# Hello\n\n- Alpha\n- Beta\n\nFinal paragraph";
    const { container } = render(<MarkdownRenderer content={md} />);

    const heading = container.querySelector("h1");
    const list = container.querySelector("ul");
    const paragraph = container.querySelector("p");
    expect(heading?.getAttribute("data-source-line")).toBe("1");
    expect(heading?.getAttribute("data-source-line-end")).toBe("1");
    expect(list?.getAttribute("data-source-line")).toBe("3");
    expect(list?.getAttribute("data-source-line-end")).toBe("4");
    expect(paragraph?.getAttribute("data-source-line")).toBe("6");
    expect(paragraph?.getAttribute("data-source-line-end")).toBe("6");
  });

  it("preserves the raw source in 'source' mode", () => {
    const md = "# Hello\n\nworld";
    const { container } = render(
      <MarkdownRenderer content={md} mode="source" />,
    );
    const pre = container.querySelector("pre.fm-source");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toBe(md);
    // No parsed HTML should appear here — no <h1>, just literal hash.
    expect(pre!.querySelector("h1")).toBeNull();
    expect(pre!.textContent).toContain("# Hello");
  });

  it("can wrap rendered words for the live message reveal without changing text", () => {
    const { container } = render(
      <MarkdownRenderer content={"hello **bright** world"} revealWords />,
    );
    const words = container.querySelectorAll(".fm-word-reveal");

    expect(words.length).toBe(3);
    expect(container.textContent).toContain("hello bright world");
  });

  it("renders a closed accordion in 'accordion' mode", () => {
    const { container } = render(
      <MarkdownRenderer
        content={"# First section\n\nBody copy here."}
        mode="accordion"
      />,
    );
    expect(container.querySelector(".fm-accordion")).not.toBeNull();
    const h1 = container.querySelector("button.fm-accordion-h1");
    expect(h1).not.toBeNull();
    expect(h1!.textContent).toContain("First section");
    // Body should be hidden initially (not rendered until clicked).
    expect(container.querySelector(".fm-accordion-body")).toBeNull();
  });

  it("expands the accordion body when its H1 header is clicked", () => {
    const { container } = render(
      <MarkdownRenderer
        content={"# Open me\n\nHidden body."}
        mode="accordion"
      />,
    );
    const h1Btn = screen.getByRole("button", { name: /Open me/ });
    expect(h1Btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(h1Btn);
    expect(h1Btn.getAttribute("aria-expanded")).toBe("true");
    const body = container.querySelector(".fm-accordion-body");
    expect(body).not.toBeNull();
    expect(body!.textContent).toContain("Hidden body");
  });

  it("renders nested H2 subsections inside accordion sections", () => {
    const md = "# Top\n\nintro\n\n## Sub A\n\nA body\n\n## Sub B\n\nB body";
    const { container } = render(
      <MarkdownRenderer content={md} mode="accordion" />,
    );
    // "2 nested" pill should appear on the H1.
    const counter = container.querySelector(".fm-accordion-count");
    expect(counter).not.toBeNull();
    expect(counter!.textContent).toContain("2 nested");
    // Open the H1, the two H2 buttons should appear.
    fireEvent.click(screen.getByRole("button", { name: /Top/ }));
    const h2Buttons = container.querySelectorAll("button.fm-accordion-h2");
    expect(h2Buttons.length).toBe(2);
  });

  it("renders configured JSON sections as an interactive tree in accordion mode", () => {
    const md = '# Payload\n\n{"alpha":{"beta":1},"items":[true,false]}';
    const { container } = render(
      <MarkdownRenderer
        content={md}
        mode="accordion"
        interactiveJsonSections={[{ title: "Payload" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Payload/ }));

    expect(container.querySelector(".fm-json-tree")).not.toBeNull();
    expect(container.querySelector(".fm-prose p")).toBeNull();
    expect(screen.getByText("{ 2 keys }")).toBeInTheDocument();
  });
});
