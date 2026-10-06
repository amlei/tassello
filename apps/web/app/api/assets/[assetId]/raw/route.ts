import { readAssetFile, readAssetFileRange, readAssetMetadata } from "@tassello/server";
import { ensureBoot } from "../../../_lib";

type Ctx = { params: Promise<{ assetId: string }> };

const CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".bmp": "image/bmp", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/x-m4v",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac",
};

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "") {
    if (rawEnd === "") return null;
    const suffix = Number(rawEnd);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  }
  const start = Number(rawStart);
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return null;
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (!Number.isSafeInteger(end) || end < start) return null;
  return { start, end };
}

/** GET /api/assets/:assetId/raw —— 素材原文件；video seek 需要 206 Range 响应 */
export async function GET(req: Request, ctx: Ctx) {
  ensureBoot();
  const { assetId } = await ctx.params;
  const rangeHeader = req.headers.get("range");

  if (rangeHeader) {
    const metadata = await readAssetMetadata(assetId);
    if (!metadata) return new Response("not found", { status: 404 });
    const range = parseRange(rangeHeader, metadata.totalSize);
    if (!range) {
      return new Response("range not satisfiable", {
        status: 416,
        headers: { "content-range": `bytes */${metadata.totalSize}` },
      });
    }
    const file = await readAssetFileRange(assetId, range.start, range.end);
    if (!file) return new Response("not found", { status: 404 });
    const bytes = file.bytes;
    return new Response(new Uint8Array(bytes), {
      status: 206,
      headers: {
        "content-type": CONTENT_TYPE[metadata.ext] ?? "application/octet-stream",
        "content-length": String(bytes.byteLength),
        "content-range": `bytes ${range.start}-${range.end}/${metadata.totalSize}`,
        "accept-ranges": "bytes",
        "cache-control": "private, max-age=3600",
      },
    });
  }

  const file = await readAssetFile(assetId);
  if (!file) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "content-type": CONTENT_TYPE[file.ext] ?? "application/octet-stream",
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=3600",
    },
  });
}
