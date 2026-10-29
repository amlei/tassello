import {
  CONTENT_TYPES,
  TASK_STATUSES,
  type ContentType,
  type TaskStatus,
} from "@tassello/shared";

type CommonOptions = {
  apiOrigin?: string;
  json: boolean;
};

type WaitOptions = {
  wait: boolean;
  timeoutMs: number;
  intervalMs: number;
};

export type CliCommand =
  | { action: "help" }
  | { action: "version" }
  | ({ action: "creator-image-generate"; source: string } & CommonOptions & WaitOptions)
  | ({ action: "creator-image-status"; id: string } & CommonOptions)
  | ({ action: "creator-image-wait"; id: string; timeoutMs: number; intervalMs: number } & CommonOptions)
  | ({ action: "creator-image-cancel"; id: string } & CommonOptions)
  | ({ action: "creator-image-list" } & CommonOptions)
  | ({ action: "platforms-list" } & CommonOptions)
  | ({ action: "platforms-show"; id: string } & CommonOptions)
  | ({
      action: "publish";
      platformId: string;
      contentType: ContentType;
      filePath: string;
      vaultPath?: string;
      channelId?: string;
    } & CommonOptions & WaitOptions)
  | ({
      action: "tasks-list";
      platformId?: string;
      contentType?: ContentType;
      status?: TaskStatus;
    } & CommonOptions)
  | ({ action: "tasks-status"; id: string } & CommonOptions)
  | ({ action: "tasks-wait"; id: string; timeoutMs: number; intervalMs: number } & CommonOptions)
  | ({ action: "tasks-cancel"; id: string } & CommonOptions)
  | ({ action: "tasks-retry"; id: string } & CommonOptions & WaitOptions)
  | ({
      action: "tasks-confirm";
      id: string;
      url: string | null;
      noPublicUrl: boolean;
    } & CommonOptions);

export class CliUsageError extends Error {
  readonly exitCode = 2;
  readonly code = "usage";
}

function duration(value: string, option: string): number {
  const match = /^(\d+)(ms|s|m|h)?$/.exec(value.trim());
  if (!match?.[1]) throw new CliUsageError(`${option} 需要毫秒数或带单位的时长，例如 20m`);
  const amount = Number(match[1]);
  const unit = match[2] ?? "ms";
  const factor = unit === "h" ? 3_600_000 : unit === "m" ? 60_000 : unit === "s" ? 1_000 : 1;
  const result = amount * factor;
  if (!Number.isSafeInteger(result) || result <= 0) throw new CliUsageError(`${option} 必须大于 0`);
  return result;
}

function takeValue(argv: string[], index: number, option: string): [string, number] {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new CliUsageError(`${option} 缺少参数`);
  return [value, index + 1];
}

function contentType(value: string): ContentType {
  if (!(CONTENT_TYPES as readonly string[]).includes(value)) {
    throw new CliUsageError(`内容类型必须是 ${CONTENT_TYPES.join("、")}`);
  }
  return value as ContentType;
}

function taskStatus(value: string): TaskStatus {
  if (!(TASK_STATUSES as readonly string[]).includes(value)) {
    throw new CliUsageError(`任务状态必须是 ${TASK_STATUSES.join("、")}`);
  }
  return value as TaskStatus;
}

function baseOptions(): CommonOptions & WaitOptions {
  return {
    json: false,
    wait: false,
    timeoutMs: 20 * 60_000,
    intervalMs: 2_000,
  };
}

function parseGenerateImage(argv: string[]): CliCommand {
  if (argv[0] === "--help") return { action: "help" };
  const action = ["status", "wait", "cancel", "list"].includes(argv[0] ?? "")
    ? argv[0]!
    : "generate";
  const argumentStart = action === "generate" ? 0 : 1;
  const options = baseOptions();
  const positionals: string[] = [];
  for (let index = argumentStart; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--json") options.json = true;
    else if (argument === "--wait" && action === "generate") options.wait = true;
    else if (argument === "--api") [options.apiOrigin, index] = takeValue(argv, index, "--api");
    else if (argument === "--timeout" && (action === "generate" || action === "wait")) {
      let value: string;
      [value, index] = takeValue(argv, index, "--timeout");
      options.timeoutMs = duration(value, "--timeout");
    } else if (argument === "--interval" && action === "wait") {
      let value: string;
      [value, index] = takeValue(argv, index, "--interval");
      options.intervalMs = duration(value, "--interval");
    } else if (argument === "--help") {
      return { action: "help" };
    } else if (argument.startsWith("-") && argument !== "-") {
      throw new CliUsageError(`未知参数：${argument}`);
    } else {
      positionals.push(argument);
    }
  }
  const common = {
    ...(options.apiOrigin ? { apiOrigin: options.apiOrigin } : {}),
    json: options.json,
  };
  if (action === "list") {
    if (positionals.length) throw new CliUsageError("generate image list 不接受位置参数");
    return { action: "creator-image-list", ...common };
  }
  if (action === "generate") {
    if (positionals.length > 1) throw new CliUsageError("generate image 最多接受一个请求文件路径");
    return {
      action: "creator-image-generate",
      source: positionals[0] ?? "-",
      ...common,
      wait: options.wait,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs,
    };
  }
  const id = positionals[0];
  if (!id) throw new CliUsageError(`generate image ${action} 需要任务 ID`);
  if (positionals.length > 1) throw new CliUsageError(`generate image ${action} 只接受一个任务 ID`);
  if (action === "wait") {
    return {
      action: "creator-image-wait",
      id,
      ...common,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs,
    };
  }
  return action === "status"
    ? { action: "creator-image-status", id, ...common }
    : { action: "creator-image-cancel", id, ...common };
}

function parsePlatforms(argv: string[]): CliCommand {
  const action = !argv[0] || argv[0].startsWith("-") ? "list" : argv[0];
  if (action === "--help") return { action: "help" };
  let apiOrigin: string | undefined;
  let json = false;
  const positionals: string[] = [];
  const argumentStart = action === "list" && (!argv[0] || argv[0].startsWith("-")) ? 0 : 1;
  for (let index = argumentStart; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--json") json = true;
    else if (argument === "--api") [apiOrigin, index] = takeValue(argv, index, "--api");
    else if (argument === "--help") return { action: "help" };
    else if (argument.startsWith("-")) throw new CliUsageError(`未知参数：${argument}`);
    else positionals.push(argument);
  }
  const common = { ...(apiOrigin ? { apiOrigin } : {}), json };
  if (action === "list") {
    if (positionals.length) throw new CliUsageError("platforms list 不接受位置参数");
    return { action: "platforms-list", ...common };
  }
  if (action === "show") {
    const id = positionals[0];
    if (!id) throw new CliUsageError("platforms show 需要平台 ID");
    if (positionals.length > 1) throw new CliUsageError("platforms show 只接受一个平台 ID");
    return { action: "platforms-show", id, ...common };
  }
  throw new CliUsageError(`未知 platforms 子命令：${action}`);
}

function parsePublish(argv: string[]): CliCommand {
  const options = baseOptions();
  const positionals: string[] = [];
  let vaultPath: string | undefined;
  let channelId: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--json") options.json = true;
    else if (argument === "--wait") options.wait = true;
    else if (argument === "--api") [options.apiOrigin, index] = takeValue(argv, index, "--api");
    else if (argument === "--vault") [vaultPath, index] = takeValue(argv, index, "--vault");
    else if (argument === "--channel") [channelId, index] = takeValue(argv, index, "--channel");
    else if (argument === "--timeout") {
      let value: string;
      [value, index] = takeValue(argv, index, "--timeout");
      options.timeoutMs = duration(value, "--timeout");
    } else if (argument === "--interval") {
      let value: string;
      [value, index] = takeValue(argv, index, "--interval");
      options.intervalMs = duration(value, "--interval");
    } else if (argument === "--help") {
      return { action: "help" };
    } else if (argument.startsWith("-")) {
      throw new CliUsageError(`未知参数：${argument}`);
    } else {
      positionals.push(argument);
    }
  }
  if (positionals.length !== 3) {
    throw new CliUsageError("用法：onda publish <platform> <type> <file>");
  }
  return {
    action: "publish",
    platformId: positionals[0]!,
    contentType: contentType(positionals[1]!),
    filePath: positionals[2]!,
    ...(vaultPath ? { vaultPath } : {}),
    ...(channelId ? { channelId } : {}),
    ...(options.apiOrigin ? { apiOrigin: options.apiOrigin } : {}),
    json: options.json,
    wait: options.wait,
    timeoutMs: options.timeoutMs,
    intervalMs: options.intervalMs,
  };
}

function parseTasks(argv: string[]): CliCommand {
  const action = argv[0];
  if (!action || action === "--help") return { action: "help" };
  if (!["list", "status", "wait", "cancel", "retry", "confirm"].includes(action)) {
    throw new CliUsageError(`未知 tasks 子命令：${action}`);
  }
  const options = baseOptions();
  const positionals: string[] = [];
  let platformId: string | undefined;
  let filterType: ContentType | undefined;
  let filterStatus: TaskStatus | undefined;
  let url: string | null = null;
  let noPublicUrl = false;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--json") options.json = true;
    else if (argument === "--wait" && action === "retry") options.wait = true;
    else if (argument === "--api") [options.apiOrigin, index] = takeValue(argv, index, "--api");
    else if (argument === "--platform" && action === "list") {
      [platformId, index] = takeValue(argv, index, "--platform");
    } else if (argument === "--type" && action === "list") {
      let value: string;
      [value, index] = takeValue(argv, index, "--type");
      filterType = contentType(value);
    } else if (argument === "--status" && action === "list") {
      let value: string;
      [value, index] = takeValue(argv, index, "--status");
      filterStatus = taskStatus(value);
    } else if (argument === "--timeout" && (action === "wait" || action === "retry")) {
      let value: string;
      [value, index] = takeValue(argv, index, "--timeout");
      options.timeoutMs = duration(value, "--timeout");
    } else if (argument === "--interval" && action === "wait") {
      let value: string;
      [value, index] = takeValue(argv, index, "--interval");
      options.intervalMs = duration(value, "--interval");
    } else if (argument === "--url" && action === "confirm") {
      let value: string;
      [value, index] = takeValue(argv, index, "--url");
      url = value;
    } else if (argument === "--no-public-url" && action === "confirm") {
      noPublicUrl = true;
    } else if (argument === "--help") {
      return { action: "help" };
    } else if (argument.startsWith("-")) {
      throw new CliUsageError(`未知参数：${argument}`);
    } else {
      positionals.push(argument);
    }
  }
  const common = {
    ...(options.apiOrigin ? { apiOrigin: options.apiOrigin } : {}),
    json: options.json,
  };
  if (action === "list") {
    if (positionals.length) throw new CliUsageError("tasks list 不接受位置参数");
    return {
      action: "tasks-list",
      ...common,
      ...(platformId ? { platformId } : {}),
      ...(filterType ? { contentType: filterType } : {}),
      ...(filterStatus ? { status: filterStatus } : {}),
    };
  }
  const id = positionals[0];
  if (!id) throw new CliUsageError(`tasks ${action} 需要任务 ID`);
  if (positionals.length > 1) throw new CliUsageError(`tasks ${action} 只接受一个任务 ID`);
  if (action === "status") return { action: "tasks-status", id, ...common };
  if (action === "cancel") return { action: "tasks-cancel", id, ...common };
  if (action === "wait") {
    return { action: "tasks-wait", id, ...common, timeoutMs: options.timeoutMs, intervalMs: options.intervalMs };
  }
  if (action === "retry") {
    return {
      action: "tasks-retry",
      id,
      ...common,
      wait: options.wait,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs,
    };
  }
  if (!url && !noPublicUrl) {
    throw new CliUsageError("tasks confirm 需要 --url 或 --no-public-url");
  }
  if (url && noPublicUrl) {
    throw new CliUsageError("tasks confirm 的 --url 与 --no-public-url 不能同时使用");
  }
  return { action: "tasks-confirm", id, ...common, url, noPublicUrl };
}

export function parseCliArgs(argv: string[]): CliCommand {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "help") {
    return { action: "help" };
  }
  if (argv[0] === "--version" || argv[0] === "version") return { action: "version" };
  if (argv[0] === "generate" && argv[1] === "image") return parseGenerateImage(argv.slice(2));
  if (argv[0] === "platforms") return parsePlatforms(argv.slice(1));
  if (argv[0] === "publish") return parsePublish(argv.slice(1));
  if (argv[0] === "tasks") return parseTasks(argv.slice(1));
  throw new CliUsageError("支持的命令：generate image、platforms、publish、tasks");
}

export function helpText(): string {
  return `九漾 Onda CLI

创作能力：
  onda generate image [request.json|-] [--wait] [--timeout 20m] [--json]
  onda generate image status <id> [--json]
  onda generate image wait <id> [--timeout 20m] [--interval 2s] [--json]
  onda generate image cancel <id> [--json]
  onda generate image list [--json]

平台与发布：
  onda platforms list [--json]
  onda platforms show <platform> [--json]
  onda publish <platform> <type> <file> [--channel <id>] [--vault <dir>] [--wait] [--json]

发布任务：
  onda tasks list [--platform <id>] [--type <type>] [--status <status>] [--json]
  onda tasks status <id> [--json]
  onda tasks wait <id> [--timeout 20m] [--interval 2s] [--json]
  onda tasks cancel <id> [--json]
  onda tasks retry <id> [--wait] [--json]
  onda tasks confirm <id> --url <url> [--json]
  onda tasks confirm <id> --no-public-url [--json]

内容类型：${CONTENT_TYPES.join(" / ")}
通用参数：
  --api <origin>  覆盖本机 API 地址
  --json          输出稳定 JSON，适合脚本和外部 Agent
  --help          显示帮助
  --version       显示版本

命令不会启动应用或浏览器；请先启动九漾 Onda，并保持发布扩展已连接。
`;
}
