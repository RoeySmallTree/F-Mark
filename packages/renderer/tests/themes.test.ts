import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  STORAGE_KEY,
  THEMES,
  applyTheme,
  getCurrentTheme,
  subscribeTheme,
  type ThemeName,
} from "../src/themes/index.js";

function clearThemeClasses(): void {
  const toRemove: string[] = [];
  document.body.classList.forEach((cls) => {
    if (cls.startsWith("theme-")) toRemove.push(cls);
  });
  for (const cls of toRemove) document.body.classList.remove(cls);
}

function bodyThemeClasses(): string[] {
  const out: string[] = [];
  document.body.classList.forEach((cls) => {
    if (cls.startsWith("theme-")) out.push(cls);
  });
  return out;
}

describe("themes", () => {
  beforeEach(() => {
    localStorage.clear();
    clearThemeClasses();
  });

  afterEach(() => {
    localStorage.clear();
    clearThemeClasses();
  });

  test("THEMES exposes all 6 entries in the expected order", () => {
    expect(THEMES.map((t) => t.name)).toEqual([
      "light",
      "terminal",
      "ide",
      "solarized",
      "brutalist",
      "cyber",
    ]);
    for (const theme of THEMES) {
      expect(theme.label.length).toBeGreaterThan(0);
      expect(theme.description.length).toBeGreaterThan(0);
    }
  });

  test("default theme is 'light' when no localStorage entry exists", () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getCurrentTheme()).toBe("light");
    expect(bodyThemeClasses()).toEqual([]);
  });

  test("getCurrentTheme returns 'light' for unknown stored value", () => {
    localStorage.setItem(STORAGE_KEY, "not-a-real-theme");
    expect(getCurrentTheme()).toBe("light");
  });

  test("getCurrentTheme returns the stored theme", () => {
    localStorage.setItem(STORAGE_KEY, "terminal");
    expect(getCurrentTheme()).toBe("terminal");
  });

  test("applyTheme('cyber') adds theme-cyber class and writes localStorage", () => {
    applyTheme("cyber");
    expect(bodyThemeClasses()).toEqual(["theme-cyber"]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("cyber");
  });

  test("applyTheme removes any prior theme-* class before adding the new one", () => {
    applyTheme("terminal");
    expect(bodyThemeClasses()).toEqual(["theme-terminal"]);
    applyTheme("brutalist");
    expect(bodyThemeClasses()).toEqual(["theme-brutalist"]);
    applyTheme("ide");
    expect(bodyThemeClasses()).toEqual(["theme-ide"]);
  });

  test("applyTheme('light') clears all theme-* classes (no class added)", () => {
    applyTheme("cyber");
    expect(bodyThemeClasses()).toEqual(["theme-cyber"]);
    applyTheme("light");
    expect(bodyThemeClasses()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  test("applyTheme strips stray pre-existing theme-* classes too", () => {
    document.body.classList.add("theme-foo");
    document.body.classList.add("theme-bar");
    document.body.classList.add("not-a-theme-class");
    applyTheme("solarized");
    expect(bodyThemeClasses()).toEqual(["theme-solarized"]);
    expect(document.body.classList.contains("not-a-theme-class")).toBe(true);
  });

  test("subscribeTheme callback fires on apply", () => {
    const cb = vi.fn();
    subscribeTheme(cb);
    applyTheme("terminal");
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith("terminal");
    applyTheme("cyber");
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith("cyber");
  });

  test("subscribeTheme unsubscribe stops further calls", () => {
    const cb = vi.fn();
    const unsubscribe = subscribeTheme(cb);
    applyTheme("ide");
    expect(cb).toHaveBeenCalledTimes(1);
    unsubscribe();
    applyTheme("brutalist");
    applyTheme("light");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test("multiple subscribers are independent", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeTheme(a);
    subscribeTheme(b);
    applyTheme("solarized");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unsubA();
    applyTheme("cyber");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenLastCalledWith("cyber");
  });

  test("every theme name in THEMES survives a round-trip through applyTheme + getCurrentTheme", () => {
    for (const { name } of THEMES) {
      applyTheme(name);
      expect(getCurrentTheme()).toBe<ThemeName>(name);
      if (name === "light") {
        expect(bodyThemeClasses()).toEqual([]);
      } else {
        expect(bodyThemeClasses()).toEqual([`theme-${name}`]);
      }
    }
  });
});
