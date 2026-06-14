/* ThemePreview — a miniature, non-interactive F-Mark feed rendered with live
   theme tokens. As a theme is hovered/selected in ThemePicker, applyTheme()
   swaps the <body> theme class and every token below re-resolves, so this pane
   shows the real look of prose, a request, multi-select, todos, and chips.

   Shared by the onboarding wizard and Settings → Appearance. */

import { type JSX } from "react";
import { Bot, Check, User } from "lucide-react";

export function ThemePreview(): JSX.Element {
  return (
    <div className="tp-preview" aria-hidden="true">
      {/* Agent message with markdown-ish content */}
      <div className="tp-row">
        <span className="tp-avatar tp-avatar-agent">
          <Bot size={13} />
        </span>
        <div className="tp-bubble tp-bubble-agent">
          <div className="tp-h">Refactor plan</div>
          <p className="tp-p">
            I&apos;ll extract the parser into <code className="tp-code">tokenize()</code>{" "}
            and add a regression test first.
          </p>
          <ul className="tp-list">
            <li>Split lexer from evaluator</li>
            <li>Cover the edge cases</li>
          </ul>
          <pre className="tp-pre">
            <span className="tp-kw">const</span> next = parse(src)
          </pre>
        </div>
      </div>

      {/* A request (single-choice) card */}
      <div className="tp-card">
        <div className="tp-card-q">Ship the migration tonight?</div>
        <div className="tp-choices">
          <button type="button" className="tp-choice on" tabIndex={-1}>
            <Check size={11} /> Yes, run it
          </button>
          <button type="button" className="tp-choice" tabIndex={-1}>
            Wait for review
          </button>
          <button type="button" className="tp-choice" tabIndex={-1}>
            Roll back
          </button>
        </div>
      </div>

      {/* A multi-option card */}
      <div className="tp-card">
        <div className="tp-card-q">Which checks should block merge?</div>
        <div className="tp-multi">
          {[
            { label: "Type-check", on: true },
            { label: "Unit tests", on: true },
            { label: "Lint", on: false },
          ].map((o) => (
            <span key={o.label} className={`tp-opt${o.on ? " on" : ""}`}>
              <span className="tp-box">{o.on ? <Check size={10} /> : null}</span>
              {o.label}
            </span>
          ))}
        </div>
      </div>

      {/* A small todo list */}
      <div className="tp-card">
        <div className="tp-card-q">Todos</div>
        <div className="tp-todos">
          <span className="tp-todo done">
            <span className="tp-dot done" /> Wire the API client
          </span>
          <span className="tp-todo wip">
            <span className="tp-dot wip" /> Build the feed
          </span>
          <span className="tp-todo">
            <span className="tp-dot" /> Polish empty states
          </span>
        </div>
      </div>

      {/* A user message + chip strip */}
      <div className="tp-row tp-row-user">
        <div className="tp-bubble tp-bubble-user">
          Looks good — go ahead and start.
        </div>
        <span className="tp-avatar tp-avatar-user">
          <User size={13} />
        </span>
      </div>

      <div className="tp-chips">
        <span className="tp-chip">
          <span className="tp-chip-dot tp-chip-dot-agent" /> Atlas
        </span>
        <span className="tp-chip">
          <span className="tp-chip-dot tp-chip-dot-user" /> You
        </span>
      </div>
    </div>
  );
}
