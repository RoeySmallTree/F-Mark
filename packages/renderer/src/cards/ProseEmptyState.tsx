/* ProseEmptyState — placeholder shown inside a ProseCard when the anchor
   has no legacy content AND no appended blocks. Nudges the author toward
   the `append_to` API. Theme-token-only styling. */

import { type JSX } from "react";

export function ProseEmptyState(): JSX.Element {
  return (
    <div className="prose-empty-state">
      This document is empty. Append a block via the{" "}
      <code>append_to</code> API to start writing.
    </div>
  );
}
