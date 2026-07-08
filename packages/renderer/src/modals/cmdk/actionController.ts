import type { Participant } from "@f-mark/shared";
import {
  createClient,
  type PathFavorite,
  type SessionMeta,
} from "../../api/client.js";
import type { ModalKey } from "../../state/storeTypes.js";
import { applyFont, FONT_PRESETS, type FontName } from "../../themes/fonts.js";
import { applyTheme, THEMES, type ThemeName } from "../../themes/index.js";
import type { CmdkRow } from "./sources.js";

const NO_LOOSE_STRING_VALUES = {
  action: "action",
  session: "session",
  agent: "agent",
  named: "named",
  search: "search",
  newSession: "new-session",
  settings: "settings",
} as const;

/** Theme-action ids map directly to ThemeName values. Generated from THEMES so
 * newly registered themes are dispatchable without editing this map. */
const THEME_FROM_ACTION: Record<string, ThemeName> = Object.fromEntries(
  THEMES.map((t) => [`theme-${t.name}`, t.name]),
);

const FONT_FROM_ACTION: Record<string, FontName> = Object.fromEntries(
  FONT_PRESETS.map((f) => [`font-${f.name}`, f.name]),
);

interface CmdKActionControllerDeps {
  activePath: string | null;
  closeModal: () => void;
  openModal: (key: ModalKey) => void;
  setCurrentSession: (sessionId: string) => void;
  setParticipants: (participants: Record<string, Participant>) => void;
  setPathsState: (paths: {
    activePath: string | null;
    activePathId: string | null;
    activeRevision: number;
    knownPaths: string[];
    favorites: PathFavorite[];
  }) => void;
  setSessions: (sessions: SessionMeta[]) => void;
  token: string | null;
}

export function activateCmdKRow(
  row: CmdkRow,
  deps: CmdKActionControllerDeps,
): void {
  if (row.kind === NO_LOOSE_STRING_VALUES.action) {
    activateAction(row.actionId, deps);
    return;
  }
  if (row.kind === NO_LOOSE_STRING_VALUES.session) {
    void switchToSession(row.sessionId, row.path, deps);
    deps.closeModal();
    return;
  }
  if (row.kind === NO_LOOSE_STRING_VALUES.agent) {
    if (row.sessionId !== undefined) {
      void switchToSession(row.sessionId, row.path, deps);
    }
    deps.closeModal();
    return;
  }
  if (row.kind === NO_LOOSE_STRING_VALUES.named || row.kind === NO_LOOSE_STRING_VALUES.search) {
    deps.closeModal();
    void switchToSession(row.sessionId, row.path, deps)
      .then(() => scrollToFilename(row.filename))
      .catch(() => {});
  }
}

function activateAction(
  actionId: string,
  deps: CmdKActionControllerDeps,
): void {
  if (actionId === NO_LOOSE_STRING_VALUES.newSession) {
    deps.openModal(NO_LOOSE_STRING_VALUES.newSession);
    return;
  }
  if (actionId === NO_LOOSE_STRING_VALUES.settings) {
    deps.openModal(NO_LOOSE_STRING_VALUES.settings);
    return;
  }

  const themeName = THEME_FROM_ACTION[actionId];
  if (themeName !== undefined) {
    applyTheme(themeName);
    deps.closeModal();
    return;
  }

  const fontName = FONT_FROM_ACTION[actionId];
  if (fontName !== undefined) {
    applyFont(fontName);
  }
  deps.closeModal();
}

async function switchToSession(
  sessionId: string,
  path: string | undefined,
  deps: CmdKActionControllerDeps,
): Promise<void> {
  const client = createClient({ baseUrl: "", token: deps.token });
  if (path !== undefined && path !== deps.activePath) {
    const nextPaths = await client.setActivePath(path);
    deps.setPathsState(nextPaths);
    const [list, participants] = await Promise.all([
      client.listSessions(),
      client.listParticipants(),
    ]);
    deps.setSessions(list);
    deps.setParticipants(participants);
  }
  deps.setCurrentSession(sessionId);
}

function scrollToFilename(filename: string): void {
  let attempts = 0;
  const tryScroll = (): void => {
    const el = document.querySelector(`[data-event-filename="${filename}"]`);
    if (el !== null) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    attempts += 1;
    if (attempts < 12) {
      window.setTimeout(() => requestAnimationFrame(tryScroll), 50);
    }
  };
  requestAnimationFrame(tryScroll);
}
