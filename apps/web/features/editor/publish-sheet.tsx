/* publish-sheet —— 当前稿件可发布目标与频道选择。 */
"use client";

import React from "react";
import { TYPE_META, type PlatformDTO, type PodcastRssDTO, type PostDTO } from "@tassello/shared";
import { Button, ListBox, ListBoxItem, Modal, Select } from "@heroui/react";
import { Alert, Check, ChevronDown, Refresh, Send } from "reicon-react";
import { Rss } from "lucide-react";
import { PlatformMark } from "@tassello/ui/platform-icons";

export function PublishSheet({
  post, platforms, rss, selectedIds, channelIds, publishError, onChannel, onToggle, onOpenLogin, onClose, onConfirm,
}: {
  post: PostDTO;
  platforms: PlatformDTO[];
  rss: PodcastRssDTO | null;
  selectedIds: string[];
  channelIds: Record<string, string>;
  publishError: string | null;
  onChannel: (platformId: string, channelId: string) => void;
  onToggle: (id: string) => void;
  onOpenLogin: (id: string) => void;
  onClose: () => void;
  onConfirm: (platformIds: string[], channelIds: Record<string, string>) => void;
}) {
  const [rssOpen, setRssOpen] = React.useState(false);
  const t = TYPE_META[post.type];
  const supported = platforms.filter((p) => p.supports.includes(post.type));
  const rssTargets = post.type === "audio"
    ? (rss?.claims ?? []).flatMap((claim) => {
        const platform = platforms.find((candidate) => candidate.id === claim.platformId);
        return platform ? [{ claim, platform }] : [];
      })
    : [];
  const rssClaimedIds = new Set(rssTargets.map(({ platform }) => platform.id));
  const directSupported = supported.filter((p) =>
    p.authMode !== "rss-downstream" && !rssClaimedIds.has(p.id)
  );
  const failed = (p: PlatformDTO) => p.sync.phase !== "connected";
  const selected = directSupported.filter((p) => selectedIds.includes(p.id) && !failed(p));
  /* 多频道平台的目标行始终展示；未选平台时置灰并禁用选择。 */
  const channelTargets = directSupported.filter((p) => (p.account?.channels?.length ?? 0) > 1);
  const needChannel = channelTargets.filter((p) => selectedIds.includes(p.id) && !failed(p));
  const channelValue = (p: PlatformDTO) => {
    const list = p.account?.channels ?? [];
    return channelIds[p.id] && list.some((c) => c.id === channelIds[p.id]) ? channelIds[p.id] : list[0]?.id ?? "";
  };
  const selectedChannelIds = Object.fromEntries(needChannel.map((p) => {
    return [p.id, channelValue(p)];
  }));
  /* 三态皮肤：选中 = 平台色实底；未选中 = 平台色 20% 淡底；未获取 = 中性灰 */
  const skinOf = (p: PlatformDTO) => {
    if (failed(p)) return { background: "var(--color-hover)", color: "var(--color-ink3)" };
    if (selectedIds.includes(p.id)) return { background: p.color, color: p.fg || "#fff" };
    return { background: `color-mix(in srgb, ${p.color} 18%, transparent)`, color: p.fg ? "var(--color-ink)" : p.color };
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
              <span className="ml-auto font-mono text-[13px] text-ink2">直接发布 {String(selected.length).padStart(2, "0")} / {directSupported.length}</span>
            </div>
            {publishError && (
              <p className="m-0 mt-3 flex items-start gap-2 rounded-[10px] border border-error/25 bg-error/10 px-3 py-2.5 text-[12px] leading-[1.65] text-error" role="alert">
                <Alert size={12} strokeWidth={3.3} className="mt-[2px] flex-none" />
                {publishError}
              </p>
            )}

            {/* 原型 .m-platwall：gap 16，padding 14 6 8 */}
            <div className="flex flex-wrap gap-4 px-1.5 pb-2 pt-3.5">
              {directSupported.map((p) => {
                const off = failed(p);
                const on = selectedIds.includes(p.id);
                return (
                  <span key={p.id} title={p.name + (off ? " · 账号未连接，点一下可修复" : "")} className="inline-flex">
                    <Button
                      className={
                        "relative flex h-14 w-14 items-center justify-center rounded-[16px] p-0 shadow-[0_1px_2px_rgba(15,15,15,0.04)] transition-[translate,transform,box-shadow] duration-150 data-[off=true]:shadow-none" +
                        (off ? "" : " data-[hovered=true]:-translate-y-[3px]")
                      }
                      style={{ ...skinOf(p), transform: "none" }}
                      data-off={off}
                      onPress={() => {
                        if (!off) return onToggle(p.id);
                        onOpenLogin(p.id);
                      }}
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
                    </Button>
                  </span>
                );
              })}
            </div>

            {rssTargets.length > 0 && rss && (
              <div className="mt-2 overflow-hidden rounded-[14px] border border-line bg-card">
                <Button
                  variant="ghost"
                  className="flex h-auto w-full items-center gap-2.5 rounded-none px-3.5 py-3 text-left data-[hovered=true]:bg-hover"
                  aria-expanded={rssOpen}
                  onPress={() => setRssOpen((open) => !open)}
                >
                  <span className="flex h-7 flex-none items-center gap-1 rounded-[8px] bg-accent-tint px-2 font-mono text-[10px] font-black text-accent">
                    <Rss size={12} strokeWidth={2.7} /> RSS
                  </span>
                  <b className="min-w-0 truncate text-[13px] text-ink">{rss.title}</b>
                  <span className="ml-auto flex-none text-[10.5px] text-ink2">
                    {rss.episodeCount ?? 0} 期 · 自动同步 {rssTargets.length} 个平台
                  </span>
                  <ChevronDown
                    size={11}
                    strokeWidth={2.5}
                    className={"flex-none text-ink3 transition-transform " + (rssOpen ? "rotate-180" : "")}
                  />
                </Button>
                {rssOpen && (
                  <div className="flex flex-wrap gap-2 border-t border-line px-3.5 py-3">
                    {rssTargets.map(({ claim, platform }) => (
                      <span
                        key={claim.platformId}
                        className={
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold "
                          + (claim.state === "claimed"
                            ? "border-accent/25 bg-accent-tint text-ink"
                            : "border-line bg-paper text-ink2")
                        }
                        title={`${platform.name} · ${claim.label}${claim.evidenceUrl ? ` · ${claim.evidenceUrl}` : ""}`}
                      >
                        <PlatformMark
                          id={platform.id}
                          char={platform.char}
                          size={15}
                          tone={claim.state === "claimed" ? "lit" : "dim"}
                          className="m-0 h-[15px] w-[15px]"
                        />
                        {platform.name}
                        <em className="not-italic text-ink3">{claim.label}</em>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {channelTargets.length > 0 && (
              <div className="mt-[22px] flex flex-col gap-2.5 border-t border-line pt-[22px]">
                {channelTargets.map((p) => {
                  const list = p.account?.channels ?? [];
                  const current = channelValue(p);
                  const enabled = selectedIds.includes(p.id) && !failed(p);
                  return (
                    <div
                      key={p.id}
                      className={"flex min-h-[40px] items-center gap-3" + (enabled ? "" : " opacity-[0.55]")}
                      aria-disabled={!enabled}
                    >
                      <span
                        className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] text-[12px] font-black"
                        style={{
                          background: enabled ? p.color : "var(--color-hover)",
                          color: enabled ? p.fg || "#fff" : "var(--color-ink3)",
                        }}
                        aria-hidden="true"
                      >
                        <PlatformMark
                          id={p.id}
                          char={p.char}
                          size={18}
                          imgScale={1.25}
                          tone={enabled ? "lit" : "off"}
                          className="m-0 h-[18px] w-[18px]"
                        />
                      </span>
                      <span className={"min-w-0 flex-1 truncate text-sm font-bold " + (enabled ? "text-ink" : "text-ink3")}>
                        发到「{p.name}」的哪个{p.id === "xiaoyuzhou" ? "节目" : p.id === "lizhi" ? "播单" : "专辑"}
                      </span>
                      <span className="relative inline-flex flex-none items-center">
                        <Select
                          className="inline-flex flex-none"
                          aria-label={`${p.name} 发布频道`}
                          selectedKey={current}
                          isDisabled={!enabled}
                          onSelectionChange={(key) => { if (typeof key === "string") onChannel(p.id, key); }}
                        >
                          <Select.Trigger className="h-auto cursor-pointer rounded-full border border-line bg-card py-[7px] pl-4 pr-8 text-[12px] font-bold text-ink shadow-none outline-none transition-[border-color] duration-150 hover:border-[#DEDCD8] focus-visible:border-accent data-[focus-visible=true]:border-accent">
                            <Select.Value className="truncate" />
                          </Select.Trigger>
                          <Select.Popover className="min-w-[160px] rounded-[12px] border border-line bg-card p-1 shadow-[0_14px_40px_rgba(15,15,15,0.16)]">
                            <ListBox className="outline-none">
                              {list.map((c) => (
                                <ListBoxItem
                                  key={c.id}
                                  id={c.id}
                                  textValue={c.name}
                                  className="cursor-pointer rounded-[8px] px-3 py-2 text-[12px] font-bold text-ink outline-none data-[focused=true]:bg-hover data-[hovered=true]:bg-hover data-[selected=true]:bg-hover"
                                >
                                  {c.name}
                                </ListBoxItem>
                              ))}
                            </ListBox>
                          </Select.Popover>
                        </Select>
                        <span className="pointer-events-none absolute right-3 flex text-ink3">
                          <ChevronDown size={10} strokeWidth={2.4} />
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-[30px] flex items-center gap-3.5">
              <span className="font-mono text-[12px] text-ink2">
                {selected.length ? `将创建 ${selected.length} 个发布任务 · 不阻塞当前操作` : "至少点亮一个平台"}
              </span>
              <Button variant="ghost" className="dialog-cancel ml-auto rounded-full border border-line bg-transparent px-6 py-3 text-[15px] font-bold text-ink data-[hovered=true]:!bg-hover" onPress={onClose}>
                取消
              </Button>
              <Button
                isDisabled={!selected.length || needChannel.some((p) => !selectedChannelIds[p.id])}
                className="gap-2 rounded-full bg-green px-[30px] py-[13px] text-base font-black tracking-[1px] text-white data-[hovered=true]:brightness-105 data-[disabled=true]:opacity-35"
                onPress={() => onConfirm(selected.map((platform) => platform.id), selectedChannelIds)}
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
