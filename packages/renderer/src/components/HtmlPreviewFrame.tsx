/* HtmlPreviewFrame — sandboxed iframe for an html-event bundle, reused by the
   standalone EmbedCard and by visual choice-option previews. Sandbox stays
   `allow-scripts` only: the bundle is served same-origin, so adding
   `allow-same-origin` would let it reach app state. The frame box (size,
   border) is owned by the caller via `frameClassName`. */

import { type JSX } from "react";
import { Image as ImageIcon } from "lucide-react";
import { useStore } from "../state/store.js";
import { htmlBundleUrl } from "../render/htmlBundle.js";

interface Props {
  sessionId: string | null;
  /** Bare html bundle filename (the choices option's `html` ref). */
  filename: string;
  title: string;
  /** CSS class for the framing box (e.g. "embed-frame", "choice-preview-frame"). */
  frameClassName: string;
  /** Bump to force the iframe to reload without writing any event. */
  reloadKey?: number;
}

export function HtmlPreviewFrame({
  sessionId,
  filename,
  title,
  frameClassName,
  reloadKey,
}: Props): JSX.Element {
  const token = useStore((s) => s.token);
  const src = htmlBundleUrl(
    sessionId,
    filename,
    token,
    reloadKey !== undefined && reloadKey > 0
      ? { reload: String(reloadKey) }
      : undefined,
  );
  return (
    <div className={frameClassName}>
      {src.length > 0 ? (
        <iframe
          title={title}
          src={src}
          sandbox="allow-scripts"
          loading="lazy"
        />
      ) : (
        <div className="placeholder">
          <ImageIcon size={20} aria-hidden />
          <div className="label">no preview</div>
        </div>
      )}
    </div>
  );
}
