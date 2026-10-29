import type { ExtensionJobResult } from "@tassello/shared";
import type { PublishRuntime } from "./publish-runtime.ts";
import { publishDouban } from "./drivers/douban.ts";
import { publishJike } from "./drivers/jike.ts";
import { publishLizhi } from "./drivers/lizhi.ts";
import { publishWechat } from "./drivers/wechat.ts";
import { publishWeibo } from "./drivers/weibo.ts";
import { publishX } from "./drivers/x.ts";
import { publishXhs } from "./drivers/xhs.ts";
import { publishXiaoyuzhou } from "./drivers/xiaoyuzhou.ts";
import { publishXimalaya } from "./drivers/ximalaya.ts";
import { publishZhihu } from "./drivers/zhihu.ts";
import { publishQingting } from "./drivers/qingting.ts";
import { publishToutiao } from "./drivers/toutiao.ts";
import { publishBaijiahao } from "./drivers/baijiahao.ts";

export type PlatformDriver = (runtime: PublishRuntime) => Promise<ExtensionJobResult["result"]>;

/**
 * 平台驱动按平台拆到独立模块后在这里注册。未迁移的平台必须明确失败，
 * 不能伪装成功，也不能退回 CDP。
 */
export const drivers: Record<string, PlatformDriver> = {
  wechat: publishWechat,
  weibo: publishWeibo,
  xhs: publishXhs,
  x: publishX,
  zhihu: publishZhihu,
  qingting: publishQingting,
  toutiao: publishToutiao,
  baijiahao: publishBaijiahao,
  douban: publishDouban,
  jike: publishJike,
  xiaoyuzhou: publishXiaoyuzhou,
  ximalaya: publishXimalaya,
  lizhi: publishLizhi,
};

export async function runDriver(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const driver = drivers[runtime.job.snapshot.platformId];
  if (!driver) {
    return {
      status: "failed",
      error: `平台驱动尚未迁移：${runtime.job.snapshot.platformId}`,
    };
  }
  return driver(runtime);
}
