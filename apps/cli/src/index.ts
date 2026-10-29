#!/usr/bin/env bun
import { imageGenerationRequestSchema, type ImageGenerationTaskDTO } from "@tassello/shared";
import { CliUsageError, helpText, parseCliArgs } from "./args";
import { CliCommandError, OndaApiClient, resolveApiOrigin } from "./client";

const VERSION = "0.2.0";
const TERMINAL = new Set(["success", "failed", "quota_exhausted", "unknown", "cancelled"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readRequest(source: string): Promise<unknown> {
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

function terminalExitCode(status: ImageGenerationTaskDTO["status"]): number {
  if (status === "success") return 0;
  if (status === "quota_exhausted") return 6;
  if (status === "unknown") return 8;
  if (status === "cancelled") return 9;
  return 7;
}

async function waitForTask(
  client: OndaApiClient,
  id: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<ImageGenerationTaskDTO> {
  const deadline = Date.now() + timeoutMs;
  let task = await client.status(id);
  while (!TERMINAL.has(task.status)) {
    if (Date.now() >= deadline) {
      throw new CliCommandError(
        "wait_timeout",
        `等待生图任务超时：${id}，任务仍在 ${task.status}`,
        10,
        task,
      );
    }
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
    task = await client.status(id);
  }
  return task;
}

function taskText(task: ImageGenerationTaskDTO): string {
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

function writeSuccess(value: unknown, json: boolean, human: string): void {
  process.stdout.write(json ? `${JSON.stringify({ ok: true, data: value }, null, 2)}\n` : human);
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
  if (command.action === "generate") {
    const parsed = imageGenerationRequestSchema.safeParse(await readRequest(command.source));
    if (!parsed.success) {
      throw new CliCommandError(
        "request_invalid",
        parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("；"),
        2,
      );
    }
    let task = await client.generate(parsed.data);
    if (command.wait) task = await waitForTask(client, task.id, command.timeoutMs, command.intervalMs);
    writeSuccess(task, command.json, command.wait ? taskText(task) : `已创建生图任务：${task.id}\n`);
    return command.wait ? terminalExitCode(task.status) : 0;
  }
  if (command.action === "status") {
    const task = await client.status(command.id);
    writeSuccess(task, command.json, taskText(task));
    return 0;
  }
  if (command.action === "wait") {
    const task = await waitForTask(client, command.id, command.timeoutMs, command.intervalMs);
    writeSuccess(task, command.json, taskText(task));
    return terminalExitCode(task.status);
  }
  if (command.action === "cancel") {
    const task = await client.cancel(command.id);
    writeSuccess(task, command.json, `已取消生图任务：${task.id}\n`);
    return 0;
  }
  const tasks = await client.list();
  writeSuccess(
    tasks,
    command.json,
    tasks.length ? tasks.map(taskText).join("\n") : "没有生图任务\n",
  );
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
