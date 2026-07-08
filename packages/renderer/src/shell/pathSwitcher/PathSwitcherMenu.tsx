import { type JSX } from "react";
import type { PathFavorite } from "../../api/client.js";
import {
  FavoritePathRow,
  RecentPathRow,
} from "./PathSwitcherRows.js";

interface PathSwitcherMenuProps {
  activePath: string | null;
  busy: boolean;
  error: string | null;
  favorites: PathFavorite[];
  onSelect(path: string): void;
  recents: string[];
}

export function PathSwitcherMenu(props: PathSwitcherMenuProps): JSX.Element {
  const hasPaths = props.favorites.length > 0 || props.recents.length > 0;

  return (
    <div className="path-switcher-menu" role="menu">
      {props.activePath !== null && <CurrentPath path={props.activePath} />}

      {props.favorites.length > 0 && (
        <>
          <PathGroupLabel label="FAVORITES" />
          {props.favorites.map((favorite) => (
            <FavoritePathRow
              key={favorite.path}
              favorite={favorite}
              active={favorite.path === props.activePath}
              disabled={props.busy}
              onSelect={props.onSelect}
            />
          ))}
        </>
      )}

      {props.recents.length > 0 && (
        <>
          <PathGroupLabel label="RECENTS" />
          {props.recents.map((path) => (
            <RecentPathRow
              key={path}
              path={path}
              active={path === props.activePath}
              disabled={props.busy}
              onSelect={props.onSelect}
            />
          ))}
        </>
      )}

      {!hasPaths && <EmptyPaths />}

      {props.error !== null && (
        <div className="path-switcher-error" role="alert">
          {props.error}
        </div>
      )}
    </div>
  );
}

function CurrentPath(props: { path: string }): JSX.Element {
  return (
    <div className="path-switcher-current" title={props.path}>
      <span className="path-switcher-current-label">CURRENT</span>
      <span className="path-switcher-current-path">{props.path}</span>
    </div>
  );
}

function PathGroupLabel(props: { label: string }): JSX.Element {
  return <div className="path-switcher-group">{props.label}</div>;
}

function EmptyPaths(): JSX.Element {
  return (
    <div className="path-switcher-empty">
      No other paths yet. Create a session in a different folder to start one.
    </div>
  );
}
