import { requestUrl } from "obsidian";
import type { PlatformDTO, PodcastRssDTO, PublishSourceInput } from "@tassello/shared";
import type { PublishStatus, PublishTask } from "../types";

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

type BackendTask = {
  id: string;
  postId: string;
  postTitle: string;
  documentPath?: string | null;
  platformId: string;
  status: PublishStatus | "rendering" | "uploading" | "filling";
  stage: number;
  progress: number;
  failReason: string | null;
  url: string | null;
  urlSource?: "auto" | "manual" | null;
  noPublicUrl?: boolean;
  pageUrl?: string | null;
  retryOfTaskId?: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type BackendCapability = {
  installationId: string;
  state: "ready" | "waiting" | "unavailable";
  extension: {
    connected: boolean;
    clientId: string | null;
    lastHeartbeatAt: string | null;
    browserLabel: string | null;
  };
  reason: string | null;
};

function taskFromDTO(task: BackendTask): PublishTask {
  return {
    id: task.id,
    filePath: task.documentPath ?? task.postId,
    platformId: task.platformId,
    status: task.status === "rendering" || task.status === "uploading" || task.status === "filling"
      ? "running"
      : task.status,
    stage: task.stage,
    progress: task.progress,
    message: task.failReason,
    failReason: task.failReason,
    url: task.url,
    urlSource: task.urlSource ?? null,
    noPublicUrl: task.noPublicUrl ?? false,
    pageUrl: task.pageUrl ?? null,
    retryOfTaskId: task.retryOfTaskId ?? null,
    createdAt: task.createdAt,
    updatedAt: task.finishedAt ?? task.createdAt,
    finishedAt: task.finishedAt,
  };
}

export class BackendApi {
  constructor(private readonly origin: string) {}

  private async request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const body = init?.body === undefined ? undefined : JSON.stringify(init.body);
    const response = await requestUrl({
      url: `${this.origin.replace(/\/+$/, "")}/api/v1${path}`,
      method: init?.method,
      body,
      contentType: body ? "application/json" : undefined,
      throw: false,
    });
    const payload = response.json as ApiResult<T> | null;
    if (!payload || typeof payload !== "object" || !("ok" in payload)) {
      throw new Error(response.text || `HTTP ${response.status}`);
    }
    if (!payload.ok) throw new Error(payload.error);
    return payload.data;
  }

  async capability(): Promise<BackendCapability> {
    return this.request("/extensions/status");
  }

  async runtime(): Promise<{ apiOrigin: string; protocolVersion: number }> {
    return this.request("/runtime");
  }

  async tasks(): Promise<PublishTask[]> {
    return (await this.request<BackendTask[]>("/tasks")).map(taskFromDTO);
  }

  async platforms(): Promise<PlatformDTO[]> {
    return this.request<PlatformDTO[]>("/platforms");
  }

  async podcastRss(): Promise<PodcastRssDTO | null> {
    return this.request<PodcastRssDTO | null>("/podcast-rss");
  }

  async publish(source: PublishSourceInput, platformIds: string[]): Promise<PublishTask[]> {
    if (!source.id) throw new Error("Markdown frontmatter 缺少 tassello.id");
    return (await this.request<BackendTask[]>("/publish", {
      method: "POST",
      body: { source, platformIds },
    })).map(taskFromDTO);
  }

  async confirm(taskId: string, url: string | null, noPublicUrl: boolean): Promise<PublishTask> {
    return taskFromDTO(await this.request<BackendTask>(`/tasks/${encodeURIComponent(taskId)}`, {
      method: "POST",
      body: { action: "confirm", url, noPublicUrl },
    }));
  }

  async retry(taskId: string): Promise<PublishTask> {
    return taskFromDTO(await this.request<BackendTask>(`/tasks/${encodeURIComponent(taskId)}`, {
      method: "POST",
      body: { action: "retry" },
    }));
  }
}
