import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export type ExtensionBrowser = "chrome" | "edge";

const STORE_URLS: Record<ExtensionBrowser, string> = {
  chrome: process.env.ONDA_CHROME_STORE_URL ?? "https://chromewebstore.google.com/",
  edge: process.env.ONDA_EDGE_STORE_URL ?? "https://microsoftedge.microsoft.com/addons/Microsoft-Edge-Extensions-Home",
};

export function extensionStoreUrl(browser: ExtensionBrowser): string {
  return STORE_URLS[browser];
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`浏览器启动失败（退出码 ${code ?? "unknown"}）`));
    });
  });
}

function launchDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function windowsBrowserPath(browser: ExtensionBrowser): Promise<string> {
  const local = process.env.LOCALAPPDATA ?? "";
  const programFiles = process.env.PROGRAMFILES ?? "";
  const candidates = browser === "chrome"
    ? [
        path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      ]
    : [
        path.join(local, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next known installation path.
    }
  }
  throw new Error(browser === "chrome" ? "未找到 Google Chrome" : "未找到 Microsoft Edge");
}

/** 在本机已安装的目标浏览器中打开扩展安装入口。 */
export async function openExtensionInstall(browser: ExtensionBrowser): Promise<void> {
  const url = extensionStoreUrl(browser);
  if (process.platform === "darwin") {
    await run("/usr/bin/open", ["-a", browser === "chrome" ? "Google Chrome" : "Microsoft Edge", url]);
    return;
  }
  if (process.platform === "win32") {
    await launchDetached(await windowsBrowserPath(browser), [url]);
    return;
  }
  await launchDetached(browser === "chrome" ? "google-chrome" : "microsoft-edge", [url]);
}
