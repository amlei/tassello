/* phone —— 一篇稿子发出去的样子（编辑页右侧常驻预览列，移植原型 phone.jsx） */
"use client";

import React from "react";
import { TYPE_META, type PostDTO } from "@tassello/shared";
import { Button } from "@heroui/react";
import { Pause, Play } from "reicon-react";
import { fmtTime } from "./bits";

function fmtDuration(sec: number | null): string {
  return sec ? fmtTime(sec) : "00:00";
}

/* 预览贴图条：手机交互 —— 缩略图定宽 72px，按住拖动横滑（不是电脑端滚动条） */
function PhoneGallery({ assets }: { assets: PostDTO["assets"] }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const drag = React.useRef<{ x: number; left: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft };
    try { el.setPointerCapture(e.pointerId); } catch {}
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!drag.current || !el) return;
    el.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
  };
  const endPan = () => { drag.current = null; };
  return (
    <div
      className="flex cursor-grab gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onPointerLeave={endPan}
    >
      {assets.map((im) => (
        <span key={im.id} className="relative block h-[72px] w-[72px] flex-none overflow-hidden rounded-lg" style={{ background: im.path ? "#4A4740" : im.color || "var(--onda-selected)" }}>
          {im.path && (
            // eslint-disable-next-line @next/next/no-img-element -- 本地 API 字节流缩略图
            <img src={`/api/assets/${im.id}/raw`} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          )}
        </span>
      ))}
    </div>
  );
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

  const cur = pos * (dur > 0 ? dur : durationSec || 0);
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-selected p-3">
      <audio ref={ref} src={`/api/assets/${asset.id}/raw`} preload="metadata" className="hidden" />
      <Button
        isIconOnly
        onPress={toggle}
        aria-label={playing ? "暂停播放" : "播放"}
        className="min-w-0 flex h-[30px] w-[30px] flex-none cursor-pointer items-center justify-center rounded-full bg-ink text-card transition-transform data-[hovered=true]:scale-105"
      >
        {playing ? <Pause size={13} strokeWidth={3} aria-hidden="true" /> : <Play size={12} strokeWidth={3} aria-hidden="true" />}
      </Button>
      <div
        className="relative h-[5px] min-w-0 flex-1 cursor-pointer rounded-[3px] bg-line"
        onPointerDown={seek}
        role="slider"
        aria-label="播放进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos * 100)}
      >
        <span className="absolute inset-y-0 left-0 rounded-[3px] bg-cyan" style={{ width: `${pos * 100}%` }} />
      </div>
      <span className="whitespace-nowrap font-mono text-[10px] text-ink2">{fmtTime(Math.floor(cur))} / {fmtDuration(dur > 0 ? Math.round(dur) : durationSec)}</span>
    </div>
  );
}

export function PhoneCard({
  post, paneRef, onScroll, more = false,
}: {
  post: PostDTO;
  paneRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  more?: boolean;
}) {
  const t = TYPE_META[post.type];
  const assets = post.assets;
  const html = post.bodyHtml && post.bodyHtml.trim()
    ? post.bodyHtml
    : "";
  return (
    <div className="m-phone relative mx-auto flex h-full max-h-[640px] w-full max-w-[380px] min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-line bg-card shadow-[0_14px_40px_rgba(15,15,15,0.14)]">
      <div className="flex flex-none items-center gap-[9px] border-b border-line px-5 pb-3.5 pt-[18px]">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-[13px] font-black text-white" style={{ background: t.color }}>九</span>
        <div className="text-[13px] font-bold">九漾小记</div>
      </div>
      {/* 没有标题就不渲染占位：预览长得像发出去的样子，空标题不发出去 */}
      {post.title ? <h2 className="mx-5 mt-4 flex-none text-[19px] font-bold leading-[1.4] tracking-[-0.2px]">{post.title}</h2> : null}
      <div className="relative flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-2 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" ref={paneRef} onScroll={onScroll}>
          <div className="text-sm leading-[1.85] text-ink">
            {html.trim()
              ? <div className="m-richbody-phone" dangerouslySetInnerHTML={{ __html: html }} />
              : <p className="text-ink3">正文会实时出现在这里…</p>}
          </div>
        </div>
        {/* 底部渐隐：「下面还有」，滚到底自动收掉 */}
        <span
          className={"pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent to-card transition-opacity duration-[280ms] " + (more ? "opacity-100" : "opacity-0")}
          aria-hidden="true"
        />
      </div>
      {(() => {
        const video = assets.find((a) => a.kind === "video" && a.path);
        const audio = assets.find((a) => a.kind === "audio" && a.path);
        const showImages = post.type === "image" && assets.length > 0;
        if (!(showImages || (post.type === "video" && video) || (post.type === "audio" && audio))) return null;
        return (
          <div className="flex-none px-5 pt-1">
            {showImages && <PhoneGallery assets={assets.filter((a) => a.kind === "image")} />}
            {post.type === "video" && video && (
              <div className="overflow-hidden rounded-xl bg-ink">
                <video src={`/api/assets/${video.id}/raw`} controls controlsList="nodownload" playsInline preload="metadata" className="block aspect-video w-full" />
              </div>
            )}
            {post.type === "audio" && audio && (
              <AudioPlayer asset={audio} durationSec={post.durationSec} />
            )}
          </div>
        );
      })()}
    </div>
  );
}

export function PreviewColumn({
  post, paneRef, onScroll, more = false,
}: {
  post: PostDTO;
  paneRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  more?: boolean;
}) {
  return (
    <div className="relative flex min-h-0 overflow-hidden rounded-tl-[14px]">
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden bg-hover px-7 py-[22px]">
        <PhoneCard post={post} paneRef={paneRef} onScroll={onScroll} more={more} />
      </div>
    </div>
  );
}
