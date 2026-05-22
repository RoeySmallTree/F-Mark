/* Minimal feather-style stroke icons, sized to 16/14 by default */
const Icon = ({ children, size = 16, stroke = 1.6, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {children}
  </svg>
);

const IcFolder = (p) => <Icon {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></Icon>;
const IcDoc = (p) => <Icon {...p}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6M9 8h2"/></Icon>;
const IcCheck = (p) => <Icon {...p}><path d="M4 6h13"/><path d="M4 12h13"/><path d="M4 18h13"/><circle cx="20" cy="6" r="1.5"/><circle cx="20" cy="12" r="1.5"/><circle cx="20" cy="18" r="1.5"/></Icon>;
const IcComment = (p) => <Icon {...p}><path d="M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-5.4A8 8 0 1 1 21 12z"/></Icon>;
const IcSearch = (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>;
const IcGear = (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .4 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.4 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .4-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 9a1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.4H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.4l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.4 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"/></Icon>;
const IcPlus = (p) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>;
const IcX = (p) => <Icon {...p}><path d="M6 6 18 18M6 18 18 6"/></Icon>;
const IcMore = (p) => <Icon {...p}><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></Icon>;
const IcChevD = (p) => <Icon {...p}><path d="M6 9l6 6 6-6"/></Icon>;
const IcChevR = (p) => <Icon {...p}><path d="M9 6l6 6-6 6"/></Icon>;
const IcArrowR = (p) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6"/></Icon>;
const IcArrowDown = (p) => <Icon {...p}><path d="M12 5v14M6 13l6 6 6-6"/></Icon>;
const IcReply = (p) => <Icon {...p}><path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 7 7v4"/></Icon>;
const IcEye = (p) => <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></Icon>;
const IcCols = (p) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16M15 4v16"/></Icon>;
const IcDoc2 = (p) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M7 9h10M7 13h10M7 17h6"/></Icon>;
const IcChat = (p) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M7 9h10M7 13h6"/></Icon>;
const IcCmd = (p) => <Icon {...p}><path d="M9 6a3 3 0 1 0 3 3V6m0 0v9a3 3 0 1 0 3-3h-9a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12"/></Icon>;
const IcExpand = (p) => <Icon {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></Icon>;
const IcRefresh = (p) => <Icon {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></Icon>;
const IcCode = (p) => <Icon {...p}><path d="m8 6-6 6 6 6M16 6l6 6-6 6"/></Icon>;
const IcPin = (p) => <Icon {...p}><path d="M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-5.4A8 8 0 1 1 21 12z"/></Icon>;
const IcAt = (p) => <Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></Icon>;
const IcZap = (p) => <Icon {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></Icon>;
const IcEdit = (p) => <Icon {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></Icon>;
const IcImage = (p) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5L4 20"/></Icon>;

Object.assign(window, {Icon, IcFolder, IcDoc, IcDoc2, IcCheck, IcComment, IcSearch, IcGear, IcPlus, IcX, IcMore, IcChevD, IcChevR, IcArrowR, IcArrowDown, IcReply, IcEye, IcCols, IcChat, IcCmd, IcExpand, IcRefresh, IcCode, IcPin, IcAt, IcZap, IcEdit, IcImage});
