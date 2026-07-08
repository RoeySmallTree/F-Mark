import { describe } from "vitest";
import {
  installArbitraryGroupCardTestEnvironment,
  registerArbitraryGroupCardAccordionTests,
  registerArbitraryGroupCardDisclosureTests,
  registerArbitraryGroupCardHeaderTests,
  registerArbitraryGroupCardTimingTests,
  registerArbitraryGroupCardVisibilityTests,
} from "./arbitraryGroupCardTest";

installArbitraryGroupCardTestEnvironment();

describe("<ArbitraryGroupCard>", () => {
  registerArbitraryGroupCardVisibilityTests();
  registerArbitraryGroupCardHeaderTests();
  registerArbitraryGroupCardTimingTests();
  registerArbitraryGroupCardDisclosureTests();
  registerArbitraryGroupCardAccordionTests();
});
