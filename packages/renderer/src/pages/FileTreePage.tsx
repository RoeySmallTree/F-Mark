import type { JSX } from "react";
import { FileScopeProvider } from "../panels/fileViewer/fileScope.js";
import { useFileCommentReveal } from "../panels/fileViewer/lineComment/useFileCommentReveal.js";
import { useGitDiffSettingsSync } from "../hooks/useGitDiffSettingsSync.js";
import { useFileTreeBroadcast } from "../hooks/useFileTreeBroadcast.js";
import { FileTreePageBody } from "./fileTreePage/FileTreePageBody.js";
import { FileTreePageHeader } from "./fileTreePage/FileTreePageHeader.js";
import { useFileTreePageController } from "./fileTreePage/useFileTreePageController.js";

const NO_LOOSE_STRING_VALUES = {
  error: "error",
  loading: "loading",
} as const;

export { resolveSession } from "./fileTreePage/session.js";

/* NOTE on localStorage isolation (X6 / P3): the standalone namespace — folding
   in the launch path_id so equal session ids across roots don't collide — is
   set in main.tsx BEFORE this module (and the shared store it imports) is
   dynamically loaded. That handles the INITIAL reads. When the session
   dropdown later switches to a session under a DIFFERENT path_id,
   switchToSession() re-points the namespace and re-hydrates the
   namespace-backed store slices (see rehydrateNamespacedSlices) so each root
   stays isolated even after the store was already evaluated. */

export function FileTreePage(): JSX.Element {
  const controller = useFileTreePageController();

  /* Always-mounted reveal bridge: here the FileViewer is
     always mounted in the 3-column body, so the reveal just opens the file +
     forces non-diff mode; there is no modal/collapse to re-surface). The bridge
     reads the seeded active path scope, which equals this tab's file scope. */
  useFileCommentReveal();

  /* X6 cross-tab base-ref sync — re-fetch git/diff settings when another tab
     saves an override (this tab's scope is the seeded selected root). */
  useGitDiffSettingsSync();

  /* X6 standalone tab-state sync — keep sibling /file-tree tabs on the SAME
     (path_id, sessionId) coherent (active file + diff mode) via
     BroadcastChannel. Never switches the main app's active project/session. */
  useFileTreeBroadcast();

  if (controller.status.kind === NO_LOOSE_STRING_VALUES.error) {
    return (
      <div className="file-tree-page file-tree-page-error">
        <h1>Cannot open file tree</h1>
        <p>{controller.status.message}</p>
      </div>
    );
  }
  if (controller.status.kind === NO_LOOSE_STRING_VALUES.loading) {
    return (
      <div className="file-tree-page file-tree-page-loading">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <FileScopeProvider value={controller.fileScope}>
      <div className="file-tree-page">
        <FileTreePageHeader
          allSessions={controller.allSessions}
          currentSessionId={controller.currentSessionId}
          activePath={controller.activePath}
          activePathId={controller.activePathId}
          dropdownOpen={controller.dropdownOpen}
          dropdownRef={controller.dropdownRef}
          promoteBusy={controller.promoteBusy}
          promoteError={controller.promoteError}
          onToggleDropdown={controller.toggleDropdown}
          onSwitchToSession={controller.switchToSession}
          onMakeActiveProject={controller.makeActiveProject}
        />
        <FileTreePageBody />
      </div>
    </FileScopeProvider>
  );
}
