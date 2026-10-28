import fs from "node:fs/promises";
import type {
  PodcastRssClaimDTO,
  PodcastRssDTO,
  RssFeedHintDTO,
} from "@tassello/shared";
import { readJsonFile, statePath, writeJsonAtomic } from "./state";

type RssCandidate = RssFeedHintDTO & {
  platformId: string;
  accountUid: string;
  checkedAt: string;
};

type StoredPodcastRss = PodcastRssDTO & {
  version: 1;
  candidates: RssCandidate[];
  checkedAccounts: Record<string, string>;
};

const RSS_DISCOVERY_PLATFORMS = new Set(["xhs", "wechat", "qingting"]);
const PLATFORM_EVIDENCE: Record<string, string | null> = {
  xhs: "https://creator.xiaohongshu.com/publish/publish?source=official",
  wechat: "https://mp.weixin.qq.com/cgi-bin/filepage?type=3&begin=0&count=20",
  qingting: "https://admin.qingting.fm/content/rss",
};
const PLATFORM_LABELS: Record<string, string> = {
  xhs: "已同步",
  wechat: "已导入",
  qingting: "认领成功",
};
const stateFile = () => statePath("podcast-rss.json");
let mutationTail: Promise<void> = Promise.resolve();

function now(): string {
  return new Date().toISOString();
}

export function normalizeFeedUrl(value: string): string {
  const url = new URL(value.trim());
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|spm$|from$)/i.test(key)) url.searchParams.delete(key);
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.href.replace(/\/$/, "");
}

function publicFeedUrl(value: string): URL {
  const url = new URL(normalizeFeedUrl(value));
  if (!/^https?:$/.test(url.protocol)) throw new Error("RSS 地址必须使用 HTTP(S)");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost"
    || host === "0.0.0.0"
    || host === "::1"
    || host === "[::1]"
    || host === "::"
    || host === "[::]"
    || /^f[cd][0-9a-f]{2}:/i.test(host)
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^169\.254\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error("RSS 地址不能指向本机或私有网络");
  }
  return url;
}

async function fetchPublicFeed(
  value: string,
  init: RequestInit,
): Promise<{ response: Response; url: URL }> {
  let current = publicFeedUrl(value);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetch(current, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, url: current };
    const location = response.headers.get("location");
    if (!location) throw new Error("RSS 重定向缺少目标地址");
    current = publicFeedUrl(new URL(location, current).href);
  }
  throw new Error("RSS 重定向次数超过限制");
}

async function readLimited(response: Response, maxBytes = 2 * 1024 * 1024): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("RSS 内容超过 2 MiB");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function xmlValue(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  if (!match?.[1]) return null;
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export async function readFeedMetadata(feedUrl: string): Promise<{
  feedUrl: string;
  title: string;
  episodeCount: number;
  coverUrl: string | null;
}> {
  const { response, url: safeUrl } = await fetchPublicFeed(feedUrl, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`RSS 读取失败（HTTP ${response.status}）`);
  const xml = await readLimited(response);
  const title = xmlValue(xml, "title");
  if (!title) throw new Error("RSS 缺少播客标题");
  const count = (xml.match(/<item(?:\s|>)/gi) ?? []).length;
  const image = /<itunes:image[^>]+href=["']([^"']+)["']/i.exec(xml)?.[1]
    ?? /<image>[\s\S]*?<url>([^<]+)<\/url>/i.exec(xml)?.[1]
    ?? null;
  return {
    feedUrl: normalizeFeedUrl(safeUrl.href),
    title: title.slice(0, 300),
    episodeCount: count,
    coverUrl: image && /^https?:\/\//i.test(image) ? image : null,
  };
}

async function detectPublicClaims(feed: PodcastRssDTO): Promise<PodcastRssClaimDTO[]> {
  const checkedAt = now();
  const known = new Set(feed.claims.map((claim) => claim.platformId));
  const probes: Array<Promise<PodcastRssClaimDTO | null>> = [];
  if (!known.has("douban")) {
    probes.push((async () => {
      try {
        const query = new URLSearchParams({ cat: "2071", q: feed.title });
        const response = await fetch(`https://www.douban.com/search?${query}`, {
          headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
          redirect: "follow",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return null;
        const html = await readLimited(response, 1024 * 1024);
        const encoded = /www\.douban\.com%2Fpodcast%2F(\d+)%2F/i.exec(html)?.[1];
        return encoded
          ? {
            platformId: "douban",
            state: "indexed",
            label: "已收录",
            evidenceUrl: `https://www.douban.com/podcast/${encoded}/`,
            checkedAt,
            accountUid: null,
          } satisfies PodcastRssClaimDTO
          : null;
      } catch {
        return null;
      }
    })());
  }
  if (!known.has("apple")) {
    probes.push((async () => {
      try {
        const query = new URLSearchParams({ term: feed.title, entity: "podcast", limit: "20" });
        const response = await fetch(`https://itunes.apple.com/search?${query}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return null;
        const payload = await response.json() as {
          results?: Array<{ feedUrl?: string; collectionViewUrl?: string }>;
        };
        const match = payload.results?.find((item) =>
          typeof item.feedUrl === "string" && normalizeFeedUrl(item.feedUrl) === feed.feedUrl
        );
        return match
          ? {
            platformId: "apple",
            state: "indexed",
            label: "已收录",
            evidenceUrl: typeof match.collectionViewUrl === "string" ? match.collectionViewUrl : null,
            checkedAt,
            accountUid: null,
          } satisfies PodcastRssClaimDTO
          : null;
      } catch {
        return null;
      }
    })());
  }
  return (await Promise.all(probes)).filter((claim): claim is PodcastRssClaimDTO => claim !== null);
}

function mergeClaims(
  existing: PodcastRssClaimDTO[],
  next: PodcastRssClaimDTO[],
  replacedPlatformIds: Set<string>,
): PodcastRssClaimDTO[] {
  const byPlatform = new Map(
    existing
      .filter((claim) => !replacedPlatformIds.has(claim.platformId))
      .map((claim) => [claim.platformId, claim]),
  );
  for (const claim of next) byPlatform.set(claim.platformId, claim);
  return [...byPlatform.values()];
}

function claimForCandidate(candidate: RssCandidate): PodcastRssClaimDTO {
  return {
    platformId: candidate.platformId,
    state: "claimed",
    label: PLATFORM_LABELS[candidate.platformId] ?? "已认领",
    evidenceUrl: PLATFORM_EVIDENCE[candidate.platformId] ?? null,
    checkedAt: candidate.checkedAt,
    accountUid: candidate.accountUid,
  };
}

function pickCanonicalFeed(candidates: RssCandidate[]): RssCandidate | null {
  const groups = new Map<string, RssCandidate[]>();
  for (const candidate of candidates) {
    const key = normalizeFeedUrl(candidate.url);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  const ranked = [...groups.values()].sort((a, b) => {
    const aPlatforms = new Set(a.map((item) => item.platformId)).size;
    const bPlatforms = new Set(b.map((item) => item.platformId)).size;
    return bPlatforms - aPlatforms || b.length - a.length;
  });
  if (!ranked.length) return null;
  const best = ranked[0]!;
  const bestPlatforms = new Set(best.map((item) => item.platformId)).size;
  if (bestPlatforms >= 2 || ranked.length === 1) return best[0]!;
  return null;
}

async function readStored(): Promise<StoredPodcastRss | null> {
  return readJsonFile<StoredPodcastRss | null>(stateFile(), null);
}

async function writeStored(state: StoredPodcastRss): Promise<void> {
  await fs.mkdir(statePath(), { recursive: true });
  await writeJsonAtomic(stateFile(), state);
}

function toDto(state: StoredPodcastRss): PodcastRssDTO {
  return {
    feedUrl: state.feedUrl,
    title: state.title,
    episodeCount: state.episodeCount,
    coverUrl: state.coverUrl,
    sourcePlatformId: state.sourcePlatformId,
    sourceChannelId: state.sourceChannelId,
    sourceChannelName: state.sourceChannelName,
    claims: state.claims,
    checkedAt: state.checkedAt,
  };
}

function mutate<T>(run: (current: StoredPodcastRss | null) => Promise<{ state?: StoredPodcastRss; value: T }>): Promise<T> {
  const result = mutationTail.catch(() => undefined).then(async () => {
    const current = await readStored();
    const next = await run(current);
    if (next.state) await writeStored(next.state);
    return next.value;
  });
  mutationTail = result.then(() => undefined, () => undefined);
  return result;
}

export async function getPodcastRss(): Promise<PodcastRssDTO | null> {
  const state = await readStored();
  return state ? toDto(state) : null;
}

export async function needsRssProbe(platformId: string, accountUid: string | null): Promise<boolean> {
  if (!RSS_DISCOVERY_PLATFORMS.has(platformId) || !accountUid) return false;
  const state = await readStored();
  return state?.checkedAccounts[platformId] !== accountUid;
}

export async function recordRssDiscovery(
  platformId: string,
  accountUid: string,
  feeds: RssFeedHintDTO[],
): Promise<PodcastRssDTO | null> {
  if (!RSS_DISCOVERY_PLATFORMS.has(platformId)) return getPodcastRss();
  /* 没发现 Feed 不是永久事实；不写 checkedAccounts，下次检查仍会重新探测。 */
  if (feeds.length === 0) return getPodcastRss();
  return mutate(async (current) => {
    const checkedAt = now();
    const candidates = [
      ...(current?.candidates ?? []).filter((candidate) => candidate.platformId !== platformId),
      ...feeds.map((feed) => ({
        ...feed,
        url: normalizeFeedUrl(feed.url),
        platformId,
        accountUid,
        checkedAt,
      })),
    ];
    let state = current ?? {
      version: 1 as const,
      feedUrl: "",
      title: "",
      episodeCount: null,
      coverUrl: null,
      sourcePlatformId: null,
      sourceChannelId: null,
      sourceChannelName: null,
      claims: [],
      checkedAt,
      candidates: [],
      checkedAccounts: {},
    };
    state.candidates = candidates;
    state.checkedAccounts = { ...state.checkedAccounts, [platformId]: accountUid };
    state.claims = mergeClaims(
      state.claims,
      [],
      new Set(
        state.claims
          .filter((claim) => claim.platformId === platformId && claim.accountUid !== accountUid)
          .map((claim) => claim.platformId),
      ),
    );
    const selected = state.feedUrl
      ? candidates.find((candidate) => normalizeFeedUrl(candidate.url) === state.feedUrl) ?? null
      : pickCanonicalFeed(candidates);
    if (selected && !state.feedUrl) {
      state.feedUrl = normalizeFeedUrl(selected.url);
      state.title = selected.title;
      state.episodeCount = selected.episodeCount;
      state.coverUrl = null;
      state.sourcePlatformId = selected.platformId;
      state.sourceChannelName = selected.title;
      state.checkedAt = checkedAt;
    }
    if (state.feedUrl) {
      const matching = candidates.filter((candidate) => normalizeFeedUrl(candidate.url) === state.feedUrl);
      state.claims = mergeClaims(state.claims, matching.map(claimForCandidate), new Set([platformId]));
      /* 公开收录的成功结果永久复用；负结果不缓存，下次显式检查可重试。 */
      const publicClaims = await detectPublicClaims(toDto(state));
      state.claims = mergeClaims(state.claims, publicClaims, new Set(publicClaims.map((claim) => claim.platformId)));
    }
    return { state, value: toDto(state) };
  });
}

export async function setPodcastRssFeed(feedUrl: string): Promise<PodcastRssDTO> {
  const metadata = await readFeedMetadata(feedUrl);
  return mutate(async (current) => {
    const sameFeed = current?.feedUrl === metadata.feedUrl;
    const state: StoredPodcastRss = {
      version: 1,
      ...metadata,
      sourcePlatformId: sameFeed ? current.sourcePlatformId : null,
      sourceChannelId: sameFeed ? current.sourceChannelId : null,
      sourceChannelName: sameFeed ? current.sourceChannelName : null,
      claims: sameFeed ? current.claims : [],
      checkedAt: now(),
      candidates: sameFeed ? current.candidates : [],
      checkedAccounts: sameFeed ? current.checkedAccounts : {},
    };
    const publicClaims = await detectPublicClaims(toDto(state));
    state.claims = mergeClaims(state.claims, publicClaims, new Set(publicClaims.map((claim) => claim.platformId)));
    return { state, value: toDto(state) };
  });
}

export async function podcastRssClaimsPlatform(platformId: string, accountUid?: string | null): Promise<boolean> {
  const state = await readStored();
  if (!state) return false;
  return state.claims.some((claim) =>
    claim.platformId === platformId
    && (claim.state === "claimed" || claim.state === "indexed")
    && (!accountUid || !claim.accountUid || claim.accountUid === accountUid)
  );
}
