/* Electron 主进程：拉起独立的 Elysia API 与 Next.js UI，就绪后开窗加载。
 * 失败可见性铁律：任一进程起不来时必须弹窗告知用户并留下日志，
 * 不允许 v0.1.0 那种"干等 60 秒静默退出"的行为。 */
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { closeSync, existsSync, openSync, writeSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, Menu, ipcMain, shell, type MenuItemConstructorOptions } from "electron";
import { configuredExtensionIds } from "@tassello/shared";
import { nativeHostBinaryName, registerNativeMessagingHosts } from "@tassello/native-host/register";

// 开发时 __dirname = apps/desktop/dist → 仓库根在三层之上；打包时定位 resources/web。
const ROOT = path.resolve(__dirname, "..", "..", "..");
const DEV_API_DIR = path.join(ROOT, "apps", "api");
const DEV_WEB_DIR = path.join(ROOT, "apps", "web");
const PACKAGED_WEB_CANDIDATES: string[] = [
  path.join(process.resourcesPath ?? "", "web", "apps", "web"),
  path.join(process.resourcesPath ?? "", "web"),
];
const WEB_DIR: string = app.isPackaged
  ? PACKAGED_WEB_CANDIDATES.find((candidate) => existsSync(path.join(candidate, "server.js"))) ?? PACKAGED_WEB_CANDIDATES[0]!
  : DEV_WEB_DIR;
const PACKAGED_API_BINARY = path.join(
  process.resourcesPath ?? "",
  "api",
  process.platform === "win32" ? "tassello-api.exe" : "tassello-api",
);
const PACKAGED_NATIVE_HOST = path.join(process.resourcesPath ?? "", "native-host", nativeHostBinaryName());
const DEV_NATIVE_HOST = path.join(ROOT, "apps", "native-host", "dist", nativeHostBinaryName());
const APP_ICON = path.join(__dirname, "..", "icon.png");
/* API 与 Web 各自向 OS 申请端口，避免与用户已有程序冲突。
 * CI 可通过 TASSELLO_API_PORT / TASSELLO_WEB_PORT 固定端口。 */
const FIXED_API_PORT = Number(process.env.TASSELLO_API_PORT ?? (app.isPackaged ? 0 : 4311));
const FIXED_WEB_PORT = Number(process.env.TASSELLO_WEB_PORT ?? process.env.TASSELLO_PORT ?? (app.isPackaged ? 0 : 3000));
let activeApiPort = FIXED_API_PORT;
let activeWebPort = FIXED_WEB_PORT;

function apiUrlBase(): string {
  return `http://127.0.0.1:${activeApiPort}`;
}

function webUrlBase(): string {
  return `http://127.0.0.1:${activeWebPort}`;
}

function windowUrl(): string {
  if (process.env.TASSELLO_WEB_URL) return process.env.TASSELLO_WEB_URL;
  /* 页面必须走 localhost：Next dev 的 allowedDevOrigins 默认只信任 localhost，
   * 用 127.0.0.1 加载会让 dev 资源/HMR 被降级，React 不水合，页面全是"死"按钮 */
  return `http://localhost:${activeWebPort}/library/article`;
}

/** 向 OS 申请一个空闲端口（bind :0 后立即释放）。极端情况下存在释放后被抢占的窗口期，
 * 由启动重试兜底（换端口重开 server） */
function allocateEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => (port > 0 ? resolve(port) : reject(new Error("系统端口分配失败"))));
    });
  });
}

let apiServer: ChildProcess | null = null;
let webServer: ChildProcess | null = null;
let logFd: number | null = null;

/* 子进程输出的滚动尾部：启动失败时直接展示进弹窗。 */
const PROCESS_TAIL_LINES = 40;
const processOutputTail: string[] = [];

function pushProcessOutput(chunk: Buffer): void {
  for (const line of chunk.toString().split("\n")) {
    const trimmed = line.trimEnd();
    if (trimmed) processOutputTail.push(trimmed);
  }
  if (processOutputTail.length > PROCESS_TAIL_LINES) {
    processOutputTail.splice(0, processOutputTail.length - PROCESS_TAIL_LINES);
  }
}

function processTailBlock(): string {
  if (processOutputTail.length === 0) return "";
  return `\n— 本机服务输出末尾（完整内容见日志）—\n${processOutputTail.join("\n")}`;
}

/* dev 模式下菜单栏应用名取自 app.name（而非 Electron 二进制的 Info.plist），需显式设置 */
app.setName("九漾 Onda");

function openLogFile(): void {
  try {
    const dir = app.getPath("logs");
    const stamp = new Date().toISOString().slice(0, 10);
    logFd = openSync(path.join(dir, `tassello-${stamp}.log`), "a");
  } catch (e) {
    // 日志打不开也不能挡住启动，退化成 stderr
    console.error("[tassello] 无法打开日志文件", e);
  }
}

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  if (logFd !== null) {
    try {
      writeSync(logFd, line);
    } catch {
      /* 写日志失败忽略 */
    }
  }
  console.error(line.trimEnd());
}

function logPath(): string {
  try {
    return path.join(app.getPath("logs"), `tassello-${new Date().toISOString().slice(0, 10)}.log`);
  } catch {
    return "(日志目录不可用)";
  }
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** 发布结果是给用户在平台里看的：始终交给系统默认浏览器，避免占用/替换应用窗口 */
async function openExternalUrl(value: string): Promise<void> {
  if (!isWebUrl(value)) return;
  await shell.openExternal(value);
}

ipcMain.handle("tassello:open-external", (_event, value: unknown) => {
  if (typeof value !== "string" || !isWebUrl(value)) {
    throw new Error("invalid external url");
  }
  return openExternalUrl(value);
});

function wireChildProcess(child: ChildProcess, label: "api" | "web"): void {
  child.stdout?.on("data", (chunk: Buffer) => {
    pushProcessOutput(chunk);
    log(`[${label}] ${chunk.toString().trimEnd()}`);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    pushProcessOutput(chunk);
    log(`[${label}] ${chunk.toString().trimEnd()}`);
  });
  child.on("exit", (code, signal) => {
    log(`${label} 进程退出 code=${code} signal=${signal ?? ""}`);
    if (label === "api") apiServer = null;
    else webServer = null;
  });
}

function startApiServer(): void {
  const command = app.isPackaged ? PACKAGED_API_BINARY : process.env.TASSELLO_BUN ?? "bun";
  const args = app.isPackaged ? [] : ["run", "src/index.ts"];
  const dataDir = process.env.TASSELLO_DATA_DIR
    ?? (app.isPackaged ? path.join(app.getPath("appData"), "Onda") : path.join(ROOT, ".onda"));
  apiServer = spawn(command, args, {
    cwd: app.isPackaged ? path.dirname(PACKAGED_API_BINARY) : DEV_API_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      TASSELLO_API_PORT: String(activeApiPort),
      TASSELLO_DATA_DIR: dataDir,
      TASSELLO_DESKTOP: "1",
    },
  });
  wireChildProcess(apiServer, "api");
}

async function registerNativeHost(): Promise<void> {
  const binaryPath = app.isPackaged ? PACKAGED_NATIVE_HOST : DEV_NATIVE_HOST;
  if (!existsSync(binaryPath)) {
    log(`Native Messaging Host 不存在：${binaryPath}`);
    return;
  }
  try {
    const files = await registerNativeMessagingHosts({
      binaryPath,
      extensionIds: configuredExtensionIds(process.env),
    });
    log(`Native Messaging Host 已注册：${files.join(", ")}`);
  } catch (error) {
    log(`Native Messaging Host 注册失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function startWebServer(): void {
  if (app.isPackaged) {
    /* Electron 二进制以 ELECTRON_RUN_AS_NODE=1 复用为 Node runtime，用户无需安装 Bun/Node。 */
    const entry = path.join(WEB_DIR, "server.js");
    webServer = spawn(process.execPath, [entry], {
      cwd: WEB_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
        HOSTNAME: "127.0.0.1",
        PORT: String(activeWebPort),
        TASSELLO_API_PORT: String(activeApiPort),
        TASSELLO_DESKTOP: "1",
      },
    });
  } else {
    const bin = process.env.TASSELLO_BUN ?? "bun";
    webServer = spawn(bin, ["run", "dev", "--", "-p", String(activeWebPort)], {
      cwd: WEB_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TASSELLO_API_PORT: String(activeApiPort),
        TASSELLO_DESKTOP: "1",
      },
    });
  }
  wireChildProcess(webServer, "web");
}

function getJson(url: string, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (d: Buffer) => chunks.push(d));
      res.on("end", () => {
        res.resume();
        if ((res.statusCode ?? 500) >= 500) return reject(new Error(`HTTP ${res.statusCode}`));
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(new Error(`响应非 JSON：${url}`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("健康检查请求超时"));
    });
  });
}

/** API 握手：防止固定端口被无关服务占用时误判。 */
async function probeApi(timeoutMs: number): Promise<void> {
  const json = await getJson(`${apiUrlBase()}/api/v1/health`, timeoutMs) as {
    ok?: unknown;
    data?: { ready?: unknown };
  };
  if (json.ok !== true || json.data?.ready !== true) {
    throw new Error("API 健康检查握手不匹配");
  }
}

/** 穿过 Next rewrite 访问 API，同时验证 UI 与 API 的完整链路。 */
async function probeWeb(timeoutMs: number): Promise<void> {
  const json = await getJson(`${webUrlBase()}/api/platforms`, timeoutMs) as {
    ok?: unknown;
    data?: unknown;
  };
  if (json.ok !== true || !Array.isArray(json.data)) {
    throw new Error("Web → API 健康检查握手不匹配");
  }
}

function waitFor(check: () => Promise<void>, label: "api" | "web", timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      const child = label === "api" ? apiServer : webServer;
      if (child && child.exitCode === null && child.signalCode === null) {
        child.off("exit", onExit);
      }
      if (err) reject(err);
      else resolve();
    };
    const tick = () => {
      if (settled) return;
      check()
        .then(() => done())
        .catch(() => {
          if (settled) return;
          if (Date.now() - start > timeoutMs) {
            done(new Error(`${label} 在 ${timeoutMs / 1000}s 内未就绪`));
            return;
          }
          setTimeout(tick, 600);
        });
    };
    /* 子进程崩了就不必干等到超时，立即失败。 */
    const onExit = (code: number | null) => {
      done(new Error(`${label} 进程提前退出（code=${code}）`));
    };
    const child = label === "api" ? apiServer : webServer;
    if (child) child.once("exit", onExit);
    tick();
  });
}

/** 启动失败的统一出口：弹窗（附进程输出尾部）+ 日志路径，然后退出 */
function failToStart(reason: string): void {
  log(`启动失败: ${reason}`);
  const detail = [
    reason,
    processTailBlock(),
    "",
    `详细日志: ${logPath()}`,
    "",
    "常见原因：安装包损坏（请重新下载）、本机端口被占用、安全软件拦截。",
  ].join("\n");
  try {
    dialog.showErrorBox("九漾 Onda 启动失败", detail);
  } catch {
    /* 个别环境下 dialog 不可用，忽略 */
  }
  app.quit();
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1080,
      minHeight: 720,
      title: "九漾 Onda",
      /* macOS：隐藏系统标题栏，红绿灯保留并融入左侧栏（悬浮在内容之上） */
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
      trafficLightPosition: { x: 16, y: 16 },
      backgroundColor: "#F4F1E8",
      icon: APP_ICON,
      webPreferences: { preload: path.join(__dirname, "preload.js") },
    });
  const appOrigin = new URL(windowUrl()).origin;

  /* target=_blank / window.open 全部拒绝创建 Electron 子窗口；HTTP(S) 外链交给系统浏览器 */
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url, windowUrl()).origin === appOrigin) return { action: "deny" };
    } catch {
      return { action: "deny" };
    }
    void openExternalUrl(url);
    return { action: "deny" };
  });

  /* 兜住不带 target 的外链 <a>：应用内同源导航保留，其它导航不允许替换主窗口 */
  win.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url, windowUrl()).origin === appOrigin) return;
    } catch {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    void openExternalUrl(url);
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    log(`渲染进程异常退出: ${details.reason}`);
  });
  win.webContents.on("did-finish-load", () => log(`窗口加载完成: ${windowUrl()}`));

  await win.loadURL(windowUrl());
}

/** 固定端口上已有可握手的 Tassello UI/API 时复用，便于开发与 CI。 */
async function serversAlreadyRunning(): Promise<boolean> {
  try {
    await probeWeb(2_000);
    return true;
  } catch {
    return false;
  }
}

/* macOS 应用菜单中文化（Windows/Linux 同样生效，保持一致） */
function setupMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "九漾 Onda",
      submenu: [
        { role: "about", label: "关于 九漾 Onda" },
        { type: "separator" },
        { role: "hide", label: "隐藏 九漾 Onda" },
        { role: "hideOthers", label: "隐藏其他" },
        { role: "unhide", label: "全部显示" },
        { type: "separator" },
        { role: "quit", label: "退出 九漾 Onda" },
      ],
    },
    {
      label: "文件",
      submenu:
        process.platform === "darwin"
          ? [{ role: "close", label: "关闭窗口" }]
          : [
              { role: "close", label: "关闭窗口", accelerator: "CmdOrCtrl+W" },
              { type: "separator" },
              { role: "quit", label: "退出", accelerator: "CmdOrCtrl+Q" },
            ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "重新加载" },
        { role: "forceReload", label: "强制重新加载" },
        { role: "toggleDevTools", label: "切换开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "进入全屏" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放" },
        { type: "separator" },
        { role: "front", label: "前置全部窗口" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

process.on("uncaughtException", (err) => {
  log(`主进程未捕获异常: ${err.stack ?? err.message}`);
  failToStart(`发生内部错误：${err.message}`);
});
process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  log(`主进程未处理的 Promise 拒绝: ${message}`);
});

/* 单实例锁：双击多开时第二个实例直接退出、由第一个实例把窗口带回前台，
 * 不再出现多实例争抢端口 4311 的连环失败（v0.1.1 用户反馈的表象问题） */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    } else {
      void createWindow();
    }
  });

  app.whenReady().then(async () => {
    openLogFile();
    if (process.platform === "darwin") app.dock?.setIcon(APP_ICON);
    app.setAboutPanelOptions({
      applicationName: "九漾 Onda",
      iconPath: APP_ICON,
    });
    log(
      `启动 ${app.isPackaged ? "packaged" : "dev"} 模式, web=${WEB_DIR}, ` +
      `apiPort=${FIXED_API_PORT === 0 ? "(动态)" : FIXED_API_PORT}, ` +
      `webPort=${FIXED_WEB_PORT === 0 ? "(动态)" : FIXED_WEB_PORT}`,
    );
    setupMenu();
    await registerNativeHost();
    if (process.env.TASSELLO_WEB_URL) {
      log(`复用外部启动的 API/Web：${process.env.TASSELLO_WEB_URL}`);
      await createWindow();
      return;
    }
    /* 两个端口都固定时才探测复用；动态端口每次都是新端口，无可复用对象。 */
    if (FIXED_API_PORT !== 0 && FIXED_WEB_PORT !== 0 && (await serversAlreadyRunning())) {
      log(`复用已运行的 UI/API at ${webUrlBase()}`);
    } else {
      let attempts = 0;
      while (true) {
        if (FIXED_API_PORT === 0) {
          activeApiPort = await allocateEphemeralPort();
          log(`API 已分配动态端口: ${activeApiPort}`);
        }
        if (FIXED_WEB_PORT === 0) {
          activeWebPort = await allocateEphemeralPort();
          log(`Web 已分配动态端口: ${activeWebPort}`);
        }
        try {
          if (app.isPackaged && !existsSync(PACKAGED_API_BINARY)) {
            throw new Error(`安装包缺少 API 二进制：${PACKAGED_API_BINARY}`);
          }
          startApiServer();
          await waitFor(() => probeApi(2_000), "api");
          startWebServer();
          await waitFor(() => probeWeb(2_000), "web");
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          webServer?.kill();
          apiServer?.kill();
          webServer = null;
          apiServer = null;
          /* 动态端口存在极小的"释放后被抢占"窗口：换端口重开；固定端口不重试。 */
          if ((FIXED_API_PORT === 0 || FIXED_WEB_PORT === 0) && ++attempts < 3) {
            log(`本机服务启动失败，换端口重试（第 ${attempts}/3 次）: ${msg}`);
            continue;
          }
          failToStart(msg);
          return;
        }
      }
    }
    try {
      await createWindow();
      log("窗口创建成功");
    } catch (e) {
      failToStart(`窗口创建失败：${e instanceof Error ? e.message : String(e)}`);
    }
  });
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  webServer?.kill();
  apiServer?.kill();
  webServer = null;
  apiServer = null;
  if (logFd !== null) {
    closeSync(logFd);
    logFd = null;
  }
});
