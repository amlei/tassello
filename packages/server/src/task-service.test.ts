import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { BUNDLED_EXTENSION_ID, extensionOrigin } from "@tassello/shared";
import { createDocument, getDocument, updateDocument } from "@tassello/vault";
import {
  autoPairExtension,
  connectExtension,
  disconnectExtension,
  getPublishCapability,
} from "./extensions";
import { saveAccountVerification } from "./account-store";
import { recordRssDiscovery } from "./podcast-rss";
import {
  cancelTask,
  closeTaskTab,
  createTasks,
  createTasksFromSource,
  dispatchWaitingTasks,
  focusTaskTab,
  getTask,
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
const originalFetch = globalThis.fetch;
const tempDirs: string[] = [];

afterEach(async () => {
  globalThis.fetch = originalFetch;
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
  assert.equal(waiting[0]?.contentType, "image");
  assert.equal((await getTask(waiting[0]!.id))?.contentType, "image");

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

test("planned 平台不能创建或重试发布任务", async () => {
  const documentId = await setupVault();
  await assert.rejects(createTasks(documentId, ["toutiao"]), /尚未接入|尚未开放发布/);
});

test("按请求中的 Markdown 文件路径创建快照，不依赖全局 Vault", async () => {
  const documentId = await setupVault();
  const original = await getDocument(process.env.TASSELLO_VAULT_DIR!, documentId);
  assert.ok(original);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tassello-explicit-source-"));
  tempDirs.push(root);
  const sourceRoot = path.join(root, "source-vault");
  const sourceFile = path.join(sourceRoot, "posts", "post.md");
  await fs.mkdir(path.dirname(sourceFile), { recursive: true });
  const markdown = await fs.readFile(original.filePath, "utf8");
  await fs.writeFile(sourceFile, markdown);
  process.env.TASSELLO_VAULT_DIR = path.join(root, "unrelated-vault");

  const paired = await autoPairExtension({
    origin: extensionOrigin(BUNDLED_EXTENSION_ID),
    extensionId: BUNDLED_EXTENSION_ID,
    clientId: "explicit-source-extension",
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
      uid: "explicit-source-user",
      name: "九漾",
      avatarUrl: null,
      authExpiresAt: null,
      channels: [],
    },
    extensionClientId: paired.extension.clientId,
    browserLabel: paired.extension.browserLabel,
  });
  await disconnectExtension(paired.extension.clientId);

  const fingerprint = createHash("sha256").update(markdown).digest("hex");
  const [task] = await createTasksFromSource({
    id: documentId,
    filePath: "posts/post.md",
    vaultPath: sourceRoot,
    markdown,
    fingerprint,
  }, ["xhs"]);
  assert.equal(task?.postId, documentId);
  assert.equal(task?.documentPath, "posts/post.md");
  assert.equal(task?.status, "waiting_extension");
});

test("显式发布快照拒绝指纹不匹配和越界路径", async () => {
  const documentId = await setupVault();
  const original = await getDocument(process.env.TASSELLO_VAULT_DIR!, documentId);
  assert.ok(original);
  await assert.rejects(
    createTasksFromSource({
      id: documentId,
      filePath: original.relativePath,
      vaultPath: process.env.TASSELLO_VAULT_DIR!,
      markdown: "---\ntassello:\n  id: wrong\n---\n正文",
      fingerprint: "0".repeat(64),
    }, ["xhs"]),
    /指纹不匹配/,
  );
  await assert.rejects(
    createTasksFromSource({
      id: documentId,
      filePath: "../outside.md",
      vaultPath: process.env.TASSELLO_VAULT_DIR!,
      markdown: "",
      fingerprint: createHash("sha256").update("").digest("hex"),
    }, ["xhs"]),
    /路径不合法/,
  );
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

test("已通过 RSS 同步的平台拒绝重复创建直传任务", async () => {
  const documentId = await setupVault("audio");
  const document = await getDocument(process.env.TASSELLO_VAULT_DIR!, documentId);
  assert.ok(document);
  await updateDocument(process.env.TASSELLO_VAULT_DIR!, documentId, {
    cover: "../files/cover.png",
    expectedFingerprint: document.fingerprint,
  });
  const paired = await autoPairExtension({
    origin: extensionOrigin(BUNDLED_EXTENSION_ID),
    extensionId: BUNDLED_EXTENSION_ID,
    clientId: "rss-guard-extension",
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
      uid: "rss-user",
      name: "九漾",
      avatarUrl: null,
      authExpiresAt: null,
      channels: [],
    },
    extensionClientId: paired.extension.clientId,
    browserLabel: paired.extension.browserLabel,
  });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://www.douban.com/search")) return new Response("", { status: 404 });
    if (url.startsWith("https://itunes.apple.com/search")) return Response.json({ results: [] });
    throw new Error(`未预期的测试请求：${url}`);
  }) as typeof fetch;
  await recordRssDiscovery("xhs", "rss-user", [{
    url: "https://feed.example.com/show.xml",
    title: "青春列车",
    episodeCount: 20,
    status: "已同步",
  }]);

  await assert.rejects(createTasks(documentId, ["xhs"]), /已通过 RSS 同步，无需直传/);
});

test("RSS 认领只拦截音频，不影响同一平台的图文内容", async () => {
  const documentId = await setupVault("article");
  const paired = await autoPairExtension({
    origin: extensionOrigin(BUNDLED_EXTENSION_ID),
    extensionId: BUNDLED_EXTENSION_ID,
    clientId: "rss-article-extension",
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
      uid: "rss-article-user",
      name: "九漾",
      avatarUrl: null,
      authExpiresAt: null,
      channels: [],
    },
    extensionClientId: paired.extension.clientId,
    browserLabel: paired.extension.browserLabel,
  });
  await recordRssDiscovery("xhs", "rss-article-user", [{
    url: "https://feed.example.com/show.xml",
    title: "青春列车",
    episodeCount: 20,
    status: "已同步",
  }]);

  const tasks = await createTasks(documentId, ["xhs"]);
  assert.equal(tasks[0]?.status, "queued");
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
  const covered = await updateDocument(process.env.TASSELLO_VAULT_DIR, document.id, {
    cover: "../files/missing.png",
    expectedFingerprint: document.fingerprint,
  });
  assert.equal(covered.cover, "../files/missing.png");
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
  assert.match(stored?.snapshot.cover?.resolved ?? "", /files\/missing\.png$/);
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
