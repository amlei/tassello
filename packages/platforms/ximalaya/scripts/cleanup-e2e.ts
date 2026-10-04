/* 清理 e2e 探针留在喜马拉雅平台侧的测试声音。
 *
 * 只删标题带「tassello」测试标记的声音（精确匹配关键字，绝不动真实内容）：
 * 1. GET /reform-upload/anchorWork/track/list?keyword=tassello（真机验证过，见 ../NOTES.md）
 * 2. 对每条命中 POST /reform-upload/manage/album/track/delete {trackId}（ret===0 即成功；
 *    端点与 body 形态挖自 sound/manage 内页 chunk：`trackDelete({trackId})`，真机页面加载证实）
 *
 * 正常情况下 e2e-publish 只填表不点「确认发布」，平台侧不会有任何落库条目（keyword 查询应为 0 条）；
 * 本脚本是兜底（比如有人手滑点了发布）。用法：
 *   bun packages/platforms/ximalaya/scripts/cleanup-e2e.ts [--dry-run]
 */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/ximalaya`;
import { evaluateScalar, withPage } from "@tassello/cdp";

const DRY = process.argv.includes("--dry-run");

type TrackInfo = { trackId?: number; title?: string; albumTitle?: string };

const hits: TrackInfo[] = [];
await withPage(
  "ximalaya",
  { url: "https://studio.ximalaya.com/", keepOpen: false, activate: false, mode: "headless" },
  async (cdp, sid) => {
    await new Promise((res) => setTimeout(res, 6_000));
    // 关键字查询（keyword=tassello 已真机验证：命中 0 条说明无残留；pageSize 上限 20，ret=-3 同专辑接口）
    for (let page = 1; page <= 10; page += 1) {
      const r = await evaluateScalar<{ status: number; body: { ret?: number; data?: { infos?: TrackInfo[]; totalSize?: number } } }>(
        cdp,
        sid,
        `(async () => {
          const r = await fetch("/reform-upload/anchorWork/track/list?pageSize=20&keyword=tassello&status=1&page=${page}&needTopic=true", {
            credentials: "include", headers: { Accept: "application/json" },
          });
          return JSON.parse(JSON.stringify({ status: r.status, body: await r.json().catch(() => null) }));
        })()`,
        { timeoutMs: 30_000 },
      );
      if (r.status !== 200 || r.body?.ret !== 0) throw new Error(`查询测试声音失败：HTTP ${r.status} ret=${r.body?.ret}`);
      const infos = r.body.data?.infos ?? [];
      hits.push(...infos);
      if (hits.length >= (r.body.data?.totalSize ?? 0) || infos.length === 0) break;
    }
    return hits;
  },
);

if (hits.length === 0) {
  console.log("无 tassello 测试声音残留，平台侧干净。");
  process.exit(0);
}
console.log(`发现 ${hits.length} 条测试声音：`, hits.map((t) => `${t.trackId}:${t.title}`).join(" / "));

const del = await withPage(
  "ximalaya",
  { url: "https://studio.ximalaya.com/", keepOpen: false, activate: false, mode: "headless" },
  async (cdp, sid) => {
    const out: { trackId: number; ret: number | null; msg?: string }[] = [];
    for (const t of hits) {
      if (!t.trackId) continue;
      if (DRY) {
        out.push({ trackId: t.trackId, ret: null, msg: "dry-run 跳过" });
        continue;
      }
      const r = await evaluateScalar<{ status: number; body: { ret?: number; msg?: string } | null }>(
        cdp,
        sid,
        `(async () => {
          const r = await fetch("/reform-upload/manage/album/track/delete", {
            method: "POST",
            credentials: "include",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ trackId: ${t.trackId} }),
          });
          return JSON.parse(JSON.stringify({ status: r.status, body: await r.json().catch(() => null) }));
        })()`,
        { timeoutMs: 30_000 },
      );
      out.push({ trackId: t.trackId, ret: r.body?.ret ?? null, msg: `HTTP ${r.status} ${r.body?.msg ?? ""}` });
    }
    return out;
  },
);
console.log("删除结果：", JSON.stringify(del, null, 2));
process.exit(0);
