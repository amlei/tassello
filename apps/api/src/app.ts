import { randomUUID } from "node:crypto";
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import {
  AccountSyncError,
  authenticateExtension,
  autoPairExtension,
  cancelImageGeneration,
  cancelTask,
  closeTaskTab,
  confirmTask,
  connectExtension,
  createImageGeneration,
  createPost,
  createTasksFromSource,
  deleteAsset,
  deletePost,
  deleteTask,
  disconnectExtension,
  dispatchWaitingImageGenerations,
  dispatchWaitingTasks,
  getPublishCapability,
  getPodcastRss,
  getPost,
  getSettings,
  heartbeatExtension,
  getImageGeneration,
  findUploadCache,
  focusTaskTab,
  forgetUploadCache,
  isTrustedExtensionOrigin,
  listDirectories,
  listExtensions,
  listImageGenerations,
  listPlatformsWithAccountSync,
  listPosts,
  listTasks,
  openExtensionInstall,
  openAccountLoginThroughExtension,
  onAccountsChanged,
  onPublishCapabilityChange,
  onTasksChanged,
  onExtensionJobEvent,
  onExtensionDisconnected,
  onExtensionJobInterrupted,
  onExtensionJobResult,
  onImageGenerationDisconnected,
  onImageGenerationEvent,
  onImageGenerationInterrupted,
  onImageGenerationResult,
  reconcileAccounts,
  readAssetFile,
  readAssetFileRange,
  readAssetMetadata,
  reorderAssets,
  retryTask,
  revokeExtension,
  saveSettings,
  saveUploadCache,
  scanVault,
  setExtensionAccountConnection,
  setExtensionAccountRequestDispatcher,
  setPostMedia,
  setPostCover,
  setPodcastRssFeed,
  setPreferredExtensionBrowser,
  setImageGenerationControlDispatcher,
  setImageGenerationDispatcher,
  setTaskControlDispatcher,
  setTaskDispatcher,
  updatePost,
  verifyAccountThroughExtension,
  handleExtensionAccountMessage,
} from "@tassello/server";
import {
  extensionAutoPairSchema,
  imageGenerationRequestSchema,
  postCreateSchema,
  postUpdateSchema,
  podcastRssUpdateSchema,
  publishRequestSchema,
  settingsUpdateSchema,
  uploadCacheQuerySchema,
  uploadCacheSaveSchema,
  type ApiResult,
  type ExtensionAccountRequest,
} from "@tassello/shared";

type SocketLike = { send(data: string): unknown; close?(code?: number, reason?: string): unknown };
const clientSockets = new Set<SocketLike>();
const utf8Encoder = new TextEncoder();
let platformBroadcastTail: Promise<void> = Promise.resolve();

async function sendClientSnapshot(socket: SocketLike): Promise<void> {
  const [capability, tasks, platforms] = await Promise.all([
    getPublishCapability(),
    listTasks(),
    listPlatformsWithAccountSync(),
  ]);
  socket.send(JSON.stringify({ type: "snapshot", capability, tasks, platforms }));
}

function broadcastClientPlatforms(): void {
  if (clientSockets.size === 0) return;
  platformBroadcastTail = platformBroadcastTail.catch(() => undefined).then(async () => {
    if (clientSockets.size === 0) return;
    const platforms = await listPlatformsWithAccountSync();
    for (const socket of clientSockets) socket.send(JSON.stringify({ type: "platforms", platforms }));
  });
}

const CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const rawStart = match[1] ?? "";
  const rawEnd = match[2] ?? "";
  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(rawStart);
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return null;
  const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
  return Number.isSafeInteger(end) && end >= start ? { start, end } : null;
}

function websocketText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
  if (ArrayBuffer.isView(value)) {
    return new TextDecoder().decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  if (value && typeof value === "object" && "data" in value) {
    return websocketText((value as { data: unknown }).data);
  }
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export const app = new Elysia()
  .use(cors({
    origin: (request) => {
      const origin = request.headers.get("origin");
      if (!origin) return true;
      return origin === "app://obsidian.md"
        || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        || isTrustedExtensionOrigin(origin);
    },
    credentials: true,
  }))
  .get("/api/v1/health", async () => ok({ ready: true, capability: await getPublishCapability() }))
  .get("/api/v1/runtime", async () => ok({
    apiOrigin: process.env.TASSELLO_API_ORIGIN ?? `http://127.0.0.1:${process.env.TASSELLO_API_PORT ?? "4311"}`,
    protocolVersion: 1,
  }))
  .get("/api/v1/posts", async ({ query }) => {
    const type = query.scope && query.scope !== "all" ? String(query.scope) : undefined;
    return ok(await listPosts({
      scope: type as "article" | "image" | "video" | "audio" | undefined,
      query: query.query ? String(query.query) : "",
      sort: (query.sort ? String(query.sort) : "recent") as "recent" | "oldest" | "title" | "manual",
    }));
  })
  .post("/api/v1/posts", async ({ body, set }) => {
    const parsed = postCreateSchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { ok: false, error: "参数不合法" };
    }
    return ok(await createPost(parsed.data));
  })
  .get("/api/v1/posts/:id", async ({ params, set }) => {
    const post = await getPost(params.id);
    if (!post) {
      set.status = 404;
      return { ok: false, error: "稿子不存在" };
    }
    return ok(post);
  })
  .patch("/api/v1/posts/:id", async ({ params, body, set }) => {
    const parsed = postUpdateSchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { ok: false, error: "参数不合法" };
    }
    try {
      const post = await updatePost(params.id, parsed.data);
      if (!post) {
        set.status = 404;
        return { ok: false, error: "稿子不存在" };
      }
      return ok(post);
    } catch (error) {
      set.status = 409;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .delete("/api/v1/posts/:id", async ({ params }) => {
    await deletePost(params.id);
    return ok({ deleted: true });
  })
  .delete("/api/v1/posts/:id/assets/:assetId", async ({ params }) => {
    await deleteAsset(params.id, params.assetId);
    return ok({ deleted: true });
  })
  .patch("/api/v1/posts/:id/assets", async ({ params, body, set }) => {
    const order = (body as { order?: unknown } | null)?.order;
    if (!Array.isArray(order) || !order.every((item) => typeof item === "string")) {
      set.status = 400;
      return { ok: false, error: "参数不合法" };
    }
    await reorderAssets(params.id, order);
    return ok({ ok: true });
  })
  .post("/api/v1/posts/:id/media", async ({ params, body, set }) => {
    const form = body as { kind?: unknown; file?: unknown } | null;
    const kind = String(form?.kind ?? "");
    const file = form?.file;
    if (!["video", "audio", "image"].includes(kind) || !(file instanceof File)) {
      set.status = 400;
      return { ok: false, error: "缺少合法的文件或类型" };
    }
    try {
      const post = await setPostMedia(
        params.id,
        kind as "video" | "audio" | "image",
        file.name,
        new Uint8Array(await file.arrayBuffer()),
      );
      if (!post) {
        set.status = 404;
        return { ok: false, error: "稿子不存在" };
      }
      return ok(post);
    } catch (error) {
      set.status = 400;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .post("/api/v1/posts/:id/cover", async ({ params, body, set }) => {
    const form = body as { file?: unknown } | null;
    const file = form?.file;
    if (!(file instanceof File)) {
      set.status = 400;
      return { ok: false, error: "缺少封面文件" };
    }
    try {
      const post = await setPostCover(
        params.id,
        file.name,
        new Uint8Array(await file.arrayBuffer()),
      );
      if (!post) {
        set.status = 404;
        return { ok: false, error: "稿子不存在" };
      }
      return ok(post);
    } catch (error) {
      set.status = 400;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .get("/api/v1/assets/:assetId/raw", async ({ params, headers, set }) => {
    const rangeHeader = headers.range ?? null;
    if (rangeHeader) {
      const metadata = await readAssetMetadata(params.assetId);
      if (!metadata) {
        set.status = 404;
        return "not found";
      }
      const range = parseRange(rangeHeader, metadata.totalSize);
      if (!range) {
        set.status = 416;
        set.headers["content-range"] = `bytes */${metadata.totalSize}`;
        return "range not satisfiable";
      }
      const file = await readAssetFileRange(params.assetId, range.start, range.end);
      if (!file) {
        set.status = 404;
        return "not found";
      }
      set.headers["content-type"] = CONTENT_TYPE[metadata.ext] ?? "application/octet-stream";
      set.headers["content-length"] = String(file.bytes.byteLength);
      set.headers["content-range"] = `bytes ${range.start}-${range.end}/${metadata.totalSize}`;
      set.headers["accept-ranges"] = "bytes";
      set.headers["cache-control"] = "private, max-age=3600";
      set.headers["x-content-type-options"] = "nosniff";
      set.headers["cross-origin-resource-policy"] = "same-origin";
      if (metadata.ext === ".svg") {
        set.headers["content-security-policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'";
      }
      return new Response(new Uint8Array(file.bytes), {
        status: 206,
        headers: {
          "content-type": CONTENT_TYPE[metadata.ext] ?? "application/octet-stream",
          "content-length": String(file.bytes.byteLength),
          "content-range": `bytes ${range.start}-${range.end}/${metadata.totalSize}`,
          "accept-ranges": "bytes",
          "cache-control": "private, max-age=3600",
          "x-content-type-options": "nosniff",
          "cross-origin-resource-policy": "same-origin",
          ...(metadata.ext === ".svg"
            ? { "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" }
            : {}),
        },
      });
    }
    const file = await readAssetFile(params.assetId);
    if (!file) {
      set.status = 404;
      return "not found";
    }
    set.headers["content-type"] = CONTENT_TYPE[file.ext] ?? "application/octet-stream";
    set.headers["accept-ranges"] = "bytes";
    set.headers["x-content-type-options"] = "nosniff";
    set.headers["cross-origin-resource-policy"] = "same-origin";
    if (file.ext === ".svg") {
      set.headers["content-security-policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'";
    }
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "content-type": CONTENT_TYPE[file.ext] ?? "application/octet-stream",
        "accept-ranges": "bytes",
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
        "cross-origin-resource-policy": "same-origin",
        ...(file.ext === ".svg"
          ? { "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" }
          : {}),
      },
    });
  })
  .get("/api/v1/settings", async () => ok(await getSettings()))
  .patch("/api/v1/settings", async ({ body, set }) => {
    const parsed = settingsUpdateSchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { ok: false, error: "参数不合法" };
    }
    try {
      return ok(await saveSettings(parsed.data));
    } catch (error) {
      set.status = 400;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .get("/api/v1/podcast-rss", async () => ok(await getPodcastRss()))
  .put("/api/v1/podcast-rss", async ({ body, set }) => {
    const parsed = podcastRssUpdateSchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { ok: false, error: "RSS 地址不合法" };
    }
    try {
      return ok(await setPodcastRssFeed(parsed.data.feedUrl));
    } catch (error) {
      set.status = 400;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .get("/api/v1/vault", async () => ok(await scanVault()))
  .get("/api/v1/filesystem/directories", async ({ query, set }) => {
    try {
      return ok(await listDirectories(query.path ? String(query.path) : undefined));
    } catch (error) {
      set.status = 400;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .get("/api/v1/platforms", async () => ok(await listPlatformsWithAccountSync()))
  .post("/api/v1/accounts/:platformId", async ({ params, body, set }) => {
    const action = (body as { action?: string } | null)?.action;
    try {
      if (action === "acquire") {
        return ok(await openAccountLoginThroughExtension(params.platformId));
      }
      if (action === "verify") {
        return ok(await verifyAccountThroughExtension(params.platformId));
      }
      set.status = 400;
      return { ok: false, error: "不支持的账号操作" };
    } catch (error) {
      set.status = error instanceof AccountSyncError ? error.status : 500;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .post("/api/v1/uploads/lookup", async ({ body, set }) => {
    const parsed = uploadCacheQuerySchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { ok: false, error: "素材缓存参数不合法" };
    }
    return ok(await findUploadCache(parsed.data));
  })
  .post("/api/v1/uploads", async ({ body, set }) => {
    const parsed = uploadCacheSaveSchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { ok: false, error: "素材缓存数据不合法" };
    }
    const { platformId, accountUid, contentHash, kind, scope, ...value } = parsed.data;
    return ok(await saveUploadCache(
      { platformId, accountUid, contentHash, kind, scope },
      value,
    ));
  })
  .post("/api/v1/generations", async ({ body, set }) => {
    const parsed = imageGenerationRequestSchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { ok: false, error: "生图参数不合法" };
    }
    try {
      return ok(await createImageGeneration(parsed.data));
    } catch (error) {
      set.status = 400;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .get("/api/v1/generations", async () => ok(await listImageGenerations()))
  .get("/api/v1/generations/:id", async ({ params, set }) => {
    const task = await getImageGeneration(params.id);
    if (!task) {
      set.status = 404;
      return { ok: false, error: "生图任务不存在" };
    }
    return ok(task);
  })
  .delete("/api/v1/generations/:id", async ({ params, set }) => {
    try {
      return ok(await cancelImageGeneration(params.id));
    } catch (error) {
      set.status = 404;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .delete("/api/v1/uploads", async ({ body, set }) => {
    const parsed = uploadCacheQuerySchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { ok: false, error: "素材缓存参数不合法" };
    }
    await forgetUploadCache(parsed.data);
    return ok({ deleted: true });
  })
  .post("/api/v1/publish", async ({ body, set }) => {
    const parsed = publishRequestSchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { ok: false, error: "参数不合法" };
    }
    try {
      return ok(await createTasksFromSource(parsed.data.source, parsed.data.platformIds, parsed.data.channelIds));
    } catch (error) {
      set.status = 400;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .get("/api/v1/tasks", async () => ok(await listTasks()))
  .post("/api/v1/tasks/:id", async ({ params, body, set }) => {
    const input = body as { action?: string; url?: string | null; noPublicUrl?: boolean } | null;
    try {
      if (input?.action === "retry") return ok(await retryTask(params.id));
      if (input?.action === "cancel") return ok(await cancelTask(params.id));
      return ok(await confirmTask(params.id, {
        url: input?.url?.trim() || null,
        noPublicUrl: input?.noPublicUrl === true,
      }));
    } catch (error) {
      set.status = 400;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .post("/api/v1/tasks/:id/focus-tab", async ({ params, set }) => {
    try {
      await focusTaskTab(params.id);
      return ok({ focused: true });
    } catch (error) {
      set.status = 400;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .post("/api/v1/tasks/:id/close-tab", async ({ params, set }) => {
    try {
      await closeTaskTab(params.id);
      return ok({ closed: true });
    } catch (error) {
      set.status = 400;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .delete("/api/v1/tasks/:id", async ({ params, set }) => {
    try {
      await deleteTask(params.id);
      return ok({ id: params.id });
    } catch (error) {
      set.status = 400;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .get("/api/v1/extensions", async () => ok(await listExtensions()))
  .get("/api/v1/extensions/status", async () => ok(await getPublishCapability()))
  .post("/api/v1/extensions/open-install", async ({ body, set }) => {
    const browser = (body as { browser?: unknown } | null)?.browser;
    if (browser !== "chrome" && browser !== "edge") {
      set.status = 400;
      return { ok: false, error: "不支持的浏览器" };
    }
    try {
      await openExtensionInstall(browser);
      await setPreferredExtensionBrowser(browser);
      return ok({ browser });
    } catch (error) {
      set.status = 400;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .post("/api/v1/extensions/auto-pair", async ({ body, headers, request, set }) => {
    const parsed = extensionAutoPairSchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { ok: false, error: "参数不合法" };
    }
    try {
      return ok(await autoPairExtension({
        ...parsed.data,
        origin: request.headers.get("origin") ?? headers.origin ?? null,
      }));
    } catch (error) {
      set.status = 403;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
  .delete("/api/v1/extensions/:clientId", async ({ params }) => {
    await revokeExtension(params.clientId);
    if (extensionClientId === params.clientId) {
      setExtensionAccountConnection(null);
      await onExtensionDisconnected();
      extensionSocket?.send(JSON.stringify({ type: "error", error: "连接已撤销" }));
      extensionSocket?.close?.();
      extensionSocket = null;
      extensionConnectionId = null;
      extensionClientId = null;
    }
    return ok({ revoked: true });
  })
  .ws("/ws/client", {
    open(ws) {
      clientSockets.add(ws);
      void sendClientSnapshot(ws);
    },
    message(ws, raw) {
      const message = websocketText(raw);
      if (message === "ping") ws.send("pong");
    },
    close(ws) {
      clientSockets.delete(ws);
    },
  })
  .ws("/ws/extension", {
    open(ws) {
      const origin = ws.data.request.headers.get("origin");
      if (!isTrustedExtensionOrigin(origin)) ws.close(1008, "extension origin rejected");
    },
    async message(ws, raw) {
      const rawText = websocketText(raw);
      if (utf8Encoder.encode(rawText).byteLength > 256 * 1024) {
        ws.send(JSON.stringify({ type: "error", error: "扩展消息超过大小限制" }));
        return;
      }
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        ws.send(JSON.stringify({ type: "error", error: "invalid json" }));
        return;
      }
      if (message.type === "hello") {
        try {
          const record = await authenticateExtension(String(message.clientId), String(message.token));
          await connectExtension(record.clientId);
          const socketData = ws.data as Record<string, unknown>;
          const previousConnectionId = socketData.extensionConnectionId;
          const connectionId = typeof previousConnectionId === "string"
            ? previousConnectionId
            : randomUUID();
          if (extensionSocket && extensionConnectionId !== connectionId) {
            setExtensionAccountConnection(null);
            extensionSocket.close?.(1001, "replaced by a newer extension connection");
          }
          Object.assign(socketData, {
            extensionConnectionId: connectionId,
            extensionAuthenticated: true,
            extensionClientId: record.clientId,
          });
          extensionSocket = ws;
          extensionConnectionId = connectionId;
          extensionClientId = record.clientId;
          ws.send(JSON.stringify({ type: "ready", installationId: record.installationId }));
          if (typeof message.activeJobId === "string" && message.activeJobId) {
            await onExtensionJobInterrupted(message.activeJobId);
            await onImageGenerationInterrupted(message.activeJobId);
          }
          const parsedProtocolVersion = Number(message.accountProtocolVersion);
          const accountProtocolVersion = Number.isInteger(parsedProtocolVersion)
            && parsedProtocolVersion >= 1
            && parsedProtocolVersion <= 1000
            ? parsedProtocolVersion
            : 0;
          setExtensionAccountConnection({
            clientId: record.clientId,
            browserLabel: record.browserLabel,
            accountProtocolVersion,
          });
          if (process.env.TASSELLO_DISABLE_ACCOUNT_RECONCILE !== "1") void reconcileAccounts();
          void dispatchWaitingTasks();
          void dispatchWaitingImageGenerations();
        } catch (error) {
          ws.send(JSON.stringify({ type: "error", error: error instanceof Error ? error.message : String(error) }));
          ws.close();
        }
        return;
      }
      const socketData = ws.data as {
        extensionAuthenticated?: boolean;
        extensionConnectionId?: string;
      };
      if (
        !extensionConnectionId
        || socketData.extensionAuthenticated !== true
        || socketData.extensionConnectionId !== extensionConnectionId
      ) {
        ws.send(JSON.stringify({ type: "error", error: "扩展连接尚未完成鉴权" }));
        ws.close(1008, "extension not authenticated");
        return;
      }
      if (message.type === "ping") {
        if (extensionClientId) await heartbeatExtension(extensionClientId);
        ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        return;
      }
      if (handleExtensionAccountMessage(message)) {
        return;
      }
      if (message.type === "job.event") {
        await onExtensionJobEvent(message as never);
        return;
      }
      if (message.type === "job.result") {
        await onExtensionJobResult(message as never);
        ws.send(JSON.stringify({
          type: "job.result.ack",
          jobId: String((message as { jobId?: unknown }).jobId ?? ""),
        }));
        return;
      }
      if (message.type === "generation.event") {
        await onImageGenerationEvent(message as never);
        return;
      }
      if (message.type === "generation.result") {
        await onImageGenerationResult(message as never);
        ws.send(JSON.stringify({
          type: "generation.result.ack",
          jobId: String((message as { jobId?: unknown }).jobId ?? ""),
        }));
      }
    },
    async close(ws) {
      const socketData = ws.data as { extensionConnectionId?: string };
      if (!extensionConnectionId || socketData.extensionConnectionId !== extensionConnectionId) return;
      const clientId = extensionClientId;
      extensionSocket = null;
      extensionConnectionId = null;
      extensionClientId = null;
      setExtensionAccountConnection(null);
      await onExtensionDisconnected();
      await onImageGenerationDisconnected();
      if (clientId) await disconnectExtension(clientId);
    },
  })
  .onError(({ code, error, set }) => {
    const status = code === "NOT_FOUND" ? 404 : 500;
    set.status = status;
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  });

let extensionSocket: SocketLike | null = null;
let extensionClientId: string | null = null;
let extensionConnectionId: string | null = null;

setExtensionAccountRequestDispatcher((request: ExtensionAccountRequest) => {
  if (!extensionSocket) return false;
  extensionSocket.send(JSON.stringify(request));
  return true;
});

setTaskDispatcher((job) => {
  if (!extensionSocket) return false;
  extensionSocket.send(JSON.stringify({ type: "job.dispatch", job }));
  return true;
});

setTaskControlDispatcher((message) => {
  if (!extensionSocket) return false;
  extensionSocket.send(JSON.stringify(message));
  return true;
});

setImageGenerationDispatcher((job) => {
  if (!extensionSocket) return false;
  extensionSocket.send(JSON.stringify({ type: "generation.dispatch", job }));
  return true;
});

setImageGenerationControlDispatcher((message) => {
  if (!extensionSocket) return false;
  extensionSocket.send(JSON.stringify(message));
  return true;
});

onPublishCapabilityChange(() => {
  void getPublishCapability().then((capability) => {
    for (const socket of clientSockets) socket.send(JSON.stringify({ type: "capability", capability }));
    broadcastClientPlatforms();
    if (capability.state === "ready") void dispatchWaitingImageGenerations();
  });
});

onAccountsChanged(broadcastClientPlatforms);

onTasksChanged(() => {
  void listTasks().then((tasks) => {
    for (const socket of clientSockets) socket.send(JSON.stringify({ type: "tasks", tasks }));
  });
});
