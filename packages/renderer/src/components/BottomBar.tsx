import { Composer } from "./Composer.js";

export function BottomBar(): JSX.Element {
  return (
    <footer className="border-t border-neutral-200">
      <Composer />
    </footer>
  );
}
