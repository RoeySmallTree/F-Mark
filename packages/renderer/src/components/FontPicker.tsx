import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { resolveFontTokens, resolveThemeTokens } from "@f-mark/shared";
import { useRovingTabIndex } from "../a11y/useRovingTabIndex.js";
import {
  getCurrentTheme,
  subscribeTheme,
  type ThemeName,
} from "../themes/index.js";
import {
  applyFont,
  FONT_PRESETS,
  getCurrentFont,
  subscribeFont,
  type FontName,
} from "../themes/fonts.js";

const FONT_PICKER_CUSTOM_PROPS = {
  cardSans: "--font-card-sans",
  cardSerif: "--font-card-serif",
  cardMono: "--font-card-mono",
} as const;

export function FontPicker(): JSX.Element {
  const [font, setFont] = useState<FontName>(() => getCurrentFont());
  const [theme, setTheme] = useState<ThemeName>(() => getCurrentTheme());

  useEffect(() => {
    const unsubFont = subscribeFont((n) => setFont(n));
    const unsubTheme = subscribeTheme((n) => setTheme(n));
    return () => {
      unsubFont();
      unsubTheme();
    };
  }, []);

  function pickFont(name: FontName): void {
    applyFont(name);
    setFont(name);
  }

  const active =
    FONT_PRESETS.find((preset) => preset.name === font) ?? FONT_PRESETS[0]!;
  const themeTokens = resolveThemeTokens(theme);

  const fontRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const fontIndex = FONT_PRESETS.findIndex((preset) => preset.name === font);
  const roving = useRovingTabIndex(
    FONT_PRESETS.length,
    fontIndex < 0 ? 0 : fontIndex,
    (index) => {
      const next = FONT_PRESETS[index];
      if (next === undefined) return;
      pickFont(next.name);
      fontRefs.current[index]?.focus();
    },
  );

  return (
    <div className="font-picker">
      <div className="font-picker-head">
        <div>
          <span className="font-picker-kicker">Typography</span>
          <strong>Font set</strong>
        </div>
        <span className="font-picker-current">{active.label}</span>
      </div>
      <div
        className="font-picker-grid"
        role="radiogroup"
        aria-label="Font style"
        onKeyDown={roving.onKeyDown}
      >
        {FONT_PRESETS.map((preset, index) => {
          const selected = preset.name === font;
          const tokens = resolveFontTokens(themeTokens, preset.name);
          const style = {
            [FONT_PICKER_CUSTOM_PROPS.cardSans]: tokens.sans,
            [FONT_PICKER_CUSTOM_PROPS.cardSerif]: tokens.serif,
            [FONT_PICKER_CUSTOM_PROPS.cardMono]: tokens.mono,
          } as CSSProperties;
          return (
            <button
              key={preset.name}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${preset.label}${selected ? " selected" : ""}`}
              className={`font-picker-card${selected ? " active" : ""}`}
              data-font={preset.name}
              style={style}
              tabIndex={roving.tabIndexFor(index)}
              ref={(el) => {
                fontRefs.current[index] = el;
              }}
              onClick={() => pickFont(preset.name)}
            >
              <span className="font-picker-sample" aria-hidden="true">
                <span className="font-picker-sample-main">Aa</span>
                <span className="font-picker-sample-code">fn()</span>
              </span>
              <span className="font-picker-card-copy">
                <span className="font-picker-card-name">{preset.label}</span>
                <span className="font-picker-card-desc">
                  {preset.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="font-picker-help">
        Theme default follows the selected color theme. Explicit font sets stay
        in place while you switch themes.
      </div>
    </div>
  );
}
