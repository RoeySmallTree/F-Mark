import { type JSX } from "react";
import { FolderClosed, Star } from "lucide-react";
import type { PathFavorite } from "../../api/client.js";
import { basename } from "./pathModel.js";

interface FavoritePathRowProps {
  active: boolean;
  disabled: boolean;
  favorite: PathFavorite;
  onSelect(path: string): void;
}

interface RecentPathRowProps {
  active: boolean;
  disabled: boolean;
  onSelect(path: string): void;
  path: string;
}

export function FavoritePathRow(props: FavoritePathRowProps): JSX.Element {
  return (
    <PathRow
      active={props.active}
      disabled={props.disabled}
      icon={<Star size={11} aria-hidden className="path-switcher-row-star" />}
      label={props.favorite.name}
      onSelect={() => props.onSelect(props.favorite.path)}
      path={props.favorite.path}
    />
  );
}

export function RecentPathRow(props: RecentPathRowProps): JSX.Element {
  return (
    <PathRow
      active={props.active}
      disabled={props.disabled}
      icon={
        <FolderClosed
          size={11}
          aria-hidden
          className="path-switcher-row-folder"
        />
      }
      label={basename(props.path)}
      onSelect={() => props.onSelect(props.path)}
      path={props.path}
    />
  );
}

function PathRow(props: {
  active: boolean;
  disabled: boolean;
  icon: JSX.Element;
  label: string;
  onSelect(): void;
  path: string;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`path-switcher-row${props.active ? " on" : ""}`}
      role="menuitem"
      disabled={props.disabled}
      onClick={props.onSelect}
      title={props.path}
    >
      {props.icon}
      <span className="path-switcher-row-name">{props.label}</span>
      <span className="path-switcher-row-path">{props.path}</span>
    </button>
  );
}
