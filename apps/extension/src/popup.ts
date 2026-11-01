import type { PlatformDTO } from "@tassello/shared";
import { platformAccountStatus } from "./account-status.ts";
import type { BackgroundState, StoredConnection } from "./protocol.ts";

const status = document.getElementById("status")!;
const card = document.getElementById("state-card")!;
const title = document.getElementById("state-title")!;
const detail = document.getElementById("state-detail")!;
const taskCard = document.getElementById("task-card")!;
const accountsCard = document.getElementById("accounts-card")!;
const accountsList = document.getElementById("accounts-list")!;
const checkAccounts = document.getElementById("check-accounts") as HTMLButtonElement;
const accountResult = document.getElementById("account-result")!;
const openApp = document.getElementById("open-app") as HTMLButtonElement;
const retry = document.getElementById("retry") as HTMLButtonElement;
let connection: StoredConnection | null = null;
let platforms: PlatformDTO[] = [];
let checkingAccounts = false;

async function queryState(): Promise<BackgroundState> {
  return await chrome.runtime.sendMessage({ type: "tassello.state" }) as BackgroundState;
}

function renderAccounts(): void {
  accountsList.replaceChildren();
  const visible = platforms.filter((platform) =>
    platform.status === "active" && platform.authMode === "extension"
  );
  if (!visible.length) {
    const empty = document.createElement("span");
    empty.className = "accounts-empty";
    empty.textContent = connection ? "暂无可检查的平台账号" : "请先连接本机应用";
    accountsList.append(empty);
    return;
  }
  for (const platform of visible) {
    const state = platformAccountStatus(platform.sync.phase, checkingAccounts);
    const row = document.createElement("div");
    row.className = `account-row ${state.tone === "ok" ? "" : state.tone}`.trim();

    const glyph = document.createElement("span");
    glyph.className = "account-glyph";
    glyph.style.background = platform.color;
    glyph.style.color = platform.fg ?? "#fff";
    glyph.textContent = platform.char;

    const copy = document.createElement("span");
    copy.className = "account-copy";
    const name = document.createElement("b");
    name.textContent = platform.name;
    const account = document.createElement("span");
    account.textContent = platform.account?.name
      ?? platform.sync.reason
      ?? (state.tone === "ok" ? "账号已连接" : "账号信息未获取");
    copy.append(name, account);

    const status = document.createElement("span");
    status.className = "account-state";
    status.textContent = state.label;
    row.append(glyph, copy, status);
    accountsList.append(row);
  }
}

function render(state: BackgroundState): void {
  connection = state.connection as StoredConnection | null;
  const mode = state.connected
    ? "ok"
    : state.connecting
      ? "wait"
      : state.error
        ? "bad"
        : "wait";
  status.className = `status ${mode}`;
  status.textContent = mode === "ok" ? "已连接" : mode === "bad" ? "连接失败" : "连接中";
  card.className = `state-card ${mode}`;

  if (mode === "ok") {
    title.textContent = "浏览器扩展已连接";
    detail.textContent = `${connection?.browserLabel ?? "当前浏览器"} · 已由本机宿主验证`;
  } else if (mode === "bad") {
    title.textContent = "无法连接本机应用";
    detail.textContent = state.error || "请打开 Onda 后重新检查连接。";
  } else {
    title.textContent = "正在连接本机应用";
    detail.textContent = state.error || "正在查找当前 Onda 实例。";
  }

  taskCard.hidden = mode !== "ok";
  accountsCard.hidden = mode !== "ok";
  if (mode !== "ok") accountResult.hidden = true;
  openApp.textContent = mode === "ok" ? "打开发布队列" : "打开 Onda";
  retry.hidden = mode === "ok";
  renderAccounts();
}

async function loadPlatforms(): Promise<void> {
  if (!connection || !connection.apiOrigin) {
    platforms = [];
    renderAccounts();
    return;
  }
  const response = await fetch(`${connection.apiOrigin.replace(/\/+$/, "")}/api/v1/platforms`, {
    cache: "no-store",
  });
  const payload = await response.json() as { ok: boolean; data?: PlatformDTO[] };
  platforms = payload.ok && Array.isArray(payload.data) ? payload.data : [];
  renderAccounts();
}

async function refresh(): Promise<void> {
  try {
    const state = await queryState();
    render(state);
    if (state.connected && state.connection && !checkingAccounts) await loadPlatforms();
  } catch (error) {
    render({
      connected: false,
      connecting: false,
      error: error instanceof Error ? error.message : String(error),
      connection: null,
      capability: null,
    });
  }
}

async function verifyPlatforms(): Promise<void> {
  if (!connection || !connection.apiOrigin || checkingAccounts) return;
  const targets = platforms.filter((platform) =>
    platform.status === "active" && platform.authMode === "extension"
  );
  if (!targets.length) return;
  checkingAccounts = true;
  checkAccounts.disabled = true;
  checkAccounts.textContent = "检查中…";
  accountResult.hidden = true;
  renderAccounts();
  let failed = 0;
  try {
    for (const platform of targets) {
      try {
        const response = await fetch(
          `${connection.apiOrigin.replace(/\/+$/, "")}/api/v1/accounts/${encodeURIComponent(platform.id)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "verify" }),
          },
        );
        if (!response.ok) failed += 1;
      } catch {
        failed += 1;
      }
      await loadPlatforms().catch(() => undefined);
    }
    await loadPlatforms().catch(() => undefined);
    accountResult.hidden = false;
    accountResult.className = `account-result ${failed ? "failed" : "done"}`;
    accountResult.textContent = failed
      ? `${failed} 个平台需要重新登录或稍后再试。`
      : `${targets.length} 个平台账号已重新检查。`;
  } finally {
    checkingAccounts = false;
    checkAccounts.disabled = false;
    checkAccounts.textContent = "重新检查";
    renderAccounts();
  }
}

openApp.addEventListener("click", async () => {
  const path = openApp.textContent === "打开发布队列" ? "/library/article" : "/library/article?settings=1";
  const result = await chrome.runtime.sendMessage({ type: "tassello.open-app", path }) as {
    ok?: boolean;
    error?: string;
  };
  if (!result?.ok) {
    status.className = "status bad";
    status.textContent = "打开失败";
    card.className = "state-card bad";
    title.textContent = "无法打开 Web 界面";
    detail.textContent = result?.error ?? "本机服务没有返回 Web 界面地址";
    return;
  }
  window.close();
});

retry.addEventListener("click", async () => {
  retry.disabled = true;
  await chrome.runtime.sendMessage({ type: "tassello.reconnect" });
  window.setTimeout(() => {
    retry.disabled = false;
    void refresh();
  }, 700);
});

checkAccounts.addEventListener("click", () => void verifyPlatforms());

void refresh();
window.setInterval(() => void refresh(), 1500);
