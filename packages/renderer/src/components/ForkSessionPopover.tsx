import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import { AlertTriangle, CheckCircle2, GitFork } from "lucide-react";
import type { ForkSessionResponse, SessionMeta } from "../api/client.js";
import { createClient } from "../api/client.js";
import { createManagedAgentsClient } from "../api/managedAgents.js";
import { Popover } from "../popovers/Popover.js";
import { useStore } from "../state/store.js";

interface Props {
  anchorRect: DOMRect | null;
  target: SessionMeta;
  onClose(): void;
  onForked?(response: ForkSessionResponse): void;
}

function defaultForkName(session: SessionMeta): string {
  const slug = session.slug.trim();
  if (slug.length === 0) return "fork";
  return slug.endsWith("-fork") ? `${slug}-2` : `${slug}-fork`;
}

function pathLabel(path: string | undefined): string {
  if (path === undefined || path.length === 0) return "current repo";
  const trimmed = path.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  return slash >= 0 ? trimmed.slice(slash + 1) || trimmed : trimmed;
}

export function ForkSessionPopover({
  anchorRect,
  target,
  onClose,
  onForked,
}: Props): JSX.Element {
  const token = useStore((s) => s.token);
  const activePath = useStore((s) => s.activePath);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setSessions = useStore((s) => s.setSessions);
  const setParticipants = useStore((s) => s.setParticipants);
  const setPathsState = useStore((s) => s.setPathsState);
  const setManagedAgents = useStore((s) => s.setManagedAgents);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(() => defaultForkName(target));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ForkSessionResponse | null>(null);

  useEffect(() => {
    setName(defaultForkName(target));
    setResult(null);
    setError(null);
    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [target.id]);

  const warnings = useMemo(() => {
    if (result === null) return [];
    const agentWarnings = result.agents
      .filter(
        (agent) =>
          agent.status !== "duplicated" && agent.status !== "relaunched",
      )
      .map((agent) => {
        const status = agent.status.replace(/^skipped-/, "");
        return `${agent.display_name}: ${status}`;
      });
    return [...result.warnings, ...agentWarnings];
  }, [result]);

  async function refreshState(response: ForkSessionResponse): Promise<void> {
    const client = createClient({ baseUrl: "", token });
    const managed = createManagedAgentsClient({ baseUrl: "", token });
    try {
      const paths = await client.getPaths();
      setPathsState(paths);
    } catch {
      // Older kernels do not expose multi-path state.
    }
    const [sessions, participants, status] = await Promise.all([
      client.listSessions(),
      client.listParticipants(),
      managed.status().catch(() => null),
    ]);
    setSessions(sessions);
    setParticipants(participants);
    if (status !== null) {
      setManagedAgents(
        status.agents.map((agent) => ({
          participant_id: agent.participant_id,
          tmux_session: agent.tmux_session,
          runtime_id: agent.runtime_id,
          runtime_session: agent.runtime_session,
          alive: agent.connection_state === "connected",
        })),
      );
    }
    setCurrentSession(response.session.id);
  }

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Name is required.");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const client = createClient({ baseUrl: "", token });
      const path = target.path;
      const response = await client.forkSession(target.id, {
        name: trimmed,
        ...(path !== undefined && path !== activePath ? { path } : {}),
      });
      await refreshState(response);
      setResult(response);
      onForked?.(response);
      if (
        response.warnings.length === 0 &&
        response.agents.every(
          (agent) => agent.status === "duplicated" || agent.status === "relaunched",
        )
      ) {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover
      anchorRect={anchorRect}
      placement="bottom-end"
      onClose={onClose}
      className="fork-session-pop"
      ariaLabel="Fork session"
    >
      <form className="fork-session-form" onSubmit={(e) => void submit(e)}>
        <div className="pop-head">
          <GitFork size={14} aria-hidden style={{ color: "var(--ink-2)" }} />
          Fork Session
        </div>
        <div className="pop-section fork-session-fields">
          <div className="fork-source-line">
            <span className="fork-source-slug">{target.slug}</span>
            <span className="fork-source-path">{pathLabel(target.path)}</span>
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="fork-session-name">
              Name
            </label>
            <input
              ref={inputRef}
              id="fork-session-name"
              className="form-input"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy || result !== null}
            />
          </div>
          {error !== null ? (
            <div className="fork-session-error" role="alert">
              {error}
            </div>
          ) : null}
          {result !== null ? (
            <div className="fork-session-result" role="status">
              <div className="fork-session-result-head">
                <CheckCircle2 size={14} aria-hidden />
                <span>{result.session.slug}</span>
              </div>
              {warnings.length > 0 ? (
                <div className="fork-session-warnings">
                  <AlertTriangle size={14} aria-hidden />
                  <div>
                    {warnings.map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="pop-foot fork-session-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            {result === null ? "Cancel" : "Close"}
          </button>
          {result === null ? (
            <button
              type="submit"
              className="btn-solid"
              disabled={busy || name.trim().length === 0}
            >
              {busy ? "Forking…" : "Fork"}
            </button>
          ) : null}
        </div>
      </form>
    </Popover>
  );
}
