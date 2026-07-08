import type { CSSProperties } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { TabEmptyState } from "../TabEmptyState.js";
import { PanelLoadingState } from "../PanelLoadingState.js";
import { ChangedAbsentFiles } from "./ChangedAbsentFiles.js";
import { FileTree } from "./FileTree.js";
import { FilesSearch } from "./FilesSearch.js";
import { FilesSearchChips } from "./FilesSearchChips.js";
import type { RightFilesController } from "./useRightFilesController.js";

const NO_LOOSE_STRING_VALUES = {
  filesNoPath: "files-no-path",
} as const;

export function RightFilesPane({
  controller,
}: {
  controller: RightFilesController;
}): JSX.Element {
  if (controller.selectedPath === null) {
    return <TabEmptyState variant={NO_LOOSE_STRING_VALUES.filesNoPath} fill />;
  }
  return (
    <div
      className="files-pane"
      style={
        { "--files-chrome-h": `${controller.chromeHeight}px` } as CSSProperties
      }
    >
      <FilesHeader controller={controller} />
      {controller.searchOpen ? (
        <FilesSearch
          search={controller.search}
          searchValid={controller.view.searchValid}
          autoFocus={controller.searchOpen}
        />
      ) : null}
      {controller.chipsVisible ? (
        <FilesSearchChips
          exts={controller.view.extsInMatches}
          selected={controller.search.exts}
        />
      ) : null}
      <FilesTreeContent controller={controller} />
    </div>
  );
}

function FilesHeader({
  controller,
}: {
  controller: RightFilesController;
}): JSX.Element {
  return (
    <div className="files-header">
      <button
        type="button"
        className={`files-header-btn ${controller.searchOpen ? "is-on" : ""}`}
        onClick={() => controller.setSearchOpen((v) => !v)}
        title={controller.searchOpen ? "Hide search" : "Search files"}
        aria-pressed={controller.searchOpen}
      >
        <SearchIcon size={13} aria-hidden />
      </button>
      {controller.filterActive ? (
        <button
          type="button"
          className="files-header-btn"
          onClick={controller.resetFilesSearch}
          title="Clear filter"
        >
          <X size={13} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function FilesTreeContent({
  controller,
}: {
  controller: RightFilesController;
}): JSX.Element {
  if (controller.loading && !controller.treeLoaded) {
    return <PanelLoadingState />;
  }
  return (
    <>
      {controller.view.truncated ? (
        <div className="files-truncated">
          tree truncated — refine search to narrow results
        </div>
      ) : null}
      <FileTree
        rows={controller.view.rows}
        onToggleFolder={controller.onToggleFolder}
        onCycleFav={controller.cycleFav}
      />
      <ChangedAbsentFiles />
    </>
  );
}
