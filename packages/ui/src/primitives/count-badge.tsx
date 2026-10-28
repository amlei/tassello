export function CountBadge({
  value,
  pad = 2,
  className = "",
}: {
  value: number | string;
  pad?: number;
  className?: string;
}) {
  const text = typeof value === "number" ? String(value).padStart(pad, "0") : value;
  return <span className={"font-mono text-[11.5px] font-semibold text-ink2 " + className}>{text}</span>;
}
