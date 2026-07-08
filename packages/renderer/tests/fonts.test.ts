import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  FONT_PRESETS,
  STORAGE_KEY,
  applyFont,
  getCurrentFont,
  subscribeFont,
  type FontName,
} from "../src/themes/fonts.js";

function clearFontClasses(): void {
  const toRemove: string[] = [];
  document.body.classList.forEach((cls) => {
    if (cls.startsWith("font-preset-")) toRemove.push(cls);
  });
  for (const cls of toRemove) document.body.classList.remove(cls);
}

function bodyFontClasses(): string[] {
  const out: string[] = [];
  document.body.classList.forEach((cls) => {
    if (cls.startsWith("font-preset-")) out.push(cls);
  });
  return out;
}

describe("font presets", () => {
  beforeEach(() => {
    localStorage.clear();
    clearFontClasses();
  });

  afterEach(() => {
    localStorage.clear();
    clearFontClasses();
  });

  test("FONT_PRESETS exposes the expected options in order", () => {
    expect(FONT_PRESETS.map((f) => f.name)).toEqual([
      "theme",
      "studio",
      "editorial",
      "terminal",
      "system",
      "geist",
      "plus-jakarta",
      "space-grotesk",
      "manrope",
      "sora",
      "outfit",
      "work-sans",
      "ibm-plex-sans",
      "instrument-sans",
      "bricolage",
      "fraunces",
      "lora",
      "cormorant",
      "libre-baskerville",
      "merriweather",
      "ibm-plex-serif",
      "fira-code",
      "ibm-plex-mono",
      "source-code-pro",
      "space-mono",
    ]);
    for (const font of FONT_PRESETS) {
      expect(font.label.length).toBeGreaterThan(0);
      expect(font.description.length).toBeGreaterThan(0);
    }
  });

  test("default font follows the theme when no localStorage entry exists", () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getCurrentFont()).toBe("theme");
    expect(bodyFontClasses()).toEqual([]);
  });

  test("getCurrentFont returns theme for unknown stored value", () => {
    localStorage.setItem(STORAGE_KEY, "not-a-real-font");
    expect(getCurrentFont()).toBe("theme");
  });

  test("applyFont adds an override class and writes localStorage", () => {
    applyFont("editorial");
    expect(bodyFontClasses()).toEqual(["font-preset-editorial"]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("editorial");
  });

  test("applyFont('theme') clears override classes", () => {
    applyFont("terminal");
    expect(bodyFontClasses()).toEqual(["font-preset-terminal"]);
    applyFont("theme");
    expect(bodyFontClasses()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("theme");
  });

  test("subscribeFont callback fires on apply and unsubscribe stops it", () => {
    const cb = vi.fn();
    const unsubscribe = subscribeFont(cb);
    applyFont("system");
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith("system");
    unsubscribe();
    applyFont("studio");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test("every font name survives a round-trip through applyFont + getCurrentFont", () => {
    for (const { name } of FONT_PRESETS) {
      applyFont(name);
      expect(getCurrentFont()).toBe<FontName>(name);
      if (name === "theme") {
        expect(bodyFontClasses()).toEqual([]);
      } else {
        expect(bodyFontClasses()).toEqual([`font-preset-${name}`]);
      }
    }
  });
});
