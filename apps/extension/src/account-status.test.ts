import { describe, expect, test } from "bun:test";
import { platformAccountStatus } from "./account-status";

describe("扩展账号状态", () => {
  test("区分连接、登录、失败和检查中", () => {
    expect(platformAccountStatus("connected")).toEqual({ label: "已连接", tone: "ok" });
    expect(platformAccountStatus("needs_login")).toEqual({ label: "需要登录", tone: "wait" });
    expect(platformAccountStatus("failed")).toEqual({ label: "检查失败", tone: "bad" });
    expect(platformAccountStatus("unverified", true)).toEqual({ label: "检查中", tone: "wait" });
  });
});
