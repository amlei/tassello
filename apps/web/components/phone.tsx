/* phone —— 一篇稿子发出去的样子（编辑页右侧常驻预览列，移植原型 phone.jsx） */
"use client";

import React from "react";
import { TYPE_META, type PostDTO } from "@tassello/shared";
import { fmtTime } from "./bits";

function fmtDuration(sec: number | null): string {
  return sec ? fmtTime(sec) : "00:00";
}

/* 预览里的音频是真能播的：播放/暂停 + 点进度条定位；文案仍只读 */
function AudioPlayer({ asset, durationSec }: { asset: PostDTO["assets"][number]; durationSec: number | null }) {
  const ref = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [pos, setPos] = React.useState(0); // 0..1
  const [dur, setDur] = React.useState(0);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTime = () => setPos(el.duration > 0 ? el.currentTime / el.duration : 0);
    const onMeta = () => { if (Number.isFinite(el.duration)) setDur(el.duration); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { setPlaying(false); setPos(0); };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    if (Number.isFinite(el.duration) && el.duration > 0) {
      el.currentTime = ratio * el.duration;
      setPos(ratio);
    }
  };

  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-hover p-3">
      <audio ref={ref} src={`/api/assets/${asset.id}/raw`} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "暂停播放" : "播放"}
        className="flex h-[30px] w-[30px] flex-none cursor-pointer items-center justify-center rounded-full bg-[#4A4740] text-white transition-transform data-[hovered=true]:scale-105"
      >
        {playing ? (
          <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true"><rect x="0.5" width="3.4" height="12" rx="1.1" fill="currentColor" /><rect x="7.1" width="3.4" height="12" rx="1.1" fill="currentColor" /></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.4 1.05v9.9L11 6 2.4 1.05z" fill="currentColor" /></svg>
        )}
      </button>
      <div
        className="relative h-[5px] min-w-0 flex-1 cursor-pointer rounded-[3px] bg-line"
        onPointerDown={seek}
        role="slider"
        aria-label="播放进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos * 100)}
      >
        <span className="absolute inset-y-0 left-0 rounded-[3px] bg-ink2" style={{ width: `${pos * 100}%` }} />
      </div>
      <span className="font-mono text-[10px] text-ink2">{fmtDuration(dur > 0 ? Math.round(dur) : durationSec)}</span>
    </div>
  );
}

export function PhoneCard({ post }: { post: PostDTO }) {
  const t = TYPE_META[post.type];
  const assets = post.assets;
  const html = post.bodyHtml && post.bodyHtml.trim()
    ? post.bodyHtml
    : "";
  const tagCount = (post.body.match(/#[^\s#，。]+/g) || []).length;
  return (
    <div className="relative mx-auto flex h-full max-h-[640px] w-full max-w-[380px] min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-line bg-card shadow-[0_14px_40px_rgba(15,15,15,0.14)]">
      <div className="flex flex-none items-center gap-[9px] border-b border-line px-5 pb-3.5 pt-[18px]">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-[13px] font-black text-white" style={{ background: t.color }}>九</span>
        <div>
          <div className="text-[13px] font-bold">九漾小记</div>
          <div className="font-mono text-[10px] text-ink2">刚刚 · 来自 Onda 工作台</div>
        </div>
      </div>
      <h2 className="mx-5 mt-4 flex-none text-[19px] font-bold leading-[1.4] tracking-[-0.2px]">{post.title || "未命名"}</h2>
      <div className="relative flex min-h-0 flex-1">
        <div className="scroll-thin min-h-0 flex-1 overflow-auto px-5 pb-2 pt-2.5">
          <div className="text-sm leading-[1.85] text-ink">
            {html.trim()
              ? <div className="m-richbody-phone" dangerouslySetInnerHTML={{ __html: html }} />
              : <p className="text-ink3">正文会实时出现在这里…</p>}
          </div>
        </div>
        {/* 底部渐隐：「下面还有」 */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent to-card" aria-hidden="true" />
      </div>
      {(() => {
        const video = assets.find((a) => a.kind === "video" && a.path);
        const audio = assets.find((a) => a.kind === "audio" && a.path);
        const showImages = post.type === "image" && assets.length > 0;
        if (!(showImages || (post.type === "video" && video) || (post.type === "audio" && audio))) return null;
        return (
          <div className="flex-none px-5 pt-1">
            {showImages && (
              <div className="flex gap-1.5">
                {assets.slice(0, 8).map((im) => (
                  <span key={im.id} className="relative block aspect-square min-w-0 max-w-[74px] flex-[1_1_0] overflow-hidden rounded-lg" style={{ background: im.path ? "#4A4740" : im.color || "var(--onda-selected)" }}>
                    {im.path && (
                      // eslint-disable-next-line @next/next/no-img-element -- 本地 API 字节流缩略图
                      <img src={`/api/assets/${im.id}/raw`} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
                    )}
                  </span>
                ))}
              </div>
            )}
            {post.type === "video" && video && (
              <div className="overflow-hidden rounded-xl bg-[#4A4740]">
                <video src={`/api/assets/${video.id}/raw`} controls controlsList="nodownload" playsInline preload="metadata" className="block aspect-video w-full" />
              </div>
            )}
            {post.type === "audio" && audio && (
              <AudioPlayer asset={audio} durationSec={post.durationSec} />
            )}
          </div>
        );
      })()}
      <div className="mx-5 mt-2.5 flex flex-none gap-3 border-t border-line pb-5 pt-3 font-mono text-[10px] text-ink2">
        <span>{post.body.length} 字</span>
        <span>#话题 {tagCount} 个</span>
      </div>
    </div>
  );
}

export function PreviewColumn({ post }: { post: PostDTO }) {
  return (
    <div className="relative flex min-h-0 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden bg-hover px-7 py-[22px]">
        <PhoneCard post={post} />
      </div>
    </div>
  );
}
