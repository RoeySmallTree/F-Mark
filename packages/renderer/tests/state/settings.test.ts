import { afterEach, describe, expect, test } from "vitest";
import {
  readChoiceEndsTurn,
  readCommentEndsTurn,
  readEnterToSend,
  readMessageEndsTurn,
} from "../../src/state/settings.js";

describe("compose setting defaults", () => {
  afterEach(() => {
    globalThis.localStorage?.clear();
  });

  test("all compose toggles default to true", () => {
    globalThis.localStorage?.clear();

    expect(readMessageEndsTurn()).toBe(true);
    expect(readCommentEndsTurn()).toBe(true);
    expect(readChoiceEndsTurn()).toBe(true);
    expect(readEnterToSend()).toBe(true);
  });
});
