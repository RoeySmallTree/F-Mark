/* F-Mark — main app */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "turnState": "agent",
  "showFocusedComment": true,
  "defaultView": "all",
  "accent": "amber",
  "denseFeed": false,
  "theme": "light"
}/*EDITMODE-END*/;

const SESSIONS = JSON.parse(document.getElementById('mock-data').textContent).sessions;

const INITIAL_TODOS = [
  { id:'t1', title:'Draft the announcement email', assignee:'Claude', done:false, desc:'Should mention the launch date and that we\'re open-source.' },
  { id:'t2', title:'Decide on pricing tiers', assignee:null, done:false },
  { id:'t3', title:'Review risk analysis', assignee:'Roey', done:false },
  { id:'t4', title:'Define target audience', assignee:'Roey', done:true },
  { id:'t5', title:'Pick launch date', assignee:'Roey', done:true },
  { id:'t6', title:'Audit landing-page copy', assignee:'Claude', done:true },
  { id:'t7', title:'Buy the .com', assignee:'Roey', done:true },
  { id:'t8', title:'Set up analytics', assignee:'Claude', done:true },
];

const NAMED = [
  { id:'n1', title:'Launch Plan v1', by:'Claude', when:'5 min ago', preview:'# Launch Plan — Phase 1 starts by shipping the open-source kernel…' },
  { id:'n2', title:'Risk Analysis', by:'Claude', when:'12 min ago', preview:'Three key risks: agent reliability, infra cost overrun, and adoption stalling at week two…' },
  { id:'n3', title:'Announcement Email v1', by:'Claude', when:'just now', preview:'Subject: We\'re launching F-Mark — a document-feeling workspace for working with agents…' },
];

const INITIAL_THREADS = [
  {
    id:'th1', target:'Launch Plan v1', lines:'8–12',
    snippet:'Post to Hacker News on Tuesday morning, then to relevant subreddits 4 hours later…',
    author:'Roey', when:'5 min ago',
    first:'This section needs more concrete numbers — what\'s our target user count for week one?',
    replies:2, resolved:false, pinId:'p1',
    replyList:[
      { author:'Claude', when:'4 min ago', text:'Good point. I\'ll add a breakdown by traffic source — HN, Twitter, direct.' },
      { author:'Roey', when:'3 min ago', text:'Better. Can we also include a sensitivity analysis for the HN-front-page case?' },
    ],
  },
  {
    id:'th2', target:'Launch Plan v1', lines:'24',
    snippet:'Phase 3: Iterate — watch metrics for 48 hours then adjust positioning if needed.',
    author:'Roey', when:'3 min ago',
    first:'Move this paragraph earlier? It feels like context the reader needs upfront.',
    replies:0, resolved:false, pinId:'p2',
  },
  {
    id:'th3', target:'Announcement Email v1', lines:'1',
    snippet:'Subject: We\'re launching F-Mark — a document-feeling workspace for working with agents',
    author:'Roey', when:'1 min ago',
    first:'Subject line is too long — can we get it under 60 chars? Most clients truncate.',
    replies:0, resolved:false, pinId:'p3',
  },
  {
    id:'th4', target:'Risk Analysis', lines:'6–8',
    snippet:'Risk: agent reliability falls below 95% during week one due to load spikes.',
    author:'Roey', when:'8 min ago',
    first:'Good. Resolved — we have monitoring in place.',
    replies:0, resolved:true, pinId:'p4',
  },
];

/* Feed events in chronological order — newest at bottom */
const FEED_EVENTS = [
  { type:'message', who:'Roey', when:'14 min ago', text:'Let\'s plan the v1 launch. I want to ship next Tuesday if possible — what\'s the critical path?' },
  { type:'turn-end', who:'Roey', when:'14 min ago' },
  { type:'message', who:'Claude', when:'13 min ago', text:'On it. Three things on the critical path: the open-source kernel needs a final pass, the landing page needs hero copy locked, and we need a launch checklist. I\'ll draft a plan.' },
  { type:'prose', who:'Claude', when:'12 min ago',
    title:'Risk Analysis',
    frontmatter:{ name:'risk-analysis', supersedes:'—', kind:'named' },
  },
  { type:'turn-end', who:'Claude', when:'12 min ago' },
  { type:'message', who:'Roey', when:'10 min ago', text:'Good. Now give me the actual plan — phased, with concrete dates.' },
  { type:'turn-end', who:'Roey', when:'10 min ago' },
  { type:'prose', who:'Claude', when:'5 min ago',
    title:'Launch Plan v1',
    frontmatter:{ name:'launch-plan-v1', supersedes:'—', kind:'named' },
    content:'main',
  },
  { type:'choices', who:'Claude', when:'4 min ago',
    question:'Which launch approach should we commit to?',
    options:[
      { id:'a', label:'Approach A — Incremental rollout', desc:'Ship to 10 friendly users first, gather feedback for 3 days, then open up.' },
      { id:'b', label:'Approach B — Public launch on HN', desc:'Full launch Tuesday morning. Higher risk, higher signal.' },
      { id:'c', label:'Approach C — Soft launch via Twitter', desc:'Quiet rollout to followers first, then HN the following week.' },
    ],
    chosenId:'b', answeredWhen:'30s ago',
  },
  { type:'todo', who:'Claude', when:'3 min ago', title:'Draft the announcement email', desc:'Should mention the launch date and that we\'re open-source.', assignee:'Claude', done:false, todoId:'t1' },
  { type:'message', who:'Roey', when:'2 min ago', text:'Approach B. Draft the announcement when you have a sec.', reply:null },
  { type:'turn-end', who:'Roey', when:'2 min ago' },
  { type:'message', who:'Claude', when:'1 min ago', text:'On it. Drafting the email now — I\'ll keep it tight, three paragraphs max.' },
  { type:'prose', who:'Claude', when:'just now',
    title:'Announcement Email v1',
    frontmatter:{ name:'announcement-email-v1', supersedes:'—', kind:'named' },
    content:'email',
  },
  { type:'embed', who:'Claude', when:'just now',
    title:'Email — rendered preview',
    variants:['a','b'], activeVariant:'a',
  },
];

/* ---------- App ---------- */
const App = () => {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = React.useState(t.defaultView || 'all');
  const [leftActive, setLeftActive] = React.useState('sessions');
  const [rightTab, setRightTab] = React.useState('comments');
  const [todos, setTodos] = React.useState(INITIAL_TODOS);
  const [threads, setThreads] = React.useState(INITIAL_THREADS);
  const [choicesPick, setChoicesPick] = React.useState('b');
  const [embedVariant, setEmbedVariant] = React.useState('a');
  const [focusedPinId, setFocusedPinId] = React.useState(t.showFocusedComment ? 'p1' : null);
  const [composeMode, setComposeMode] = React.useState('message');
  const [composeText, setComposeText] = React.useState('');
  const [commentTarget, setCommentTarget] = React.useState(null);
  const [replyTarget, setReplyTarget] = React.useState(null);
  const [rightCollapsed, setRightCollapsed] = React.useState(false);
  const [overlay, setOverlay] = React.useState(null); // 'newTodo' | 'settings' | 'cmdK' | 'logFilter' | 'presets' | 'skills'
  const turnState = t.turnState;
  const feedRef = React.useRef(null);

  // sync tweaks
  React.useEffect(() => {
    if (t.showFocusedComment && !focusedPinId) setFocusedPinId('p1');
    if (!t.showFocusedComment && focusedPinId) setFocusedPinId(null);
  }, [t.showFocusedComment]);

  React.useEffect(() => {
    // accent palette tweak
    const root = document.documentElement;
    if (t.accent === 'cool') {
      root.style.setProperty('--agent', '#3b6b9c');
      root.style.setProperty('--agent-tint', '#dde7f2');
      root.style.setProperty('--agent-tint-2', '#bccfe3');
    } else if (t.accent === 'mono') {
      root.style.setProperty('--agent', '#4a443a');
      root.style.setProperty('--agent-tint', '#e8e1d0');
      root.style.setProperty('--agent-tint-2', '#d9d1bc');
    } else {
      root.style.setProperty('--agent', '#b86a1f');
      root.style.setProperty('--agent-tint', '#f6ead9');
      root.style.setProperty('--agent-tint-2', '#ecd9b5');
    }
  }, [t.accent]);

  React.useEffect(() => {
    // theme tweak
    document.body.className = '';
    if (t.theme && t.theme !== 'light') {
      document.body.classList.add('theme-' + t.theme);
    }
  }, [t.theme]);

  // Find focused thread by pin id
  const focusedThread = React.useMemo(() => {
    if (!focusedPinId) return null;
    const t = threads.find(x => x.pinId === focusedPinId);
    if (!t) return null;
    const others = threads.filter(x => x.target === t.target && x.id !== t.id);
    return {...t, others};
  }, [focusedPinId, threads]);

  const toggleTodo = (id) => {
    setTodos(prev => prev.map(t => t.id === id ? {...t, done: !t.done} : t));
  };
  const resolve = (id) => {
    setThreads(prev => prev.map(t => t.id === id ? {...t, resolved: !t.resolved} : t));
  };

  // Keyboard shortcuts
  React.useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === '/') { e.preventDefault(); setComposeMode(m => m === 'comment' ? 'message' : 'comment'); }
      if (meta && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); setComposeMode(m => m === 'named' ? 'message' : 'named'); }
      if (meta && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setOverlay('cmdK'); }
      if (meta && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); setOverlay('presets'); }
      if (meta && e.shiftKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setOverlay('skills'); }
      if (e.key === 'Escape') { setCommentTarget(null); setReplyTarget(null); setFocusedPinId(null); setOverlay(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onPinClick = (pinId) => {
    setFocusedPinId(pinId);
  };

  /* Render specific prose contents */
  const renderProse = (kind) => {
    if (kind === 'email') {
      return (
        <>
          <p style={{fontFamily:'var(--mono)',fontSize:13,color:'var(--ink-3)',margin:'0 0 14px',padding:'8px 12px',background:'var(--bg)',borderRadius:5}}>
            <b style={{color:'var(--ink-2)'}}>Subject:</b> We're launching F-Mark — a document-feeling workspace for working with agents
          </p>
          <p>Hi there,</p>
          <p>Today we're launching F-Mark in public beta. It's a workspace for people who work with AI agents the same way they work with colleagues — by writing things down together. Plans, drafts, decisions, comments, choices. All in plain markdown and JSON files on disk that you fully own.</p>
          <p>F-Mark is open source under the MIT license and works with any agent that can read and write files. We've tested heavily with Claude Code. Set it up in your project in under a minute.</p>
          <p>Try it: <code>npx f-mark init</code></p>
          <p style={{marginBottom:0}}>— The F-Mark team</p>
        </>
      );
    }
    // main launch plan
    return (
      <>
        <h2>Phase 1 — Foundation <span style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--ink-4)',fontWeight:400}}>(this week)</span></h2>
        <p>We start by shipping the open-source kernel: the file-format spec, the watcher daemon, and the reference UI. Everything we'd want from a v1 in a single repo, MIT-licensed, with one-line install.</p>
        <ul>
          <li>Lock the event schema (named/unnamed prose, choices, todos, files)</li>
          <li>Ship reference watcher with hot-reload for the UI</li>
          <li>Write the agent-orientation guide so any LLM can be onboarded in one paste</li>
        </ul>

        <h2 className="prose-line has-comment">Phase 2 — Launch <span style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--ink-4)',fontWeight:400}}>(next Tuesday)</span></h2>
        <p className="prose-line has-comment">Post to Hacker News on Tuesday morning, then to relevant subreddits 4 hours later. Target <span className="num">2,500</span> visitors and <span className="num">120</span> sign-ups in the first 48 hours. Have the demo video, the docs site, and the playground ready.</p>
        <blockquote>Pre-flight checklist: front page assets, demo recording, docs build, playground live, status page armed.</blockquote>

        <h2>Phase 3 — Iterate <span className="prose-line has-comment" style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--ink-4)',fontWeight:400}}>(48 hours after launch)</span></h2>
        <p className="prose-line has-comment">Watch metrics for 48 hours and adjust positioning if needed. Triage issues fast — there will be edge cases. The first <span className="num">100</span> users get a hand-written welcome.</p>
      </>
    );
  };

  /* embed rendered preview */
  const renderEmbed = (v) => (
    <div style={{padding:'24px 28px',background:'#fff',height:'100%',overflow:'auto',fontFamily:'Georgia, serif',color:'#333'}}>
      <div style={{fontFamily:'monospace',fontSize:11,color:'#888',borderBottom:'1px solid #eee',paddingBottom:8,marginBottom:14}}>
        <b style={{color:'#333'}}>From</b> hello@f-mark.dev &nbsp;·&nbsp; <b style={{color:'#333'}}>To</b> you@example.com
      </div>
      <h1 style={{fontFamily:'Georgia, serif',fontSize:22,margin:'0 0 12px',color:'#222'}}>
        {v === 'a' ? 'We\'re launching F-Mark today' : 'F-Mark is here'}
      </h1>
      <p style={{fontSize:14,lineHeight:1.6,margin:'0 0 10px'}}>A workspace for people who work with AI agents the way they work with colleagues — by writing things down together.</p>
      <p style={{fontSize:14,lineHeight:1.6,margin:'0 0 14px'}}>Plans, drafts, decisions, comments. All in plain markdown and JSON files you fully own.</p>
      <div style={{display:'inline-block',padding:'10px 18px',background:'#1a1714',color:'#faf6ed',borderRadius:6,fontSize:13,fontFamily:'monospace'}}>npx f-mark init</div>
      <p style={{fontSize:12,color:'#888',marginTop:20,fontStyle:'italic'}}>— The F-Mark team</p>
    </div>
  );

  /* Pins live inside the launch plan */
  const launchPlanPins = [
    { id:'p1', top:140, count:2, resolved:false },
    { id:'p2', top:330, count:1, resolved:false },
  ];
  const emailPins = [
    { id:'p3', top:18, count:1, resolved:false },
  ];

  /* Filter feed events by view */
  const filteredEvents = FEED_EVENTS.filter(e => {
    if (view === 'all') return true;
    if (view === 'doc') return ['prose','embed','file','choices'].includes(e.type);
    if (view === 'conv') return ['message','turn-end','todo'].includes(e.type);
    return true;
  });

  return (
    <div className="app">
      <TopBar
        session="launch-planning"
        view={view} setView={setView}
        turnState={turnState}
        onCmdK={() => setOverlay('cmdK')}
        onSettings={() => setOverlay('settings')}
      />

      <div className="main">
        <LeftRail active={leftActive} setActive={setLeftActive}/>
        {leftActive === 'sessions' && <SessionsPanel sessions={SESSIONS} onNew={() => setOverlay('newSession')}/>}
        {leftActive === 'named' && <NamedPanel items={NAMED} sessionSlug="launch-planning"/>}
        {leftActive === 'todos' && <TodosPanel todos={todos} onToggle={toggleTodo} onAdd={() => setOverlay('newTodo')} sessionSlug="launch-planning"/>}
        {leftActive === 'comments' && <CommentsListPanel threads={threads} sessionSlug="launch-planning"/>}
        {leftActive === 'search' && (
          <div className="left-panel">
            <div className="panel-head"><h3>Search</h3></div>
            <div style={{padding:14}}>
              <div className="panel-search" style={{margin:0}}>
                <IcSearch size={12} style={{color:'var(--ink-4)'}}/>
                <input placeholder="Search across all sessions…" autoFocus/>
              </div>
              <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink-4)',marginTop:14,textTransform:'uppercase',letterSpacing:'.1em'}}>QUICK</div>
              <div style={{marginTop:6,display:'flex',flexDirection:'column',gap:4,fontFamily:'var(--mono)',fontSize:12,color:'var(--ink-2)'}}>
                <div style={{padding:'6px 8px',borderRadius:5,background:'var(--bg)',cursor:'pointer'}}><span style={{color:'var(--ink-4)'}}>↩</span>&nbsp;&nbsp;Switch session…</div>
                <div style={{padding:'6px 8px',borderRadius:5,cursor:'pointer'}}><span style={{color:'var(--ink-4)'}}>+</span>&nbsp;&nbsp;New session</div>
                <div style={{padding:'6px 8px',borderRadius:5,cursor:'pointer'}}><span style={{color:'var(--ink-4)'}}>↳</span>&nbsp;&nbsp;Jump to named…</div>
              </div>
            </div>
          </div>
        )}

        <div className="feed-col" style={{background:'var(--canvas)'}}>
          <div className={`feed-scroll ${focusedThread ? 'dimmed' : ''}`} ref={feedRef} style={{position:'relative'}}>
            <div className="feed-inner">
              {filteredEvents.map((ev, i) => {
                if (ev.type === 'turn-end') return <TurnEnd key={i} who={ev.who} when={ev.when}/>;
                if (ev.type === 'message') return <MessageCard key={i} {...ev} focused={false}/>;
                if (ev.type === 'prose') {
                  const isLaunchPlan = ev.title === 'Launch Plan v1';
                  const isEmail = ev.title === 'Announcement Email v1';
                  const pins = isLaunchPlan ? launchPlanPins : (isEmail ? emailPins : []);
                  const focused = focusedThread && focusedThread.target === ev.title;
                  return (
                    <ProseCard key={i} {...ev} pins={pins}
                      onPinClick={onPinClick}
                      activePinId={focusedThread?.pinId}
                      focused={focused}>
                      {renderProse(ev.content)}
                    </ProseCard>
                  );
                }
                if (ev.type === 'choices') return (
                  <ChoicesCard key={i} {...ev} chosenId={choicesPick} onChoose={setChoicesPick}/>
                );
                if (ev.type === 'embed') return (
                  <EmbedCard key={i} {...ev} activeVariant={embedVariant} onVariantChange={setEmbedVariant} renderPreview={renderEmbed}/>
                );
                if (ev.type === 'todo') return (
                  <TodoCard key={i} {...ev} done={todos.find(t => t.id === ev.todoId)?.done} onToggle={() => toggleTodo(ev.todoId)}/>
                );
                if (ev.type === 'file') return <FileCard key={i} {...ev}/>;
                return null;
              })}
            </div>

            {/* scroll-to-bottom fab — show conditionally */}
            <button className="scroll-fab" style={{display:'none'}} onClick={() => {
              if (feedRef.current) feedRef.current.scrollTo({top: feedRef.current.scrollHeight, behavior:'smooth'});
            }}>
              <IcArrowDown size={12}/> New events
            </button>
          </div>
        </div>

        {!rightCollapsed && <RightPanel
          tab={rightTab} setTab={setRightTab}
          focusedComment={focusedThread}
          threads={threads}
          todos={todos}
          named={NAMED}
          onToggleTodo={toggleTodo}
          onResolve={resolve}
          onCloseFocus={() => setFocusedPinId(null)}
          onCollapse={() => setRightCollapsed(true)}
          onLogFilter={() => setOverlay('logFilter')}
        />}
      </div>

      <ComposeBar
        mode={composeMode} setMode={setComposeMode}
        commentTarget={commentTarget} setCommentTarget={setCommentTarget}
        replyTarget={replyTarget} setReplyTarget={setReplyTarget}
        text={composeText} setText={setComposeText}
        onSend={() => { setComposeText(''); setComposeMode('message'); }}
        onPresets={() => setOverlay('presets')}
      />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme" />
        <TweakSelect label="Visual theme" value={t.theme} onChange={v => setTweak('theme', v)}
          options={[
            {value:'light', label:'Light — default'},
            {value:'terminal', label:'Terminal — phosphor green'},
            {value:'ide', label:'IDE Dark — slate + blue'},
            {value:'solarized', label:'Solarized Dark'},
            {value:'brutalist', label:'Brutalist — pure mono'},
            {value:'cyber', label:'Cyberpunk — neon'},
          ]} />
        <TweakSection label="State" />
        <TweakRadio label="Turn" value={t.turnState} onChange={v => setTweak('turnState', v)}
          options={[{value:'user',label:'You'},{value:'agent',label:'Agent'},{value:'idle',label:'Idle'}]} />
        <TweakToggle label="Open comment overlay" value={t.showFocusedComment} onChange={v => setTweak('showFocusedComment', v)} />
        <TweakSection label="Accent (light theme)" />
        <TweakRadio label="Accent" value={t.accent} onChange={v => setTweak('accent', v)}
          options={[{value:'amber',label:'Amber'},{value:'cool',label:'Cool'},{value:'mono',label:'Mono'}]} />
        <TweakSection label="Open overlay" />
        <TweakButton label="+ Add todo" onClick={() => setOverlay('newTodo')}/>
        <TweakButton label="+ New session" onClick={() => setOverlay('newSession')}/>
        <TweakButton label="Command palette (⌘K)" onClick={() => setOverlay('cmdK')}/>
        <TweakButton label="Presets (⌘P)" onClick={() => setOverlay('presets')}/>
        <TweakButton label="Skills (⌘⇧K)" onClick={() => setOverlay('skills')}/>
        <TweakButton label="Settings" onClick={() => setOverlay('settings')}/>
        <TweakButton label="Activity log filter" onClick={() => { setRightTab('log'); setOverlay('logFilter'); }}/>
      </TweaksPanel>

      {/* Overlays */}
      {overlay === 'newTodo'   && <NewTodoModal     onClose={() => setOverlay(null)} onCreate={() => {}}/>}
      {overlay === 'newSession'&& <NewSessionModal  onClose={() => setOverlay(null)} onCreate={() => {}}/>}
      {overlay === 'settings'  && <SettingsModal    onClose={() => setOverlay(null)}/>}
      {overlay === 'cmdK'      && <CommandPalette   onClose={() => setOverlay(null)} sessions={SESSIONS} named={NAMED} todos={todos} threads={threads}/>}
      {overlay === 'presets'   && <PresetsDropdown  onClose={() => setOverlay(null)} onPick={(p) => setComposeText(p.body)}/>}
      {overlay === 'skills'    && <SkillsPalette    onClose={() => setOverlay(null)}/>}
      {overlay === 'logFilter' && <LogFilterPopover onClose={() => setOverlay(null)}/>}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
