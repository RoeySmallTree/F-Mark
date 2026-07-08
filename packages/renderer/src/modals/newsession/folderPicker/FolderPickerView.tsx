import { type JSX } from "react";
import { ChevronRight, FolderClosed, Star, X } from "lucide-react";
import { joinAt } from "./model.js";
import type { FolderPickerController } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  ready: "ready",
  saving: "Saving…",
  save: "Save",
  loading: "loading",
  error: "error",
} as const;

interface FolderPickerViewProps {
  controller: FolderPickerController;
}

export function FolderPickerView({
  controller,
}: FolderPickerViewProps): JSX.Element {
  return (
    <div
      className="folder-picker"
      role="dialog"
      aria-label="Pick a folder"
      tabIndex={0}
      onKeyDown={controller.onKeyDown}
    >
      <FavoritesBar controller={controller} />
      {controller.savePromptOpen ? (
        <SaveFavoritePrompt controller={controller} />
      ) : null}
      <Breadcrumbs controller={controller} />
      <DirectoryList controller={controller} />
      <FolderPickerFooter controller={controller} />
    </div>
  );
}

function FavoritesBar({
  controller,
}: FolderPickerViewProps): JSX.Element {
  return (
    <div className="folder-picker-favorites" aria-label="Favorites">
      {controller.favorites.map((favorite) => (
        <span key={favorite.path} className="folder-picker-fav-chip">
          <button
            type="button"
            className="folder-picker-fav-jump"
            onClick={() => void controller.load(favorite.path)}
            title={favorite.path}
          >
            <Star size={10} aria-hidden />
            {favorite.name}
          </button>
          <button
            type="button"
            className="folder-picker-fav-remove"
            onClick={() => void controller.removeFavorite(favorite.path)}
            aria-label={`Remove favorite ${favorite.name}`}
            title="Remove from favorites"
          >
            <X size={10} aria-hidden />
          </button>
        </span>
      ))}
      {!controller.currentIsFavorited && controller.state.status === NO_LOOSE_STRING_VALUES.ready ? (
        <button
          type="button"
          className="folder-picker-fav-add"
          onClick={controller.openSavePrompt}
        >
          + Save current as favorite
        </button>
      ) : null}
    </div>
  );
}

function SaveFavoritePrompt({
  controller,
}: FolderPickerViewProps): JSX.Element {
  return (
    <div
      className="folder-picker-fav-prompt"
      role="dialog"
      aria-label="Save favorite"
    >
      <input
        className="form-input"
        placeholder="Name this folder (e.g. F-Mark dev)"
        value={controller.favName}
        autoFocus
        aria-label="Favorite name"
        onChange={(event) => controller.setFavName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            void controller.saveCurrentAsFavorite(controller.favName);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            controller.closeSavePrompt();
          }
        }}
      />
      <button
        type="button"
        className="btn-solid"
        disabled={
          controller.savingFav || controller.favName.trim().length === 0
        }
        onClick={() => void controller.saveCurrentAsFavorite(controller.favName)}
      >
        {controller.savingFav ? NO_LOOSE_STRING_VALUES.saving : NO_LOOSE_STRING_VALUES.save}
      </button>
      <button
        type="button"
        className="btn-ghost"
        onClick={controller.closeSavePrompt}
      >
        Cancel
      </button>
      {controller.favError !== null ? (
        <div className="form-error" role="alert">
          {controller.favError}
        </div>
      ) : null}
    </div>
  );
}

function Breadcrumbs({ controller }: FolderPickerViewProps): JSX.Element {
  return (
    <div className="folder-picker-breadcrumbs" aria-label="Breadcrumbs">
      <button
        type="button"
        className="crumb"
        onClick={() => void controller.load("/")}
      >
        /
      </button>
      {controller.crumbs.map((segment, index) => (
        <span key={`${segment}-${index}`} className="crumb-row">
          <ChevronRight size={12} className="crumb-sep" aria-hidden />
          <button
            type="button"
            className="crumb"
            onClick={() => void controller.load(joinAt(controller.crumbs, index))}
          >
            {segment}
          </button>
        </span>
      ))}
    </div>
  );
}

function DirectoryList({
  controller,
}: FolderPickerViewProps): JSX.Element {
  const { focusedIdx, state } = controller;

  return (
    <div
      className="folder-picker-list"
      ref={controller.listRef}
      role="listbox"
      aria-label="Subdirectories"
    >
      {state.status === NO_LOOSE_STRING_VALUES.loading ? (
        <div className="folder-picker-status">Loading…</div>
      ) : null}
      {state.status === NO_LOOSE_STRING_VALUES.error ? (
        <div
          className="folder-picker-status folder-picker-error"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}
      {state.status === NO_LOOSE_STRING_VALUES.ready && state.entries.length === 0 ? (
        <div className="folder-picker-status folder-picker-empty">
          No subdirectories.
        </div>
      ) : null}
      {state.status === NO_LOOSE_STRING_VALUES.ready
        ? state.entries.map((entry, index) => (
            <button
              key={entry.name}
              type="button"
              role="option"
              aria-selected={index === focusedIdx}
              data-row-idx={index}
              className={`folder-picker-row${
                index === focusedIdx ? " on" : ""
              }`}
              onClick={() => controller.openEntry(index, entry.name)}
            >
              <FolderClosed size={14} aria-hidden className="folder-icon" />
              <span>{entry.name}</span>
            </button>
          ))
        : null}
      {state.truncated ? (
        <div className="folder-picker-status">… listing truncated.</div>
      ) : null}
    </div>
  );
}

function FolderPickerFooter({
  controller,
}: FolderPickerViewProps): JSX.Element {
  return (
    <div className="folder-picker-foot">
      <div className="folder-picker-current" title={controller.state.path}>
        {controller.state.path || "—"}
      </div>
      {!controller.hideActions ? (
        <div className="folder-picker-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={controller.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-solid"
            disabled={controller.state.status !== NO_LOOSE_STRING_VALUES.ready}
            onClick={controller.onPickCurrent}
          >
            Use this folder
          </button>
        </div>
      ) : null}
    </div>
  );
}
