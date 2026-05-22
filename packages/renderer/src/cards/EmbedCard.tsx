/* EmbedCard — sandbox-iframes an html-event bundle. If the same id has
   been superseded multiple times we surface them as variant chips so a
   user can flip between versions inline. */

import { useMemo, useState, type JSX } from "react";
import { Image as ImageIcon, MoreHorizontal } from "lucide-react";
import type {
  AnyEventRecord,
  HtmlManifest,
  Participant,
} from "@f-mark/shared";
import { useStore } from "../state/store.js";
import { formatWhen, whoOf } from "./format.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  allEvents: AnyEventRecord[];
}

export function EmbedCard({ event, participants, allEvents }: Props): JSX.Element {
  const payload = event.payload as HtmlManifest;
  const who = whoOf(event.participant_id, participants);
  const sessionId = useStore((s) => s.currentSessionId);
  const token = useStore((s) => s.token);

  const variants = useMemo(
    () =>
      allEvents
        .filter(
          (e): e is AnyEventRecord =>
            e.kind === "html" &&
            (e.payload as HtmlManifest).id === payload.id,
        )
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [allEvents, payload.id],
  );

  const [active, setActive] = useState<string>(event.filename);
  const activeFilename =
    variants.find((v) => v.filename === active)?.filename ?? event.filename;

  const src =
    sessionId !== null
      ? `/sessions/${sessionId}/raw/${activeFilename}/index.html${
          token !== null && token.length > 0
            ? `?token=${encodeURIComponent(token)}`
            : ""
        }`
      : "";

  return (
    <div className="embed-card" data-event-kind="html">
      <div className="embed-head">
        <span
          className={["avatar", who.isUser ? "user" : "agent", "sm"].join(" ")}
          aria-hidden
        >
          {who.initial}
        </span>
        <span className="who">{who.name}</span>
        <span className="when">{formatWhen(event.timestamp)}</span>
        <span className="badge">
          <ImageIcon size={10} aria-hidden /> EMBED
        </span>
        <button type="button" className="menu" aria-label="More options">
          <MoreHorizontal size={14} aria-hidden />
        </button>
      </div>
      <div className="embed-title">
        {typeof payload.title === "string" && payload.title.length > 0
          ? payload.title
          : payload.id}
      </div>
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
      <div className="embed-frame">
        {src.length > 0 ? (
          <iframe
            title={
              typeof payload.title === "string" && payload.title.length > 0
                ? payload.title
                : payload.id
            }
            src={src}
            sandbox="allow-scripts"
          />
        ) : (
          <div className="placeholder">
            <ImageIcon size={20} aria-hidden />
            <div className="label">no preview</div>
          </div>
        )}
      </div>
    </div>
  );
}
