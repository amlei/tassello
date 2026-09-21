import { readAssetFile } from "@tassello/server";
import { ensureBoot } from "../../../_lib";

type Ctx = { params: Promise<{ assetId: string }> };

const CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".bmp": "image/bmp", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/x-m4v",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac",
};

/** GET /api/assets/:assetId/raw —— 素材原文件（空路径 = 占位色块，404） */
export async function GET(_req: Request, ctx: Ctx) {
  ensureBoot();
  const { assetId } = await ctx.params;
  const file = await readAssetFile(assetId);
  if (!file) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "content-type": CONTENT_TYPE[file.ext] ?? "application/octet-stream",
      "cache-control": "private, max-age=3600",
    },
  });
}
