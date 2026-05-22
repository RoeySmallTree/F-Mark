/* Session templates — picked in NewSessionModal. Each non-blank template
   produces a starter named-prose event posted as the first contribution
   after session creation. */

export type TemplateKey = "blank" | "planning" | "research" | "codereview";

export interface TemplateStarter {
  name: string;
  body: string;
}

export interface Template {
  key: TemplateKey;
  name: string;
  description: string;
  icon: string;
  starter: TemplateStarter | null;
}

const PLANNING_BODY = `# Goals

- _What does success look like for this session?_
- _Concrete deliverable(s)._
- _Owner / accountable participant._

# Constraints

- _Time / budget / scope._
- _Technical or external limits._
- _Decisions already made (do-not-revisit)._

# Open questions

- [ ] _Question 1 — what we need to clarify before we can move._
- [ ] _Question 2._
- [ ] _Question 3._

# Plan

1. _First step._
2. _Second step._
3. _Third step — checkpoint here before moving on._
`;

const RESEARCH_BODY = `# Hypotheses

- _Hypothesis A — what we think is true; what would disprove it._
- _Hypothesis B._
- _Hypothesis C._

# Sources

- _Primary source 1 — URL / citation._
- _Primary source 2._
- _Secondary / background reading._

# Notes

- _Observation 1 — surprising or confirming?_
- _Observation 2._
- _Open thread — what to investigate next._

# Synthesis

_To be written once enough sources have been gathered._
`;

const CODEREVIEW_BODY = `# Diff to review

_Paste the PR URL, branch name, or a summary of the change set under review._

\`\`\`diff
// Paste / attach the diff here, or link the patch.
\`\`\`

# Concerns

- _Correctness — does it do what it claims?_
- _Edge cases / failure modes — what isn't covered?_
- _Performance / security / observability._
- _Style / readability / dead code._

# Decisions

- [ ] _Decision 1 — approve / request changes / block._
- [ ] _Decision 2 — what to follow up on after merge._
`;

export const TEMPLATES: Template[] = [
  {
    key: "blank",
    name: "Blank",
    description: "Empty session. You write the first message.",
    icon: "·",
    starter: null,
  },
  {
    key: "planning",
    name: "Planning session",
    description:
      'Starts with a "Goals / Constraints / Open questions" outline you can fill in together.',
    icon: "◇",
    starter: { name: "Goals & constraints", body: PLANNING_BODY },
  },
  {
    key: "research",
    name: "Research session",
    description:
      'Starts with a "Hypotheses / Sources / Notes" outline for tracking what you learn.',
    icon: "※",
    starter: { name: "Research notes", body: RESEARCH_BODY },
  },
  {
    key: "codereview",
    name: "Code review session",
    description:
      'Starts with a "Diff / Concerns / Decisions" outline so reviewers know what to scan for.',
    icon: "⌗",
    starter: { name: "Code review", body: CODEREVIEW_BODY },
  },
];

export function templateByKey(key: TemplateKey): Template {
  const t = TEMPLATES.find((tpl) => tpl.key === key);
  if (t === undefined) throw new Error(`Unknown template: ${key}`);
  return t;
}
