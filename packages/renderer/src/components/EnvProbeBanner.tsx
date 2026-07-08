const NO_LOOSE_STRING_VALUES = {
  unknown: "unknown",
} as const;

/* EnvProbeBanner — warning strip that surfaces tmux + runtime gaps detected
   by the kernel's `/env-probe`. Visible only when something needs action:
   tmux missing, tmux too old (< 3.0), or a registered runtime not on PATH.
   The "Copy install command" button delegates clipboard write to the parent
   so the component stays pure. */

import "./envProbeBanner.css";
import type { EnvProbeResult } from "@f-mark/shared";

export interface EnvProbeBannerProps {
  envProbe: EnvProbeResult | null;
  registeredRuntimes: Record<string, { displayName: string; executable: string }>;
  onCopyInstall(command: string): void;
}

function installCommand(installer: string | null): string | null {
  switch (installer) {
    case "apt":
      return "sudo apt install -y tmux";
    case "brew":
      return "brew install tmux";
    case "dnf":
      return "sudo dnf install -y tmux";
    case "yum":
      return "sudo yum install -y tmux";
    case "zypper":
      return "sudo zypper install -y tmux";
    case "port":
      return "sudo port install tmux";
    case "pacman":
      return "sudo pacman -S --noconfirm tmux";
    default:
      return null;
  }
}

function parseTmuxVersion(
  v: string | null,
): { major: number; minor: number } | null {
  if (!v) return null;
  const m = /^(\d+)\.(\d+)/.exec(v);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

export function EnvProbeBanner({
  envProbe,
  registeredRuntimes,
  onCopyInstall,
}: EnvProbeBannerProps): JSX.Element | null {
  if (!envProbe) return null;

  const tmuxMissing = !envProbe.tmux;
  const ver = parseTmuxVersion(envProbe.tmuxVersion);
  const tmuxTooOld = envProbe.tmux && (!ver || ver.major < 3);
  const missingRuntimes = Object.keys(registeredRuntimes).filter(
    (id) => envProbe.runtimes[id] === false,
  );

  if (!tmuxMissing && !tmuxTooOld && missingRuntimes.length === 0) {
    return null;
  }

  const cmd = installCommand(envProbe.installer);

  return (
    <div className="env-probe-banner" role="alert">
      {tmuxMissing && (
        <div className="env-probe-tmux-missing">
          <strong>Tmux not installed</strong> — managed agents disabled.
          {cmd !== null ? (
            <>
              {" Install with: "}
              <code>{cmd}</code>
              <button
                type="button"
                onClick={() => onCopyInstall(cmd)}
                className="env-probe-copy"
              >
                Copy
              </button>
            </>
          ) : (
            <>
              {" No supported package manager detected. See "}
              <a
                href="https://github.com/tmux/tmux/wiki/Installing"
                target="_blank"
                rel="noopener noreferrer"
              >
                tmux installation docs
              </a>
              .
            </>
          )}
        </div>
      )}
      {tmuxTooOld && (
        <div className="env-probe-tmux-old">
          <strong>Tmux {envProbe.tmuxVersion ?? NO_LOOSE_STRING_VALUES.unknown} is too old</strong>{" "}
          — need 3.0+.
          {cmd !== null ? (
            <>
              {" Update with: "}
              <code>{cmd}</code>
              <button
                type="button"
                onClick={() => onCopyInstall(cmd)}
                className="env-probe-copy"
              >
                Copy
              </button>
            </>
          ) : null}
        </div>
      )}
      {missingRuntimes.length > 0 && (
        <div className="env-probe-runtimes-missing">
          These runtimes are not on PATH and their + options will be disabled:{" "}
          {missingRuntimes.map((id, i) => (
            <span key={id}>
              {i > 0 ? ", " : ""}
              <code>{registeredRuntimes[id]?.displayName ?? id}</code>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
