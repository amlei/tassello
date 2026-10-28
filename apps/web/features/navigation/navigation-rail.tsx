/* navigation-rail —— 九漾业务导航：内容类型、发布队列和设置入口。 */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TYPE_META, TYPE_ORDER, type AppSettings, type ContentType, type PlatformDTO, type PublishCapabilityDTO } from "@tassello/shared";
import { api, connectClientEvents } from "../../adapters/api";
import { MosaicLogo } from "../brand/mosaic-logo";
import { SettingsSheet, type VaultViewState } from "../settings/settings-dialog";
import { useSidebarCollapsed } from "../../adapters/sidebar-state";
import { Dropdown } from "@heroui/react";
import { AppButton, StatusDot } from "@tassello/ui/primitives";
import { NavigationRail, RailNavItem } from "@tassello/ui/layout";
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
  const missing = platforms.filter((p) => p.sync.phase !== "connected" && p.status === "active").length;
  /* guard 存在时接管 Link：先过守卫，放行后再编程式跳转 */
  const guardedNav = (href: string) =>
    guard
      ? (e: React.MouseEvent) => {
          e.preventDefault();
          guard(() => router.push(href));
        }
      : undefined;

  return (
    <NavigationRail id="workspace-rail" collapsed={collapsed} label="工作台导航">
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
            <RailNavItem
              key={k}
              as={Link}
              href={`/library/${k}`}
              active={on}
              color={t.color}
              label={t.zh}
              count={counts[k] ?? 0}
              onClick={guardedNav(`/library/${k}`)}
            />
          );
        })}
        <div className="mt-1.5 flex flex-col gap-[3px]" aria-label="其他入口">
          <RailNavItem
            as={Link}
            href="/queue"
            active={active === "queue"}
            color="var(--color-green)"
            label="发布队列"
            onClick={guardedNav("/queue")}
            title={`${queueCount} 个内容项${runningCount > 0 ? `，${runningCount} 个内容项发布中` : ""}`}
            aria-label={`发布队列，${queueCount} 个内容项${runningCount > 0 ? `，${runningCount} 个内容项发布中` : ""}`}
            trailing={runningCount > 0
              ? <StatusDot tone="success" pulse className="shadow-[0_0_0_3px_rgba(7,181,111,0.16)]" />
              : undefined}
          />
        </div>
      </nav>

      <div className="mt-auto">
        <SettingsGate missing={missing} />
      </div>
    </NavigationRail>
  );
}

/* 新建内容：弹出四类型菜单，建好直达编辑器 */
function NewContentDropdown({ guard }: { guard?: (nav: () => void) => void }) {
  const router = useRouter();
  return (
    <Dropdown>
      <AppButton
        tone="primary"
        fullWidth
        className="rounded-[10px] px-0 font-bold [--button-bg-hover:#1b78d2] [--button-bg-pressed:#2383e2] [--button-fg-hover:#ffffff]"
        style={{ borderRadius: 10 }}
      >
        <Add size={14} strokeWidth={3.3} /> 新建内容
      </AppButton>
      <Dropdown.Popover placement="right top">
        <Dropdown.Menu
          onAction={(k) => {
            const nav = () => { void api.createPost(String(k)).then((post) => { router.push(`/editor/${post.id}`); }); };
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
  const [capability, setCapability] = React.useState<PublishCapabilityDTO | null>(null);
  const [vault, setVault] = React.useState<VaultViewState | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [accountActionError, setAccountActionError] = React.useState<{ platformId: string; message: string } | null>(null);
  const loginRetryCleanup = React.useRef<(() => void) | null>(null);

  const openSheet = async () => {
    setOpen(true);
    setAccountActionError(null);
    setLoading(true);
    try {
      const [ps, st, cap, vaultStatus] = await Promise.all([
        api.listPlatforms(),
        api.getSettings(),
        api.getPublishCapability(),
        api.getVaultStatus(),
      ]);
      setPlatforms(ps);
      setSettings(st);
      setCapability(cap);
      setVault({
        status: vaultStatus.conflicts ? "conflict" : "ready",
        path: vaultStatus.path,
        files: vaultStatus.files,
        conflicts: vaultStatus.conflicts,
        warnings: vaultStatus.warnings,
      });
    } catch {
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };
  const refreshPlatforms = async () => {
    try { setPlatforms(await api.listPlatforms()); } catch {}
  };
  const refreshVault = async () => {
    try {
      const status = await api.getVaultStatus();
      setVault({
        status: status.conflicts ? "conflict" : "ready",
        path: status.path,
        files: status.files,
        conflicts: status.conflicts,
        warnings: status.warnings,
      });
    } catch {}
  };
  const persistSettings = async (patch: Partial<AppSettings>) => {
    const saved = await api.saveSettings(patch);
    setSettings(saved);
    if (patch.vaultPath !== undefined) await refreshVault();
  };

  const toggleDefault = async (type: ContentType, id: string) => {
    if (!settings) return;
    const cur = settings.defaultTargets[type] ?? [];
    const next = { ...settings, defaultTargets: { ...settings.defaultTargets, [type]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } };
    setSettings(next);
    try { await api.saveSettings({ defaultTargets: next.defaultTargets }); } catch {}
  };
  const verify = async (id: string) => {
    setAccountActionError(null);
    setBusyId(id);
    try {
      await api.verifyAccount(id);
    } catch (error) {
      setAccountActionError({ platformId: id, message: error instanceof Error ? error.message : String(error) });
    }
    await refreshPlatforms();
    setBusyId(null);
  };
  const openLogin = async (id: string) => {
    setAccountActionError(null);
    loginRetryCleanup.current?.();
    try {
      await api.openAccountLogin(id);
      let triggered = false;
      const cleanup = () => {
        document.removeEventListener("visibilitychange", retry);
        window.removeEventListener("focus", retry);
        if (loginRetryCleanup.current === cleanup) loginRetryCleanup.current = null;
      };
      const retry = () => {
        if (triggered || document.visibilityState !== "visible") return;
        triggered = true;
        cleanup();
        void verify(id);
      };
      loginRetryCleanup.current = cleanup;
      document.addEventListener("visibilitychange", retry);
      window.addEventListener("focus", retry, { once: true });
    } catch (error) {
      loginRetryCleanup.current?.();
      setAccountActionError({ platformId: id, message: error instanceof Error ? error.message : String(error) });
      await refreshPlatforms();
    }
  };

  React.useEffect(() => {
    if (!open) return undefined;
    const timer = window.setInterval(() => {
      void api.getPublishCapability().then(setCapability).catch(() => {});
    }, 2000);
    return () => window.clearInterval(timer);
  }, [open]);

  React.useEffect(() => {
    if (!open) loginRetryCleanup.current?.();
  }, [open]);

  React.useEffect(() => () => loginRetryCleanup.current?.(), []);

  React.useEffect(() => {
    if (!open) return undefined;
    return connectClientEvents((event) => {
      if (event.type === "platforms" || event.type === "snapshot") {
        setPlatforms(event.platforms);
      }
    });
  }, [open]);

  return (
    <>
      <AppButton
        tone="ghost"
        className="grid w-full grid-cols-[14px_minmax(0,1fr)_auto] items-center justify-start gap-2.5 border-transparent px-2.5 py-[7px] text-sm font-bold"
        onPress={() => void openSheet()}
        aria-haspopup="dialog"
      >
        <Tuning2 size={15} strokeWidth={2.4} />
        <span>{loading ? "设置…" : "设置"}</span>
        {missing > 0 && <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-error px-1.5 font-mono text-[10.5px] font-bold text-white">{missing}</span>}
      </AppButton>
      {open && platforms && settings && capability && vault && (
        <SettingsSheet
          platforms={platforms}
          settings={settings}
          capability={capability}
          vault={vault}
          busyId={busyId}
          accountActionError={accountActionError}
          onToggleDefault={(t, id) => void toggleDefault(t, id)}
          onVerify={(id) => void verify(id)}
          onOpenLogin={openLogin}
          onSaveSettings={persistSettings}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
