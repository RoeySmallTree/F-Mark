import type { CSSProperties } from "react";
import type { ProviderStatus } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  ready: "ready",
} as const;

const providerLogoSize = 36;

export const providerLogoStyle: CSSProperties = {
  width: providerLogoSize,
  height: providerLogoSize,
  borderRadius: providerLogoSize * 0.28,
  flexShrink: 0,
  boxSizing: "border-box",
  padding: providerLogoSize * 0.14,
  background: "var(--panel)",
  color: "var(--agent)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--mono)",
  fontSize: 0,
  fontWeight: 600,
  border: "1px solid var(--line)",
  overflow: "hidden",
  position: "relative",
};

export const cardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 14,
  padding: "14px 16px 12px",
};

export const cardTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 3,
};

export const providerNameStyle: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 14,
  fontWeight: 600,
  color: "var(--ink)",
};

export const providerVendorStyle: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 10.5,
  color: "var(--ink-4)",
};

export const providerDescStyle: CSSProperties = {
  fontFamily: "var(--serif)",
  fontSize: 13,
  color: "var(--ink-3)",
  fontStyle: "italic",
  lineHeight: 1.45,
};

export const cardControlsStyle: CSSProperties = {
  borderTop: "1px dashed var(--line-2)",
  background: "var(--bg)",
  padding: "9px 16px 9px 66px",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

export const connectButtonStyle: CSSProperties = {
  fontFamily: "var(--sans)",
  fontSize: 13,
  fontWeight: 500,
  flexShrink: 0,
  padding: "7px 16px",
  borderRadius: 6,
  marginTop: 2,
  background: "var(--ink)",
  color: "var(--canvas)",
  border: "1px solid var(--ink)",
};

const configureButtonBaseStyle: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 11.5,
  fontWeight: 500,
  padding: "4px 12px",
  borderRadius: 5,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
};

const readyConfigureStyle: CSSProperties = {
  background: "transparent",
  color: "var(--ink-2)",
  border: "1px solid var(--line)",
};

const missingConfigureStyle: CSSProperties = {
  background: "var(--ink)",
  color: "var(--canvas)",
  border: "0",
};

const readyStatusColors = {
  bg: "var(--green-tint)",
  fg: "var(--green)",
  bd: "var(--green)",
};

const missingStatusColors = {
  bg: "var(--bg)",
  fg: "var(--ink-4)",
  bd: "var(--line)",
};

export const statusPillBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontFamily: "var(--mono)",
  fontSize: 10.5,
  letterSpacing: ".02em",
  whiteSpace: "nowrap",
  padding: "2px 8px 2px 7px",
  borderRadius: 999,
};

export const readyStatusDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--green)",
  boxShadow: "0 0 0 3px rgba(61,122,79,.15)",
};

export const missingStatusDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  border: "1.5px solid var(--ink-4)",
};

export function cardStyle({
  disabled,
  isReady,
}: {
  disabled: boolean;
  isReady: boolean;
}): CSSProperties {
  return {
    background: "var(--canvas)",
    border: isReady ? "1px solid var(--green)" : "1px solid var(--line-2)",
    borderRadius: 10,
    boxShadow: "var(--shadow)",
    overflow: "hidden",
    opacity: disabled ? 0.6 : 1,
  };
}

export function clickableCursor(disabled: boolean): CSSProperties {
  return { cursor: disabled ? "not-allowed" : "pointer" };
}

export function configureButtonStyle({
  disabled,
  isReady,
}: {
  disabled: boolean;
  isReady: boolean;
}): CSSProperties {
  return {
    ...configureButtonBaseStyle,
    ...(isReady ? readyConfigureStyle : missingConfigureStyle),
    ...clickableCursor(disabled),
  };
}

export function statusPillColors(kind: ProviderStatus): {
  bg: string;
  fg: string;
  bd: string;
} {
  return kind === NO_LOOSE_STRING_VALUES.ready ? readyStatusColors : missingStatusColors;
}
