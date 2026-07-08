import { fireEvent, screen, within } from "@testing-library/react";
import { expect } from "vitest";

export function getGroupToggle() {
  return screen.getByRole("button", { name: /toggle group/i });
}

export function getGroupToggles() {
  return screen.getAllByRole("button", { name: /toggle group/i });
}

export function getGroupStatus() {
  return screen.getByLabelText("group status");
}

export function clickGroupToggle(index = 0) {
  const toggle = getGroupToggles()[index];
  if (!toggle) {
    throw new Error(`Missing group toggle at index ${index}`);
  }

  fireEvent.click(toggle);
  return toggle;
}

export function expectGroupToggleExpanded(toggle: HTMLElement, expanded: boolean) {
  expect(toggle).toHaveAttribute("aria-expanded", String(expanded));
}

export function expectGroupTextVisible(text: string) {
  const body = document.querySelector(".toolbox-body");
  expect(body).not.toBeNull();
  expect(within(body as HTMLElement).getByText(text)).toBeInTheDocument();
}

export function expectGroupTextHidden(text: string) {
  const body = document.querySelector(".toolbox-body");
  if (!body) {
    expect(body).toBeNull();
    return;
  }
  expect(within(body as HTMLElement).queryByText(text)).not.toBeInTheDocument();
}

export function expectGroupPreviewTextVisible(text: string) {
  const preview = screen.getByLabelText("Toolbox preview");
  expect(within(preview).getByText(text)).toBeInTheDocument();
}

export function expectGroupToolTypeVisible(text: string) {
  const body = document.querySelector(".toolbox-body");
  expect(body).not.toBeNull();
  expect(
    within(body as HTMLElement).getByText(text, { selector: ".tool-type" }),
  ).toBeInTheDocument();
}

export function expectHeaderSeparatesTitleAndStatus() {
  const header = getGroupToggle();
  const title = header.querySelector(".tb-title");
  const status = header.querySelector(".tb-status");

  expect(title).not.toBeNull();
  expect(status).not.toBeNull();
  expect(title).toHaveTextContent("Azrok");
  expect(title).not.toHaveTextContent("3 tools");
  expect(within(status as HTMLElement).getByText("5 s")).toBeInTheDocument();
  expect(within(header).getByText("3 tools")).toBeInTheDocument();
}

export function expectHeaderOmitsNaNWithFallback() {
  const header = getGroupToggle();
  expect(header).not.toHaveTextContent("NaN");
  expect(header).toHaveTextContent("working");
  expect(header).toHaveTextContent("1 tool");
  expect(header.querySelector(".run-dot")).not.toBeNull();
}

export function expectHeaderOmitsInvalidCompletedTiming() {
  const header = getGroupToggle();
  expect(header).not.toHaveTextContent("NaN");
  expect(header).not.toHaveTextContent("working");
  expect(header).toHaveTextContent("1 tool");
}

export function expectToolDetailExpansion(states: string[]) {
  expect(
    screen.getAllByRole("button", { name: /toggle tool details/i }).map((button) =>
      button.getAttribute("aria-expanded"),
    ),
  ).toEqual(states);
}

export function expectCommandSummaryHidden(index: number) {
  expect(
    screen.queryByText(new RegExp(`cmd${index}`), { selector: ".tool-summary-primary" }),
  ).not.toBeInTheDocument();
}

export function expectCommandSummaryVisible(index: number) {
  expect(
    screen.getByText(new RegExp(`cmd${index}`), { selector: ".tool-summary-primary" }),
  ).toBeInTheDocument();
}

export function expectNoOlderToolsButton() {
  expect(screen.queryByRole("button", { name: /show 2 older tools/i })).not.toBeInTheDocument();
}

export function showOlderToolsButton() {
  return screen.getByRole("button", { name: /show 2 older tools/i });
}
