import type { PlatformId, PublishTask, SourceDraft } from "../types";
import type { BackendApi } from "../api/client";

type Listener = (tasks: PublishTask[]) => void;

export class RemoteTaskEngine {
  private listeners = new Set<Listener>();
  private timer: number | null = null;
  private socket: WebSocket | null = null;
  private disposed = false;

  constructor(private readonly api: BackendApi) {
    void this.connect();
    this.timer = window.setInterval(() => {
      if (!this.socket || this.socket.readyState > WebSocket.OPEN) void this.connect();
    }, 5000);
  }

  private async connect(): Promise<void> {
    if (this.disposed) return;
    try {
      const runtime = await this.api.runtime();
      if (this.disposed) return;
      this.socket?.close();
      this.socket = new WebSocket(`${runtime.apiOrigin.replace(/^http/, "ws")}/ws/client`);
      this.socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data)) as {
            type?: string;
            tasks?: PublishTask[];
          };
          if ((message.type === "snapshot" || message.type === "tasks") && Array.isArray(message.tasks)) {
            for (const listener of this.listeners) listener(message.tasks);
          }
        } catch {}
      });
    } catch {
      // 5 秒后由轻量定时器重试。
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void this.refresh();
    return () => this.listeners.delete(listener);
  }

  private async refresh(): Promise<void> {
    try {
      const tasks = await this.api.tasks();
      for (const listener of this.listeners) listener(tasks);
    } catch {
      // 后端离线时保留最后状态；状态点单独显示连接结果。
    }
  }

  async enqueue(source: SourceDraft, platformIds: PlatformId[]): Promise<PublishTask[]> {
    const tasks = await this.api.publish(source.id, platformIds);
    for (const listener of this.listeners) listener(await this.api.tasks());
    return tasks;
  }

  async cancel(_taskId: string): Promise<void> {
    // 取消由后端协议统一扩展；当前阶段不伪造本地取消。
  }

  async markComplete(taskId: string, url?: string, noPublicUrl = false): Promise<void> {
    await this.api.confirm(taskId, url ?? null, noPublicUrl);
    await this.refresh();
  }

  async retry(taskId: string): Promise<void> {
    await this.api.retry(taskId);
    await this.refresh();
  }

  async openPage(taskId: string): Promise<void> {
    const task = (await this.api.tasks()).find((item) => item.id === taskId);
    if (task?.pageUrl) window.open(task.pageUrl, "_blank", "noopener,noreferrer");
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.socket?.close();
    this.socket = null;
    this.listeners.clear();
  }
}
