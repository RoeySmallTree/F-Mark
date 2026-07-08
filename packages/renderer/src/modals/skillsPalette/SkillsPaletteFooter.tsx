import { type JSX } from "react";

export function SkillsPaletteFooter(): JSX.Element {
  return (
    <div className="cmdk-foot">
      <span>
        <kbd>↑</kbd>
        <kbd>↓</kbd>
        navigate
      </span>
      <span>
        <kbd>↵</kbd>
        run
      </span>
      <span>
        <kbd>esc</kbd>
        close
      </span>
      <span style={{ marginLeft: "auto" }}>
        Skills are user-defined prompts that run on the agent’s next turn
      </span>
    </div>
  );
}
