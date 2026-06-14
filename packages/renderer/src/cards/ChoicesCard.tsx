/* ChoicesCard — renders a question with selectable options. The "chosen"
   state comes from the latest matching `choice` event for the current user.
   Clicking an option POSTs a new `choice` event via the API client. */

import { type JSX } from "react";
import { HelpCircle, Maximize2, MoreHorizontal } from "lucide-react";
import type {
  AnyEventRecord,
  ChoicePayload,
  ChoicesPayload,
  Participant,
} from "@f-mark/shared";
import { createClient } from "../api/client.js";
import { useStore } from "../state/store.js";
import { copyToClipboard } from "../render/copy.js";
import { HtmlPreviewFrame } from "../components/HtmlPreviewFrame.js";
import { formatWhen, whoOf } from "./format.js";
import { ParticipantAvatar } from "../components/ParticipantAvatar.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  allEvents: AnyEventRecord[];
  /** "embedded" drops the head + menu chrome. */
  variant?: "standalone" | "embedded";
}

export function ChoicesCard({
  event,
  participants,
  allEvents,
  variant = "standalone",
}: Props): JSX.Element {
  const payload = event.payload as ChoicesPayload;
  const who = whoOf(event.participant_id, participants);
  const token = useStore((s) => s.token);
  const sessionId = useStore((s) => s.currentSessionId);
  const userId = useStore((s) => s.currentUserId);
  const openHtmlPreview = useStore((s) => s.openHtmlPreview);

  // Visual alternatives: any option carrying an html bundle ref renders the
  // whole widget as a preview grid instead of a vertical text-button list.
  const hasHtml = payload.options.some(
    (o) => typeof o.html === "string" && o.html.length > 0,
  );

  // Find the most recent choice event by the current user for this choices_id.
  const myChoices = allEvents
    .filter(
      (e) =>
        e.kind === "choice" &&
        (e.payload as ChoicePayload).choices_id === payload.id &&
        (userId === null || e.participant_id === userId),
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latest = myChoices[myChoices.length - 1];
  const selectedIds = (latest?.payload as ChoicePayload | undefined)?.selected ?? [];

  async function pick(optionId: string): Promise<void> {
    if (sessionId === null || userId === null) return;
    const client = createClient({ baseUrl: "", token });
    const nextSelected = payload.multi
      ? selectedIds.includes(optionId)
        ? selectedIds.filter((x) => x !== optionId)
        : [...selectedIds, optionId]
      : [optionId];
    await client.postChoice(sessionId, {
      participant_id: userId,
      choices_id: payload.id,
      selected: nextSelected,
    });
  }

  const isEmbedded = variant === "embedded";
  return (
    <div
      className={
        isEmbedded ? "choices-card choices-card-embedded" : "choices-card"
      }
      data-event-kind="choices"
    >
      {!isEmbedded && (
        <div className="choices-head">
          <ParticipantAvatar
            participantId={who.id}
            kind={who.isUser ? "user" : "agent"}
            name={who.name}
            color={who.color}
            runtimeId={who.runtimeId}
            size="sm"
          />
          <span className="who">{who.name}</span>
          <span className="when">{formatWhen(event.timestamp)}</span>
          <span className="badge">
            <HelpCircle size={10} aria-hidden /> CHOOSE
          </span>
          <button
            type="button"
            className="menu"
            aria-label="Copy question"
            title="Copy question"
            onClick={() => void copyToClipboard(payload.question)}
          >
            <MoreHorizontal size={14} aria-hidden />
          </button>
        </div>
      )}
      <div className="choices-body">
        <h3 className="choices-q">{payload.question}</h3>
        {hasHtml ? (
          <div className="choices-options-grid">
            {payload.options.map((opt) => {
              const chosen = selectedIds.includes(opt.id);
              const faded = selectedIds.length > 0 && !chosen;
              const html =
                typeof opt.html === "string" && opt.html.length > 0
                  ? opt.html
                  : null;
              return (
                <div
                  key={opt.id}
                  className={[
                    "choice-preview-card",
                    chosen ? "chosen" : "",
                    faded ? "faded" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <button
                    type="button"
                    className="choice-preview-select"
                    aria-pressed={chosen}
                    onClick={() => void pick(opt.id)}
                  >
                    <span className="choice-radio" aria-hidden />
                    <span className="lbl">
                      {opt.label}
                      {chosen ? <span className="check">Chose</span> : null}
                    </span>
                  </button>
                  {html !== null ? (
                    <>
                      <HtmlPreviewFrame
                        sessionId={sessionId}
                        filename={html}
                        title={opt.label}
                        frameClassName="choice-preview-frame"
                      />
                      <div className="choice-preview-foot">
                        <button
                          type="button"
                          onClick={() => {
                            if (sessionId !== null) {
                              openHtmlPreview({
                                sessionId,
                                filename: html,
                                title: opt.label,
                                mode: "preview",
                              });
                            }
                          }}
                        >
                          <Maximize2 size={11} aria-hidden /> Fullscreen
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="choice-preview-frame">
                      <div className="placeholder">
                        <div className="label">text option</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          payload.options.map((opt) => {
            const chosen = selectedIds.includes(opt.id);
            const faded = selectedIds.length > 0 && !chosen;
            const classes = [
              "choice-opt",
              chosen ? "chosen" : "",
              faded ? "faded" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={opt.id}
                type="button"
                className={classes}
                aria-pressed={chosen}
                onClick={() => void pick(opt.id)}
              >
                <span className="choice-radio" aria-hidden />
                <span style={{ flex: 1 }}>
                  <span className="lbl">
                    {opt.label}
                    {chosen ? <span className="check">Chose</span> : null}
                  </span>
                </span>
              </button>
            );
          })
        )}
        {latest !== undefined && (
          <div className="choices-foot">
            Answered {formatWhen(latest.timestamp)}
          </div>
        )}
      </div>
    </div>
  );
}
