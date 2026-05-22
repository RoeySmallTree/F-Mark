# F-Mark Redesign — Master Implementation Plan

> **For agentic workers:** This plan is the spine. Each Phase is owned by one (or more) subagent. After each phase: `/buddy` verifies the diff against the phase's "Done means" list. Update `progress.md` after every step. Do not skip /buddy.

**Goal:** Reproduce the F-Mark design from `planning/redesign/design.html` as real working features (no mocks) in `packages/renderer/` + extend `packages/kernel/` with the supporting endpoints.

**Architecture:** Same kernel (Fastify + filesystem event log) extended with todos, presets, skills, search. Renderer rewritten under a theme provider with CSS variables ported from `design.html`, components split per design (TopBar, Rails, Panels, Cards, Compose, Modals, Popovers, Palettes).

**Tech Stack:** React 18 + zustand + Tailwind v3 + lucide-react icons + `marked` for markdown (mirror CABAL). Google fonts: Source Serif 4, DM Sans, JetBrains Mono. Themes via `<body class="theme-...">` swap.

---

## Phase index

| # | Phase | Subagent prompt key | Verifier focus |
|---|---|---|---|
| P1 | Foundation: fonts, theme tokens, theme switcher | `dispatch.p1.foundation` | All 6 themes apply; localStorage persists; structural overrides correct |
| P2 | Backend extensions: todos / presets / skills / search | `dispatch.p2.backend` | New routes pass tests; skills scanner walks correctly; presets endpoint returns built-in + user |
| P3 | MarkdownRenderer + JsonRenderer with multi-mode | `dispatch.p3.markdown` | Rendered/source/accordion modes each work; JSON tree collapses nested; both used inside prose cards |
| P4 | Layout shell: TopBar / LeftRail+Panel / Feed / RightPanel+Rail / Compose | `dispatch.p4.shell` | 5-col grid, rails switch panels, panels show scope subhead, all CSS classes present |
| P5 | Cards: msg / named-prose / choices / embed / todo / file / turn-end | `dispatch.p5.cards` | Every event kind has a card; markdown rendered in named cards; comment pins clickable |
| P6 | Compose bar: modes + hotkeys | `dispatch.p6.compose` | ⌘N toggles named, ⌘/ toggles comment, dynamic send label, name input when named |
| P7 | Command palette ⌘K | `dispatch.p7.cmdk` | Opens on ⌘K, fuzzy filters, arrow nav, enter actions all real |
| P8 | Presets popover ⌘P / ⚡ | `dispatch.p8.presets` | Loads from /presets, click pre-fills compose, project-local presets show |
| P9 | Skills palette ⌘⇧K | `dispatch.p9.skills` | Scans real folders; active-agent filter from Settings; click inserts skill into compose |
| P10 | New Session modal | `dispatch.p10.newsession` | 4 templates seed real starter prose; agent invite triggers `/participants/register` + copy snippet |
| P11 | Settings modal: 5 sections | `dispatch.p11.settings` | Theme swap live; agent on/off persists; shortcuts list real bindings; about shows version |
| P12 | Log filter popover + Activity tab | `dispatch.p12.log` | Filter chips apply to GET /events query; date range narrows; Named-only toggle works |
| P13 | View toggle: Everything / Document / Conversation | `dispatch.p13.viewtoggle` | Feed re-projects on toggle; persists per-session |
| P14 | Comment overlay system | `dispatch.p14.comments` | Pin click focuses + dims; right panel shows thread + anchor; resolve transitions style |
| P15 | Polish + /buddy final pass | `dispatch.p15.polish` | No dead buttons; empty states present; README updated; final /buddy clean |

---

## Phase 1 — Foundation: fonts, theme tokens, theme switcher

**Goal:** Port the 6 theme CSS variable sets from `planning/redesign/design.html` (lines 11–174) into the renderer. Body class swap. Persisted preference. No visible UI change yet — theme infra only.

**Files:**
- Create: `packages/renderer/src/themes/tokens.css` — `:root` and `body.theme-*` blocks ported verbatim from `design.html`
- Create: `packages/renderer/src/themes/structural.css` — the brutalist/terminal/cyber structural overrides from `design.html`
- Create: `packages/renderer/src/themes/index.ts` — `THEMES` array, `applyTheme(name)`, `getCurrentTheme()`, `subscribeTheme(cb)`; persists to localStorage key `fmark.theme`
- Modify: `packages/renderer/src/styles.css` — import the two new CSS files, add Google Fonts link via `@import`
- Modify: `packages/renderer/index.html` — preconnect + `<link>` for Source Serif 4, DM Sans, JetBrains Mono
- Modify: `packages/renderer/src/main.tsx` — call `applyTheme(getCurrentTheme())` before mount
- Create: `packages/renderer/tests/themes.test.ts` — assert localStorage persistence + class swap

**Done means:**
- Default theme on first load (no localStorage entry).
- `applyTheme('terminal')` adds `theme-terminal` to `<body>`, removes any other `theme-*`, writes localStorage.
- Reloading the page restores the saved theme.
- All six theme names in THEMES array: `light`, `terminal`, `ide`, `solarized`, `brutalist`, `cyber`.
- A throwaway dev page or test confirms `getComputedStyle(document.body).getPropertyValue('--ink')` differs across themes.

---

## Phase 2 — Backend extensions

**Goal:** Add the routes the redesign needs.

**Files:**
- Create: `packages/kernel/src/routes/todos.ts` — `POST /sessions/:id/events/todo` writes a todo.json; supersession via repeat with `supersedes`; `GET /sessions/:id/todos` aggregates open + done from event log; assigned filter
- Create: `packages/kernel/src/routes/files.ts` — `POST /sessions/:id/events/file` (multipart) writes binary into `assets/` + `file.json` event
- Create: `packages/kernel/src/routes/presets.ts` — `GET /presets` returns `{ builtin: [...], project: [...] }` from `packages/kernel/assets/presets/` + project `.f-mark/presets/*.md`
- Create: `packages/kernel/assets/presets/*.md` — initial set: generate-variations.md, plan-in-phases.md, critique.md, alternative-approach.md, summarize.md, what-am-i-missing.md, make-shorter.md, make-concrete.md (each with frontmatter `{name, group, icon}` and a prompt body)
- Create: `packages/kernel/src/routes/skills.ts` — `GET /skills?agent=<id>` walks from CWD upward, looking for `.claude/skills/`, `.codex/skills/`, `.gemini/skills/`, `.skills/`; parses each `SKILL.md` for name/desc/args
- Create: `packages/kernel/src/skills/scanner.ts` — pure module: `findSkills(cwd, agent)` returns `[{ source, name, description, args, path }]`
- Create: `packages/kernel/src/routes/search.ts` — `GET /search?q=<text>&session=<id>` returns matching prose/named/choices across the session (or all sessions if omitted)
- Modify: `packages/kernel/src/server.ts` — register the new route groups
- Modify: `packages/shared/src/events.ts` — TodoPayload already there; ensure FileRefPayload exported; export `Preset`, `SkillRef`, `SearchHit`
- Tests: `packages/kernel/tests/routes/todos.test.ts`, `files.test.ts`, `presets.test.ts`, `skills.test.ts`, `search.test.ts`, plus `tests/skills/scanner.test.ts` exercising tmp-dir layouts

**Done means:**
- All five new routes pass tests covering happy + auth + bad input paths.
- `findSkills()` correctly handles a tmpdir with `.claude/skills/foo/SKILL.md` and a parent `.skills/bar/SKILL.md`.
- Presets endpoint returns built-in immediately; `.f-mark/presets/x.md` added then surfaces.
- Search returns events with snippet + context, ranked by recency, capped at 50.

---

## Phase 3 — MarkdownRenderer + JsonRenderer (multi-mode + collapsible)

**Goal:** Mirror CABAL's `MarkdownRenderer.tsx` + `AccordionMarkdown.tsx`, generalized.

**Files:**
- Create: `packages/renderer/src/render/MarkdownRenderer.tsx` — `marked` parses to HTML; sanitize-on-render (since we trust local source); mode prop `'rendered' | 'source' | 'accordion'`
- Create: `packages/renderer/src/render/AccordionMarkdown.tsx` — H1/H2 split (lifted from CABAL `AccordionMarkdown.tsx`), but themed via our CSS vars instead of CABAL's `bg-zinc-950` etc.
- Create: `packages/renderer/src/render/JsonRenderer.tsx` — `'tree' | 'source' | 'table'` modes; tree uses collapsible `<details>` per object/array node with key + summary
- Create: `packages/renderer/src/render/ModeToggle.tsx` — small pill group that drives a `mode` state, used by both renderers
- Create: `packages/renderer/src/render/copy.ts` — `copyToClipboard(text)` + toast hook
- Add deps: `marked@^14`, `lucide-react@^0.469`
- Tests: `packages/renderer/tests/render/markdown.test.tsx`, `json.test.tsx` — verify each mode renders the right thing for a fixture

**Done means:**
- MarkdownRenderer in `rendered` mode emits sanitized HTML matching marked's output.
- `accordion` mode collapses every `#` section + nested `##`, all closed by default, expandable.
- `source` mode shows the raw markdown in a `<pre><code>` block.
- JsonRenderer tree mode: nested object `{a:{b:1}}` opens to two levels of `<details>`, each toggleable.
- JsonRenderer table mode: array of homogeneous objects renders as `<table>` with keys as columns.

---

## Phase 4 — Layout shell

**Goal:** Replace the current renderer App shell with the design's 5-column grid + rails + panels + compose.

**Files:**
- Modify: `packages/renderer/src/App.tsx` — top-level grid wrapper, mounts shell components
- Create: `packages/renderer/src/shell/TopBar.tsx` — brand + breadcrumb + view-toggle + turn-pill + participants + search-icon + settings-icon + cmdk-icon
- Create: `packages/renderer/src/shell/LeftRail.tsx` — vertical strip of 5 icon buttons (Sessions / Named / Todos / Comments / Search); switches active panel
- Create: `packages/renderer/src/shell/LeftPanel.tsx` — host frame; renders one of `panels/Sessions.tsx`, `panels/Named.tsx`, `panels/Todos.tsx`, `panels/Comments.tsx`, `panels/Search.tsx` based on rail selection
- Create: `packages/renderer/src/panels/Sessions.tsx` — real sessions from `GET /sessions`, grouped by recency (Today / Yesterday / Earlier this week / This month), active highlight
- Create: `packages/renderer/src/panels/Named.tsx` — real named prose from current session, scope subhead `in <slug>`
- Create: `packages/renderer/src/panels/Todos.tsx` — real todos via `GET /sessions/:id/todos`, + Add button opens modal (Phase later)
- Create: `packages/renderer/src/panels/Comments.tsx` — derived from `commentsByTarget` aggregation
- Create: `packages/renderer/src/panels/Search.tsx` — live calls `GET /search?q=&session=`
- Create: `packages/renderer/src/shell/Feed.tsx` — host for cards; dim-when-overlay class hook
- Create: `packages/renderer/src/shell/RightPanel.tsx` — tabs (Todos / Comments / Named / Log); tab content lives in `panels/Right*.tsx` files
- Create: `packages/renderer/src/panels/RightLog.tsx`, `RightComments.tsx`, `RightTodos.tsx`, `RightNamed.tsx`
- Create: `packages/renderer/src/shell/Compose.tsx` (stub for Phase 6)
- Update: `packages/renderer/src/state/store.ts` — add `leftRail: 'sessions'|'named'|'todos'|'comments'|'search'`, `rightTab: ...`, etc.

**Done means:**
- The page renders exactly the empty shell from `design.html` (without cards yet).
- Switching rail icons changes the left panel content.
- Switching right tabs changes the right panel content.
- All panel widths/colors/borders match the design CSS classes.
- Per-session panels show the scope subhead.

---

## Phase 5 — Cards

**Goal:** Render every event kind as the design's card variant; replace the placeholder feed.

**Files:**
- Create: `packages/renderer/src/cards/MessageCard.tsx` (unnamed prose, no target)
- Create: `packages/renderer/src/cards/ProseCard.tsx` — large named-prose card with stripe-dot + frontmatter line + MarkdownRenderer (default rendered) + foot toolbar (copy, view source, accordion); comment pins overlaid at line-precision targets
- Create: `packages/renderer/src/cards/ChoicesCard.tsx` — uses real `POST /events/choice` to record selection, chosen-state styling
- Create: `packages/renderer/src/cards/EmbedCard.tsx` — for html events; sandboxed iframe pointing at `/sessions/:id/raw/:filename/index.html` (raw route to add if missing)
- Create: `packages/renderer/src/cards/TodoCard.tsx` — toggle done supersedes the todo event
- Create: `packages/renderer/src/cards/FileCard.tsx` — uses `file.json` event payload; thumb based on mime
- Create: `packages/renderer/src/cards/TurnEndDivider.tsx` — the dashed-line component
- Create: `packages/renderer/src/cards/index.ts` — dispatcher: `<EventCard event=…/>` picks the right component
- Modify: `packages/renderer/src/shell/Feed.tsx` — replace placeholder list with `<EventCard>` per visible event

**Done means:**
- Every event kind produces the correct card.
- Markdown inside named prose renders with our renderer; mode toggle in foot works.
- Choice click writes back to the server and shows chosen state.
- Todo toggle supersedes the event and updates immediately.
- Pin click sets `currentComment` in the store (visual response in Phase 14).

---

## Phase 6 — Compose bar

**Files:**
- Create: `packages/renderer/src/compose/Compose.tsx`
- Create: `packages/renderer/src/compose/ModeBar.tsx` — Message / Named / Comment pills with kbd chips
- Create: `packages/renderer/src/compose/TargetPill.tsx` — visible when commenting; closeable
- Create: `packages/renderer/src/compose/NameInput.tsx` — serif title input, visible when named
- Create: `packages/renderer/src/hooks/useHotkeys.ts` — `useHotkeys({ '$mod+/': fn, '$mod+n': fn, '$mod+k': fn, '$mod+shift+k': fn, '$mod+p': fn })`
- Tests: `packages/renderer/tests/compose.test.tsx`

**Done means:**
- ⌘N toggles named mode; UI shifts; serif title input appears.
- ⌘/ toggles comment mode (when a target is selected via card pin/highlight).
- Send-button label switches: Message → "Send", Named → "End turn", Comment → "Post comment".
- All modes POST to the right endpoint.

---

## Phase 7 — Command palette ⌘K

**Files:**
- Create: `packages/renderer/src/palettes/CommandPalette.tsx`
- Create: `packages/renderer/src/palettes/sources.ts` — `getCmdkSources(state, query)` → groups: Sessions, Named, Todos, Quick actions
- Create: `packages/renderer/src/palettes/fuzzy.ts` — fuzzy match (small inline impl)

**Done means:**
- ⌘K opens modal at top of viewport.
- Empty query shows Recent Sessions + Quick actions (new session, settings, theme switch).
- Typed query filters across sessions / named contributions / todos / quick actions.
- Up/Down navigates; Enter activates.

---

## Phase 8 — Presets popover

**Files:**
- Create: `packages/renderer/src/palettes/PresetsPopover.tsx`
- Create: `packages/renderer/src/palettes/sources-presets.ts` — fetches `/presets`, returns groups

**Done means:**
- ⌘P or ⚡ Presets button opens popover anchored over compose.
- Preset click pre-fills compose textarea with the preset body.
- Search input filters preset list.

---

## Phase 9 — Skills palette

**Files:**
- Create: `packages/renderer/src/palettes/SkillsPalette.tsx`
- Create: `packages/renderer/src/palettes/sources-skills.ts` — fetches `/skills?agent=<active>`

**Done means:**
- ⌘⇧K opens palette.
- Lists real skills from `.claude/skills/*` (and other matching agent dirs).
- Active-agent filter pulled from Settings.
- Click inserts skill invocation (e.g. `/skill-name `) into compose textarea, focused.

---

## Phase 10 — New Session modal

**Files:**
- Create: `packages/renderer/src/modals/NewSessionModal.tsx`
- Create: `packages/renderer/src/modals/templates.ts` — 4 templates each producing an initial prose body

**Done means:**
- Triggered by `+ New` in Sessions panel and by ⌘K → "New session" action.
- Slug input shows resolved path prefix.
- Template radio picks; the chosen template's starter prose is POSTed as the first named-prose event after session creation.
- Agent invite list shows registered agents + an "Invite new..." row that opens `POST /participants/register`.
- Toggle "Open immediately + copy orientation snippet" — when on, after create, opens the new session AND copies the `/guide?sessionId=…&token=…` URL.

---

## Phase 11 — Settings modal

**Files:**
- Create: `packages/renderer/src/modals/SettingsModal.tsx`
- Create: `packages/renderer/src/modals/settings/Profile.tsx`, `Agents.tsx`, `Appearance.tsx`, `Shortcuts.tsx`, `About.tsx`

**Done means:**
- Gear icon in TopBar opens modal.
- Profile: name + color, saves to `config.json` (existing participants entry for current user).
- Agents: lists registered agents + Add (invokes register), with on/off pill (off = soft-deleted, marked archived in config), each has a "Copy orientation snippet" button that copies the `/guide?…` URL + bearer token.
- Appearance: 6 theme cards with live preview, density slider (Compact / Comfortable / Spacious — controls feed `--scale`).
- Shortcuts: full list of every binding from `useHotkeys` usage, read-only first pass.
- About: ASCII logo from `planning/ascii-art.md`, version from kernel `/health`.

---

## Phase 12 — Log filter + activity tab

**Files:**
- Create: `packages/renderer/src/panels/RightLog.tsx` (filled in)
- Create: `packages/renderer/src/popovers/LogFilterPopover.tsx`

**Done means:**
- Right panel "Log" tab lists every event for the current session, newest first.
- Filter button opens popover with kind chips, participant chips, date range, "Named only" toggle.
- Apply filters → calls `GET /events` with corresponding querystring; list updates.

---

## Phase 13 — View toggle

**Files:**
- Modify: `packages/renderer/src/state/aggregate.ts` — add `feedEverything`, `feedDocument`, `feedConversation`
- Modify: `packages/renderer/src/shell/TopBar.tsx` to render the toggle
- Modify: `packages/renderer/src/shell/Feed.tsx` to pick the right slice from aggregate

**Done means:**
- Toggle in TopBar switches the feed slice.
- Document mode shows only named prose + their comments.
- Conversation mode shows only unnamed messages + choices + replies.
- Persists in store, per session.

---

## Phase 14 — Comment overlay system

**Files:**
- Modify: `packages/renderer/src/cards/ProseCard.tsx` — pins now toggle `store.focusedComment`
- Modify: `packages/renderer/src/shell/RightPanel.tsx` — when focused, render `CommentThreadOverlay`
- Create: `packages/renderer/src/overlays/CommentThreadOverlay.tsx`
- Modify: `packages/renderer/src/shell/Feed.tsx` — apply `dimmed` class while `focusedComment !== null`

**Done means:**
- Click pin: feed dims, target card gets `focused` ring, right panel switches to the thread view with the anchor snippet + replies + reply input + resolve button.
- Click pin again or X: restore.
- Resolve writes a new comment with `status: 'resolved'` supersedes pointing at the thread root.

---

## Phase 15 — Polish + final /buddy pass

**Files:** various.

**Done means:**
- No console errors at any theme.
- Every visible button has a real handler.
- All keyboard shortcuts documented in Settings → Shortcuts match what `useHotkeys` actually binds.
- README updated with a link to the redesign INSTRUCTIONS file.
- `progress.md` ends with `# REDESIGN COMPLETE` plus a summary.

---

## Per-phase /buddy verification pattern

After each phase's implementation subagent finishes:

1. **Write** `planning/redesign/buddy/p<N>/summary.md` — intent, strategy, what was implemented, what was deferred.
2. **Invoke** `/buddy-review` (Codex xhigh) with the summary, the diff (`git diff main...HEAD -- packages/`), and the phase's "Done means" list. Codex writes `review_1.md` in the same dir.
3. **Address** every finding (dispatch fix subagent if substantive). Loop until Codex returns "no remaining findings".
4. **Commit** the phase work.
5. **Update** `planning/redesign/progress.md` with: status, files touched, /buddy iterations, final commit hash.

## Self-review

I went back through the spec.

- **Themes (all 6):** P1 + P11 (Appearance section). ✓
- **Settings modal:** P11 covers all 5 sections. ✓
- **Markdown + JSON renderer with collapsible:** P3 covers both, multi-mode. ✓
- **Skills scanning per active agent:** P2 (backend) + P9 (palette) + P11 (active agent in Settings). ✓
- **Commit progressively, no pause:** baked into the per-phase rhythm. ✓
- **/fe for FE phases:** P3, P4, P5, P6, P7, P8, P9, P10, P11, P12, P13, P14, P15 will all open with `/fe`. ✓
- **No mocks:** every panel/card draws from real endpoints. The only acceptable "mocks" are empty-state messages.

**Gaps caught:**
- `POST /events/html` exists in arch but POC didn't ship it. EmbedCard needs it. Add to P2.
- The `/sessions/:id/raw/:filename` route for serving asset files isn't implemented. Add to P2.

**Updated P2 file list (additions, no rewrite):**
- Create: `packages/kernel/src/routes/html.ts` — `POST /sessions/:id/events/html` writes html bundle folder (manifest.json + index.html + style.css + script.js)
- Create: `packages/kernel/src/routes/raw.ts` — `GET /sessions/:id/raw/:filename` serves files inside session folder safely (path-checked)

This plan is final. Proceed to execution per `INSTRUCTIONS.md` re-orient protocol.
