/* api —— 前端访问本地服务的薄客户端 */
import type {
  AccountDTO,
  ApiResult,
  AppSettings,
  AssetDTO,
  PlatformDTO,
  PostDTO,
  TaskDTO,
} from "@tassello/shared";

async function unwrap<T>(res: Response): Promise<T> {
  const j = (await res.json()) as ApiResult<T>;
  if (!j.ok) throw new Error(j.error);
  return j.data;
}

export const api = {
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
    patch: { title?: string; body?: string; bodyHtml?: string; durationSec?: number | null; order?: string[] },
  ): Promise<void> {
    const res = await fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    await unwrap<PostDTO>(res);
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
  async listPlatforms(): Promise<PlatformDTO[]> {
    const res = await fetch("/api/platforms", { cache: "no-store" });
    return unwrap<PlatformDTO[]>(res);
  },
  async accountAction(platformId: string, action: "acquire" | "verify"): Promise<AccountDTO> {
    const res = await fetch(`/api/accounts/${platformId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    return unwrap<AccountDTO>(res);
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
  async publish(postId: string, platformIds: string[]): Promise<TaskDTO[]> {
    const res = await fetch("/api/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postId, platformIds }),
    });
    return unwrap<TaskDTO[]>(res);
  },
  async listTasks(): Promise<TaskDTO[]> {
    const res = await fetch("/api/tasks", { cache: "no-store" });
    return unwrap<TaskDTO[]>(res);
  },
  async confirmTask(id: string, url?: string): Promise<TaskDTO> {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm", url }),
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
};
