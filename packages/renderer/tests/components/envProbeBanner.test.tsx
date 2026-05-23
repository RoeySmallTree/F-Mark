/* EnvProbeBanner — surfaces tmux/runtime installation gaps as a warning
   strip with a "Copy install command" affordance. Visibility is keyed off
   `envProbe.tmux === false`, `envProbe.tmuxVersion < 3.0`, or any
   registered runtime entry being `false` in `envProbe.runtimes`. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnvProbeBanner } from "../../src/components/EnvProbeBanner.js";

afterEach(() => {
  cleanup();
});

const runtimes = {
  claude: { displayName: "Claude Code", executable: "claude" },
  codex: { displayName: "Codex", executable: "codex" },
  gemini: { displayName: "Gemini", executable: "gemini" },
};

describe("EnvProbeBanner", () => {
  it("renders nothing when envProbe is null", () => {
    const { container } = render(
      <EnvProbeBanner
        envProbe={null}
        registeredRuntimes={runtimes}
        onCopyInstall={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when everything is healthy", () => {
    const { container } = render(
      <EnvProbeBanner
        envProbe={{
          tmux: true,
          tmuxVersion: "3.4",
          runtimes: { claude: true, codex: true, gemini: true },
          installer: "apt",
          os: "linux",
        }}
        registeredRuntimes={runtimes}
        onCopyInstall={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders tmux-missing warning with apt install command", () => {
    render(
      <EnvProbeBanner
        envProbe={{
          tmux: false,
          tmuxVersion: null,
          runtimes: {},
          installer: "apt",
          os: "linux",
        }}
        registeredRuntimes={runtimes}
        onCopyInstall={() => {}}
      />,
    );
    expect(screen.getByText(/Tmux not installed/i)).toBeInTheDocument();
    expect(screen.getByText(/sudo apt install -y tmux/)).toBeInTheDocument();
  });

  it("renders brew install command when installer is brew", () => {
    render(
      <EnvProbeBanner
        envProbe={{
          tmux: false,
          tmuxVersion: null,
          runtimes: {},
          installer: "brew",
          os: "darwin",
        }}
        registeredRuntimes={runtimes}
        onCopyInstall={() => {}}
      />,
    );
    expect(screen.getByText(/brew install tmux/)).toBeInTheDocument();
  });

  it("renders fallback when no installer detected", () => {
    render(
      <EnvProbeBanner
        envProbe={{
          tmux: false,
          tmuxVersion: null,
          runtimes: {},
          installer: null,
          os: "linux",
        }}
        registeredRuntimes={runtimes}
        onCopyInstall={() => {}}
      />,
    );
    expect(screen.getByText(/No supported package manager/i)).toBeInTheDocument();
  });

  it("clicking Copy calls onCopyInstall with the command", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    render(
      <EnvProbeBanner
        envProbe={{
          tmux: false,
          tmuxVersion: null,
          runtimes: {},
          installer: "apt",
          os: "linux",
        }}
        registeredRuntimes={runtimes}
        onCopyInstall={onCopy}
      />,
    );
    await user.click(screen.getByText("Copy"));
    expect(onCopy).toHaveBeenCalledWith("sudo apt install -y tmux");
  });

  it("renders tmux-too-old warning", () => {
    render(
      <EnvProbeBanner
        envProbe={{
          tmux: true,
          tmuxVersion: "2.9",
          runtimes: {},
          installer: "apt",
          os: "linux",
        }}
        registeredRuntimes={runtimes}
        onCopyInstall={() => {}}
      />,
    );
    expect(screen.getByText(/Tmux 2.9 is too old/i)).toBeInTheDocument();
  });

  it("renders missing-runtimes list", () => {
    render(
      <EnvProbeBanner
        envProbe={{
          tmux: true,
          tmuxVersion: "3.4",
          runtimes: { claude: true, codex: false, gemini: false },
          installer: "apt",
          os: "linux",
        }}
        registeredRuntimes={runtimes}
        onCopyInstall={() => {}}
      />,
    );
    expect(screen.getByText(/not on PATH/i)).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("Gemini")).toBeInTheDocument();
  });
});
