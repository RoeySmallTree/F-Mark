import { useCallback, type KeyboardEvent } from "react";

/** Arrow-key roving for a composite widget. A role="tablist" or
    role="radiogroup" promises this keyboard pattern; declaring the role
    without it is the a11y equivalent of an unimplemented interface. */
export function useRovingTabIndex(
  count: number,
  activeIndex: number,
  onSelect: (index: number) => void,
): {
  tabIndexFor: (index: number) => 0 | -1;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
} {
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>): void => {
      const delta =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? -1
            : 0;
      if (delta === 0 || count === 0) return;
      event.preventDefault();
      onSelect((activeIndex + delta + count) % count);
    },
    [activeIndex, count, onSelect],
  );
  return { tabIndexFor: (index) => (index === activeIndex ? 0 : -1), onKeyDown };
}
