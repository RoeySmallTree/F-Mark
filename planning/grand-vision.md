The Grand Vision
The core thesis (worth restating cleanly)
The unit of human-AI collaboration is not a message. It is a document. A document is something both parties can edit, annotate, navigate, reorganize, version, branch, and share. A message is a frozen artifact that disappears upstream the moment it's sent. F-Mark replaces the chat metaphor entirely: there is no chat, there is only a living document that the human and one or more agents co-author, with rich interactive elements embedded directly in the prose.
The agent doesn't "respond." The agent contributes to the document. The human doesn't "send a message." The human edits, annotates, or directs the document. The interface is the document. The history is the document. The shareable artifact is the document.
What the user experiences
Opening F-Mark feels like opening a notebook, not a chat app. They run one command in any folder and a browser tab opens showing whatever document state exists there. If the folder is empty, there's a clean starting document with a prompt to describe what they want to work on. If the folder has prior sessions, they see the document tree on the left — sessions, sub-sessions, branches, snapshots.
The document is the canvas. It's rendered markdown but with a custom renderer that understands F-Mark's extended syntax. Headings, prose, code blocks, lists — all standard. But interspersed throughout are interactive elements that an agent created or that the human can create: selection widgets where the agent asks for input, multi-select for the human to pick from options, ranked priorities, sliders for parameters, embedded HTML previews of designs/mockups the agent generated, embedded diagrams, embedded files in the session folder rendered inline (images, PDFs, code), and threaded comments anchored to specific spans of text.
Comments are the conversational layer. When the human wants to interject without taking a full turn — clarify something, push back on a paragraph, ask a question about one specific sentence — they highlight that span and add a comment. The agent sees comments on its next turn and either replies inline, edits the document in response, or both. Comments thread (replies, resolved/unresolved state). They have the format (@User::ISO::"text") or (@AgentName::ISO::"text") in the raw file but render as proper sidebar threads in the UI. Comments are first-class: searchable, filterable, exportable.
Turns are explicit but flexible. There's a clear "agent's turn" vs "human's turn" model — only one party writes at a time, no merge conflicts. The human ends their turn with a submit button (which can be configured to auto-submit on certain triggers, like clicking a widget option). The agent ends its turn by declaring it done, at which point all its writes are committed atomically and the human can review. Mid-turn, the human can see the agent's writes streaming in real-time but can't interfere. Mid-turn, the human's edits queue up and apply after the agent finishes. This is hard turns done right.
The agent operates through a typed local API. It doesn't free-form write whatever — it has structured calls for every kind of contribution. Append prose to a section. Create a selection widget. Update a section in-place. Add a comment. Generate an HTML preview file and embed it. Create a sub-session for parallel exploration. Resolve a comment. The API is the agent's grammar of action, and the document is always in a valid, renderable state.
Skills are how agents learn what F-Mark can do. A skill is a markdown file plus optional code that explains a domain or workflow to the agent. The agent loads relevant skills based on the session context. There's a f-mark.md core skill that teaches the API; everything else is composable. Skills can ship widgets, templates, presets, and prompt fragments. The community publishes skills; users install them with one command.
Sessions are folders, fractally. A session is a folder. It can contain a main document, supporting files (images, code, HTML previews, references), sub-sessions (folders within), and snapshots (saved states). The folder structure is the data model — no database. Any session can be zipped, shared, version-controlled, opened in any editor outside F-Mark. The renderer just renders what's on disk.
Branching is native. Any point in a session can be branched. The human says "explore this alternative approach in a branch" and a sub-session is created with the parent's context. Both branches stay alive. The human can merge a branch back (the agent summarizes the branch into the parent document) or discard it. This is what makes document-based work fundamentally better than chat — you can explore multiple paths without losing your place.
Multi-agent is natural. Because the document is the source of truth, multiple agents can take turns on it. One agent drafts, another reviews via comments, a third generates a diagram. The human directs traffic. Each agent has an identity that shows up in comments and edits. Agent A's commit can trigger Agent B's invocation via hooks. This is where F-Mark intersects with CABAL conceptually — F-Mark is the IDE for multi-agent document collaboration.
Hooks are the automation layer. File changes can trigger arbitrary actions: invoke an agent, run a linter, generate a derivative file, sync to cloud, notify a teammate. Hooks are user-configurable in a .f-mark/hooks/ directory. The default install includes a hook for "when human ends turn, notify the configured agent."
Skills, presets, and templates. Presets are buttons in the UI that post pre-formatted prompts/comments — "generate variations," "create a phased plan," "write a counter-argument," "summarize so far." They're skill-defined and customizable. Templates are starter documents for common workflows — PRD writing, research synthesis, code review session, design exploration, market analysis. Both are community-publishable.
The renderer is rich. Inline rendering of: markdown prose with extensions, code with syntax highlighting and run-in-place for some languages, mathematical notation, mermaid diagrams, embedded HTML files in iframes (sandboxed), images and PDFs, audio/video preview, file tree of the session folder, related-session graph. The renderer is themable. The renderer has keyboard navigation that feels like a real editor (vim mode optional). The renderer has "focus mode" that hides everything except the current section.
Search is across all sessions. Every session, every comment, every widget, every file — searchable from a global palette. Semantic search if a local embedding model is configured; lexical otherwise. Finding "that session where I worked on X" is one keystroke.
Sync and sharing (the cloud layer). Sessions can sync to F-Mark Cloud for cross-device access. Any session can be shared with a public URL — recipients view the session in a web-based read-only renderer. Team workspaces allow multiple humans + agents working on shared session libraries. Permissions per session. Presence indicators (who's viewing/editing). This is the monetizable layer, eventually.
Export everywhere. Any session exports to plain markdown, HTML, PDF, or a portable F-Mark archive (zip with full fidelity). Documents are never trapped.
Privacy and trust. Local by default. No telemetry without opt-in. The user's agent keys never leave their machine. Open-source kernel means anyone can audit. Cloud features are opt-in per-session.
What the agent experiences
Bootstrap. When invoked in a session folder, the agent reads f-mark.md (the core skill), reads the current document, reads any session-specific instructions, reads installed skills relevant to the task. It now knows: what F-Mark is, what API endpoints exist, what the document currently says, what the human last asked, what tools and widgets are available.
Action. The agent decides on actions: prose contributions, structured contributions via API, comments in response to existing comments, file creations (images, HTML previews, references). Every action is atomic and visible to the human as it happens. The agent can think out loud in a designated "scratchpad" section the human can fold away.
Awareness. The agent knows its identity, the human's identity, other agents' identities, the session's history, the parent session if branched, the project context. It can query: "what comments are unresolved," "what selection widgets are pending answers," "what files are in the folder."
Conclusion. When done, the agent signals "turn complete." The system commits its writes, fires hooks, hands control to the human.
Resume. Coming back to a session, the agent doesn't need its entire context window stuffed with history. It reads the document, the comments, the relevant files. The document IS the memory.
What the ecosystem looks like
Open kernel. MIT-licensed npm package. Anyone can build a renderer against it. Anyone can build an agent integration. Anyone can build a hosted service on top.
Skills marketplace. Community-driven, hosted in a public repo. Skills for: code review, research synthesis, PRD writing, market analysis, creative writing, technical design, learning/tutoring, decision-making frameworks, specific tool integrations (Linear, GitHub, Notion via skill bridges).
Renderer ecosystem. Multiple renderers: the official web renderer (free, polished), terminal renderer (community), VS Code extension renderer (community), mobile renderer (eventually), embedded renderer for putting F-Mark sessions inside other tools.
Agent integrations. Official: Claude Code, Codex, Gemini CLI, OpenRouter. Community: anything that can read files and make HTTP calls. F-Mark doesn't ship an agent — it's agent-agnostic.
Hosted layer (commercial). Sync, share, teams, web viewing, managed key gateway. Open core stays free forever.
What this enables that chat cannot
A research session where you explore three competing hypotheses in three branches, see them all at once, then merge the winning insights into a synthesis document.
A PRD that you and an agent co-write over weeks, where every section has its own thread of comments, every decision is annotated with the reasoning, and every change is traceable.
A code review session where the agent annotates specific lines, you reply on specific lines, and the conversation lives next to the code.
A design exploration where the agent generates eight HTML mockups, embeds them all in a document with critique below each, and you and the agent collaboratively rank and refine them.
A learning session that builds a personal textbook on a topic — the agent writes sections, you ask questions in comments, the agent revises, and you end up with a document you can return to forever, not a chat log you'll never reread.
A multi-week project where the document grows from a one-line idea to a 50-page plan, with the entire reasoning history preserved, branched explorations preserved, decisions documented, and the final artifact ready to ship.
A team workspace where humans and agents collaborate on shared documents, with the same comment/turn/branch model scaled up.
The aesthetic and feeling
F-Mark feels quiet. Chat apps feel busy and demanding. F-Mark feels like a writing environment — Ulysses, iA Writer, Obsidian energy. Lots of whitespace, restrained typography, the document is the hero. Widgets feel native to the document, not pasted on. Comments feel like marginalia in a well-designed book. The agent's contributions feel like a collaborator's hand-writing, not a chatbot's output.
The phrase to hold in mind: "The document is the conversation. The conversation is the document."
Kernel (the engine)
Session management

Single command launches kernel in current folder
Auto-detect existing session vs initialize new one
Session folder structure: document.md, assets/, widgets/, branches/, snapshots/, comments/, .f-mark/config.json
Multiple documents per session (tabs)
Sub-sessions (folders within folders, navigable as nested workspaces)
Branching: create a branch from any point, branches are full sub-sessions with parent reference
Merging: agent-assisted merge of branch insights into parent document
Snapshots: manual or auto-saved point-in-time copies
Session metadata: title, tags, created/modified, participants, status
Session import/export as portable zip archive
Cross-session linking via [[session-id#anchor]] syntax

File system as data model

Everything is files, no database
File watcher detects external changes (user editing in another editor)
Conflict resolution when external + kernel writes collide
Lock files prevent simultaneous agent writes
Atomic multi-file commits via staging area

HTTP API (local, agent-facing)

GET /session — current state
GET /document — current document content
POST /document/append — append prose to end
POST /document/insert — insert at anchor
PATCH /document/section — replace section by heading
POST /widgets/select — create selection widget
POST /widgets/multi-select — multi-select widget
POST /widgets/rank — drag-to-rank widget
POST /widgets/slider — numeric slider
POST /widgets/options — visual options (with file references)
POST /widgets/form — multi-field form
POST /comments — add comment to span
POST /comments/reply — reply to thread
PATCH /comments/resolve — resolve thread
POST /files — add file to session assets
POST /embeds/html — register HTML file as inline embed
POST /embeds/diagram — create mermaid/graphviz embed
GET /comments?status=unresolved — query comments
GET /widgets?status=pending — query unanswered widgets
POST /turn/end — signal turn complete
POST /branches — create branch
POST /sub-sessions — create child session
POST /scratchpad — write to foldable thinking section
Webhooks: subscribe to file changes, turn events, comment events

Custom markdown syntax

Selection widget: -( ) option text / -(*) selected text
Multi-select: -[ ] option / -[x] selected
Comments: (@author::ISO-timestamp::"text"::thread-id)
HTML embeds: ![[file.html]] renders inline iframe
Image embeds: ![[file.png]] with sizing options
Cross-references: [[session#section]]
Agent attribution: <!-- by:claude-3.5 at:ISO -->
Section anchors: ## Heading {#anchor}
Foldable scratchpad: <details data-fm="scratchpad">...</details>
Status markers: > [!decision], > [!question], > [!todo], > [!blocked]
Slash commands: /preset-name inline

Turn model

Hard turn boundaries (one writer at a time)
Turn ownership tracked in .f-mark/state.json
Queue user edits during agent turn
Stream agent writes to renderer in real-time
Turn timeout configurable
Turn cancellation (mid-flight abort)
Turn history log (who wrote what when)
Multi-agent turn handoff (agent A finishes → agent B starts)

Hooks

.f-mark/hooks/ directory with executable scripts
Lifecycle events: pre-turn, post-turn, on-comment, on-widget-answer, on-branch, on-merge, on-file-change
Hooks can invoke agents, run scripts, sync state, notify externally
Hook configuration UI in renderer
Pre-built hooks: "invoke Claude Code on user turn end," "auto-commit to git," "post to webhook"

Skills

.f-mark/skills/ directory
Skills are folders with SKILL.md + optional code/templates
Skill manifest declares: triggers, capabilities, dependencies
Skill loader chooses relevant skills per session context
Skill commands invocable via API or slash commands
Core skills shipped: F-Mark API guide, widget catalog, comment etiquette, branching workflow
Skill installation: f-mark install <skill-id> from registry
Skill versioning and updates
Private/team skills via local directory

Presets

Pre-defined comment/prompt templates as one-click actions
Built-in presets: "generate variations," "plan in phases," "critique this," "alternative approach," "summarize," "what am I missing," "make it shorter," "make it concrete"
Custom presets per project (in .f-mark/presets/)
Preset bundles installable as skills
Presets can take parameters via mini-form

Templates

Starter session templates: PRD, research, code review, design exploration, learning, decision log, brainstorm, planning, retrospective
Template = initial document structure + recommended skills + pre-configured hooks
Custom templates per user/team
Template marketplace integration

Agent identity & attribution

Each contribution tagged with author (human/agent/which agent)
Per-agent profiles: name, avatar, color
Agent registry: which agents have edited this session
Visual diff highlighting by author
"Blame" view (who wrote what)

Search & navigation

Full-text search across all sessions
Search comments only
Search widgets/decisions
Search by author
Search by date range
Search by tag
Semantic search (if local embedding configured)
Global session palette (cmd+K)
Session graph visualization (related sessions, branches)
Recent sessions list
Pinned sessions

File handling

Drag-and-drop file upload to session
Paste image directly into document
Automatic asset organization (assets/images/, assets/code/, assets/html/)
File preview in sidebar
Inline rendering of: images, PDFs, code with syntax highlight, audio, video, HTML (sandboxed iframe), CSV (as table), JSON (formatted), markdown (recursive)
File reference syntax in document
Asset cleanup (detect unreferenced files)

Configuration

Per-session config (.f-mark/config.json)
User-global config (~/.f-mark/config.json)
Agent endpoint configuration
API key management (encrypted local storage)
Hook configuration
Skill enable/disable
Theme selection
Keybindings


Renderer (the interface)
Document view

Live-updating markdown rendering
Streaming render during agent turns
Typography: clean serif for prose, mono for code, customizable
Reading mode (hides controls)
Edit mode (inline WYSIWYG-style editing)
Source mode (raw markdown)
Split view (source + rendered)
Focus mode (current section only)
Outline view (collapsible heading tree)
Word count, reading time
Scroll position memory per session

Interactive widgets (rendered)

Selection: radio buttons, click to select, animates -( ) → -(*)
Multi-select: checkboxes
Rank: drag-and-drop reorder
Slider: drag to set value
Visual options: card grid with previews (referencing files in folder)
Form: multi-field with validation
Widget state visible in document source
Widget completion triggers configurable hook (auto-submit, notify agent)
Disabled state after answered (optionally re-editable)

Comments interface

Highlight text → "Add comment" floating button
Sidebar with thread list
Inline pin icons on commented spans
Click pin → focus thread
Reply, resolve, delete
@mention agents to invoke them on a specific comment
Comment filters: unresolved, by author, by date
Comments collapse/expand
Comment notifications

Action panel

Preset buttons (configurable, per-skill)
Skill invocation buttons
"Continue" / "End turn" / "Cancel turn" controls
Message composer (textarea that posts to end of document)
Quick-add: comment, widget, file, branch
Agent selector (which agent for next turn)

HTML embed rendering

Sandboxed iframe per embed
Resize controls
"Open in new tab"
Refresh on file change
Multiple embeds per document (galleries)
Variation comparison view (side-by-side embeds)

Session navigation

Left sidebar: file tree of session folder
Session switcher (recent + pinned + search)
Branch graph visualization
Sub-session breadcrumbs
Back/forward navigation
"Jump to comment," "Jump to widget," "Jump to decision"

Diff and history

Turn-by-turn diff view
Snapshot comparison
Author-colored diff highlighting
Restore from snapshot
Time-travel slider

Themes & customization

Light/dark/custom themes
Typography presets
Density (compact/comfortable/spacious)
Color accents
Custom CSS injection
Per-session theme override

Keyboard & accessibility

Full keyboard navigation
Vim mode (optional)
Customizable keybindings
Screen reader support
High contrast mode
Configurable font sizes

Multi-pane layouts

Split document and embeds
Split two sessions side by side
Pop-out windows
Saved layout presets

Status indicators

Agent thinking/writing/done
Token usage current turn
Cost estimate (if BYOK with known pricing)
Unsaved changes
Sync status (when cloud connected)
Active participants (presence)

Command palette

cmd+K for everything
Session jump, skill invoke, preset run, settings, search, file open

Mobile-responsive read-only view

View sessions from phone (read + comment)
Tap to expand widgets
Push notifications for turn complete (cloud-tier)


Cloud layer (commercial)
Sync

Per-session opt-in cloud sync
End-to-end encrypted option
Conflict resolution UI
Selective sync (don't sync large assets)
Bandwidth controls

Sharing

Public read-only URLs per session
Password-protected shares
Expiring share links
"Powered by F-Mark" footer on free shares
Comment-as-guest on shared sessions
Embed F-Mark sessions in other sites via iframe

Teams

Workspaces with multiple members
Shared session library
Per-session permissions (view/comment/edit/admin)
Presence indicators
Real-time collaborative editing (when both human)
Activity feed
Mentions and notifications
Audit log

Managed agent gateway

Centralized API key management (no per-machine config)
Spend caps per user/team
Usage analytics
Model routing rules
Cached prompt support
Cost reporting

Web-based renderer

View any synced session in browser without installing
Limited editing in web (full editing requires local kernel)
Mobile web optimized

Cross-device

Pick up session on phone after starting on desktop
Desktop notifications when agent finishes turn on synced session

Search at scale

Full-text search across all team sessions
Semantic search via hosted embeddings

Backups & versioning

Cloud-side snapshots
Restore deleted sessions
Long-term archive

Integrations

Webhooks out (to Slack, Discord, email)
Webhooks in (trigger agents from external events)
Linear/Jira/GitHub bridges (sync sessions to tickets)
Calendar integration (schedule agent turns)
Zapier/Make compatibility


Skills marketplace
Discovery

Browse by category, author, popularity
Verified badges for maintained skills
Ratings and reviews
Compatibility matrix (which agents support which skills)
Featured collections

Publishing

One-command publish from local skill folder
Versioning, changelogs
Private skills (paid, team-only)

Bundled skills

Domain bundles: "Product Manager Pack," "Researcher Pack," "Developer Pack"
Workflow bundles: "Decision-Making Suite," "Design Sprint"

Skill primitives

Custom widgets
Custom presets
Custom hooks
Custom templates
Prompt fragments
Document linters
Domain-specific validators


Agent SDK / integration kit
Reference implementations

Claude Code skill bundle
Codex CLI integration
Gemini CLI integration
OpenRouter generic adapter
Local Ollama adapter

Agent loop helpers

Standard polling/webhook patterns
Context construction utilities (read document → format for prompt)
Turn lifecycle helpers
Error handling and retry

Multi-agent orchestration

Agent registry per session
Routing rules (which agent handles which kind of turn)
Handoff protocol
Cross-agent comments


Ecosystem & tooling
CLI tooling

f-mark (start)
f-mark new <template> (init from template)
f-mark skill install <id>
f-mark export <format>
f-mark archive <session>

VS Code extension — view and edit F-Mark sessions inside VS Code
Terminal renderer — text-mode interface for SSH/headless use
Browser extension — clip web content into a session
Public API for third parties — query/modify sessions from external tools