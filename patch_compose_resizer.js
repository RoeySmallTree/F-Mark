const fs = require('fs');
let code = fs.readFileSync('packages/renderer/src/compose/Compose.tsx', 'utf-8');

code = code.replace(
  /<div className="textarea-wrapper" data-replicated-value=\{content\}>\s*<textarea\s+ref=\{textareaRef\}[\s\S]*?aria-label="Compose message"\s*\/>\s*<\/div>/,
  `<textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onTextareaKey}
          placeholder={placeholderFor(mode, commentTarget !== null)}
          rows={mode === "named" ? 4 : 1}
          aria-label="Compose message"
        />`
);

const resizer = `  // Auto-grow the textarea up to its max-height (140px from CSS).
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (ta === null) return;
    ta.style.height = "24px";
    const next = Math.min(ta.scrollHeight, 140);
    ta.style.height = \`\$\{next\}px\`;
  }, [content, mode]);

  function onTextareaKey`;

code = code.replace(/  function onTextareaKey/, resizer);

// Also fix the Popover toggle issue
code = code.replace(
  /  const openSettings = useCallback\(\(\): void => \{\n    const rect = settingsBtnRef\.current\?\.getBoundingClientRect\(\) \?\? null;\n    setCreateTodoAnchorRect\(null\);\n    openPopover\("compose-settings", rect\);\n  \}, \[openPopover\]\);/,
  `  const openSettings = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
    if (activePopover.key === "compose-settings") {
      closePopover();
      return;
    }
    const rect = settingsBtnRef.current?.getBoundingClientRect() ?? null;
    setCreateTodoAnchorRect(null);
    openPopover("compose-settings", rect);
  }, [activePopover.key, closePopover, openPopover]);`
);

fs.writeFileSync('packages/renderer/src/compose/Compose.tsx', code);
console.log('Patched Compose.tsx with JS resizer and popover toggle');
