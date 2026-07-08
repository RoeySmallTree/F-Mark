import type { JSX, ReactNode } from "react";
import {
  TAB_EMPTY_PRESETS,
  type TabEmptyVariant,
} from "./tabEmptyArt.js";
import { TabEmptyIcon } from "./TabEmptyIcon.js";
import "./tabEmpty.css";

const NO_LOOSE_STRING_VALUES = {
  tabEmpty: "tab-empty",
  tabEmptyFill: "tab-empty-fill",
  tabEmptyTitle: "tab-empty-title",
  tabEmptyHint: "tab-empty-hint",
  tabEmptyActions: "tab-empty-actions",
} as const;

export interface TabEmptyStateProps {
  variant: TabEmptyVariant;
  /** Override preset title when a pane needs dynamic copy. */
  title?: string;
  /** Override preset hint. */
  hint?: string;
  /** Stretch to fill the pane scroll area (tree panes, terminal). */
  fill?: boolean;
  className?: string;
  testId?: string;
  children?: ReactNode;
}

export function TabEmptyState({
  variant,
  title,
  hint,
  fill = false,
  className,
  testId,
  children,
}: TabEmptyStateProps): JSX.Element {
  const preset = TAB_EMPTY_PRESETS[variant];
  const resolvedTitle = title ?? preset.title;
  const resolvedHint = hint ?? preset.hint;
  const classes = [
    NO_LOOSE_STRING_VALUES.tabEmpty,
    fill ? NO_LOOSE_STRING_VALUES.tabEmptyFill : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} data-testid={testId} data-variant={variant}>
      <TabEmptyIcon variant={variant} animated={preset.animated === true} />
      <p className={NO_LOOSE_STRING_VALUES.tabEmptyTitle}>{resolvedTitle}</p>
      {resolvedHint.length > 0 ? (
        <p className={NO_LOOSE_STRING_VALUES.tabEmptyHint}>{resolvedHint}</p>
      ) : null}
      {children !== undefined ? (
        <div className={NO_LOOSE_STRING_VALUES.tabEmptyActions}>{children}</div>
      ) : null}
    </div>
  );
}
