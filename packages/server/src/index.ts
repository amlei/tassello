/* @tassello/server —— 服务层引导：注册适配器 + 启动时自动校验平台账号，导出各服务 */
import { registerAdapter } from "@tassello/platform-core";
import { weiboAdapter } from "@tassello/platform-weibo";
import { wechatAdapter } from "@tassello/platform-wechat";
import { xhsAdapter } from "@tassello/platform-xhs";
import { doubanAdapter } from "@tassello/platform-douban";
import { jikeAdapter } from "@tassello/platform-jike";
import { zhihuAdapter } from "@tassello/platform-zhihu";
import { xAdapter } from "@tassello/platform-x";
import { xiaoyuzhouAdapter } from "@tassello/platform-xiaoyuzhou";
import { ximalayaAdapter } from "@tassello/platform-ximalaya";
import { lizhiAdapter } from "@tassello/platform-lizhi";
import { verifyAllAccountsOnBoot } from "./accounts";

let booted = false;

export function bootstrap(): void {
  if (booted) return;
  registerAdapter(weiboAdapter as never);
  registerAdapter(wechatAdapter as never);
  registerAdapter(xhsAdapter as never);
  registerAdapter(doubanAdapter as never);
  registerAdapter(jikeAdapter as never);
  registerAdapter(zhihuAdapter as never);
  registerAdapter(xAdapter as never);
  registerAdapter(xiaoyuzhouAdapter as never);
  registerAdapter(ximalayaAdapter as never);
  registerAdapter(lizhiAdapter as never);
  booted = true;
  verifyAllAccountsOnBoot();
}

export * from "./secrets";
export * from "./settings";
export * from "./posts";
export * from "./accounts";
export * from "./tasks";
export * from "./profile";
