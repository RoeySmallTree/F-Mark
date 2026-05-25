const fs = require('fs');
let css = fs.readFileSync('packages/renderer/src/shell/shell.css', 'utf-8');

const regex = /\.textarea-wrapper \{[\s\S]*?\.textarea-wrapper textarea::placeholder \{[\s\S]*?\}/;
const newCSS = `.compose-box textarea {
  width: 100%;
  background: transparent;
  border: 0;
  outline: 0;
  resize: none;
  font: inherit;
  font-size: 14px;
  color: var(--ink);
  min-height: 24px;
  max-height: 140px;
  line-height: 1.55;
}
.compose-box textarea::placeholder {
  color: var(--ink-4);
}`;

css = css.replace(regex, newCSS);
fs.writeFileSync('packages/renderer/src/shell/shell.css', css);
console.log('Reverted textarea css');
