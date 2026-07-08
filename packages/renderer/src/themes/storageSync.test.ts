import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  applyTheme,
  getCurrentTheme,
  startThemeStorageSync,
  subscribeTheme,
  STORAGE_KEY as THEME_KEY,
} from "./index.js";
import {
  applyDensity,
  getCurrentDensity,
  startDensityStorageSync,
  subscribeDensity,
  STORAGE_KEY as DENSITY_KEY,
} from "./density.js";
import {
  applyPlacement,
  getCurrentPlacement,
  startPlacementStorageSync,
  subscribePlacement,
  placementKey,
  DEFAULT_PLACEMENT,
  STORAGE_KEY as LAYOUT_KEY,
  type ShellPlacement,
} from "./layout.js";

/* Simulate a write made in ANOTHER tab: jsdom does NOT fire `storage` on a
   same-window setItem, so we set localStorage to the new value (as the other
   tab would) and then dispatch the StorageEvent the browser would deliver to
   THIS tab. */
function crossTabWrite(key: string, value: string): void {
  window.localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
}

describe("X6 cross-tab appearance sync (storage events)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.className = "";
    // Reset to a known baseline.
    applyTheme("light");
    applyDensity("comfortable");
    applyPlacement(DEFAULT_PLACEMENT);
  });

  afterEach(() => {
    window.localStorage.clear();
    document.body.className = "";
  });

  it("theme: a storage event re-applies the body class + notifies subscribers", () => {
    const start = startThemeStorageSync();
    let notified: string | null = null;
    const unsub = subscribeTheme((n) => {
      notified = n;
    });

    crossTabWrite(THEME_KEY, "dracula");

    expect(document.body.classList.contains("theme-dracula")).toBe(true);
    expect(getCurrentTheme()).toBe("dracula");
    expect(notified).toBe("dracula");

    // Switching back to light removes all theme-* classes.
    crossTabWrite(THEME_KEY, "light");
    expect(
      Array.from(document.body.classList).some((c) => c.startsWith("theme-")),
    ).toBe(false);

    unsub();
    start();
  });

  it("theme: an UNRELATED storage key is ignored", () => {
    const start = startThemeStorageSync();
    applyTheme("nord");
    expect(document.body.classList.contains("theme-nord")).toBe(true);
    // A write to a different key must not touch the theme.
    window.dispatchEvent(
      new StorageEvent("storage", { key: "fmark.unrelated", newValue: "x" }),
    );
    expect(document.body.classList.contains("theme-nord")).toBe(true);
    start();
  });

  it("density: a storage event re-applies the density-* class + notifies", () => {
    const start = startDensityStorageSync();
    let notified: string | null = null;
    const unsub = subscribeDensity((n) => {
      notified = n;
    });

    crossTabWrite(DENSITY_KEY, "compact");

    expect(document.body.classList.contains("density-compact")).toBe(true);
    expect(getCurrentDensity()).toBe("compact");
    expect(notified).toBe("compact");
    unsub();
    start();
  });

  it("layout: a storage event re-injects the grid rule + notifies subscribers", () => {
    const start = startPlacementStorageSync();
    let notified: ShellPlacement | null = null;
    const unsub = subscribePlacement((p) => {
      notified = p;
    });

    const next: ShellPlacement = {
      kind: "rows",
      slots: ["chat", "leftPanel", "rightPanel"],
    };
    crossTabWrite(LAYOUT_KEY, JSON.stringify(next));

    expect(placementKey(getCurrentPlacement())).toBe(placementKey(next));
    expect(notified).not.toBeNull();
    expect(placementKey(notified!)).toBe(placementKey(next));

    // The generated <style> reflects the new placement key.
    const style = document.getElementById("fmark-shell-layout");
    expect(style?.textContent ?? "").toContain(placementKey(next));
    unsub();
    start();
  });

  it("layout: a malformed stored value falls back to default (no throw)", () => {
    const start = startPlacementStorageSync();
    expect(() => crossTabWrite(LAYOUT_KEY, "{not json")).not.toThrow();
    expect(placementKey(getCurrentPlacement())).toBe(
      placementKey(DEFAULT_PLACEMENT),
    );
    start();
  });
});
