/* publish —— 发布弹层：只列支持当前稿子类型的平台（HeroUI Modal + 方向 B 视觉） */
"use client";

import { TYPE_META, type PlatformDTO, type PostDTO } from "@tassello/shared";
import { Button, Modal } from "@heroui/react";
import { Check as ReiconCheck } from "reicon-react";
import { IcRetry, IcSend } from "./icons";
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
  const problemOf = (p: PlatformDTO) => {
    if (p.id === "weibo" && bodyLen > 500) return `正文 ${bodyLen} 字 · 超出 500 字上限`;
    return null;
  };
  const skinOf = (p: PlatformDTO) => {
    if (p.status !== "active" || !p.account || p.account.state !== "ok") {
      return { background: "var(--color-hover)", color: "var(--color-ink3)" };
    }
    if (selectedIds.includes(p.id)) return { background: p.color, color: p.fg || "#fff" };
    return { background: p.color + "2E", color: p.fg ? "var(--color-ink)" : p.color };
  };
  const failed = (p: PlatformDTO) => p.status !== "active" || !p.account || p.account.state !== "ok";

  return (
    <Modal>
      <Modal.Backdrop isOpen onOpenChange={(o) => { if (!o) onClose(); }}>
        <Modal.Container>
          <Modal.Dialog className="max-w-[640px] rounded-[20px] bg-paper p-6 shadow-[0_14px_40px_rgba(15,15,15,0.14)]" aria-label="发布到平台">
            <div className="flex items-center gap-3">
              <Modal.Heading className="text-[19px] font-bold tracking-[-0.3px]">发布到平台</Modal.Heading>
              <span className="inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-xs font-bold text-white" style={{ background: t.color }}>
                <span className="inline-block h-2 w-2 rounded-[2px] bg-white/90" />
                {t.zh}
              </span>
              <span className="ml-auto font-mono text-[13px] text-ink2">已选 {String(selected.length).padStart(2, "0")} / {supported.length}</span>
            </div>
            <p className="mb-5 mt-1.5 text-sm text-ink2">「{post.title || "未命名"}」 — 只有收{t.zh}的平台会出现在这里。点亮方块即加入本次发布。</p>
            <div className="mb-4 flex flex-wrap gap-3.5 px-1.5 pb-2">
              {supported.map((p) => {
                const problem = problemOf(p);
                const off = failed(p);
                return (
                  <Button
                    key={p.id}
                    className={
                      "relative flex h-14 w-14 items-center justify-center rounded-2xl p-0 data-[off=true]:cursor-pointer" +
                      (selectedIds.includes(p.id) && !off ? " shadow-[0_4px_14px_rgba(15,15,15,0.18)]" : "")
                    }
                    style={{ ...skinOf(p), transform: "none" }}
                    data-off={off}
                    onPress={() => (off ? onReacquire(p.id) : onToggle(p.id))}
                    aria-label={p.name + (p.status !== "active" ? " · 尚未接入" : off ? " · 凭据未获取，点击去获取" : problem ? ` · ${problem}` : "")}
                  >
                    <PlatformMark id={p.id} char={p.char} size={24} imgScale={1.4} tone={off ? "off" : selectedIds.includes(p.id) ? "lit" : "dim"} />
                    {selectedIds.includes(p.id) && !off && (
                      <span className="absolute -right-[7px] -top-[7px] z-[2] flex h-[21px] w-[21px] items-center justify-center rounded-[7px] border-2 border-white bg-accent text-white"><ReiconCheck size={12} strokeWidth={2.4} /></span>
                    )}
                    {off && (
                      <span className="absolute -bottom-[7px] -right-[7px] z-[2] flex h-[21px] w-[21px] items-center justify-center rounded-[7px] border border-line bg-card text-ink2"><IcRetry size={10} /></span>
                    )}
                    {problem && !off && <span className="absolute -left-[3px] -top-[3px] h-3 w-3 rounded-full border-2 border-paper bg-error" />}
                  </Button>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[12px] text-ink2">
                {selected.length ? `将创建 ${selected.length} 个发布任务 · 不阻塞当前操作` : "至少点亮一个平台"}
              </span>
              <Button variant="ghost" className="ml-auto rounded-full px-4 py-2 text-[13.5px] font-bold text-ink2 hover:text-ink" onPress={onClose}>
                取消
              </Button>
              <Button
                isDisabled={!selected.length}
                className="gap-2 rounded-full bg-green px-[26px] py-3 text-base font-black tracking-[1px] text-white data-[hovered=true]:brightness-105 data-[disabled=true]:opacity-35"
                onPress={onConfirm}
              >
                <IcSend size={15} /> 确认发布
              </Button>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
