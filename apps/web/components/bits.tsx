/* bits —— 共享小组件：Logo、时间格式、音频信息条、浮动指示条 */
"use client";

import { Button } from "@heroui/react";

export function MosaicLogo({ size = 11 }: { size?: number }) {
  const cells = ["#2FD9A0", "#17C8E0", "#2E7CF6", "#A55EF5", "w", "#2058EE", "#E8369F", "#F7A21B", "#30C974"];
  return (
    <div
      className="grid gap-[2.5px]"
      style={{ gridTemplateColumns: `repeat(3, ${size}px)`, gridTemplateRows: `repeat(3, ${size}px)` }}
    >
      {cells.map((c, i) => (
        <i key={i} className="relative block rounded-[3px]" style={c === "w" ? { background: "#fff" } : { background: c }}>
          {c === "w" && (
            <i className="mx-auto mt-[31%] block h-[38%] w-[38%] rounded-[22%] bg-[#10B981]" />
          )}
        </i>
      ))}
    </div>
  );
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

/** ISO 时间 → 原型的 "MM-DD HH:mm" */
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 音频信息条：静态展示时长，无播放交互（真实播放待媒体接入后补齐） */
export function AudioBar({ durationSec }: { durationSec?: number | null }) {
  const total = durationSec || 0;
  return (
    <div className="flex max-w-[440px] items-center gap-3 rounded-xl bg-[#4A4740] px-3.5 py-2.5">
      <div className="flex-1">
        <div className="mb-1.5 flex justify-between font-mono text-[10px] text-white/60">
          <span>00:00</span>
          <span>{fmtTime(total)}</span>
        </div>
        <div className="h-[5px] rounded-[3px] bg-white/20" />
      </div>
    </div>
  );
}

export function FloatingPill({
  running,
  avg,
  onClick,
}: {
  running: number;
  avg: number;
  onClick: () => void;
}) {
  if (!running) return null;
  return (
    <Button
      className="fixed bottom-[26px] left-1/2 z-50 -translate-x-1/2 gap-3.5 rounded-full bg-ink px-[22px] py-[13px] text-sm font-bold text-paper shadow-[0_10px_30px_rgba(15,15,15,0.28)] data-[hovered=true]:bg-black"
      onPress={onClick}
    >
      <span className="flex gap-1">
        <i className="block h-2.5 w-2.5 rounded-[3px] animate-pulse-live" style={{ background: "#2C6FF0" }} />
        <i className="block h-2.5 w-2.5 rounded-[3px] animate-pulse-live [animation-delay:.18s]" style={{ background: "#D52088" }} />
        <i className="block h-2.5 w-2.5 rounded-[3px] animate-pulse-live [animation-delay:.36s]" style={{ background: "#FD8D11" }} />
      </span>
      正在发布 {running} 个任务
      <span className="font-mono text-xs text-[#9AF0C9]">{avg}% · 查看队列</span>
    </Button>
  );
}
