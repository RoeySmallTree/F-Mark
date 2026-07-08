import { render, type RenderResult } from "@testing-library/react";
import { Compose } from "../../src/compose/Compose.js";

export function renderCompose(): RenderResult {
  return render(<Compose />);
}
