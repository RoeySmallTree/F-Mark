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
