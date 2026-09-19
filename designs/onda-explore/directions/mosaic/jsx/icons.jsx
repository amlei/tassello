/* icons.jsx — 内联 SVG 图标 */
function IcArrowLeft({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3L5 8l5 5" />
    </svg>
  );
}
function IcPlus({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M7 2v10M2 7h10" />
    </svg>
  );
}
function IcCheck({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7l3 3 6-7" />
    </svg>
  );
}
function IcX({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M2 2l8 8M10 2l-8 8" />
    </svg>
  );
}
function IcPlay({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="currentColor">
      <path d="M5.5 3.2c0-.9 1-1.5 1.8-1L15 8c.8.5.8 1.6 0 2.1l-7.7 5.7c-.8.5-1.8-.1-1.8-1V3.2z" />
    </svg>
  );
}
function IcPause({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="currentColor">
      <rect x="3.5" y="3" width="4" height="12" rx="1.4" />
      <rect x="10.5" y="3" width="4" height="12" rx="1.4" />
    </svg>
  );
}
function IcRetry({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 7A5 5 0 1 1 7 2c1.9 0 3.5 1 4.3 2.6" />
      <path d="M12 2v3h-3" />
    </svg>
  );
}
function IcSend({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2L7.5 8.5M14 2l-4.5 12-2-5.5L2 6.5 14 2z" />
    </svg>
  );
}
function IcClock({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="7" cy="7" r="5.5" />
      <path d="M7 4v3l2 1.4" />
    </svg>
  );
}

/* 外链：新标签打开 */
function IcLinkOut({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3H3.3A1.3 1.3 0 0 0 2 4.3v6.4A1.3 1.3 0 0 0 3.3 12h6.4A1.3 1.3 0 0 0 11 10.7V8" />
      <path d="M8.6 2H12v3.4M12 2 6.9 7.1" />
    </svg>
  );
}

function IcChevron({ size = 14, dir = "down" }) {
  const d = dir === "up" ? "M3 9.5 7 5.5l4 4" : "M3 5.5l4 4 4-4";
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/* 搜索：左栏导航之外唯一的跨类型出口 */
function IcSearch({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="6.1" cy="6.1" r="4.1" />
      <path d="M9.3 9.3 12.5 12.5" />
    </svg>
  );
}

/* 排序：上短下长的双箭头，表示「按时间排」而不是「筛掉一部分」 */
function IcSort({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 2.5v9M1.6 9.6l1.9 1.9 1.9-1.9M8 4h4.5M8 7h3M8 10h1.6" />
    </svg>
  );
}

/* 设置：滑杆比齿轮更像这套界面里的东西（没有圆弧、只有块与线） */
function IcSettings({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <path d="M1.8 4.4h12.4M1.8 8h12.4M1.8 11.6h12.4" />
      <circle cx="5.4" cy="4.4" r="1.7" fill="var(--card)" />
      <circle cx="10.4" cy="8" r="1.7" fill="var(--card)" />
      <circle cx="6.4" cy="11.6" r="1.7" fill="var(--card)" />
    </svg>
  );
}

/* 问题：全部「出事了」的信号共用这一枚图标和一种错误色 */
function IcAlert({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 1.9 13 12H1L7 1.9z" />
      <path d="M7 5.7v2.8" />
      <path d="M7 10.4h.01" />
    </svg>
  );
}

/* ---------- 编辑工具栏：一排 icon，没有文字 ---------- */
function IcFormatHeading({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.6 3.6v10.8M13.4 3.6v10.8M4.6 9h8.8" />
    </svg>
  );
}

/* B / I / U / S：图标本身要长得像那个格式 —— 斜体是斜的，下划线底下有线 */
function IcFormatBold({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18">
      <text x="9" y="13.4" textAnchor="middle" fontFamily="var(--font)" fontSize="13.5" fontWeight="800" fill="currentColor">B</text>
    </svg>
  );
}
function IcFormatItalic({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <path d="M7.2 4.2h4.4M6.4 13.8h4.4M10.6 4.2 7.4 13.8" />
    </svg>
  );
}
function IcFormatUnderline({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18">
      <text x="9" y="12.4" textAnchor="middle" fontFamily="var(--font)" fontSize="13.5" fontWeight="700" fill="currentColor">U</text>
      <path d="M4.6 15.6h8.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
function IcFormatStrike({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18">
      <text x="9" y="13.4" textAnchor="middle" fontFamily="var(--font)" fontSize="13.5" fontWeight="700" fill="currentColor">S</text>
      <path d="M4.4 9.1h9.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
/* 标题下拉的小三角 */
function IcCaret({ size = 9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="currentColor">
      <path d="M5 7.4 1.4 3.2h7.2L5 7.4Z" />
    </svg>
  );
}
function IcFormatQuote({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="currentColor">
      <path d="M6.5 4.4c-2 1-3.3 2.7-3.3 4.7 0 1.7 1 2.8 2.4 2.8 1.2 0 2.1-.8 2.1-2 0-1.1-.8-1.9-1.9-1.9h-.3c.3-.9 1-1.6 2-2.1l-1-1.5Zm7 0c-2 1-3.3 2.7-3.3 4.7 0 1.7 1 2.8 2.4 2.8 1.2 0 2.1-.8 2.1-2 0-1.1-.8-1.9-1.9-1.9h-.3c.3-.9 1-1.6 2-2.1l-1-1.5Z" />
    </svg>
  );
}
function IcFormatListUl({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6.8 4.6h8M6.8 9h8M6.8 13.4h8" />
      <circle cx="3.4" cy="4.6" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="3.4" cy="9" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="3.4" cy="13.4" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IcFormatListOl({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <path d="M7.2 4.6h7.6M7.2 9h7.6M7.2 13.4h7.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <text x="1.3" y="6.3" fontSize="5" fontFamily="ui-monospace, monospace" fill="currentColor">1</text>
      <text x="1.3" y="10.7" fontSize="5" fontFamily="ui-monospace, monospace" fill="currentColor">2</text>
      <text x="1.3" y="15.1" fontSize="5" fontFamily="ui-monospace, monospace" fill="currentColor">3</text>
    </svg>
  );
}
function IcFormatDivider({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <path d="M2.6 9h3.1M7.45 9h3.1M12.3 9h3.1" />
    </svg>
  );
}
function IcFormatLink({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.6 10.4a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-1 1" />
      <path d="M10.4 7.6a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l1-1" />
    </svg>
  );
}
function IcFormatImage({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <rect x="2.4" y="3.6" width="13.2" height="10.8" rx="2.4" />
      <circle cx="6.5" cy="7.2" r="1.3" />
      <path d="M3.4 12.9 7 9.6l2.5 2.2 2.3-2.2 2.8 2.7" strokeLinecap="round" />
    </svg>
  );
}
function IcFormatUndo({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8.6h6.2a3.4 3.4 0 1 1 0 6.8H7.2" />
      <path d="M6.8 5.4 3.4 8.6l3.4 3.2" />
    </svg>
  );
}
function IcFormatRedo({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 8.6H7.8a3.4 3.4 0 1 0 0 6.8h3" />
      <path d="M11.2 5.4l3.4 3.2-3.4 3.2" />
    </svg>
  );
}

Object.assign(window, {
  IcArrowLeft, IcPlus, IcCheck, IcX, IcPlay, IcPause, IcRetry, IcSend, IcClock, IcLinkOut, IcChevron,
  IcSearch, IcSort, IcSettings, IcAlert,
  IcFormatHeading, IcFormatQuote, IcFormatListUl, IcFormatListOl, IcFormatDivider,
  IcFormatLink, IcFormatImage, IcFormatUndo, IcFormatRedo,
  IcFormatBold, IcFormatItalic, IcFormatUnderline, IcFormatStrike, IcCaret,
});
