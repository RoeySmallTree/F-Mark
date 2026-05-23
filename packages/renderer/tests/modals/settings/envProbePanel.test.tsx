/* Phase 13 — EnvProbePanel tests.
   Displays the last env probe result and a Re-probe button. The panel does
   not own the probe state — it accepts a snapshot via `envProbe` and a
   `onReprobe` callback that the parent wires to
   `apiClient.refreshEnvProbe()`. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EnvProbeResult } from "@f-mark/shared";
import { EnvProbePanel } from "../../../src/modals/settings/EnvProbePanel.js";

afterEach(() => {
  cleanup();
});

const HEALTHY: EnvProbeResult = {
  tmux: true,
  tmuxVersion: "3.4",
  runtimes: { claude: true, codex: false, gemini: true },
  installer: "apt",
  os: "linux",
};

describe("EnvProbePanel", () => {
  it("shows 'never run' state when envProbe is null", () => {
    render(<EnvProbePanel envProbe={null} onReprobe={() => Promise.resolve()} />);
    expect(screen.getByText(/never run|no probe/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /re-?probe/i }),
    ).toBeInTheDocument();
  });

  it("shows tmux details when present", () => {
    render(<EnvProbePanel envProbe={HEALTHY} onReprobe={() => Promise.resolve()} />);
    expect(screen.getByTestId("env-tmux-row").textContent).toMatch(/3\.4/);
    expect(screen.getByTestId("env-tmux-row").textContent).toMatch(/yes/i);
  });

  it("shows tmux missing", () => {
    render(
      <EnvProbePanel
        envProbe={{ ...HEALTHY, tmux: false, tmuxVersion: null }}
        onReprobe={() => Promise.resolve()}
      />,
    );
    expect(screen.getByTestId("env-tmux-row").textContent).toMatch(/no/i);
  });

  it("lists every runtime with its yes/no", () => {
    render(<EnvProbePanel envProbe={HEALTHY} onReprobe={() => Promise.resolve()} />);
    const claudeRow = screen.getByTestId("env-runtime-row-claude");
    expect(claudeRow.textContent).toMatch(/claude/i);
    expect(claudeRow.textContent).toMatch(/yes/i);
    const codexRow = screen.getByTestId("env-runtime-row-codex");
    expect(codexRow.textContent).toMatch(/no/i);
  });

  it("shows the detected installer", () => {
    render(<EnvProbePanel envProbe={HEALTHY} onReprobe={() => Promise.resolve()} />);
    expect(screen.getByText(/apt/i)).toBeInTheDocument();
  });

  it("clicking Re-probe calls onReprobe", async () => {
    const user = userEvent.setup();
    const onReprobe = vi.fn().mockResolvedValue(undefined);
    render(<EnvProbePanel envProbe={HEALTHY} onReprobe={onReprobe} />);
    await user.click(screen.getByRole("button", { name: /re-?probe/i }));
    expect(onReprobe).toHaveBeenCalledTimes(1);
  });

  it("disables Re-probe while probing", async () => {
    const user = userEvent.setup();
    let resolve: () => void = () => {};
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const onReprobe = vi.fn().mockReturnValue(pending);
    render(<EnvProbePanel envProbe={HEALTHY} onReprobe={onReprobe} />);
    const btn = screen.getByRole("button", { name: /re-?probe/i });
    await user.click(btn);
    expect(btn).toBeDisabled();
    resolve();
    await pending;
  });
});
