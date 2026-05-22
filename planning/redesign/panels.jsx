/* Panels: top bar, left panel, right panel, compose bar */

const LOGO_ASCII = `      _~v~_       _~~~~~~~~~~~_
   -[[]]=  #]]]]]]]]]]]]]]]]<-
 *<[<+~~=  ====================>-
=                              =+
=    -----     -----            =
=   /  M  \\   /| ^ |\\           =
=  /|  *  |\\ /  | | |           =
=  ||  -  || \\  | | |           =
=  ||     ||  \\ | | |           =
=  \\| --- |/   \\|_|/            =
=   --///-      ---             =
=                               =+
 *<[]+~~=  ====================>-
   -[[]]=  #]]]]]]]]]]]]]]]]<-`;

const FMARK_GLYPH = `▘▟▙▘ ▟▘▘
▘▙▙▘ ▟▙▘`;

/* Top bar */
const TopBar = ({ session, view, setView, turnState, onCmdK, onSettings }) => {
  return (
    <div className="topbar">
      <div className="brand" title="F-Mark">
        <pre className="glyph" style={{fontSize:7,lineHeight:1,margin:0,color:'var(--ink-2)'}}>
{`▟▙ ╱╲
▟▙ ▟▘▘`}
        </pre>
        <span className="name">F·Mark</span>
      </div>
      <button className="breadcrumb">
        <span className="proj">acme-platform</span>
        <span className="sep">/</span>
        <span className="sess">{session}</span>
        <IcChevD size={12} className="caret" />
      </button>

      <div className="topbar-center">
        <div className="view-toggle">
          <button className={view==='all' ? 'active' : ''} onClick={() => setView('all')}><IcCols size={12}/> Everything</button>
          <button className={view==='doc' ? 'active' : ''} onClick={() => setView('doc')}><IcDoc2 size={12}/> Document</button>
          <button className={view==='conv' ? 'active' : ''} onClick={() => setView('conv')}><IcChat size={12}/> Conversation</button>
        </div>
      </div>

      <div className="topbar-right">
        {turnState === 'user' && (
          <div className="turn-pill"><span className="dot"></span>Your turn</div>
        )}
        {turnState === 'agent' && (
          <div className="turn-pill thinking"><span className="dot"></span>Agent thinking…</div>
        )}
        {turnState === 'idle' && (
          <div className="turn-pill" style={{background:'var(--panel)',color:'var(--ink-3)',borderColor:'var(--line)'}}>
            <span className="dot" style={{background:'var(--ink-4)',boxShadow:'none'}}></span>Idle
          </div>
        )}
        <div className="participants" title="Participants" style={{marginRight:6}}>
          <span className="avatar user lg active" title="Roey · us-a7f3">R</span>
          <span className="avatar agent lg" title="Claude Code · ag-c92e">C</span>
        </div>
        <button className="icon-btn" title="Search (⌘K)" onClick={onCmdK}>
          <IcSearch size={15}/>
          <span className="kbd">⌘K</span>
        </button>
        <button className="icon-btn" title="Settings" onClick={onSettings}><IcGear size={15}/></button>
      </div>
    </div>
  );
};

/* Left rail icons */
const LeftRail = ({ active, setActive }) => {
  const items = [
    { id: 'sessions', icon: <IcFolder size={17}/>, label: 'Sessions' },
    { id: 'named',    icon: <IcDoc size={17}/>,    label: 'Named' },
    { id: 'todos',    icon: <IcCheck size={17}/>,  label: 'Todos', badge: 3 },
    { id: 'comments', icon: <IcComment size={17}/>, label: 'Comments', badge: 2 },
    { id: 'search',   icon: <IcSearch size={17}/>, label: 'Search' },
  ];
  return (
    <div className="left-rail">
      {items.map(it => (
        <button key={it.id} className={`rail-btn ${active===it.id?'active':''}`} title={it.label} onClick={() => setActive(it.id)}>
          {it.icon}
          {it.badge && <span className="badge">{it.badge}</span>}
        </button>
      ))}
    </div>
  );
};

/* Left panel — sessions */
const SessionsPanel = ({ sessions, onClose, onNew }) => {
  const groups = {};
  sessions.forEach(s => { (groups[s.group] = groups[s.group] || []).push(s); });
  return (
    <div className="left-panel">
      <div className="panel-head">
        <h3>Sessions</h3>
        <button className="new-btn" onClick={onNew}><IcPlus size={10} style={{marginRight:3,verticalAlign:-1}}/> NEW</button>
      </div>
      <div className="panel-search">
        <IcSearch size={12} style={{color:'var(--ink-4)'}}/>
        <input placeholder="Search sessions…"/>
        <span className="kbd-chip">⌘F</span>
      </div>
      <div className="panel-list">
        {Object.entries(groups).map(([g, list]) => (
          <div key={g}>
            <div className="group-label">{g}</div>
            {list.map(s => (
              <div key={s.id} className={`session-item ${s.current ? 'active' : ''}`}>
                <div className="row1">
                  <span className={`status-dot ${s.active ? 'active' : 'idle'}`}></span>
                  <span className="slug">{s.slug}</span>
                </div>
                <div className="summary">"{s.summary}"</div>
                <div className="meta">
                  {s.todos > 0 && <span>{s.todos} todos</span>}
                  {s.todos > 0 && s.contribs > 0 && <span className="sep">·</span>}
                  <span>{s.contribs} contributions</span>
                  <span className="sep">·</span>
                  <span>{s.when}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/* Left panel — named contributions */
const NamedPanel = ({ items, onJump, sessionSlug }) => (
  <div className="left-panel">
    <div className="panel-head" style={{flexDirection:'column',alignItems:'flex-start',gap:0}}>
      <h3>Named contributions</h3>
      <div className="scope">in <b>{sessionSlug}</b></div>
    </div>
    <div className="panel-list" style={{padding:'0 12px 12px'}}>
      {items.map(it => (
        <div key={it.id} className="session-item" style={{padding:'10px 8px'}} onClick={() => onJump(it.id)}>
          <div className="row1" style={{gap:9}}>
            <IcDoc size={14} style={{color:'var(--agent)'}}/>
            <span style={{fontFamily:'var(--serif)',fontWeight:600,fontSize:14,color:'var(--ink)'}}>{it.title}</span>
          </div>
          <div className="summary" style={{paddingLeft:23,fontStyle:'italic'}}>"{it.preview}"</div>
          <div className="meta" style={{paddingLeft:23}}>
            <span>by {it.by}</span>
            <span className="sep">·</span>
            <span>{it.when}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

/* Left panel — todos */
const TodosPanel = ({ todos, onToggle, onAdd, sessionSlug }) => {
  const open = todos.filter(t => !t.done);
  const done = todos.filter(t => t.done);
  return (
    <div className="left-panel">
      <div className="panel-head" style={{flexDirection:'column',alignItems:'stretch',gap:0,paddingBottom:4}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <h3>Todos</h3>
          <button className="new-btn" onClick={onAdd}><IcPlus size={10} style={{marginRight:3,verticalAlign:-1}}/> ADD</button>
        </div>
        <div className="scope">in <b>{sessionSlug}</b></div>
      </div>
      <div className="panel-list todo-list" style={{padding:'0 14px 12px'}}>
        <div className="group-label" style={{padding:'8px 0 4px'}}>OPEN ({open.length})</div>
        {open.map(t => (
          <div key={t.id} className="todo-list-item" onClick={() => onToggle(t.id)}>
            <button className={`todo-check ${t.done ? 'done':''}`}></button>
            <div style={{flex:1}}>
              <div className="ttl">{t.title}</div>
              <div className="meta-row">
                {t.assignee ? <span>assigned to {t.assignee}</span> : <span>unassigned</span>}
              </div>
            </div>
          </div>
        ))}
        <div className="group-label" style={{padding:'14px 0 4px'}}>DONE ({done.length})</div>
        {done.map(t => (
          <div key={t.id} className="todo-list-item done" onClick={() => onToggle(t.id)}>
            <button className="todo-check done">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="m5 13 4 4 10-10"/></svg>
            </button>
            <div style={{flex:1}}>
              <div className="ttl">{t.title}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* Left panel — comments */
const CommentsListPanel = ({ threads, onJump, sessionSlug }) => {
  const byTarget = {};
  threads.forEach(t => { (byTarget[t.target] = byTarget[t.target] || []).push(t); });
  return (
    <div className="left-panel">
      <div className="panel-head" style={{flexDirection:'column',alignItems:'flex-start',gap:0}}>
        <h3>Comments</h3>
        <div className="scope">in <b>{sessionSlug}</b></div>
      </div>
      <div className="panel-list" style={{padding:'0 12px 12px'}}>
        {Object.entries(byTarget).map(([target, list]) => (
          <div key={target} style={{marginBottom:10}}>
            <div className="group-label" style={{padding:'10px 0 6px'}}>ON "{target}"</div>
            {list.map(t => (
              <div key={t.id} className="session-item" style={{padding:'9px 10px'}} onClick={() => onJump(t)}>
                <div style={{display:'flex',gap:7,alignItems:'flex-start'}}>
                  <Avatar who={t.author} size="sm" />
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'baseline',gap:6,fontSize:12}}>
                      <b style={{color:'var(--ink)'}}>{t.author}</b>
                      <span style={{color:'var(--ink-4)',fontFamily:'var(--mono)',fontSize:10.5}}>{t.when}</span>
                    </div>
                    <div style={{fontSize:12.5,color:'var(--ink-2)',margin:'2px 0 4px',fontFamily:'var(--serif)',fontStyle:'italic'}}>"{t.first}"</div>
                    <div style={{display:'flex',alignItems:'center',gap:6,fontFamily:'var(--mono)',fontSize:10.5,color: t.resolved ? 'var(--ink-4)':'var(--user)'}}>
                      <span style={{display:'inline-flex',width:6,height:6,borderRadius:3,background: t.resolved ? 'var(--ink-4)':'var(--user)'}}></span>
                      {t.resolved ? 'Resolved' : `${t.replies} ${t.replies===1?'reply':'replies'} · unresolved`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/* Right panel */
const RightPanel = ({ tab, setTab, focusedComment, threads, todos, named, onToggleTodo, onResolve, onCloseFocus, onJumpFeed, onCollapse, onLogFilter }) => {
  return (
    <div className="right-panel">
      {focusedComment ? (
        <div className="panel-head" style={{flexDirection:'column',alignItems:'stretch',gap:0,paddingBottom:8}}>
          <div className="subhead">Comments on</div>
          <div style={{display:'flex',alignItems:'center',gap:6,width:'100%'}}>
            <h3>{focusedComment.target}</h3>
            <button className="icon-btn" style={{marginLeft:'auto'}} onClick={onCloseFocus} title="Close thread"><IcX size={14}/></button>
          </div>
        </div>
      ) : (
        <>
          <div className="right-tabs">
            <button className={tab==='todos'?'active':''} onClick={() => setTab('todos')}>
              <IcCheck size={12}/> Todos <span className="ct">{todos.filter(t=>!t.done).length}</span>
            </button>
            <button className={tab==='comments'?'active':''} onClick={() => setTab('comments')}>
              <IcComment size={12}/> Comments <span className="ct">{threads.filter(t=>!t.resolved).length}</span>
            </button>
            <button className={tab==='named'?'active':''} onClick={() => setTab('named')}>
              <IcDoc size={12}/> Named <span className="ct">{named.length}</span>
            </button>
            <button className={tab==='log'?'active':''} onClick={() => setTab('log')}>Log</button>
          </div>
          {tab === 'log' && (
            <div style={{padding:'8px 14px 0',display:'flex',alignItems:'center',gap:8}}>
              <span className="scope" style={{flex:1}}>in <b>launch-planning</b> · newest first</span>
              <button onClick={onLogFilter} style={{fontFamily:'var(--mono)',fontSize:10.5,color:'var(--ink-3)',padding:'3px 8px',borderRadius:4,border:'1px solid var(--line)',background:'var(--bg)',display:'flex',alignItems:'center',gap:4}}>
                Filter <IcChevD size={10}/>
              </button>
            </div>
          )}
          {tab !== 'log' && (
            <div className="scope" style={{padding:'8px 14px 0'}}>in <b>launch-planning</b></div>
          )}
        </>
      )}

      <div className="panel-scroll">
        {focusedComment && (
          <FocusedCommentView thread={focusedComment} onResolve={onResolve}/>
        )}

        {!focusedComment && tab==='todos' && (
          <div className="todo-list">
            <div className="group-label">OPEN ({todos.filter(t=>!t.done).length})</div>
            {todos.filter(t=>!t.done).map(t => (
              <div key={t.id} className="todo-list-item" onClick={() => onToggleTodo(t.id)}>
                <button className="todo-check"></button>
                <div style={{flex:1}}>
                  <div className="ttl">{t.title}</div>
                  <div className="meta-row">{t.assignee ? <>assigned to {t.assignee}</> : 'unassigned'}</div>
                </div>
              </div>
            ))}
            <div className="group-label">DONE ({todos.filter(t=>t.done).length})</div>
            {todos.filter(t=>t.done).map(t => (
              <div key={t.id} className="todo-list-item done" onClick={() => onToggleTodo(t.id)}>
                <button className="todo-check done"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="m5 13 4 4 10-10"/></svg></button>
                <div style={{flex:1}}><div className="ttl">{t.title}</div></div>
              </div>
            ))}
          </div>
        )}

        {!focusedComment && tab==='comments' && (
          <div>
            {threads.map(t => (
              <div key={t.id} className={`thread ${t.resolved ? 'resolved' : ''}`}>
                <div className="comments-on">ON <b>{t.target}</b></div>
                {t.lines && <div className="anchor-snippet"><span className="ln">Lines {t.lines}</span>"{t.snippet}"</div>}
                <div className="thread-msg">
                  <Avatar who={t.author} size="sm"/>
                  <div className="body">
                    <div className="head"><span className="who">{t.author}</span><span className="when">{t.when}</span></div>
                    <div className="txt">{t.first}</div>
                  </div>
                </div>
                {t.replies > 0 && <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink-3)',padding:'0 0 4px 26px'}}>↳ {t.replies} {t.replies===1?'reply':'replies'}</div>}
              </div>
            ))}
          </div>
        )}

        {!focusedComment && tab==='named' && (
          <div className="todo-list">
            {named.map(n => (
              <div key={n.id} className="todo-list-item" onClick={() => onJumpFeed && onJumpFeed(n.id)}>
                <IcDoc size={14} style={{color:'var(--agent)',marginTop:1,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontFamily:'var(--serif)',fontSize:14,fontWeight:600,color:'var(--ink)'}}>{n.title}</div>
                  <div style={{fontFamily:'var(--serif)',fontStyle:'italic',fontSize:12.5,color:'var(--ink-3)',margin:'2px 0'}}>"{n.preview}"</div>
                  <div className="meta-row">by {n.by} · {n.when}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!focusedComment && tab==='log' && (
          <div>
            {[
              ['14:39:01','agent','turn-end','ag-c92e'],
              ['14:38:45','agent','prose (named)','"Launch Plan v1"'],
              ['14:38:22','agent','todo','"Draft announcement email"'],
              ['14:38:01','agent','choices','"Which approach?"'],
              ['14:37:50','user','turn-end','us-a7f3'],
              ['14:37:40','user','prose (message)','"Let\'s plan the launch…"'],
              ['14:37:21','agent','embed','"Hero — variant A"'],
              ['14:37:02','agent','prose (named)','"Risk Analysis"'],
              ['14:36:30','user','file','architecture-diagram.png'],
              ['14:36:00','user','turn-end','us-a7f3'],
              ['14:35:42','user','prose (message)','"Let\'s plan the v1 launch…"'],
            ].map((row,i) => (
              <div key={i} style={{display:'grid',gridTemplateColumns:'56px 14px 1fr',gap:8,alignItems:'baseline',padding:'5px 0',borderBottom:'1px dashed var(--line-2)',fontFamily:'var(--mono)',fontSize:11.5}}>
                <span style={{color:'var(--ink-4)'}}>{row[0]}</span>
                <span style={{display:'inline-block',width:7,height:7,borderRadius:4,background: row[1]==='user'?'var(--user)':'var(--agent)'}}></span>
                <span style={{color:'var(--ink-2)'}}><span style={{color:'var(--ink)',fontWeight:500}}>{row[2]}</span> <span style={{color:'var(--ink-4)'}}>{row[3]}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* Focused-comment view: when a pin is clicked */
const FocusedCommentView = ({ thread, onResolve }) => (
  <div>
    {thread.lines && <div className="anchor-snippet"><span className="ln">Lines {thread.lines}</span>"{thread.snippet}"</div>}
    <div className="thread-msg">
      <Avatar who={thread.author} size="sm"/>
      <div className="body">
        <div className="head"><span className="who">{thread.author}</span><span className="when">{thread.when}</span></div>
        <div className="txt">{thread.first}</div>
      </div>
    </div>
    {(thread.replyList || []).map((r,i) => (
      <div key={i} className="thread-msg reply">
        <Avatar who={r.author} size="sm"/>
        <div className="body">
          <div className="head"><span className="who">{r.author}</span><span className="when">{r.when}</span></div>
          <div className="txt">{r.text}</div>
        </div>
      </div>
    ))}
    <div className="thread-actions" style={{marginTop:14}}>
      <div className="reply-input">Reply…</div>
      <button className={`resolve-btn ${thread.resolved ? 'resolved' : ''}`} onClick={() => onResolve(thread.id)}>
        {thread.resolved ? '✓ Resolved' : 'Resolve'}
      </button>
    </div>

    {thread.others && thread.others.length > 0 && (
      <div style={{marginTop:24}}>
        <div className="group-label" style={{padding:'8px 0'}}>OTHER THREADS ({thread.others.length})</div>
        {thread.others.map((o,i) => (
          <div key={i} className="thread" style={{borderBottom:'1px solid var(--line-2)',paddingBottom:10}}>
            <div className="anchor-snippet" style={{marginBottom:6}}><span className="ln">Lines {o.lines}</span>"{o.snippet}"</div>
            <div className="thread-msg">
              <Avatar who={o.author} size="sm"/>
              <div className="body">
                <div className="head"><span className="who">{o.author}</span><span className="when">{o.when}</span></div>
                <div className="txt">{o.first}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

/* Compose bar */
const ComposeBar = ({ mode, setMode, commentTarget, setCommentTarget, replyTarget, setReplyTarget, text, setText, onSend, onPresets }) => {
  const isComment = mode === 'comment' || commentTarget;
  const isNamed = mode === 'named';
  const isReply = !!replyTarget;

  const sendLabel = isComment ? 'Post comment' : (isReply ? 'Send' : 'End turn');
  const placeholder = isComment ? 'Write your comment…'
                    : isReply ? 'Write your reply…'
                    : isNamed ? 'Write the contribution content…'
                    : 'Write a message or ⌘N to name a contribution…';

  return (
    <div className="compose">
      <div className="compose-inner">
        {commentTarget && (
          <div className="compose-target">
            <IcComment size={12}/>
            Commenting on <b style={{fontFamily:'var(--serif)',fontStyle:'italic',fontWeight:600}}>"{commentTarget.target}"</b> · lines {commentTarget.lines}
            <button className="close" onClick={() => setCommentTarget(null)}><IcX size={12}/></button>
          </div>
        )}
        {replyTarget && (
          <div className="compose-target" style={{background:'var(--agent-tint)',borderColor:'var(--agent-tint-2)',color:'#7a4513'}}>
            <IcReply size={12}/>
            Replying to <b>{replyTarget}</b>'s message
            <button className="close" onClick={() => setReplyTarget(null)}><IcX size={12}/></button>
          </div>
        )}
        {isNamed && !isComment && (
          <div className="compose-name">
            <label>NAME</label>
            <input placeholder="Name this contribution…" defaultValue="Launch Plan v2"/>
          </div>
        )}
        <div className="compose-box">
          <textarea
            placeholder={placeholder}
            value={text}
            onChange={e => setText(e.target.value)}
            rows={isNamed ? 4 : 2}
          />
          <div className="compose-actions">
            <button className={`mode-btn ${isComment ? 'active' : ''}`} onClick={() => setMode(isComment ? 'message' : 'comment')}>
              <IcComment size={11}/> Comment <span className="kbd">⌘/</span>
            </button>
            <button className={`mode-btn ${isNamed ? 'active' : ''}`} onClick={() => setMode(isNamed ? 'message' : 'named')}>
              <IcDoc size={11}/> Name it <span className="kbd">⌘N</span>
            </button>
            <button className="mode-btn" onClick={onPresets}>
              <IcZap size={11}/> Presets <span className="kbd">⌘P</span>
            </button>
            <button className={`send-btn ${!text ? 'outline' : ''}`} onClick={onSend}>
              {sendLabel}
              {!isComment && <IcArrowR size={12}/>}
              <span className="kbd">⌘↵</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* Right rail — mirrors the right panel tabs (per spec: "thin rail of icons matching the panel categories") */
const RightRail = ({ tab, setTab, collapsed, setCollapsed, todos, threads, named }) => {
  const items = [
    { id: 'todos',    icon: <IcCheck size={17}/>,   label: 'Open todos',         count: todos.filter(t=>!t.done).length },
    { id: 'comments', icon: <IcComment size={17}/>, label: 'Comment threads',    count: threads.filter(t=>!t.resolved).length },
    { id: 'named',    icon: <IcDoc size={17}/>,     label: 'Named contributions', count: named.length },
    { id: 'log',      icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>, label: 'Activity log' },
  ];
  const handleClick = (id) => {
    // Click same tab when expanded → collapse. Click any tab when collapsed → expand to that tab.
    if (collapsed) { setCollapsed(false); setTab(id); }
    else if (tab === id) { setCollapsed(true); }
    else { setTab(id); }
  };
  return (
    <div className="right-rail">
      {items.map(it => (
        <button
          key={it.id}
          className={`rail-btn ${!collapsed && tab===it.id ? 'active' : ''}`}
          title={it.label}
          onClick={() => handleClick(it.id)}
        >
          {it.icon}
          {it.count > 0 && <span className="badge" style={{background: it.id==='comments'?'var(--user)':'var(--ink)'}}>{it.count}</span>}
        </button>
      ))}
      <div style={{flex:1}}></div>
      <button className="rail-btn" title={collapsed ? 'Expand panel' : 'Collapse panel'} onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? <IcChevR size={15} style={{transform:'scaleX(-1)'}}/> : <IcChevR size={15}/>}
      </button>
    </div>
  );
};

Object.assign(window, {LOGO_ASCII, FMARK_GLYPH, TopBar, LeftRail, RightRail, SessionsPanel, NamedPanel, TodosPanel, CommentsListPanel, RightPanel, ComposeBar});
