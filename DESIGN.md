---
name: Aurora
subject: F-Mark — an append-only event-log workspace where a developer collaborates with AI coding agents running in tmux
reference: Linear / Raycast surface-luminance elevation × glassmorphism 2.0 (translucent chrome over a gradient mesh)
default_theme: aurora-dark
tokens:
  surface:
    canvas: "#0b0d16"        # the void behind everything; the mesh sits on this
    solid: "#12141f"         # OPAQUE. Every surface that carries text.
    solid-2: "#171a27"       # OPAQUE. Raised content — hover, active row, nested panel.
    glass: "rgba(255,255,255,.045)"   # CHROME ONLY — rails, header, composer
    glass-2: "rgba(255,255,255,.075)" # CHROME ONLY — pressed/active chrome
    glass-3: "rgba(255,255,255,.11)"  # CHROME ONLY — hover on chrome
  line:
    line: "rgba(255,255,255,.10)"
    line-2: "rgba(255,255,255,.17)"
    highlight: "rgba(255,255,255,.12)" # 1px inset TOP only — the glass tell
  ink:
    tx: "#f0f1f7"            # 16.26:1 on solid — primary
    tx-2: "#a8adc4"          #  8.24:1 on solid — secondary
    tx-3: "#8b91a8"          #  5.86:1 on solid — meta. Lightest AA text.
  accent:
    ac: "#5eead4"            # 12.39:1 on solid — the ONE accent
    ac-2: "#c9a2ff"          #  8.81:1 on solid — paired accent, gradients + launching state
    ac-dim: "rgba(94,234,212,.16)"
  signal:
    ok: "#5eead4"            # 12.39:1 — agent healthy / working
    warn: "#fbbf24"          # 10.98:1 — stale
    hot: "#fb8fa0"           #  8.33:1 — destruction, pane-dead, blocked
    idle: "#5b607a"          # NON-TEXT ONLY — the offline presence dot
  participant:
    note: assigned by the kernel per participant; fills, rings and dots only — never text
  mesh:
    blob-opacity: 0.12       # HARD CAP. See "The contrast law".
    blur: 26px
    drift: 26s ease-in-out alternate
  type:
    sans: Outfit
    mono: IBM Plex Mono
    serif: null              # deliberately none
  scale:
    micro: 10.5px            # mono, uppercase, +0.12em — panel headers
    meta: 11px               # mono — timestamps, paths, counts
    ui: 12.5px               # sans — controls, list rows
    body: 13.5px             # sans, 1.66 — entry prose
    title: 15px              # sans 600
    lead: 19px               # sans 600, -0.02em
  geometry:
    radius: 12px
    radius-lg: 16px
    radius-xl: 20px          # app frame only
    radius-pill: 999px
    border-w: 1px
  motion:
    dur: 200ms
    ease: cubic-bezier(.22, 1, .36, 1)
    stagger: 40ms            # list rows; cap the multiplier at ~12
themes: [aurora-dark, aurora-light, contrast]
---

# Aurora

## The thesis

F-Mark drives coding agents that run unattended in tmux. The interface is a **window onto
work that continues without you** — so its job is to make state legible at a glance: who
is working, who is stuck, and what changed while you were gone.

Aurora is dark-first because that is where its reference class lives, and because
luminance is a cheaper hierarchy signal than weight when most of the screen is text.
Elevation is **surface lightness, not shadow**: a lighter surface reads as closer. There
are no drop shadows in this system.

The mesh — three slow-drifting colour blobs behind everything — is the one piece of
atmosphere. It gives the app a light source and a sense of depth. It is capped hard,
because it is decoration and decoration does not get to break text.

## The contrast law

**Content surfaces are opaque. Glass is for chrome.**

This is the rule that most constrains the design, and it came from measurement rather than
taste. Translucent surfaces make contrast **non-deterministic**: the effective background
under a label depends on where the mesh blob happens to be. Measured against the brightest
realistic composite (canvas + mesh at .20 + two glass layers = `rgb(68,92,94)`), the
original lab palette failed:

| token    | on canvas | on lit glass | verdict |
|----------|-----------|--------------|---------|
| `--tx-3` | 4.32      | **1.59**     | FAIL    |
| `--ac-2` | 7.34      | **2.70**     | FAIL    |
| `--hot`  | 7.20      | **2.65**     | FAIL    |
| `--tx-2` | 8.71      | **3.21**     | UI only |

Four changes fix it, and the tokens above already carry them:

1. **Text-bearing surfaces became opaque** (`--solid`, `--solid-2`). Glass is reserved for
   rails, header and composer — chrome that carries labels and icons, never body text.
   This is also the right call for performance: `backdrop-filter` over a thousand-event
   transcript is how glass UIs drop frames.
2. **Mesh blob opacity capped at 0.12** (was 0.20).
3. `--tx-3` lightened `#71768e` → `#8b91a8`, `--ac-2` `#c084fc` → `#c9a2ff`,
   `--hot` `#fb7185` → `#fb8fa0`.
4. `--idle` is **non-text only** — it colours the offline presence dot and nothing else.

Every ratio in the front matter is **computed from the token values, never estimated**,
and `packages/renderer/tests/token-contrast.test.ts` recomputes them from the stylesheet
and fails on drift. This test exists because an earlier revision carried eyeballed numbers:
nine of fourteen were wrong and one hid a real AA failure on text that was already
shipping. If you change a colour, run the test and paste its output. Do not adjust the
recorded number by eye.

> The design labs (`~/Desktop/labs/fmark-dashboard-lab.html`, `fmark-futuristic-lab.html`)
> still carry the **pre-fix** values. They are historical artifacts of the decision, not
> the source of truth. This file is.

## The one rule: one meaning per channel

A channel means exactly one thing, everywhere:

| Channel | Means | Never means |
|---|---|---|
| ink level | hierarchy — what to read first | state |
| `--ac` teal | an agent is healthy or working | emphasis, branding, success-in-general |
| `--hot` | destruction, blocked, dead | warning, attention |
| `--warn` | stale | error |
| participant hue | *who* | anything else |
| tool hue | *what kind of tool* | anything else |
| rules and borders | structure | decoration |

This is the load-bearing constraint, and it is testable: if you are reaching for a colour
to make something stand out, you are about to break it. Use ink level or a rule.

It earns its keep. On the previous direction it immediately caught the runtime-warning
banner drawing itself in the agent tint — a warning in the agent colour — which was
invisible as a problem until the channels had meanings.

Participant hues come from kernel data and cannot be contrast-checked ahead of time, so
they carry **fills, rings and dots only — never text**. Authorship is also carried by
**shape**, not hue alone, so it survives for anyone who cannot separate the two colours.

## Information architecture: three tiers of attention

The dashboard is the launch surface. It reads top to bottom in descending urgency:

1. **Urgent** — the "Waiting on you" strip. Conditional: it renders only when something is
   genuinely blocked, and degrades to a single line (`✓ Nothing is waiting on you`) when
   nothing is. It never becomes an empty hero, and the layout never jumps.
2. **Navigational** — session cards. A session whose agent is blocked carries a marker
   (`needs you` / `pane dead`) **and sorts to the front**. A marker you have to hunt for is
   worse than no marker.
3. **Ambient** — Agents (including `stale` and `offline`, which appear nowhere else in the
   app), In flight todos, and Recent activity. Last, because it is the only tier you can
   safely not read.

Recent ends with **View all activity →**, which makes the full cross-session timeline a
drill-down rather than a competing screen. The dashboard is the hub.

## The shell: fewer, named choices

The original complaint was that F-Mark felt crowded. The cause was not decoration — it was
**undifferentiated choice**. Two reductions carry most of the fix, and both were shown in
every lab:

**Right rail: 9 flat tabs → 3 named groups.** Nine peers with equal weight force you to
read all nine to find one. The tab list is authoritative in
`panels/right/tabMeta.tsx` — `RIGHT_TAB_META` — and the grouping is:

| Group | Panes | Why together |
|---|---|---|
| **Work** | Todos · Named · Comments | the document and collaboration layer — what is planned, written, discussed |
| **Code** | Files · Diff tree · Search | the repository — what exists, what changed, where things are |
| **Runtime** | Agents · Terminal · Log | the machines — who is running, their panes, their raw output |

`Layout` (`RightLayout.tsx`) leaves the rail — it is configuration, not a destination, so
it belongs behind the settings control.

**Rail behaviour: one active panel, plus exactly one pin.** The groups stay fixed so the
rail is navigable by muscle memory, and one panel can be pinned below the active one —
covering the real pairing (watch Terminal while reading Diff tree) without reintroducing
parallel panes.

**The cap of one is the design, not a limitation.** An uncapped accordion is how the
12-pane dock started; measured in the lab, three open sections in a normal ~900px window
get roughly 170–200px each — fine for a list, unusable for a terminal. Pinning therefore
**replaces** rather than appends, enforced in state.

Edge case, already resolved: pinning the panel that is currently active would render it
twice. The docked copy is **suppressed while pinned === active** and reappears the moment
you switch away — which is exactly what pinning the thing you are looking at means.

> Corrected 2026-08-01. An earlier revision of this file listed `Sessions` and `Flow` in
> the rail. Neither is a rail tab: `Sessions` is a **left** panel (`panels/Sessions.tsx`)
> and `Flow` is a **feed card type** (`FlowCard`, `systemDispatch`). `Comments` and `Named`
> were missing. The grouping above is read from `RIGHT_TAB_META`, not from memory — do the
> same before changing it.

**Composer: 7 buttons → 2 + overflow.** `Send` and `＋` (attach) stay visible; `⋯` holds
Todo, Alternatives, HTML, Flow and Anchor. The five hidden actions are real and used, but
not on the path of the common case, which is sending a message.

**One home per surface.** The dock engine (`dockLayout.tsx`, 12 panes × 5 drop areas ×
36 guillotine layouts) still exists behind a pinned default rather than being deleted —
removing it would touch all 12 panes' render paths at once. A `v5` migration moves stowed
panes into the right rail so nothing silently disappears for existing users.

**Supported width is declared, not adaptive.** F-Mark drives tmux panes, diffs and file
viewers; there is no off-canvas mobile mode and none is planned. The commitment is that
nothing scrolls horizontally between 320 and 1920px, and that below the supported width
the app states the requirement rather than degrading into an unusable layout.

## The agent screen — the main interface

F-Mark's job is driving agents, so an agent's terminal is **not** a panel. It is the primary
screen, and it gets a route.

This replaced two earlier answers that were both wrong. `TerminalOverlay` blacks out the app
to show one pane, so watching an agent means not using anything else. The 300px rail is too
narrow for a terminal at all — measured, the agent screen gives the terminal **945px against
the rail's 292px**. Neither surface was designed for the thing the product exists to do.

**The conversation is the hero, not the terminal.** This corrects an earlier draft of this
section which made the raw pane the main view — backwards, and it contradicted the product.
F-Mark's differentiator is auto-stream: the kernel renders an agent's output into cards
(messages, tool chips, todos, approvals) in the event log. That rendering *is* the interface.
The tmux pane is the **escape hatch** — for raw access, for typing directly into the pane,
and for the case where an agent died mid-turn and the feed has no conclusion.

So the main column is tabbed: **Conversation** (default) · **Terminal**. Both are views of
the same agent — one is the kernel's rendering of its output, the other is the source.

**Scope: one agent, not the whole session.** The session screen (`/session/:id`) shows every
participant. The agent screen shows **you plus this agent only** — the view you want when two
agents are working and you need to follow one.

The risk in filtering is real: agents act on each other's work, so a hidden event can leave
the next one unexplained. The mitigation is an inline **stub** where events were removed —
`2 events from Codex hidden · show` — which expands in place, dimmed, and collapses again.
The thread stays recoverable without weakening the filter. This mirrors the aggregator's
existing "consumed stub" jump rows rather than inventing a new idea.

The context sidebar answers exactly three questions — **who is this agent**, **is it stuck**,
**what is it doing**.

| Region | Carries |
|---|---|
| Route bar | breadcrumb + the URL, so the screen is linkable |
| Identity bar | name (rename in place), presence, model and effort selectors, `⋯` for the rest |
| Main column | **Conversation** (default) or **Terminal** — `TerminalView`, the same component the overlay and dock tab use |
| Drive bar | Pause/Resume · **Interrupt** · Compact · Clear · Reconnect, then the prompt box |
| Sidebar | Waiting on you · Context meter · Doing now · Recent · Runtime facts |

`interrupt`, `rename` and `recolor` come from `BusyAction` in
`panels/right/agents/types.ts` and were missing from every earlier design. `context`
(`AgentContextStatus`) drives the meter, which uses `clip-path: inset()` rather than
`transform: scaleX()` — the bar has a gradient and a radius, and scaleX distorts both.

The blocking approval sits at the **top of the sidebar**, not in the terminal, because the
terminal scrolls and an approval must not scroll away.

## Routing

Decided: the app gets a router. Today the active session lives in store state
(`currentSessionId`, `state/sessionPersistence.ts`) and only `/file-tree` plus a `path_id`
query param exist, so nothing is linkable and the browser back button does nothing.

| Route | Screen |
|---|---|
| `/` | dashboard |
| `/session/:id` | session feed |
| `/session/:id/agent/:tmux` | agent screen |
| `/session/:id/files/*path` | file viewer (already half-routed via `/file-tree`) |
| `?path_id=` | project switcher — already exists, keep it |

Eleven places link to the agent screen, including the dashboard's blocked strip, the rail's
Agents panel, and an agent avatar anywhere in the feed. `sessionPersistence` becomes the
fallback for "where was I", not the source of truth.

## Attention: escalate only as far as attention has left

Agents run unattended. If one stops for approval while you are elsewhere, nothing tells you —
the renderer has **no notification code at all** today: no `Notification`, no `document.title`
mutation, no favicon change. The signals already exist on the websocket (`access-request`,
`presence`, `managed-agent.*`, `event_added`); only the surfacing is missing.

Four severities, four distances. A channel fires only when the quieter ones cannot reach you.

| Severity | Source | Looking at it | Elsewhere in app | Another tab | Away |
|---|---|---|---|---|---|
| **blocked** | `access-request` | inline only | badge · toast | + title · favicon | + OS |
| **broken** | presence `pane-dead`, `hook-not-installed` | inline only | badge · toast | + title · favicon | + OS |
| **done** | `event_added` → turn-end | inline only | badge | + title | + title |
| **ambient** | `managed-agent.spawned`, stale | inline only | badge | badge | badge |

Rules that follow:

- **Never interrupt about what is already on screen.** If the agent's screen is open, the
  approval renders inline and nothing else fires. A notification about visible content is the
  fastest way to teach someone to switch notifications off.
- **Blocked toasts do not auto-dismiss.** The agent is genuinely stopped until answered.
  Everything else clears itself after ~5s.
- **The badge is the floor and it is honest.** Every tier touches it, so one glance answers
  "is anything waiting?" — but it only turns `--hot` for blocked and broken.
- **Answer without navigating.** Allow / Deny live on the toast, same rule as the dashboard
  strip: handling an approval must not cost you your place.
- **OS notifications are opt-in and rare** — blocked and broken only, only when the browser is
  unfocused. Ask permission the first time an agent blocks, never on first launch.
- **No sound.** A tool left running all day cannot beep. If it is ever wanted it belongs in
  settings, defaulted off.

### Actionable notifications

Oran's ask: answer from the notification itself, the way a macOS chat notification lets you
reply — so an approval never costs you your focus. Adopted, within a real platform ceiling.

**Achievable:** action buttons via `ServiceWorkerRegistration.showNotification({actions})`,
handled in `notificationclick`, which POSTs to the kernel **without focusing the app**.
`Notification.maxActions` is **2** on macOS, so every notification is designed for two.

**Not achievable:** typing a reply. Chrome's inline reply sits behind the Experimental Web
Platform Features flag, and on macOS the notification centre allows only one inflexible
"Reply" button. It is a native capability, not a web one. A **Tauri wrapper** would unlock it
— and, more valuably, a menu-bar presence. Not decided.

**The app has no service worker.** Adding one is a prerequisite, and it interacts with
`staleChunkReload.ts`, which exists because chunk staleness has bitten before.

The governing rule: **the safe action is always inline; the nuanced one opens the app.**

| Case | Actions | Rationale |
|---|---|---|
| Routine approval | `Allow once` · `Deny` | both resolve inline; an `access-response` event records the decision |
| **Destructive command** | `Review` · `Deny` | **no inline Allow.** One-tap approval on a half-read notification is how `rm -rf` gets approved |
| More than two answers | `Choose…` · `Not now` | `suggestions[]` can be any length; rather than truncate a choice, say there is one and go there |
| Agent broke | `Restart` · `Open` | Open lands on the **Terminal** tab — a dead pane's feed has orphaned events and no conclusion |
| Three at once | `Open F-Mark` · `Later` | collapse after the second; three popups is how a tool gets muted |

Further rules:

- **Always show the actual command**, in mono, in the body. "Wants to run a command" trains
  people to approve blind.
- **Deny is always inline**, including in the destructive case — it is the safe outcome, so it
  never costs a context switch.
- **Never decide on the user's behalf.** "Not now" dismisses the popup and leaves the agent
  blocked; a dismissed notification must never read as an answer.

## Starting work

### Where these surfaces live

Neither spawn nor new-session is a destination. Both are **modals over the screen you were
already on**, because both are short, have a clear end, and are always performed *into*
something — and the thing you most want visible while choosing a permission mode is the work
that agent is about to touch.

| Surface | Placement | Opened from |
|---|---|---|
| Spawn an agent | modal over the session, route `/session/:id/spawn` | rail Agents panel · dashboard Agents panel · the new-session flow |
| New session | modal, route `/session/new` | dashboard `+ New session` · rail · ⌘K |
| First run | **full screen**, no modal | first launch only — there is no session behind it to preserve |

Both modals carry a route so `Escape` and the browser back button close them and a reload does
not strand you in a half-open dialog. The route exists for the back button, not because anyone
will share the link.

### Spawning an agent — and the coupling nobody sees

A card per runtime (`claude` · `codex` · `opencode`), shaped by `ProviderCardModel`: status
(`ready` | `missing`), permission mode, model, effort.

**The permission mode is the most consequential control in the product, and it does not look
like it.** `RUNTIME_ACCESS_MODE_OPTIONS` marks three modes `dangerous: true` —
`claude/dontAsk`, `claude/bypassPermissions`, `opencode/dangerously-skip-permissions` — plus
`codex/never`. Choosing one **silently disables the entire approval and notification system**:
no access-requests, so no cards, no toasts, no OS notifications. The agent edits and runs
commands unattended and you find out afterwards, from the log.

So the launcher states the consequence in plain language at the moment of choosing, rather
than labelling it "Bypass permissions" and hoping:

> **This agent will never ask you.** No approval cards, no notifications — it edits and runs
> commands on its own. You'll only see what it did afterwards, in the log.

Rules:

- `dangerous` modes render in `--hot` in the menu **and** keep the selector in `--hot`
  afterwards, so a running agent's card shows how it was launched.
- `deprecated` modes (`codex/on-failure`) are tagged, not hidden — hiding them makes a saved
  config look corrupted when it reappears.
- A `missing` runtime shows an install path and **no configuration selectors**. Offering
  model and effort pickers for a CLI that isn't installed is a form of lying.
- F-Mark drives the CLI you already have; it does not bundle one. The empty state says so.

### First run

The real onboarding is six steps (`folder · profile · providers · theme · todos · agent`).
Two no longer earn one: **theme** was meaningful at 17 themes and is now 3, and **todos** asks
you to plan work before any exists. Proposed: **folder → you → runtimes → first agent**,
ending with something running rather than a settings summary.

Folder is first because the session *is* the folder — there is no database. Everything after
it then has somewhere to write, and the profile becomes a real participant in a real event
log instead of a preference.

### New session

Name only. It becomes the folder name and the URL. Optionally start with an agent.

No description, no template, no visibility setting: a session earns its meaning from what gets
written into it, and asking for a description up front asks you to summarise work you have not
done yet.

## When things break

**The worst failure in this product is a silent one.** The websocket already reconnects and
calls `backfillCurrentView()` on reconnect — but its connection state **never reaches a
component**. So when the kernel dies, the app looks perfectly healthy and quietly stops
updating. For a tool whose job is watching agents work, silence reads as *"nothing is
happening"* when it actually means *"I can't see anything."*

Four tiers. The tier decides where it appears and whether it can be dismissed — not how
alarming the wording is.

| Tier | Means | Appears | Dismissible | Examples |
|---|---|---|---|---|
| **Blind** | you are not seeing reality | top bar, above everything | **no** | connection lost · kernel gone |
| **Degraded** | part works, part doesn't | banner in the affected surface | yes | tmux too old · hook not installed |
| **Contained** | one panel died, the app is fine | in place of that panel | yes | a panel threw |
| **Benign** | nothing is wrong yet | toast | yes | newer build available |

Rules:

- **Say what you can't see, not just that something failed.** "Not connected" is half the
  message; "you are not seeing new events, the feed is frozen at 14:05" is the whole one.
- **Blind states are not dismissible.** You can dismiss a warning about a broken thing; you
  cannot dismiss the fact that the app is blind — dismissing would restore the healthy-looking
  lie that is the original bug.
- **Presence becomes `unknown`, never `offline`.** With the socket down, every dot goes grey
  and reads *last known*. Showing agents online is a lie; showing them offline is a different
  lie.
- **Say what is still true.** Agents keep running in tmux when the server stops — say so, or a
  dead window looks like dead work.
- **Freeze honestly.** The feed keeps its content, striped and stamped *frozen at 14:05*.
  Blanking it discards readable history for nothing.
- **Every panel needs an error boundary.** Only `FileViewerErrorBoundary` and `LazyBoundary`
  exist today, so a throw in the feed takes the whole app white.
- **Give the command and let it be copied.** `brew install tmux`,
  `f-mark hook install claude`. `EnvProbeBanner` already does this well — keep it.

## Tooltips

F-Mark has a lot of private vocabulary — `Named`, `Anchor`, `Supersede`, `Compact`, `Fork`,
`Effort`, `Arbitrary group` — and none of it is guessable. Every one of those needs a
definition somewhere, and a tooltip is the cheapest place to put it.

**But not on every control.** A tooltip on `Send` reading "sends the message" teaches people
to stop reading tooltips, and then the one on `Bypass permissions` goes unread too. Three
tiers:

| Tier | Rule | Examples |
|---|---|---|
| **A — none** | the label is the whole story | Send · Cancel · Create session · Deny |
| **B — required** | icon-only, private vocabulary, or a non-obvious effect. Most of the app. | ⌘K · ⚙ · Compact · Clear · Named · Anchor · ⟲ revised · effort |
| **C — inline, not hover** | consequences you must not be able to miss | Bypass permissions · Do not ask · Remove agent · Revert hunk |

Tier C is the important one: **a hover you might not perform is not a warning.** Those get
visible text at the point of decision — the tooltip is a bonus, never the only telling.

**Content formula:** line 1 = what it does · line 2 = what happens, or when to use it ·
line 3 (optional) = the caveat or shortcut. Three lines maximum; past that it is
documentation and belongs in the panel's empty state or settings.

Say the **consequence, not the mechanism** — for `Clear`, what people actually fear is losing
work, so the second line is "the session log is untouched, only the agent forgets."

**Behaviour:**

- **Focus shows instantly; hover waits 600ms.** Tabbing is deliberate, dragging a mouse across
  a dense rail is not.
- **Warm period of 1.5s** — after the first tooltip, neighbours appear instantly, so comparing
  two controls does not cost a second each.
- `Escape` dismisses, scrolling dismisses, blur dismisses. A tooltip that outlives its trigger
  is a bug, and a stuck one over a dense rail is worse than none.
- Flips above the trigger and clamps to the viewport rather than overflowing.
- Destructive controls use the `--hot` tooltip variant, matching their inline treatment.

## Destructive actions

Today this is **`window.confirm()`** at seven call sites (`RightAgentControls`,
`AgentPopover`, `useSessionDelete`, `settings/agents`, `useProjectPromotion`). A native OS
dialog that cannot show counts, cannot be styled, blocks the thread, and reads like a browser
error rather than a decision about your work. The `Clear` and `Remove` strings are
**duplicated** between `RightAgentControls` and `AgentPopover`, so they can drift — and the
copy you did not update is the one someone reads.

**The insight that shapes all of it: F-Mark is append-only, so most "destructive" actions
destroy nothing.** The dialog's job is usually to *reassure accurately*, not to frighten. Of
the five real actions, exactly one loses data.

| Tier | Means | Friction | Actions |
|---|---|---|---|
| **1** | nothing is lost from the log | one-click confirm · scrim click cancels | Clear context · Remove agent |
| **2** | something outside the log is lost | confirm + explicit list of what goes · undo where possible | Revert hunk · Kill terminal |
| **3** | real, permanent data loss | **type the name** · scrim click does **not** cancel | Delete session |

Every dialog shows a two-part ledger — **what survives** in `--ok`, **what is lost** in
`--hot` — with counts, because numbers are what make stakes real:

- *Clear*: "Everything in the log stays. All 41 events remain on disk."
- *Remove agent*: "Its 23 events stay in the log permanently."
- *Delete session*: "All 96 events, permanently. 2 agents lose their history."

Rules:

- **Say what survives, not just what dies.** For an append-only system that is both more
  useful and more honest than a warning triangle.
- **Friction matches the loss.** Making `Clear` as hard as `Delete` teaches people to click
  through both.
- **Only tier 3 traps the scrim.** Clicking outside cancels tiers 1–2; for a permanent delete
  an accidental outside click must not be a decision in either direction. `Escape` always
  cancels.
- **Undo only where the action allows it.** Revert gets a 6-second undo because the edits can
  be re-applied; delete gets none, because nothing can restore the folder and a fake undo is
  worse than no undo.
- **One dialog component, one copy source.**

**Gap found:** `killTerminal` in `RegularTerminals.tsx` has **no confirmation at all** — it
kills the tmux session directly, taking any running build or test with it.

**Where the dialog appears.** Always a modal over the screen you were on, triggered from a
control — never navigated to:

| Action | Triggered from |
|---|---|
| Clear context · Remove agent | agent row `⋯` in the rail · the agent screen's drive bar |
| Kill terminal | terminal row `⋯` |
| Revert hunk | Diff tree footer · a hunk's `⋯` |
| Delete session | session row `⋯` |

**Task modals get routes; confirmations do not.** Spawn and New session are things you are
*doing*, so they carry a URL and survive a reload. A confirmation is a *question about an
action you just took* — reloading mid-delete should cancel it, not restore it. Anything that
would resume a destructive prompt across a page load is a bug.

## The navigation contract

**An action button inside a navigable row acts in place. It never navigates.**

Check `data-act` before `data-nav` in the delegated handler. Without this, approving a
`Bash` call throws you out of the dashboard — which defeats the entire point of approving
from the dashboard. It is a one-line bug that nobody catches in review, so it is written
down here.

Destinations, one per gesture, no menus:

| Gesture | Destination |
|---|---|
| Session card | that session's feed |
| Agent row body | its session, **anchored to that agent's latest event** |
| Agent `▤` button | its **terminal pane** — for a dead pane the chat has no story, the pane does |
| Recent row | the session, **anchored to that event** |
| Blocked row body | that session |
| Blocked row buttons | act in place; stay on the dashboard |

Arrival is confirmed by a ~2.4s highlight on the anchored event. Landing somewhere with no
signal is indistinguishable from landing in the wrong place.

**Open decision — routing.** The renderer keeps the active session in store state
(`currentSessionId`, `state/sessionPersistence.ts`), not the URL; only `/file-tree` and a
`path_id` query param exist today. So the way home has to be *drawn*: a breadcrumb plus
`Escape`. That works, but there is no browser back and **no shareable link to a session** —
which hurts most in exactly the case the dashboard exists for: wanting to point someone at
a blocked agent. Recommendation: add routing. Not yet approved.

## Component kit

Sixteen components carry every screen. Assemble from these before proposing a seventeenth:

`panel/glass` · `panel/solid` · `btn primary` · `btn ghost` · `btn danger` ·
`avatar + presence` · `agent chip` · `state pill` · `tool chip` · `count badge` ·
`session card` · `sparkline` · `timeline row` · `filter chip` · `empty state` ·
`project switcher`

Presence has six states in `presence/tracker.ts` and each needs a distinct visual:
`launching` (pulsing `--ac-2`) · `online` (`--ok`) · `stale` (`--warn`) · `offline`
(`--idle`) · `pane-dead` (`--hot`) · `hook-not-installed` (`--hot`, outlined).

## Quality floor

Non-negotiable on every surface:

- `:focus-visible` ring is **instant** — a ring that fades in cannot be followed while tabbing
- `:active` and `:disabled` styled; `not-allowed` cursor on disabled
- `prefers-reduced-motion` kills animation **and** the mesh drift
- no horizontal scroll 320–1920px; `overflow-x: clip`, never `hidden` — this repo has
  11 `position: sticky` rules across 5 files and `hidden` would trap every one
- WCAG AA on all text, measured
- minimum 10.5px type — the 9.5px metadata line in the lab is **debt to fix on implementation**

## What this replaced

**Ledger** (light, cool paper + ledger green, IBM Plex) — the previous direction on this
branch. It fixed the structural problems and was twice rejected as visually flat. Its
durable parts survive here: the one-meaning rule, the measured-contrast discipline and its
guard test, `overflow-x: clip`, and the interaction baseline.

Before Ledger: 17 themes × 3 densities × ~23 fonts × 12 dockable panes × 5 drop areas ×
36 guillotine layouts. That was not a design — it was a configuration space, with every
decision deferred to the user. Aurora keeps three themes and one opinion.

Do not spend a free axis on the AI-default clusters: warm-cream + serif + terracotta;
near-black + acid green; broadsheet hairline newspaper columns.

## Still open

- **Aurora-light** — not designed. Dark is the default; light is the alternate and needs
  its own measured palette, not an inversion.
- **Routing** — see the navigation contract.
- **The session feed** — ~40 card types in `cards/`, the densest surface in the app and
  where most time is spent. Only minimally mocked so far.
- **Density** — the app ships three densities. Whether Aurora keeps all three is undecided.
