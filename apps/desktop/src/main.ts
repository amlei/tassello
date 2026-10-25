/* Electron 主进程：拉起 Next.js server（网页模式同一套），就绪后开窗加载。
 * 失败可见性铁律：server 起不来时必须弹窗告知用户并留下日志，
 * 不允许 v0.1.0 那种"干等 60 秒静默退出"的行为。 */
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { appendFileSync, closeSync, existsSync, openSync, writeSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, Menu, ipcMain, shell, type MenuItemConstructorOptions } from "electron";

// 开发时 __dirname = apps/desktop/dist → 仓库根在三层之上；打包时定位 resources/web。
const ROOT = path.resolve(__dirname, "..", "..", "..");
const DEV_WEB_DIR = path.join(ROOT, "apps", "web");
const PACKAGED_WEB_CANDIDATES: string[] = [
  path.join(process.resourcesPath ?? "", "web", "apps", "web"),
  path.join(process.resourcesPath ?? "", "web"),
];
const WEB_DIR: string = app.isPackaged
  ? PACKAGED_WEB_CANDIDATES.find((candidate) => existsSync(path.join(candidate, "server.js"))) ?? PACKAGED_WEB_CANDIDATES[0]!
  : DEV_WEB_DIR;
const PORT = Number(process.env.TASSELLO_PORT ?? 4311);
const URL_BASE = `http://127.0.0.1:${PORT}`;
/* 页面必须走 localhost：Next dev 的 allowedDevOrigins 默认只信任 localhost，
 * 用 127.0.0.1 加载会让 dev 资源/HMR 被降级，React 不水合，页面全是"死"按钮 */
const WINDOW_URL = `http://localhost:${PORT}/library/article`;

let server: ChildProcess | null = null;
let logFd: number | null = null;

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

function startServer(): void {
  if (app.isPackaged) {
    /* Electron 二进制以 ELECTRON_RUN_AS_NODE=1 复用为 Node runtime，用户无需安装 Bun/Node。 */
    const entry = path.join(WEB_DIR, "server.js");
    server = spawn(process.execPath, [entry], {
      cwd: WEB_DIR,
      // 打包后没有终端可看，stdout/stderr 必须落日志；dev 模式保留 inherit 方便调试
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
        HOSTNAME: "127.0.0.1",
        PORT: String(PORT),
        TASSELLO_DESKTOP: "1",
      },
    });
  } else {
    const bin = process.env.TASSELLO_BUN ?? "bun";
    server = spawn(bin, ["run", "dev", "--", "-p", String(PORT)], {
      cwd: WEB_DIR,
      stdio: "inherit",
      env: { ...process.env, TASSELLO_DESKTOP: "1" },
    });
  }
  server.stdout?.on("data", (chunk: Buffer) => log(`[web] ${chunk.toString().trimEnd()}`));
  server.stderr?.on("data", (chunk: Buffer) => log(`[web] ${chunk.toString().trimEnd()}`));
  server.on("exit", (code, signal) => {
    log(`web server 退出 code=${code} signal=${signal ?? ""}`);
    server = null;
  });
}

/** 健康检查带握手：必须返回 {ok:true,data:[..]}，防止 4311 被无关服务占用时误复用 */
function probeServer(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${URL_BASE}/api/platforms`, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (d: Buffer) => chunks.push(d));
      res.on("end", () => {
        res.resume();
        if ((res.statusCode ?? 500) >= 500) return reject(new Error(`HTTP ${res.statusCode}`));
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { ok?: unknown; data?: unknown };
          if (json.ok !== true || !Array.isArray(json.data)) {
            return reject(new Error("端口 4311 上不是 Tassello 服务（握手不匹配）"));
          }
          resolve();
        } catch {
          reject(new Error("端口 4311 上不是 Tassello 服务（响应非 JSON）"));
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

function waitForServer(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (server && server.exitCode === null && server.signalCode === null) {
        server.off("exit", onExit);
      }
      if (err) reject(err);
      else resolve();
    };
    const tick = () => {
      if (settled) return;
      probeServer(2000)
        .then(() => done())
        .catch(() => {
          if (settled) return;
          if (Date.now() - start > timeoutMs) {
            done(new Error(`web server 在 ${timeoutMs / 1000}s 内未就绪`));
            return;
          }
          setTimeout(tick, 600);
        });
    };
    /* server 子进程崩了就不必干等到超时，立即失败 */
    const onExit = (code: number | null) => {
      done(new Error(`web server 进程提前退出（code=${code}）`));
    };
    if (server) server.once("exit", onExit);
    tick();
  });
}

/** 启动失败的统一出口：弹窗 + 日志路径，然后退出 */
function failToStart(reason: string): void {
  log(`启动失败: ${reason}`);
  const detail = [
    reason,
    "",
    `详细日志: ${logPath()}`,
    "",
    "常见原因：安装包损坏（请重新下载）、端口 4311 被其他程序占用、安全软件拦截。",
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
      icon: path.join(__dirname, "..", "icon.png"),
      webPreferences: { preload: path.join(__dirname, "preload.js") },
    });
  const appOrigin = new URL(WINDOW_URL).origin;

  /* target=_blank / window.open 全部拒绝创建 Electron 子窗口；HTTP(S) 外链交给系统浏览器 */
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url, WINDOW_URL).origin === appOrigin) return { action: "deny" };
    } catch {
      return { action: "deny" };
    }
    void openExternalUrl(url);
    return { action: "deny" };
  });

  /* 兜住不带 target 的外链 <a>：应用内同源导航保留，其它导航不允许替换主窗口 */
  win.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url, WINDOW_URL).origin === appOrigin) return;
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
  win.webContents.on("did-finish-load", () => log(`窗口加载完成: ${WINDOW_URL}`));

  await win.loadURL(WINDOW_URL);
}

/** 4311 已有可握手的 Tassello web server（如 bun run dev 的 dev.ts 已拉起）则直接复用 */
async function serverAlreadyRunning(): Promise<boolean> {
  try {
    await probeServer(2_000);
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

app.whenReady().then(async () => {
  openLogFile();
  log(`启动 ${app.isPackaged ? "packaged" : "dev"} 模式, web=${WEB_DIR}, port=${PORT}`);
  setupMenu();
  if (await serverAlreadyRunning()) {
    log(`复用已运行的 web server at ${URL_BASE}`);
  } else {
    startServer();
    try {
      await waitForServer();
    } catch (e) {
      failToStart(e instanceof Error ? e.message : String(e));
      return;
    }
  }
  try {
    await createWindow();
    log("窗口创建成功");
  } catch (e) {
    failToStart(`窗口创建失败：${e instanceof Error ? e.message : String(e)}`);
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  server?.kill();
  if (logFd !== null) {
    closeSync(logFd);
    logFd = null;
  }
});
