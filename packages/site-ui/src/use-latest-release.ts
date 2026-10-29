"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type CachedStableRelease = {
  tag: string;
  version: string;
  etag?: string;
  fetchedAt: number;
};

const CACHE_KEY = "onda:release:stable:v1";
const RELEASE_API = "https://api.github.com/repos/amlei/tassello/releases/latest";
const RELEASE_LIST_API = "https://api.github.com/repos/amlei/tassello/releases?per_page=5";

type ReleaseSummary = {
  tag_name?: unknown;
  draft?: unknown;
  prerelease?: unknown;
};

function usableRelease(release: ReleaseSummary): string | null {
  if (typeof release.tag_name !== "string" || release.draft === true) return null;
  return release.tag_name;
}

function readCache(): CachedStableRelease | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedStableRelease>;
    if (typeof parsed.tag !== "string" || typeof parsed.version !== "string") return null;
    return {
      tag: parsed.tag,
      version: parsed.version,
      etag: typeof parsed.etag === "string" ? parsed.etag : undefined,
      fetchedAt: typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0,
    };
  } catch {
    return null;
  }
}

function writeCache(release: CachedStableRelease): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(release));
  } catch {
    /* 隐私模式等场景下缓存失败可静默降级。 */
  }
}

function subscribeToCache(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getCachedVersion(): string | null {
  return readCache()?.version ?? null;
}

function getServerCachedVersion(): string | null {
  return null;
}

function normalizeVersion(tag: string): string {
  return tag.replace(/^v/i, "");
}

/**
 * 持久缓存 latest stable release。二次访问先显示缓存，再用 ETag 条件请求；
 * GitHub 返回 304 时不计入 API 配额，release 未更新则数据不变。
 */
export function useLatestRelease(fallbackVersion = "0.2.0") {
  const cachedVersion = useSyncExternalStore(
    subscribeToCache,
    getCachedVersion,
    getServerCachedVersion,
  );
  const [networkVersion, setNetworkVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
      const cache = readCache();
      if (cache?.etag) headers["If-None-Match"] = cache.etag;

      /* 优先 stable latest；仓库只有 Pre-release 时 latest 返回 404，
       * 此时回退到 releases 列表取最新一条（含 Pre-release） */
      const pick = async (): Promise<{ tag: string; etag?: string } | null> => {
        const latest = await fetch(RELEASE_API, { headers, cache: "no-store" });
        if (latest.status === 304) return null;
        if (latest.ok) {
          const tag = usableRelease((await latest.json()) as ReleaseSummary);
          if (tag) return { tag, etag: latest.headers.get("etag") ?? undefined };
        }
        const list = await fetch(RELEASE_LIST_API, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
        if (!list.ok) return null;
        const releases = (await list.json()) as ReleaseSummary[];
        const first = releases.map((r) => usableRelease(r)).find((t) => t !== null);
        return first ? { tag: first } : null;
      };

      const picked = await pick();
      if (!picked) return;

      const next: CachedStableRelease = {
        tag: picked.tag,
        version: normalizeVersion(picked.tag),
        etag: picked.etag,
        fetchedAt: Date.now(),
      };
      writeCache(next);
      if (!cancelled) setNetworkVersion(next.version);
    };

    void refresh().catch(() => {
      /* 网络或限流失败时继续使用持久缓存。 */
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return networkVersion ?? cachedVersion ?? fallbackVersion;
}
