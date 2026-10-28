export type StatusTone = "neutral" | "success" | "warning" | "danger";

const DOT: Record<StatusTone, string> = {
  neutral: "bg-ink3",
  success: "bg-green",
  warning: "bg-warning",
  danger: "bg-error",
};

export function StatusDot({
  tone = "neutral",
  label,
  pulse = false,
  className = "",
}: {
  tone?: StatusTone;
  label?: string;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={"inline-block h-[7px] w-[7px] flex-none rounded-full " + DOT[tone] + (pulse ? " animate-pulse" : "") + " " + className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
