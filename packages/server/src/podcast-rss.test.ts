import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getPodcastRss,
  needsRssProbe,
  normalizeFeedUrl,
  podcastRssClaimsPlatform,
  readFeedMetadata,
  recordRssDiscovery,
  setPodcastRssFeed,
} from "./podcast-rss";

const FEED_URL = "https://feed.example.com/show.xml";
const FEED_XML = `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title><![CDATA[青春列车]]></title>
    <itunes:image href="https://cdn.example.com/cover.jpg"/>
    <item><title>01</title></item>
    <item><title>02</title></item>
  </channel>
</rss>`;

const originalDataDir = process.env.TASSELLO_DATA_DIR;
const originalFetch = globalThis.fetch;
const tempDirs: string[] = [];

afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (originalDataDir === undefined) delete process.env.TASSELLO_DATA_DIR;
  else process.env.TASSELLO_DATA_DIR = originalDataDir;
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function useTempState(): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tassello-podcast-rss-"));
  tempDirs.push(dir);
  process.env.TASSELLO_DATA_DIR = path.join(dir, "data");
}

function mockPublicLookupAndFeed(): void {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://feed.example.com/show.xml")) {
      return new Response(FEED_XML, { status: 200, headers: { "content-type": "application/rss+xml" } });
    }
    if (url.startsWith("https://www.douban.com/search")) return new Response("", { status: 404 });
    if (url.startsWith("https://itunes.apple.com/search")) {
      return Response.json({ results: [] });
    }
    throw new Error(`未预期的测试请求：${url}`);
  }) as typeof fetch;
}

describe("播客 RSS", () => {
  test("归一化 URL 并拒绝本机和私有网络地址", async () => {
    expect(normalizeFeedUrl(" HTTPS://FEED.EXAMPLE.COM/show.xml/?utm_source=x#top ")).toBe(
      "https://feed.example.com/show.xml",
    );
    await expect(readFeedMetadata("http://127.0.0.1/feed.xml")).rejects.toThrow("私有网络");
    await expect(readFeedMetadata("http://192.168.1.5/feed.xml")).rejects.toThrow("私有网络");
  });

  test("读取 Feed 标题、期数和封面，并限制响应大小", async () => {
    mockPublicLookupAndFeed();
    expect(await readFeedMetadata(`${FEED_URL}?utm_source=test`)).toEqual({
      feedUrl: FEED_URL,
      title: "青春列车",
      episodeCount: 2,
      coverUrl: "https://cdn.example.com/cover.jpg",
    });
  });

  test("重定向到私网地址时在发起第二次请求前拒绝", async () => {
    await useTempState();
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private.xml" },
      });
    }) as unknown as typeof fetch;
    await expect(readFeedMetadata(FEED_URL)).rejects.toThrow("私有网络");
    expect(requests).toBe(1);
  });

  test("账号检查发现 Feed 后建立认领，并记住该账号已完成正向探测", async () => {
    await useTempState();
    mockPublicLookupAndFeed();
    const rss = await recordRssDiscovery("xhs", "user-1", [{
      url: FEED_URL,
      title: "青春列车",
      episodeCount: 20,
      status: "已同步",
    }]);

    expect(rss?.feedUrl).toBe(FEED_URL);
    expect(rss?.title).toBe("青春列车");
    expect(rss?.claims).toContainEqual(expect.objectContaining({
      platformId: "xhs",
      state: "claimed",
      label: "已同步",
      accountUid: "user-1",
    }));
    expect(await needsRssProbe("xhs", "user-1")).toBe(false);
    expect(await podcastRssClaimsPlatform("xhs", "user-1")).toBe(true);
    expect(await podcastRssClaimsPlatform("xhs", "another-user")).toBe(false);

    await recordRssDiscovery("xhs", "user-1", [{
      url: FEED_URL,
      title: "青春列车",
      episodeCount: 21,
      status: "已同步",
    }]);
    const stored = JSON.parse(await fs.readFile(
      path.join(process.env.TASSELLO_DATA_DIR!, "state", "podcast-rss.json"),
      "utf8",
    )) as { candidates: Array<{ platformId: string }> };
    expect(stored.candidates.filter((candidate) => candidate.platformId === "xhs")).toHaveLength(1);
  });

  test("没有发现 Feed 时不写永久负缓存，下次账号检查仍会探测", async () => {
    await useTempState();
    const rss = await recordRssDiscovery("wechat", "user-1", []);
    expect(rss).toBeNull();
    expect(await needsRssProbe("wechat", "user-1")).toBe(true);
  });

  test("公开索引的负结果不会因一次检查被永久缓存", async () => {
    await useTempState();
    let publicRequests = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://www.douban.com/search")) {
        publicRequests += 1;
        return new Response("", { status: 404 });
      }
      if (url.startsWith("https://itunes.apple.com/search")) {
        publicRequests += 1;
        return Response.json({ results: [] });
      }
      throw new Error(`未预期的测试请求：${url}`);
    }) as typeof fetch;
    const feed = { url: FEED_URL, title: "青春列车", episodeCount: 21, status: "已同步" };
    await recordRssDiscovery("xhs", "user-1", [feed]);
    await recordRssDiscovery("xhs", "user-1", [feed]);
    expect(publicRequests).toBe(4);
  });

  test("手动保存同一个 Feed 会保留已取得的认领状态", async () => {
    await useTempState();
    mockPublicLookupAndFeed();
    await recordRssDiscovery("qingting", "user-1", [{
      url: FEED_URL,
      title: "青春列车",
      episodeCount: 20,
      status: "成功",
    }]);
    const saved = await setPodcastRssFeed(FEED_URL);
    expect(saved.claims).toContainEqual(expect.objectContaining({
      platformId: "qingting",
      state: "claimed",
      accountUid: "user-1",
    }));
    expect((await getPodcastRss())?.episodeCount).toBe(2);
  });
});
