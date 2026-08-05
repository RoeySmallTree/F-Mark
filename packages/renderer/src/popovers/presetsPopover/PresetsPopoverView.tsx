import { type JSX } from "react";
import { Plus, Search, Zap } from "lucide-react";
import type { Preset } from "@f-mark/shared";
import { chordToLabel } from "../../modals/settings/shortcut-registry.js";
import { Popover } from "../Popover.js";
import { PresetItem } from "../PresetItem.js";
import { UNCATEGORIZED_KEY } from "./model.js";
import type {
  PresetSection,
  PresetsPopoverController,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  presets: "Presets",
  uncategorized: "Uncategorized",
  custom: "custom",
} as const;

interface PresetsPopoverViewProps {
  anchorRect: DOMRect | null;
  onClose(): void;
  controller: PresetsPopoverController;
  closing?: boolean;
}

const PRESETS_SHORTCUT = chordToLabel("$mod+P");

export function PresetsPopoverView({
  anchorRect,
  onClose,
  controller,
  closing,
}: PresetsPopoverViewProps): JSX.Element {
  return (
    <Popover
      anchorRect={anchorRect}
      placement="top-end"
      onClose={onClose}
      closing={closing}
      className="presets-pop"
      ariaLabel={NO_LOOSE_STRING_VALUES.presets}
    >
      <PresetsHeader
        shortcutLabel={PRESETS_SHORTCUT}
        onAddPreset={controller.onAddPreset}
      />
      <PresetsSearch
        query={controller.query}
        onQueryChange={controller.onQueryChange}
      />
      <PresetsList controller={controller} />
      <PresetsFooter />
    </Popover>
  );
}

function PresetsHeader({
  shortcutLabel,
  onAddPreset,
}: {
  shortcutLabel: string;
  onAddPreset(): void;
}): JSX.Element {
  return (
    <div className="pop-head">
      <Zap size={14} aria-hidden style={{ color: "var(--ink-2)" }} />
      Presets
      <button
        type="button"
        className="pop-head-add"
        onClick={onAddPreset}
        aria-label="Create new preset"
        title="Create new preset"
      >
        <Plus size={13} aria-hidden />
      </button>
      <span
        style={{
          marginLeft: 6,
          fontFamily: "var(--mono)",
          fontSize: 10.5,
          color: "var(--ink-4)",
        }}
      >
        {shortcutLabel}
      </span>
    </div>
  );
}

function PresetsSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange(query: string): void;
}): JSX.Element {
  return (
    <div className="presets-search">
      <Search size={12} aria-hidden style={{ color: "var(--ink-4)" }} />
      <input
        autoFocus
        type="text"
        placeholder="Search presets…"
        aria-label="Search presets"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
    </div>
  );
}

function PresetsList({
  controller,
}: {
  controller: PresetsPopoverController;
}): JSX.Element {
  return (
    <div className="presets-list" data-testid="presets-list">
      <PresetsListContent controller={controller} />
    </div>
  );
}

function PresetsListContent({
  controller,
}: {
  controller: PresetsPopoverController;
}): JSX.Element {
  if (controller.loading) {
    return <div className="presets-empty">Loading…</div>;
  }
  if (controller.error !== null) {
    return (
      <div
        className="presets-empty"
        role="alert"
        style={{ color: "var(--rose)" }}
      >
        Couldn’t load presets: {controller.error}
      </div>
    );
  }
  if (!controller.hasResults) {
    return <EmptyResults query={controller.query} />;
  }
  return (
    <>
      <PresetSections
        sections={controller.grouped}
        onPick={controller.onPick}
        onEditPreset={controller.onEditPreset}
      />
      <ProjectSection
        presets={controller.filteredProject}
        onPick={controller.onPick}
      />
    </>
  );
}

function EmptyResults({ query }: { query: string }): JSX.Element {
  return (
    <div className="presets-empty">
      {query.length > 0
        ? "No presets match that search."
        : "No presets available."}
    </div>
  );
}

function PresetSections({
  sections,
  onPick,
  onEditPreset,
}: {
  sections: ReadonlyArray<PresetSection>;
  onPick(preset: Preset): void;
  onEditPreset(preset: Preset): void;
}): JSX.Element {
  return (
    <>
      {sections.map((section) => (
        <PresetSectionView
          key={section.category?.id ?? UNCATEGORIZED_KEY}
          section={section}
          onPick={onPick}
          onEditPreset={onEditPreset}
        />
      ))}
    </>
  );
}

function PresetSectionView({
  section,
  onPick,
  onEditPreset,
}: {
  section: PresetSection;
  onPick(preset: Preset): void;
  onEditPreset(preset: Preset): void;
}): JSX.Element {
  const key = section.category?.id ?? UNCATEGORIZED_KEY;
  const label = section.category?.name ?? NO_LOOSE_STRING_VALUES.uncategorized;
  return (
    <div data-testid={`presets-group-${key}`}>
      <div className="presets-group">{label}</div>
      {section.presets.map((preset) => (
        <PresetItem
          key={preset.path}
          preset={preset}
          onPick={onPick}
          onEdit={preset.source === NO_LOOSE_STRING_VALUES.custom ? onEditPreset : undefined}
        />
      ))}
    </div>
  );
}

function ProjectSection({
  presets,
  onPick,
}: {
  presets: ReadonlyArray<Preset>;
  onPick(preset: Preset): void;
}): JSX.Element | null {
  if (presets.length === 0) return null;
  return (
    <div data-testid="presets-group-project">
      <div className="presets-group">Project</div>
      {presets.map((preset) => (
        <PresetItem key={preset.path} preset={preset} onPick={onPick} />
      ))}
    </div>
  );
}

function PresetsFooter(): JSX.Element {
  return (
    <div
      className="pop-foot"
      style={{
        justifyContent: "space-between",
        fontFamily: "var(--mono)",
        fontSize: 10.5,
        color: "var(--ink-4)",
      }}
    >
      <span>Pre-fills compose — edit before sending</span>
      <span aria-hidden style={{ opacity: 0.7 }}>
        esc to close
      </span>
    </div>
  );
}
