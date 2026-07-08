import { expect } from "vitest";
import type { GuideResponse } from "./requests.js";

type ExpectedSnippet = RegExp | string;

export function expectStatus(
  res: Pick<GuideResponse, "statusCode">,
  statusCode: number,
): void {
  expect(res.statusCode).toBe(statusCode);
}

export function expectMarkdown(res: GuideResponse): void {
  expect(String(res.headers["content-type"] ?? "")).toMatch(/markdown/);
}

export function expectBodyContains(
  res: Pick<GuideResponse, "body">,
  ...snippets: ExpectedSnippet[]
): void {
  expectTextContains(res.body, snippets);
}

export function expectBodyExcludes(
  res: Pick<GuideResponse, "body">,
  ...snippets: ExpectedSnippet[]
): void {
  expectTextExcludes(res.body, snippets);
}

export function expectHookSectionContains(
  res: Pick<GuideResponse, "body">,
  ...snippets: ExpectedSnippet[]
): void {
  expectTextContains(hookSection(res.body), snippets);
}

export function expectHookSectionExcludes(
  res: Pick<GuideResponse, "body">,
  ...snippets: ExpectedSnippet[]
): void {
  expectTextExcludes(hookSection(res.body), snippets);
}

function expectTextContains(
  text: string,
  snippets: ExpectedSnippet[],
): void {
  for (const snippet of snippets) {
    if (typeof snippet === "string") {
      expect(text).toContain(snippet);
    } else {
      expect(text).toMatch(snippet);
    }
  }
}

function expectTextExcludes(text: string, snippets: ExpectedSnippet[]): void {
  for (const snippet of snippets) {
    if (typeof snippet === "string") {
      expect(text).not.toContain(snippet);
    } else {
      expect(text).not.toMatch(snippet);
    }
  }
}

function hookSection(body: string): string {
  const start = body.indexOf("### Hooks");
  if (start === -1) return "";
  const end = body.indexOf("## No session selected", start);
  return body.slice(start, end === -1 ? body.length : end);
}
