/* Electron 主进程：拉起 Next.js server（网页模式同一套），就绪后开窗加载 */
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";

// __dirname = apps/desktop/dist → 仓库根在三层之上
const ROOT = path.resolve(__dirname, "..", "..", "..");
const WEB_DIR = path.join(ROOT, "apps", "web");
const PORT = Number(process.env.TASSELLO_PORT ?? 4311);
const URL_BASE = `http://127.0.0.1:${PORT}`;
/* 页面必须走 localhost：Next dev 的 allowedDevOrigins 默认只信任 localhost，
 * 用 127.0.0.1 加载会让 dev 资源/HMR 被降级，React 不水合，页面全是“死”按钮 */
const WINDOW_URL = `http://localhost:${PORT}`;

let server: ChildProcess | null = null;

/* dev 模式下菜单栏应用名取自 app.name（而非 Electron 二进制的 Info.plist），需显式设置 */
app.setName("九漾 Onda");

function startServer(): void {
  const bin = process.env.TASSELLO_BUN ?? "bun";
  server = spawn(bin, ["run", "dev", "--", "-p", String(PORT)], {
    cwd: WEB_DIR,
    stdio: "inherit",
    env: { ...process.env, TASSELLO_DESKTOP: "1" },
  });
  server.on("exit", (code) => {
    console.log(`[tassello] web server exited (${code})`);
  });
}

function waitForServer(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${URL_BASE}/api/platforms`, (res) => {
        res.resume();
        if ((res.statusCode ?? 500) < 500) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return reject(new Error("web server not ready in time"));
      setTimeout(tick, 600);
    };
    tick();
  });
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
  await win.loadURL(WINDOW_URL);
}

/** 4311 已有 web server（如 bun run dev 的 dev.ts 已拉起）则直接复用，不再 spawn */
async function serverAlreadyRunning(): Promise<boolean> {
  try {
    await waitForServer(2_000);
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
        { role: "copy", label: "拷贝" },
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

app.whenReady().then(async () => {
  setupMenu();
  if (await serverAlreadyRunning()) {
    console.log(`[tassello] reuse running web server at ${URL_BASE}`);
  } else {
    startServer();
    try {
      await waitForServer();
    } catch (e) {
      console.error(e);
      app.quit();
      return;
    }
  }
  await createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  server?.kill("SIGTERM");
});
