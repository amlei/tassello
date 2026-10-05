/* rail —— 左侧栏（客户端）：Link 导航 + 设置入口（弹层内按需拉数据） */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TYPE_META, TYPE_ORDER, type AppSettings, type ContentType, type ImportBrowserDTO, type ImportBrowserId, type PlatformDTO } from "@tassello/shared";
import { api } from "./api";
import { MosaicLogo } from "./bits";
import { SettingsSheet } from "./settings";
import { useImportProfile } from "./import-profile";
import { useSidebarCollapsed } from "./sidebar-toggle";
import { Button, Dropdown } from "@heroui/react";
import { Add, Tuning2 } from "reicon-react";

export function Rail({
  active,
  counts,
  runningCount,
  queueCount,
  platforms,
  guard,
}: {
  active: string;
  counts: Record<string, number>;
  runningCount: number;
  queueCount: number;
  platforms: PlatformDTO[];
  /** 导航守卫（编辑器脏状态时由外层弹确认）：包住所有会离开当前页的入口 */
  guard?: (nav: () => void) => void;
}) {
  const router = useRouter();
  /* 折叠状态与快捷键由 WorkspaceShell 拥有；Rail 只跟随状态收起导航层。 */
  const collapsed = useSidebarCollapsed();
  const missing = platforms.filter((p) => p.status === "active" && (!p.account || p.account.state !== "ok")).length;
  /* guard 存在时接管 Link：先过守卫，放行后再编程式跳转 */
  const guardedNav = (href: string) =>
    guard
      ? (e: React.MouseEvent) => {
          e.preventDefault();
          guard(() => router.push(href));
        }
      : undefined;

  const navItem = (on: boolean, small = false) =>
    `grid w-full grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] border border-transparent px-2.5 text-left font-bold text-ink transition-colors hover:bg-hover data-[on=true]:bg-selected ${
      small ? "py-[7px] text-sm" : "py-2 text-[15px]"
    }`;

  return (
    <aside
      id="workspace-rail"
      className={`flex h-full min-h-0 flex-none flex-col overflow-hidden border-r bg-rail pt-[18px] pb-3.5 transition-[width] duration-200 ease-out ${
        collapsed ? "w-0 border-r-0 border-r-transparent px-0" : "w-[236px] border-line px-3.5"
      }`}
      aria-label="工作台导航"
      aria-hidden={collapsed || undefined}
      inert={collapsed}
    >
      {/* 内容包一层固定宽：收起动画时只裁切不回绕 */}
      <div className="flex w-[208px] flex-none flex-col gap-3.5" style={{ minHeight: 0, flex: 1 }}>
      <div className="flex items-center gap-[11px] px-2">
        <MosaicLogo size={7} />
        <div className="text-[16px] font-bold tracking-[-0.3px]">九漾 Onda</div>
      </div>

      <NewContentDropdown guard={guard} />

      <nav className="flex flex-col gap-[3px]" aria-label="内容类型">
        {TYPE_ORDER.map((k) => {
          const t = TYPE_META[k];
          const on = active === k;
          return (
            <Link key={k} href={`/library/${k}`} className={navItem(on)} data-on={on} onClick={guardedNav(`/library/${k}`)} aria-current={on ? "page" : undefined}>
              <span className="block h-3.5 w-3.5 rounded" style={{ background: t.color }} />
              <span>{t.zh}</span>
              <span className="font-mono text-[11.5px] font-semibold text-ink2">{String(counts[k] ?? 0).padStart(2, "0")}</span>
            </Link>
          );
        })}
        <div className="mt-0.5 flex flex-col gap-[3px] border-t border-line pt-3" aria-label="其他入口">
          <Link href="/queue" className={navItem(active === "queue")} data-on={active === "queue"} onClick={guardedNav("/queue")} aria-current={active === "queue" ? "page" : undefined}>
            <span className="block h-3.5 w-3.5 rounded bg-green" />
            <span>发布队列</span>
            {runningCount > 0
              ? <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-green px-1.5 font-mono text-[11px] font-bold text-white">{runningCount}</span>
              : <span className="font-mono text-[11.5px] font-semibold text-ink2">{String(queueCount).padStart(2, "0")}</span>}
          </Link>
        </div>
      </nav>

      <div className="mt-auto border-t border-line pt-3">
        <SettingsGate missing={missing} />
      </div>
      </div>
    </aside>
  );
}

/* 新建内容：弹出四类型菜单，建好直达编辑器 */
function NewContentDropdown({ guard }: { guard?: (nav: () => void) => void }) {
  return (
    <Dropdown>
      <Button
        fullWidth
        className="rounded-[10px] bg-accent px-0 text-white font-bold [--button-bg-hover:#1b78d2] [--button-bg-pressed:#2383e2] [--button-fg-hover:#ffffff]"
      >
        <Add size={14} strokeWidth={3.3} /> 新建内容
      </Button>
      <Dropdown.Popover placement="right top">
        <Dropdown.Menu
          onAction={(k) => {
            const nav = () => { void api.createPost(String(k)).then((post) => { window.location.href = `/editor/${post.id}`; }); };
            if (guard) guard(nav);
            else nav();
          }}
          aria-label="选择要新建的内容类型"
        >
          {TYPE_ORDER.map((k) => {
            const t = TYPE_META[k];
            return (
              <Dropdown.Item key={k} id={k} textValue={t.zh}>
                <span className="mr-1 inline-block h-3 w-3 rounded" style={{ background: t.color }} />
                {t.zh}
                <span className="ml-auto pl-4 font-mono text-[9.5px] tracking-[0.6px] text-ink3">{t.en}</span>
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

/* 设置入口：点开时按需拉平台、设置与浏览器候选数据，再弹设置层 */
function SettingsGate({ missing }: { missing: number }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [platforms, setPlatforms] = React.useState<PlatformDTO[] | null>(null);
  const [settings, setSettings] = React.useState<AppSettings | null>(null);
  const [browsers, setBrowsers] = React.useState<ImportBrowserDTO[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const openSheet = async () => {
    setOpen(true);
    if (platforms && settings) return;
    setLoading(true);
    try {
      const [ps, st, bs] = await Promise.all([api.listPlatforms(), api.getSettings(), api.listImportBrowsers()]);
      setPlatforms(ps);
      setSettings(st);
      setBrowsers(bs);
    } catch {
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };
  const refreshPlatforms = async () => {
    try { setPlatforms(await api.listPlatforms()); } catch {}
  };

  const toggleDefault = async (type: ContentType, id: string) => {
    if (!settings) return;
    const cur = settings.defaultTargets[type] ?? [];
    const next = { ...settings, defaultTargets: { ...settings.defaultTargets, [type]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } };
    setSettings(next);
    try { await api.saveSettings({ defaultTargets: next.defaultTargets }); } catch {}
  };
  const verify = async (id: string) => {
    setBusyId(id);
    try { await api.accountAction(id, "verify"); } catch {}
    await refreshPlatforms();
    setBusyId(null);
  };
  /* 导入登录态：全局唯一入口 —— 确认弹窗 + 覆盖 + 后台全量重校验（结果靠轮询平台状态） */
  const imp = useImportProfile(refreshPlatforms);
  /* 浏览器选择：乐观更新 + 落库；失败不回滚（下次打开设置会以服务端为准） */
  const setImportBrowser = async (id: ImportBrowserId) => {
    if (!settings) return;
    setSettings({ ...settings, importBrowser: id });
    try { await api.saveSettings({ importBrowser: id }); } catch {}
  };

  return (
    <>
      <Button
        variant="ghost"
        className={navItemLite() + " border-transparent font-bold data-[hovered=true]:bg-hover"}
        style={{ justifyContent: "flex-start" }}
        onPress={() => void openSheet()}
        aria-haspopup="dialog"
      >
        <Tuning2 size={15} strokeWidth={2.4} />
        <span>{loading ? "设置…" : "设置"}</span>
        {missing > 0 && <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-error px-1.5 font-mono text-[10.5px] font-bold text-white">{missing}</span>}
      </Button>
      {open && platforms && settings && (
        <SettingsSheet
          platforms={platforms}
          settings={settings}
          browsers={browsers}
          busyId={busyId}
          importing={imp.importing}
          onToggleDefault={(t, id) => void toggleDefault(t, id)}
          onVerify={(id) => void verify(id)}
          onImport={imp.ask}
          onImportBrowser={(id) => void setImportBrowser(id)}
          onClose={() => setOpen(false)}
        />
      )}
      {imp.overlay}
    </>
  );
}

function navItemLite() {
  return `grid w-full grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] border border-transparent px-2.5 py-[7px] text-left text-sm font-bold text-ink transition-colors hover:bg-hover`;
}
