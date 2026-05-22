/* Card components for the F-Mark feed */

const Avatar = ({ who, size = 'sm', active = false }) => {
  const isUser = who === 'Roey';
  const cls = `avatar ${isUser ? 'user' : 'agent'} ${size} ${active ? 'active' : ''}`;
  return <span className={cls}>{isUser ? 'R' : 'C'}</span>;
};

const TurnEnd = ({ who, when }) => (
  <div className={`turn-end ${who === 'Roey' ? 'user' : 'agent'}`}>
    <span className="line"></span>
    <span className="label">
      <span className="dot"></span>
      {who === 'Roey' ? "Roey's" : "Claude's"} turn ended · {when}
    </span>
    <span className="line"></span>
  </div>
);

const ClusterHead = ({ who, when, badge, badgeColor }) => {
  const isUser = who === 'Roey';
  return (
    <div className="card-head">
      <Avatar who={who} size="sm" />
      <span className="who">{who}{!isUser && <span style={{color:'var(--ink-4)',fontWeight:400,marginLeft:4,fontFamily:'var(--mono)',fontSize:11}}>· claude-code</span>}</span>
      <span className="when">{when}</span>
      {badge && <span className="badge" style={badgeColor ? {color: badgeColor.fg, background: badgeColor.bg, border:`1px solid ${badgeColor.bd||'transparent'}`} : null}>{badge}</span>}
      <button className="menu" title="More"><IcMore size={14} /></button>
    </div>
  );
};

/* ---------- Message Card (unnamed prose) ---------- */
const MessageCard = ({ who, when, text, reply, focused }) => {
  const isUser = who === 'Roey';
  return (
    <div className={`card msg-card ${isUser ? 'user' : 'agent'} ${focused ? 'focused' : ''}`} style={reply ? {marginLeft:32} : null}>
      <div className="stripe"></div>
      <div className="body">
        <div className="card-head">
          <Avatar who={who} size="sm" />
          <span className="who">{who}</span>
          <span className="when">{when}</span>
          {reply && <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink-4)'}}>↩ replying to {reply}</span>}
        </div>
        <div className="text" dangerouslySetInnerHTML={{__html: text}}></div>
        <div className="actions">
          <button><IcReply size={12} style={{marginRight:4,verticalAlign:-2}}/> Reply</button>
          <button><IcComment size={12} style={{marginRight:4,verticalAlign:-2}}/> Comment</button>
          <button>Copy</button>
        </div>
      </div>
    </div>
  );
};

/* ---------- Named Prose Card ---------- */
const ProseCard = ({ who, when, title, frontmatter, children, pins = [], onPinClick, activePinId, focused, supersededBy }) => {
  const isUser = who === 'Roey';
  return (
    <div className={`card prose-card ${isUser ? 'user' : 'agent'} ${focused ? 'focused' : ''}`}>
      <div className="prose-head">
        <span className="stripe-dot"></span>
        <span className="who">{who}{!isUser && <span style={{color:'var(--ink-4)',fontWeight:400,marginLeft:4,fontFamily:'var(--mono)',fontSize:11}}> · claude-code</span>}</span>
        <span className="when">{when}</span>
        <span className="badge"><IcDoc size={10} style={{marginRight:3,verticalAlign:-1}}/> NAMED</span>
        <button className="menu" title="More"><IcMore size={14}/></button>
      </div>
      <div className={`prose-body ${isUser ? 'user' : ''}`}>
        <h1 className="prose-title">{title}</h1>
        {frontmatter && (
          <div className="prose-frontmatter">
            {Object.entries(frontmatter).map(([k,v]) => (
              <span key={k}><b>{k}:</b> {v}</span>
            ))}
          </div>
        )}
        <div className="prose-content">{children}</div>
        {pins.map(pin => (
          <button
            key={pin.id}
            className={`prose-pin ${pin.resolved ? 'resolved' : ''} ${activePinId === pin.id ? 'active' : ''}`}
            style={{top: pin.top}}
            onClick={() => onPinClick && onPinClick(pin.id)}
            title={`${pin.count} comment${pin.count > 1 ? 's' : ''}`}
          >
            <span className="dot"></span>
            {pin.count}
          </button>
        ))}
      </div>
      {supersededBy && (
        <div style={{padding:'8px 18px',background:'var(--user-tint)',borderTop:'1px solid var(--line-3)',fontFamily:'var(--mono)',fontSize:11.5,color:'var(--user)',display:'flex',alignItems:'center',gap:6}}>
          ↻ Newer version exists → <a style={{color:'var(--user)',textDecoration:'underline'}}>{supersededBy}</a>
        </div>
      )}
      <div className="prose-foot">
        <button><IcArrowDown size={11}/> Collapse</button>
        <button><IcComment size={11}/> Comment</button>
        <button><IcEdit size={11}/> Revise</button>
        <span className="spacer"></span>
        <span className="ver">v1 · 412 words · 6 sections</span>
      </div>
    </div>
  );
};

/* ---------- Choices Card ---------- */
const ChoicesCard = ({ who, when, question, options, chosenId, onChoose, answeredWhen }) => {
  return (
    <div className="card" style={{display:'block'}}>
      <div className="choices-card">
        <div className="choices-head">
          <Avatar who={who} size="sm" />
          <span style={{fontWeight:600}}>{who}</span>
          <span className="when" style={{color:'var(--ink-4)',fontFamily:'var(--mono)',fontSize:11}}>{when}</span>
          <span className="badge">? CHOOSE</span>
          <button className="menu" title="More"><IcMore size={14}/></button>
        </div>
        <div className="choices-body">
          <h3 className="choices-q">{question}</h3>
          {options.map(opt => {
            const chosen = chosenId === opt.id;
            const faded = chosenId && !chosen;
            return (
              <div key={opt.id} className={`choice-opt ${chosen ? 'chosen' : ''} ${faded ? 'faded' : ''}`} onClick={() => onChoose(opt.id)}>
                <div className="choice-radio"></div>
                <div style={{flex:1}}>
                  <div className="lbl">{opt.label}{chosen && <span className="check">✓ Chose</span>}</div>
                  <div className="desc">{opt.desc}</div>
                </div>
              </div>
            );
          })}
          {chosenId && (
            <div className="choices-foot">
              Answered {answeredWhen} · <span className="change" onClick={() => onChoose(null)}>change answer</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------- HTML Embed Card ---------- */
const EmbedCard = ({ who, when, title, variants, activeVariant, onVariantChange, renderPreview }) => {
  return (
    <div className="card" style={{display:'block'}}>
      <div className="embed-card">
        <div className="embed-head">
          <Avatar who={who} size="sm" />
          <span style={{fontWeight:600}}>{who}</span>
          <span style={{color:'var(--ink-4)',fontFamily:'var(--mono)',fontSize:11}}>{when}</span>
          <span className="badge"><IcImage size={10} style={{marginRight:3,verticalAlign:-1}}/> EMBED</span>
          <button className="menu" title="More"><IcMore size={14}/></button>
        </div>
        <div className="embed-title">{title} — variant {activeVariant?.toUpperCase()}</div>
        {variants && variants.length > 1 && (
          <div className="variants">
            <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink-3)',marginRight:4}}>Compare:</span>
            {variants.map(v => (
              <button key={v} className={`variant ${activeVariant === v ? 'active' : ''}`} onClick={() => onVariantChange(v)}>{v.toUpperCase()}</button>
            ))}
          </div>
        )}
        <div className="embed-frame">
          {renderPreview ? renderPreview(activeVariant) : (
            <div className="placeholder">
              <div style={{display:'flex',gap:6,alignItems:'center',color:'var(--ink-3)'}}>
                <IcImage size={20}/>
              </div>
              <div className="label">interactive HTML preview</div>
            </div>
          )}
        </div>
        <div className="embed-foot">
          <button><IcExpand size={11}/> Fullscreen</button>
          <button><IcRefresh size={11}/> Reload</button>
          <button><IcCode size={11}/> View source</button>
          <span className="spacer"></span>
          <button><IcComment size={11}/> Comment</button>
        </div>
      </div>
    </div>
  );
};

/* ---------- Todo Card (inline in feed) ---------- */
const TodoCard = ({ who, when, title, desc, assignee, done, onToggle }) => {
  return (
    <div className="card" style={{display:'block'}}>
      <div className={`todo-card ${done ? 'done' : ''}`}>
        <div className="todo-head">
          <Avatar who={who} size="sm" />
          <span className="who">{who}</span>
          <span>· {when}</span>
          <span style={{marginLeft:'auto',color:'var(--ink-3)'}}>{done ? '✓ todo completed' : '✓ todo created'}</span>
        </div>
        <div className="todo-body">
          <button className={`todo-check ${done ? 'done' : ''}`} onClick={onToggle}>
            {done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="m5 13 4 4 10-10"/></svg>}
          </button>
          <div className="todo-info">
            <div className="todo-title">{title}</div>
            {desc && <div className="todo-desc">"{desc}"</div>}
            <div className="todo-meta">
              {assignee ? (
                <span className="assign-badge"><Avatar who={assignee} size="sm" /> assigned to {assignee}</span>
              ) : (
                <span className="assign-badge unassigned">unassigned</span>
              )}
              {!done && <>
                <button style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink-3)',padding:'2px 8px',borderRadius:4}}>Reassign</button>
                <button style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink-3)',padding:'2px 8px',borderRadius:4}}>Comment</button>
              </>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------- File Card ---------- */
const FileCard = ({ who, when, name, size, mime, desc, kind = 'PNG' }) => {
  return (
    <div className="card" style={{display:'block'}}>
      <div className="card-head" style={{paddingLeft:0,marginBottom:8}}>
        <Avatar who={who} size="sm" />
        <span className="who">{who}</span>
        <span className="when">{when}</span>
        <span className="badge">📎 FILE</span>
      </div>
      <div className="file-card">
        <div className="file-thumb">{kind}</div>
        <div className="file-info">
          <div className="file-name">{name}</div>
          <div className="file-meta">{size} · {mime}</div>
          {desc && <div className="file-desc">"{desc}"</div>}
        </div>
        <div className="file-actions">
          <button>Open</button>
          <button>Download</button>
          <button><IcComment size={10} style={{marginRight:3,verticalAlign:-1}}/> Comment</button>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, {Avatar, TurnEnd, ClusterHead, MessageCard, ProseCard, ChoicesCard, EmbedCard, TodoCard, FileCard});
