import type { PlatformDTO } from "@tassello/shared";
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

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.origin.replace(/\/+$/, "")}/api/v1${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json() as ApiResult<T>;
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

  async publish(documentId: string, platformIds: string[]): Promise<PublishTask[]> {
    if (!documentId) throw new Error("Markdown frontmatter 缺少 tassello.id");
    return (await this.request<BackendTask[]>("/publish", {
      method: "POST",
      body: JSON.stringify({ postId: documentId, platformIds }),
    })).map(taskFromDTO);
  }

  async confirm(taskId: string, url: string | null, noPublicUrl: boolean): Promise<PublishTask> {
    return taskFromDTO(await this.request<BackendTask>(`/tasks/${encodeURIComponent(taskId)}`, {
      method: "POST",
      body: JSON.stringify({ action: "confirm", url, noPublicUrl }),
    }));
  }

  async retry(taskId: string): Promise<PublishTask> {
    return taskFromDTO(await this.request<BackendTask>(`/tasks/${encodeURIComponent(taskId)}`, {
      method: "POST",
      body: JSON.stringify({ action: "retry" }),
    }));
  }
}
