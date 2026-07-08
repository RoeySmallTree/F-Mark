// packages/kernel/tests/tmux/manager.test.ts
import { describe } from "vitest";
import {
  registerTmuxInputTests,
  registerTmuxMetadataTests,
  registerTmuxParsingTests,
  registerTmuxPipePaneTests,
  registerTmuxSessionTests,
  registerTmuxSpawnTests,
} from "./manager/suites.js";

describe("TmuxManager", () => {
  registerTmuxParsingTests();
  registerTmuxSpawnTests();
  registerTmuxSessionTests();
  registerTmuxPipePaneTests();
  registerTmuxInputTests();
  registerTmuxMetadataTests();
});
