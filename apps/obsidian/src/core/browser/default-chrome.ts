import { connectDefaultChrome, CdpConnection } from "./cdp";
import type { BrowserStatus } from "../types";
import type { ChromeChannel } from "./cdp";

export class DefaultChromeManager {
  private connection: CdpConnection | null = null;
  private connecting: Promise<CdpConnection> | null = null;
  private listeners = new Set<(status: BrowserStatus, detail?: string) => void>();
  private status: BrowserStatus = "disconnected";
  private detail: string | undefined;

  constructor(public channel: ChromeChannel = "stable") {}

  onStatus(listener: (status: BrowserStatus, detail?: string) => void): () => void {
    this.listeners.add(listener);
    listener(this.status, this.detail);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: BrowserStatus, detail?: string): void {
    this.status = status;
    this.detail = detail;
    for (const listener of this.listeners) listener(status, detail);
  }

  getStatus(): BrowserStatus {
    return this.status;
  }

  getDetail(): string | undefined {
    return this.detail;
  }

  isConnected(): boolean {
    return this.connection?.isOpen ?? false;
  }

  async connect(): Promise<CdpConnection> {
    if (this.isConnected()) return this.connection!;
    if (this.connecting) return this.connecting;

    this.setStatus("checking");
    this.connecting = (async () => {
      this.setStatus("waiting-approval", "如 Chrome 弹出授权框，请选择允许");
      try {
        const connection = await connectDefaultChrome(this.channel);
        await connection.send("Browser.getVersion", {}, { timeoutMs: 8000 });
        connection.on("close", () => {
          this.connection = null;
          this.connecting = null;
          this.setStatus("disconnected", "Chrome 连接已关闭");
        });
        this.connection = connection;
        this.setStatus("connected");
        return connection;
      } catch (error) {
        this.connection = null;
        const message = error instanceof Error ? error.message : String(error);
        const denied = /关闭|拒绝|authorization|denied/i.test(message);
        this.setStatus(denied ? "denied" : "disconnected", message);
        throw error;
      } finally {
        this.connecting = null;
      }
    })();

    return this.connecting;
  }

  disconnect(): void {
    this.connection?.close();
    this.connection = null;
    this.connecting = null;
    this.setStatus("disconnected");
  }
}
