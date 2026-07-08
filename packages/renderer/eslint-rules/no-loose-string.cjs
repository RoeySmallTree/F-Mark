'use strict';

const DEFAULT_CONSTANT_NAME_PATTERN = '^[A-Z][A-Z0-9_]*$';

const COMPARISON_OPERATORS = new Set([
  '==',
  '===',
  '!=',
  '!==',
  '<',
  '<=',
  '>',
  '>=',
]);

const WRAPPER_NODE_TYPES = new Set([
  'ChainExpression',
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

const JS_TYPEOF_VALUES = new Set([
  'bigint',
  'boolean',
  'function',
  'number',
  'object',
  'string',
  'symbol',
  'undefined',
]);

const ENVIRONMENT_VALUES = new Set([
  'development',
  'production',
  'test',
]);

const ENVIRONMENT_KEY_VALUES = new Set([
  'NODE_ENV',
]);

const BOOLEAN_STRING_VALUES = new Set([
  'false',
  'true',
]);

const HTTP_METHOD_VALUES = new Set([
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
]);

const BROWSER_TARGET_VALUES = new Set([
  '_blank',
  '_parent',
  '_self',
  '_top',
]);

const POINTER_TYPE_VALUES = new Set([
  'mouse',
  'pen',
  'touch',
]);

const KEYBOARD_KEY_VALUES = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'Backspace',
  'Enter',
  'Escape',
  'Tab',
]);

const ANIMATION_VALUES = new Set([
  'easeIn',
  'easeInOut',
  'easeOut',
  'spring',
  'tween',
]);

const HTTP_HEADER_NAMES = new Set([
  'Accept',
  'Authorization',
  'Content-Type',
  'Idempotency-Key',
  'Origin',
  'X-Request-Id',
]);

const LOOKUP_METHOD_NAMES = new Set([
  'append',
  'delete',
  'get',
  'getAll',
  'getItem',
  'has',
  'removeItem',
  'set',
  'setItem',
]);

const SELECTOR_ARGUMENT_CALL_NAMES = new Set([
  'closest',
  'createElement',
  'getElementById',
  'matches',
  'querySelector',
  'querySelectorAll',
]);

const EVENT_ARGUMENT_CALL_NAMES = new Set([
  'addEventListener',
  'removeEventListener',
  'useMotionValueEvent',
]);

const TEST_CALL_NAMES = new Set([
  'describe',
  'it',
  'test',
]);

const LOGGER_CALL_NAMES = new Set([
  'emit',
]);

const ERROR_CONSTRUCTOR_NAMES = new Set([
  'AggregateError',
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
]);

const KEY_ARGUMENT_CALL_NAMES = new Set([
  'addHook',
  'discriminatedUnion',
  'extractPayload',
  'field',
  'firstNumber',
  'firstString',
  'metaFrom',
  'stringFromInput',
  'titleFromFields',
  'toHaveProperty',
  'spyOn',
]);

const PATH_ARGUMENT_CALL_NAMES = new Set([
  'join',
  'resolve',
]);

const JSX_LITERAL_ATTRIBUTE_NAMES = new Set([
  'align',
  'alignItems',
  'alt',
  'ariaLabel',
  'body',
  'className',
  'cx',
  'cy',
  'debugSource',
  'description',
  'd',
  'display',
  'fillRule',
  'fill',
  'flexDirection',
  'fontSize',
  'fontWeight',
  'gap',
  'height',
  'href',
  'htmlFor',
  'id',
  'in',
  'initial',
  'justifyContent',
  'key',
  'kind',
  'label',
  'lang',
  'layout',
  'mode',
  'name',
  'padding',
  'placeholder',
  'animation',
  'objectFit',
  'preserveAspectRatio',
  'offset',
  'opacity',
  'patternTransform',
  'patternUnits',
  'r',
  'role',
  'rx',
  'ry',
  'selectClassName',
  'src',
  'stroke',
  'strokeDasharray',
  'strokeOpacity',
  'strokeLinecap',
  'strokeLinejoin',
  'strokeWidth',
  'tabIndex',
  'stopColor',
  'stopOpacity',
  'text',
  'textAnchor',
  'title',
  'type',
  'viewBox',
  'width',
  'x',
  'x1',
  'x2',
  'y',
  'y1',
  'y2',
]);

const CSS_PROPERTY_NAMES = new Set([
  'alignItems',
  'alignSelf',
  'background',
  'backgroundColor',
  'backgroundRepeat',
  'backdropFilter',
  'behavior',
  'block',
  'border',
  'borderRadius',
  'bottom',
  'boxShadow',
  'color',
  'contain',
  'cursor',
  'display',
  'ease',
  'filter',
  'flex',
  'flexBasis',
  'flexDirection',
  'flexGrow',
  'flexShrink',
  'flexWrap',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontVariantNumeric',
  'fontWeight',
  'gap',
  'height',
  'inset',
  'justifyContent',
  'left',
  'lineHeight',
  'margin',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginTop',
  'maskImage',
  'maskSize',
  'maskRepeat',
  'maxHeight',
  'maxWidth',
  'minHeight',
  'minWidth',
  'msOverflowStyle',
  'objectFit',
  'opacity',
  'outline',
  'overflow',
  'overflowWrap',
  'overflowX',
  'overflowY',
  'padding',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'pointerEvents',
  'position',
  'right',
  'scrollBehavior',
  'scrollbarWidth',
  'scrollSnapAlign',
  'scrollSnapStop',
  'textAlign',
  'textDecoration',
  'textDecorationStyle',
  'textOverflow',
  'textShadow',
  'textTransform',
  'textUnderlineOffset',
  'top',
  'transform',
  'transformOrigin',
  'transition',
  'verticalAlign',
  'WebkitAppearance',
  'WebkitBackdropFilter',
  'WebkitMaskImage',
  'WebkitMaskRepeat',
  'WebkitMaskSize',
  'WebkitOverflowScrolling',
  'whiteSpace',
  'width',
  'willChange',
  'wordBreak',
  'zIndex',
]);

const TEXT_PROPERTY_NAMES = new Set([
  'alt',
  'body',
  'description',
  'label',
  'placeholder',
  'sub',
  'subtitle',
  'text',
  'title',
]);

const CACHE_KEY_PROPERTY_NAMES = new Set([
  'queryKey',
]);

function isStringNode(node) {
  if (!node) {
    return false;
  }

  if (node.type === 'Literal') {
    return typeof node.value === 'string';
  }

  return node.type === 'TemplateLiteral' && node.expressions.length === 0;
}

function stringValueOf(node) {
  if (node.type === 'Literal') {
    return typeof node.value === 'string' ? node.value : null;
  }

  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis
      .map((quasi) => quasi.value.cooked ?? quasi.value.raw)
      .join('');
  }

  return null;
}

function getParent(node) {
  return node ? node.parent : null;
}

function unwrapExpression(node) {
  let current = node;

  while (WRAPPER_NODE_TYPES.has(current?.type)) {
    current = current.expression;
  }

  return current;
}

function isNodeWithin(child, parent) {
  let current = child;

  while (current) {
    if (current === parent) {
      return true;
    }

    current = getParent(current);
  }

  return false;
}

function isObjectPropertyKey(node, parent) {
  return (
    parent?.type === 'Property'
    && parent.key === node
    && parent.computed !== true
  );
}

function isImportOrExportSource(parent) {
  return [
    'ExportAllDeclaration',
    'ExportNamedDeclaration',
    'ImportDeclaration',
    'ImportExpression',
    'TSExternalModuleReference',
    'TSImportType',
  ].includes(parent?.type);
}

function isDirective(parent) {
  return parent?.type === 'ExpressionStatement' && typeof parent.directive === 'string';
}

function isEnumMemberInitializer(node, parent) {
  return parent?.type === 'TSEnumMember' && parent.initializer === node;
}

function isLiteralType(parent) {
  return parent?.type === 'TSLiteralType';
}

function isStaticTextOrPlatformValue(value) {
  if (
    value === ''
    || value.length === 1
    || value.includes('\n')
    || /\s/.test(value)
    || /^[^A-Za-z0-9]+$/.test(value)
  ) {
    return true;
  }

  if (
    JS_TYPEOF_VALUES.has(value)
    || ENVIRONMENT_VALUES.has(value)
    || ENVIRONMENT_KEY_VALUES.has(value)
    || BOOLEAN_STRING_VALUES.has(value)
    || HTTP_METHOD_VALUES.has(value)
    || HTTP_HEADER_NAMES.has(value)
    || BROWSER_TARGET_VALUES.has(value)
    || POINTER_TYPE_VALUES.has(value)
    || KEYBOARD_KEY_VALUES.has(value)
    || ANIMATION_VALUES.has(value)
  ) {
    return true;
  }

  if (
    value.startsWith('/')
    || value.startsWith('./')
    || value.startsWith('../')
    || /^\.[A-Za-z0-9_-]/.test(value)
    || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    || /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) {
    return true;
  }

  if (/^[\w.+-]+\/[\w.+-]+(?:;[\w=.+-]+)*$/.test(value) || /^[\w.+-]+\/$/.test(value)) {
    return true;
  }

  if (/^utf-?8$/i.test(value) || /^(base64|hex|latin1|ascii|binary)$/i.test(value)) {
    return true;
  }

  if (/^-?\d+(\.\d+)?(px|rem|em|%|vh|vw|vmin|vmax|s|ms|deg)$/i.test(value)) {
    return true;
  }

  if (/^var\(--[A-Za-z0-9_-]+\)$/.test(value)) {
    return true;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return true;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    return true;
  }

  if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(value)) {
    return true;
  }

  if (/^\$\d+$/.test(value)) {
    return true;
  }

  if (/^(?:active|animate|bg|border|bottom|disabled|duration|ease|flex|focus|font|gap|grid|group-hover|h|hover|inset|items|justify|leading|left|m|mark|marker|max-h|max-w|min-h|min-w|mx|my|object|opacity|overflow|p|px|py|ring|rotate|rounded|right|scale|shadow|space|text|top|tracking|transition|translate|w|z)-/.test(value)) {
    return true;
  }

  return false;
}

function nodeContainsStringNode(node, stringNode) {
  return node && isNodeWithin(stringNode, node);
}

function isTypeofComparisonString(node, parent) {
  if (parent?.type !== 'BinaryExpression' || !COMPARISON_OPERATORS.has(parent.operator)) {
    return false;
  }

  const left = unwrapExpression(parent.left);
  const right = unwrapExpression(parent.right);

  return (
    (left?.type === 'UnaryExpression' && left.operator === 'typeof' && nodeContainsStringNode(right, node))
    || (right?.type === 'UnaryExpression' && right.operator === 'typeof' && nodeContainsStringNode(left, node))
  );
}

function isPropertyExistenceKey(node, parent) {
  return parent?.type === 'BinaryExpression' && parent.operator === 'in' && parent.left === node;
}

function propertyNameOf(memberExpression) {
  if (!memberExpression || memberExpression.type !== 'MemberExpression') {
    return null;
  }

  if (memberExpression.property.type === 'Identifier' && !memberExpression.computed) {
    return memberExpression.property.name;
  }

  if (memberExpression.property.type === 'Literal' && typeof memberExpression.property.value === 'string') {
    return memberExpression.property.value;
  }

  return null;
}

function callNameOf(callExpression) {
  if (!callExpression || !['CallExpression', 'NewExpression'].includes(callExpression.type)) {
    return null;
  }

  if (callExpression.callee.type === 'Identifier') {
    return callExpression.callee.name;
  }

  return propertyNameOf(callExpression.callee);
}

function isInsideDefineEntityMetadata(node) {
  let current = node;

  while (current) {
    const parent = getParent(current);

    if (
      parent?.type === 'CallExpression'
      && parent.callee.type === 'Identifier'
      && parent.callee.name === 'defineEntity'
      && parent.arguments[0]
      && isNodeWithin(node, parent.arguments[0])
    ) {
      return true;
    }

    current = parent;
  }

  return false;
}

function isLookupKeyArgument(node, parent) {
  if (!['CallExpression', 'NewExpression'].includes(parent?.type)) {
    return false;
  }

  const callName = callNameOf(parent);

  return LOOKUP_METHOD_NAMES.has(callName) && parent.arguments[0] && isNodeWithin(node, parent.arguments[0]);
}

function isSelectorOrElementArgument(node, parent) {
  if (!['CallExpression', 'NewExpression'].includes(parent?.type)) {
    return false;
  }

  const callName = callNameOf(parent);

  return SELECTOR_ARGUMENT_CALL_NAMES.has(callName) && parent.arguments[0] && isNodeWithin(node, parent.arguments[0]);
}

function isEventNameArgument(node, parent) {
  if (!['CallExpression', 'NewExpression'].includes(parent?.type)) {
    return false;
  }

  const callName = callNameOf(parent);

  if (!EVENT_ARGUMENT_CALL_NAMES.has(callName)) {
    return false;
  }

  const eventArgumentIndex = callName === 'useMotionValueEvent' ? 1 : 0;
  const eventArgument = parent.arguments[eventArgumentIndex];

  return Boolean(eventArgument && isNodeWithin(node, eventArgument));
}

function isProcessEventNameArgument(node, parent) {
  if (parent?.type !== 'CallExpression' || parent.callee.type !== 'MemberExpression') {
    return false;
  }

  const object = unwrapExpression(parent.callee.object);

  return (
    object?.type === 'Identifier'
    && object.name === 'process'
    && propertyNameOf(parent.callee) === 'on'
    && parent.arguments[0]
    && isNodeWithin(node, parent.arguments[0])
  );
}

function isSchemaOrFrameworkKeyArgument(node, parent) {
  if (!['CallExpression', 'NewExpression'].includes(parent?.type)) {
    return false;
  }

  const callName = callNameOf(parent);

  return KEY_ARGUMENT_CALL_NAMES.has(callName) && parent.arguments.some((argument) => argument && isNodeWithin(node, argument));
}

function isHasOwnPropertyKeyArgument(node, parent) {
  if (parent?.type !== 'CallExpression' || parent.callee.type !== 'MemberExpression') {
    return false;
  }

  if (propertyNameOf(parent.callee) !== 'call') {
    return false;
  }

  const calleeObject = parent.callee.object;

  return (
    calleeObject.type === 'MemberExpression'
    && propertyNameOf(calleeObject) === 'hasOwnProperty'
    && parent.arguments[1]
    && isNodeWithin(node, parent.arguments[1])
  );
}

function isPathSegmentArgument(node, parent) {
  if (!['CallExpression', 'NewExpression'].includes(parent?.type)) {
    return false;
  }

  const callName = callNameOf(parent);

  return PATH_ARGUMENT_CALL_NAMES.has(callName) && parent.arguments.some((argument) => argument && isNodeWithin(node, argument));
}

function isTestDescriptionArgument(node, parent) {
  if (parent?.type !== 'CallExpression') {
    return false;
  }

  const callName = callNameOf(parent);

  return TEST_CALL_NAMES.has(callName) && parent.arguments[0] && isNodeWithin(node, parent.arguments[0]);
}

function isLoggerEventNameArgument(node, parent) {
  if (parent?.type !== 'CallExpression') {
    return false;
  }

  const callName = callNameOf(parent);

  return LOGGER_CALL_NAMES.has(callName) && parent.arguments[0] && isNodeWithin(node, parent.arguments[0]);
}

function isConsoleArgument(node, parent) {
  if (parent?.type !== 'CallExpression' || parent.callee.type !== 'MemberExpression') {
    return false;
  }

  const object = unwrapExpression(parent.callee.object);

  return object?.type === 'Identifier' && object.name === 'console';
}

function isErrorMessageArgument(node, parent) {
  if (parent?.type !== 'NewExpression' || parent.callee.type !== 'Identifier') {
    return false;
  }

  return ERROR_CONSTRUCTOR_NAMES.has(parent.callee.name) && parent.arguments[0] && isNodeWithin(node, parent.arguments[0]);
}

function jsxAttributeNameOf(parent) {
  if (parent?.type !== 'JSXAttribute' || parent.name.type !== 'JSXIdentifier') {
    return null;
  }

  return parent.name.name;
}

function isAllowedJsxAttributeName(attributeName) {
  return Boolean(
    attributeName
    && (
      JSX_LITERAL_ATTRIBUTE_NAMES.has(attributeName)
      || attributeName.startsWith('aria-')
      || attributeName.startsWith('data-')
    )
  );
}

function isAllowedJsxString(parent) {
  const attributeName = jsxAttributeNameOf(parent);

  return isAllowedJsxAttributeName(attributeName);
}

function hasAllowedJsxAttributeAncestor(node) {
  let current = node;

  while (current) {
    const parent = getParent(current);
    const attributeName = jsxAttributeNameOf(parent);

    if (isAllowedJsxAttributeName(attributeName)) {
      return true;
    }

    current = parent;
  }

  return false;
}

function keyNameOfProperty(property) {
  if (!property || !['Property', 'PropertyDefinition'].includes(property.type)) {
    return null;
  }

  if (property.key.type === 'Identifier' && !property.computed) {
    return property.key.name;
  }

  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value;
  }

  return null;
}

function propertyAncestorForValue(node) {
  let current = node;

  while (current) {
    const parent = getParent(current);

    if (
      (parent?.type === 'Property' || parent?.type === 'PropertyDefinition')
      && parent.value
      && isNodeWithin(node, parent.value)
    ) {
      return parent;
    }

    if (!WRAPPER_NODE_TYPES.has(parent?.type)) {
      return null;
    }

    current = parent;
  }

  return null;
}

function isCssPropertyValue(node) {
  let current = node;

  while (current) {
    const parent = getParent(current);
    const keyName = keyNameOfProperty(parent);

    if (keyName && CSS_PROPERTY_NAMES.has(keyName)) {
      return true;
    }

    current = parent;
  }

  return false;
}

function isTextPropertyValue(node, parent) {
  const keyName = keyNameOfProperty(parent) ?? keyNameOfProperty(propertyAncestorForValue(node));

  return keyName != null && TEXT_PROPERTY_NAMES.has(keyName);
}

function isCacheKeyPropertyValue(node) {
  let current = node;

  while (current) {
    const parent = getParent(current);
    const keyName = keyNameOfProperty(parent);

    if (keyName && CACHE_KEY_PROPERTY_NAMES.has(keyName)) {
      return true;
    }

    current = parent;
  }

  return false;
}

function isErrorNameString(node, value, parent) {
  if (!/(Error|Exception)$/.test(value)) {
    return false;
  }

  if (
    parent?.type === 'AssignmentExpression'
    && parent.left.type === 'MemberExpression'
    && propertyNameOf(parent.left) === 'name'
  ) {
    return true;
  }

  if (parent?.type === 'Property' && keyNameOfProperty(parent) === 'name') {
    return true;
  }

  if (parent?.type !== 'BinaryExpression') {
    return false;
  }

  const left = unwrapExpression(parent.left);
  const right = unwrapExpression(parent.right);

  return (
    (nodeContainsStringNode(left, node) && right?.type === 'MemberExpression' && propertyNameOf(right) === 'name')
    || (nodeContainsStringNode(right, node) && left?.type === 'MemberExpression' && propertyNameOf(left) === 'name')
  );
}

function isConstAssertion(node) {
  return (
    node?.type === 'TSAsExpression'
    && node.typeAnnotation?.type === 'TSTypeReference'
    && node.typeAnnotation.typeName?.type === 'Identifier'
    && node.typeAnnotation.typeName.name === 'const'
  );
}

function isModuleConstantDeclaration(declaration) {
  const parent = getParent(declaration);

  return (
    parent?.type === 'Program'
    || (
      parent?.type === 'ExportNamedDeclaration'
      && getParent(parent)?.type === 'Program'
    )
  );
}

function isInConstantDeclaration(node, options) {
  let current = node;

  while (current) {
    const parent = getParent(current);

    if (
      parent?.type === 'VariableDeclarator'
      && parent.init
      && isNodeWithin(node, parent.init)
      && parent.id.type === 'Identifier'
      && (
        (options.allowModuleConstantDefinitions && isModuleConstantDeclaration(parent.parent))
        || new RegExp(options.constantNamePattern).test(parent.id.name)
        || (isConstAssertion(parent.init) && /^[A-Z][A-Za-z0-9]*$/.test(parent.id.name))
      )
      && parent.parent?.type === 'VariableDeclaration'
      && parent.parent.kind === 'const'
    ) {
      return true;
    }

    if (parent?.type === 'Program') {
      return false;
    }

    current = parent;
  }

  return false;
}

function isIgnoredStringNode(node, options) {
  const parent = getParent(node);
  const stringValue = stringValueOf(node);

  if (
    isObjectPropertyKey(node, parent)
    || isImportOrExportSource(parent)
    || isDirective(parent)
    || isEnumMemberInitializer(node, parent)
    || isLiteralType(parent)
    || isPropertyExistenceKey(node, parent)
    || isTypeofComparisonString(node, parent)
    || isAllowedJsxString(parent)
    || hasAllowedJsxAttributeAncestor(node)
    || isInsideDefineEntityMetadata(node)
    || isCssPropertyValue(node)
    || isTextPropertyValue(node, parent)
    || isCacheKeyPropertyValue(node)
    || (stringValue != null && isErrorNameString(node, stringValue, parent))
    || (stringValue != null && isStaticTextOrPlatformValue(stringValue))
  ) {
    return true;
  }

  let current = node;

  while (current) {
    const ancestor = getParent(current);

    if (
      isLookupKeyArgument(current, ancestor)
      || isSelectorOrElementArgument(current, ancestor)
      || isEventNameArgument(current, ancestor)
      || isProcessEventNameArgument(current, ancestor)
      || isSchemaOrFrameworkKeyArgument(current, ancestor)
      || isHasOwnPropertyKeyArgument(current, ancestor)
      || isPathSegmentArgument(current, ancestor)
      || isTestDescriptionArgument(current, ancestor)
      || isLoggerEventNameArgument(current, ancestor)
      || isConsoleArgument(current, ancestor)
      || isErrorMessageArgument(current, ancestor)
    ) {
      return true;
    }

    current = ancestor;
  }

  return options.allowConstantDefinitions
    && isInConstantDeclaration(node, options);
}

function isCallArgument(current, parent) {
  if (!['CallExpression', 'NewExpression'].includes(parent?.type)) {
    return false;
  }

  return parent.arguments.some((argument) => argument && isNodeWithin(current, argument));
}

function isAssignmentValue(current, parent) {
  if (parent?.type === 'VariableDeclarator') {
    return parent.init && isNodeWithin(current, parent.init);
  }

  if (parent?.type === 'AssignmentExpression' || parent?.type === 'AssignmentPattern') {
    return parent.right && isNodeWithin(current, parent.right);
  }

  if (parent?.type === 'Property' || parent?.type === 'PropertyDefinition') {
    return parent.value && isNodeWithin(current, parent.value);
  }

  if (parent?.type === 'JSXAttribute') {
    return parent.value && isNodeWithin(current, parent.value);
  }

  return false;
}

function findViolationContext(node) {
  let current = node;

  while (current) {
    const parent = getParent(current);

    if (!parent) {
      return null;
    }

    if (parent.type === 'BinaryExpression' && COMPARISON_OPERATORS.has(parent.operator)) {
      return 'a comparison';
    }

    if (isCallArgument(current, parent)) {
      return 'a function input';
    }

    if (parent.type === 'ReturnStatement' && parent.argument && isNodeWithin(current, parent.argument)) {
      return 'a function output';
    }

    if (
      parent.type === 'ArrowFunctionExpression'
      && parent.body.type !== 'BlockStatement'
      && isNodeWithin(current, parent.body)
    ) {
      return 'a function output';
    }

    if (parent.type === 'ConditionalExpression') {
      return 'a ternary expression';
    }

    if (isAssignmentValue(current, parent)) {
      return 'an assignment';
    }

    current = parent;
  }

  return null;
}

const EXEMPT_PATH_PATTERNS = [
  /\/__tests__\//,
  /\/[A-Za-z0-9_-]*Test\//,
  /\/tests?\//,
  /\.test\.tsx?$/,
];

function create(context) {
  const filename = context.getFilename();
  if (EXEMPT_PATH_PATTERNS.some((p) => p.test(filename))) {
    return {};
  }

  const [rawOptions = {}] = context.options;
  const options = {
    allowConstantDefinitions: rawOptions.allowConstantDefinitions !== false,
    allowModuleConstantDefinitions: rawOptions.allowModuleConstantDefinitions !== false,
    constantNamePattern: rawOptions.constantNamePattern ?? DEFAULT_CONSTANT_NAME_PATTERN,
  };

  function check(node) {
    if (!isStringNode(node) || isIgnoredStringNode(node, options)) {
      return;
    }

    const violationContext = findViolationContext(unwrapExpression(node));

    if (!violationContext) {
      return;
    }

    context.report({
      node,
      messageId: 'looseString',
      data: {
        context: violationContext,
      },
    });
  }

  return {
    Literal: check,
    TemplateLiteral: check,
  };
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow loose string literals in value-bearing code paths',
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          allowConstantDefinitions: { type: 'boolean' },
          allowModuleConstantDefinitions: { type: 'boolean' },
          constantNamePattern: { type: 'string' },
        },
      },
    ],
    messages: {
      looseString: 'Loose string in {{context}}. Use constants and reuse properly defined enums instead.',
    },
  },
  create,
};
