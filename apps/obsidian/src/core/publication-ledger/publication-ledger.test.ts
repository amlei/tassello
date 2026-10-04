import { describe, expect, test } from "bun:test";
import { parse } from "yaml";
import { publicationBaseTemplate } from "./base-template";
import { deriveOverallStatus } from "./status";

describe("publication ledger", () => {
  test("generates valid Bases YAML", () => {
    const raw = publicationBaseTemplate({
      basePath: "Tassello/Publishments.base",
      autoCreate: true,
      includeFailReason: true,
    });
    const parsed = parse(raw) as Record<string, any>;
    expect(parsed["tassello-managed"]).toBe("publication-ledger/v1");
    expect(parsed.views).toHaveLength(4);
    expect(parsed.views[0].type).toBe("table");
    expect(parsed.views[0].order).toContain("note.tassello-weibo-publish-url");
  });

  test("derives overall status with actionable states first", () => {
    expect(deriveOverallStatus({ weibo: { status: "完成" }, zhihu: { status: "完成" } })).toBe("完成");
    expect(deriveOverallStatus({ weibo: { status: "完成" }, zhihu: { status: "待确认" } })).toBe("待确认");
    expect(deriveOverallStatus({ weibo: { status: "完成" }, zhihu: { status: "失败" } })).toBe("失败");
    expect(deriveOverallStatus({ weibo: { status: "完成" }, zhihu: { status: "已取消" } })).toBe("部分完成");
  });
});
