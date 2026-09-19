/* icons —— 内联 SVG 图标（移植原型 icons.jsx） */
type IconProps = { size?: number };

export function IcArrowLeft({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3L5 8l5 5" /></svg>
  );
}
export function IcPlus({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M7 2v10M2 7h10" /></svg>
  );
}
export function IcCheck({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7l3 3 6-7" /></svg>
  );
}
export function IcX({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
  );
}
export function IcPlay({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="currentColor"><path d="M5.5 3.2c0-.9 1-1.5 1.8-1L15 8c.8.5.8 1.6 0 2.1l-7.7 5.7c-.8.5-1.8-.1-1.8-1V3.2z" /></svg>
  );
}
export function IcPause({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="currentColor"><rect x="3.5" y="3" width="4" height="12" rx="1.4" /><rect x="10.5" y="3" width="4" height="12" rx="1.4" /></svg>
  );
}
export function IcRetry({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7A5 5 0 1 1 7 2c1.9 0 3.5 1 4.3 2.6" /><path d="M12 2v3h-3" /></svg>
  );
}
export function IcSend({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2L7.5 8.5M14 2l-4.5 12-2-5.5L2 6.5 14 2z" /></svg>
  );
}
export function IcLinkOut({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3H3.3A1.3 1.3 0 0 0 2 4.3v6.4A1.3 1.3 0 0 0 3.3 12h6.4A1.3 1.3 0 0 0 11 10.7V8" /><path d="M8.6 2H12v3.4M12 2 6.9 7.1" /></svg>
  );
}
export function IcChevron({ size = 14, dir = "down" }: IconProps & { dir?: "up" | "down" | "left" | "right" }) {
  const d = dir === "up" ? "M3 9.5 7 5.5l4 4" : dir === "left" ? "M9.5 3 5.5 7l4 4" : "M3 5.5l4 4 4-4";
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
}
export function IcSearch({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="6.1" cy="6.1" r="4.1" /><path d="M9.3 9.3 12.5 12.5" /></svg>
  );
}
export function IcSort({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 2.5v9M1.6 9.6l1.9 1.9 1.9-1.9M8 4h4.5M8 7h3M8 10h1.6" /></svg>
  );
}
/* 设置 = Reicon「Tuning2」outline（https://reicon.dev/icon/tuning2?weight=outline） */
export function IcSettings({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M18.25 7C18.25 9.07107 16.5711 10.75 14.5 10.75C12.4289 10.75 10.75 9.07107 10.75 7C10.75 4.92893 12.4289 3.25 14.5 3.25C16.5711 3.25 18.25 4.92893 18.25 7ZM14.5 9.25C15.7426 9.25 16.75 8.24264 16.75 7C16.75 5.75736 15.7426 4.75 14.5 4.75C13.2574 4.75 12.25 5.75736 12.25 7C12.25 8.24264 13.2574 9.25 14.5 9.25Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M5.75 17C5.75 19.0711 7.42893 20.75 9.5 20.75C11.5711 20.75 13.25 19.0711 13.25 17C13.25 14.9289 11.5711 13.25 9.5 13.25C7.42893 13.25 5.75 14.9289 5.75 17ZM9.5 19.25C8.25736 19.25 7.25 18.2426 7.25 17C7.25 15.7574 8.25736 14.75 9.5 14.75C10.7426 14.75 11.75 15.7574 11.75 17C11.75 18.2426 10.7426 19.25 9.5 19.25Z" fill="currentColor" />
      <path d="M14.25 16.9585C14.25 16.5443 14.5858 16.2085 15 16.2085H22C22.4142 16.2085 22.75 16.5443 22.75 16.9585C22.75 17.3727 22.4142 17.7085 22 17.7085H15C14.5858 17.7085 14.25 17.3727 14.25 16.9585Z" fill="currentColor" />
      <path d="M9 6.20852C9.41421 6.20852 9.75 6.54431 9.75 6.95852C9.75 7.37273 9.41421 7.70852 9 7.70852L2 7.70852C1.58579 7.70852 1.25 7.37273 1.25 6.95852C1.25 6.54431 1.58579 6.20852 2 6.20852L9 6.20852Z" fill="currentColor" />
      <path d="M1.25 16.9585C1.25 16.5443 1.58579 16.2085 2 16.2085H4C4.41421 16.2085 4.75 16.5443 4.75 16.9585C4.75 17.3727 4.41421 17.7085 4 17.7085H2C1.58579 17.7085 1.25 17.3727 1.25 16.9585Z" fill="currentColor" />
      <path d="M22 6.20852C22.4142 6.20852 22.75 6.54431 22.75 6.95852C22.75 7.37273 22.4142 7.70852 22 7.70852H20C19.5858 7.70852 19.25 7.37273 19.25 6.95852C19.25 6.54431 19.5858 6.20852 20 6.20852H22Z" fill="currentColor" />
    </svg>
  );
}
export function IcAlert({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7 1.9 13 12H1L7 1.9z" /><path d="M7 5.7v2.8" /><path d="M7 10.4h.01" /></svg>
  );
}
export function IcFormatHeading({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4.6 3.6v10.8M13.4 3.6v10.8M4.6 9h8.8" /></svg>
  );
}
export function IcFormatBold({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18"><text x="9" y="13.4" textAnchor="middle" fontFamily="var(--font)" fontSize="13.5" fontWeight="800" fill="currentColor">B</text></svg>
  );
}
export function IcFormatItalic({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M7.2 4.2h4.4M6.4 13.8h4.4M10.6 4.2 7.4 13.8" /></svg>
  );
}
export function IcFormatUnderline({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18"><text x="9" y="12.4" textAnchor="middle" fontFamily="var(--font)" fontSize="13.5" fontWeight="700" fill="currentColor">U</text><path d="M4.6 15.6h8.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
  );
}
export function IcFormatStrike({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18"><text x="9" y="13.4" textAnchor="middle" fontFamily="var(--font)" fontSize="13.5" fontWeight="700" fill="currentColor">S</text><path d="M4.4 9.1h9.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
  );
}
export function IcCaret({ size = 9 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="currentColor"><path d="M5 7.4 1.4 3.2h7.2L5 7.4Z" /></svg>
  );
}
export function IcFormatQuote({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="currentColor"><path d="M6.5 4.4c-2 1-3.3 2.7-3.3 4.7 0 1.7 1 2.8 2.4 2.8 1.2 0 2.1-.8 2.1-2 0-1.1-.8-1.9-1.9-1.9h-.3c.3-.9 1-1.6 2-2.1l-1-1.5Zm7 0c-2 1-3.3 2.7-3.3 4.7 0 1.7 1 2.8 2.4 2.8 1.2 0 2.1-.8 2.1-2 0-1.1-.8-1.9-1.9-1.9h-.3c.3-.9 1-1.6 2-2.1l-1-1.5Z" /></svg>
  );
}
export function IcFormatListUl({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6.8 4.6h8M6.8 9h8M6.8 13.4h8" /><circle cx="3.4" cy="4.6" r="1.15" fill="currentColor" stroke="none" /><circle cx="3.4" cy="9" r="1.15" fill="currentColor" stroke="none" /><circle cx="3.4" cy="13.4" r="1.15" fill="currentColor" stroke="none" /></svg>
  );
}
export function IcFormatListOl({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none"><path d="M7.2 4.6h7.6M7.2 9h7.6M7.2 13.4h7.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><text x="1.3" y="6.3" fontSize="5" fontFamily="ui-monospace, monospace" fill="currentColor">1</text><text x="1.3" y="10.7" fontSize="5" fontFamily="ui-monospace, monospace" fill="currentColor">2</text><text x="1.3" y="15.1" fontSize="5" fontFamily="ui-monospace, monospace" fill="currentColor">3</text></svg>
  );
}
export function IcFormatDivider({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M2.6 9h3.1M7.45 9h3.1M12.3 9h3.1" /></svg>
  );
}
export function IcFormatLink({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7.6 10.4a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-1 1" /><path d="M10.4 7.6a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l1-1" /></svg>
  );
}
export function IcFormatImage({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><rect x="2.4" y="3.6" width="13.2" height="10.8" rx="2.4" /><circle cx="6.5" cy="7.2" r="1.3" /><path d="M3.4 12.9 7 9.6l2.5 2.2 2.3-2.2 2.8 2.7" strokeLinecap="round" /></svg>
  );
}
export function IcFormatUndo({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8.6h6.2a3.4 3.4 0 1 1 0 6.8H7.2" /><path d="M6.8 5.4 3.4 8.6l3.4 3.2" /></svg>
  );
}
export function IcFormatRedo({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 8.6H7.8a3.4 3.4 0 1 0 0 6.8h3" /><path d="M11.2 5.4l3.4 3.2-3.4 3.2" /></svg>
  );
}
