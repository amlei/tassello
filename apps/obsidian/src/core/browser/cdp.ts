import { homedir } from "os";
import { join } from "path";
import { readFile } from "fs/promises";
import { RawWebSocket } from "./raw-websocket";

export type CdpSendOptions = {
  sessionId?: string;
  timeoutMs?: number;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout | null;
};

export type TargetInfo = {
  targetId: string;
  type: string;
  url: string;
  title?: string;
};

export class CdpConnection {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private eventHandlers = new Map<string, Set<(params: unknown) => void>>();
  private closed = false;

  constructor(private readonly ws: RawWebSocket, private readonly defaultTimeoutMs = 20_000) {
    ws.on("message", (data: unknown) => {
      try {
        const raw = typeof data === "string" ? data : String(data);
        const message = JSON.parse(raw) as {
          id?: number;
          method?: string;
          params?: unknown;
          error?: { message?: string };
          result?: unknown;
        };
        if (message.method) {
          for (const handler of this.eventHandlers.get(message.method) ?? []) handler(message.params);
        }
        if (!message.id) return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (pending.timer) clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message || "CDP request failed"));
        else pending.resolve(message.result);
      } catch {
        // A malformed notification should not poison the browser connection.
      }
    });

    ws.on("close", () => {
      this.closed = true;
      for (const [id, pending] of this.pending) {
        if (pending.timer) clearTimeout(pending.timer);
        pending.reject(new Error("Chrome CDP 连接已关闭"));
        this.pending.delete(id);
      }
      for (const handlers of this.eventHandlers.values()) handlers.clear();
      this.eventHandlers.clear();
    });

    ws.on("error", () => {
      if (!this.closed) this.ws.close();
    });
  }

  static connect(url: string, timeoutMs = 70_000): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      let ws: RawWebSocket;
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws?.close();
          reject(new Error("等待 Chrome 授权超时。请在 Chrome 中选择允许，或重新开启 Remote debugging。"));
        }
      }, timeoutMs);

      const settleOk = (conn: CdpConnection) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(conn);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      };

      RawWebSocket.connect(url, timeoutMs)
        .then((raw) => {
          ws = raw;
          const conn = new CdpConnection(raw);
          raw.once("close", () => fail(new Error("Chrome 关闭了连接。请确认已在 Chrome 的远程调试授权框中选择允许。")));
          settleOk(conn);
        })
        .catch(fail);
    });
  }

  get isOpen(): boolean {
    return !this.closed && this.ws.isOpen;
  }

  on(method: string, handler: (params: unknown) => void): void {
    if (!this.eventHandlers.has(method)) this.eventHandlers.set(method, new Set());
    this.eventHandlers.get(method)!.add(handler);
  }

  send<T = unknown>(method: string, params?: Record<string, unknown>, options?: CdpSendOptions): Promise<T> {
    if (!this.isOpen) throw new Error("Chrome CDP 未连接");
    const id = this.nextId++;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    return new Promise<T>((resolve, reject) => {
      const timer = timeoutMs > 0
        ? setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`CDP 请求超时：${method}`));
        }, timeoutMs)
        : null;
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      this.ws.send(JSON.stringify({ id, method, params, sessionId: options?.sessionId }));
    });
  }

  close(): void {
    if (!this.closed) this.ws.close();
  }
}

export type ChromeChannel = "stable" | "beta" | "canary" | "dev";

function defaultUserDataDir(channel: ChromeChannel): string {
  const home = homedir();
  if (process.platform === "darwin") {
    const names = {
      stable: "Google/Chrome",
      beta: "Google Chrome Beta",
      canary: "Google Chrome Canary",
      dev: "Google Chrome Dev",
    } as const;
    return join(home, "Library", "Application Support", names[channel]);
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    const names = {
      stable: "Google\\Chrome\\User Data",
      beta: "Google\\Chrome Beta\\User Data",
      canary: "Google\\Chrome SxS\\User Data",
      dev: "Google\\Chrome Dev\\User Data",
    } as const;
    return join(local, names[channel]);
  }
  const names = {
    stable: "google-chrome",
    beta: "google-chrome-beta",
    canary: "google-chrome-canary",
    dev: "google-chrome-dev",
  } as const;
  return join(home, ".config", names[channel]);
}

export type DevToolsEndpoint = {
  port: number;
  path: string;
  source: string;
};

/** 审批模式不会提供 /json/version；DevToolsActivePort 是唯一官方 bootstrap 文件。 */
export async function discoverDevToolsEndpoint(channel: ChromeChannel = "stable"): Promise<DevToolsEndpoint> {
  const source = defaultUserDataDir(channel);
  const file = join(source, "DevToolsActivePort");
  const content = await readFile(file, "utf8");
  const [portText = "", path = ""] = content.trim().split(/\r?\n/);
  const port = Number.parseInt(portText, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535 || !path.startsWith("/devtools/browser/")) {
    throw new Error("DevToolsActivePort 无效。请在 Chrome 的 chrome://inspect/#remote-debugging 中重新开启。");
  }
  return { port, path, source };
}

export async function connectDefaultChrome(channel: ChromeChannel = "stable"): Promise<CdpConnection> {
  const endpoint = await discoverDevToolsEndpoint(channel);
  return CdpConnection.connect(`ws://127.0.0.1:${endpoint.port}${endpoint.path}`);
}

export async function evaluateScalar<T>(
  connection: CdpConnection,
  sessionId: string,
  expression: string,
  timeoutMs = 15_000,
): Promise<T> {
  const response = await connection.send<{ result?: { value?: unknown }; exceptionDetails?: { exception?: { description?: string }; text?: string } }>(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    { sessionId, timeoutMs },
  );
  if (response.exceptionDetails) {
    const message = response.exceptionDetails.exception?.description || response.exceptionDetails.text || "页面脚本执行失败";
    throw new Error(message.slice(0, 600));
  }
  return response.result?.value as T;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor<T>(
  action: () => Promise<T | null | undefined | false>,
  timeoutMs: number,
  intervalMs = 1000,
): Promise<T> {
  const start = Date.now();
  let lastError: unknown = null;
  for (;;) {
    try {
      const value = await action();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() - start >= timeoutMs) {
      const suffix = lastError instanceof Error ? `：${lastError.message}` : "";
      throw new Error(`等待页面条件超时（${Math.round(timeoutMs / 1000)} 秒）${suffix}`);
    }
    await sleep(intervalMs);
  }
}

export type PageSession = {
  targetId: string;
  sessionId: string;
};

export async function openPage(
  connection: CdpConnection,
  url: string,
  options: { activate?: boolean; background?: boolean } = {},
): Promise<PageSession> {
  const created = await connection.send<{ targetId: string }>("Target.createTarget", {
    url,
    newWindow: false,
    background: options.background ?? options.activate === false,
  });
  const targetId = created.targetId;
  const attached = await connection.send<{ sessionId: string }>("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId;
  await connection.send("Page.enable", {}, { sessionId });
  await connection.send("Runtime.enable", {}, { sessionId });
  await connection.send("DOM.enable", {}, { sessionId });
  if (options.activate !== false) {
    await connection.send("Target.activateTarget", { targetId }, { timeoutMs: 5000 });
  }
  return { targetId, sessionId };
}

export async function closePage(connection: CdpConnection, targetId: string): Promise<void> {
  try {
    await connection.send("Target.closeTarget", { targetId }, { timeoutMs: 5000 });
  } catch {
    // The user may already have closed the tab.
  }
}

/** 只回标量/纯结构。页面对象可能包含响应式 Proxy，禁止 returnByValue 直接带出。 */
export async function evaluateJson<T>(connection: CdpConnection, sessionId: string, value: T, timeoutMs = 15000): Promise<T> {
  return evaluateScalar<T>(
    connection,
    sessionId,
    `JSON.parse(JSON.stringify(${JSON.stringify(value)}))`,
    timeoutMs,
  );
}

export async function dispatchClick(
  connection: CdpConnection,
  sessionId: string,
  x: number,
  y: number,
): Promise<void> {
  await connection.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 }, { sessionId });
  await connection.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, buttons: 1 }, { sessionId });
  await sleep(90);
  await connection.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1, buttons: 0 }, { sessionId });
}

export async function setFileInput(
  connection: CdpConnection,
  sessionId: string,
  selector: string,
  files: string[],
  which: "first" | "last" = "first",
): Promise<void> {
  await connection.send("DOM.enable", {}, { sessionId });
  const doc = await connection.send<{ root?: { nodeId?: number } }>("DOM.getDocument", {}, { sessionId });
  const nodes = await connection.send<{ nodeIds?: number[] }>(
    "DOM.querySelectorAll",
    { nodeId: doc.root?.nodeId, selector },
    { sessionId },
  );
  const ids = nodes.nodeIds ?? [];
  const nodeId = which === "last" ? ids.at(-1) : ids[0];
  if (!nodeId) throw new Error(`未找到文件上传入口：${selector}`);
  await connection.send("DOM.setFileInputFiles", { files, nodeId }, { sessionId });
}
