/* settings —— 平台账号 + 默认发布名单（HeroUI Modal + Popover + 方向 B 视觉） */
"use client";

import React from "react";
import { TYPE_META, TYPE_ORDER, type PlatformDTO, type ContentType, type AppSettings } from "@tassello/shared";
import { Button, Modal, Popover } from "@heroui/react";
import { ChevronLeft, ChevronRight } from "reicon-react";
import { Check as ReiconCheck } from "reicon-react";
import { IcAlert, IcRetry, IcX } from "./icons";
import { PLATFORM_IMAGE_MARKS, PLATFORM_MARKS, PlatformMark } from "./platform-icons";
import { ThemeSwitcher } from "./theme";

/* 账号行的平台标记：有品牌图标（SVG 或图片）用品牌图标，都没有则回退色块 */
function AccountMark({ p, off }: { p: PlatformDTO; off: boolean }) {
  if (!PLATFORM_MARKS[p.id] && !PLATFORM_IMAGE_MARKS[p.id]) {
    return <span className="block h-3.5 w-3.5 flex-none rounded" style={{ background: p.color, opacity: off ? 0.38 : 1 }} />;
  }
  return (
    <span className="flex flex-none items-center" style={{ color: off ? "var(--color-ink3)" : p.color }}>
      <PlatformMark id={p.id} char={p.char} size={16} tone={off ? "off" : "lit"} />
    </span>
  );
}

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const CHIP = "inline-block flex-none min-w-[66px] rounded-full border px-[9px] py-0.5 text-center font-mono text-[10px] font-bold";

function StatusChip({ p, busy }: { p: PlatformDTO; busy: boolean }) {
  const off = p.status !== "active" || !p.account || p.account.state !== "ok";
  if (busy) return <span className={CHIP}>校验中…</span>;
  if (p.status !== "active") return <span className={CHIP + " border-[#F2C2D1] text-error"}>planned</span>;
  if (off) return <span className={CHIP + " border-[#F2C2D1] text-error"}>获取失败</span>;
  return <span className={CHIP + " border-[#B7E3CD] text-green"}>已获取</span>;
}

/* 账号行 = Popover 触发器；浮卡跟随行、自动翻转，不再手算 fixed 坐标 */
function AccountRow({
  p, open, busy, onOpenChange, onVerify, onAcquire, side,
}: {
  p: PlatformDTO;
  open: boolean;
  busy: boolean;
  onOpenChange: (id: string | null) => void;
  onVerify: (id: string) => void;
  onAcquire: (id: string) => void;
  side: "left" | "right";
}) {
  const off = p.status !== "active" || !p.account || p.account.state !== "ok";
  const a = p.account;
  return (
    <Popover isOpen={open} onOpenChange={(o) => onOpenChange(o ? p.id : null)}>
      <Popover.Trigger>
        <Button
          variant="ghost"
          aria-expanded={open}
          aria-label={`${p.name} 账号信息`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            width: "100%",
            height: "auto",
            padding: "11px 12px",
            background: "var(--color-card)",
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: open ? "var(--color-accent)" : "var(--color-line)",
            boxShadow: "0 1px 2px rgba(15,15,15,0.04)",
          }}
          className={
            "gap-2.5 rounded-[10px] text-left transition-[border-color] data-[hovered=true]:border-[#DEDCD8]"
          }
        >
          <AccountMark p={p} off={off} />
          <span className="w-[72px] flex-none text-left text-[13.5px] font-bold tracking-[-0.1px] text-ink">{p.name}</span>
          <span className="min-w-0 flex-1 truncate text-left text-[11.5px] font-normal text-ink2">
            {p.status !== "active" ? "尚未接入" : off ? "未连接账号" : a?.name ?? ""}
          </span>
          <StatusChip p={p} busy={busy} />
          <span className="flex flex-none text-ink2"><IcChevronStatic dir={open ? "left" : "right"} /></span>
        </Button>
      </Popover.Trigger>
      <Popover.Content placement={side === "left" ? "right" : "left"} className="w-[336px] rounded-2xl border border-line bg-card p-0 shadow-[0_14px_40px_rgba(15,15,15,0.14)]">
        <AccountPopBody p={p} busy={busy} onVerify={onVerify} onAcquire={onAcquire} onClose={() => onOpenChange(null)} />
      </Popover.Content>
    </Popover>
  );
}

/* 静态箭头（避免引 React 状态），hover 由 CSS 处理 */
function IcChevronStatic({ dir }: { dir: "left" | "right" }) {
  const Ic = dir === "left" ? ChevronLeft : ChevronRight;
  return <Ic size={11} strokeWidth={1.6} aria-hidden="true" />;
}

function AccountPopBody({
  p, busy, onVerify, onAcquire, onClose,
}: {
  p: PlatformDTO;
  busy: boolean;
  onVerify: (id: string) => void;
  onAcquire: (id: string) => void;
  onClose: () => void;
}) {
  const off = p.status !== "active" || !p.account || p.account.state !== "ok";
  const a = p.account;
  const relinkCls =
    "inline-flex flex-none items-center gap-[5px] rounded-full border border-line bg-card px-2.5 py-[3px] font-mono text-[10.5px] font-bold text-ink data-[hovered=true]:bg-hover data-[disabled=true]:opacity-50";
  return (
    <div className="p-4">
      <div className="flex items-center gap-[9px] border-b border-line pb-3">
        <AccountMark p={p} off={off} />
        <span className="min-w-0 flex-1 text-sm font-bold tracking-[-0.2px]">{p.name}</span>
        <StatusChip p={p} busy={busy} />
        <Button isIconOnly variant="ghost" className="h-[22px] w-[22px] min-w-0 rounded-lg border border-line bg-card text-ink2 hover:text-ink" onPress={onClose} aria-label="关闭账号信息"><IcX size={11} /></Button>
      </div>
      {p.status !== "active" ? (
        <div className="flex flex-col gap-3.5 pt-3.5">
          <p className="flex items-start gap-2 text-[12.5px] leading-[1.65] text-error"><IcAlert size={12} /> 适配器尚未接入（二期），先把账号矩阵摆在这里。</p>
        </div>
      ) : off ? (
        <div className="flex flex-col gap-3.5 pt-3.5">
          <p className="flex items-start gap-2 text-[12.5px] leading-[1.65] text-error"><IcAlert size={12} /> {a?.failReason || "凭据未获取"}</p>
          <Button variant="ghost" isDisabled={busy} className={relinkCls} onPress={() => onAcquire(p.id)}>
            <IcRetry size={11} /> {busy ? "处理中…" : `重新获取${p.name}账号`}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 pt-3.5">
          <div className="flex items-center gap-3">
            {a?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-[17px] font-black" src={a.avatarUrl} alt="" />
            ) : (
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-[17px] font-black" style={{ background: p.color, color: p.fg || "#fff" }} aria-hidden="true">
                {(a?.name ?? "?").slice(0, 1)}
              </span>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[15px] font-bold tracking-[-0.2px]">{a?.name ?? "—"}</div>
              <div className="mt-[3px] truncate font-mono text-[11.5px] text-ink2">{a?.uid ?? "—"}</div>
            </div>
          </div>
          <dl className="m-0 flex flex-col gap-2.5">
            <div>
              <dt className="mb-[3px] font-mono text-[10.5px] text-ink3">授权</dt>
              <dd className="text-[12.5px] leading-[1.7] text-ink">{a?.authExpiresAt ? `有效至 ${fmtShort(a.authExpiresAt)} · ` : "会话型登录 · "}最近校验 {fmtShort(a?.lastCheckedAt ?? null)}</dd>
            </div>
            <div>
              <dt className="mb-[3px] font-mono text-[10.5px] text-ink3">发布去向</dt>
              <dd className="text-[12.5px] leading-[1.7] text-ink">{p.lands}</dd>
            </div>
          </dl>
          <Button variant="ghost" isDisabled={busy} className={relinkCls} onPress={() => onVerify(p.id)}>
            <IcRetry size={11} /> {busy ? "校验中…" : "重新校验"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function SettingsSheet({
  platforms, settings, busyId, onToggleDefault, onAcquireAndSetDefault, onVerify, onAcquire, onClose,
}: {
  platforms: PlatformDTO[];
  settings: AppSettings;
  busyId: string | null;
  onToggleDefault: (type: ContentType, id: string) => void;
  onAcquireAndSetDefault: (type: ContentType, id: string) => void;
  onVerify: (id: string) => void;
  onAcquire: (id: string) => void;
  onClose: () => void;
}) {
  const okCount = platforms.filter((p) => p.status === "active" && p.account?.state === "ok").length;
  const activeCount = platforms.filter((p) => p.status === "active").length;
  const [popId, setPopId] = React.useState<string | null>(null);

  return (
    <Modal>
      <Modal.Backdrop isOpen onOpenChange={(o) => { if (!o) onClose(); }}>
        <Modal.Container>
          <Modal.Dialog
            className="max-w-[780px] overflow-hidden rounded-[20px] bg-paper p-0 shadow-[0_14px_40px_rgba(15,15,15,0.14)]"
            aria-label="设置"
            data-screen-label="设置"
          >
            <div className="flex max-h-[calc(100vh-72px)] min-h-0 w-full flex-col px-[30px] pb-6 pt-[26px]" onClick={(e) => e.stopPropagation()}>
              <div className="mb-1.5 flex items-center gap-3.5">
                <Modal.Heading className="text-[20px] font-bold tracking-[-0.3px]">设置</Modal.Heading>
                <span className="ml-auto font-mono text-[13px] text-ink2">{okCount}/{activeCount} 已获取</span>
              </div>

              <div className="scroll-thin relative mt-2 min-h-0 flex-1 overflow-auto pb-11 pr-1.5">
                <section>
                  <h4 className="mb-3.5 flex items-center gap-2.5 text-[15px] font-bold tracking-[-0.2px]">外观</h4>
                  <ThemeSwitcher />
                </section>
                <section className="mt-[26px]">
                  <h4 className="mb-3.5 flex items-center gap-2.5 text-[15px] font-bold tracking-[-0.2px]">平台账号</h4>
                  <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5">
                    {platforms.map((p, i) => (
                      <AccountRow
                        key={p.id}
                        p={p}
                        open={popId === p.id}
                        busy={busyId === p.id}
                        onOpenChange={setPopId}
                        onVerify={onVerify}
                        onAcquire={onAcquire}
                        side={i % 2 === 0 ? "left" : "right"}
                      />
                    ))}
                  </div>
                </section>

                <section className="mt-[26px] border-t border-line pt-[26px]">
                  <h4 className="mb-3.5 flex items-center gap-2.5 text-[15px] font-bold tracking-[-0.2px]">默认发布平台</h4>
                  <div className="flex flex-col">
                    {TYPE_ORDER.map((k) => {
                      const t = TYPE_META[k];
                      const list = platforms.filter((p) => p.supports.includes(k));
                      const chosen = settings.defaultTargets[k] ?? [];
                      return (
                        <div className="flex items-center gap-4 border-t border-line py-[18px] first:border-t-0 first:pt-1 last:pb-1" key={k}>
                          <span className="inline-flex w-[74px] flex-none items-center gap-2 text-sm font-bold">
                            <span className="h-[13px] w-[13px] rounded" style={{ background: t.color }} />
                            {t.zh}
                          </span>
                          <div className="flex flex-wrap gap-2.5">
                            {list.map((p) => {
                              const on = chosen.includes(p.id);
                              const off = p.status !== "active" || !p.account || p.account.state !== "ok";
                              const skin = off
                                ? { background: "var(--color-hover)", color: "var(--color-ink3)" }
                                : on
                                  ? { background: p.color, color: p.fg || "#fff" }
                                  : { background: p.color + "2E", color: p.fg ? "var(--color-ink)" : p.color };
                               return (
                                 <Button
                                   key={p.id}
                                    className="relative flex h-[38px] w-[38px] items-center justify-center rounded-xl p-0 text-sm font-black data-[hovered=true]:-translate-y-[3px]"
                                   style={skin}
                                   onPress={() => (off ? onAcquireAndSetDefault(k, p.id) : onToggleDefault(k, p.id))}
                                   aria-label={p.name + (p.status !== "active" ? " · 尚未接入" : off ? " · 凭据未获取" : on ? ` · 已是${t.zh}的默认平台` : ` · 点一下设为${t.zh}的默认平台`)}
                                 >
                                    <PlatformMark id={p.id} char={p.char} size={20} imgScale={1.4} tone={off ? "off" : on ? "lit" : "dim"} />
                                    {on && !off && <span className="absolute -right-[5px] -top-[5px] flex h-4 w-4 items-center justify-center rounded-[5px] border-2 border-white bg-accent text-white"><ReiconCheck size={10} strokeWidth={2.4} /></span>}
                                   {off && p.status === "active" && <span className="absolute bottom-[-5px] right-[-5px] flex h-4 w-4 items-center justify-center rounded-[5px] border border-line bg-card text-ink2"><IcRetry size={9} /></span>}
                                 </Button>
                               );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>

              {/* 悬浮完成钮：盖在滚动区右下角，滚动区底部衬一条渐隐 */}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-14 rounded-b-[20px] bg-gradient-to-t from-paper from-30% to-transparent" aria-hidden="true" />
              <Button
                className="absolute bottom-4 right-5 z-[6] rounded-full bg-accent px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_8px_22px_rgba(15,15,15,0.2)] data-[hovered=true]:brightness-105"
                onPress={onClose}
              >
                完成
              </Button>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
