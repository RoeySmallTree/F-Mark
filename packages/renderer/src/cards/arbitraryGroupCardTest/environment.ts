import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll } from "vitest";

export function installArbitraryGroupCardTestEnvironment() {
  afterEach(cleanup);

  beforeAll(() => {
    if (typeof Range !== "undefined" && Range.prototype.getClientRects === undefined) {
      Range.prototype.getClientRects = function getClientRects() {
        return [] as unknown as DOMRectList;
      };
    }
  });
}
