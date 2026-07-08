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

function propertyName(node) {
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal") return String(node.value);
  return undefined;
}

function stringValue(node, sourceCode) {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral") return sourceCode.getText(node);
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

function isInlineStyleObject(node) {
  return (
    node.parent?.type === "JSXExpressionContainer" &&
    node.parent.parent?.type === "JSXAttribute" &&
    node.parent.parent.name.type === "JSXIdentifier" &&
    node.parent.parent.name.name === "style"
  );
}

function isStyleVariableObject(node, sourceCode) {
  const parent = node.parent;
  if (parent?.type === "VariableDeclarator") {
    const name = sourceCode.getText(parent.id);
    const typeText = parent.id.typeAnnotation
      ? sourceCode.getText(parent.id.typeAnnotation)
      : "";
    return /style/i.test(name) || /\bCSSProperties\b/.test(typeText);
  }
  if (
    parent?.type === "ArrowFunctionExpression" &&
    parent.parent?.type === "VariableDeclarator"
  ) {
    const name = sourceCode.getText(parent.parent.id);
    const typeText = parent.parent.id.typeAnnotation
      ? sourceCode.getText(parent.parent.id.typeAnnotation)
      : "";
    return /style/i.test(name) || /\bCSSProperties\b/.test(typeText);
  }
  return false;
}

function hasAllowComment(node, sourceCode) {
  return sourceCode
    .getCommentsBefore(node)
    .some((comment) => comment.value.includes(ALLOW_COMMENT));
}

export const noRawStyleColors = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw color literals in React style objects; use theme tokens instead.",
    },
    messages: {
      rawColor:
        "Use a theme token for {{property}} instead of raw color {{value}}.",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      ObjectExpression(node) {
        if (!isInlineStyleObject(node) && !isStyleVariableObject(node, sourceCode)) return;
        for (const property of node.properties) {
          if (property.type !== "Property" || property.computed) continue;
          const name = propertyName(property.key);
          if (name === undefined || !GUARDED_STYLE_PROPS.has(name)) continue;
          const value = stringValue(property.value, sourceCode);
          if (value === undefined || !isRawColorValue(value)) continue;
          if (hasAllowComment(property, sourceCode)) continue;
          context.report({
            node: property.value,
            messageId: "rawColor",
            data: { property: name, value: JSON.stringify(value) },
          });
        }
      },
    };
  },
};

export default {
  rules: {
    "no-raw-style-colors": noRawStyleColors,
  },
};
