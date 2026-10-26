import { describe, expect, test } from "bun:test";
import { albumMatchLabels } from "./ximalaya";

describe("喜马拉雅专辑匹配", () => {
  test("兼容平台追加的可见性文案", () => {
    expect(albumMatchLabels("青春列车")).toEqual(["青春列车", "青春列车公开", "青春列车私密"]);
  });

  test("归一化专辑名称中的空白", () => {
    expect(albumMatchLabels("青春 列车")).toEqual(["青春列车", "青春列车公开", "青春列车私密"]);
  });
});
