import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { BUNDLED_EXTENSION_ID, extensionOrigin } from "@tassello/shared";
import { createDocument } from "@tassello/vault";
import {
  autoPairExtension,
  connectExtension,
  disconnectExtension,
  getPublishCapability,
} from "./extensions";
import { saveAccountVerification } from "./account-store";
import {
  cancelTask,
  closeTaskTab,
  createTasks,
  dispatchWaitingTasks,
  focusTaskTab,
  listStoredTasks,
  listTasks,
  onExtensionJobEvent,
  onExtensionJobResult,
  retryTask,
  setTaskControlDispatcher,
  setTaskDispatcher,
} from "./task-service";

const originalDataDir = process.env.TASSELLO_DATA_DIR;
const originalVaultDir = process.env.TASSELLO_VAULT_DIR;
const tempDirs: string[] = [];

afterEach(async () => {
  setTaskDispatcher(null);
  setTaskControlDispatcher(null);
  if (originalDataDir === undefined) delete process.env.TASSELLO_DATA_DIR;
  else process.env.TASSELLO_DATA_DIR = originalDataDir;
  if (originalVaultDir === undefined) delete process.env.TASSELLO_VAULT_DIR;
  else process.env.TASSELLO_VAULT_DIR = originalVaultDir;
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function setupVault(type: "article" | "image" | "audio" = "image"): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tassello-tasks-"));
  tempDirs.push(root);
  process.env.TASSELLO_DATA_DIR = path.join(root, "data");
  process.env.TASSELLO_VAULT_DIR = path.join(root, "vault");
  const document = await createDocument(process.env.TASSELLO_VAULT_DIR, {
    type,
    title: "发布测试",
    markdown: "正文",
  });
  return document.id;
}

test("无扩展时任务等待，扩展接入后派发且回执落盘", async () => {
  const documentId = await setupVault();
  const paired = await autoPairExtension({
    origin: extensionOrigin(BUNDLED_EXTENSION_ID),
    extensionId: BUNDLED_EXTENSION_ID,
    clientId: "test-extension",
    browserLabel: "Chrome",
    userAgent: "test",
    version: "0.1.0",
  });
  await connectExtension(paired.extension.clientId);
  await saveAccountVerification({
    platformId: "xhs",
    outcome: "ok",
    error: null,
    profile: {
      uid: "xhs-user",
      name: "九漾",
      avatarUrl: null,
      authExpiresAt: null,
      channels: [],
    },
    extensionClientId: paired.extension.clientId,
    browserLabel: paired.extension.browserLabel,
  });
  await disconnectExtension(paired.extension.clientId);

  const waiting = await createTasks(documentId, ["xhs"]);
  assert.equal(waiting[0]?.status, "waiting_extension");

  await connectExtension(paired.extension.clientId);
  assert.equal((await getPublishCapability()).state, "ready");

  let dispatchedJobId: string | null = null;
  setTaskDispatcher((job) => {
    dispatchedJobId = job.jobId;
    return true;
  });
  assert.equal(await dispatchWaitingTasks(), 1);
  assert.equal(dispatchedJobId, waiting[0]?.id);

  await onExtensionJobResult({
    type: "job.result",
    jobId: dispatchedJobId!,
    result: { status: "success", url: "https://example.com/post/1", urlSource: "auto" },
  });
  const completed = (await listTasks()).find((task) => task.id === dispatchedJobId);
  assert.equal(completed?.status, "success");
  assert.equal(completed?.url, "https://example.com/post/1");

  const originalTaskId = dispatchedJobId!;
  const retried = await retryTask(originalTaskId);
  assert.notEqual(retried.id, originalTaskId);
  assert.equal(retried.retryOfTaskId, originalTaskId);
});

test("账号未连接时拒绝创建发布任务", async () => {
  const documentId = await setupVault();
  await assert.rejects(createTasks(documentId, ["xhs"]), /账号未连接/);
});

test("音频账号没有发布频道时拒绝创建任务", async () => {
  const documentId = await setupVault("audio");
  const paired = await autoPairExtension({
    origin: extensionOrigin(BUNDLED_EXTENSION_ID),
    extensionId: BUNDLED_EXTENSION_ID,
    clientId: "audio-extension",
    browserLabel: "Chrome",
    userAgent: "test",
    version: "0.1.0",
  });
  await connectExtension(paired.extension.clientId);
  await saveAccountVerification({
    platformId: "ximalaya",
    outcome: "ok",
    error: null,
    profile: {
      uid: "audio-user",
      name: "九漾",
      avatarUrl: null,
      authExpiresAt: null,
      channels: [],
    },
    extensionClientId: paired.extension.clientId,
    browserLabel: paired.extension.browserLabel,
  });
  await assert.rejects(
    createTasks(documentId, ["ximalaya"]),
    /没有可用的发布频道/,
  );
});

test("等待任务发现平台账号 UID 变化后拒绝派发", async () => {
  const documentId = await setupVault();
  const paired = await autoPairExtension({
    origin: extensionOrigin(BUNDLED_EXTENSION_ID),
    extensionId: BUNDLED_EXTENSION_ID,
    clientId: "changed-account-extension",
    browserLabel: "Chrome",
    userAgent: "test",
    version: "0.1.0",
  });
  await connectExtension(paired.extension.clientId);
  const accountInput = {
    platformId: "xhs",
    outcome: "ok" as const,
    error: null,
    profile: {
      uid: "old-user",
      name: "旧账号",
      avatarUrl: null,
      authExpiresAt: null,
      channels: [],
    },
    extensionClientId: paired.extension.clientId,
    browserLabel: paired.extension.browserLabel,
  };
  await saveAccountVerification(accountInput);
  await disconnectExtension(paired.extension.clientId);
  const waiting = await createTasks(documentId, ["xhs"]);
  await saveAccountVerification({
    ...accountInput,
    profile: { ...accountInput.profile, uid: "new-user", name: "新账号" },
  });
  await connectExtension(paired.extension.clientId);
  assert.equal(await dispatchWaitingTasks(), 0);
  const updated = (await listTasks()).find((task) => task.id === waiting[0]?.id);
  assert.equal(updated?.status, "failed");
  assert.match(updated?.failReason ?? "", /账号已变化/);
});

test("发布任务支持取消、聚焦与关闭平台标签页控制", async () => {
  const documentId = await setupVault();
  const paired = await autoPairExtension({
    origin: extensionOrigin(BUNDLED_EXTENSION_ID),
    extensionId: BUNDLED_EXTENSION_ID,
    clientId: "controlled-extension",
    browserLabel: "Chrome",
    userAgent: "test",
    version: "0.1.0",
  });
  await connectExtension(paired.extension.clientId);
  await saveAccountVerification({
    platformId: "xhs",
    outcome: "ok",
    error: null,
    profile: {
      uid: "xhs-user",
      name: "九漾",
      avatarUrl: null,
      authExpiresAt: null,
      channels: [],
    },
    extensionClientId: paired.extension.clientId,
    browserLabel: paired.extension.browserLabel,
  });
  const [task] = await createTasks(documentId, ["xhs"]);
  const controls: unknown[] = [];
  setTaskControlDispatcher((message) => {
    controls.push(message);
    return true;
  });
  const cancelResponse = await cancelTask(task!.id);
  assert.equal("snapshot" in cancelResponse, false);
  await onExtensionJobResult({
    type: "job.result",
    jobId: task!.id,
    result: { status: "awaiting_confirm", tabId: 77, pageUrl: "https://example.test/editor" },
  });
  await focusTaskTab(task!.id);
  await closeTaskTab(task!.id);
  assert.equal((controls[0] as { type: string }).type, "job.cancel");
  assert.equal((controls[1] as { type: string; tabId: number }).tabId, 77);
  assert.equal((controls[2] as { type: string; tabId: number }).tabId, 77);
});

test("并发任务事件不会互相覆盖，失败回执保留已执行阶段", async () => {
  const documentId = await setupVault();
  const paired = await autoPairExtension({
    origin: extensionOrigin(BUNDLED_EXTENSION_ID),
    extensionId: BUNDLED_EXTENSION_ID,
    clientId: "event-extension",
    browserLabel: "Chrome",
    userAgent: "test",
    version: "0.1.0",
  });
  await connectExtension(paired.extension.clientId);
  await saveAccountVerification({
    platformId: "xhs",
    outcome: "ok",
    error: null,
    profile: {
      uid: "xhs-user",
      name: "九漾",
      avatarUrl: null,
      authExpiresAt: null,
      channels: [],
    },
    extensionClientId: paired.extension.clientId,
    browserLabel: paired.extension.browserLabel,
  });
  const [task] = await createTasks(documentId, ["xhs"]);
  await Promise.all([
    onExtensionJobEvent({
      type: "job.event",
      jobId: task!.id,
      event: { status: "uploading", stage: 1, progress: 35, tabId: 42 },
    }),
    onExtensionJobEvent({
      type: "job.event",
      jobId: task!.id,
      event: { status: "filling", progress: 75, message: "填充正文" },
    }),
  ]);
  const filling = (await listTasks()).find((item) => item.id === task!.id);
  assert.equal(filling?.status, "filling");
  assert.equal(filling?.tabId, 42);
  assert.equal(filling?.progress, 75);
  assert.equal(filling?.manualHint, "填充正文");

  await onExtensionJobResult({
    type: "job.result",
    jobId: task!.id,
    result: { status: "failed", error: "页面结构变化" },
  });
  const failed = (await listTasks()).find((item) => item.id === task!.id);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.stage, 1);
  assert.equal(failed?.progress, 75);
  assert.equal(failed?.tabId, 42);
});

test("发布快照冻结统一 Markdown 渲染结果与有序媒体占位", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tassello-snapshot-"));
  tempDirs.push(root);
  process.env.TASSELLO_DATA_DIR = path.join(root, "data");
  process.env.TASSELLO_VAULT_DIR = path.join(root, "vault");
  const document = await createDocument(process.env.TASSELLO_VAULT_DIR, {
    type: "image",
    title: "渲染测试",
    markdown: "**加粗**\n\n![配图](../files/missing.png)",
  });
  const paired = await autoPairExtension({
    origin: extensionOrigin(BUNDLED_EXTENSION_ID),
    extensionId: BUNDLED_EXTENSION_ID,
    clientId: "render-extension",
    browserLabel: "Chrome",
    userAgent: "test",
    version: "0.1.0",
  });
  await connectExtension(paired.extension.clientId);
  await saveAccountVerification({
    platformId: "xhs",
    outcome: "ok",
    error: null,
    profile: {
      uid: "xhs-user",
      name: "九漾",
      avatarUrl: null,
      authExpiresAt: null,
      channels: [],
    },
    extensionClientId: paired.extension.clientId,
    browserLabel: paired.extension.browserLabel,
  });
  const [task] = await createTasks(document.id, ["xhs"]);
  const stored = (await listStoredTasks()).find((item) => item.id === task!.id);
  assert.match(stored?.snapshot.bodyHtml ?? "", /<strong>加粗<\/strong>/);
  assert.match(stored?.snapshot.bodyHtml ?? "", /data-onda-media="0" data-alt="配图"/);
  assert.match(stored?.snapshot.plainText ?? "", /加粗/);
});

test("即使平台具备自动提交能力，发布快照默认也只填充不提交", async () => {
  const documentId = await setupVault("article");
  const paired = await autoPairExtension({
    origin: extensionOrigin(BUNDLED_EXTENSION_ID),
    extensionId: BUNDLED_EXTENSION_ID,
    clientId: "draft-default-extension",
    browserLabel: "Chrome",
    userAgent: "test",
    version: "0.1.0",
  });
  await connectExtension(paired.extension.clientId);
  await saveAccountVerification({
    platformId: "x",
    outcome: "ok",
    error: null,
    profile: {
      uid: "x-user",
      name: "@onda",
      avatarUrl: null,
      authExpiresAt: null,
      channels: [],
    },
    extensionClientId: paired.extension.clientId,
    browserLabel: paired.extension.browserLabel,
  });
  const [task] = await createTasks(documentId, ["x"]);
  const stored = (await listStoredTasks()).find((item) => item.id === task!.id);
  assert.equal(stored?.snapshot.options.intent, "draft");
});
