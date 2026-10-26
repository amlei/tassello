/* settings-dialog —— 设置业务组合：扩展、Vault、账号和默认发布。 */
"use client";

import React from "react";
import {
  TYPE_META,
  TYPE_ORDER,
  type AppSettings,
  type ContentType,
  type PlatformDTO,
  type PublishCapabilityDTO,
} from "@tassello/shared";
import { Button, Input, Link, Modal, Popover } from "@heroui/react";
import { Alert, Check, FolderFiles, Puzzle, Refresh, X } from "reicon-react";
import { ChevronLeft, ChevronRight } from "reicon-react";
import { PLATFORM_IMAGE_MARKS, PLATFORM_MARKS, PlatformMark } from "@tassello/ui/platform-icons";
import { SettingRow } from "@tassello/ui/patterns";
import { ChromeIcon, EdgeIcon } from "@tassello/site-ui/browser-icons";
import { api } from "../../adapters/api";
import { MosaicLogo } from "../brand/mosaic-logo";
import { DirectoryPicker } from "./directory-picker";
import { ThemeSwitcher } from "./theme-switcher";

export type VaultViewState = {
  status: "ready" | "pending" | "conflict" | "missing";
  path?: string;
  files?: number;
  conflicts?: number;
  warnings?: number;
};

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
  if (busy || p.sync.phase === "checking") return <span className={CHIP + " border-accent/35 bg-accent-tint text-accent"}>检查中…</span>;
  if (p.sync.phase === "unsupported") return <span className={CHIP + " border-error/30 bg-error/10 text-error"}>尚未接入</span>;
  if (p.sync.phase === "extension_offline") return <span className={CHIP + " border-warn/30 bg-warn/10 text-warn"}>等待扩展</span>;
  if (p.sync.phase === "unverified") return <span className={CHIP + " border-accent/35 bg-accent-tint text-accent"}>待检测</span>;
  if (p.sync.phase === "source_changed") return <span className={CHIP + " border-warn/30 bg-warn/10 text-warn"}>重新验证</span>;
  if (p.sync.phase === "needs_login") return <span className={CHIP + " border-error/30 bg-error/10 text-error"}>需要登录</span>;
  if (p.sync.phase === "failed") return <span className={CHIP + " border-error/30 bg-error/10 text-error"}>检查失败</span>;
  return <span className={CHIP + " border-[#B7E3CD] text-green"}>已连接</span>;
}

/* 账号行 = Popover 触发器；浮卡跟随行、自动翻转，不再手算 fixed 坐标 */
function AccountRow({
  p, open, busy, onOpenChange, onVerify, onOpenLogin, side,
}: {
  p: PlatformDTO;
  open: boolean;
  busy: boolean;
  onOpenChange: (id: string | null) => void;
  onVerify: (id: string) => void;
  onOpenLogin: (id: string) => void;
  side: "left" | "right";
}) {
  const off = p.sync.phase !== "connected";
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
            {p.sync.phase === "unsupported"
              ? "尚未接入"
              : p.sync.phase === "checking"
                ? "正在读取平台登录态"
                : p.sync.phase === "extension_offline"
                  ? "浏览器扩展未连接"
                  : p.sync.phase === "unverified"
                    ? "等待首次检测"
                    : p.sync.phase === "source_changed"
                      ? "账号来源已变化"
                      : p.sync.phase === "needs_login"
                        ? "需要登录"
                        : p.sync.phase === "failed"
                          ? "检查失败"
                          : a?.name ?? ""}
          </span>
          <StatusChip p={p} busy={busy} />
          <span className="flex flex-none text-ink2"><IcChevronStatic dir={open ? "left" : "right"} /></span>
        </Button>
      </Popover.Trigger>
      <Popover.Content placement={side === "left" ? "right" : "left"} className="w-[336px] rounded-2xl border border-line bg-card p-0 shadow-[0_14px_40px_rgba(15,15,15,0.14)]">
        <AccountPopBody p={p} busy={busy} onVerify={onVerify} onOpenLogin={onOpenLogin} onClose={() => onOpenChange(null)} />
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
  p, busy, onVerify, onOpenLogin, onClose,
}: {
  p: PlatformDTO;
  busy: boolean;
  onVerify: (id: string) => void;
  onOpenLogin: (id: string) => void;
  onClose: () => void;
}) {
  const off = p.sync.phase !== "connected";
  const a = p.account;
  /* 通栏 accent 主按钮：登录与重新检查共用同一套动作样式。 */
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
          <p className="flex items-start gap-2 text-[12.5px] leading-[1.65] text-error"><Alert size={12} strokeWidth={3.3} /> {p.sync.reason || a?.failReason || "账号信息未获取"}</p>
          <Button variant="ghost" isDisabled={busy || p.sync.phase === "extension_offline"} className={relinkCls} onPress={() => onOpenLogin(p.id)}>
            在浏览器中打开登录页
          </Button>
          <Button variant="ghost" isDisabled={busy} className={relinkCls} onPress={() => onVerify(p.id)}>
            <Refresh size={11} strokeWidth={3.3} /> {busy ? "检查中…" : "重新检查"}
          </Button>
          <p className="m-0 text-[11.5px] leading-[1.7] text-ink2">登录完成后扩展会重新读取账号资料，不需要复制浏览器 profile。</p>
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
              <dd className="text-[12.5px] leading-[1.7] text-ink">{a?.authExpiresAt ? `有效期至 ${fmtShort(a.authExpiresAt)} · ` : "会话型登录 · "}上次检查 {fmtShort(a?.lastCheckedAt ?? null)}</dd>
            </div>
            <div>
              <dt className="mb-[3px] font-mono text-[10.5px] text-ink3">发布去向</dt>
              <dd className="text-[12.5px] leading-[1.7] text-ink">{p.lands}</dd>
            </div>
          </dl>
          {(a?.channels?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-line bg-hover/45 p-3">
              <div className="mb-2 flex items-center justify-between font-mono text-[10.5px] text-ink3">
                <span>频道</span>
                <span>{String(a?.channels?.length ?? 0).padStart(2, "0")}</span>
              </div>
              <div className="flex max-h-[142px] flex-col gap-[7px] overflow-auto scroll-thin">
                {a?.channels?.map((c) => (
                  <div key={c.id} className="flex min-w-0 items-center gap-2">
                    <span className="block h-[7px] w-[7px] flex-none rounded-full" style={{ background: p.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink">{c.name}</span>
                    <span className="flex-none font-mono text-[10px] text-ink3">{c.id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Button variant="ghost" isDisabled={busy} className={relinkCls} onPress={() => onVerify(p.id)}>
            <Refresh size={11} strokeWidth={3.3} /> {busy ? "检查中…" : "重新检查"}
          </Button>
        </div>
      )}
    </div>
  );
}

type InstallState = {
  browser: "chrome" | "edge";
  phase: "opening" | "waiting" | "error";
  message?: string;
};

function ExtensionSetup({
  capability,
}: {
  capability: PublishCapabilityDTO;
}) {
  const [install, setInstall] = React.useState<InstallState | null>(null);
  const [manualOpen, setManualOpen] = React.useState(false);
  const connected = capability.state === "ready";
  const activeBrowser = capability.extension.browserLabel?.toLowerCase();
  const visibleInstall = install && activeBrowser?.includes(install.browser) ? null : install;
  const installing = visibleInstall?.phase === "opening" || visibleInstall?.phase === "waiting";
  const failed = visibleInstall?.phase === "error";

  React.useEffect(() => {
    if (!visibleInstall || visibleInstall.phase !== "waiting") return undefined;
    const timer = window.setTimeout(() => {
      setInstall({
        browser: visibleInstall.browser,
        phase: "error",
        message: "扩展尚未连接，请确认安装完成后重试。",
      });
    }, 90_000);
    return () => window.clearTimeout(timer);
  }, [visibleInstall]);

  const beginInstall = async (browser: "chrome" | "edge") => {
    setInstall({ browser, phase: "opening" });
    try {
      await api.openExtensionInstall(browser);
      setInstall({ browser, phase: "waiting" });
    } catch (error) {
      setInstall({
        browser,
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const browsers = [
    { id: "chrome" as const, name: "Chrome", Icon: ChromeIcon },
    { id: "edge" as const, name: "Edge", Icon: EdgeIcon },
  ];
  return (
    <>
      <section className="flex flex-col">
        <div className="flex items-center gap-3 px-2 pb-2.5">
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-accent-tint text-accent">
            <Puzzle size={16} strokeWidth={2.2} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <b className="text-[13.5px]">浏览器扩展</b>
            <span className="text-[10.5px] text-ink2">安装后自动连接，桌面端和 Obsidian 共用</span>
          </span>
          <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-bold ${failed ? "text-error" : installing ? "text-warn" : connected ? "text-green" : "text-ink2"}`}>
            <i className={`block h-[7px] w-[7px] rounded-full ${failed ? "bg-error" : installing ? "bg-warn" : connected ? "bg-green shadow-[0_0_0_3px_rgba(7,181,111,0.12)]" : "bg-ink3"}`} />
            {failed ? "需要重试" : installing ? "连接中" : connected ? "可用" : "待连接"}
          </span>
        </div>
        {browsers.map(({ id, name, Icon }) => {
          const active = connected && activeBrowser?.includes(id);
          const targeted = visibleInstall?.browser === id;
          const rowBusy = targeted && installing;
          const rowFailed = targeted && failed;
          return (
            <div key={id} className={"grid min-h-16 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-hover " + (targeted ? "bg-accent-tint" : "")}>
              <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-paper shadow-[0_1px_2px_rgba(15,15,15,0.08)]">
                <Icon size={22} />
              </span>
              <span className="flex min-w-0 flex-col gap-[3px]">
                <b className="text-[13px]">{name} 扩展程序</b>
                <span className={`text-[10.5px] ${active ? "text-green" : rowFailed ? "text-error" : rowBusy ? "text-warn" : "text-ink2"}`}>
                  {active
                    ? "已连接，可直接发布"
                    : visibleInstall?.browser === id && visibleInstall.phase === "opening"
                      ? `正在 ${name} 中打开安装页…`
                      : visibleInstall?.browser === id && visibleInstall.phase === "waiting"
                        ? `等待 ${name} 扩展自动连接…`
                        : rowFailed
                          ? "连接失败，请重新安装或重试"
                          : `在 ${name} 中安装后自动连接`}
                </span>
              </span>
              {active ? (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-accent"><Check size={10} strokeWidth={4} /> 当前</span>
              ) : (
                <Button
                  variant="ghost"
                  isDisabled={rowBusy}
                  className={"h-auto rounded-[9px] border px-3 py-2 text-[11px] font-bold " + (rowFailed ? "border-error/30 text-error" : "border-line bg-paper text-ink data-[hovered=true]:bg-hover")}
                  onPress={() => void beginInstall(id)}
                >
                  {rowBusy ? "连接中…" : rowFailed ? "重试" : "安装"}
                </Button>
              )}
            </div>
          );
        })}
        <div className="mt-1 grid min-h-16 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-hover">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] text-ink2">
            <Puzzle size={17} strokeWidth={2} />
          </span>
          <span className="flex min-w-0 flex-col gap-[3px]">
            <b className="text-[13px]">无法访问扩展商店？</b>
            <span className="text-[10.5px] text-ink2">手动加载扩展，安装完成后同样自动连接</span>
          </span>
          <Button
            variant="ghost"
            className="h-auto rounded-[9px] border border-line bg-paper px-3 py-2 text-[11px] font-bold text-ink data-[hovered=true]:bg-hover"
            onPress={() => setManualOpen(true)}
          >
            手动安装
          </Button>
        </div>
        {failed && visibleInstall && (
          <div className="mx-2 mt-1 flex items-center gap-2 rounded-[9px] bg-error/10 px-3 py-2 text-[11px] leading-5 text-error" role="alert">
            <Alert size={12} strokeWidth={3.2} />
            <span className="min-w-0 flex-1">{visibleInstall.message || "扩展没有完成自动连接。"}</span>
            <Button variant="ghost" className="h-auto min-w-0 rounded-full px-2 py-1 text-[11px] font-bold text-error data-[hovered=true]:bg-error/10" onPress={() => void beginInstall(visibleInstall.browser)}>
              重试
            </Button>
          </div>
        )}
      </section>

      <Modal>
        <Modal.Backdrop isOpen={manualOpen} onOpenChange={setManualOpen}>
          <Modal.Container>
            <Modal.Dialog className="w-[500px] max-w-[90vw] rounded-[18px] bg-paper p-6" aria-label="手动安装浏览器扩展">
              <Modal.Heading className="text-[17px] font-bold">手动安装浏览器扩展</Modal.Heading>
              <p className="mt-2 text-[12.5px] leading-6 text-ink2">适用于无法访问扩展商店的情况。安装完成后会通过本机宿主自动连接，不需要地址或配对码。</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-[10px] border border-line bg-card p-3 text-[11.5px] leading-5 text-ink2"><b className="mb-1 block text-[12px] text-ink">01 下载</b>从 GitHub Releases 取得扩展包。</div>
                <div className="rounded-[10px] border border-line bg-card p-3 text-[11.5px] leading-5 text-ink2"><b className="mb-1 block text-[12px] text-ink">02 加载</b>开启开发者模式，加载已解压扩展。</div>
                <div className="rounded-[10px] border border-line bg-card p-3 text-[11.5px] leading-5 text-ink2"><b className="mb-1 block text-[12px] text-ink">03 完成</b>回到设置页，连接状态会自动更新。</div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <Button variant="ghost" className="dialog-cancel rounded-full px-4 py-2 text-ink2" onPress={() => setManualOpen(false)}>
                  关闭
                </Button>
                <Link
                  href="https://github.com/amlei/tassello/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-accent px-5 py-2 text-[13px] font-bold text-white no-underline data-[hovered=true]:brightness-105"
                >
                  打开下载页
                </Link>
              </div>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}

function VaultCard({ vault, onChoose }: { vault: VaultViewState; onChoose: () => void }) {
  const ready = vault.status === "ready";
  const conflict = vault.status === "conflict";
  return (
    <SettingRow
      leading={(
        <span className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] font-mono text-[10px] font-extrabold ${ready ? "bg-green/10 text-green" : conflict ? "bg-error/10 text-error" : "bg-hover text-ink2"}`}>
          MD
        </span>
      )}
      title="内容目录"
      status={(
        <span className={`inline-flex h-5 flex-none items-center rounded-full border px-2 font-mono text-[10px] font-bold ${ready ? "border-[#B7E3CD] text-green" : conflict ? "border-error/30 text-error" : "border-line text-ink2"}`}>
          {ready ? "可发布" : conflict ? "有冲突" : "待配置"}
        </span>
      )}
      description={<span className="font-mono text-ink">{vault.path ?? "尚未绑定 Vault"}</span>}
      meta={ready || conflict
        ? `${vault.files ?? 0} 篇 · ${vault.warnings ?? 0} 个提示${vault.conflicts ? ` · ${vault.conflicts} 个重复 ID` : ""}`
        : "Markdown + frontmatter 是本项目唯一内容源。"}
      action={(
        <Button
          variant="ghost"
          className="h-auto flex-none rounded-[9px] border border-line bg-paper px-3 py-2 text-[11px] font-bold text-ink data-[hovered=true]:bg-hover"
          onPress={onChoose}
        >
          {vault.path ? "更换目录" : "选择目录"}
        </Button>
      )}
    />
  );
}

function AttachmentDirectoryRow({ path: attachmentPath, onChoose }: { path: string; onChoose: () => void }) {
  const absolute = attachmentPath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(attachmentPath);
  return (
    <SettingRow
      leading={(
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-hover text-ink2">
          <FolderFiles size={16} strokeWidth={2} />
        </span>
      )}
      title="资源目录"
      description={<span className="font-mono text-ink">{attachmentPath}</span>}
      meta={absolute ? "内容目录外的绝对路径" : "相对内容目录；Obsidian 使用自身的附件设置"}
      action={(
        <Button
          variant="ghost"
          className="h-auto flex-none rounded-[9px] border border-line bg-paper px-3 py-2 text-[11px] font-bold text-ink data-[hovered=true]:bg-hover"
          onPress={onChoose}
        >
          更改
        </Button>
      )}
    />
  );
}

function AttachmentDirectoryDialog({
  value,
  onSave,
  onClose,
}: {
  value: string;
  onSave: (path: string) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    const next = draft.trim();
    if (!next) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal>
      <Modal.Backdrop isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
        <Modal.Container>
          <Modal.Dialog className="w-[520px] max-w-[90vw] rounded-[18px] bg-paper p-6" aria-label="设置资源目录">
            <Modal.Heading className="text-[17px] font-bold">资源目录</Modal.Heading>
            <p className="mt-2 text-[12.5px] leading-6 text-ink2">相对内容目录，也可填写绝对路径；Obsidian 使用自身的附件设置。</p>
            <Input
              className="mt-4 w-full"
              aria-label="资源目录路径"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="media 或 files"
              disabled={saving}
            />
            {error && <p className="mt-2 text-[12px] text-error">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                className="dialog-cancel rounded-full px-4 py-2 text-ink2 data-[hovered=true]:!bg-hover data-[hovered=true]:!text-ink"
                isDisabled={saving}
                onPress={onClose}
              >
                取消
              </Button>
              <Button
                className="rounded-full bg-accent px-5 py-2 font-bold text-white data-[hovered=true]:brightness-105"
                isDisabled={!draft.trim() || saving}
                onPress={() => void save()}
              >
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function SettingsSheet({
  platforms, settings, capability, vault, busyId, accountActionError, onToggleDefault, onVerify, onOpenLogin, onSaveSettings, onClose,
}: {
  platforms: PlatformDTO[];
  settings: AppSettings;
  capability: PublishCapabilityDTO;
  vault: VaultViewState;
  busyId: string | null;
  accountActionError: { platformId: string; message: string } | null;
  onToggleDefault: (type: ContentType, id: string) => void;
  onVerify: (id: string) => void;
  onOpenLogin: (id: string) => void;
  onSaveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onClose: () => void;
}) {
  const [popId, setPopId] = React.useState<string | null>(null);
  const [section, setSection] = React.useState<"basic" | "accounts" | "defaults">("basic");
  const [vaultPickerOpen, setVaultPickerOpen] = React.useState(false);
  const [attachmentOpen, setAttachmentOpen] = React.useState(false);
  const sections = [
    { id: "basic" as const, label: "基础设置" },
    { id: "accounts" as const, label: "平台账号" },
    { id: "defaults" as const, label: "默认发布" },
  ];

  return (
    <Modal>
      <Modal.Backdrop isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
        <Modal.Container>
          <Modal.Dialog
            className="relative flex max-w-none flex-row gap-2 overflow-hidden rounded-[20px] bg-rail p-2 shadow-[0_14px_40px_rgba(15,15,15,0.14)]"
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "stretch",
              width: "min(1040px, calc(100vw - 56px))",
              maxWidth: "none",
              height: "min(720px, calc(100vh - 56px))",
            }}
            aria-label="设置"
            data-screen-label="设置"
          >
            <nav className="flex w-[236px] flex-none flex-col gap-3.5 px-3.5 pb-3.5 pt-[18px]" aria-label="设置分类">
              <div className="flex items-center gap-[11px] px-2">
                <MosaicLogo size={7} />
                <span className="flex flex-col gap-0.5">
                  <b className="text-[16px] tracking-[-0.3px] text-ink">设置</b>
                  <span className="text-[10px] tracking-[0.08em] text-ink3">九漾 Onda</span>
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {sections.map((item) => (
                  <Button
                    key={item.id}
                    variant="ghost"
                    className={"h-auto w-full justify-start rounded-[10px] px-2.5 py-2 text-left text-sm font-bold " + (section === item.id ? "bg-selected text-ink" : "text-ink data-[hovered=true]:bg-hover")}
                    style={section === item.id ? { outline: "2px solid var(--accent)", outlineOffset: 2 } : undefined}
                    onPress={() => { setSection(item.id); setPopId(null); }}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </nav>

            <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[16px] bg-paper shadow-[0_1px_2px_rgba(15,15,15,0.04)]">
              <div className="scroll-thin min-h-0 flex-1 overflow-auto px-[34px] pb-6 pt-[30px]">
                {accountActionError && (
                  <p className="m-0 mb-4 flex items-start gap-2 rounded-[10px] border border-error/25 bg-error/10 px-3 py-2.5 text-[12px] leading-[1.65] text-error" role="alert">
                    <Alert size={12} strokeWidth={3.3} className="mt-[2px] flex-none" />
                    {accountActionError.message}
                  </p>
                )}
                {section === "basic" && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-5 pb-1">
                      <b className="text-[13px]">主题</b>
                      <ThemeSwitcher value={settings.theme} />
                    </div>
                    <ExtensionSetup capability={capability} />
                    <VaultCard vault={vault} onChoose={() => setVaultPickerOpen(true)} />
                    <AttachmentDirectoryRow path={settings.attachmentPath} onChoose={() => setAttachmentOpen(true)} />
                  </div>
                )}

                {section === "accounts" && (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5">
                      {platforms.map((p, i) => (
                        <AccountRow
                          key={p.id}
                          p={p}
                          open={popId === p.id}
                          busy={busyId === p.id}
                          onOpenChange={setPopId}
                          onVerify={onVerify}
                          onOpenLogin={onOpenLogin}
                          side={i % 2 === 0 ? "left" : "right"}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {section === "defaults" && (
                  <div className="flex flex-col">
                    {TYPE_ORDER.map((k) => {
                      const t = TYPE_META[k];
                      const list = platforms.filter((p) => p.supports.includes(k));
                      const chosen = settings.defaultTargets[k] ?? [];
                      return (
                        <div className="flex items-center gap-4 py-[18px] first:pt-1 last:pb-1" key={k}>
                          <span className="inline-flex w-[74px] flex-none items-center gap-2 text-sm font-bold">
                            <span className="h-[13px] w-[13px] rounded" style={{ background: t.color }} />
                            {t.zh}
                          </span>
                          <div className="flex flex-wrap gap-2.5">
                            {list.map((p) => {
                              const on = chosen.includes(p.id);
                              const off = p.sync.phase !== "connected";
                              const skin = off
                                ? { background: "var(--color-hover)", color: "var(--color-ink3)" }
                                : on
                                  ? { background: p.color, color: p.fg || "#fff" }
                                  : { background: `color-mix(in srgb, ${p.color} 18%, transparent)`, color: p.fg ? "var(--color-ink)" : p.color };
                              return (
                                <span key={p.id} title={p.name + (off ? " · 账号未连接" : on ? ` · 已是${t.zh}的默认平台` : ` · 点一下设为${t.zh}的默认平台`)}>
                                  <Button
                                    className="relative flex h-[38px] w-[38px] items-center justify-center rounded-[12px] p-0"
                                    style={skin}
                                    onPress={() => (off && p.status === "active" ? onOpenLogin(p.id) : onToggleDefault(k, p.id))}
                                    aria-label={p.name}
                                  >
                                    <PlatformMark id={p.id} char={p.char} size={20} imgScale={1.4} tone={off ? "off" : on ? "lit" : "dim"} className="m-0 h-5 w-5" />
                                    {on && !off && <span className="absolute -right-[5px] -top-[5px] flex h-4 w-4 items-center justify-center rounded-[5px] bg-accent text-white"><Check size={9} strokeWidth={4} /></span>}
                                    {off && p.status === "active" && <span className="absolute -bottom-[5px] -right-[5px] flex h-4 w-4 items-center justify-center rounded-[5px] border border-line bg-card text-ink2"><Refresh size={9} /></span>}
                                  </Button>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
      {vaultPickerOpen && (
        <DirectoryPicker
          initialPath={vault.path ?? ""}
          onClose={() => setVaultPickerOpen(false)}
          onChoose={async (path) => {
            await onSaveSettings({ vaultPath: path });
            setVaultPickerOpen(false);
          }}
        />
      )}
      {attachmentOpen && (
        <AttachmentDirectoryDialog
          value={settings.attachmentPath}
          onClose={() => setAttachmentOpen(false)}
          onSave={async (path) => {
            await onSaveSettings({ attachmentPath: path });
            setAttachmentOpen(false);
          }}
        />
      )}
    </Modal>
  );
}
