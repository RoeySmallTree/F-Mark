import type { OpenFileTab } from "./fileViewerPersistence.js";

export interface FileViewerTabState {
  currentSessionId: string | null;
  fileViewerTabsBySession: Record<string, OpenFileTab[]>;
  fileViewerActiveBySession: Record<string, string>;
}

export interface FileViewerTabPatch {
  fileViewerTabsBySession?: Record<string, OpenFileTab[]>;
  fileViewerActiveBySession?: Record<string, string>;
}

export interface FileViewerTabMutation {
  patch: FileViewerTabPatch;
  persistTabs?: Record<string, OpenFileTab[]>;
  persistActive?: Record<string, string>;
}

export class FileViewerTabsController {
  constructor(private readonly state: FileViewerTabState) {}

  open(absPath: string): FileViewerTabMutation | null {
    const sid = this.state.currentSessionId;
    if (sid === null) return null;
    const existing = this.state.fileViewerTabsBySession[sid] ?? [];
    const has = existing.some((tab) => tab.path === absPath);
    const nextTabs = has
      ? existing
      : [...existing, { path: absPath, pinned: false }];
    const fileViewerTabsBySession = has
      ? this.state.fileViewerTabsBySession
      : { ...this.state.fileViewerTabsBySession, [sid]: nextTabs };
    const fileViewerActiveBySession = {
      ...this.state.fileViewerActiveBySession,
      [sid]: absPath,
    };
    return {
      patch: {
        fileViewerTabsBySession,
        fileViewerActiveBySession,
      },
      persistTabs: has ? undefined : fileViewerTabsBySession,
      persistActive: fileViewerActiveBySession,
    };
  }

  close(absPath: string): FileViewerTabMutation | null {
    const sid = this.state.currentSessionId;
    if (sid === null) return null;
    const tabs = this.state.fileViewerTabsBySession[sid] ?? [];
    const idx = tabs.findIndex((tab) => tab.path === absPath);
    if (idx < 0) return null;
    const nextTabs = tabs.filter((tab) => tab.path !== absPath);
    const fileViewerTabsBySession = {
      ...this.state.fileViewerTabsBySession,
      [sid]: nextTabs,
    };
    const fileViewerActiveBySession =
      this.state.fileViewerActiveBySession[sid] === absPath
        ? nextActiveAfterClose(this.state.fileViewerActiveBySession, sid, nextTabs, idx)
        : this.state.fileViewerActiveBySession;
    return {
      patch: {
        fileViewerTabsBySession,
        fileViewerActiveBySession,
      },
      persistTabs: fileViewerTabsBySession,
      persistActive: fileViewerActiveBySession,
    };
  }

  activate(absPath: string | null): FileViewerTabMutation | null {
    const sid = this.state.currentSessionId;
    if (sid === null) return null;
    const fileViewerActiveBySession = { ...this.state.fileViewerActiveBySession };
    if (absPath === null) delete fileViewerActiveBySession[sid];
    else fileViewerActiveBySession[sid] = absPath;
    return {
      patch: { fileViewerActiveBySession },
      persistActive: fileViewerActiveBySession,
    };
  }

  togglePin(absPath: string): FileViewerTabMutation | null {
    const sid = this.state.currentSessionId;
    if (sid === null) return null;
    const tabs = this.state.fileViewerTabsBySession[sid] ?? [];
    if (!tabs.some((tab) => tab.path === absPath)) return null;
    const nextTabs = tabs.map((tab) =>
      tab.path === absPath ? { ...tab, pinned: !tab.pinned } : tab,
    );
    const fileViewerTabsBySession = {
      ...this.state.fileViewerTabsBySession,
      [sid]: nextTabs,
    };
    return {
      patch: { fileViewerTabsBySession },
      persistTabs: fileViewerTabsBySession,
    };
  }

  reorder(fromPath: string, toPath: string): FileViewerTabMutation | null {
    const sid = this.state.currentSessionId;
    if (sid === null || fromPath === toPath) return null;
    const tabs = this.state.fileViewerTabsBySession[sid] ?? [];
    const from = tabs.findIndex((tab) => tab.path === fromPath);
    const to = tabs.findIndex((tab) => tab.path === toPath);
    if (from < 0 || to < 0) return null;
    if (tabs[from]!.pinned !== tabs[to]!.pinned) return null;
    const nextTabs = [...tabs];
    const [moved] = nextTabs.splice(from, 1);
    nextTabs.splice(to, 0, moved!);
    const fileViewerTabsBySession = {
      ...this.state.fileViewerTabsBySession,
      [sid]: nextTabs,
    };
    return {
      patch: { fileViewerTabsBySession },
      persistTabs: fileViewerTabsBySession,
    };
  }
}

function nextActiveAfterClose(
  current: Record<string, string>,
  sid: string,
  tabs: OpenFileTab[],
  closedIndex: number,
): Record<string, string> {
  const fallback = tabs[closedIndex - 1]?.path ?? tabs[0]?.path ?? null;
  const next = { ...current };
  if (fallback === null) delete next[sid];
  else next[sid] = fallback;
  return next;
}
