/* phone —— 一篇稿子发出去的样子（编辑页右侧常驻预览列，移植原型 phone.jsx） */
"use client";

import React from "react";
import { TYPE_META, type PostDTO } from "@tassello/shared";
import { fmtTime } from "./bits";

function fmtDuration(sec: number | null): string {
  return sec ? fmtTime(sec) : "00:00";
}

export function PhoneCard({ post }: { post: PostDTO }) {
  const t = TYPE_META[post.type];
  const assets = post.assets;
  const html = post.bodyHtml && post.bodyHtml.trim()
    ? post.bodyHtml
    : "";
  const tagCount = (post.body.match(/#[^\s#，。]+/g) || []).length;
  return (
    <div className="relative mx-auto flex h-full max-h-[640px] w-full max-w-[380px] min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-line bg-white shadow-[0_14px_40px_rgba(15,15,15,0.14)]">
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
          <div className="text-sm leading-[1.85] text-[#2A2620]">
            {html.trim()
              ? <div className="m-richbody-phone" dangerouslySetInnerHTML={{ __html: html }} />
              : <p style={{ color: "#ABA9A4" }}>正文会实时出现在这里…</p>}
          </div>
        </div>
        {/* 底部渐隐：「下面还有」 */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent to-white" aria-hidden="true" />
      </div>
      {(post.type === "video" || post.type === "audio" || (post.type === "image" && assets.length > 0)) && (
        <div className="flex-none px-5 pt-1">
          {post.type === "image" && assets.length > 0 && (
            <div className="flex gap-1.5">
              {assets.slice(0, 8).map((im) => (
                <i key={im.id} className="block aspect-square min-w-0 max-w-[74px] flex-[1_1_0] rounded-lg" style={{ background: im.color || "#EDECE9" }} />
              ))}
            </div>
          )}
          {post.type === "video" && (
            <div className="relative flex aspect-video items-center justify-center rounded-xl bg-[#4A4740]">
              <span className="ml-1 h-0 w-0 border-y-[10px] border-l-4 border-l-[16px] border-l-white border-y-transparent" />
              <span className="absolute bottom-2 right-2.5 font-mono text-[10px] text-white">{fmtDuration(post.durationSec)}</span>
            </div>
          )}
          {post.type === "audio" && (
            <div className="flex items-center gap-2.5 rounded-xl bg-hover p-3">
              <span className="relative h-[30px] w-[30px] flex-none rounded-full bg-[#4A4740] after:absolute after:left-[11px] after:top-2 after:border-y-[7px] after:border-l-[10px] after:border-l-white after:border-y-transparent after:content-['']" />
              <span className="relative h-[5px] flex-1 rounded-[3px] bg-[#E4E2DB]">
                <i className="absolute inset-y-0 left-0 block w-[32%] rounded-[3px] bg-cyan" />
              </span>
              <span className="font-mono text-[10px] text-ink2">{fmtDuration(post.durationSec)}</span>
            </div>
          )}
        </div>
      )}
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
