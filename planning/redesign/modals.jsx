/* Modal/overlay components for F-Mark's secondary surfaces */

const ModalBackdrop = ({ onClose, children, width = 560, align = 'center' }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div className={`modal ${align}`} style={{width}} onClick={e => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

/* ============================================================
   1. New Todo composer — inline modal triggered by "+ Add"
   ============================================================ */
const NewTodoModal = ({ onClose, onCreate }) => {
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [assignee, setAssignee] = React.useState(null);

  return (
    <ModalBackdrop onClose={onClose} width={520}>
      <div className="modal-head">
        <div className="modal-eyebrow">NEW TODO · in launch-planning</div>
        <h2 className="modal-title">Add a todo</h2>
        <button className="icon-btn modal-close" onClick={onClose}><IcX size={14}/></button>
      </div>
      <div className="modal-body">
        <div className="form-row">
          <input className="form-input form-title" placeholder="What needs doing?" autoFocus value={title} onChange={e => setTitle(e.target.value)}/>
        </div>
        <div className="form-row">
          <textarea className="form-textarea" placeholder="Optional notes — what does done look like? acceptance criteria, links, context…" rows="3" value={body} onChange={e => setBody(e.target.value)}></textarea>
        </div>
        <div className="form-row form-row-h">
          <div className="form-label">ASSIGN</div>
          <div className="assign-picker">
            <button className={`pick ${assignee==='Roey' ? 'on' : ''}`} onClick={() => setAssignee(assignee==='Roey'?null:'Roey')}>
              <Avatar who="Roey" size="sm"/> Roey
            </button>
            <button className={`pick ${assignee==='Claude' ? 'on' : ''}`} onClick={() => setAssignee(assignee==='Claude'?null:'Claude')}>
              <Avatar who="Claude" size="sm"/> Claude
            </button>
            <button className={`pick ${assignee===null ? 'on' : ''}`} onClick={() => setAssignee(null)}>
              <span style={{width:18,height:18,borderRadius:9,border:'1.5px dashed var(--ink-4)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'var(--ink-4)'}}>?</span>
              Unassigned
            </button>
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <div className="hint">Will be added to the feed as an event and appear in the todos panel · <span className="kbd-chip">esc</span> to cancel</div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-solid" onClick={() => { onCreate({title,body,assignee}); onClose(); }}>
            Add todo <span style={{opacity:.55,fontFamily:'var(--mono)',fontSize:11,marginLeft:6}}>⌘↵</span>
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
};

/* ============================================================
   2. Log filter — popover anchored to the Filter ▾ button
   ============================================================ */
const LogFilterPopover = ({ onClose }) => {
  const [kinds, setKinds] = React.useState(new Set(['prose','message','choices','todo','file','embed','turn-end']));
  const [participants, setParticipants] = React.useState(new Set(['Roey','Claude']));
  const [range, setRange] = React.useState('session');
  const [namedOnly, setNamedOnly] = React.useState(false);

  const toggleK = (k) => setKinds(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleP = (p) => setParticipants(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });

  return (
    <div className="popover-backdrop" onClick={onClose}>
      <div className="popover" style={{top:90, right:404, width:320}} onClick={e => e.stopPropagation()}>
        <div className="pop-head">
          Filter activity log
          <button className="icon-btn" onClick={onClose} style={{marginLeft:'auto',width:24,height:24}}><IcX size={12}/></button>
        </div>
        <div className="pop-section">
          <div className="pop-label">KIND</div>
          <div className="pop-chips">
            {[
              ['prose','📄 Prose'],
              ['message','💬 Message'],
              ['choices','? Choice'],
              ['todo','✓ Todo'],
              ['file','📎 File'],
              ['embed','🖼 Embed'],
              ['turn-end','⎯ Turn-end'],
            ].map(([k,label]) => (
              <button key={k} className={`pop-chip ${kinds.has(k)?'on':''}`} onClick={() => toggleK(k)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="pop-section">
          <div className="pop-label">PARTICIPANT</div>
          <div className="pop-chips">
            {['Roey','Claude'].map(p => (
              <button key={p} className={`pop-chip ${participants.has(p)?'on':''}`} onClick={() => toggleP(p)}>
                <Avatar who={p} size="sm"/> {p}
              </button>
            ))}
          </div>
        </div>
        <div className="pop-section">
          <div className="pop-label">DATE RANGE</div>
          <div className="seg-control">
            {[['session','This session'],['today','Today'],['7d','Last 7d'],['all','All time']].map(([v,l]) => (
              <button key={v} className={range===v?'on':''} onClick={() => setRange(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="pop-section pop-section-h">
          <label className="pop-toggle">
            <input type="checkbox" checked={namedOnly} onChange={e => setNamedOnly(e.target.checked)}/>
            <span>Named contributions only</span>
          </label>
        </div>
        <div className="pop-foot">
          <button className="btn-ghost" onClick={onClose}>Reset</button>
          <button className="btn-solid" onClick={onClose}>Apply filter</button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   3. Settings modal — profile / agents / theme / shortcuts / about
   ============================================================ */
const SettingsModal = ({ onClose }) => {
  const [section, setSection] = React.useState('profile');
  const sections = [
    { id:'profile', label:'Profile', icon:<IcAt size={14}/> },
    { id:'agents',  label:'Connected agents', icon:<IcZap size={14}/> },
    { id:'theme',   label:'Appearance', icon:<IcEye size={14}/> },
    { id:'keys',    label:'Keyboard shortcuts', icon:<IcCmd size={14}/> },
    { id:'about',   label:'About', icon:<IcDoc size={14}/> },
  ];
  return (
    <ModalBackdrop onClose={onClose} width={780}>
      <div className="settings">
        <aside className="settings-side">
          <div className="settings-side-head">Settings</div>
          {sections.map(s => (
            <button key={s.id} className={`settings-side-item ${section===s.id?'active':''}`} onClick={() => setSection(s.id)}>
              {s.icon} {s.label}
            </button>
          ))}
        </aside>
        <main className="settings-main">
          <button className="icon-btn modal-close" onClick={onClose} style={{position:'absolute',right:12,top:12}}><IcX size={14}/></button>

          {section === 'profile' && (
            <>
              <h3 className="settings-h">Profile</h3>
              <div className="settings-row">
                <div className="settings-l">Display name</div>
                <div className="settings-r"><input className="form-input" defaultValue="Roey" style={{width:240}}/></div>
              </div>
              <div className="settings-row">
                <div className="settings-l">Identity</div>
                <div className="settings-r"><code className="codish">us-a7f3</code> <span style={{color:'var(--ink-4)',fontSize:11.5,marginLeft:6}}>generated when project initialized</span></div>
              </div>
              <div className="settings-row">
                <div className="settings-l">Color</div>
                <div className="settings-r">
                  <div className="color-row">
                    {['#2a5fa8','#3d7a4f','#8a2a8a','#a83a3a','#1a1714'].map((c,i) => (
                      <div key={i} className="swatch" style={{background:c,border: i===0?'2px solid var(--ink)':'1px solid var(--line)'}}></div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-l">Avatar</div>
                <div className="settings-r" style={{display:'flex',alignItems:'center',gap:10}}>
                  <Avatar who="Roey" size="xl"/>
                  <button className="btn-ghost" style={{padding:'5px 12px'}}>Upload…</button>
                </div>
              </div>
            </>
          )}

          {section === 'agents' && (
            <>
              <h3 className="settings-h">Connected agents</h3>
              <div className="settings-sub">Agents registered to read and write events in this project. They use the orientation snippet below.</div>
              <div className="agent-list">
                <div className="agent-card">
                  <Avatar who="Claude" size="lg"/>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600}}>Claude Code <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink-4)',fontWeight:400,marginLeft:6}}>· ag-c92e</span></div>
                    <div style={{fontSize:12,color:'var(--ink-3)',fontFamily:'var(--mono)'}}>Last active 30s ago · 142 events written</div>
                  </div>
                  <span className="status-pill on">● connected</span>
                </div>
                <div className="agent-card">
                  <span className="avatar lg" style={{background:'#5a4a35'}}>G</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600}}>gpt-cli <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink-4)',fontWeight:400,marginLeft:6}}>· ag-7b41</span></div>
                    <div style={{fontSize:12,color:'var(--ink-3)',fontFamily:'var(--mono)'}}>Last active yesterday · 8 events written</div>
                  </div>
                  <span className="status-pill off">○ idle</span>
                </div>
                <button className="agent-add">+ Register new agent</button>
              </div>
              <div className="snippet-box">
                <div className="snippet-head">Orientation snippet — paste into any agent</div>
                <pre className="snippet-body">{`You are working with F-Mark in /Users/roey/acme-platform.
Current session: launch-planning
Read .f-mark/agent-orientation.md before writing any events.`}</pre>
                <button className="copy-btn">Copy</button>
              </div>
            </>
          )}

          {section === 'theme' && (
            <>
              <h3 className="settings-h">Appearance</h3>
              <div className="settings-row">
                <div className="settings-l">Theme</div>
                <div className="settings-r">
                  <div className="seg-control" style={{display:'inline-flex'}}>
                    <button className="on">Light</button>
                    <button>Dark</button>
                    <button>System</button>
                  </div>
                  <div style={{fontSize:11,color:'var(--ink-4)',marginTop:6}}>Dark mode is coming post-POC.</div>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-l">Prose font</div>
                <div className="settings-r">
                  <select className="form-input" defaultValue="Source Serif 4">
                    <option>Source Serif 4</option><option>iA Writer Quattro</option><option>Charter</option><option>System serif</option>
                  </select>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-l">Density</div>
                <div className="settings-r">
                  <div className="seg-control" style={{display:'inline-flex'}}>
                    <button>Compact</button><button className="on">Comfortable</button><button>Roomy</button>
                  </div>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-l">Show line numbers in prose</div>
                <div className="settings-r"><label className="pop-toggle"><input type="checkbox" defaultChecked/><span>on</span></label></div>
              </div>
            </>
          )}

          {section === 'keys' && (
            <>
              <h3 className="settings-h">Keyboard shortcuts</h3>
              <div className="kbd-grid">
                {[
                  ['Send and end turn','⌘ ↵'],
                  ['Send without ending turn','⌘ ⇧ ↵'],
                  ['Toggle comment mode','⌘ /'],
                  ['Toggle named contribution','⌘ N'],
                  ['Open presets','⌘ P'],
                  ['Command palette','⌘ K'],
                  ['Search this session','⌘ F'],
                  ['Cycle right-panel tabs','⌘ ]'],
                  ['Collapse right panel','⌘ \\'],
                  ['Exit mode / close','Esc'],
                ].map(([l,k]) => (
                  <div key={l} className="kbd-row">
                    <span>{l}</span>
                    <span className="kbd-keys">{k.split(' ').map((ch,i) => <kbd key={i}>{ch}</kbd>)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {section === 'about' && (
            <>
              <h3 className="settings-h">About F-Mark</h3>
              <div className="about-block">
                <pre style={{fontFamily:'var(--mono)',fontSize:8,lineHeight:1.05,color:'var(--ink-2)',margin:'0 0 14px',whiteSpace:'pre'}}>
{`   _~v~_       _~~~~~~~~~~~_
-[[]]=  #]]]]]]]]]]]]]]]]<-
*<[<+~~=  =================>-
=  -----   -----            =+
= /  M  \\ /| ^ |\\           =
= \\| --- |/   \\|_|/         =
*<[]+~~=  ==================>-`}
                </pre>
                <div style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--ink-2)'}}>
                  F-Mark <b style={{color:'var(--ink)'}}>v0.4.2-poc</b> · MIT license<br/>
                  Build c92e · May 22, 2026
                </div>
                <div style={{marginTop:14,display:'flex',gap:6}}>
                  <button className="btn-ghost">View source</button>
                  <button className="btn-ghost">Changelog</button>
                  <button className="btn-ghost">Report issue</button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </ModalBackdrop>
  );
};

/* ============================================================
   4. Command palette — ⌘K universal search + quick actions
   ============================================================ */
const CommandPalette = ({ onClose, sessions, named, todos, threads }) => {
  const [q, setQ] = React.useState('');

  const actions = [
    { kind:'action', icon:'+', label:'New session', sub:'Create a fresh session', keys:'⌘ ⇧ N' },
    { kind:'action', icon:'↩', label:'Switch session…', sub:'Jump between recent sessions', keys:'⌘ ⇧ S' },
    { kind:'action', icon:'↳', label:'Jump to named contribution…', sub:'Find a doc by name', keys:'⌘ J' },
    { kind:'action', icon:'⚡', label:'Invoke skill…', sub:'Run a saved prompt', keys:'⌘ P' },
    { kind:'action', icon:'⚙', label:'Open settings', sub:'Profile, agents, shortcuts', keys:null },
  ];
  const sessionResults = sessions.slice(0,3).map(s => ({ kind:'session', icon:<IcFolder size={13}/>, label:s.slug, sub:s.summary }));
  const namedResults = named.map(n => ({ kind:'named', icon:<IcDoc size={13}/>, label:n.title, sub:`by ${n.by} · ${n.when}` }));
  const todoResults = todos.filter(t => !t.done).slice(0,3).map(t => ({ kind:'todo', icon:<IcCheck size={13}/>, label:t.title, sub:t.assignee ? `assigned to ${t.assignee}` : 'unassigned' }));

  const all = q
    ? [...actions, ...sessionResults, ...namedResults, ...todoResults].filter(r =>
        r.label.toLowerCase().includes(q.toLowerCase()) || (r.sub||'').toLowerCase().includes(q.toLowerCase())
      )
    : null;

  return (
    <ModalBackdrop onClose={onClose} width={620} align="top">
      <div className="cmdk">
        <div className="cmdk-input-row">
          <IcSearch size={16} style={{color:'var(--ink-4)'}}/>
          <input autoFocus className="cmdk-input" placeholder="Search sessions, contributions, todos, comments, or type a command…" value={q} onChange={e => setQ(e.target.value)}/>
          <span className="kbd-chip">esc</span>
        </div>

        <div className="cmdk-results">
          {all ? (
            <>
              <div className="cmdk-group">RESULTS · {all.length}</div>
              {all.map((r,i) => (
                <div key={i} className={`cmdk-row ${i===0?'sel':''}`}>
                  <span className="cmdk-icon">{r.icon}</span>
                  <span className="cmdk-label">{r.label}</span>
                  <span className="cmdk-sub">{r.sub}</span>
                  <span className="cmdk-kind">{r.kind}</span>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="cmdk-group">QUICK ACTIONS</div>
              {actions.map((r,i) => (
                <div key={i} className={`cmdk-row ${i===0?'sel':''}`}>
                  <span className="cmdk-icon mono">{r.icon}</span>
                  <span className="cmdk-label">{r.label}</span>
                  <span className="cmdk-sub">{r.sub}</span>
                  {r.keys && <span className="cmdk-keys">{r.keys.split(' ').map((c,j) => <kbd key={j}>{c}</kbd>)}</span>}
                </div>
              ))}
              <div className="cmdk-group">RECENT SESSIONS</div>
              {sessionResults.map((r,i) => (
                <div key={i} className="cmdk-row">
                  <span className="cmdk-icon">{r.icon}</span>
                  <span className="cmdk-label">{r.label}</span>
                  <span className="cmdk-sub">{r.sub}</span>
                  <span className="cmdk-kind">session</span>
                </div>
              ))}
              <div className="cmdk-group">IN CURRENT SESSION</div>
              {namedResults.map((r,i) => (
                <div key={i} className="cmdk-row">
                  <span className="cmdk-icon">{r.icon}</span>
                  <span className="cmdk-label">{r.label}</span>
                  <span className="cmdk-sub">{r.sub}</span>
                  <span className="cmdk-kind">named</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>⌘</kbd><kbd>↵</kbd> open in new tab</span>
          <span style={{marginLeft:'auto',color:'var(--ink-4)'}}>F-Mark v0.4.2</span>
        </div>
      </div>
    </ModalBackdrop>
  );
};

/* ============================================================
   5. Presets dropdown — anchored to compose bar's ⚡ Presets
   ============================================================ */
const PresetsDropdown = ({ onClose, onPick }) => {
  const presets = [
    { group:'Generate', items:[
      { name:'Generate variations', body:'Give me 3 variations of this, exploring different angles.', icon:'✦' },
      { name:'Break into phases', body:'Break this plan into phases with concrete dates and owners.', icon:'⫶' },
      { name:'Summarize so far', body:'Summarize this session into a one-page brief I can share.', icon:'☰' },
    ]},
    { group:'Critique', items:[
      { name:'Critique this', body:'Find the three weakest points in this argument and steel-man each.', icon:'⚠' },
      { name:'Devil\'s advocate', body:'Take the opposite position. What\'s the strongest case against?', icon:'⚞' },
      { name:'Risk analysis', body:'List the top risks with likelihood × impact × mitigation.', icon:'△' },
    ]},
    { group:'Format', items:[
      { name:'Convert to email', body:'Rewrite the latest named contribution as an email.', icon:'✉' },
      { name:'Convert to checklist', body:'Turn this into a checklist with concrete acceptance criteria.', icon:'☑' },
    ]},
  ];

  return (
    <div className="popover-backdrop" onClick={onClose}>
      <div className="popover presets-pop" style={{bottom:78, left:580, width:380}} onClick={e => e.stopPropagation()}>
        <div className="pop-head">
          <IcZap size={14} style={{color:'var(--ink-2)'}}/>
          Presets
          <span style={{marginLeft:'auto',fontFamily:'var(--mono)',fontSize:10.5,color:'var(--ink-4)'}}>⌘P</span>
        </div>
        <div className="presets-search">
          <IcSearch size={12} style={{color:'var(--ink-4)'}}/>
          <input placeholder="Filter presets…" autoFocus/>
        </div>
        <div className="presets-list">
          {presets.map(group => (
            <div key={group.group}>
              <div className="presets-group">{group.group.toUpperCase()}</div>
              {group.items.map((p,i) => (
                <button key={i} className="preset-item" onClick={() => { onPick(p); onClose(); }}>
                  <span className="preset-icon">{p.icon}</span>
                  <div className="preset-text">
                    <div className="preset-name">{p.name}</div>
                    <div className="preset-body">"{p.body}"</div>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="pop-foot" style={{justifyContent:'space-between'}}>
          <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink-4)'}}>Pre-fills the compose bar — edit before sending</span>
          <button className="btn-ghost" style={{padding:'4px 10px'}}>+ New preset</button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   6. Skills palette — invoke project-scoped commands/skills
   ============================================================ */
const SkillsPalette = ({ onClose }) => {
  const skills = [
    { name:'review-pr', kind:'project', icon:'⚙', desc:'Read a PR and post a named contribution with structured review.', args:'<pr-url>' },
    { name:'design-system-audit', kind:'project', icon:'◇', desc:'Walk the codebase and post tokens drift as a named risk doc.', args:'[path]' },
    { name:'standup', kind:'project', icon:'☼', desc:'Summarize yesterday\'s sessions into a standup-style update.', args:null },
    { name:'rfd', kind:'global', icon:'¶', desc:'Generate a Request-for-Discussion doc from the current session.', args:'<title>' },
    { name:'changelog', kind:'global', icon:'※', desc:'Compile a public changelog entry from named contributions.', args:'<version>' },
    { name:'kill-darlings', kind:'global', icon:'✕', desc:'Aggressively trim the latest named contribution by 30%.', args:null },
  ];
  return (
    <ModalBackdrop onClose={onClose} width={640} align="top">
      <div className="cmdk skills-pal">
        <div className="cmdk-input-row">
          <IcZap size={16} style={{color:'var(--agent)'}}/>
          <input autoFocus className="cmdk-input" placeholder="Run a skill: /name [args]…"/>
          <span className="kbd-chip">esc</span>
        </div>
        <div className="cmdk-results">
          <div className="cmdk-group" style={{display:'flex',alignItems:'center',gap:8}}>
            PROJECT SKILLS
            <span style={{color:'var(--ink-4)',fontFamily:'var(--mono)',fontSize:10}}>· in .f-mark/skills/</span>
          </div>
          {skills.filter(s => s.kind==='project').map((s,i) => (
            <div key={s.name} className={`cmdk-row skill-row ${i===0?'sel':''}`}>
              <span className="cmdk-icon mono">{s.icon}</span>
              <div className="skill-text">
                <div className="skill-name">/{s.name} {s.args && <span className="skill-args">{s.args}</span>}</div>
                <div className="skill-desc">{s.desc}</div>
              </div>
              <span className="cmdk-kind">project</span>
            </div>
          ))}
          <div className="cmdk-group">GLOBAL SKILLS</div>
          {skills.filter(s => s.kind==='global').map(s => (
            <div key={s.name} className="cmdk-row skill-row">
              <span className="cmdk-icon mono">{s.icon}</span>
              <div className="skill-text">
                <div className="skill-name">/{s.name} {s.args && <span className="skill-args">{s.args}</span>}</div>
                <div className="skill-desc">{s.desc}</div>
              </div>
              <span className="cmdk-kind">global</span>
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span><kbd>↵</kbd> run</span>
          <span><kbd>⇥</kbd> complete</span>
          <span style={{marginLeft:'auto'}}>Skills are user-defined prompts that run on the agent's next turn</span>
        </div>
      </div>
    </ModalBackdrop>
  );
};

/* ============================================================
   7. New session modal — from "+ New" in sessions panel
   ============================================================ */
const NewSessionModal = ({ onClose, onCreate }) => {
  const [slug, setSlug] = React.useState('');
  const [template, setTemplate] = React.useState('blank');
  const [openImmediately, setOpenImmediately] = React.useState(true);
  const [invite, setInvite] = React.useState('claude');

  const templates = [
    { id:'blank', name:'Blank', desc:'Empty session. You write the first message.', emoji:'·' },
    { id:'planning', name:'Planning session', desc:'Starts with a "Goals & constraints" named contribution and 3 placeholder todos.', emoji:'◇' },
    { id:'research', name:'Research session', desc:'Starts with a "Research questions" doc; agent will gather sources as files.', emoji:'※' },
    { id:'review', name:'Code review session', desc:'Starts with a pasted PR + standardized review prompt.', emoji:'⌗' },
  ];

  return (
    <ModalBackdrop onClose={onClose} width={580}>
      <div className="modal-head">
        <div className="modal-eyebrow">NEW SESSION · in acme-platform</div>
        <h2 className="modal-title">Create a session</h2>
        <button className="icon-btn modal-close" onClick={onClose}><IcX size={14}/></button>
      </div>
      <div className="modal-body">
        <div className="form-row">
          <div className="form-label" style={{marginBottom:6}}>SLUG</div>
          <div className="slug-input">
            <span className="slug-prefix">.f-mark/sessions/2026-05-22-</span>
            <input className="slug-tail" placeholder="auto-generate" autoFocus value={slug} onChange={e => setSlug(e.target.value.replace(/[^a-z0-9-]/g,'').toLowerCase())}/>
            <span className="slug-suffix">/</span>
          </div>
          <div className="form-hint">Used as the folder name and CLI argument. Lowercase, hyphens. Auto-generated from the first message if left blank.</div>
        </div>

        <div className="form-row" style={{marginTop:18}}>
          <div className="form-label" style={{marginBottom:8}}>TEMPLATE</div>
          <div className="template-grid">
            {templates.map(tmpl => (
              <button key={tmpl.id} className={`template-card ${template===tmpl.id?'on':''}`} onClick={() => setTemplate(tmpl.id)}>
                <div className="template-icon">{tmpl.emoji}</div>
                <div className="template-text">
                  <div className="template-name">{tmpl.name}</div>
                  <div className="template-desc">{tmpl.desc}</div>
                </div>
                <div className="template-radio">{template===tmpl.id && <span/>}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="form-row form-row-h" style={{marginTop:18,gap:18}}>
          <div>
            <div className="form-label" style={{marginBottom:6}}>INVITE AGENT</div>
            <div className="assign-picker">
              <button className={`pick ${invite==='claude'?'on':''}`} onClick={() => setInvite('claude')}>
                <Avatar who="Claude" size="sm"/> claude-code
              </button>
              <button className={`pick ${invite==='gpt'?'on':''}`} onClick={() => setInvite('gpt')}>
                <span className="avatar sm" style={{background:'#5a4a35'}}>G</span> gpt-cli
              </button>
              <button className={`pick ${invite==='none'?'on':''}`} onClick={() => setInvite('none')}>
                <span style={{width:18,height:18,borderRadius:9,border:'1.5px dashed var(--ink-4)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'var(--ink-4)'}}>·</span>
                None — just me
              </button>
            </div>
          </div>
        </div>

        <label className="pop-toggle" style={{marginTop:16}}>
          <input type="checkbox" checked={openImmediately} onChange={e => setOpenImmediately(e.target.checked)}/>
          <span>Open immediately and copy the agent-orientation snippet</span>
        </label>
      </div>
      <div className="modal-foot">
        <div className="hint">Templates can be customized in <code style={{fontFamily:'var(--mono)',fontSize:11}}>.f-mark/templates/</code></div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-solid" onClick={() => { onCreate({slug,template,invite}); onClose(); }}>
            Create session <IcArrowR size={12} style={{marginLeft:4,verticalAlign:-2}}/>
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
};

Object.assign(window, {NewTodoModal, LogFilterPopover, SettingsModal, CommandPalette, PresetsDropdown, SkillsPalette, NewSessionModal});
