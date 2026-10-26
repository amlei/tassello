import type {
  ExtensionAccountProfileDTO,
  ExtensionAccountResult,
  ExtensionLoginOpened,
} from "@tassello/shared";

type Probe =
  | { state: "ok"; profile: ExtensionAccountProfileDTO }
  | { state: "needs_login" | "pending" | "failed"; error?: string };

type AccountPlatform = {
  verifyUrl: string;
  loginUrl: string;
  visible?: boolean;
  probe(tabId: number): Promise<Probe>;
};

const MAX_CHANNELS = 200;
const VERIFY_TIMEOUT_MS = 25_000;
const TAB_READY_TIMEOUT_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function channelList(raw: unknown): ExtensionAccountProfileDTO["channels"] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as { id?: unknown; name?: unknown; coverUrl?: unknown };
    const id = typeof value.id === "string" || typeof value.id === "number"
      ? String(value.id).trim()
      : "";
    const name = typeof value.name === "string" ? value.name.trim() : "";
    if (!id && !name) return [];
    return [{
      id: (id || name).slice(0, 200),
      name: (name || id).slice(0, 200),
      coverUrl: httpUrl(value.coverUrl),
    }];
  }).slice(0, MAX_CHANNELS);
}

export function normalizeAccountProbe(raw: {
  uid?: unknown;
  name?: unknown;
  avatarUrl?: unknown;
  channels?: unknown;
}): Probe {
  const uid = typeof raw.uid === "string" || typeof raw.uid === "number" ? String(raw.uid).trim() : "";
  if (!uid) return { state: "failed", error: "平台已登录但没有返回账号标识" };
  return {
    state: "ok",
    profile: {
      uid: uid.slice(0, 200),
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 200) : null,
      avatarUrl: httpUrl(raw.avatarUrl),
      authExpiresAt: null,
      channels: channelList(raw.channels),
    },
  };
}

async function runInPage<T>(
  tabId: number,
  func: (...args: never[]) => T | Promise<T>,
  args: unknown[] = [],
): Promise<T> {
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: func as (...args: unknown[]) => T,
    args,
  });
  if (!execution) throw new Error("平台页面没有返回检查结果");
  return execution.result as T;
}

async function waitForTab(tabId: number): Promise<void> {
  const current = await chrome.tabs.get(tabId).catch(() => null);
  if (!current) throw new Error("平台标签页已关闭");
  if (current.status === "complete") return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.onRemoved.removeListener(removed);
      resolve();
    };
    const listener = (updatedTabId: number, change: { status?: string }) => {
      if (updatedTabId === tabId && change.status === "complete") finish();
    };
    const removed = (removedTabId: number) => {
      if (removedTabId === tabId) finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onRemoved.addListener(removed);
    setTimeout(finish, TAB_READY_TIMEOUT_MS);
  });
}

async function probeUntilReady(tabId: number, platform: AccountPlatform): Promise<Probe> {
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  let last: Probe = { state: "pending" };
  while (Date.now() < deadline) {
    try {
      last = await platform.probe(tabId);
      if (last.state === "ok" || last.state === "needs_login" || last.state === "failed") return last;
    } catch (error) {
      last = { state: "pending", error: error instanceof Error ? error.message : String(error) };
    }
    await sleep(1200);
  }
  return {
    state: "failed",
    error: last.state === "pending" && last.error ? last.error : "平台页面检查超时",
  };
}

const ACCOUNT_PLATFORMS: Record<string, AccountPlatform> = {
  wechat: {
    verifyUrl: "https://mp.weixin.qq.com/",
    loginUrl: "https://mp.weixin.qq.com/",
    async probe(tabId) {
      const raw = await runInPage(tabId, () => {
        const global = globalThis as typeof globalThis & {
          wx?: { commonData?: { data?: Record<string, unknown> } };
        };
        const data = global.wx?.commonData?.data ?? {};
        const token = new URL(location.href).searchParams.get("token");
        const scanning = !!document.querySelector(".login__type__container__scan, #scan_qrcode");
        const rawNickname = typeof data.nick_name === "string"
          ? data.nick_name
          : typeof data.nick_name_decode === "string"
            ? data.nick_name_decode
            : null;
        const nickname = rawNickname && !/^\{\{[\s\S]*\}\}$/.test(rawNickname) ? rawNickname : null;
        const avatar = typeof data.head_img === "string"
          ? data.head_img
          : typeof data.head_url === "string"
            ? data.head_url
            : (document.querySelector("img.weui-desktop-account__img, img.weui-desktop-account__thumb") as HTMLImageElement | null)?.src;
        if (scanning && !token) return { state: "needs_login" as const };
        if (!nickname && !token) return { state: "pending" as const };
        return {
          state: "identity" as const,
          uid: typeof data.user_name === "string" && data.user_name.startsWith("gh_")
            ? data.user_name
            : data.uin ? String(data.uin) : `wechat:${token ?? "session"}`,
          name: nickname,
          avatarUrl: avatar?.replace(/\/\d+$/, "/0") ?? null,
        };
      });
      if (raw.state === "needs_login") return raw;
      if (raw.state === "pending") return raw;
      return normalizeAccountProbe(raw);
    },
  },

  weibo: {
    verifyUrl: "https://weibo.com/",
    loginUrl: "https://weibo.com/login.php",
    async probe(tabId) {
      const raw = await runInPage(tabId, async () => {
        const config = (globalThis as typeof globalThis & { $CONFIG?: { uid?: string | number } }).$CONFIG;
        const uid = config?.uid;
        if (!uid) {
          if (/passport|login/i.test(location.hostname + location.pathname)) return { state: "needs_login" as const };
          return { state: "pending" as const };
        }
        try {
          const response = await fetch(`/ajax/profile/info?uid=${encodeURIComponent(String(uid))}`, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          if (!response.ok) return { state: "needs_login" as const };
          const payload = await response.json() as { data?: { user?: Record<string, unknown> } };
          const user = payload.data?.user ?? {};
          return {
            state: "identity" as const,
            uid: String(uid),
            name: user.screen_name,
            avatarUrl: user.profile_image_url,
          };
        } catch {
          return { state: "pending" as const };
        }
      });
      if (raw.state === "needs_login") return raw;
      if (raw.state === "pending") return raw;
      return normalizeAccountProbe(raw);
    },
  },

  xhs: {
    verifyUrl: "https://creator.xiaohongshu.com/publish/publish?source=official",
    loginUrl: "https://creator.xiaohongshu.com/publish/publish?source=official",
    async probe(tabId) {
      const raw = await runInPage(tabId, async () => {
        try {
          const response = await fetch("/api/galaxy/user/info", {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          const payload = await response.json() as { code?: number; data?: Record<string, unknown> };
          if (!response.ok || payload.code !== 0 || !payload.data) {
            return { state: response.status === 401 || response.status === 403 ? "needs_login" : "pending" } as const;
          }
          return {
            state: "identity" as const,
            uid: payload.data.userId,
            name: payload.data.userName,
            avatarUrl: payload.data.userAvatar,
          };
        } catch {
          return { state: "pending" as const };
        }
      });
      if (raw.state === "needs_login") return raw;
      if (raw.state === "pending") return raw;
      return normalizeAccountProbe(raw);
    },
  },

  jike: {
    verifyUrl: "https://web.okjike.com/",
    loginUrl: "https://web.okjike.com/",
    async probe(tabId) {
      const raw = await runInPage(tabId, async () => {
        let token = "";
        try {
          token = localStorage.getItem("JK_ACCESS_TOKEN") ?? "";
        } catch {}
        if (!token) return { state: "needs_login" as const };
        try {
          const response = await fetch("https://api.ruguoapp.com/1.0/users/profile", {
            headers: {
              accept: "application/json",
              platform: "web",
              "x-jike-access-token": token,
            },
          });
          if (!response.ok) return { state: "needs_login" as const };
          const payload = await response.json() as {
            user?: { id?: unknown; username?: unknown; screenName?: unknown; avatarImage?: { thumbnailUrl?: unknown } };
          };
          return {
            state: "identity" as const,
            uid: payload.user?.id,
            name: payload.user?.screenName ?? payload.user?.username,
            avatarUrl: payload.user?.avatarImage?.thumbnailUrl,
          };
        } catch {
          return { state: "pending" as const };
        }
      });
      if (raw.state === "needs_login") return raw;
      if (raw.state === "pending") return raw;
      return normalizeAccountProbe(raw);
    },
  },

  x: {
    verifyUrl: "https://x.com/home",
    loginUrl: "https://x.com/login",
    async probe(tabId) {
      const raw = await runInPage(tabId, () => {
        if (location.pathname === "/login" || location.pathname === "/i/flow/login") {
          return { state: "needs_login" as const };
        }
        const button = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        const container = document.querySelector('[data-testid^="UserAvatar-Container-"]');
        const handle = container?.getAttribute("data-testid")?.slice("UserAvatar-Container-".length) ?? "";
        if (!button || !handle || handle === "undefined") return { state: "pending" as const };
        const avatar = button.querySelector("img")?.getAttribute("src") ?? null;
        return { state: "identity" as const, uid: handle, name: `@${handle}`, avatarUrl: avatar };
      });
      if (raw.state === "needs_login") return raw;
      if (raw.state === "pending") return raw;
      return normalizeAccountProbe(raw);
    },
  },

  zhihu: {
    verifyUrl: "https://www.zhihu.com/creator",
    loginUrl: "https://www.zhihu.com/",
    async probe(tabId) {
      const raw = await runInPage(tabId, async () => {
        try {
          const response = await fetch("https://www.zhihu.com/api/v4/me", {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          if (response.status === 401 || response.status === 403) return { state: "needs_login" as const };
          if (!response.ok) return { state: "pending" as const };
          const me = await response.json() as Record<string, unknown>;
          return {
            state: "identity" as const,
            uid: me.id,
            name: me.name,
            avatarUrl: me.avatar_url,
          };
        } catch {
          return { state: "pending" as const };
        }
      });
      if (raw.state === "needs_login") return raw;
      if (raw.state === "pending") return raw;
      return normalizeAccountProbe(raw);
    },
  },

  douban: {
    verifyUrl: "https://www.douban.com/",
    loginUrl: "https://www.douban.com/",
    async probe(tabId) {
      const raw = await runInPage(tabId, () => {
        let user: Record<string, unknown> | null = null;
        try {
          const state = JSON.parse((globalThis as typeof globalThis & { __INIT_STATE__?: string }).__INIT_STATE__ ?? "null") as { user?: Record<string, unknown> };
          user = state?.user ?? null;
        } catch {}
        const globalUid = (globalThis as typeof globalThis & { _GLOBAL_NAV?: { USER_ID?: unknown } })._GLOBAL_NAV?.USER_ID;
        const uid = user?.id ?? globalUid;
        if (!uid) {
          const text = document.body?.innerText ?? "";
          if (/登录\/注册/.test(text)) return { state: "needs_login" as const };
          return { state: "pending" as const };
        }
        let name = typeof user?.name === "string" ? user.name : null;
        if (!name) {
          const nav = Array.from(document.querySelectorAll("a, span"))
            .find((node) => /的账号$/.test((node.textContent ?? "").trim()));
          name = nav?.textContent?.trim().replace(/的账号$/, "") ?? null;
        }
        const avatar = document.querySelector<HTMLImageElement>(".top-nav-info img, [class*=avatar] img, nav img")?.src;
        return { state: "identity" as const, uid, name, avatarUrl: avatar };
      });
      if (raw.state === "needs_login") return raw;
      if (raw.state === "pending") return raw;
      return normalizeAccountProbe(raw);
    },
  },

  xiaoyuzhou: {
    verifyUrl: "https://podcaster.xiaoyuzhoufm.com/",
    loginUrl: "https://podcaster.xiaoyuzhoufm.com/",
    async probe(tabId) {
      const raw = await runInPage(tabId, async () => {
        const headers = {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-jike-allow-app-token-in-cookie": "true",
          "x-app-build-time": "2026-09-24 14:25:46 +0800",
        };
        try {
          const profileResponse = await fetch("https://podcaster-api.xiaoyuzhoufm.com/v1/profile/get", {
            credentials: "include",
            headers,
          });
          if (profileResponse.status === 401 || profileResponse.status === 403) return { state: "needs_login" as const };
          if (!profileResponse.ok) return { state: "pending" as const };
          const profilePayload = await profileResponse.json() as { data?: Record<string, unknown> };
          const listResponse = await fetch("https://podcaster-api.xiaoyuzhoufm.com/v1/podcast/list", {
            method: "POST",
            credentials: "include",
            headers,
            body: "{}",
          });
          if (!listResponse.ok) {
            return { state: "failed" as const, error: `小宇宙节目列表读取失败（HTTP ${listResponse.status}）` };
          }
          const listPayload = await listResponse.json() as { data?: Array<Record<string, unknown>> };
          const profile = profilePayload.data ?? {};
          const avatar = profile.avatar as { picture?: { picUrl?: unknown } } | undefined;
          return {
            state: "identity" as const,
            uid: profile.uid,
            name: profile.nickname,
            avatarUrl: avatar?.picture?.picUrl,
            channels: (listPayload.data ?? []).map((item) => ({
              id: item.pid,
              name: item.title,
              coverUrl: (item.image as { picUrl?: unknown } | undefined)?.picUrl,
            })),
          };
        } catch {
          return { state: "pending" as const };
        }
      });
      if (raw.state === "needs_login") return raw;
      if (raw.state === "pending") return raw;
      if (raw.state === "failed") return raw;
      return normalizeAccountProbe(raw);
    },
  },

  ximalaya: {
    verifyUrl: "https://studio.ximalaya.com/",
    loginUrl: "https://studio.ximalaya.com/",
    async probe(tabId) {
      const raw = await runInPage(tabId, async () => {
        if (/passport|login/i.test(location.hostname + location.pathname)) {
          return { state: "needs_login" as const };
        }
        try {
          const userResponse = await fetch("https://studio.ximalaya.com/api/home/userInfo", {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          if (userResponse.status === 401 || userResponse.status === 403) return { state: "needs_login" as const };
          if (!userResponse.ok) return { state: "pending" as const };
          const userPayload = await userResponse.json() as { data?: Record<string, unknown> };
          const user = userPayload.data;
          if (!user?.uid) return { state: "pending" as const };
          const channels: Array<Record<string, unknown>> = [];
          for (let page = 1; page <= 5; page += 1) {
            const response = await fetch(
              `https://studio.ximalaya.com/reform-upload/album/list?page=${page}&pageSize=50`,
              { credentials: "include", headers: { Accept: "application/json" } },
            );
            if (!response.ok) {
              return { state: "failed" as const, error: `喜马拉雅专辑列表读取失败（HTTP ${response.status}）` };
            }
            const payload = await response.json() as {
              data?: { totalSize?: number; infos?: Array<Record<string, unknown>> };
            };
            const infos = payload.data?.infos ?? [];
            channels.push(...infos);
            const total = payload.data?.totalSize ?? 0;
            if (!infos.length || channels.length >= total) break;
          }
          return {
            state: "identity" as const,
            uid: user.uid,
            name: user.nickName,
            avatarUrl: user.logoPic,
            channels: channels.map((item) => ({
              id: item.albumId,
              name: item.title,
              coverUrl: item.fullCoverPath,
            })),
          };
        } catch {
          return { state: "pending" as const };
        }
      });
      if (raw.state === "needs_login") return raw;
      if (raw.state === "pending") return raw;
      if (raw.state === "failed") return raw;
      return normalizeAccountProbe(raw);
    },
  },

  lizhi: {
    verifyUrl: "https://nj.lizhi.fm/static/newsite/#/index",
    loginUrl: "https://nj.lizhi.fm/account/login",
    visible: true,
    async probe(tabId) {
      const raw = await runInPage(tabId, async () => {
        if (location.href.includes("/account/login")) return { state: "needs_login" as const };
        try {
          const response = await fetch("https://njnew.lizhi.fm/user/getCurrentUserInfo", {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          const payload = await response.json() as Record<string, unknown>;
          if (payload.rcode === 403) return { state: "needs_login" as const };
          if (!response.ok || (payload.rcode !== 0 && payload.rcode !== 200)) return { state: "pending" as const };
          const user = (payload.data ?? payload.userInfo ?? payload.user) as Record<string, unknown> | undefined;
          if (!user) return { state: "pending" as const };
          const sheetResponse = await fetch("https://njnew.lizhi.fm/playsheet/list?type=0&keyword=", {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          if (!sheetResponse.ok) {
            return { state: "failed" as const, error: `荔枝播单读取失败（HTTP ${sheetResponse.status}）` };
          }
          const sheetPayload = await sheetResponse.json() as Record<string, unknown>;
          const sheetData = sheetPayload.data as { list?: Array<Record<string, unknown>> } | Array<Record<string, unknown>> | undefined;
          const sheets = Array.isArray(sheetData) ? sheetData : sheetData?.list ?? [];
          const pick = (...keys: string[]) => {
            for (const key of keys) {
              const value = user[key];
              if (typeof value === "string" && value) return value;
              if (typeof value === "number") return String(value);
            }
            return "";
          };
          return {
            state: "identity" as const,
            uid: pick("uid", "userId", "id", "anchorId") || pick("nickname", "name", "userName", "anchorName"),
            name: pick("nickname", "name", "userName", "anchorName") || null,
            avatarUrl: pick("icon", "headurl", "avatarUrl", "headUrl", "avatar", "logo") || null,
            channels: sheets.map((item) => {
              const get = (key: string) => typeof item[key] === "string" ? item[key] : typeof item[key] === "number" ? String(item[key]) : "";
              return {
                id: get("id") || get("sheetId") || get("playsheetId") || get("pid") || get("name"),
                name: get("name") || get("title") || get("sheetName") || get("id"),
                coverUrl: get("cover") || get("coverUrl") || get("img") || get("pic") || null,
              };
            }),
          };
        } catch {
          return { state: "pending" as const };
        }
      });
      if (raw.state === "needs_login") return raw;
      if (raw.state === "pending") return raw;
      return normalizeAccountProbe(raw);
    },
  },
};

export const ACCOUNT_PLATFORM_IDS = Object.keys(ACCOUNT_PLATFORMS);

export async function verifyPlatformAccount(platformId: string): Promise<Probe> {
  const platform = ACCOUNT_PLATFORMS[platformId];
  if (!platform) return { state: "failed", error: `平台账号验证尚未实现：${platformId}` };
  const tab = await chrome.tabs.create({ url: platform.verifyUrl, active: platform.visible === true });
  if (tab.id == null) return { state: "failed", error: "无法创建平台检查标签页" };
  try {
    await waitForTab(tab.id);
    return await probeUntilReady(tab.id, platform);
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => undefined);
  }
}

export async function openPlatformLogin(platformId: string, requestId: string): Promise<ExtensionLoginOpened> {
  const platform = ACCOUNT_PLATFORMS[platformId];
  if (!platform) {
    return {
      type: "account.login-opened",
      requestId,
      platformId,
      ok: false,
      error: `平台账号验证尚未实现：${platformId}`,
    };
  }
  await chrome.tabs.create({ url: platform.loginUrl, active: true });
  return {
    type: "account.login-opened",
    requestId,
    platformId,
    ok: true,
    error: null,
  };
}

export function accountResult(
  requestId: string,
  platformId: string,
  probe: Probe,
): ExtensionAccountResult {
  if (probe.state === "ok") {
    return {
      type: "account.result",
      requestId,
      platformId,
      state: "ok",
      error: null,
      profile: probe.profile,
    };
  }
  return {
    type: "account.result",
    requestId,
    platformId,
    state: probe.state === "pending" ? "failed" : probe.state,
    error: probe.error ?? (probe.state === "needs_login" ? "需要在浏览器中登录该平台" : "账号检查失败"),
    profile: null,
  };
}
