import assert from "node:assert/strict";
import { test } from "node:test";
import { extensionStoreUrl } from "./browser-launcher";

test("扩展安装入口按浏览器返回 https 地址", () => {
  assert.match(extensionStoreUrl("chrome"), /^https:\/\//);
  assert.match(extensionStoreUrl("edge"), /^https:\/\//);
});
