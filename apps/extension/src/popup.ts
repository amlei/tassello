import type { BackgroundState, StoredConnection } from "./protocol.ts";

const status = document.getElementById("status")!;
const card = document.getElementById("state-card")!;
const title = document.getElementById("state-title")!;
const detail = document.getElementById("state-detail")!;
const taskCard = document.getElementById("task-card")!;
const openApp = document.getElementById("open-app") as HTMLButtonElement;
const retry = document.getElementById("retry") as HTMLButtonElement;

async function queryState(): Promise<BackgroundState> {
  return await chrome.runtime.sendMessage({ type: "tassello.state" }) as BackgroundState;
}

function render(state: BackgroundState): void {
  const connection = state.connection as StoredConnection | null;
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
  openApp.textContent = mode === "ok" ? "打开发布队列" : "打开 Onda";
  retry.hidden = mode === "ok";
}

async function refresh(): Promise<void> {
  try {
    render(await queryState());
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

openApp.addEventListener("click", async () => {
  const path = openApp.textContent === "打开发布队列" ? "/library/article" : "/library/article?settings=1";
  await chrome.runtime.sendMessage({ type: "tassello.open-app", path });
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

void refresh();
window.setInterval(() => void refresh(), 1500);
