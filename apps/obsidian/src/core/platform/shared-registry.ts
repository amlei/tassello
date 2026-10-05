import { getAdapter, registerAdapter } from "@tassello/platform-core";
import { weiboAdapter } from "@tassello/platform-weibo";
import { zhihuAdapter } from "@tassello/platform-zhihu";
import { xhsAdapter } from "@tassello/platform-xhs";
import { jikeAdapter } from "@tassello/platform-jike";
import { doubanAdapter } from "@tassello/platform-douban";
import { xAdapter } from "@tassello/platform-x";
import { wechatAdapter } from "@tassello/platform-wechat";
import { xiaoyuzhouAdapter } from "@tassello/platform-xiaoyuzhou";
import { ximalayaAdapter } from "@tassello/platform-ximalaya";
import { lizhiAdapter } from "@tassello/platform-lizhi";
import type { PlatformId } from "../types";

let registered = false;

export function ensureSharedAdapters(): void {
  if (registered) return;
  registerAdapter(weiboAdapter);
  registerAdapter(zhihuAdapter);
  registerAdapter(xhsAdapter);
  registerAdapter(jikeAdapter);
  registerAdapter(doubanAdapter);
  registerAdapter(xAdapter);
  registerAdapter(wechatAdapter);
  registerAdapter(xiaoyuzhouAdapter);
  registerAdapter(ximalayaAdapter);
  registerAdapter(lizhiAdapter);
  registered = true;
}

export function sharedAdapter(platformId: PlatformId) {
  ensureSharedAdapters();
  return getAdapter(platformId);
}
