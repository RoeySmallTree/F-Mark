import type { Rule } from "eslint";

export const noRawStyleColors: Rule.RuleModule;

declare const plugin: {
  rules: {
    "no-raw-style-colors": Rule.RuleModule;
  };
};

export default plugin;
