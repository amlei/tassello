export type ImageCliCommand =
  | { action: "help" }
  | { action: "version" }
  | {
      action: "generate";
      source: string;
      wait: boolean;
      timeoutMs: number;
      intervalMs: number;
      apiOrigin?: string;
      json: boolean;
    }
  | { action: "status"; id: string; apiOrigin?: string; json: boolean }
  | {
      action: "wait";
      id: string;
      timeoutMs: number;
      intervalMs: number;
      apiOrigin?: string;
      json: boolean;
    }
  | { action: "cancel"; id: string; apiOrigin?: string; json: boolean }
  | { action: "list"; apiOrigin?: string; json: boolean };

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

export function parseCliArgs(argv: string[]): ImageCliCommand {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "help") {
    return { action: "help" };
  }
  if (argv[0] === "--version" || argv[0] === "version") {
    return { action: "version" };
  }
  if (argv[0] !== "image") throw new CliUsageError("只支持 image 命令");

  const action = argv[1];
  if (!action || action === "--help") return { action: "help" };
  if (!["generate", "status", "wait", "cancel", "list"].includes(action)) {
    throw new CliUsageError(`未知 image 子命令：${action}`);
  }

  const positionals: string[] = [];
  let apiOrigin: string | undefined;
  let json = false;
  let wait = false;
  let timeoutMs = 20 * 60_000;
  let intervalMs = 2_000;

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--json") {
      json = true;
    } else if (argument === "--wait" && action === "generate") {
      wait = true;
    } else if (argument === "--api") {
      [apiOrigin, index] = takeValue(argv, index, "--api");
    } else if (argument === "--timeout" && (action === "generate" || action === "wait")) {
      let value: string;
      [value, index] = takeValue(argv, index, "--timeout");
      timeoutMs = duration(value, "--timeout");
    } else if (argument === "--interval" && action === "wait") {
      let value: string;
      [value, index] = takeValue(argv, index, "--interval");
      intervalMs = duration(value, "--interval");
    } else if (argument === "--help") {
      return { action: "help" };
    } else if (argument.startsWith("-") && argument !== "-") {
      throw new CliUsageError(`未知参数：${argument}`);
    } else {
      positionals.push(argument);
    }
  }

  if (action === "list") {
    if (positionals.length > 0) throw new CliUsageError("image list 不接受位置参数");
    return { action: "list", ...(apiOrigin ? { apiOrigin } : {}), json };
  }

  if (action === "generate") {
    if (positionals.length > 1) throw new CliUsageError("image generate 最多接受一个请求文件路径");
    return {
      action,
      source: positionals[0] ?? "-",
      wait,
      timeoutMs,
      intervalMs,
      ...(apiOrigin ? { apiOrigin } : {}),
      json,
    };
  }

  const id = positionals[0];
  if (!id) throw new CliUsageError(`image ${action} 需要任务 ID`);
  if (positionals.length > 1) throw new CliUsageError(`image ${action} 只接受一个任务 ID`);
  if (action === "wait") {
    return {
      action,
      id,
      timeoutMs,
      intervalMs,
      ...(apiOrigin ? { apiOrigin } : {}),
      json,
    };
  }
  if (action === "status") {
    return { action, id, ...(apiOrigin ? { apiOrigin } : {}), json };
  }
  return { action: "cancel", id, ...(apiOrigin ? { apiOrigin } : {}), json };
}

export function helpText(): string {
  return `九漾 Onda CLI

用法：
  onda image generate [request.json|-] [--wait] [--timeout 20m] [--json]
  onda image status <id> [--json]
  onda image wait <id> [--timeout 20m] [--interval 2s] [--json]
  onda image cancel <id> [--json]
  onda image list [--json]

通用参数：
  --api <origin>  覆盖本机 API 地址
  --json          输出稳定 JSON，适合脚本和外部 Agent
  --help          显示帮助
  --version       显示版本

命令不会启动应用或浏览器；请先启动九漾 Onda，并保持发布扩展已连接。
`;
}
