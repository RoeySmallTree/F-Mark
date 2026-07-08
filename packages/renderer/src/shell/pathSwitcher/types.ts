import type { RefObject } from "react";
import type { PathFavorite } from "../../api/client.js";

export interface PathSwitcherController {
  activePath: string | null;
  busy: boolean;
  error: string | null;
  favorites: PathFavorite[];
  open: boolean;
  recents: string[];
  rootRef: RefObject<HTMLDivElement>;
  switchTo(path: string): void;
  toggleOpen(): void;
}
