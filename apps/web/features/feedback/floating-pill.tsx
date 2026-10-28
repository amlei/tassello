import React from "react";
import { Button } from "@heroui/react";

const PILL_AUTO_HIDE_MS = 6000;
let dismissedPillRunningCount: number | null = null;

export function FloatingPill({
  running,
  avg,
  onClick,
}: {
  running: number;
  avg: number;
  onClick: () => void;
}) {
  const [, tick] = React.useReducer((value: number) => value + 1, 0);

  React.useEffect(() => {
    if (!running) {
      dismissedPillRunningCount = null;
      return;
    }
    if (dismissedPillRunningCount === running) return;
    const timer = setTimeout(() => {
      dismissedPillRunningCount = running;
      tick();
    }, PILL_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [running]);

  if (!running || dismissedPillRunningCount === running) return null;
  return (
    <Button
      className="pill fixed left-1/2 top-[26px] z-50 -translate-x-1/2 animate-rise gap-3.5 rounded-full bg-ink px-[22px] py-[13px] text-sm font-bold text-paper shadow-[0_10px_30px_rgba(15,15,15,0.28)] data-[hovered=true]:brightness-105"
      onPress={onClick}
    >
      <span className="flex gap-1">
        <i className="block h-2.5 w-2.5 rounded-[3px] animate-pulse-live" style={{ background: "#2C6FF0" }} />
        <i className="block h-2.5 w-2.5 rounded-[3px] animate-pulse-live [animation-delay:.18s]" style={{ background: "#D52088" }} />
        <i className="block h-2.5 w-2.5 rounded-[3px] animate-pulse-live [animation-delay:.36s]" style={{ background: "#FD8D11" }} />
      </span>
      正在发布 {running} 个任务
      <span className="pill-mono font-mono text-xs text-[#9AF0C9] dark:text-green">{avg}% · 查看队列</span>
    </Button>
  );
}
