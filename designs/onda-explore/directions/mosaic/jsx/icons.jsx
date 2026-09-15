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

Object.assign(window, { IcArrowLeft, IcPlus, IcCheck, IcX, IcPlay, IcPause, IcRetry, IcSend, IcClock, IcLinkOut, IcChevron });
