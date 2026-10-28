import React from "react";
import { Button } from "@heroui/react";
import { Pause, Play } from "reicon-react";
import { fmtTime } from "../../lib/format";

export function AudioBar({
  src,
  durationSec,
  color = "#0EC3D4",
  className = "",
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
    if (playing) a.pause();
    else void a.play().catch(() => {});
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
