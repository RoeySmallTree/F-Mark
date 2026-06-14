#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const ALLOW_COMMENT = "fmark-allow-color-literal";

const GUARDED_STYLE_PROPS = new Set([
  "accentColor",
  "background",
  "backgroundColor",
  "border",
  "borderBlock",
  "borderBlockColor",
  "borderBlockEnd",
  "borderBlockEndColor",
  "borderBlockStart",
  "borderBlockStartColor",
  "borderBottom",
  "borderBottomColor",
  "borderColor",
  "borderInline",
  "borderInlineColor",
  "borderInlineEnd",
  "borderInlineEndColor",
  "borderInlineStart",
  "borderInlineStartColor",
  "borderLeft",
  "borderLeftColor",
  "borderRight",
  "borderRightColor",
  "borderTop",
  "borderTopColor",
  "caretColor",
  "color",
  "columnRule",
  "columnRuleColor",
  "fill",
  "outline",
  "outlineColor",
  "stroke",
  "textDecorationColor",
]);

const RAW_COLOR_RE =
  /(^|[\s,(])(?:#[0-9a-f]{3,8}\b|rgba?\s*\(|hsla?\s*\(|(?:near-)?black\b|white\b|oklch\s*\(|lch\s*\()/i;

function parseArgs(argv) {
  const args = [...argv];
  let root = process.cwd();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--root") {
      const value = args[i + 1];
      if (value === undefined) {
        throw new Error("--root requires a path");
      }
      root = path.resolve(value);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      return { root, help: true };
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { root, help: false };
}

function printHelp() {
  console.log(`Usage: node scripts/check-component-color-literals.mjs [--root path]

Scans React component source for raw color strings in style objects.
Use CSS variables/theme tokens such as var(--ink), or add ${ALLOW_COMMENT}
on the same or previous line for narrowly intentional exceptions.`);
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "coverage"
      ) {
        continue;
      }
      yield* walk(fullPath);
    } else {
      yield fullPath;
    }
  }
}

function isComponentSource(filePath) {
  if (!/\.[jt]sx$/.test(filePath)) return false;
  if (/(^|[./_-])(test|spec)\.[jt]sx$/.test(filePath)) return false;
  if (filePath.includes(`${path.sep}__fixtures__${path.sep}`)) return false;
  return true;
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function stringValueText(expr, sourceFile) {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text;
  }
  if (ts.isTemplateExpression(expr)) {
    return expr.getText(sourceFile);
  }
  return undefined;
}

function isAllowedTokenizedValue(value) {
  const trimmed = value.trim();
  if (trimmed.includes("var(--")) return true;
  return /^(currentColor|inherit|initial|none|transparent|unset)$/i.test(trimmed);
}

function isRawColorValue(value) {
  if (isAllowedTokenizedValue(value)) return false;
  return RAW_COLOR_RE.test(value);
}

function hasAllowComment(lines, lineIndex) {
  for (let index = lineIndex; index >= Math.max(0, lineIndex - 1); index -= 1) {
    if (lines[index]?.includes(ALLOW_COMMENT) === true) return true;
  }
  return false;
}

function unwrapExpressionParent(node) {
  let current = node;
  let parent = current.parent;
  while (
    parent !== undefined &&
    (ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isTypeAssertionExpression(parent) ||
      ts.isSatisfiesExpression(parent))
  ) {
    current = parent;
    parent = current.parent;
  }
  return { current, parent };
}

function isInlineStyleAttribute(parent) {
  return (
    parent !== undefined &&
    ts.isJsxExpression(parent) &&
    parent.parent !== undefined &&
    ts.isJsxAttribute(parent.parent) &&
    parent.parent.name.getText() === "style"
  );
}

function isStyleVariableDeclaration(parent, sourceFile) {
  if (parent === undefined || !ts.isVariableDeclaration(parent)) return false;
  const name = ts.isIdentifier(parent.name) ? parent.name.text : "";
  const typeText = parent.type?.getText(sourceFile) ?? "";
  return /style/i.test(name) || /\bCSSProperties\b/.test(typeText);
}

function isStyleObjectLiteral(node, sourceFile) {
  const { current, parent } = unwrapExpressionParent(node);
  if (isInlineStyleAttribute(parent)) return true;
  if (isStyleVariableDeclaration(parent, sourceFile)) return true;
  if (
    parent !== undefined &&
    ts.isArrowFunction(parent) &&
    ts.isVariableDeclaration(parent.parent) &&
    isStyleVariableDeclaration(parent.parent, sourceFile)
  ) {
    return true;
  }
  return current !== node && isStyleObjectLiteral(current, sourceFile);
}

export function findComponentColorLiteralViolations(sourceText, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JSX,
  );
  const lines = sourceText.split(/\r?\n/);
  const violations = [];

  function visit(node) {
    if (ts.isObjectLiteralExpression(node) && isStyleObjectLiteral(node, sourceFile)) {
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const propName = propertyNameText(prop.name);
        if (propName === undefined || !GUARDED_STYLE_PROPS.has(propName)) continue;
        const value = stringValueText(prop.initializer, sourceFile);
        if (value === undefined || !isRawColorValue(value)) continue;
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(prop.getStart());
        if (hasAllowComment(lines, line)) continue;
        violations.push({
          filePath,
          line: line + 1,
          column: character + 1,
          property: propName,
          value,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

export async function findViolations(root) {
  const sourceRoot = existsSync(path.join(root, "src")) ? path.join(root, "src") : root;
  const violations = [];
  for await (const filePath of walk(sourceRoot)) {
    if (!isComponentSource(filePath)) continue;
    const sourceText = await readFile(filePath, "utf8");
    violations.push(...findComponentColorLiteralViolations(sourceText, filePath));
  }
  return violations;
}

function formatViolation(root, violation) {
  const relPath = path.relative(root, violation.filePath);
  return `${relPath}:${violation.line}:${violation.column} ${violation.property}: ${JSON.stringify(
    violation.value,
  )}`;
}

async function main() {
  const { root, help } = parseArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    return;
  }

  const violations = await findViolations(root);
  if (violations.length === 0) return;

  console.error("Found raw color literals in React component styles.");
  console.error("Use semantic theme tokens/CSS variables or a CSS class instead:");
  for (const violation of violations) {
    console.error(`  ${formatViolation(root, violation)}`);
  }
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
