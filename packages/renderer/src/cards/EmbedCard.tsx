const NO_LOOSE_STRING_VALUES = {
  standalone: "standalone",
  html: "html",
  embedded: "embedded",
  embedFrame: "embed-frame",
  preview: "preview",
  source: "source",
} as const;

/* EmbedCard — sandbox-iframes an html-event bundle. If the same id has
   been superseded multiple times we surface them as variant chips so a
   user can flip between versions inline. */

import { useMemo, useState, type JSX } from "react";
import {
  Code,
  Image as ImageIcon,
  Maximize2,
  MoreHorizontal,
  RotateCw,
} from "lucide-react";
import type {
  AnyEventRecord,
  HtmlManifest,
  Participant,
} from "@f-mark/shared";
import { useStore } from "../state/store.js";
import { copyToClipboard } from "../render/copy.js";
import { htmlBundleUrl } from "../render/htmlBundle.js";
import { HtmlPreviewFrame } from "../components/HtmlPreviewFrame.js";
import { useCurrentSessionRootScope } from "../hooks/useCurrentSessionRootScope.js";
import { whoOf } from "./format.js";
import { EventCardHeader } from "./EventCardHeader.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  allEvents: AnyEventRecord[];
  /** "embedded" drops the head + menu chrome so the html embed slots
   *  inside an anchor ProseCard via ProseInlineBlock. */
  variant?: "standalone" | "embedded";
}

export function EmbedCard({
  event,
  participants,
  allEvents,
  variant = NO_LOOSE_STRING_VALUES.standalone,
}: Props): JSX.Element {
  const payload = event.payload as HtmlManifest;
  const who = whoOf(event.participant_id, participants);
  const sessionId = useStore((s) => s.currentSessionId);
  const token = useStore((s) => s.token);
  const scope = useCurrentSessionRootScope(sessionId);
  const openHtmlPreview = useStore((s) => s.openHtmlPreview);
  const [reloadKey, setReloadKey] = useState(0);

  const variants = useMemo(
    () =>
      allEvents
        .filter(
          (e): e is AnyEventRecord =>
            e.kind === NO_LOOSE_STRING_VALUES.html &&
            (e.payload as HtmlManifest).id === payload.id,
        )
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [allEvents, payload.id],
  );

  const [active, setActive] = useState<string>(event.filename);
  const activeFilename =
    variants.find((v) => v.filename === active)?.filename ?? event.filename;

  const title =
    typeof payload.title === "string" && payload.title.length > 0
      ? payload.title
      : payload.id;
  const src = htmlBundleUrl(sessionId, activeFilename, token, scope);

  const isEmbedded = variant === NO_LOOSE_STRING_VALUES.embedded;
  return (
    <div
      className={isEmbedded ? "embed-card embed-card-embedded" : "embed-card"}
      data-event-kind="html"
    >
      {!isEmbedded && (
        <EventCardHeader
          className="embed-head"
          who={who}
          timestamp={event.timestamp}
        >
          <span className="embed-chip">
            <ImageIcon size={10} aria-hidden /> EMBED
          </span>
          <button
            type="button"
            className="menu"
            aria-label="Copy embed link"
            title="Copy embed link"
            onClick={() => {
              if (src.length > 0) {
                const absolute =
                  typeof window !== "undefined"
                    ? new URL(src, window.location.origin).toString()
                    : src;
                void copyToClipboard(absolute);
              }
            }}
          >
            <MoreHorizontal size={14} aria-hidden />
          </button>
        </EventCardHeader>
      )}
      <div className="embed-title">{title}</div>
      {variants.length > 1 && (
        <div className="variants">
          <span className="lbl">Compare:</span>
          {variants.map((v, i) => {
            const isActive = v.filename === activeFilename;
            return (
              <button
                key={v.filename}
                type="button"
                className={["variant", isActive ? "active" : ""].join(" ").trim()}
                onClick={() => setActive(v.filename)}
              >
                V{i + 1}
              </button>
            );
          })}
        </div>
      )}
      <HtmlPreviewFrame
        sessionId={sessionId}
        filename={activeFilename}
        title={title}
        frameClassName={NO_LOOSE_STRING_VALUES.embedFrame}
        reloadKey={reloadKey}
      />
      <div className="embed-foot">
        <button
          type="button"
          disabled={src.length === 0}
          onClick={() => {
            if (sessionId !== null) {
              openHtmlPreview({
                sessionId,
                filename: activeFilename,
                title,
                mode: NO_LOOSE_STRING_VALUES.preview,
              });
            }
          }}
        >
          <Maximize2 size={11} aria-hidden /> Fullscreen
        </button>
        <button
          type="button"
          disabled={src.length === 0}
          onClick={() => setReloadKey((n) => n + 1)}
        >
          <RotateCw size={11} aria-hidden /> Reload
        </button>
        <button
          type="button"
          disabled={src.length === 0}
          onClick={() => {
            if (sessionId !== null) {
              openHtmlPreview({
                sessionId,
                filename: activeFilename,
                title,
                mode: NO_LOOSE_STRING_VALUES.source,
              });
            }
          }}
        >
          <Code size={11} aria-hidden /> View source
        </button>
      </div>
    </div>
  );
}
