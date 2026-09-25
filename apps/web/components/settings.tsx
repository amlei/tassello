/* settings —— 浏览器选择 + 平台账号 + 默认发布名单（HeroUI Modal + Popover + 方向 B 视觉） */
"use client";

import React from "react";
import { TYPE_META, TYPE_ORDER, type PlatformDTO, type ContentType, type AppSettings, IMPORT_BROWSERS, type ImportBrowserDTO, type ImportBrowserId } from "@tassello/shared";
import { AlertDialog, Button, Modal, Popover } from "@heroui/react";
import { Alert, Check, Refresh, X } from "reicon-react";
import { ChevronDown, ChevronLeft, ChevronRight } from "reicon-react";
import { PLATFORM_IMAGE_MARKS, PLATFORM_MARKS, PlatformMark } from "./platform-icons";
import { ChromeIcon, EdgeIcon } from "./browser-icons";
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
  if (p.status !== "active") return <span className={CHIP + " border-error/30 bg-error/10 text-error"}>planned</span>;
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
            "gap-2.5 rounded-[12px] text-left transition-[border-color] data-[hovered=true]:border-[#DEDCD8]"
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
  /* 原型 .w-relink：通栏 accent 主按钮（重新获取 / 重新校验共用一套动作样式） */
  const relinkCls =
    "w-full flex-none items-center justify-center gap-1.5 rounded-full border-none bg-accent px-3.5 py-[9px] text-[13px] font-bold text-white transition-[filter] duration-150 data-[hovered=true]:brightness-105 data-[disabled=true]:opacity-50";
  return (
    <div className="p-4">
      <div className="flex items-center gap-[9px] border-b border-line pb-3">
        <AccountMark p={p} off={off} />
        <span className="min-w-0 flex-1 text-sm font-bold tracking-[-0.2px]">{p.name}</span>
        <StatusChip p={p} busy={busy} />
        <Button isIconOnly variant="ghost" className="h-[22px] w-[22px] min-w-0 rounded-lg border border-line bg-card text-ink2 data-[hovered=true]:bg-hover data-[hovered=true]:text-ink" onPress={onClose} aria-label="关闭账号信息"><X size={11} strokeWidth={4} /></Button>
      </div>
      {p.status !== "active" ? (
        <div className="flex flex-col gap-3.5 pt-3.5">
          <p className="flex items-start gap-2 text-[12.5px] leading-[1.65] text-error"><Alert size={12} strokeWidth={3.3} /> 适配器尚未接入（二期），先把账号矩阵摆在这里。</p>
        </div>
      ) : off ? (
        <div className="flex flex-col gap-3.5 pt-3.5">
          <p className="flex items-start gap-2 text-[12.5px] leading-[1.65] text-error"><Alert size={12} strokeWidth={3.3} /> {a?.failReason || "凭据未获取"}</p>
          <Button variant="ghost" isDisabled={busy} className={relinkCls} onPress={() => onAcquire(p.id)}>
            <Refresh size={11} strokeWidth={3.3} /> {busy ? "处理中…" : "重新获取"}
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
            <Refresh size={11} strokeWidth={3.3} /> {busy ? "校验中…" : "重新校验"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function SettingsSheet({
  platforms, settings, browsers, busyId, onToggleDefault, onAcquireAndSetDefault, onVerify, onAcquire, onImportBrowser, onClose,
}: {
  platforms: PlatformDTO[];
  settings: AppSettings;
  /** 导入候选浏览器与检测状态（rail 打开设置时随平台/设置一并拉取） */
  browsers: ImportBrowserDTO[];
  busyId: string | null;
  onToggleDefault: (type: ContentType, id: string) => void;
  onAcquireAndSetDefault: (type: ContentType, id: string) => void;
  onVerify: (id: string) => void;
  onAcquire: (id: string) => void;
  onImportBrowser: (id: ImportBrowserId) => void;
  onClose: () => void;
}) {
  const [popId, setPopId] = React.useState<string | null>(null);
  /* 获取账号会先关闭工作台浏览器再复制登录态（pkill 不能静默发生）——
     设置里的两个获取入口都先过这枚确认弹窗，确认后才真正执行 */
  const [confirmAcquire, setConfirmAcquire] = React.useState<{ platformId: string; type?: ContentType } | null>(null);
  const browserName = IMPORT_BROWSERS.find((b) => b.id === settings.importBrowser)?.name ?? "所选浏览器";
  const SelIcon = settings.importBrowser === "edge" ? EdgeIcon : ChromeIcon;
  const confirmPlatform = platforms.find((p) => p.id === confirmAcquire?.platformId);

  return (
    <>
      <Modal>
      <Modal.Backdrop isOpen onOpenChange={(o) => { if (!o) onClose(); }}>
        <Modal.Container>
          <Modal.Dialog
            className="max-w-[780px] overflow-hidden rounded-[20px] bg-paper p-0 shadow-[0_14px_40px_rgba(15,15,15,0.14)]"
            aria-label="设置"
            data-screen-label="设置"
          >
            <div className="relative flex max-h-[calc(100vh-72px)] min-h-0 w-full flex-col px-[34px] pb-[28px] pt-[30px]" onClick={(e) => e.stopPropagation()}>
              <div className="mb-1.5 flex items-center gap-3.5">
                <Modal.Heading className="text-[22px] font-bold tracking-[-0.2px]">设置</Modal.Heading>
              </div>

              <div className="scroll-thin relative mt-2 min-h-0 flex-1 overflow-auto pb-[64px] pr-1.5">
                <section>
                  {/* 外观：标题与主题切换器同一行，切换器靠右（原型 w-sethead） */}
                  <div className="flex items-center justify-between gap-3.5">
                    <h4 className="text-[15px] font-bold tracking-[-0.2px]">外观</h4>
                    <ThemeSwitcher />
                  </div>
                </section>
                <section className="mt-[30px] border-t border-line pt-[26px]">
                  {/* 浏览器选择：获取账号时从哪个日常浏览器复制登录态。
                      切换只落偏好不动数据；再次获取以当前选择整体覆盖（原型 w-selwrap/w-selhint） */}
                  <div className="flex items-center justify-between gap-3.5">
                    <h4 className="text-[15px] font-bold tracking-[-0.2px]">浏览器选择</h4>
                    <span className="relative inline-flex items-center">
                      <span className="pointer-events-none absolute left-3 flex">
                        <SelIcon size={14} />
                      </span>
                      <select
                        value={settings.importBrowser}
                        onChange={(e) => onImportBrowser(e.target.value as ImportBrowserId)}
                        aria-label="浏览器选择"
                        className="cursor-pointer appearance-none rounded-full border border-line bg-card py-[6px] pl-[33px] pr-[30px] text-[12px] font-bold text-ink outline-none transition-[border-color] duration-150 hover:border-[#DEDCD8] focus-visible:border-accent"
                      >
                        {(browsers.length ? browsers : IMPORT_BROWSERS.map((b) => ({ ...b, detected: true }))).map((b) => (
                          <option key={b.id} value={b.id} disabled={!b.detected}>
                            {b.name}{b.detected ? "" : "（未安装）"}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-3 flex text-ink2">
                        <ChevronDown size={10} strokeWidth={2.4} />
                      </span>
                    </span>
                  </div>
                  <p className="mt-3 text-[11.5px] leading-[1.7] text-ink3">
                    获取账号时从这个浏览器复制登录态；再次获取会整体覆盖，以当前选择的为准。
                  </p>
                </section>
                <section className="mt-[30px] border-t border-line pt-[26px]">
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
                         onAcquire={(id) => setConfirmAcquire({ platformId: id })}
                         side={i % 2 === 0 ? "left" : "right"}
                      />
                    ))}
                  </div>
                </section>

                {/* 二、默认发布名单：每种稿子挑一次，发布弹层就按这份名单预选（原型 m-typerows） */}
                <section className="mt-[30px] border-t border-line pt-[26px]">
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
                                <span key={p.id} title={p.name + (off ? ` · 获取失败，点一下重新获取并设为${t.zh}的默认平台` : on ? ` · 已是${t.zh}的默认平台` : ` · 点一下设为${t.zh}的默认平台`)} className="inline-flex">
                                  <Button
                                    className={
                                      "relative flex h-[38px] w-[38px] items-center justify-center rounded-[12px] p-0 shadow-[0_1px_2px_rgba(15,15,15,0.04)] transition-[translate,transform,box-shadow] duration-150 data-[off=true]:shadow-none" +
                                      (off ? "" : " data-[hovered=true]:-translate-y-[3px]")
                                    }
                                    style={{ ...skin, transform: "none" }}
                                    data-off={off}
                                    onPress={() => (off ? setConfirmAcquire({ platformId: p.id, type: k }) : onToggleDefault(k, p.id))}
                                    aria-label={p.name}
                                  >
                                    <PlatformMark id={p.id} char={p.char} size={20} imgScale={1.4} tone={off ? "off" : on ? "lit" : "dim"} className="m-0 h-5 w-5" />
                                    {on && !off && (
                                      /* 选中勾：原型 .m-platico.sm .m-platck，16px 圆角 5，偏移 -5px，无白边 */
                                      <span className="absolute -right-[5px] -top-[5px] z-[2] flex h-4 w-4 animate-pop items-center justify-center rounded-[5px] bg-accent text-white">
                                        <Check className="m-0 h-[9px] w-[9px]" strokeWidth={4} />
                                      </span>
                                    )}
                                    {off && p.status === "active" && (
                                      <span className="absolute -bottom-[5px] -right-[5px] z-[2] flex h-4 w-4 items-center justify-center rounded-[5px] border border-line bg-card text-ink2">
                                        <Refresh className="m-0 h-[9px] w-[9px]" />
                                      </span>
                                    )}
                                  </Button>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

              </div>

              {/* 完成钮：绝对定位在滚动区右下（原型 .w-set .m-sheet-foot：padding 0 34px 22px） */}
              <Button
                className="absolute bottom-[22px] right-[34px] z-[6] rounded-full bg-accent px-[26px] py-[11px] text-[15px] font-bold text-white transition-[filter] duration-150 data-[hovered=true]:brightness-105"
                onPress={onClose}
              >
                完成
              </Button>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>

    {/* 导入确认：与删稿确认同构（Esc / 点背景取消）；按钮走主色 —— 有打断、不毁数据 */}
    <AlertDialog>
      <AlertDialog.Backdrop isOpen={!!confirmAcquire} onOpenChange={(o) => { if (!o) setConfirmAcquire(null); }}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="max-w-[420px] rounded-[20px] bg-paper p-6 shadow-[0_14px_40px_rgba(15,15,15,0.14)]" role="alertdialog" aria-label="导入登录态确认">
            <AlertDialog.Header className="flex items-start gap-3">
              <AlertDialog.Heading className="text-[17px] font-bold tracking-[-0.2px]">从 {browserName} 导入登录态？</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="mt-1.5 text-sm leading-relaxed text-ink2">
              工作台浏览器会先关闭一次，并以 {browserName} 的登录态整体覆盖后重新校验
              {confirmPlatform ? `「${confirmPlatform.name}」` : ""}账号；日常浏览器不受影响。
            </AlertDialog.Body>
            <AlertDialog.Footer className="mt-5 flex items-center justify-end gap-3">
              <Button variant="ghost" className="rounded-full px-4 py-2 text-[13.5px] font-bold text-ink2 data-[hovered=true]:bg-hover" onPress={() => setConfirmAcquire(null)}>
                取消
              </Button>
              <Button
                className="rounded-full bg-accent px-6 py-2.5 text-sm font-bold text-white data-[hovered=true]:brightness-105"
                onPress={() => {
                  const c = confirmAcquire;
                  setConfirmAcquire(null);
                  if (!c) return;
                  if (c.type) onAcquireAndSetDefault(c.type, c.platformId);
                  else onAcquire(c.platformId);
                }}
              >
                导入并校验
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
    </>
  );
}
