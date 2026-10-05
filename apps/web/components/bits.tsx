/* bits —— 共享小组件：Logo、时间格式、音频播放器、浮动指示条 */
"use client";

import React from "react";
import { Button } from "@heroui/react";
import { Pause, Play } from "reicon-react";

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

/** 音频播放器：接真实 <audio> 文件（src 必传），进度/时长/播放态全部来自真实数据。
 *  视觉对齐原型 .m-audiobar：深炭底、青色圆钮（色随内容类型）、进度线同色填充 */
export function AudioBar({
  src, durationSec, color = "#0EC3D4", className = "",
}: {
  src: string;
  durationSec?: number | null;
  color?: string;
  className?: string;
}) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [cur, setCur] = React.useState(0);
  const [total, setTotal] = React.useState(durationSec || 0);
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      void a.play().catch(() => {});
    }
  };
  return (
    <div className={"flex items-center gap-3 rounded-xl bg-[#4A4740] px-3.5 py-[11px] " + className}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setTotal(Math.round(d));
        }}
      />
      <Button
        isIconOnly
        aria-label={playing ? "暂停" : "播放"}
        className="h-[34px] w-[34px] min-w-0 flex-none rounded-full text-[#17323A] transition-transform data-[hovered=true]:scale-[1.08]"
        style={{ background: color }}
        onPress={toggle}
      >
        {playing ? <Pause size={16} strokeWidth={3} /> : <Play size={16} strokeWidth={3} />}
      </Button>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex justify-between font-mono text-[10px] text-white/60">
          <span>{fmtTime(cur)}</span>
          <span>{fmtTime(total)}</span>
        </div>
        <div
          className="group relative h-[5px] cursor-pointer overflow-hidden rounded-[3px] bg-white/20"
          onClick={(e) => {
            const a = audioRef.current;
            if (!a || !total) return;
            const rect = e.currentTarget.getBoundingClientRect();
            a.currentTime = ((e.clientX - rect.left) / rect.width) * total;
          }}
          role="slider"
          aria-label="播放进度"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.floor(cur)}
        >
          <i className="absolute inset-y-0 left-0 block rounded-[3px]" style={{ width: `${total ? Math.min(100, (cur / total) * 100) : 0}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}

const PILL_AUTO_HIDE_MS = 6000;
/** 同一次任务数量变化只提醒一次；跨页面导航也保持已消失状态，队列页才是完整事实源。 */
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
    // 任务数量变化代表有新任务加入，重新提醒一次；数量不变则维持自动消失状态。
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
