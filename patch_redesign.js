const fs = require('fs');
let css = fs.readFileSync('packages/renderer/src/shell/shell.css', 'utf-8');

const regex = /\/\* ============ Compose Actions Dock ============[\s\S]*?\/\* ============ Send Button \(Standalone\) ============\//;
const newDockCSS = `/* ============ Compose Actions Dock ============ */
.compose-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line-2);
}

.compose-zone {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dock-divider {
  width: 1px;
  height: 16px;
  background: var(--line-3);
  margin: 0 4px;
}

.dock-spacer {
  flex: 1;
  min-width: 0;
}

/* ============ Mode Pills & Augment Launchers ============ */
.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--ink-2);
  font-family: var(--sans);
  font-weight: 500;
  white-space: nowrap;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 150ms ease;
}

.compose-zone-augments .mode-btn {
  padding: 6px 8px;
}

.mode-btn svg {
  opacity: 0.6;
  transition: transform 150ms ease, opacity 150ms ease;
}

.mode-btn:hover:not(:disabled) {
  background: var(--bg);
  color: var(--ink);
}

.mode-btn:hover:not(:disabled) svg {
  opacity: 0.9;
  transform: translateY(-1px);
}

.mode-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.mode-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Active Mode Pill */
.mode-btn.active {
  background: var(--ink);
  color: var(--canvas);
}

.mode-btn.active svg {
  opacity: 1;
}

.mode-btn .kbd {
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 500;
  color: var(--ink-3);
  margin-left: 2px;
  padding: 1px 4px;
  background: var(--line-2);
  border-radius: 4px;
  transition: all 150ms ease;
}

.mode-btn.active .kbd {
  background: rgba(255, 255, 255, 0.2);
  color: var(--canvas);
}

/* ============ Ends-Turn Chip ============
   No longer used since we moved to popover, but kept for legacy/other components */
.ends-turn-chip {
  display: none;
}

/* ============ Send Button (Standalone) ============ */
`;

css = css.replace(regex, newDockCSS);

// Now fix the Send Cluster
const regexSend = /\/\* ============ Send Cluster \(Message Mode\) ============ \*\/[\s\S]*?\/\* ============ Empty States ============ \*\//;
const newSendCSS = `/* ============ Send Cluster (Message Mode) ============ */
.send-cluster {
  display: inline-flex;
  align-items: stretch;
  background: var(--panel);
  border-radius: 20px;
  overflow: hidden;
  position: relative;
  box-shadow: inset 0 0 0 1px var(--line-2);
  transition: all 150ms ease;
  padding: 2px;
  gap: 2px;
}
.send-cluster:hover {
  box-shadow: inset 0 0 0 1px var(--line);
}

/* Send half (Primary Action) */
.send-cluster .send-btn.send-cluster-send {
  border-radius: 18px;
  padding: 6px 16px 6px 18px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  border: none;
  background: var(--ink);
  color: var(--canvas);
}
.send-cluster .send-btn.send-cluster-send:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(0,0,0,0.15);
}
.send-cluster-icon {
  opacity: 0.9;
  transition: transform 150ms ease;
}
.send-cluster .send-btn.send-cluster-send:hover:not(:disabled) .send-cluster-icon {
  transform: translateX(2px) translateY(-1px);
}

/* End-turn half (Secondary Action) */
.end-turn-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 16px;
  background: transparent;
  color: var(--ink-2);
  border: 0;
  border-radius: 18px;
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 150ms ease;
}
.end-turn-btn:hover:not(:disabled) {
  background: var(--bg);
  color: var(--ink);
}
.end-turn-btn:active:not(:disabled) {
  background: var(--line-2);
}
.end-turn-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Empty cluster — stretches single action */
.send-cluster.empty {
  box-shadow: inset 0 0 0 1px var(--line-2);
}
.send-cluster.empty:hover {
  box-shadow: inset 0 0 0 1px var(--line);
}
.send-cluster.empty .end-turn-btn {
  padding: 6px 20px;
  color: var(--ink);
  background: transparent;
}
.send-cluster.empty .end-turn-btn:hover:not(:disabled) {
  background: var(--bg);
}

/* ============ Empty States ============ */
`;

css = css.replace(regexSend, newSendCSS);

fs.writeFileSync('packages/renderer/src/shell/shell.css', css);
console.log('Redesigned the dock and send cluster');
