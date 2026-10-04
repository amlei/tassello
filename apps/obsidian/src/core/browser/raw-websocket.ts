import { Buffer } from "buffer";
import { EventEmitter } from "events";
import { request, type ClientRequest } from "http";
import { randomBytes } from "crypto";

export type RawWebSocketEvents = {
  open: [];
  message: [data: string];
  close: [];
  error: [error: Error];
};

type Opcode = 0 | 1 | 2 | 8 | 9 | 10;

/** Obsidian's renderer blocks ws-style Node globals at module load, so CDP uses this tiny RFC 6455 client. */
export class RawWebSocket extends EventEmitter {
  private socket = null as null | import("net").Socket;
  private request: ClientRequest | null = null;
  private chunks: Buffer[] = [];
  private pendingLength: number | null = null;
  private pendingOpcode: Opcode | null = null;
  private fragments: Buffer[] = [];
  private fragmentOpcode: Opcode | null = null;
  private closedByUs = false;
  private receivedClose = false;

  get isOpen(): boolean {
    return !!this.socket;
  }

  static connect(url: string, timeoutMs = 70_000): Promise<RawWebSocket> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      if (parsed.protocol !== "ws:") throw new Error("仅支持 ws:// 本地 Chrome 连接");
      const key = randomBytes(16).toString("base64");
      const req = request({
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          Host: parsed.host,
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Key": key,
          "Sec-WebSocket-Version": "13",
        },
      });

      const fail = (message: string) => {
        const error = new Error(message);
        req.destroy();
        reject(error);
      };
      const timer = setTimeout(() => fail("等待 Chrome 授权超时。请在 Chrome 中选择允许，或重新开启 Remote debugging。"), timeoutMs);
      const settle = () => clearTimeout(timer);

      req.on("upgrade", (response, socket, head) => {
        settle();
        if (response.statusCode !== 101 || (response.headers.upgrade ?? "").toLowerCase() !== "websocket") {
          socket.destroy();
          reject(new Error(`Chrome 拒绝 WebSocket 升级（HTTP ${response.statusCode}）`));
          return;
        }
        const ws = new RawWebSocket();
        ws.attach(socket, head);
        ws.once("open", () => resolve(ws));
        ws.emit("open");
      });
      req.on("response", (response) => {
        // Bun 的 node:http 不派发 upgrade 事件，101 会走 response——这里兼容两条路径
        if (response.statusCode === 101 && (response.headers.upgrade ?? "").toLowerCase() === "websocket") {
          settle();
          const socket = (response as unknown as { socket?: import("net").Socket }).socket;
          if (socket) {
            const ws = new RawWebSocket();
            ws.attach(socket, Buffer.alloc(0));
            ws.once("open", () => resolve(ws));
            ws.emit("open");
            return;
          }
        }
        settle();
        fail(`Chrome 拒绝 WebSocket 升级（HTTP ${response.statusCode}）`);
      });
      req.on("error", (error) => {
        settle();
        reject(new Error(`无法连接 Chrome：${error.message}`));
      });
      req.end();
    });
  }

  private attach(socket: import("net").Socket, head: Buffer): void {
    this.socket = socket;
    if (head.length) this.feed(head);
    socket.on("data", (chunk: Buffer) => this.feed(chunk));
    socket.on("close", () => this.handleClose());
    socket.on("error", (error: Error) => {
      this.emit("error", error);
      this.handleClose();
    });
  }

  send(data: string): void {
    if (!this.socket) throw new Error("Chrome WebSocket 已关闭");
    const payload = Buffer.from(data, "utf8");
    const mask = randomBytes(4);
    const length = payload.length;
    let header: Buffer;
    if (length < 126) {
      header = Buffer.from([0x81, 0x80 | length]);
    } else if (length < 65_536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header[2] = length >> 8;
      header[3] = length & 0xff;
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      const high = Math.floor(length / 2 ** 32);
      header.writeUInt32BE(high >>> 0, 2);
      header.writeUInt32BE(length >>> 0, 6);
    }
    const masked = Buffer.alloc(length);
    payload.copy(masked);
    const maskAt = (index: number) => mask[index % 4] ?? 0;
    for (let index = 0; index < length; index += 1) masked.set([payload[index]! ^ maskAt(index)], index);
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  close(): void {
    if (this.closedByUs) return;
    this.closedByUs = true;
    if (!this.socket) return;
    try {
      const mask = randomBytes(4);
      this.socket.write(Buffer.concat([Buffer.from([0x88, 0x80]), mask]));
      this.socket.end();
    } catch {
      this.socket.destroy();
    }
    this.handleClose();
  }

  private feed(chunk: Buffer): void {
    this.chunks.push(chunk);
    let bytes = Buffer.concat(this.chunks);
    this.chunks = [];
    for (;;) {
      const frame = bytes;
      if (this.pendingLength === null) {
        if (frame.length < 2) break;
        const opcode = frame[0]! & 0x0f;
        const masked = (frame[1]! & 0x80) !== 0;
        let length = frame[1]! & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (frame.length < offset + 2) break;
          length = frame.readUInt16BE(offset);
          offset += 2;
        } else if (length === 127) {
          if (frame.length < offset + 8) break;
          const high = frame.readUInt32BE(offset);
          const low = frame.readUInt32BE(offset + 4);
          length = high * 2 ** 32 + low;
          offset += 8;
        }
        const maskLength = masked ? 4 : 0;
        if (frame.length < offset + maskLength + length) break;
        const mask = masked ? frame.subarray(offset, offset + 4) : Buffer.alloc(0);
        const maskAt = (index: number) => mask[index % 4] ?? 0;
        offset += maskLength;
        const payload = frame.subarray(offset, offset + length);
        for (let index = 0; index < payload.length; index += 1) payload[index] = payload[index]! ^ maskAt(index);
        bytes = bytes.subarray(offset + length);
        this.handleFrame(opcode as Opcode, payload);
      } else {
        const needed = this.pendingLength - (this.chunks[0]?.length ?? 0);
        if (bytes.length < needed) break;
        this.chunks.push(bytes);
        bytes = Buffer.concat(this.chunks);
        this.chunks = [];
        this.pendingLength = null;
        this.handleFrame(this.pendingOpcode ?? 1, bytes);
      }
    }
    if (bytes.length) this.chunks.push(bytes);
  }

  private handleFrame(opcode: Opcode, payload: Buffer): void {
    if (opcode === 8) {
      this.receivedClose = true;
      this.close();
      return;
    }
    if (opcode === 9) {
      if (this.socket) this.socket.write(Buffer.concat([Buffer.from([0x8a, 0x80]), randomBytes(4)]));
      return;
    }
    if (opcode === 10) return;
    if (opcode === 0) {
      this.fragments.push(payload);
      if (this.pendingLength === null) {
        const complete = Buffer.concat(this.fragments);
        this.fragments = [];
        const finalOpcode = this.fragmentOpcode ?? 1;
        this.fragmentOpcode = null;
        if (finalOpcode === 1) this.emit("message", complete.toString("utf8"));
      }
      return;
    }
    if (opcode === 1) {
      if (this.pendingLength === null) {
        this.emit("message", payload.toString("utf8"));
        return;
      }
      this.fragmentOpcode = opcode;
      this.fragments.push(payload);
    }
  }

  private handleClose(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.emit("close");
  }
}
