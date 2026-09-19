/* Electron 主进程：拉起 Next.js server（网页模式同一套），就绪后开窗加载 */
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { app, BrowserWindow } from "electron";

// __dirname = apps/desktop/dist → 仓库根在三层之上
const ROOT = path.resolve(__dirname, "..", "..", "..");
const WEB_DIR = path.join(ROOT, "apps", "web");
const PORT = Number(process.env.TASSELLO_PORT ?? 4311);
const URL_BASE = `http://127.0.0.1:${PORT}`;

let server: ChildProcess | null = null;

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
      title: "九漾 Onda · content workbench",
      backgroundColor: "#F4F1E8",
    });
  await win.loadURL(URL_BASE);
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer();
    await createWindow();
  } catch (e) {
    console.error(e);
    app.quit();
  }
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
