import { TopBarBrand } from "../shell/topBar/TopBarBrand.js";
import {
  ARCHITECTURE_CANDIDATES,
  FILE_WORKSPACE_MITIGATIONS,
  REVIEW_COUNTS,
  REVIEW_FINDINGS,
  REVIEW_PRIORITIES,
  type ArchitectureCandidate,
  type FileWorkspaceMitigation,
  type ReviewFinding,
  type ReviewPriority,
} from "./reviewStateData.js";
import "./reviewStatePage.css";

const PRIORITY_COPY: Record<
  ReviewPriority,
  { label: string; description: string }
> = {
  [REVIEW_PRIORITIES.p1]: {
    label: "Primary flow failures",
    description:
      "Can lose data, operate in the wrong root or session, or break a primary interaction.",
  },
  [REVIEW_PRIORITIES.p2]: {
    label: "Secondary flow weaknesses",
    description:
      "Break under concurrency, partial failure, restart, or long-running use.",
  },
  [REVIEW_PRIORITIES.p3]: {
    label: "Systemic weak spots",
    description:
      "Verification, contract, error-state, and maintainability gaps that make future failures easier.",
  },
};

const FLOW_STEPS = [
  { label: "Protocol", detail: "Agent guidance and event semantics" },
  { label: "Lifecycle", detail: "Turn, agent, stop, and restart state" },
  { label: "Event log", detail: "Append, projection, cursor, and fork" },
  { label: "Renderer", detail: "Selection, cache, files, and commits" },
  { label: "Operator", detail: "What the person sees and trusts" },
] as const;

function ReviewTopBar(): JSX.Element {
  return (
    <header className="topbar review-state-topbar">
      <TopBarBrand />
      <div className="breadcrumb review-state-breadcrumb" aria-label="Location">
        <span className="proj">dev</span>
        <span className="sep">/</span>
        <span className="sess">review-state</span>
      </div>
      <a className="review-state-back" href="/">
        <span aria-hidden="true">←</span>
        Back to app
      </a>
    </header>
  );
}

function ReviewIndex(): JSX.Element {
  return (
    <aside className="review-state-index">
      <div className="review-state-index-inner">
        <p className="review-state-index-label">Review index</p>
        <nav aria-label="Review sections">
          <a href="#summary">Summary</a>
          <a href="#flow-map">Flow map</a>
          <a href="#file-plan">
            File plan <span>{REVIEW_COUNTS.fileMitigations}</span>
          </a>
          <a href="#findings-p1">
            P1 findings <span>{REVIEW_COUNTS.p1}</span>
          </a>
          <a href="#findings-p2">
            P2 findings <span>{REVIEW_COUNTS.p2}</span>
          </a>
          <a href="#findings-p3">
            P3 findings <span>{REVIEW_COUNTS.p3}</span>
          </a>
          <a href="#architecture">
            Architecture <span>{REVIEW_COUNTS.candidates}</span>
          </a>
          <a href="#verification">Verification</a>
        </nav>
        <div className="review-state-index-note">
          <span className="review-state-scope-dot" aria-hidden="true" />
          Security deliberately excluded
        </div>
      </div>
    </aside>
  );
}

function FileMitigationRow({
  mitigation,
}: {
  mitigation: FileWorkspaceMitigation;
}): JSX.Element {
  return (
    <article className="review-state-file-mitigation" id={mitigation.id}>
      <div className="review-state-file-mitigation-rank">{mitigation.rank}</div>
      <div className="review-state-file-mitigation-body">
        <h3>{mitigation.title}</h3>
        <div className="review-state-file-mitigation-copy">
          <p>
            <strong>Issue</strong>
            {mitigation.issue}
          </p>
          <p>
            <strong>Mitigation</strong>
            {mitigation.mitigation}
          </p>
        </div>
        <div className="review-state-file-acceptance">
          <strong>Acceptance</strong>
          <ul>
            {mitigation.acceptance.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="review-state-candidate-files">
          {mitigation.files.map((file) => (
            <code key={file}>{file}</code>
          ))}
        </div>
      </div>
    </article>
  );
}

function FileWorkspacePlan(): JSX.Element {
  return (
    <section className="review-state-section" id="file-plan">
      <div className="review-state-section-head">
        <p className="review-state-kicker">File workspace mitigation plan</p>
        <h2>Make files progressive, warm, and discussable</h2>
        <p>
          Diff and tree work should begin before their tabs are selected, reuse
          root-scoped projections across sessions, and refresh incrementally.
          Monaco comments must complete the same chat-to-source round trip as
          comments on rendered prose.
        </p>
      </div>
      <div className="review-state-file-plan-list">
        {FILE_WORKSPACE_MITIGATIONS.map((mitigation) => (
          <FileMitigationRow mitigation={mitigation} key={mitigation.id} />
        ))}
      </div>
    </section>
  );
}

function MetricStrip(): JSX.Element {
  return (
    <dl className="review-state-metrics" aria-label="Audit totals">
      <div className="is-primary">
        <dt>P1 failures</dt>
        <dd>{REVIEW_COUNTS.p1}</dd>
      </div>
      <div>
        <dt>Confirmed findings</dt>
        <dd>{REVIEW_COUNTS.all}</dd>
      </div>
      <div>
        <dt>Tests passed</dt>
        <dd>{REVIEW_COUNTS.tests.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Deepening candidates</dt>
        <dd>{REVIEW_COUNTS.candidates}</dd>
      </div>
    </dl>
  );
}

function FlowMap(): JSX.Element {
  return (
    <section className="review-state-section" id="flow-map">
      <div className="review-state-section-head">
        <p className="review-state-kicker">Intended flow</p>
        <h2>Four identities cross every important seam</h2>
        <p>
          Root, session, participant, and turn identity are reconstructed in
          different places. Most confirmed failures occur where one of them is
          replaced by global state, receive order, or a bare id.
        </p>
      </div>
      <ol className="review-state-flow" aria-label="Intended product flow">
        {FLOW_STEPS.map((step, index) => (
          <li key={step.label}>
            <span className="review-state-flow-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </span>
          </li>
        ))}
      </ol>
      <p className="review-state-flow-caption">
        Intended: scoped action → committed event → lifecycle transition →
        invalidation → scoped projection.
      </p>
    </section>
  );
}

function FindingRow({ finding, index }: { finding: ReviewFinding; index: number }) {
  return (
    <details className="review-state-finding" id={finding.id}>
      <summary>
        <span className="review-state-finding-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="review-state-priority" data-priority={finding.priority}>
          {finding.priority}
        </span>
        <span className="review-state-finding-title">
          <small>{finding.area}</small>
          <strong>{finding.title}</strong>
        </span>
        <span className="review-state-disclosure" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="review-state-finding-detail">
        <p>{finding.summary}</p>
        <div className="review-state-evidence" aria-label="Evidence paths">
          {finding.evidence.map((evidence) => (
            <code key={`${evidence.path}:${evidence.lines}`}>
              {evidence.path}:{evidence.lines}
            </code>
          ))}
        </div>
      </div>
    </details>
  );
}

function FindingSection({
  priority,
  startIndex,
}: {
  priority: ReviewPriority;
  startIndex: number;
}): JSX.Element {
  const findings = REVIEW_FINDINGS.filter(
    (finding) => finding.priority === priority,
  );
  const copy = PRIORITY_COPY[priority];

  return (
    <section
      className="review-state-section review-state-findings"
      id={`findings-${priority.toLowerCase()}`}
    >
      <div className="review-state-section-head review-state-findings-head">
        <div>
          <p className="review-state-kicker">{priority}</p>
          <h2>{copy.label}</h2>
          <p>{copy.description}</p>
        </div>
        <span className="review-state-section-count">{findings.length}</span>
      </div>
      <div className="review-state-finding-list">
        {findings.map((finding, index) => (
          <FindingRow
            finding={finding}
            index={startIndex + index}
            key={finding.id}
          />
        ))}
      </div>
    </section>
  );
}

function CandidateRow({
  candidate,
  featured = false,
}: {
  candidate: ArchitectureCandidate;
  featured?: boolean;
}): JSX.Element {
  return (
    <article
      className={`review-state-candidate${featured ? " is-featured" : ""}`}
      id={candidate.id}
    >
      <div className="review-state-candidate-rank">{candidate.rank}</div>
      <div className="review-state-candidate-body">
        <div className="review-state-candidate-title">
          <h3>{candidate.title}</h3>
          <span>{candidate.strength}</span>
        </div>
        <div className="review-state-candidate-copy">
          <p>
            <strong>Problem</strong>
            {candidate.problem}
          </p>
          <p>
            <strong>Direction</strong>
            {candidate.direction}
          </p>
          <p>
            <strong>Leverage</strong>
            {candidate.benefits}
          </p>
        </div>
        <div className="review-state-candidate-files">
          {candidate.files.map((file) => (
            <code key={file}>{file}</code>
          ))}
        </div>
      </div>
    </article>
  );
}

function ArchitectureSection(): JSX.Element {
  return (
    <section className="review-state-section" id="architecture">
      <div className="review-state-section-head">
        <p className="review-state-kicker">Architecture candidates</p>
        <h2>Move invariants behind a few deeper modules</h2>
        <p>
          These are ranked directions, not concrete interface designs. The
          turn-lifecycle module is the recommended first repair slice.
        </p>
      </div>
      <div className="review-state-candidates">
        {ARCHITECTURE_CANDIDATES.map((candidate, index) => (
          <CandidateRow
            candidate={candidate}
            featured={index === 0}
            key={candidate.id}
          />
        ))}
      </div>
    </section>
  );
}

function VerificationSection(): JSX.Element {
  return (
    <section className="review-state-section" id="verification">
      <div className="review-state-section-head">
        <p className="review-state-kicker">Verification</p>
        <h2>Green locally, incomplete across seams</h2>
        <p>
          The repository is not generally broken. The risk lives between
          locally tested implementations: concurrency, stale responses,
          background roots, restart, and partial commits.
        </p>
      </div>
      <div className="review-state-verification">
        <ul>
          <li>
            <span aria-hidden="true">✓</span> Kernel: 1,188 tests passed
          </li>
          <li>
            <span aria-hidden="true">✓</span> Renderer: 1,121 tests passed
          </li>
          <li>
            <span aria-hidden="true">✓</span> Shared, kernel, and renderer
            TypeScript checks passed
          </li>
          <li>
            <span aria-hidden="true">✓</span> Worktree was clean throughout
            the review
          </li>
        </ul>
        <div>
          <strong>Acceptance gap</strong>
          <p>
            The kernel CI filter is a successful no-op, and the default “real
            UI” suite mocks the complete backend. Neither gate crosses the
            renderer → REST/WebSocket → file-state seam.
          </p>
        </div>
      </div>
    </section>
  );
}

export function ReviewStatePage(): JSX.Element {
  return (
    <div className="review-state-page">
      <ReviewTopBar />
      <div className="review-state-layout">
        <ReviewIndex />
        <main className="review-state-main">
          <section className="review-state-hero" id="summary">
            <p className="review-state-kicker">Repository review · 10 July 2026</p>
            <h1>Review state</h1>
            <p className="review-state-hero-lead">
              F-Mark is feature-rich, but its core state seams are shallower
              than the flows they coordinate.
            </p>
            <p className="review-state-hero-meta">
              Branch <code>feat/within-files</code> · <code>0b53c36</code> ·
              intended flows only
            </p>
            <MetricStrip />
          </section>

          <section className="review-state-recommendation" aria-labelledby="top-recommendation">
            <div>
              <p className="review-state-kicker">Top recommendation</p>
              <h2 id="top-recommendation">
                Deepen the turn-lifecycle module first.
              </h2>
            </div>
            <p>
              It controls whether “working,” “stopped,” and “done” can be
              trusted. One owner for closure, attribution, transition ordering,
              and publication recovery has the highest leverage across the
              current failure set.
            </p>
          </section>

          <FlowMap />
          <FileWorkspacePlan />
          <FindingSection priority={REVIEW_PRIORITIES.p1} startIndex={0} />
          <FindingSection
            priority={REVIEW_PRIORITIES.p2}
            startIndex={REVIEW_COUNTS.p1}
          />
          <FindingSection
            priority={REVIEW_PRIORITIES.p3}
            startIndex={REVIEW_COUNTS.p1 + REVIEW_COUNTS.p2}
          />
          <ArchitectureSection />
          <VerificationSection />
          <footer className="review-state-footer">
            <span>Security review intentionally out of scope.</span>
            <a href="#summary">Back to top ↑</a>
          </footer>
        </main>
      </div>
    </div>
  );
}
