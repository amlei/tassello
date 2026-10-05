/* tasks —— 发布任务引擎：事实只记在 PublishTask；同平台串行，跨平台并行 */
import { randomUUID } from "node:crypto";
import { getPrisma } from "@tassello/db";
import { getAdapter } from "@tassello/platform-core";
import type { PostDraft } from "@tassello/platform-core";
import { STAGE_LABELS, TYPE_META, type TaskDTO, type TaskStatus } from "@tassello/shared";
import { serverAdapterContext } from "./platform-runtime";
import { getPost } from "./posts";

function toTaskDTO(t: {
  id: string; postId: string; platformId: string; accountUid: string | null;
  status: string; stage: number; progress: number; failReason: string | null;
  url: string | null; createdAt: Date; finishedAt: Date | null;
}): Omit<TaskDTO, "postTitle"> {
  return {
    id: t.id,
    postId: t.postId,
    platformId: t.platformId,
    accountUid: t.accountUid,
    status: t.status as TaskStatus,
    stage: t.stage,
    progress: t.progress,
    failReason: t.failReason,
    url: t.url,
    createdAt: t.createdAt.toISOString(),
    finishedAt: t.finishedAt?.toISOString() ?? null,
  };
}

export async function listTasks(): Promise<TaskDTO[]> {
  const prisma = getPrisma();
  const rows = await prisma.publishTask.findMany({ orderBy: { createdAt: "desc" } });
  const posts = await prisma.post.findMany({
    where: { id: { in: Array.from(new Set(rows.map((r) => r.postId))) } },
    select: { id: true, title: true },
  });
  const titles = new Map(posts.map((p) => [p.id, p.title]));
  return rows.map((r) => ({ ...toTaskDTO(r), postTitle: titles.get(r.postId) ?? "未命名" }));
}

export async function runningCount(): Promise<number> {
  return getPrisma().publishTask.count({ where: { status: { in: ["queued", "running"] } } });
}

/** 发布：每个选中平台一个任务；无适配器/凭据缺失当场落失败（可归因） */
export async function createTasks(postId: string, platformIds: string[]): Promise<TaskDTO[]> {
  const prisma = getPrisma();
  const post = await getPost(postId);
  if (!post) throw new Error("稿子不存在");
  const dtos: TaskDTO[] = [];
  const postTitle = post.title || "未命名";
  for (const platformId of platformIds) {
    const meta = getAdapter(platformId) ? getAdapter(platformId)!.meta : undefined;
    let status: TaskStatus = "queued";
    let failReason: string | null = null;
    if (!meta || meta.status !== "active") {
      status = "failed";
      failReason = `平台 ${platformId} 的适配器尚未接入（planned）`;
    } else if (!meta.supports.includes(post.type)) {
      status = "failed";
      failReason = `平台 ${meta.name} 不支持${TYPE_META[post.type].zh}类型`;
    }
    const task = await prisma.publishTask.create({
      data: { postId, platformId, status, failReason, accountUid: null },
    });
    dtos.push({ ...toTaskDTO(task), postTitle });
    if (status === "queued") {
      void runTask(task.id).catch(() => {});
    }
  }
  return dtos;
}

async function buildDraft(postId: string): Promise<PostDraft> {
  const post = await getPost(postId);
  if (!post) throw new Error("稿子不存在");
  return {
    id: post.id,
    type: post.type,
    title: post.title,
    body: post.body,
    bodyHtml: post.bodyHtml,
    durationSec: post.durationSec,
    assets: post.assets.map((a) => ({ id: a.id, kind: a.kind, path: a.path, color: a.color })),
  };
}

async function runTask(taskId: string): Promise<void> {
  const prisma = getPrisma();
  const task = await prisma.publishTask.findUnique({ where: { id: taskId } });
  if (!task) return;
  const adapter = getAdapter(task.platformId);
  if (!adapter) {
    await prisma.publishTask.update({
      where: { id: taskId },
      data: { status: "failed", failReason: "适配器未接入" },
    });
    return;
  }
  const account = await prisma.platformAccount.findFirst({
    where: { platformId: task.platformId },
    orderBy: { updatedAt: "desc" },
  });
  if (!account || account.state !== "ok") {
    await prisma.publishTask.update({
      where: { id: taskId },
      data: { status: "failed", failReason: "平台凭据未获取（先到设置里获取该平台账号）" },
    });
    return;
  }
  let profile: unknown = {};
  try {
    profile = JSON.parse(account.profile);
  } catch {}
  const parsed = adapter.account.profileSchema.safeParse(profile);

  const log = async (event: string, payload?: unknown) => {
    await prisma.publishLog
      .create({ data: { taskId, event, payloadJson: JSON.stringify(payload ?? {}) } })
      .catch(() => {});
  };

  await prisma.publishTask.update({
    where: { id: taskId },
    data: { status: "running", stage: 0, progress: 0, failReason: null, finishedAt: null, accountUid: account.uid },
  });
  await log("task.start");

  const onStage = async (e: { stage: number; progress: number; message?: string | null }) => {
    await prisma.publishTask
      .update({ where: { id: taskId }, data: { stage: e.stage, progress: e.progress } })
      .catch(() => {});
    if (e.message) await log(`stage.${STAGE_LABELS[e.stage] ?? e.stage}`, { message: e.message });
  };

  try {
    const result = await adapter.publish(
      await buildDraft(task.postId),
      { id: account.id, uid: account.uid, profile: parsed.success ? parsed.data : profile },
      serverAdapterContext((event, payload) => void log(event, payload)),
      (e) => void onStage(e),
    );
    if (result.needsManualConfirm) {
      // 人工确认：任务保持 running + stage 3，等用户「标记完成」
      await prisma.publishTask.update({
        where: { id: taskId },
        data: { stage: 3, progress: 100 },
      });
      await log("task.awaiting-confirm", result.receipt ?? {});
      return;
    }
    // 回执链接：适配器能抓到真链接就用，抓不到就置空（不伪造）
    const url = result.url;
    await prisma.publishTask.update({
      where: { id: taskId },
      data: { status: "success", stage: 3, progress: 100, url, finishedAt: new Date() },
    });
    await log("task.success", { url });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await prisma.publishTask.update({
      where: { id: taskId },
      data: { status: "failed", failReason: reason, finishedAt: new Date() },
    });
    await log("task.failed", { reason });
  }
}

/** 人工确认完成：用户在浏览器里点过发布后回工作台标记（可附回执链接） */
export async function confirmTask(taskId: string, url?: string): Promise<TaskDTO> {
  const prisma = getPrisma();
  const task = await prisma.publishTask.update({
    where: { id: taskId },
    data: {
      status: "success",
      stage: 3,
      progress: 100,
      ...(url ? { url } : {}),
      finishedAt: new Date(),
    },
  });
  const post = await prisma.post.findUnique({ where: { id: task.postId }, select: { title: true } });
  return { ...toTaskDTO(task), postTitle: post?.title || "未命名" };
}

export async function retryTask(taskId: string): Promise<TaskDTO> {
  await getPrisma().publishTask.update({
    where: { id: taskId },
    data: { status: "queued", stage: 0, progress: 0, failReason: null, url: null, finishedAt: null },
  });
  void runTask(taskId).catch(() => {});
  const t = await getPrisma().publishTask.findUniqueOrThrow({ where: { id: taskId } });
  const post = await getPrisma().post.findUnique({ where: { id: t.postId }, select: { title: true } });
  return { ...toTaskDTO(t), postTitle: post?.title || "未命名" };
}

/** 删除队列记录：排队/执行中的不能删（引擎还在写，会出幽灵状态）；
 *  等待人工确认（stage3+100%）的可以删——引擎已经跑完，不再写状态。
 *  只删记录本身和它的发布日志，不动稿子、不动平台账号 */
export async function deleteTask(taskId: string): Promise<void> {
  const prisma = getPrisma();
  const task = await prisma.publishTask.findUnique({ where: { id: taskId } });
  if (!task) return;
  const awaiting = task.status === "running" && task.stage === 3 && task.progress >= 100;
  if (task.status === "queued" || (task.status === "running" && !awaiting)) {
    throw new Error("发布进行中的记录不能删除（可等它结束，或先重试）");
  }
  await prisma.publishLog.deleteMany({ where: { taskId } });
  await prisma.publishTask.delete({ where: { id: taskId } });
}

/** 占位 token 生成给 UI 预填（与原型 newToken 语义一致） */
export function previewToken(): string {
  return randomUUID().slice(0, 8).toUpperCase();
}
