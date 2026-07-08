import { describe } from "vitest";
import { registerBasicSessionRouteTests } from "./sessions/basicRoutes.js";
import { registerForkLinkSessionRouteTests } from "./sessions/forkLinkRoutes.js";
import { registerMultiPathSessionRouteTests } from "./sessions/multiPathRoutes.js";

describe("routes /sessions", () => {
  registerBasicSessionRouteTests();
  registerMultiPathSessionRouteTests();
  registerForkLinkSessionRouteTests();
});
