import type { JSX } from "react";
import { ChevronDown } from "lucide-react";
import { RuntimeSelect } from "../RuntimeSelect.js";
import { avatarKind, AgentKindArt } from "../ParticipantAvatar.js";
import {
  runtimeProviderVisual,
} from "../../runtimes.js";
import type { RuntimeMenuItemModel } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  icon: "icon",
  agent: "agent",
} as const;

interface RuntimeMenuItemProps {
  item: RuntimeMenuItemModel;
  onAccessModeChange(mode: string): void;
  onModelChange(model: string): void;
  expanded: boolean;
  onEffortChange(effort: string): void;
  onToggleOptions(): void;
  onClick(): void;
}

export function RuntimeMenuItem({
  item,
  expanded,
  onAccessModeChange,
  onModelChange,
  onEffortChange,
  onToggleOptions,
  onClick,
}: RuntimeMenuItemProps): JSX.Element {
  const visual = runtimeProviderVisual(item.id, item.displayName);

  return (
    <div className={`plus-menu-runtime${expanded ? " is-expanded" : ""}`}>
      <div className="plus-menu-runtime-topline">
        <button
          type="button"
          role="menuitem"
          className="plus-menu-item"
          disabled={item.disabled}
          title={item.title}
          onClick={onClick}
        >
          <span
            className="plus-menu-icon"
            aria-hidden
            data-provider-mark={
              visual.type === NO_LOOSE_STRING_VALUES.icon ? visual.icon.kind : "initials"
            }
          >
            {visual.type === NO_LOOSE_STRING_VALUES.icon ? (
              <AgentKindArt
                kind={avatarKind({
                  kind: NO_LOOSE_STRING_VALUES.agent,
                  runtimeId: item.id,
                  name: item.displayName,
                })}
                className="plus-menu-icon-art"
              />
            ) : (
              <span data-provider-initials={visual.initials}>
                {visual.initials}
              </span>
            )}
          </span>
          <span className="plus-menu-label-wrap">
            <span className="plus-menu-label">{item.displayName}</span>
            <span className="plus-menu-sub">Spawn managed agent</span>
          </span>
          {item.hint !== null ? (
            <span className="plus-menu-hint">{item.hint}</span>
          ) : (
            <span className="plus-menu-hint plus-menu-hint-ready">Ready</span>
          )}
          <span className="plus-menu-launch-mark" aria-hidden>
            ↗
          </span>
        </button>
        <button
          type="button"
          className="plus-menu-options-toggle"
          aria-label={`${item.displayName} options`}
          aria-expanded={expanded}
          disabled={item.disabled}
          onClick={onToggleOptions}
        >
          <span>Options</span>
          <ChevronDown size={13} aria-hidden />
        </button>
      </div>
      {expanded ? (
        <div className="plus-menu-runtime-options">
          <RuntimeSelect
            kind="model"
            label="Model"
            value={item.model}
            options={item.modelOptions}
            disabled={item.disabled}
            ariaLabel={`${item.displayName} model`}
            className="plus-menu-runtime-select"
            selectClassName="plus-menu-access"
            onChange={onModelChange}
          />
          <RuntimeSelect
            kind="effort"
            label="Effort"
            value={item.effort}
            options={item.effortOptions}
            disabled={item.disabled}
            ariaLabel={`${item.displayName} effort`}
            className="plus-menu-runtime-select"
            selectClassName="plus-menu-access"
            onChange={onEffortChange}
          />
          {item.accessModeOptions.length > 1 ? (
            <label className="plus-menu-runtime-select">
              <span>Permission</span>
              <select
                className="plus-menu-access"
                aria-label={`${item.displayName} permission mode`}
                value={item.accessMode}
                disabled={item.disabled}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onAccessModeChange(event.currentTarget.value)}
              >
                {item.accessModeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                    {option.deprecated === true ? " (deprecated)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
