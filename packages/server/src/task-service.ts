import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getPlatformMeta } from "@tassello/platform-core";
import {
  STAGE_LABELS,
  TYPE_META,
  type ExtensionJob,
  type ExtensionJobEvent,
  type ExtensionJobResult,
  type PublishSnapshotDTO,
  type TaskDTO,
  type TaskStatus,
} from "@tassello/shared";
import { escAttr, markdownToHtml, markdownToPlain } from "@tassello/render";
import { getDocument, listDocuments } from "@tassello/vault";
import { getStoredAccount, type StoredAccount } from "./account-store";
import { getPublishCapability } from "./extensions";
import { createMediaToken } from "./media-token";
import { podcastRssClaimsPlatform } from "./podcast-rss";
import { readJsonFile, resolveVaultPath, statePath, writeJsonAtomic } from "./state";

export type StoredTask = TaskDTO & {
  snapshot: PublishSnapshotDTO;
};

export type TaskDispatcher = (job: ExtensionJob) => boolean;
export type TaskControlDispatcher = (message:
  | { type: "job.cancel"; jobId: string }
  | { type: "job.focusTab"; jobId: string; tabId: number }
  | { type: "job.closeTab"; jobId: string; tabId: number }
) => boolean;

const taskDirectory = () => statePath("tasks");
const AUDIO_CHANNEL_PLATFORMS = new Set(["xiaoyuzhou", "ximalaya", "qingting", "lizhi"]);
let dispatcher: TaskDispatcher | null = null;
let controlDispatcher: TaskControlDispatcher | null = null;
const dispatching = new Set<string>();
const changeListeners = new Set<() => void>();
let taskMutationTail: Promise<void> = Promise.resolve();

function now(): string {
  return new Date().toISOString();
}

export function setTaskDispatcher(next: TaskDispatcher | null): void {
  dispatcher = next;
}

export function setTaskControlDispatcher(next: TaskControlDispatcher | null): void {
  controlDispatcher = next;
}

export function onTasksChanged(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function contentHash(markdown: string, media: PublishSnapshotDTO["media"]): string {
  return createHash("sha256")
    .update(markdown)
    .update("\0")
    .update(media.map((item) => `${item.kind}:${item.resolved}`).join("\0"))
    .digest("hex");
}

function taskFile(id: string): string {
  return statePath("tasks", `${id}.json`);
}

async function saveTask(task: StoredTask): Promise<void> {
  await writeJsonAtomic(taskFile(task.id), task);
  for (const listener of changeListeners) listener();
}

async function readTask(id: string): Promise<StoredTask | null> {
  return readJsonFile<StoredTask | null>(taskFile(id), null);
}

export async function listStoredTasks(): Promise<StoredTask[]> {
  const dir = taskDirectory();
  await fs.mkdir(dir, { recursive: true });
  const files = (await fs.readdir(dir)).filter((name) => name.endsWith(".json"));
  const tasks = await Promise.all(files.map((file) => readJsonFile<StoredTask | null>(statePath("tasks", file), null)));
  return tasks
    .filter((task): task is StoredTask => !!task)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listTasks(): Promise<TaskDTO[]> {
  return (await listStoredTasks()).map(toTaskDTO);
}

function toTaskDTO(task: StoredTask): TaskDTO {
  const { snapshot: _snapshot, ...dto } = task;
  return dto;
}

export async function runningCount(): Promise<number> {
  return (await listStoredTasks()).filter((task) =>
    ["queued", "rendering", "uploading", "filling", "running"].includes(task.status),
  ).length;
}

async function requireCurrentAccount(platformId: string, expectedUid?: string | null): Promise<StoredAccount> {
  const meta = getPlatformMeta(platformId);
  if (!meta) throw new Error(`未知平台：${platformId}`);
  const account = await getStoredAccount(platformId);
  const capability = await getPublishCapability();
  if (
    !account
    || account.state !== "ok"
    || account.extensionClientId !== capability.extension.clientId
    || account.browserLabel !== capability.extension.browserLabel
  ) {
    throw new Error(`${meta.name}账号未连接，请先在浏览器扩展中验证账号`);
  }
  if (typeof expectedUid === "string" && account.uid !== expectedUid) {
    throw new Error(`${meta.name}账号已变化，请重新创建发布任务`);
  }
  return account;
}

async function buildSnapshot(postId: string, platformId: string, channelId?: string): Promise<PublishSnapshotDTO> {
  const vaultPath = await resolveVaultPath();
  const document = await getDocument(vaultPath, postId);
  if (!document) throw new Error("稿子不存在");
  if (document.status !== "ready") {
    throw new Error(`稿件不可发布：${document.issues.join("；") || document.status}`);
  }
  if (document.issues.length > 0) {
    throw new Error(`稿件包含不受支持的语法：${document.issues.join("；")}`);
  }
  const meta = getPlatformMeta(platformId);
  if (!meta || meta.status !== "active") throw new Error(`平台 ${platformId} 尚未接入`);
  if (!meta.supports.includes(document.type)) {
    throw new Error(`平台 ${meta.name} 不支持${TYPE_META[document.type].zh}类型`);
  }
  const account = await requireCurrentAccount(platformId);
  const accountChannels = account && Array.isArray(account.profile.channels)
    ? account.profile.channels.flatMap((raw) => {
        if (!raw || typeof raw !== "object") return [];
        const value = raw as { id?: unknown; name?: unknown; title?: unknown; coverUrl?: unknown };
        const id = typeof value.id === "string" ? value.id : typeof value.name === "string" ? value.name : null;
        const name = typeof value.name === "string" ? value.name : typeof value.title === "string" ? value.title : id;
        const coverUrl = typeof value.coverUrl === "string" && /^https?:\/\//i.test(value.coverUrl)
          ? value.coverUrl
          : null;
        return id && name ? [{ id, name, coverUrl }] : [];
      })
    : [];
  if (AUDIO_CHANNEL_PLATFORMS.has(platformId) && accountChannels.length === 0) {
    throw new Error(`${meta.name}账号没有可用的发布频道`);
  }
  let targetChannel = channelId ? accountChannels.find((channel) => channel.id === channelId) ?? null : null;
  if (channelId && !targetChannel) throw new Error(`发布频道不存在：${channelId}`);
  if (!targetChannel && accountChannels.length === 1) targetChannel = accountChannels[0]!;
  if (!targetChannel && accountChannels.length > 1) throw new Error(`请选择${meta.name}的发布频道`);
  // 产品默认只填充平台编辑页，最终发布始终由用户在平台内完成。
  const intent = "draft" as const;
  const coverIndex = document.cover
    ? document.media.findIndex((item) => item.kind === "image" && item.resolved === document.cover)
    : document.media.findIndex((item) => item.kind === "image");
  const media = await Promise.all(document.media.map(async (item) => {
    const relative = item.source === "url" || item.source === "absolute"
      ? item.resolved
      : `${document.relativePath.slice(0, Math.max(0, document.relativePath.lastIndexOf("/") + 1))}${item.resolved}`;
    const absolute = item.source === "url"
      ? null
      : item.source === "absolute"
        ? path.resolve(item.resolved)
        : path.resolve(vaultPath, relative);
    const assetId = absolute ? await createMediaToken(absolute, item.kind).catch(() => null) : null;
    return {
      ...item,
      resolved: relative,
      assetId,
      fileName: absolute
        ? path.basename(absolute)
        : (() => {
          try {
            return path.basename(new URL(item.resolved).pathname) || null;
          } catch {
            return null;
          }
        })(),
    };
  }));
  const cover = coverIndex >= 0 ? media[coverIndex] ?? null : null;
  if (meta.cover?.[document.type]?.required && !cover) {
    throw new Error(`${meta.name}${TYPE_META[document.type].zh}发布需要先设置封面`);
  }
  const bodyHtml = markdownToHtml(document.bodyMarkdown, {
    renderImage: ({ href, alt, title }) => {
      const decoded = (() => {
        try {
          return decodeURI(href);
        } catch {
          return href;
        }
      })();
      const item = media.find((candidate) =>
        candidate.resolved === href
        || candidate.resolved === decoded
        || candidate.raw.includes(href)
      );
      if (!item) return "";
      const titleAttribute = title ? ` data-title="${escAttr(title)}"` : "";
      return `<figure data-onda-media="${item.order}" data-alt="${escAttr(alt || item.alt || "配图")}"${titleAttribute}></figure>`;
    },
  });
  return {
    documentId: document.id,
    documentPath: document.relativePath,
    title: document.title,
    type: document.type,
    markdown: document.bodyMarkdown,
    bodyHtml,
    plainText: markdownToPlain(document.bodyMarkdown),
    media,
    cover,
    contentHash: contentHash(document.bodyMarkdown, media),
    platformId,
    accountUid: account?.uid ?? null,
    targetChannel,
    options: { ...document.options, intent },
  };
}

async function createTask(snapshot: PublishSnapshotDTO, retryOfTaskId?: string): Promise<StoredTask> {
  const capability = await getPublishCapability();
  const created: StoredTask = {
    id: `t${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    postId: snapshot.documentId,
    postTitle: snapshot.title,
    documentPath: snapshot.documentPath,
    platformId: snapshot.platformId,
    accountUid: snapshot.accountUid,
    channelId: snapshot.targetChannel?.id ?? null,
    channelName: snapshot.targetChannel?.name ?? null,
    status: capability.state === "ready" ? "queued" : "waiting_extension",
    stage: 0,
    progress: 0,
    failReason: null,
    url: null,
    urlSource: null,
    noPublicUrl: false,
    pageUrl: null,
    manualHint: null,
    tabId: null,
    retryOfTaskId: retryOfTaskId ?? null,
    createdAt: now(),
    finishedAt: null,
    snapshot,
  };
  await saveTask(created);
  if (created.status === "queued") dispatchTask(created);
  return created;
}

function dispatchTask(task: StoredTask): boolean {
  if (!dispatcher || dispatching.has(task.id)) return false;
  const accepted = dispatcher({
    jobId: task.id,
    attempt: 1,
    snapshot: task.snapshot,
  });
  if (accepted) dispatching.add(task.id);
  return accepted;
}

export async function createTasks(
  postId: string,
  platformIds: string[],
  channelIds: Record<string, string> = {},
): Promise<TaskDTO[]> {
  const unique = [...new Set(platformIds)];
  if (!unique.length) throw new Error("至少选择一个发布平台");
  const snapshots = await Promise.all(unique.map((platformId) => buildSnapshot(postId, platformId, channelIds[platformId])));
  const rssClaimed = await Promise.all(
    snapshots.map((snapshot) => snapshot.type === "audio"
      ? podcastRssClaimsPlatform(snapshot.platformId, snapshot.accountUid)
      : false),
  );
  const blocked = snapshots.find((_, index) => rssClaimed[index]);
  if (blocked) {
    throw new Error(`${getPlatformMeta(blocked.platformId)?.name ?? blocked.platformId}已通过 RSS 同步，无需直传`);
  }
  const tasks = await Promise.all(snapshots.map((snapshot) => createTask(snapshot)));
  return tasks.map(toTaskDTO);
}

export async function dispatchWaitingTasks(): Promise<number> {
  const capability = await getPublishCapability();
  if (capability.state !== "ready") return 0;
  const tasks = (await listStoredTasks()).filter((task) =>
    task.status === "waiting_extension" || task.status === "queued"
  );
  let count = 0;
  for (const task of tasks) {
    try {
      await requireCurrentAccount(task.platformId, task.accountUid);
    } catch (error) {
      await patchTask(task.id, {
        status: "failed",
        failReason: error instanceof Error ? error.message : String(error),
        finishedAt: now(),
      });
      continue;
    }
    const updated = { ...task, status: "queued" as const };
    await saveTask(updated);
    if (dispatchTask(updated)) count += 1;
    else dispatching.delete(task.id);
  }
  return count;
}

async function patchTask(id: string, patch: Partial<StoredTask>): Promise<StoredTask | null> {
  let output: StoredTask | null = null;
  const mutation = taskMutationTail.then(async () => {
    const task = await readTask(id);
    if (!task) return;
    output = { ...task, ...patch };
    await saveTask(output);
  });
  taskMutationTail = mutation.catch(() => undefined);
  await mutation;
  return output;
}

export async function onExtensionJobEvent(message: ExtensionJobEvent): Promise<void> {
  const event = message.event;
  await patchTask(message.jobId, {
    ...(event.status ? { status: event.status } : {}),
    ...(event.stage !== undefined ? { stage: event.stage } : {}),
    ...(event.progress !== undefined ? { progress: Math.max(0, Math.min(100, event.progress)) } : {}),
    ...(event.pageUrl !== undefined ? { pageUrl: event.pageUrl } : {}),
    ...(event.tabId !== undefined ? { tabId: event.tabId } : {}),
    ...(event.message !== undefined ? { manualHint: event.message } : {}),
  });
}

export async function onExtensionJobResult(message: ExtensionJobResult): Promise<void> {
  const result = message.result;
  const status: TaskStatus = result.status;
  dispatching.delete(message.jobId);
  await patchTask(message.jobId, {
    status,
    ...(status === "success" || status === "awaiting_confirm" ? { stage: 3, progress: 100 } : {}),
    failReason: result.error ?? null,
    url: result.url ?? null,
    urlSource: result.urlSource ?? null,
    noPublicUrl: result.noPublicUrl ?? false,
    ...(result.pageUrl !== undefined ? { pageUrl: result.pageUrl } : {}),
    ...(result.tabId !== undefined ? { tabId: result.tabId } : {}),
    finishedAt: ["success", "failed", "cancelled"].includes(status) ? now() : null,
  });
}

export async function cancelTask(taskId: string): Promise<TaskDTO> {
  const task = await readTask(taskId);
  if (!task) throw new Error("任务不存在");
  if (["success", "failed", "cancelled"].includes(task.status)) return toTaskDTO(task);
  const accepted = controlDispatcher?.({ type: "job.cancel", jobId: taskId });
  if (!accepted) {
    const cancelled = await patchTask(taskId, {
      status: "cancelled",
      failReason: null,
      finishedAt: now(),
    });
    if (!cancelled) throw new Error("任务不存在");
    return toTaskDTO(cancelled);
  }
  return toTaskDTO(task);
}

export async function focusTaskTab(taskId: string): Promise<void> {
  const task = await readTask(taskId);
  if (!task?.tabId) throw new Error("该任务没有可聚焦的平台标签页");
  if (!controlDispatcher?.({ type: "job.focusTab", jobId: taskId, tabId: task.tabId })) {
    throw new Error("浏览器扩展未连接");
  }
}

export async function closeTaskTab(taskId: string): Promise<void> {
  const task = await readTask(taskId);
  if (!task?.tabId) return;
  if (!controlDispatcher?.({ type: "job.closeTab", jobId: taskId, tabId: task.tabId })) {
    throw new Error("浏览器扩展未连接");
  }
  await patchTask(taskId, { tabId: null });
}

export async function onExtensionDisconnected(): Promise<void> {
  const active = (await listStoredTasks()).filter((task) =>
    ["queued", "rendering", "uploading", "filling", "running"].includes(task.status)
  );
  await Promise.all(active.map((task) => patchTask(task.id, {
    status: task.status === "filling" || task.status === "running" ? "unknown" : "waiting_extension",
    failReason: task.status === "filling" || task.status === "running"
      ? "浏览器扩展连接中断，平台结果无法确认"
      : "浏览器扩展连接中断，等待重连后继续",
  })));
  dispatching.clear();
}

export async function onExtensionJobInterrupted(jobId: string): Promise<void> {
  const task = await readTask(jobId);
  if (!task || !["queued", "rendering", "uploading", "filling", "running"].includes(task.status)) return;
  await patchTask(jobId, {
    status: "unknown",
    failReason: "浏览器扩展在任务执行中断，平台结果无法确认",
  });
  dispatching.delete(jobId);
}

export async function confirmTask(
  taskId: string,
  result: { url: string | null; noPublicUrl: boolean },
): Promise<TaskDTO> {
  if (result.url && !/^https?:\/\/\S+$/i.test(result.url)) throw new Error("发布链接必须以 http(s) 开头");
  if (!result.url && !result.noPublicUrl) throw new Error("请填写发布链接或确认无公开链接");
  const task = await patchTask(taskId, {
    status: "success",
    stage: 3,
    progress: 100,
    url: result.url,
    urlSource: "manual",
    noPublicUrl: result.noPublicUrl,
    failReason: null,
    finishedAt: now(),
  });
  if (!task) throw new Error("任务不存在");
  const { snapshot: _snapshot, ...dto } = task;
  return dto;
}

export async function retryTask(taskId: string): Promise<TaskDTO> {
  const current = await readTask(taskId);
  if (!current) throw new Error("任务不存在");
  if (["queued", "rendering", "uploading", "filling", "running"].includes(current.status)) {
    throw new Error("发布进行中的任务不能重试");
  }
  await requireCurrentAccount(current.platformId, current.accountUid);
  const next = await createTask({
    ...current.snapshot,
    options: { ...current.snapshot.options, intent: "draft" },
  }, taskId);
  return toTaskDTO(next);
}

export async function deleteTask(taskId: string): Promise<void> {
  const task = await readTask(taskId);
  if (!task) return;
  if (["queued", "rendering", "uploading", "filling", "running"].includes(task.status)) {
    throw new Error("发布进行中的记录不能删除");
  }
  dispatching.delete(taskId);
  await fs.unlink(taskFile(taskId));
  for (const listener of changeListeners) listener();
}

export async function taskStageLabel(stage: number): Promise<string> {
  return STAGE_LABELS[stage] ?? `阶段 ${stage}`;
}
