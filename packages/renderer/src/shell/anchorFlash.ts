const ANCHOR_FLASH_CLASS = "feed-anchor-flash";
const ANCHOR_FLASH_MS = 1200;

/** Scroll an element into view and flash it, so a jump the user asked for is
    visibly acknowledged at the destination. */
export function flashAnchor(el: HTMLElement): void {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add(ANCHOR_FLASH_CLASS);
  window.setTimeout(() => el.classList.remove(ANCHOR_FLASH_CLASS), ANCHOR_FLASH_MS);
}
