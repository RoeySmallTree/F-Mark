# F-Mark Redesign — Re-Read This After Any Context Clear

You (Claude Code) are implementing the F-Mark redesign in `/home/roey/workspace/F-Mark`. The user explicitly told you to write this file so you can re-orient yourself after a `/clear` and continue.

## The verbatim original instruction

> ultrathink — use `/superpowers:writing-plans`. I want you to implement the following design, and apply the features it presents (no mocks. real working features). Derive whatever needed (for example — skills will be scanned from the closest `.skills` folders depending on the active agent). Think and plan each and every sub-feature as its own implementation with a sub-agent (you don't code — you plan, launch and verify). Whenever the plan is ready — don't pause to confirm — use `/superpowers:executing-plans` skill and implement. Don't pause, don't confirm, just commit whenever you feel appropriate. Make judgment calls for features and implementations, and verify with `/buddy` on each step that you've completely implemented without gaps/bugs/dead-ends. Use `/fe` skill for front end stuff, and apply EVERYTHING including all themes (within the settings modal). Also implement the markdown mechanism like within `/home/roey/workspace/CABAL/cabal-be/tools/control/src/components/MarkdownRenderer.tsx` to render markdown and jsons in multiple modes and the collapsed states of them. Work against planning documents and progress documents and a README that'll have this instruction within it so you could clear your context and re-read to keep going. The design: `https://api.anthropic.com/v1/design/h/F-MX0_9oZUAaaS8zQRpkpA?open_file=F-Mark.html`

## How you operate

- **You don't write code** — you plan, dispatch subagents, and verify.
- **Use `/fe`** (via the `Skill` tool) for frontend implementation work; it routes through `frontend-design`, `impeccable`, and `design-motion-principles`.
- **Use `/buddy`** (via the `Skill` tool) after each phase to have Codex verify completeness — no gaps, no dead-end click handlers, no fake mocks where real data should flow.
- **Don't pause for confirmation.** Make judgment calls. Commit progressively after each verified phase.

## Key documents

- `planning/redesign/INSTRUCTIONS.md` — this file (re-read first after any context clear)
- `planning/redesign/plan.md` — master plan, phased
- `planning/redesign/progress.md` — running log, updated by every subagent and by you after each /buddy verification
- `planning/redesign/design.html` — the staged HTML prototype (source of truth for visuals)
- `planning/redesign/{app,cards,modals,panels,icons,tweaks-panel}.jsx` — JSX component sources
- `planning/redesign/screenshots/*.png` — themed screenshots (terminal, ide, solarized, brutalist, cyber) and version progression (v1–v11)

## Re-orient protocol after `/clear`

1. Read `planning/redesign/INSTRUCTIONS.md` (this file).
2. Read `planning/redesign/plan.md` — find the next unchecked phase.
3. Read `planning/redesign/progress.md` — what's been done, what's pending, any open `/buddy` findings to address.
4. Read `planning/redesign/design.html` (and JSX siblings) for the design source of truth.
5. Resume execution — dispatch the next subagent per the plan; do not ask the user what to do next.

## Hard rules

- **No mocks** for features the user expects to work. If the design shows a list of sessions, real sessions must populate it. If it shows a todo card, real todos must persist via the backend.
- **Skills scanning** is real: implement scanning of `.claude/skills/`, `.codex/skills/`, `.gemini/skills/`, and `.skills/` from the project root depending on which agent is "active" (initially, the user's chosen agent in Settings → Connected Agents). The Skills palette (⌘⇧K) shows these.
- **Presets** load real preset files from `.f-mark/presets/*.md` plus an embedded built-in set.
- **Todos** persist as `todo.json` events per the architecture (§6.4), with status changes via supersession.
- **Comments** are prose with `target`, already supported. The pins-in-feed + right-panel-thread interactions must be wired.
- **Themes** — all five dark themes plus the light default must work, persisted in localStorage, swapped via Settings → Appearance.
- **Markdown + JSON renderer** — implement multi-mode (rendered / source / accordion for markdown; tree / source / table for JSON) with collapsible nesting, matching the spirit of `cabal-be/.../MarkdownRenderer.tsx` + `AccordionMarkdown.tsx`.
- **TDD** for backend; **/fe** for frontend (the skill routes you through visual + motion design quality gates).
- **/buddy** after each phase — Codex must read the diff and call out gaps; if it finds any, dispatch a fix subagent before moving on.

## Active agent detection (derivation note)

The instruction says "skills scanned from the closest `.skills` folders depending on the active agent." Interpretation:

- F-Mark's Settings → Connected Agents lists installed agents (Claude Code, Codex, Gemini, generic).
- One is marked active (default: Claude Code if `.claude/` exists; else generic).
- The Skills palette walks up from `CWD` to the project root, checking each dir for `.{agent}/skills/` and `.skills/`, then dedupes.
- Per-skill metadata pulled from the skill folder's `SKILL.md` frontmatter or first heading.

## Quality bar

Every phase must produce **working** features. After /buddy verifies, the feature should pass these manual checks (the verifier subagent runs them):

- Clickable: every visible button does something real.
- Stateful: changes persist (server-side where applicable, localStorage for UI prefs).
- Reactive: WebSocket updates propagate, no dead state.
- Themed: every screen looks right in all six themes (default + 5 dark).
- Keyboard: documented shortcuts work.

## When you're done

Run the finishing-a-development-branch skill, hand the user a final summary, and update `progress.md` with "REDESIGN COMPLETE" at the top.
