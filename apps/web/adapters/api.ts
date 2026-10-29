/* api —— Web 与 Elysia 后端之间的 HTTP / WebSocket 适配器 */
import type {
  AccountDTO,
  ApiResult,
  AppSettings,
  DirectoryListingDTO,
  PlatformDTO,
  PodcastRssDTO,
  PostDTO,
  PublishCapabilityDTO,
  TaskDTO,
} from "@tassello/shared";

type ClientEvent =
  | { type: "snapshot"; capability: unknown; tasks: TaskDTO[]; platforms: PlatformDTO[] }
  | { type: "capability"; capability: unknown }
  | { type: "tasks"; tasks: TaskDTO[] }
  | { type: "platforms"; platforms: PlatformDTO[] };

async function unwrap<T>(res: Response): Promise<T> {
  const j = (await res.json()) as ApiResult<T>;
  if (!j.ok) throw new Error(j.error);
  return j.data;
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const api = {
  async getRuntime(): Promise<{ apiOrigin: string; protocolVersion: number }> {
    const res = await fetch("/api/runtime", { cache: "no-store" });
    return unwrap(res);
  },
  async getPost(id: string): Promise<PostDTO | null> {
    const res = await fetch(`/api/posts/${id}`, { cache: "no-store" });
    if (res.status === 404) return null;
    return unwrap<PostDTO | null>(res);
  },
  async listPosts(): Promise<PostDTO[]> {
    const res = await fetch("/api/posts", { cache: "no-store" });
    return unwrap<PostDTO[]>(res);
  },
  async createPost(type: string): Promise<PostDTO> {
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type }),
    });
    return unwrap<PostDTO>(res);
  },
  async updatePost(
    id: string,
    patch: {
      title?: string;
      markdown?: string;
      cover?: string | null;
      durationSec?: number | null;
      order?: string[];
      expectedFingerprint?: string;
    },
  ): Promise<PostDTO> {
    const res = await fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    return unwrap<PostDTO>(res);
  },
  async deletePost(id: string): Promise<void> {
    await fetch(`/api/posts/${id}`, { method: "DELETE" });
  },
  async removeAsset(postId: string, assetId: string): Promise<void> {
    await fetch(`/api/posts/${postId}/assets/${assetId}`, { method: "DELETE" });
  },
  async reorderAssets(postId: string, order: string[]): Promise<void> {
    const res = await fetch(`/api/posts/${postId}/assets`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order }),
    });
    await unwrap(res);
  },
  async uploadMedia(postId: string, kind: "video" | "audio" | "image", file: File): Promise<PostDTO> {
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    const res = await fetch(`/api/posts/${postId}/media`, { method: "POST", body: form });
    return unwrap<PostDTO>(res);
  },
  async uploadCover(postId: string, file: File): Promise<PostDTO> {
    const form = new FormData();
    form.set("file", file);
    const res = await fetch(`/api/posts/${postId}/cover`, { method: "POST", body: form });
    return unwrap<PostDTO>(res);
  },
  async listPlatforms(): Promise<PlatformDTO[]> {
    const res = await fetch("/api/platforms", { cache: "no-store" });
    return unwrap<PlatformDTO[]>(res);
  },
  async getPublishCapability(): Promise<PublishCapabilityDTO> {
    const res = await fetch("/api/extensions/status", { cache: "no-store" });
    return unwrap<PublishCapabilityDTO>(res);
  },
  async getVaultStatus(): Promise<{ path: string; files: number; conflicts: number; warnings: number }> {
    const res = await fetch("/api/vault", { cache: "no-store" });
    return unwrap(res);
  },
  async listDirectories(path?: string): Promise<DirectoryListingDTO> {
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    const res = await fetch(`/api/filesystem/directories${query}`, { cache: "no-store" });
    return unwrap(res);
  },
  async openExtensionInstall(browser: "chrome" | "edge"): Promise<{ browser: "chrome" | "edge" }> {
    const res = await fetch("/api/extensions/open-install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ browser }),
    });
    return unwrap(res);
  },
  async verifyAccount(platformId: string): Promise<AccountDTO> {
    const res = await fetch(`/api/accounts/${platformId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "verify" }),
    });
    return unwrap<AccountDTO>(res);
  },
  async openAccountLogin(platformId: string): Promise<{ opened: true }> {
    const res = await fetch(`/api/accounts/${platformId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "acquire" }),
    });
    return unwrap<{ opened: true }>(res);
  },
  async getSettings(): Promise<AppSettings> {
    const res = await fetch("/api/settings", { cache: "no-store" });
    return unwrap<AppSettings>(res);
  },
  async saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    return unwrap<AppSettings>(res);
  },
  async getPodcastRss(): Promise<PodcastRssDTO | null> {
    const res = await fetch("/api/podcast-rss", { cache: "no-store" });
    return unwrap<PodcastRssDTO | null>(res);
  },
  async savePodcastRss(feedUrl: string): Promise<PodcastRssDTO> {
    const res = await fetch("/api/podcast-rss", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedUrl }),
    });
    return unwrap<PodcastRssDTO>(res);
  },
  async publish(
    post: Pick<PostDTO, "id" | "filePath" | "markdown">,
    platformIds: string[],
    channelIds: Record<string, string> = {},
  ): Promise<TaskDTO[]> {
    const fingerprint = await sha256Text(post.markdown);
    const res = await fetch("/api/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: {
          id: post.id,
          filePath: post.filePath,
          markdown: post.markdown,
          fingerprint,
        },
        platformIds,
        channelIds,
      }),
    });
    return unwrap<TaskDTO[]>(res);
  },
  async listTasks(): Promise<TaskDTO[]> {
    const res = await fetch("/api/tasks", { cache: "no-store" });
    return unwrap<TaskDTO[]>(res);
  },
  async confirmTask(id: string, url?: string, noPublicUrl = false): Promise<TaskDTO> {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm", url, noPublicUrl }),
    });
    return unwrap<TaskDTO>(res);
  },
  async retryTask(id: string): Promise<TaskDTO> {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "retry" }),
    });
    return unwrap<TaskDTO>(res);
  },
  async cancelTask(id: string): Promise<TaskDTO> {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    return unwrap<TaskDTO>(res);
  },
  async focusTaskTab(id: string): Promise<void> {
    const res = await fetch(`/api/tasks/${id}/focus-tab`, { method: "POST" });
    await unwrap<{ focused: true }>(res);
  },
  async deleteTask(id: string): Promise<void> {
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    return unwrap<void>(res);
  },
};

/** 连接本机 Elysia 的客户端事件流；自动重连，返回同步清理函数。 */
export function connectClientEvents(onEvent: (event: ClientEvent) => void): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  let retryTimer = 0;

  const connect = async () => {
    try {
      const runtime = await api.getRuntime();
      if (closed) return;
      const url = `${runtime.apiOrigin.replace(/^http/, "ws")}/ws/client`;
      socket = new WebSocket(url);
      socket.addEventListener("message", (event) => {
        try {
          onEvent(JSON.parse(String(event.data)) as ClientEvent);
        } catch {}
      });
      socket.addEventListener("close", () => {
        socket = null;
        if (!closed) retryTimer = window.setTimeout(connect, 2000);
      });
    } catch {
      if (!closed) retryTimer = window.setTimeout(connect, 3000);
    }
  };
  void connect();
  return () => {
    closed = true;
    window.clearTimeout(retryTimer);
    socket?.close();
  };
}
