import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CLI_PROTOCOL_VERSION } from "@tassello/shared";
import type {
  ApiResult,
  ImageGenerationRequest,
  ImageGenerationTaskDTO,
  PlatformDTO,
  PublishSourceInput,
  TaskDTO,
} from "@tassello/shared";

export class CliCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: number,
    readonly task?: ImageGenerationTaskDTO | TaskDTO,
  ) {
    super(message);
  }
}

type RuntimeDescriptor = {
  apiOrigin?: unknown;
};

function loopbackOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliCommandError("invalid_api_origin", `API 地址不合法：${value}`, 2);
  }
  if (
    url.protocol !== "http:"
    || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new CliCommandError("invalid_api_origin", `API 只允许本机 HTTP 地址：${value}`, 2);
  }
  return `${url.origin}`;
}

function runtimeFile(): string {
  return path.resolve(
    process.env.TASSELLO_RUNTIME_FILE
      ?? path.join(os.homedir(), ".onda", "runtime.json"),
  );
}

export async function resolveApiOrigin(explicit?: string): Promise<string> {
  if (explicit) return loopbackOrigin(explicit);
  if (process.env.TASSELLO_API_ORIGIN) return loopbackOrigin(process.env.TASSELLO_API_ORIGIN);
  try {
    const runtime = JSON.parse(await fs.readFile(runtimeFile(), "utf8")) as RuntimeDescriptor;
    if (typeof runtime.apiOrigin === "string") return loopbackOrigin(runtime.apiOrigin);
  } catch (error) {
    if (error instanceof CliCommandError) throw error;
  }
  return "http://127.0.0.1:4311";
}

export class OndaApiClient {
  constructor(readonly origin: string) {}

  private async request<T>(pathname: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.origin}${pathname}`, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new CliCommandError(
        "app_unavailable",
        `无法连接九漾 Onda：${error instanceof Error ? error.message : String(error)}`,
        3,
      );
    }
    const payload = await response.json().catch(() => null) as ApiResult<T> | null;
    if (!payload) {
      throw new CliCommandError(
        "invalid_response",
        `九漾 Onda 返回了无法解析的响应（HTTP ${response.status}）`,
        3,
      );
    }
    if (!payload.ok) throw new CliCommandError("request_failed", payload.error, 2);
    return payload.data;
  }

  async assertCompatible(): Promise<void> {
    const runtime = await this.request<{ cliProtocolVersion?: unknown }>("/api/v1/runtime");
    if (runtime.cliProtocolVersion !== CLI_PROTOCOL_VERSION) {
      throw new CliCommandError(
        "cli_protocol_mismatch",
        `CLI 协议与应用不兼容（需要 ${CLI_PROTOCOL_VERSION}，实际 ${String(runtime.cliProtocolVersion)}），请同时更新 API、Web 和 CLI`,
        2,
      );
    }
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationTaskDTO> {
    return this.request("/api/v1/generations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
  }

  async getImageGeneration(id: string): Promise<ImageGenerationTaskDTO> {
    return this.request(`/api/v1/generations/${encodeURIComponent(id)}`);
  }

  async cancelImageGeneration(id: string): Promise<ImageGenerationTaskDTO> {
    return this.request(`/api/v1/generations/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async listImageGenerations(): Promise<ImageGenerationTaskDTO[]> {
    return this.request("/api/v1/generations");
  }

  async platforms(): Promise<PlatformDTO[]> {
    return this.request("/api/v1/platforms");
  }

  async publish(
    source: PublishSourceInput,
    platformIds: string[],
    channelIds: Record<string, string> = {},
  ): Promise<TaskDTO[]> {
    return this.request("/api/v1/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source, platformIds, channelIds }),
    });
  }

  async listTasks(): Promise<TaskDTO[]> {
    return this.request("/api/v1/tasks");
  }

  async getTask(id: string): Promise<TaskDTO> {
    return this.request(`/api/v1/tasks/${encodeURIComponent(id)}`);
  }

  async cancelTask(id: string): Promise<TaskDTO> {
    return this.request(`/api/v1/tasks/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
  }

  async retryTask(id: string): Promise<TaskDTO> {
    return this.request(`/api/v1/tasks/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "retry" }),
    });
  }

  async confirmTask(
    id: string,
    input: { url: string | null; noPublicUrl: boolean },
  ): Promise<TaskDTO> {
    return this.request(`/api/v1/tasks/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }
}
