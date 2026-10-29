import { describe, expect, test } from "bun:test";
import { drivers } from "./drivers";

describe("正式发布驱动注册表", () => {
  test("注册全部已打包平台驱动，包含暂未开放的 planned 平台", () => {
    expect(new Set(Object.keys(drivers))).toEqual(new Set([
      "wechat",
      "weibo",
      "xhs",
      "x",
      "zhihu",
      "qingting",
      "toutiao",
      "baijiahao",
      "douban",
      "jike",
      "xiaoyuzhou",
      "ximalaya",
      "lizhi",
    ]));
  });
});
