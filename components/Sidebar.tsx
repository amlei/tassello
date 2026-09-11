"use client";

// 左栏固定导航：品牌标记 + 顶层仅有的两个入口「发布」「任务」。
// 内容类型不是导航层级（在发布页顶部切换）；平台不占导航入口（在发布面板内查看）。
// 窄屏收为顶部横条。

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PaperPlane, Task } from "reicon-react";
import { useApp } from "@/lib/store";

function BrandMark() {
  // 品牌标记：一枚小小的「铺」字制版章
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 items-center justify-center rounded-[4px] bg-ink font-serif text-[15px] leading-none text-surface"
    >
      铺
    </span>
  );
}

function useActiveJobs(): number {
  const { state } = useApp();
  return state.jobs.filter(
    (j) => j.status === "queued" || j.status === "running",
  ).length;
}

function ActiveBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="rounded-full bg-ink px-1.5 py-0.5 font-mono text-[10px] leading-none text-surface">
      {count}
    </span>
  );
}

function DesktopNav() {
  const pathname = usePathname();
  const activeJobs = useActiveJobs();
  const linkBase =
    "flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm transition-colors";

  return (
    <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-rule px-3 py-4 md:flex">
      <Link href="/" className="flex items-center gap-2.5 px-2 py-2">
        <BrandMark />
        <span className="font-serif text-lg tracking-wide">铺稿</span>
      </Link>

      <nav aria-label="主导航" className="mt-4 flex flex-col gap-0.5">
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          className={`${linkBase} ${
            pathname === "/"
              ? "bg-surface font-medium"
              : "text-ink-600 hover:bg-surface/60"
          }`}
        >
          <PaperPlane size={15} color="currentColor" />
          发布
        </Link>
        <Link
          href="/tasks"
          aria-current={pathname === "/tasks" ? "page" : undefined}
          className={`${linkBase} justify-between ${
            pathname === "/tasks"
              ? "bg-surface font-medium"
              : "text-ink-600 hover:bg-surface/60"
          }`}
        >
          <span className="flex items-center gap-2">
            <Task size={15} color="currentColor" />
            任务
          </span>
          <ActiveBadge count={activeJobs} />
        </Link>
      </nav>

      <p className="mt-auto px-2 font-mono text-[11px] leading-relaxed text-ink-300">
        写一次，
        <br />
        铺到多个平台。
      </p>
    </aside>
  );
}

function MobileNav() {
  const pathname = usePathname();
  const activeJobs = useActiveJobs();
  const item = "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm";
  const on = "bg-ink text-surface";
  const off = "text-ink-600";

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-rule px-2 py-1.5 md:hidden">
      <Link href="/" className={`${item} font-serif`} aria-label="铺稿首页">
        铺稿
      </Link>
      <Link href="/" className={`${item} ${pathname === "/" ? on : off}`}>
        发布
      </Link>
      <Link
        href="/tasks"
        className={`${item} ${pathname === "/tasks" ? on : off}`}
      >
        任务
        {activeJobs > 0 && (
          <span className="font-mono text-[10px]">{activeJobs}</span>
        )}
      </Link>
    </div>
  );
}

export function Sidebar() {
  return (
    <>
      <DesktopNav />
      <MobileNav />
    </>
  );
}
