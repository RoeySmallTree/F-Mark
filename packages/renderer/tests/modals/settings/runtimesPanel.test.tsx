/* Phase 13 — RuntimesPanel tests.
   Lists the runtimes catalog (Manage Runtimes). Each row shows icon,
   displayName, executable, args, and a builtin/custom badge. An inline
   "Add runtime" form expands; clicking Save fires onAdd with the parsed
   entry. Builtin rows can be edited but the Remove button is disabled.
   The form validates the executable against ^[a-zA-Z0-9_./-]+$ before
   submitting. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RuntimeEntry } from "@f-mark/shared";
import { RuntimesPanel } from "../../../src/modals/settings/RuntimesPanel.js";

afterEach(() => {
  cleanup();
});

const BASE_RUNTIMES: Record<string, RuntimeEntry> = {
  claude: {
    displayName: "Claude Code",
    executable: "claude",
    args: [],
    icon: "claude",
    readyDelayMs: 2000,
  },
  codex: {
    displayName: "Codex",
    executable: "codex",
    args: ["--hello"],
    icon: "codex",
    readyDelayMs: 1500,
  },
  gemini: {
    displayName: "Gemini",
    executable: "gemini",
    args: [],
    icon: "gemini",
    readyDelayMs: 1500,
  },
};

function noopAsync(): Promise<void> {
  return Promise.resolve();
}

describe("RuntimesPanel", () => {
  it("renders one row per runtime with key columns", () => {
    render(
      <RuntimesPanel
        runtimes={BASE_RUNTIMES}
        onAdd={() => noopAsync()}
        onUpdate={() => noopAsync()}
        onRemove={() => noopAsync()}
      />,
    );
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    // 1 header + 3 data rows
    expect(rows).toHaveLength(4);
    expect(within(table).getByText("Claude Code")).toBeInTheDocument();
    expect(within(table).getByText("Codex")).toBeInTheDocument();
    expect(within(table).getByText("Gemini")).toBeInTheDocument();
    // The args column for codex should show "--hello"
    expect(within(table).getByText(/--hello/)).toBeInTheDocument();
  });

  it("marks each row as builtin", () => {
    render(
      <RuntimesPanel
        runtimes={BASE_RUNTIMES}
        onAdd={() => noopAsync()}
        onUpdate={() => noopAsync()}
        onRemove={() => noopAsync()}
      />,
    );
    // The three known runtimes are all builtins.
    const badges = screen.getAllByText(/builtin/i);
    expect(badges.length).toBeGreaterThanOrEqual(3);
  });

  it("marks unknown ids as custom", () => {
    const extras: Record<string, RuntimeEntry> = {
      ...BASE_RUNTIMES,
      mybot: {
        displayName: "My Bot",
        executable: "mybot",
        args: [],
        icon: "bot",
      },
    };
    render(
      <RuntimesPanel
        runtimes={extras}
        onAdd={() => noopAsync()}
        onUpdate={() => noopAsync()}
        onRemove={() => noopAsync()}
      />,
    );
    const row = screen.getByTestId("runtime-row-mybot");
    expect(within(row).getByText("My Bot")).toBeInTheDocument();
    expect(within(row).getByText(/custom/i)).toBeInTheDocument();
  });

  it("disables the Remove button for builtins", () => {
    render(
      <RuntimesPanel
        runtimes={BASE_RUNTIMES}
        onAdd={() => noopAsync()}
        onUpdate={() => noopAsync()}
        onRemove={() => noopAsync()}
      />,
    );
    const claudeRow = screen.getByTestId("runtime-row-claude");
    const removeBtn = within(claudeRow).getByRole("button", {
      name: /remove/i,
    });
    expect(removeBtn).toBeDisabled();
  });

  it("enables Remove for custom entries and fires onRemove", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const extras: Record<string, RuntimeEntry> = {
      mybot: {
        displayName: "My Bot",
        executable: "mybot",
        args: [],
      },
    };
    render(
      <RuntimesPanel
        runtimes={extras}
        onAdd={() => noopAsync()}
        onUpdate={() => noopAsync()}
        onRemove={onRemove}
      />,
    );
    const row = screen.getByTestId("runtime-row-mybot");
    const removeBtn = within(row).getByRole("button", { name: /remove/i });
    expect(removeBtn).not.toBeDisabled();
    await user.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith("mybot");
  });

  it("opens an inline Add form when Add runtime is clicked", async () => {
    const user = userEvent.setup();
    render(
      <RuntimesPanel
        runtimes={BASE_RUNTIMES}
        onAdd={() => noopAsync()}
        onUpdate={() => noopAsync()}
        onRemove={() => noopAsync()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add runtime/i }));
    expect(screen.getByLabelText(/runtime id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/executable/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/args/i)).toBeInTheDocument();
  });

  it("calls onAdd with a parsed entry when Save is clicked", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(
      <RuntimesPanel
        runtimes={BASE_RUNTIMES}
        onAdd={onAdd}
        onUpdate={() => noopAsync()}
        onRemove={() => noopAsync()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add runtime/i }));
    await user.type(screen.getByLabelText(/runtime id/i), "mybot");
    await user.type(screen.getByLabelText(/display name/i), "My Bot");
    await user.type(screen.getByLabelText(/executable/i), "mybot");
    await user.type(screen.getByLabelText(/args/i), "--foo bar");
    await user.click(screen.getByRole("button", { name: /save runtime/i }));

    expect(onAdd).toHaveBeenCalledWith("mybot", {
      displayName: "My Bot",
      executable: "mybot",
      args: ["--foo", "bar"],
      icon: "bot",
      readyDelayMs: 1500,
    });
  });

  it("rejects the form with an invalid executable", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(
      <RuntimesPanel
        runtimes={BASE_RUNTIMES}
        onAdd={onAdd}
        onUpdate={() => noopAsync()}
        onRemove={() => noopAsync()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add runtime/i }));
    await user.type(screen.getByLabelText(/runtime id/i), "mybot");
    await user.type(screen.getByLabelText(/display name/i), "My Bot");
    // ';' is not in [a-zA-Z0-9_./-]
    await user.type(screen.getByLabelText(/executable/i), "bad;exec");
    await user.click(screen.getByRole("button", { name: /save runtime/i }));

    // The form should not submit
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/executable/i);
  });

  it("rejects an invalid runtime id", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(
      <RuntimesPanel
        runtimes={BASE_RUNTIMES}
        onAdd={onAdd}
        onUpdate={() => noopAsync()}
        onRemove={() => noopAsync()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add runtime/i }));
    // Uppercase ids are not allowed
    await user.type(screen.getByLabelText(/runtime id/i), "BadID");
    await user.type(screen.getByLabelText(/display name/i), "Bad");
    await user.type(screen.getByLabelText(/executable/i), "bad");
    await user.click(screen.getByRole("button", { name: /save runtime/i }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/id/i);
  });

  it("opens an inline edit form and calls onUpdate when Save is clicked", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <RuntimesPanel
        runtimes={BASE_RUNTIMES}
        onAdd={() => noopAsync()}
        onUpdate={onUpdate}
        onRemove={() => noopAsync()}
      />,
    );
    const row = screen.getByTestId("runtime-row-claude");
    await user.click(within(row).getByRole("button", { name: /edit/i }));
    const display = screen.getByLabelText(/display name/i) as HTMLInputElement;
    expect(display.value).toBe("Claude Code");
    await user.clear(display);
    await user.type(display, "Claude Renamed");
    await user.click(screen.getByRole("button", { name: /save runtime/i }));

    expect(onUpdate).toHaveBeenCalledWith(
      "claude",
      expect.objectContaining({
        displayName: "Claude Renamed",
        executable: "claude",
      }),
    );
  });

  it("renders the readOnlyNote when provided", () => {
    const NOTE = "v0.4: edit .f-mark/runtimes.json directly to change runtimes.";
    render(
      <RuntimesPanel
        runtimes={BASE_RUNTIMES}
        onAdd={() => noopAsync()}
        onUpdate={() => noopAsync()}
        onRemove={() => noopAsync()}
        readOnlyNote={NOTE}
      />,
    );
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it("disables Edit/Remove and hides the Add button when readOnlyNote is set", () => {
    const extras: Record<string, RuntimeEntry> = {
      ...BASE_RUNTIMES,
      mybot: {
        displayName: "My Bot",
        executable: "mybot",
        args: [],
        icon: "bot",
      },
    };
    render(
      <RuntimesPanel
        runtimes={extras}
        onAdd={() => noopAsync()}
        onUpdate={() => noopAsync()}
        onRemove={() => noopAsync()}
        readOnlyNote="v0.4: edit .f-mark/runtimes.json directly."
      />,
    );
    /* All Edit buttons are disabled — both builtin and custom rows. */
    for (const row of [
      screen.getByTestId("runtime-row-claude"),
      screen.getByTestId("runtime-row-codex"),
      screen.getByTestId("runtime-row-gemini"),
      screen.getByTestId("runtime-row-mybot"),
    ]) {
      const editBtn = within(row).getByRole("button", { name: /edit/i });
      expect(editBtn).toBeDisabled();
    }
    /* Custom row's Remove button should also be disabled in read-only mode
       (in non-read-only mode it would be enabled for the custom entry). */
    const customRow = screen.getByTestId("runtime-row-mybot");
    const removeBtn = within(customRow).getByRole("button", {
      name: /remove/i,
    });
    expect(removeBtn).toBeDisabled();
    /* No Add runtime button in read-only mode. */
    expect(
      screen.queryByRole("button", { name: /add runtime/i }),
    ).toBeNull();
  });
});
