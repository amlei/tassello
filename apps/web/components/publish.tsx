/* publish —— 发布到平台弹层：只列支持当前稿子类型的平台，方块就是平台（重做自原型 publish.jsx） */
"use client";

import { TYPE_META, type PlatformDTO, type PostDTO } from "@tassello/shared";
import { Button, Modal } from "@heroui/react";
import { Check, Refresh, Send } from "reicon-react";
import { PlatformMark } from "./platform-icons";

export function PublishSheet({
  post, platforms, selectedIds, onToggle, onReacquire, onClose, onConfirm,
}: {
  post: PostDTO;
  platforms: PlatformDTO[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onReacquire: (id: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = TYPE_META[post.type];
  const supported = platforms.filter((p) => p.supports.includes(post.type));
  const selected = supported.filter((p) => selectedIds.includes(p.id));
  const bodyLen = post.body.length;
  /* 约束预检：发布前就算出哪个平台会拒稿（与队列页的失败归因同源） */
  const problemOf = (p: PlatformDTO) => {
    if (p.id === "weibo" && bodyLen > 500) return `正文 ${bodyLen} 字 · 超出 500 字上限`;
    return null;
  };
  const failed = (p: PlatformDTO) => p.status !== "active" || !p.account || p.account.state !== "ok";
  /* 三态皮肤：选中 = 平台色实底；未选中 = 平台色 20% 淡底；未获取 = 中性灰 */
  const skinOf = (p: PlatformDTO) => {
    if (failed(p)) return { background: "var(--color-hover)", color: "var(--color-ink3)" };
    if (selectedIds.includes(p.id)) return { background: p.color, color: p.fg || "#fff" };
    return { background: p.color + "2E", color: p.fg ? "var(--color-ink)" : p.color };
  };

  return (
    <Modal>
      <Modal.Backdrop isOpen onOpenChange={(o) => { if (!o) onClose(); }}>
        <Modal.Container>
          {/* 原型 .m-sheet：760px，padding 30/34/28，圆角 20，pop 入场 */}
          <Modal.Dialog
            className="max-w-[760px] rounded-[20px] bg-paper px-[34px] pb-[28px] pt-[30px] shadow-[0_14px_40px_rgba(15,15,15,0.14)]"
            aria-label="发布到平台"
          >
            <div className="mb-1.5 flex items-center gap-3.5">
              <Modal.Heading className="text-[22px] font-bold tracking-[-0.2px]">发布到平台</Modal.Heading>
              <span className="inline-flex items-center gap-[7px] rounded-full px-3 py-[5px] text-xs font-extrabold text-white" style={{ background: t.color }}>
                <span className="inline-block h-2 w-2 rounded-[2px] bg-white/95" />
                {t.zh}
              </span>
              <span className="ml-auto font-mono text-[13px] text-ink2">已选 {String(selected.length).padStart(2, "0")} / {supported.length}</span>
            </div>

            {/* 原型 .m-platwall：gap 16，padding 14 6 8 */}
            <div className="flex flex-wrap gap-4 px-1.5 pb-2 pt-3.5">
              {supported.map((p) => {
                const problem = problemOf(p);
                const off = failed(p);
                const on = selectedIds.includes(p.id);
                return (
                  <span key={p.id} title={p.name + (off ? " · 获取失败，点击重新获取" : problem ? ` · ${problem}` : "")} className="inline-flex">
                    <Button
                      className={
                        "relative flex h-14 w-14 items-center justify-center rounded-[16px] p-0 shadow-[0_1px_2px_rgba(15,15,15,0.04)] transition-[translate,transform,box-shadow] duration-150 data-[off=true]:shadow-none" +
                        (off ? "" : " data-[hovered=true]:-translate-y-[3px]")
                      }
                      style={{ ...skinOf(p), transform: "none" }}
                      data-off={off}
                      onPress={() => (off ? onReacquire(p.id) : onToggle(p.id))}
                      aria-label={p.name}
                    >
                      <PlatformMark id={p.id} char={p.char} size={24} imgScale={1.4} tone={off ? "off" : on ? "lit" : "dim"} className="m-0 h-6 w-6" />
                      {on && !off && (
                        /* 选中勾：原型 .m-platck，21px 圆角 7，m-pop 入场，无白边 */
                        <span className="absolute -right-[7px] -top-[7px] z-[2] flex h-[21px] w-[21px] animate-pop items-center justify-center rounded-[7px] bg-accent text-white">
                          <Check className="m-0 h-[11px] w-[11px]" strokeWidth={4.5} />
                        </span>
                      )}
                      {off && (
                        <span className="absolute -bottom-[7px] -right-[7px] z-[2] flex h-[21px] w-[21px] items-center justify-center rounded-[7px] border border-line bg-card text-ink2">
                          <Refresh className="m-0 h-2.5 w-2.5" />
                        </span>
                      )}
                      {problem && !off && (
                        <span className="absolute -left-[3px] -top-[3px] h-[13px] w-[13px] rounded-full border-[2.5px] border-paper bg-error" />
                      )}
                    </Button>
                  </span>
                );
              })}
            </div>

            <div className="mt-[30px] flex items-center gap-3.5">
              <span className="font-mono text-[12px] text-ink2">
                {selected.length ? `将创建 ${selected.length} 个发布任务 · 不阻塞当前操作` : "至少点亮一个平台"}
              </span>
              <Button variant="ghost" className="ml-auto rounded-full border border-line bg-transparent px-6 py-3 text-[15px] font-bold text-ink data-[hovered=true]:bg-hover" onPress={onClose}>
                取消
              </Button>
              <Button
                isDisabled={!selected.length}
                className="gap-2 rounded-full bg-green px-[30px] py-[13px] text-base font-black tracking-[1px] text-white data-[hovered=true]:brightness-105 data-[disabled=true]:opacity-35"
                onPress={onConfirm}
              >
                <Send className="m-0 h-[15px] w-[15px]" /> 确认发布
              </Button>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
