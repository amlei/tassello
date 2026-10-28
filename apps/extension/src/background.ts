import {
  NATIVE_HOST_NAME,
  type ExtensionAccountRequest,
  type ExtensionAccountResult,
  type ExtensionJob,
  type ExtensionJobEvent,
  type ExtensionJobResult,
  type ExtensionLoginOpened,
} from "@tassello/shared";
import { accountResult, openPlatformLogin, verifyPlatformAccount } from "./accounts.ts";
import { runDriver } from "./drivers.ts";
import { closeTab, focusTab } from "./page-runtime.ts";
import { PublishRuntime } from "./publish-runtime.ts";
import type { BackgroundState, ClientMessage, ServerMessage, StoredConnection } from "./protocol.ts";

const STORAGE_KEY = "tassello.connection";
const RECONNECT_ALARM = "tassello.reconnect";
const HEARTBEAT_ALARM = "tassello.heartbeat";
const JOB_QUEUE_KEY = "tassello.jobQueue";
const JOB_ACTIVE_KEY = "tassello.activeJob";
const JOB_RESULTS_KEY = "tassello.jobResults";
const JOB_ACKED_KEY = "tassello.ackedJobResults";

let socket: WebSocket | null = null;
let connectPromise: Promise<void> | null = null;
let connectionInfo: StoredConnection | null = null;
let jobQueue: ExtensionJob[] = [];
let activeJob: ExtensionJob | null = null;
let jobPumpRunning = false;
let activeJobRunning = false;
let activeTabs = new Set<number>();
let activeJobCancelled = false;
let jobKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
let jobResults = new Map<string, ExtensionJobResult>();
let ackedResults = new Set<string>();
const accountResults = new Map<string, ExtensionAccountResult | ExtensionLoginOpened>();
const accountInflight = new Map<string, Promise<void>>();
let state: BackgroundState = {
  connected: false,
  connecting: false,
  error: null,
  connection: null,
  capability: null,
};

function browserLabel(): string {
  const userAgent = navigator.userAgent;
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  return "Browser";
}

async function getConnection(): Promise<StoredConnection | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as StoredConnection | undefined) ?? null;
}

async function hydrateJobs(): Promise<void> {
  const stored = await chrome.storage.local.get([JOB_QUEUE_KEY, JOB_ACTIVE_KEY, JOB_RESULTS_KEY, JOB_ACKED_KEY]);
  jobQueue = Array.isArray(stored[JOB_QUEUE_KEY]) ? stored[JOB_QUEUE_KEY] as ExtensionJob[] : [];
  activeJob = stored[JOB_ACTIVE_KEY] && typeof stored[JOB_ACTIVE_KEY] === "object"
    ? stored[JOB_ACTIVE_KEY] as ExtensionJob
    : null;
  const results = Array.isArray(stored[JOB_RESULTS_KEY]) ? stored[JOB_RESULTS_KEY] as ExtensionJobResult[] : [];
  jobResults = new Map(results.map((result) => [result.jobId, result]));
  ackedResults = new Set(Array.isArray(stored[JOB_ACKED_KEY]) ? stored[JOB_ACKED_KEY] as string[] : []);
}

async function persistJobState(): Promise<void> {
  await Promise.all([
    chrome.storage.local.set({ [JOB_QUEUE_KEY]: jobQueue }),
    chrome.storage.local.set({ [JOB_ACTIVE_KEY]: activeJob }),
    chrome.storage.local.set({ [JOB_RESULTS_KEY]: [...jobResults.values()].slice(-50) }),
    chrome.storage.local.set({ [JOB_ACKED_KEY]: [...ackedResults].slice(-100) }),
  ]);
}

async function setState(patch: Partial<BackgroundState>): Promise<void> {
  state = { ...state, ...patch };
  await chrome.storage.session.set({ "tassello.state": state });
}

type NativeDiscovery = {
  ok: boolean;
  error?: string;
  apiOrigin?: string;
  runtimeId?: string;
  installationId?: string;
  nativeHostVersion?: number;
};

function discoverRuntime(): Promise<NativeDiscovery> {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, { type: "discover" }, (response: unknown) => {
      const error = chrome.runtime.lastError;
      if (error) {
        const detail = error.message ?? "";
        const message = /native messaging host not found/i.test(detail)
          ? "未找到 Onda 本机组件，请重新安装应用"
          : detail || "无法启动 Onda 本机组件";
        resolve({ ok: false, error: message });
        return;
      }
      resolve(response && typeof response === "object" ? response as NativeDiscovery : {
        ok: false,
        error: "本机连接组件没有返回运行信息",
      });
    });
  });
}

async function autoPair(discoveryInput?: NativeDiscovery): Promise<StoredConnection> {
  await setState({ connecting: true, error: null });
  const discovery = discoveryInput ?? await discoverRuntime();
  if (!discovery.ok || !discovery.apiOrigin) {
    throw new Error(discovery.error ?? "本机 Onda 未运行");
  }
  if (discovery.nativeHostVersion !== 1) {
    throw new Error("本机连接组件版本不兼容");
  }
  const normalized = discovery.apiOrigin.replace(/\/+$/, "");
  const existing = await getConnection();
  const response = await fetch(`${normalized}/api/v1/extensions/auto-pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: existing?.clientId ?? crypto.randomUUID(),
      extensionId: chrome.runtime.id,
      browserLabel: browserLabel(),
      userAgent: navigator.userAgent,
      version: chrome.runtime.getManifest().version,
      runtimeId: discovery.runtimeId,
    }),
  });
  const payload = await response.json() as {
    ok: boolean;
    error?: string;
    data?: { token: string; extension: { clientId: string; installationId: string } };
  };
  if (!payload.ok || !payload.data) throw new Error(payload.error ?? "自动连接失败");
  const connection: StoredConnection = {
    apiOrigin: normalized,
    clientId: payload.data.extension.clientId,
    token: payload.data.token,
    browserLabel: browserLabel(),
    installationId: payload.data.extension.installationId,
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: connection });
  await setState({ connection, error: null });
  return connection;
}

async function resolveConnection(): Promise<StoredConnection> {
  const stored = await getConnection();
  const discovery = await discoverRuntime();
  if (!stored) {
    if (!discovery.ok) throw new Error(discovery.error ?? "本机 Onda 未运行");
    return autoPair(discovery);
  }
  if (discovery.ok && discovery.apiOrigin && discovery.installationId) {
    if (stored.installationId !== discovery.installationId) {
      await chrome.storage.local.remove(STORAGE_KEY);
      return autoPair(discovery);
    }
    const normalized = discovery.apiOrigin.replace(/\/+$/, "");
    if (normalized !== stored.apiOrigin) {
      const updated = { ...stored, apiOrigin: normalized };
      await chrome.storage.local.set({ [STORAGE_KEY]: updated });
      return updated;
    }
  }
  return stored;
}

async function connectOnce(): Promise<void> {
  let connection: StoredConnection;
  try {
    connection = await resolveConnection();
  } catch (error) {
    await setState({
      connected: false,
      connecting: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  await setState({ connecting: true, error: null, connection });
  connectionInfo = connection;
  const wsUrl = connection.apiOrigin.replace(/^http/, "ws") + "/ws/extension";
  const currentSocket = new WebSocket(wsUrl);
  socket = currentSocket;
  currentSocket.addEventListener("open", () => {
    if (socket !== currentSocket) return;
    currentSocket.send(JSON.stringify({
      type: "hello",
      clientId: connection.clientId,
      token: connection.token,
      extVersion: chrome.runtime.getManifest().version,
      accountProtocolVersion: 1,
      activeJobId: activeJob?.jobId ?? null,
    }));
    if (activeJob && !activeJobRunning) {
      const stale = activeJob;
      activeJob = null;
      jobResults.set(stale.jobId, {
        type: "job.result",
        jobId: stale.jobId,
        result: {
          status: "unknown",
          error: "浏览器扩展在任务执行中断，平台结果无法确认",
        },
      });
    }
    for (const result of jobResults.values()) {
      if (!ackedResults.has(result.jobId)) send(result);
    }
    void persistJobState();
    void pumpJobs();
  });
  currentSocket.addEventListener("message", (event) => {
    if (socket === currentSocket) void handleMessage(String(event.data), currentSocket);
  });
  currentSocket.addEventListener("close", () => {
    if (socket !== currentSocket) return;
    socket = null;
    connectionInfo = null;
    void setState({ connected: false, connecting: false, capability: null });
  });
  currentSocket.addEventListener("error", () => {
    if (socket !== currentSocket) return;
    void setState({ connected: false, connecting: false, error: "无法连接本机发布服务" });
  });
}

async function connect(): Promise<void> {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  if (connectPromise) return connectPromise;
  const attempt = connectOnce().finally(() => {
    if (connectPromise === attempt) connectPromise = null;
  });
  connectPromise = attempt;
  return attempt;
}

async function handleMessage(raw: string, sourceSocket: WebSocket): Promise<void> {
  let message: ServerMessage;
  try {
    message = JSON.parse(raw) as ServerMessage;
  } catch {
    return;
  }
  if (message.type === "ready") {
    await setState({ connected: true, connecting: false, error: null });
    return;
  }
  if (message.type === "ping") {
    if (sourceSocket.readyState === WebSocket.OPEN) sourceSocket.send(JSON.stringify({ type: "ping" }));
    return;
  }
  if (message.type === "job.result.ack") {
    ackedResults.add(message.jobId);
    await persistJobState();
    return;
  }
  if (message.type === "job.dispatch") {
    void enqueueJob(message.job);
    return;
  }
  if (message.type === "job.cancel") {
    await cancelJob(message.jobId);
    return;
  }
  if (message.type === "job.focusTab") {
    await focusTab(message.tabId);
    return;
  }
  if (message.type === "job.closeTab") {
    activeTabs.delete(message.tabId);
    await closeTab(message.tabId);
    return;
  }
  if (message.type === "account.verify" || message.type === "account.open-login") {
    void executeAccountRequest(message);
    return;
  }
  if (message.type === "error") {
    await setState({ error: message.error, connecting: false, connected: false });
    if (/凭据无效|已撤销/.test(message.error)) {
      await chrome.storage.local.remove(STORAGE_KEY);
      if (socket === sourceSocket) socket = null;
      sourceSocket.close();
      void connect();
    }
  }
}

async function openApp(pathname: string): Promise<void> {
  const connection = await getConnection();
  const discovery = await discoverRuntime();
  const origin = discovery.ok ? discovery.apiOrigin : connection?.apiOrigin;
  if (!origin) throw new Error(discovery.error ?? "本机 Onda 未运行");
  await chrome.tabs.create({ url: `${origin.replace(/\/+$/, "")}${pathname}` });
}

function send(message: ClientMessage): boolean {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}

async function deliverResult(result: ExtensionJobResult): Promise<void> {
  jobResults.set(result.jobId, result);
  while (jobResults.size > 50) {
    const first = jobResults.keys().next().value;
    if (typeof first !== "string") break;
    jobResults.delete(first);
    ackedResults.delete(first);
  }
  await persistJobState();
  send(result);
}

async function executeAccountRequest(request: ExtensionAccountRequest): Promise<void> {
  const previous = accountResults.get(request.requestId);
  if (previous) {
    send(previous);
    return;
  }
  if (accountInflight.has(request.requestId)) return;
  const task = (async () => {
    let result: ExtensionAccountResult | ExtensionLoginOpened;
    if (request.type === "account.open-login") {
      try {
        result = await openPlatformLogin(request.platformId, request.requestId);
      } catch (error) {
        result = {
          type: "account.login-opened",
          requestId: request.requestId,
          platformId: request.platformId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    } else {
      try {
        result = accountResult(
          request.requestId,
          request.platformId,
          await verifyPlatformAccount(request.platformId),
        );
      } catch (error) {
        result = {
          type: "account.result",
          requestId: request.requestId,
          platformId: request.platformId,
          state: "failed",
          error: error instanceof Error ? error.message : String(error),
          profile: null,
        };
      }
    }
    accountResults.set(request.requestId, result);
    while (accountResults.size > 50) {
      const first = accountResults.keys().next().value;
      if (typeof first !== "string") break;
      accountResults.delete(first);
    }
    send(result);
  })();
  accountInflight.set(request.requestId, task);
  void task.finally(() => accountInflight.delete(request.requestId)).catch(() => undefined);
  await task;
}

async function enqueueJob(job: ExtensionJob): Promise<void> {
  const previous = jobResults.get(job.jobId);
  if (previous) {
    send(previous);
    return;
  }
  if (activeJob?.jobId === job.jobId || jobQueue.some((item) => item.jobId === job.jobId)) return;
  jobQueue.push(job);
  await persistJobState();
  await pumpJobs();
}

async function pumpJobs(): Promise<void> {
  if (jobPumpRunning) return;
  jobPumpRunning = true;
  startJobKeepAlive();
  try {
    while (jobQueue.length > 0) {
      const job = jobQueue.shift()!;
      activeJob = job;
      activeJobRunning = true;
      activeJobCancelled = false;
      activeTabs = new Set();
      await persistJobState();
      await executeJob(job);
      activeJob = null;
      activeJobRunning = false;
      await persistJobState();
    }
  } finally {
    stopJobKeepAlive();
    jobPumpRunning = false;
  }
}

function startJobKeepAlive(): void {
  if (jobKeepAliveTimer) return;
  jobKeepAliveTimer = setInterval(() => {
    void chrome.runtime.getPlatformInfo().catch(() => undefined);
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "ping" }));
    }
  }, 20_000);
}

function stopJobKeepAlive(): void {
  if (!jobKeepAliveTimer) return;
  clearInterval(jobKeepAliveTimer);
  jobKeepAliveTimer = null;
}

async function cancelJob(jobId: string): Promise<void> {
  const index = jobQueue.findIndex((job) => job.jobId === jobId);
  if (index >= 0) {
    jobQueue.splice(index, 1);
    const result: ExtensionJobResult = {
      type: "job.result",
      jobId,
      result: { status: "cancelled", error: null },
    };
    await deliverResult(result);
    return;
  }
  if (activeJob?.jobId === jobId) {
    activeJobCancelled = true;
    await Promise.all([...activeTabs].map((tabId) => closeTab(tabId)));
  }
}

async function executeJob(job: ExtensionJob): Promise<void> {
  let finalResult: ExtensionJobResult["result"];
  try {
    if (!connectionInfo) throw new Error("浏览器扩展未连接本机 Onda");
    const runtime = new PublishRuntime(job, connectionInfo.apiOrigin, (progress) => {
      if (progress.tabId) activeTabs.add(progress.tabId);
      send({
        type: "job.event",
        jobId: job.jobId,
        event: progress,
      });
    });
    finalResult = await runDriver(runtime);
    if (activeJobCancelled) {
      finalResult = { status: "cancelled", error: null, pageUrl: finalResult.pageUrl ?? null };
    }
    if (finalResult.status === "cancelled") {
      await Promise.all([...activeTabs].map((tabId) => closeTab(tabId)));
      activeTabs.clear();
    }
  } catch (error) {
    finalResult = activeJobCancelled
      ? { status: "cancelled", error: null }
      : {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
  }
  const result: ExtensionJobResult = {
    type: "job.result",
    jobId: job.jobId,
    result: finalResult,
  };
  await deliverResult(result);
}

async function heartbeat(): Promise<void> {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "ping" }));
  } else {
    await connect();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(RECONNECT_ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.5 });
  void hydrateJobs().then(connect);
});

chrome.runtime.onStartup.addListener(() => {
  void hydrateJobs().then(connect);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RECONNECT_ALARM) void connect();
  if (alarm.name === HEARTBEAT_ALARM) void heartbeat();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "tassello.reconnect") {
    if (socket?.readyState === WebSocket.OPEN) {
      const current = socket;
      socket = null;
      current.close();
    }
    void connect().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "tassello.open-app") {
    void openApp(String(message.path ?? "/library/article")).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "tassello.state") {
    void getConnection().then((connection) => sendResponse({ ...state, connection }));
    return true;
  }
  return false;
});

void hydrateJobs().then(connect);
