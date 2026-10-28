import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveDataDir } from "./state";

const SECRETS_FILE = "secrets.json";
const KEY_NAME = "media-signing-key";
type MediaKind = "image" | "video" | "audio";

const EXTENSIONS: Record<MediaKind, Set<string>> = {
  image: new Set([".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]),
  video: new Set([".avi", ".m4v", ".mkv", ".mov", ".mp4", ".webm"]),
  audio: new Set([".aac", ".flac", ".m4a", ".mp3", ".ogg", ".wav"]),
};

async function readSecrets(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(path.join(resolveDataDir(), SECRETS_FILE), "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

let signingKeyCache: string | null = null;

async function signingKey(): Promise<string> {
  if (signingKeyCache) return signingKeyCache;
  const secrets = await readSecrets();
  let key = secrets[KEY_NAME];
  if (!key) {
    key = randomBytes(32).toString("base64url");
    secrets[KEY_NAME] = key;
    const file = path.join(resolveDataDir(), SECRETS_FILE);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
  }
  signingKeyCache = key;
  return key;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder("ascii").decode(bytes.slice(start, start + length));
}

function detectedKinds(bytes: Uint8Array): Set<MediaKind> {
  const kinds = new Set<MediaKind>();
  const head = ascii(bytes, 0, Math.min(64, bytes.length));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) kinds.add("image");
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") kinds.add("image");
  if (/^GIF8[79]a/.test(head)) kinds.add("image");
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") kinds.add("image");
  if (ascii(bytes, 0, 2) === "BM") kinds.add("image");
  if (ascii(bytes, 4, 4) === "ftyp" && /avif|avis/.test(ascii(bytes, 8, 12))) kinds.add("image");
  if (/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(head)) kinds.add("image");
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") kinds.add("audio");
  if (ascii(bytes, 0, 4) === "OggS") {
    kinds.add("audio");
    kinds.add("video");
  }
  if (ascii(bytes, 0, 4) === "fLaC" || ascii(bytes, 0, 3) === "ID3") kinds.add("audio");
  if (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) kinds.add("audio");
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "AVI ") kinds.add("video");
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) kinds.add("video");
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (/qt\s|isom|mp4|m4v|3gp/i.test(brand)) kinds.add("video");
    if (/M4A|m4a|mp42/.test(brand)) kinds.add("audio");
  }
  return kinds;
}

/** 校验请求类型、扩展名与文件签名一致，避免把任意本地文件伪装成媒体签名后提供。 */
export async function validateMediaFile(absolutePath: string, expectedKind?: MediaKind): Promise<{
  ext: string;
  size: number;
  kind: MediaKind;
}> {
  const ext = path.extname(absolutePath).toLowerCase();
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile() || stat.size === 0) throw new Error("媒体文件不存在或为空");
  const expected = expectedKind ?? [...Object.entries(EXTENSIONS)]
    .find(([, extensions]) => extensions.has(ext))?.[0] as MediaKind | undefined;
  if (!expected || !EXTENSIONS[expected].has(ext)) {
    throw new Error(`不支持的媒体扩展名：${ext || "无扩展名"}`);
  }
  const handle = await fs.open(absolutePath, "r");
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(64);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    bytes = bytes.slice(0, bytesRead);
  } finally {
    await handle.close();
  }
  if (!detectedKinds(bytes).has(expected)) {
    throw new Error(`文件内容与${expected}媒体类型不匹配：${path.basename(absolutePath)}`);
  }
  return { ext, size: stat.size, kind: expected };
}

export async function createMediaToken(absolutePath: string, expectedKind: MediaKind): Promise<string> {
  await validateMediaFile(absolutePath, expectedKind);
  const payload = Buffer.from(path.resolve(absolutePath), "utf8").toString("base64url");
  const signature = createHmac("sha256", await signingKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export async function resolveMediaToken(token: string): Promise<string | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", await signingKey()).update(payload).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    return path.resolve(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function mediaUrl(token: string): string {
  return `/api/assets/${encodeURIComponent(token)}/raw`;
}
