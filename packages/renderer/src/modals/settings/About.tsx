const NO_LOOSE_STRING_VALUES = {
  loading: "loading…",
} as const;

/* About section — Settings -> About.
   Renders the embedded ASCII logo frame plus live version data from
   GET /health, a short architecture blurb, and project links. */

import { useEffect, useState, type JSX } from "react";
import { createClient } from "../../api/client.js";
import { useStore } from "../../state/store.js";
import { ASCII_LOGO } from "../../branding.js";

const DESCRIPTION = `F-Mark is a document-based interface for AI agents to collaborate with humans on an append-only event log. The kernel runs a small Fastify server; each session is a directory of plain-text events that the renderer aggregates into a live feed.`;

export function About(): JSX.Element {
  const token = useStore((s) => s.token);
  const [version, setVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const client = createClient({ baseUrl: "", token });
        const health = await client.health();
        if (!cancelled) {
          setVersion(health.version);
          setStatus(health.status);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <>
      <h3 className="settings-h">About F-Mark</h3>
      <div className="about-block">
        <pre aria-hidden="true" data-testid="ascii-logo">
          {ASCII_LOGO}
        </pre>
        <div className="about-version">
          F-Mark{" "}
          <b>
            {version !== null ? `v${version}` : error !== null ? "version unknown" : NO_LOOSE_STRING_VALUES.loading}
          </b>{" "}
          {status !== null ? `· status: ${status}` : null}
          <br />
          Document-based collaboration between humans and AI agents
        </div>
        <div className="about-description">{DESCRIPTION}</div>
        <div className="about-links">
          <a
            href="https://github.com/anthropics/f-mark"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
    </>
  );
}
