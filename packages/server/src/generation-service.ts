import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  type ImageGenerationJob,
  type ImageGenerationJobEvent,
  type ImageGenerationJobResult,
  type ImageGenerationRequest,
  type ImageGenerationResultAsset,
  type ImageGenerationStatus,
  type ImageGenerationTaskDTO,
} from "@tassello/shared";
import { getPublishCapability } from "./extensions";
import {
  getSettings,
  readJsonFile,
  resolveAttachmentDir,
  resolveVaultPath,
  statePath,
  writeJsonAtomic,
} from "./state";

type StoredImageGenerationTask = ImageGenerationTaskDTO & {
  request: ImageGenerationRequest;
  idempotencyKey: string | null;
  directoryPath: string;
};

export type ImageGenerationDispatcher = (job: ImageGenerationJob) => boolean;
export type ImageGenerationControlDispatcher = (
  message: { type: "generation.cancel"; jobId: string },
) => boolean;

const generationDirectory = () => statePath("generations");
const dispatching = new Set<string>();
const processingResults = new Set<string>();
const mutations = new Map<string, Promise<unknown>>();
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const GENERATION_ID_PATTERN = /^g[a-f0-9]{16}$/;
const ALLOWED_IMAGE_HOSTS = [
  "doubao.com",
  "byteimg.com",
  "bytecdn.cn",
  "volccdn.com",
];
const TERMINAL_STATUSES = new Set<ImageGenerationStatus>([
  "success",
  "failed",
  "cancelled",
  "quota_exhausted",
]);

let dispatcher: ImageGenerationDispatcher | null = null;
let controlDispatcher: ImageGenerationControlDispatcher | null = null;

function now(): string {
  return new Date().toISOString();
}

function generationFile(id: string): string {
  return statePath("generations", `${id}.json`);
}

export function setImageGenerationDispatcher(next: ImageGenerationDispatcher | null): void {
  dispatcher = next;
}

export function setImageGenerationControlDispatcher(
  next: ImageGenerationControlDispatcher | null,
): void {
  controlDispatcher = next;
}

async function saveTask(task: StoredImageGenerationTask): Promise<void> {
  await writeJsonAtomic(generationFile(task.id), task);
}

async function readTask(id: string): Promise<StoredImageGenerationTask | null> {
  if (!GENERATION_ID_PATTERN.test(id)) return null;
  return readJsonFile<StoredImageGenerationTask | null>(generationFile(id), null);
}

export async function listStoredImageGenerationTasks(): Promise<StoredImageGenerationTask[]> {
  const dir = generationDirectory();
  await fs.mkdir(dir, { recursive: true });
  const files = (await fs.readdir(dir)).filter((name) => name.endsWith(".json"));
  const tasks = await Promise.all(files.map((name) =>
    readJsonFile<StoredImageGenerationTask | null>(statePath("generations", name), null)
  ));
  return tasks
    .filter((task): task is StoredImageGenerationTask => !!task)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function toDTO(task: StoredImageGenerationTask): ImageGenerationTaskDTO {
  const {
    request: _request,
    idempotencyKey: _idempotencyKey,
    directoryPath: _directoryPath,
    ...dto
  } = task;
  return dto;
}

export async function listImageGenerations(): Promise<ImageGenerationTaskDTO[]> {
  return (await listStoredImageGenerationTasks()).map(toDTO);
}

export async function getImageGeneration(id: string): Promise<ImageGenerationTaskDTO | null> {
  const task = await readTask(id);
  return task ? toDTO(task) : null;
}

async function mutateTask<T>(
  id: string,
  mutation: (task: StoredImageGenerationTask | null) => Promise<{ task: StoredImageGenerationTask | null; value: T }>,
): Promise<T> {
  const previous = mutations.get(id) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    const result = await mutation(await readTask(id));
    if (result.task) await saveTask(result.task);
    return result.value;
  });
  mutations.set(id, current);
  try {
    return await current;
  } finally {
    if (mutations.get(id) === current) mutations.delete(id);
  }
}

function localDate(): string {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

async function createOutputDirectory(vaultPath: string, name: string): Promise<{
  directoryPath: string;
  outputDirectory: string;
}> {
  const settings = await getSettings();
  const attachmentRoot = resolveAttachmentDir(vaultPath, settings.attachmentPath);
  const generatedRoot = path.join(attachmentRoot, "generated");
  const base = `${localDate()}-${name}`;
  await fs.mkdir(generatedRoot, { recursive: true });
  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    const directoryName = suffix === 1 ? base : `${base}-${suffix}`;
    const directoryPath = path.join(generatedRoot, directoryName);
    try {
      await fs.mkdir(directoryPath);
      return {
        directoryPath,
        outputDirectory: path.relative(vaultPath, directoryPath).replace(/\\/g, "/"),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error("无法创建生图输出目录：同名目录过多");
}

export async function createImageGeneration(
  request: ImageGenerationRequest,
): Promise<ImageGenerationTaskDTO> {
  const idempotencyKey = request.idempotencyKey ?? null;
  if (idempotencyKey) {
    const previous = (await listStoredImageGenerationTasks()).find((task) =>
      task.idempotencyKey === idempotencyKey
    );
    if (previous) return toDTO(previous);
  }

  const id = `g${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const name = request.name ?? `image-${id.slice(1, 9)}`;
  const vaultPath = await resolveVaultPath();
  const { directoryPath, outputDirectory } = await createOutputDirectory(vaultPath, name);
  const capability = await getPublishCapability();
  const timestamp = now();
  const task: StoredImageGenerationTask = {
    id,
    platform: request.platform,
    model: request.model,
    name,
    status: capability.state === "ready" ? "queued" : "waiting_extension",
    stage: 0,
    progress: 0,
    total: request.items.length,
    completed: 0,
    outputDirectory,
    outputs: [],
    error: null,
    pageUrl: null,
    tabId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    finishedAt: null,
    request,
    idempotencyKey,
    directoryPath,
  };
  await saveTask(task);
  if (task.status === "queued") {
    dispatchGeneration(task.id, task.request);
  }
  return toDTO(task);
}

function dispatchGeneration(id: string, request: ImageGenerationRequest): boolean {
  if (!dispatcher || dispatching.has(id)) return false;
  const accepted = dispatcher({
    jobId: id,
    attempt: 1,
    request,
  });
  if (accepted) dispatching.add(id);
  return accepted;
}

export async function dispatchWaitingImageGenerations(): Promise<number> {
  const capability = await getPublishCapability();
  if (capability.state !== "ready") return 0;
  const tasks = (await listStoredImageGenerationTasks()).filter((task) =>
    task.status === "queued" || task.status === "waiting_extension"
  );
  let count = 0;
  for (const task of tasks) {
    if (task.status === "waiting_extension") {
      await mutateTask(task.id, async (current) => current
        ? { task: { ...current, status: "queued", updatedAt: now() }, value: undefined }
        : { task: null, value: undefined });
    }
    if (dispatchGeneration(task.id, task.request)) {
      count += 1;
    }
  }
  return count;
}

export async function onImageGenerationEvent(message: ImageGenerationJobEvent): Promise<void> {
  const event = message.event;
  await mutateTask(message.jobId, async (task) => {
    if (!task || TERMINAL_STATUSES.has(task.status)) return { task, value: undefined };
    const next: StoredImageGenerationTask = {
      ...task,
      status: event.status ?? task.status,
      stage: event.stage ?? task.stage,
      progress: event.progress === undefined
        ? task.progress
        : Math.max(0, Math.min(100, Math.round(event.progress))),
      completed: event.completed === undefined
        ? task.completed
        : Math.max(0, Math.min(task.total, event.completed)),
      error: event.message !== undefined && event.status === "failed"
        ? event.message
        : task.error,
      pageUrl: event.pageUrl !== undefined ? event.pageUrl : task.pageUrl,
      tabId: event.tabId !== undefined ? event.tabId : task.tabId,
      startedAt: task.startedAt ?? (
        event.status && event.status !== "queued" && event.status !== "waiting_extension"
          ? now()
          : null
      ),
      updatedAt: now(),
    };
    return { task: next, value: undefined };
  });
}

function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return ALLOWED_IMAGE_HOSTS.some((suffix) =>
      url.hostname === suffix || url.hostname.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

function extensionFor(contentType: string): string {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("webp")) return ".webp";
  return ".png";
}

async function downloadImage(
  asset: ImageGenerationResultAsset,
  task: StoredImageGenerationTask,
): Promise<{
  fileName: string;
  filePath: string;
  relativePath: string;
  bytes: number;
  contentHash: string;
}> {
  if (!Number.isInteger(asset.promptIndex) || asset.promptIndex < 0 || asset.promptIndex >= task.request.items.length) {
    throw new Error(`生图结果引用不存在的提示词序号：${asset.promptIndex}`);
  }
  if (!Number.isInteger(asset.outputIndex) || asset.outputIndex < 0) {
    throw new Error(`生图结果输出序号不合法：${asset.outputIndex}`);
  }
  if (!Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width <= 0 || asset.height <= 0) {
    throw new Error("生图结果缺少有效分辨率");
  }
  if (!isAllowedImageUrl(asset.src)) {
    throw new Error("生图结果地址不在豆包 CDN 允许范围内");
  }
  const response = await fetch(asset.src, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`下载生图失败（HTTP ${response.status}）`);
  if (!isAllowedImageUrl(response.url)) throw new Error("生图下载重定向到了未允许的地址");
  const declaredBytes = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_IMAGE_BYTES) {
    throw new Error("生图文件超过 64 MiB 限制");
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("生图文件超过 64 MiB 限制");
  const ext = extensionFor(response.headers.get("content-type") ?? "");
  const item = task.request.items[asset.promptIndex]!;
  const slug = item.slug ?? task.request.name ?? "image";
  const stem = `${String(asset.promptIndex + 1).padStart(2, "0")}-${slug}`;
  const fileName = `${stem}${asset.outputIndex === 0 ? "" : `-${asset.outputIndex + 1}`}${ext}`;
  const filePath = path.join(task.directoryPath, fileName);
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, filePath);
  return {
    fileName,
    filePath,
    relativePath: `${task.outputDirectory}/${fileName}`,
    bytes: buffer.byteLength,
    contentHash: createHash("sha256").update(buffer).digest("hex"),
  };
}

export async function onImageGenerationResult(message: ImageGenerationJobResult): Promise<void> {
  const startingTask = await readTask(message.jobId);
  if (!startingTask || TERMINAL_STATUSES.has(startingTask.status)) return;
  if (processingResults.has(message.jobId)) return;
  processingResults.add(message.jobId);

  try {
    const result = message.result;
    const outputs: StoredImageGenerationTask["outputs"] = [];
    let downloadError: string | null = null;

    for (const asset of result.outputs) {
      const key = `${asset.promptIndex}:${asset.outputIndex}`;
      const existing = startingTask.outputs.find((output) =>
        `${output.promptIndex}:${output.outputIndex}` === key
      );
      if (existing) {
        outputs.push(existing);
        continue;
      }
      try {
        const file = await downloadImage(asset, startingTask);
        outputs.push({
          promptIndex: asset.promptIndex,
          outputIndex: asset.outputIndex,
          filePath: file.filePath,
          relativePath: file.relativePath,
          width: Math.round(asset.width),
          height: Math.round(asset.height),
          bytes: file.bytes,
          contentHash: file.contentHash,
        });
        await mutateTask(message.jobId, async (task) => task
          ? {
              task: {
                ...task,
                status: "downloading",
                stage: 3,
                progress: Math.max(task.progress, Math.round((outputs.length / Math.max(1, result.outputs.length)) * 90) + 10),
                completed: new Set(outputs.map((output) => output.promptIndex)).size,
                outputs: [...outputs],
                pageUrl: result.pageUrl ?? task.pageUrl,
                tabId: result.tabId ?? task.tabId,
                updatedAt: now(),
              },
              value: undefined,
            }
          : { task: null, value: undefined });
      } catch (error) {
        downloadError = error instanceof Error ? error.message : String(error);
        break;
      }
    }

    await mutateTask(message.jobId, async (task) => {
      if (!task || TERMINAL_STATUSES.has(task.status)) return { task, value: undefined };
      const status: ImageGenerationStatus = downloadError
        ? "failed"
        : result.status;
      const completed = new Set(outputs.map((output) => output.promptIndex)).size;
      const terminal = TERMINAL_STATUSES.has(status);
      const error = downloadError ?? result.error ?? (
        status === "success" && outputs.length === 0 ? "豆包没有返回可下载的原图" : null
      );
      return {
        task: {
          ...task,
          status: status === "success" && outputs.length === 0 ? "failed" : status,
          stage: status === "success" || status === "failed" ? 3 : task.stage,
          progress: status === "success" ? 100 : task.progress,
          completed,
          outputs,
          error,
          pageUrl: result.pageUrl ?? task.pageUrl,
          tabId: result.tabId ?? task.tabId,
          updatedAt: now(),
          finishedAt: terminal ? now() : null,
        },
        value: undefined,
      };
    });
    dispatching.delete(message.jobId);
  } finally {
    processingResults.delete(message.jobId);
  }
}

export async function onImageGenerationInterrupted(id: string): Promise<void> {
  if (processingResults.has(id)) return;
  await mutateTask(id, async (task) => {
    if (!task) return { task: null, value: undefined };
    if (!["waiting_login", "generating", "downloading"].includes(task.status)) {
      return { task, value: undefined };
    }
    return {
      task: {
        ...task,
        status: "unknown",
        error: "浏览器扩展在生图任务执行中断，平台结果无法确认",
        updatedAt: now(),
        finishedAt: now(),
      },
      value: undefined,
    };
  });
  dispatching.delete(id);
}

export async function onImageGenerationDisconnected(): Promise<void> {
  const tasks = await listStoredImageGenerationTasks();
  for (const task of tasks) {
    if (processingResults.has(task.id)) continue;
    if (["waiting_login", "generating", "downloading"].includes(task.status)) {
      await onImageGenerationInterrupted(task.id);
    } else if (task.status === "queued") {
      await mutateTask(task.id, async (current) => current
        ? {
            task: { ...current, status: "waiting_extension", updatedAt: now() },
            value: undefined,
          }
        : { task: null, value: undefined });
    }
  }
  dispatching.clear();
}

export async function cancelImageGeneration(id: string): Promise<ImageGenerationTaskDTO> {
  const current = await readTask(id);
  if (!current) throw new Error("生图任务不存在");
  if (TERMINAL_STATUSES.has(current.status)) return toDTO(current);
  controlDispatcher?.({ type: "generation.cancel", jobId: id });
  const cancelled = await mutateTask(id, async (task) => {
    if (!task) return { task: null, value: null };
    if (TERMINAL_STATUSES.has(task.status)) return { task, value: toDTO(task) };
    const next: StoredImageGenerationTask = {
      ...task,
      status: "cancelled",
      error: null,
      updatedAt: now(),
      finishedAt: now(),
    };
    return { task: next, value: toDTO(next) };
  });
  dispatching.delete(id);
  if (!cancelled) throw new Error("生图任务不存在");
  return cancelled;
}
