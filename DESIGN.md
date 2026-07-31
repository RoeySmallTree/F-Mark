---
name: Ledger
subject: F-Mark — an append-only event-log workspace where a developer collaborates with AI coding agents
reference: Stripe Docs restraint × a bound accounting ledger
tokens:
  surface:
    paper: "#f7f8f7"        # the sheet
    paper-band: "#eff4f0"   # greenbar band, alternating by turn
    paper-sunk: "#edf0ee"   # inputs, wells, outer chrome
    panel: "#f1f4f2"
    panel-hover: "#e7ece9"
  ink:
    ink: "#141a16"          # 16.59:1 — primary
    ink-2: "#46514a"        #  7.78:1 — secondary
    ink-3: "#647069"        #  4.85:1 — meta. Lightest AA text.
    ink-4: "#9aa69e"        #  2.37:1 — BELOW AA. Known debt, see note.
  rule:
    rule: "#dde3de"
    rule-strong: "#c2cbc4"
  accent:
    ledger: "#0e6b45"       # 6.15:1 — the ONE accent
    ledger-tint: "#e0efe7"
  signal:
    alarm: "#a32a20"        # 6.78:1 — destruction and error only
  type:
    sans: "IBM Plex Sans"
    mono: "IBM Plex Mono"
    serif: null             # deliberately none
  scale:
    micro: 10.5px           # mono, uppercase, +0.09em — gutter labels
    meta: 11.5px            # mono — timestamps, durations
    ui: 13px                # sans — controls, list rows
    body: 14.5px            # sans, 1.62 — entry prose
    title: 16px             # sans 600
    lead: 20px              # sans 600, -0.02em
  geometry:
    radius: 3px
    radius-lg: 5px
    border-w: 1px
    gutter-w: 56px
  motion:
    instant: 90ms
    fast: 140ms
    base: 190ms
    slow: 280ms
    easing: decelerate-only
themes: [day, night, contrast]
---

# Ledger

## The thesis

F-Mark's state is an append-only event log. Nothing is deleted; entries are
**superseded**. So the interface is a ruled ledger sheet, and the design is
grounded in that model rather than in a generic "AI chat app" shape.

## The one rule

**Every visual channel carries exactly one meaning.**

| Channel | Means | Never means |
|---|---|---|
| ink weight | hierarchy — what to read first | state |
| ledger green | agent authorship, live agent activity | emphasis, branding, success-in-general |
| alarm red | destruction, error | warning, attention |
| the rule (hairline) | structure | decoration |

This is the load-bearing constraint. It is what keeps a dense workspace calm,
and it is testable: if you are reaching for a colour to make something stand
out, you are about to break it. Use ink weight or a rule.

The rule earns its keep. It immediately caught the runtime-warning banner
drawing itself in `--agent-tint` — a warning in the agent colour — which was
invisible as a problem until the channels had meanings.

## Authorship

Human = ink. Agent = ledger green. **Shape carries it too**: the entry mark is
a square for a person and a circle for an agent, so authorship survives for
anyone who cannot separate the two hues.

## Structure, not boxes

A ledger is organised by ruled lines. Elevation is a rule, not a blur — the two
shadow tokens survive only for genuinely floating surfaces (popovers, dialogs)
and stay hairline-led even there. Corners are near-square (3px); printed rules
do not have soft corners.

The **entry gutter** is the one structural device the feed aligns to: a
hairline rule down the entry with a single solid authorship mark at its head.

## Type

IBM Plex Sans + IBM Plex Mono — one family, drawn for technical documentation,
with a true mono sibling. Mono carries data and labels; sans carries prose and
controls. `--serif` resolves to the sans: the direction has no use for a third
voice, and leaving the token undefined would invite one back.

## Contrast is measured, never estimated

Every ratio in `themes/tokens.css` is recorded beside its value and
**verified by `tests/token-contrast.test.ts`**, which recomputes each one from
the file and fails on drift. This exists because the first revision carried
eyeballed numbers: nine of fourteen were wrong and one hid a real AA failure on
text that was already shipping.

**Known debt:** `--ink-4` is 2.37:1 and does not meet AA, yet 214 call sites set
it as `color:` on text. It is unchanged because ~60 further sites use it as a
border colour, where darkening would visibly thicken the whole chrome.
Splitting the two roles is the fix. Do not add new text uses.

## Themes

Three, each contrast-checked: **day** (default, no body class), **night**,
**contrast** (AAA for body text). Seventeen themes meant none could be held to
a standard. Retired names resolve through an alias map so returning users land
on the nearest survivor rather than being reset.

## What this replaced

Warm cream `#f4efe6` + Source Serif 4 + terracotta `#b86a1f` — which is the most
common AI-generated palette in existence, and read as generic because it was.
Do not spend a free axis on: warm-cream + serif + terracotta; near-black + acid
green; or broadsheet hairline newspaper columns.
