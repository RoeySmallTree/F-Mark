import {
  render,
  screen,
  within,
  type RenderResult,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { expect } from "vitest";
import { RuntimesPanel } from "../../../../src/modals/settings/RuntimesPanel.js";
import { BASE_RUNTIMES } from "./fixtures.js";

type RuntimesPanelProps = ComponentProps<typeof RuntimesPanel>;
type PanelOverrides = Partial<RuntimesPanelProps>;
type RuntimeUser = ReturnType<typeof userEvent.setup>;
type RuntimePanelHarness = RenderResult & { user: RuntimeUser };

type RuntimeFormValues = Partial<{
  id: string;
  displayName: string;
  executable: string;
  args: string;
  env: string;
}>;

function noopAsync(): Promise<void> {
  return Promise.resolve();
}

export function renderRuntimesPanel(
  overrides: PanelOverrides = {},
): RenderResult {
  return render(
    <RuntimesPanel
      runtimes={BASE_RUNTIMES}
      onAdd={noopAsync}
      onUpdate={noopAsync}
      onRemove={noopAsync}
      {...overrides}
    />,
  );
}

export function setupRuntimesPanel(
  overrides: PanelOverrides = {},
): RuntimePanelHarness {
  return {
    user: userEvent.setup(),
    ...renderRuntimesPanel(overrides),
  };
}

function runtimeRow(id: string): HTMLElement {
  return screen.getByTestId(`runtime-row-${id}`);
}

export function runtimeRemoveButton(id: string): HTMLElement {
  return within(runtimeRow(id)).getByRole("button", { name: /remove/i });
}

export function runtimeDisplayNameInput(): HTMLInputElement {
  return screen.getByLabelText(/display name/i) as HTMLInputElement;
}

export async function openAddRuntimeForm(user: RuntimeUser): Promise<void> {
  await user.click(screen.getByRole("button", { name: /add runtime/i }));
}

export async function clickReprobe(user: RuntimeUser): Promise<void> {
  await user.click(screen.getByRole("button", { name: /re-?probe/i }));
}

export async function clickRemoveRuntime(
  user: RuntimeUser,
  id: string,
): Promise<void> {
  await user.click(runtimeRemoveButton(id));
}

export async function clickEditRuntime(
  user: RuntimeUser,
  id: string,
): Promise<void> {
  await user.click(
    within(runtimeRow(id)).getByRole("button", { name: /edit/i }),
  );
}

export async function saveRuntime(user: RuntimeUser): Promise<void> {
  await user.click(screen.getByRole("button", { name: /save runtime/i }));
}

async function fillRuntimeForm(
  user: RuntimeUser,
  values: RuntimeFormValues,
): Promise<void> {
  const fields = runtimeFormFields();
  await typeIfPresent(user, fields.id, values.id);
  await typeIfPresent(user, fields.displayName, values.displayName);
  await typeIfPresent(user, fields.executable, values.executable);
  await typeIfPresent(user, fields.args, values.args);
  await typeIfPresent(user, fields.env, values.env);
}

export async function submitNewRuntime(
  user: RuntimeUser,
  values: RuntimeFormValues,
): Promise<void> {
  await openAddRuntimeForm(user);
  await fillRuntimeForm(user, values);
  await saveRuntime(user);
}

async function typeIfPresent(
  user: RuntimeUser,
  field: HTMLElement,
  value: string | undefined,
): Promise<void> {
  if (value !== undefined) {
    await user.type(field, value);
  }
}

function runtimeFormFields() {
  return {
    id: screen.getByLabelText(/runtime id/i),
    displayName: screen.getByLabelText(/display name/i),
    executable: screen.getByLabelText(/executable/i),
    args: screen.getByLabelText(/args/i),
    env: screen.getByLabelText(/^env$/i),
  };
}

export function assertRuntimeTableColumns(): void {
  const table = screen.getByRole("table");
  const rows = within(table).getAllByRole("row");
  expect(rows).toHaveLength(4);
  for (const displayName of ["Claude Code", "Codex", "Opencode"]) {
    expect(within(table).getByText(displayName)).toBeInTheDocument();
  }
  expect(within(table).getByText(/--hello/)).toBeInTheDocument();
}

export function assertProbeSummaryVisible(): void {
  const expectedProbeRows = [
    ["runtime-probe-os", /linux/i],
    ["runtime-probe-installer", /apt/i],
    ["runtime-probe-tmux", /3\.4/],
  ] as const;

  for (const [testId, content] of expectedProbeRows) {
    expect(screen.getByTestId(testId)).toHaveTextContent(content);
  }
  expect(
    screen.getByRole("heading", { name: /runtimes list/i }),
  ).toBeInTheDocument();
}

export function assertRuntimePathStatus(
  id: string,
  status: RegExp,
): void {
  expect(runtimeRow(id)).toHaveTextContent(status);
}

export function assertBuiltinBadgesVisible(): void {
  expect(screen.getAllByText(/builtin/i).length).toBeGreaterThanOrEqual(3);
}

export function assertCustomRuntimeRow(): void {
  const row = runtimeRow("mybot");
  expect(within(row).getByText("My Bot")).toBeInTheDocument();
  expect(within(row).getByText(/custom/i)).toBeInTheDocument();
}

export function assertRetiredRuntimeHidden(): void {
  expect(screen.queryByTestId("runtime-row-gemini")).toBeNull();
  expect(screen.queryByText(/^gemini$/i)).toBeNull();
}

export function assertAddRuntimeFormVisible(): void {
  const fields = runtimeFormFields();
  expect(fields.id).toBeInTheDocument();
  expect(fields.displayName).toBeInTheDocument();
  expect(fields.executable).toBeInTheDocument();
  expect(fields.args).toBeInTheDocument();
  expect(fields.env).toBeInTheDocument();
}

export function assertReadOnlyRuntimeControls(runtimeIds: string[]): void {
  for (const id of runtimeIds) {
    expect(within(runtimeRow(id)).getByRole("button", { name: /edit/i }))
      .toBeDisabled();
  }
  expect(runtimeRemoveButton("mybot")).toBeDisabled();
  expect(screen.queryByRole("button", { name: /add runtime/i })).toBeNull();
}
