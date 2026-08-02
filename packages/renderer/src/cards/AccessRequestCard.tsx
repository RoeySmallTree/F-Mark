import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import type {
  AccessRequestPayload,
  AccessRequestSuggestion,
  AccessResponsePayload,
  AnyEventRecord,
  Participant,
} from "@f-mark/shared";
import {
  ManagedAgentsApiError,
  createManagedAgentsClient,
} from "../api/managedAgents.js";
import { scopeToBody } from "../api/rootScope.js";
import { useCurrentSessionRootScope } from "../hooks/useCurrentSessionRootScope.js";
import { useElapsed } from "../hooks/useElapsed.js";
import { useStore } from "../state/store.js";
import { ErrorNotice, type StructuredError } from "./ToolPresentationParts.js";
import {
  presentAccessRequest,
  renderPresentationSections,
  renderRawDetails,
} from "./toolPresentation.js";
import { ApprovalActions } from "./ApprovalActions.js";

const NO_LOOSE_STRING_VALUES = {
  accessResponse: "access-response",
  accessRequest: "access-request",
  open: "open",
  approve: "approve",
  deny: "deny",
  resolved: "resolved",
  card: "card",
  approved: "approved",
  allowed: "allowed",
} as const;

function latestAccessResponse(
  requestId: string,
  events: AnyEventRecord[],
): AccessResponsePayload | null {
  return (
    events
      .filter((event) => event.kind === NO_LOOSE_STRING_VALUES.accessResponse)
      .map((event) => event.payload as AccessResponsePayload)
      .filter((payload) => payload.request_id === requestId)
      .sort((a, b) => a.responded_at.localeCompare(b.responded_at))
      .at(-1) ?? null
  );
}

export function accessRequestOpen(
  event: AnyEventRecord,
  events: AnyEventRecord[],
): boolean {
  if (event.kind !== NO_LOOSE_STRING_VALUES.accessRequest) return false;
  const payload = event.payload as AccessRequestPayload;
  if (payload.status !== NO_LOOSE_STRING_VALUES.open) return false;
  return latestAccessResponse(payload.request_id, events) === null;
}

export function pendingAccessCountForParticipant(
  participantId: string,
  events: AnyEventRecord[],
): number {
  return events.filter(
    (event) =>
      event.participant_id === participantId && accessRequestOpen(event, events),
  ).length;
}

/* Picks the raw status word — never shown directly, only used as the
   data-status styling hook and as input to formatApprovalStatus below. */
function statusLabel(
  request: AccessRequestPayload,
  response: AccessResponsePayload | null,
): string {
  if (response !== null) return response.status;
  return request.status;
}

/* Local time, matching cards/format.ts's formatWhen (the convention every
   other feed card uses for its timestamp) — not UTC. A user reading this
   card also reads the feed around it; a second clock, hours off from the
   first, would be exactly the kind of thing this feature exists to stop. */
function formatDecisionTime(at: string): string | null {
  const parsed = new Date(at);
  if (Number.isNaN(parsed.getTime())) return null;
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/* A resolved approval previously read "approved", which does not say what was
   allowed or when. Denials deliberately omit the scope: "denied once" reads
   as though something was permitted — only approvals name their scope. */
export function formatApprovalStatus(
  status: string,
  scope: string | null,
  at: string | null,
): string {
  if (status !== NO_LOOSE_STRING_VALUES.approved) return status;
  const time = at === null ? null : formatDecisionTime(at);
  const parts = [NO_LOOSE_STRING_VALUES.allowed, scope, time].filter(
    (part): part is string => part !== null && part !== "",
  );
  return parts.join(" · ");
}

function normalizeAccessError(err: unknown): {
  error: StructuredError;
  staleClosed: boolean;
} {
  if (err instanceof ManagedAgentsApiError) {
    const lower = (err.backendError ?? err.body).toLowerCase();
    if (err.status === 409 && lower.includes("not open")) {
      return {
        staleClosed: true,
        error: {
          title: "Request already closed",
          message: "This approval is no longer pending. Refreshing the run state should show the latest decision.",
          details: {
            method: err.method,
            path: err.path,
            status: err.status,
            body: err.body,
          },
        },
      };
    }
    if (err.status === 404) {
      return {
        staleClosed: true,
        error: {
          title: "Request not found",
          message: "The approval may belong to another session or was removed by the runtime.",
          details: {
            method: err.method,
            path: err.path,
            status: err.status,
            body: err.body,
          },
        },
      };
    }
    return {
      staleClosed: false,
      error: {
        title: "Decision could not be sent",
        message: err.backendError ?? `F-Mark kernel returned HTTP ${err.status}.`,
        details: {
          method: err.method,
          path: err.path,
          status: err.status,
          body: err.body,
        },
      },
    };
  }
  return {
    staleClosed: false,
    error: {
      title: "Decision could not be sent",
      message: err instanceof Error ? err.message : String(err),
    },
  };
}

function requestSuggestions(
  request: AccessRequestPayload,
): AccessRequestSuggestion[] {
  return (request.suggestions ?? []).filter(
    (suggestion): suggestion is AccessRequestSuggestion =>
      suggestion !== null &&
      typeof suggestion === "object" &&
      typeof suggestion.id === "string" &&
      typeof suggestion.label === "string" &&
      (suggestion.decision === NO_LOOSE_STRING_VALUES.approve || suggestion.decision === NO_LOOSE_STRING_VALUES.deny),
  );
}

interface WaitingElapsedProps {
  since: string;
}

/* Rendered only while the request is open (see accessRequestOpen), so the
   interval this mounts stops ticking the moment a decision lands — the card
   itself stays mounted in the append-only feed forever, but the timer must
   not. */
function WaitingElapsed({ since }: WaitingElapsedProps): JSX.Element {
  const elapsed = useElapsed(since);
  return <span className="approval-elapsed"> · waiting {elapsed}</span>;
}

interface AccessRequestCardProps {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  allEvents: AnyEventRecord[];
  compact?: boolean;
}

export function AccessRequestCard({
  event,
  participants,
  allEvents,
  compact = false,
}: AccessRequestCardProps): JSX.Element | null {
  if (event.kind !== NO_LOOSE_STRING_VALUES.accessRequest) return null;
  const request = event.payload as AccessRequestPayload;
  const token = useStore((s) => s.token);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const currentUserId = useStore((s) => s.currentUserId);
  const scope = useCurrentSessionRootScope(currentSessionId);
  const api = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<StructuredError | null>(null);
  const [staleClosed, setStaleClosed] = useState(false);
  const response = latestAccessResponse(request.request_id, allEvents);
  const open = response === null && request.status === NO_LOOSE_STRING_VALUES.open && !staleClosed;
  const visibleStatus = staleClosed ? NO_LOOSE_STRING_VALUES.resolved : statusLabel(request, response);
  const approvalLabel = formatApprovalStatus(
    visibleStatus,
    response?.scope ?? null,
    response?.responded_at ?? null,
  );
  const actor = participants[event.participant_id]?.name ?? event.participant_id;
  const presentation = presentAccessRequest(request);
  const canRespond =
    open &&
    currentSessionId !== null &&
    currentUserId !== null &&
    scope !== null &&
    busy === null;

  async function respond(
    decision: "approve" | "deny",
    option?: AccessRequestSuggestion,
  ): Promise<void> {
    if (currentSessionId === null || currentUserId === null || scope === null) return;
    setBusy(decision);
    setError(null);
    try {
      await api.respondAccessRequest(event.participant_id, request.request_id, {
        session_id: currentSessionId,
        participant_id: currentUserId,
        decision,
        ...(option !== undefined ? { option_id: option.id } : {}),
        ...scopeToBody(scope),
      });
    } catch (err) {
      const normalized = normalizeAccessError(err);
      setError(normalized.error);
      if (normalized.staleClosed) setStaleClosed(true);
    } finally {
      setBusy(null);
    }
  }
  const suggestions = requestSuggestions(request);

  return (
    <section
      className={`approval${compact ? " compact" : ""}`}
      data-status={visibleStatus}
      data-event-kind="access-request"
      data-access-request-id={request.request_id}
    >
      <div className="approval-head">
        <span className="approval-ico">
          <ShieldAlert size={15} aria-hidden="true" />
        </span>
        <div>
          <div className="approval-title">{presentation.title}</div>
          <div className="approval-sub">
            {actor}
            {open ? <WaitingElapsed since={request.created_at} /> : null}
          </div>
        </div>
        <code className="approval-status">{approvalLabel}</code>
      </div>
      <div className="approval-body">
        {renderPresentationSections(presentation.sections)}
        {presentation.raw !== undefined ? renderRawDetails(presentation.raw) : null}
      </div>
      {error !== null ? <ErrorNotice error={error} /> : null}
      {open ? (
        <div className="approval-foot">
          <ApprovalActions
            suggestions={suggestions}
            disabled={!canRespond}
            busy={busy}
            variant={NO_LOOSE_STRING_VALUES.card}
            onRespond={(decision, option) => void respond(decision, option)}
          />
        </div>
      ) : null}
    </section>
  );
}
