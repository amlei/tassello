#!/usr/bin/env bun
import { createHash } from "node:crypto";
import path from "node:path";
import {
  TYPE_META,
  imageGenerationRequestSchema,
  type ImageGenerationTaskDTO,
  type PlatformDTO,
  type PublishSourceInput,
  type TaskDTO,
} from "@tassello/shared";
import { splitFrontmatter } from "@tassello/vault";
import { CliUsageError, helpText, parseCliArgs } from "./args";
import { CliCommandError, OndaApiClient, resolveApiOrigin } from "./client";

const VERSION = "0.2.0";
const IMAGE_TERMINAL = new Set(["success", "failed", "quota_exhausted", "unknown", "cancelled"]);
const TASK_TERMINAL = new Set(["success", "awaiting_confirm", "failed", "unknown", "cancelled"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readImageRequest(source: string): Promise<unknown> {
  let text: string;
  if (source === "-") {
    text = await Bun.stdin.text();
  } else {
    try {
      text = await Bun.file(source).text();
    } catch (error) {
      throw new CliCommandError(
        "request_unreadable",
        `无法读取请求文件：${error instanceof Error ? error.message : String(error)}`,
        2,
      );
    }
  }
  if (!text.trim()) throw new CliCommandError("request_empty", "生图请求为空", 2);
  try {
    return JSON.parse(text);
  } catch {
    throw new CliCommandError("request_invalid_json", "生图请求不是合法 JSON", 2);
  }
}

function imageExitCode(status: ImageGenerationTaskDTO["status"]): number {
  if (status === "success") return 0;
  if (status === "quota_exhausted") return 6;
  if (status === "unknown") return 8;
  if (status === "cancelled") return 9;
  return 7;
}

function taskExitCode(status: TaskDTO["status"]): number {
  if (status === "success") return 0;
  if (status === "awaiting_confirm") return 5;
  if (status === "unknown") return 8;
  if (status === "cancelled") return 9;
  return 7;
}

async function waitForImage(
  client: OndaApiClient,
  id: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<ImageGenerationTaskDTO> {
  const deadline = Date.now() + timeoutMs;
  let task = await client.getImageGeneration(id);
  while (!IMAGE_TERMINAL.has(task.status)) {
    if (Date.now() >= deadline) {
      throw new CliCommandError(
        "wait_timeout",
        `等待生图任务超时：${id}，任务仍在 ${task.status}`,
        10,
        task,
      );
    }
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
    task = await client.getImageGeneration(id);
  }
  return task;
}

async function waitForPublishTask(
  client: OndaApiClient,
  id: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<TaskDTO> {
  const deadline = Date.now() + timeoutMs;
  let task = await client.getTask(id);
  while (!TASK_TERMINAL.has(task.status)) {
    if (Date.now() >= deadline) {
      throw new CliCommandError(
        "wait_timeout",
        `等待发布任务超时：${id}，任务仍在 ${task.status}`,
        10,
        task,
      );
    }
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
    task = await client.getTask(id);
  }
  return task;
}

function imageTaskText(task: ImageGenerationTaskDTO): string {
  const lines = [
    `任务：${task.id}`,
    `状态：${task.status}`,
    `进度：${task.completed}/${task.total} · ${task.progress}%`,
  ];
  if (task.error) lines.push(`错误：${task.error}`);
  for (const output of task.outputs) {
    lines.push(`${output.filePath}  ${output.width}x${output.height}  ${output.bytes} bytes`);
  }
  return `${lines.join("\n")}\n`;
}

function publishTaskText(task: TaskDTO): string {
  const type = TYPE_META[task.contentType]?.zh ?? task.contentType;
  const lines = [
    `任务：${task.id}`,
    `平台：${task.platformId}`,
    `类型：${type} (${task.contentType})`,
    `标题：${task.postTitle}`,
    `状态：${task.status}`,
    `进度：${task.progress}%`,
  ];
  if (task.manualHint) lines.push(`提示：${task.manualHint}`);
  if (task.failReason) lines.push(`错误：${task.failReason}`);
  if (task.url) lines.push(`链接：${task.url}`);
  else if (task.pageUrl) lines.push(`页面：${task.pageUrl}`);
  return `${lines.join("\n")}\n`;
}

function platformText(platform: PlatformDTO): string {
  const account = platform.account?.name ?? platform.account?.uid ?? "未连接";
  return [
    `${platform.id}\t${platform.name}\t${platform.status}`,
    `  类型：${platform.supports.map((type) =>
      `${type}(${platform.contentLabels?.[type] ?? TYPE_META[type].zh})`
    ).join("、")}`,
    `  账号：${account} · ${platform.sync.phase}${platform.sync.reason ? ` · ${platform.sync.reason}` : ""}`,
    `  发布：${platform.lands}`,
    "",
  ].join("\n");
}

function writeSuccess(value: unknown, json: boolean, human: string): void {
  process.stdout.write(json ? `${JSON.stringify({ ok: true, data: value }, null, 2)}\n` : human);
}

function withVaultPath(filePath: string, vaultPath?: string): {
  absolutePath: string;
  sourcePath: string;
  vaultPath?: string;
} {
  const root = vaultPath ? path.resolve(vaultPath) : undefined;
  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(root ?? process.cwd(), filePath);
  if (root) {
    const relative = path.relative(root, absolutePath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new CliCommandError("file_outside_vault", "发布文件必须位于 --vault 指定的目录内", 2);
    }
    return { absolutePath, sourcePath: relative, vaultPath: root };
  }
  return { absolutePath, sourcePath: absolutePath };
}

export async function preparePublishSource(
  filePath: string,
  expectedType: TaskDTO["contentType"],
  vaultPath?: string,
): Promise<PublishSourceInput> {
  const resolved = withVaultPath(filePath, vaultPath);
  if (path.extname(resolved.absolutePath).toLowerCase() !== ".md") {
    throw new CliCommandError("invalid_file", "发布文件必须是 Markdown", 2);
  }
  let markdown: string;
  try {
    markdown = await Bun.file(resolved.absolutePath).text();
  } catch (error) {
    throw new CliCommandError(
      "file_unreadable",
      `无法读取发布文件：${error instanceof Error ? error.message : String(error)}`,
      2,
    );
  }
  const parsed = splitFrontmatter(markdown);
  if (parsed.error || !parsed.data.id || !parsed.data.type) {
    throw new CliCommandError("invalid_frontmatter", parsed.error ?? "frontmatter 缺少 id 或 type", 2);
  }
  if (parsed.data.type !== expectedType) {
    throw new CliCommandError(
      "content_type_mismatch",
      `命令类型 ${expectedType} 与 frontmatter 类型 ${parsed.data.type} 不一致`,
      2,
    );
  }
  return {
    id: parsed.data.id,
    filePath: resolved.sourcePath,
    ...(resolved.vaultPath ? { vaultPath: resolved.vaultPath } : {}),
    markdown,
    fingerprint: createHash("sha256").update(markdown).digest("hex"),
  };
}

export function validatePlatform(
  platforms: PlatformDTO[],
  platformId: string,
  contentType: TaskDTO["contentType"],
  channelId?: string,
): PlatformDTO {
  const platform = platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new CliCommandError("unknown_platform", `未知平台：${platformId}`, 2);
  if (platform.status !== "active") {
    throw new CliCommandError("platform_unavailable", `${platform.name} 当前仍为 planned`, 4);
  }
  if (!platform.supports.includes(contentType)) {
    throw new CliCommandError(
      "unsupported_type",
      `${platform.name} 不支持 ${contentType}，支持：${platform.supports.join("、")}`,
      2,
    );
  }
  if (platform.authMode === "rss-downstream") {
    throw new CliCommandError("rss_only", `${platform.name} 只通过 RSS 收录，不支持直接发布`, 4);
  }
  if (platform.authMode === "extension" && platform.sync.phase !== "connected") {
    throw new CliCommandError(
      "platform_not_ready",
      `${platform.name} 账号未就绪：${platform.sync.reason ?? platform.sync.phase}`,
      4,
    );
  }
  const channels = platform.account?.channels ?? [];
  if (channelId && !channels.some((channel) => channel.id === channelId)) {
    throw new CliCommandError("unknown_channel", `${platform.name} 不存在频道：${channelId}`, 2);
  }
  if (!channelId && channels.length > 1) {
    throw new CliCommandError("channel_required", `${platform.name} 有多个发布频道，请使用 --channel`, 2);
  }
  return platform;
}

export async function main(argv: string[]): Promise<number> {
  const command = parseCliArgs(argv);
  if (command.action === "help") {
    process.stdout.write(helpText());
    return 0;
  }
  if (command.action === "version") {
    process.stdout.write(`onda ${VERSION}\n`);
    return 0;
  }

  const client = new OndaApiClient(await resolveApiOrigin(command.apiOrigin));
  await client.assertCompatible();
  if (command.action === "creator-image-generate") {
    const parsed = imageGenerationRequestSchema.safeParse(await readImageRequest(command.source));
    if (!parsed.success) {
      throw new CliCommandError(
        "request_invalid",
        parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("；"),
        2,
      );
    }
    let task = await client.generateImage(parsed.data);
    if (command.wait) task = await waitForImage(client, task.id, command.timeoutMs, command.intervalMs);
    writeSuccess(
      task,
      command.json,
      command.wait ? imageTaskText(task) : `已创建生图任务：${task.id}\n`,
    );
    return command.wait ? imageExitCode(task.status) : 0;
  }
  if (command.action === "creator-image-status") {
    const task = await client.getImageGeneration(command.id);
    writeSuccess(task, command.json, imageTaskText(task));
    return 0;
  }
  if (command.action === "creator-image-wait") {
    const task = await waitForImage(client, command.id, command.timeoutMs, command.intervalMs);
    writeSuccess(task, command.json, imageTaskText(task));
    return imageExitCode(task.status);
  }
  if (command.action === "creator-image-cancel") {
    const task = await client.cancelImageGeneration(command.id);
    writeSuccess(task, command.json, `已取消生图任务：${task.id}\n`);
    return 0;
  }
  if (command.action === "creator-image-list") {
    const tasks = await client.listImageGenerations();
    writeSuccess(
      tasks,
      command.json,
      tasks.length ? tasks.map(imageTaskText).join("\n") : "没有生图任务\n",
    );
    return 0;
  }
  if (command.action === "platforms-list" || command.action === "platforms-show") {
    const platforms = await client.platforms();
    if (command.action === "platforms-show") {
      const platform = platforms.find((candidate) => candidate.id === command.id);
      if (!platform) throw new CliCommandError("unknown_platform", `未知平台：${command.id}`, 2);
      writeSuccess(platform, command.json, platformText(platform));
      return 0;
    }
    writeSuccess(
      platforms,
      command.json,
      platforms.map((platform) =>
        `${platform.id.padEnd(12)} ${platform.status.padEnd(7)} ${platform.supports.join(",").padEnd(30)} ${platform.name}`
      ).join("\n") + "\n",
    );
    return 0;
  }
  if (command.action === "publish") {
    const platforms = await client.platforms();
    const platform = validatePlatform(platforms, command.platformId, command.contentType, command.channelId);
    const source = await preparePublishSource(command.filePath, command.contentType, command.vaultPath);
    const tasks = await client.publish(
      source,
      [platform.id],
      command.channelId ? { [platform.id]: command.channelId } : {},
    );
    let task = tasks[0];
    if (!task) throw new CliCommandError("publish_failed", "没有创建发布任务", 7);
    if (command.wait) task = await waitForPublishTask(client, task.id, command.timeoutMs, command.intervalMs);
    writeSuccess(task, command.json, command.wait ? publishTaskText(task) : `已创建发布任务：${task.id}\n`);
    return command.wait ? taskExitCode(task.status) : 0;
  }
  if (command.action === "tasks-list") {
    const tasks = (await client.listTasks()).filter((task) =>
      (!command.platformId || task.platformId === command.platformId)
      && (!command.contentType || task.contentType === command.contentType)
      && (!command.status || task.status === command.status)
    );
    writeSuccess(
      tasks,
      command.json,
      tasks.length ? tasks.map(publishTaskText).join("\n") : "没有发布任务\n",
    );
    return 0;
  }
  if (command.action === "tasks-status") {
    const task = await client.getTask(command.id);
    writeSuccess(task, command.json, publishTaskText(task));
    return 0;
  }
  if (command.action === "tasks-wait") {
    const task = await waitForPublishTask(client, command.id, command.timeoutMs, command.intervalMs);
    writeSuccess(task, command.json, publishTaskText(task));
    return taskExitCode(task.status);
  }
  if (command.action === "tasks-cancel") {
    const task = await client.cancelTask(command.id);
    writeSuccess(task, command.json, `已取消发布任务：${task.id}\n`);
    return 0;
  }
  if (command.action === "tasks-retry") {
    let task = await client.retryTask(command.id);
    if (command.wait) task = await waitForPublishTask(client, task.id, command.timeoutMs, command.intervalMs);
    writeSuccess(task, command.json, command.wait ? publishTaskText(task) : `已重试发布任务：${task.id}\n`);
    return command.wait ? taskExitCode(task.status) : 0;
  }
  const task = await client.confirmTask(command.id, {
    url: command.url,
    noPublicUrl: command.noPublicUrl,
  });
  writeSuccess(task, command.json, publishTaskText(task));
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    const commandError = error instanceof CliCommandError
      ? error
      : new CliCommandError(
          error instanceof CliUsageError ? error.code : "internal_error",
          error instanceof Error ? error.message : String(error),
          error instanceof CliUsageError ? error.exitCode : 1,
        );
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: {
        code: commandError.code,
        message: commandError.message,
        ...(commandError.task ? { task: commandError.task } : {}),
      },
    }, null, 2)}\n`);
    process.exitCode = commandError.exitCode;
  }
}
