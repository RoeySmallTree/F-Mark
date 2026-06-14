/* AgentLauncher — replaces <Feed/> + <Compose/> in the feed-col when the
   current session is empty AND no agent participant has connected to it.

   Renders the runtimes table (same source as the topbar `+` menu) as a stack
   of provider cards, each offering Connect (immediate spawn) and Configure
   (force-open IntegrationSetupModal). Footer links into the runtime
   settings panel. The compose stub at the bottom is non-interactive
   placeholder copy — the real Compose returns once an agent is connected. */

import { type CSSProperties, type JSX } from "react";
import { isOfferableRuntimeId } from "@f-mark/shared";
import { useStore } from "../state/store.js";
import { useAgentSpawnContext, type AgentSpawnRuntime } from "../hooks/useAgentSpawn.js";
import {
  runtimeProviderIconStyle,
  runtimeProviderVisual,
} from "../runtimes.js";
import "../components/chips.css";

interface ProviderMeta {
  vendor: string;
  desc: string;
  logoBg: string;
  logoFg: string;
  logoBorder?: boolean;
}

/* Display metadata for known runtimes. Falls back to a generic block
   when the runtime id is unknown — better than failing to render. */
const PROVIDER_META: Record<string, ProviderMeta> = {
  claude: {
    vendor: "Anthropic",
    desc: "File-aware, project-rooted, MCP-ready. The most context-aware coding agent.",
    logoBg: "#1a1714",
    logoFg: "#e89557",
  },
  codex: {
    vendor: "OpenAI",
    desc: "Browser-augmented, sandboxed exec. Strong at multi-step refactors.",
    logoBg: "#0d0d0d",
    logoFg: "#10a37f",
  },
  opencode: {
    vendor: "Community",
    desc: "BYO model, runs local or hosted. Fully open-source, no vendor lock-in.",
    logoBg: "var(--panel)",
    logoFg: "var(--ink)",
    logoBorder: true,
  },
};

function metaFor(runtime: AgentSpawnRuntime): ProviderMeta {
  const known = PROVIDER_META[runtime.id];
  if (known !== undefined) return known;
  return {
    vendor: "CLI agent",
    desc: "Configure to install or connect this runtime.",
    logoBg: "var(--panel)",
    logoFg: "var(--ink)",
    logoBorder: true,
  };
}

const SIZE = 36;

function ProviderLogo({
  runtime,
  meta,
}: {
  runtime: AgentSpawnRuntime;
  meta: ProviderMeta;
}): JSX.Element {
  const visual = runtimeProviderVisual(runtime.id, runtime.displayName);
  const style: CSSProperties = {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE * 0.28,
    flexShrink: 0,
    background: meta.logoBg,
    color: meta.logoFg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--mono)",
    fontSize: SIZE * 0.35,
    fontWeight: 600,
    letterSpacing: 0,
    border: meta.logoBorder === true ? "1px solid var(--line)" : "none",
  };
  return (
    <div
      style={style}
      aria-hidden
      data-provider-mark={
        visual.type === "icon" ? visual.icon.kind : "initials"
      }
    >
      {visual.type === "icon" ? (
        <span
          className="icon-mask"
          data-provider-icon={visual.icon.kind}
          style={runtimeProviderIconStyle(visual.icon)}
        />
      ) : (
        <span data-provider-initials={visual.initials}>
          {visual.initials}
        </span>
      )}
    </div>
  );
}

function StatusPill({ kind }: { kind: "ready" | "missing" }): JSX.Element {
  const c =
    kind === "ready"
      ? { bg: "var(--green-tint)", fg: "var(--green)", bd: "var(--green)" }
      : { bg: "var(--bg)", fg: "var(--ink-4)", bd: "var(--line)" };
  const label = kind === "ready" ? "ready" : "not on PATH";
  const dot: CSSProperties =
    kind === "ready"
      ? {
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--green)",
          boxShadow: "0 0 0 3px rgba(61,122,79,.15)",
        }
      : {
          width: 6,
          height: 6,
          borderRadius: "50%",
          border: "1.5px solid var(--ink-4)",
        };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontFamily: "var(--mono)",
        fontSize: 10.5,
        letterSpacing: ".02em",
        whiteSpace: "nowrap",
        padding: "2px 8px 2px 7px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.bd}`,
      }}
    >
      <span style={dot} aria-hidden />
      {label}
    </span>
  );
}

function ProviderCard({
  runtime,
}: {
  runtime: AgentSpawnRuntime;
}): JSX.Element {
  const spawn = useAgentSpawnContext();
  const meta = metaFor(runtime);
  const status: "ready" | "missing" = runtime.available ? "ready" : "missing";
  const isReady = status === "ready";
  const disabled = spawn.spawnDisabledReason !== null;
  const accessMode = spawn.accessModeForRuntime(runtime.id);
  const accessModeOptions = spawn.accessModeOptionsForRuntime(runtime.id);

  const accentBorder = isReady
    ? "1px solid var(--green)"
    : "1px solid var(--line-2)";

  const cfgStyle: CSSProperties = !isReady
    ? {
        background: "var(--ink)",
        color: "var(--canvas)",
        border: "0",
      }
    : {
        background: "transparent",
        color: "var(--ink-2)",
        border: "1px solid var(--line)",
      };

  return (
    <div
      className="agent-launcher-card"
      style={{
        background: "var(--canvas)",
        border: accentBorder,
        borderRadius: 10,
        boxShadow: "var(--shadow)",
        overflow: "hidden",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          padding: "14px 16px 12px",
        }}
      >
        <ProviderLogo runtime={runtime} meta={meta} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 3,
            }}
          >
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--ink)",
              }}
            >
              {runtime.displayName}
            </span>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10.5,
                color: "var(--ink-4)",
              }}
            >
              {meta.vendor}
            </span>
          </div>
          <div
            style={{
              fontFamily: "var(--serif)",
              fontSize: 13,
              color: "var(--ink-3)",
              fontStyle: "italic",
              lineHeight: 1.45,
            }}
          >
            {meta.desc}
          </div>
        </div>
        {isReady ? (
          <button
            type="button"
            className="agent-launcher-connect"
            disabled={disabled}
            onClick={() => spawn.onSpawnRuntime(runtime.id)}
            style={{
              fontFamily: "var(--sans)",
              fontSize: 13,
              fontWeight: 500,
              flexShrink: 0,
              padding: "7px 16px",
              borderRadius: 6,
              marginTop: 2,
              background: "var(--ink)",
              color: "var(--canvas)",
              border: "1px solid var(--ink)",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            Connect
          </button>
        ) : null}
      </div>
      <div
        style={{
          borderTop: "1px dashed var(--line-2)",
          background: "var(--bg)",
          padding: "9px 16px 9px 66px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button
          type="button"
          className="agent-launcher-configure"
          disabled={disabled}
          onClick={() => spawn.onConfigureRuntime(runtime.id)}
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11.5,
            fontWeight: 500,
            padding: "4px 12px",
            borderRadius: 5,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            cursor: disabled ? "not-allowed" : "pointer",
            ...cfgStyle,
          }}
        >
          <span style={{ fontSize: 10, opacity: 0.7 }}>⚙</span> Configure
        </button>
        {accessModeOptions.length > 1 ? (
          <label className="agent-launcher-access">
            <span>Mode</span>
            <select
              value={accessMode}
              disabled={disabled}
              aria-label={`${runtime.displayName} permission mode`}
              onChange={(event) =>
                spawn.setAccessModeForRuntime(
                  runtime.id,
                  event.currentTarget.value,
                )
              }
            >
              {accessModeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                  {option.deprecated === true ? " (deprecated)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <StatusPill kind={status} />
      </div>
    </div>
  );
}

export function AgentLauncher(): JSX.Element {
  const spawn = useAgentSpawnContext();
  const openSettings = useStore((s) => s.openSettings);
  const runtimes = spawn.runtimes.filter((rt) => isOfferableRuntimeId(rt.id));

  return (
    <section className="feed-col agent-launcher-col" aria-label="Agent launcher">
      <div className="agent-launcher-scroll">
        <div className="agent-launcher-inner">
          <header className="agent-launcher-header">
            <div className="agent-launcher-eyebrow">
              EMPTY — NO AGENT CONNECTED
            </div>
            <h1 className="agent-launcher-title">Add a coding agent</h1>
            <p className="agent-launcher-subtitle">
              F-Mark routes your messages to your CLI agent of choice. Pick one
              to start.
            </p>
          </header>

          {runtimes.length === 0 ? (
            <div className="agent-launcher-empty">
              No runtimes registered. Open{" "}
              <button
                type="button"
                onClick={spawn.onManageRuntimes}
                className="agent-launcher-link"
              >
                runtime settings
              </button>{" "}
              to add one.
            </div>
          ) : (
            <div className="agent-launcher-cards">
              {runtimes.map((rt) => (
                <ProviderCard key={rt.id} runtime={rt} />
              ))}
            </div>
          )}

          {spawn.spawnError !== null ? (
            <div className="agent-launcher-error" role="alert">
              {spawn.spawnError}
            </div>
          ) : null}

          <div className="agent-launcher-footer">
            Using a different agent?{" "}
            <button
              type="button"
              onClick={() => openSettings("runtimes")}
              className="agent-launcher-link"
            >
              Configure manually →
            </button>
          </div>
        </div>
      </div>

      <div className="agent-launcher-compose-stub">
        <div className="agent-launcher-compose-stub-inner">
          Connect an agent above to send your first message…
        </div>
      </div>
    </section>
  );
}
