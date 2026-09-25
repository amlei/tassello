/* @tassello/server —— 服务层引导：注册适配器 + 启动时自动校验平台账号，导出各服务 */
import { registerAdapter } from "@tassello/platform-core";
import { weiboAdapter } from "@tassello/platform-weibo";
import { wechatAdapter } from "@tassello/platform-wechat";
import { verifyAllAccountsOnBoot } from "./accounts";

let booted = false;

export function bootstrap(): void {
  if (booted) return;
  registerAdapter(weiboAdapter as never);
  registerAdapter(wechatAdapter as never);
  booted = true;
  verifyAllAccountsOnBoot();
}

export * from "./secrets";
export * from "./settings";
export * from "./posts";
export * from "./accounts";
export * from "./tasks";
export * from "./profile";
