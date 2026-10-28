import type {
  ExtensionJob,
  PublishMediaRefDTO,
  TaskStatus,
  UploadCacheQuery,
  UploadCacheRef,
} from "@tassello/shared";
import { closeTab, executeInPage, focusTab, openTab, pageUrl } from "./page-runtime";

const MAX_MEDIA_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 128 * 1024 * 1024;

export type DriverReport = (event: {
  status?: TaskStatus;
  stage?: number;
  progress?: number;
  message?: string | null;
  pageUrl?: string | null;
  tabId?: number | null;
}) => void;

export type LoadedMedia = PublishMediaRefDTO & {
  name: string;
  base64: string;
  mime: string;
  contentHash: string;
};

function mimeFor(name: string | null, kind: string): string {
  const ext = (name ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "wav") return "audio/wav";
  if (ext === "aac") return "audio/aac";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "flac") return "audio/flac";
  return kind === "image" ? "image/png" : "application/octet-stream";
}

function bytesToBase64(bytes: Uint8Array): string {
  let output = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    output += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)));
  }
  return btoa(output);
}

async function contentHash(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource));
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export class PublishRuntime {
  private readonly tabs = new Set<number>();

  constructor(
    readonly job: ExtensionJob,
    readonly apiOrigin: string,
    private readonly reportEvent: DriverReport,
  ) {}

  report(event: Parameters<DriverReport>[0]): void {
    this.reportEvent(event);
  }

  async open(url: string, active = true): Promise<number> {
    const tabId = await openTab(url, active);
    this.tabs.add(tabId);
    this.report({ pageUrl: url, tabId });
    return tabId;
  }

  async currentUrl(tabId: number): Promise<string> {
    return pageUrl(tabId);
  }

  async focus(tabId: number): Promise<void> {
    await focusTab(tabId);
  }

  async close(tabId: number): Promise<void> {
    this.tabs.delete(tabId);
    await closeTab(tabId);
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.tabs].map((tabId) => this.close(tabId)));
  }

  async loadMedia(media: PublishMediaRefDTO[]): Promise<LoadedMedia[]> {
    const loaded: LoadedMedia[] = [];
    let totalBytes = 0;
    for (const item of media) {
      const url = item.assetId
        ? `${this.apiOrigin}/api/v1/assets/${encodeURIComponent(item.assetId)}/raw`
        : /^https?:\/\//i.test(item.resolved)
          ? item.resolved
          : null;
      if (!url) throw new Error(`素材没有可用的传输地址：${item.resolved}`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      let response: Response;
      try {
        response = await fetch(url, { signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error(`读取素材超时（30 秒）：${item.fileName ?? item.resolved}`);
        }
        throw new Error(`读取素材失败：${item.fileName ?? item.resolved}（${error instanceof Error ? error.message : String(error)}）`);
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw new Error(`读取素材失败（HTTP ${response.status}）：${item.fileName ?? item.resolved}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_MEDIA_BYTES) {
        throw new Error(`素材超过扩展注入上限 64 MiB：${item.fileName ?? item.resolved}`);
      }
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_TOTAL_MEDIA_BYTES) {
        throw new Error("本次发布素材总量超过扩展注入上限 128 MiB，请在平台页面手动上传");
      }
      loaded.push({
        ...item,
        name: item.fileName || `${item.kind}-${item.order + 1}`,
        base64: bytesToBase64(bytes),
        mime: mimeFor(item.fileName, item.kind),
        contentHash: await contentHash(bytes),
      });
    }
    return loaded;
  }

  async lookupUpload(query: UploadCacheQuery): Promise<UploadCacheRef | null> {
    const response = await fetch(`${this.apiOrigin}/api/v1/uploads/lookup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(query),
    });
    const payload = await response.json() as { ok: boolean; data?: UploadCacheRef | null; error?: string };
    if (!payload.ok) throw new Error(payload.error ?? "素材缓存查询失败");
    return payload.data ?? null;
  }

  async saveUpload(
    query: UploadCacheQuery,
    value: { id: string; url?: string | null; payload?: Record<string, unknown> },
  ): Promise<void> {
    const response = await fetch(`${this.apiOrigin}/api/v1/uploads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...query, ...value }),
    });
    const payload = await response.json() as { ok: boolean; error?: string };
    if (!payload.ok) throw new Error(payload.error ?? "素材缓存保存失败");
  }

  async forgetUpload(query: UploadCacheQuery): Promise<void> {
    await fetch(`${this.apiOrigin}/api/v1/uploads`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(query),
    });
  }

  page<T>(
    tabId: number,
    func: (arg: any) => T | Promise<T>,
    arg?: any,
  ): Promise<T> {
    return executeInPage(tabId, func, arg);
  }
}
