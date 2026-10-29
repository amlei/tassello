import { describe, expect, test } from "bun:test";
import {
  ACCOUNT_PLATFORM_IDS,
  accountResult,
  normalizeAccountProbe,
  parseBaijiaAccountName,
  parseToutiaoUserId,
} from "./accounts";

describe("浏览器扩展账号验证器", () => {
  test("覆盖当前 active 的平台", () => {
    const expected = [
      "douban",
      "jike",
      "lizhi",
      "wechat",
      "weibo",
      "x",
      "xhs",
      "xiaoyuzhou",
      "ximalaya",
      "zhihu",
      "qingting",
      "toutiao",
      "baijiahao",
    ];
    expect(new Set(ACCOUNT_PLATFORM_IDS)).toEqual(new Set(expected));
  });

  test("将页面 pending 映射为失败，成功 profile 保持纯结构", () => {
    const failed = accountResult("9a0f1b9f-7008-4bbc-9369-e242a4e35a7b", "weibo", {
      state: "pending",
      error: "页面仍在加载",
    });
    expect(failed.state).toBe("failed");
    expect(failed.profile).toBeNull();

    const ok = accountResult("9a0f1b9f-7008-4bbc-9369-e242a4e35a7b", "weibo", {
      state: "ok",
      profile: {
        uid: "1",
        name: "九漾",
        avatarUrl: null,
        authExpiresAt: null,
        channels: [],
      },
    });
    expect(ok.state).toBe("ok");
    expect(ok.profile?.uid).toBe("1");
  });

  test("平台数值频道 ID 会归一化为字符串", () => {
    const probe = normalizeAccountProbe({
      uid: 391908628,
      name: "Amlei",
      channels: [{ id: 81728805, name: "青春列车" }],
    });
    expect(probe.state).toBe("ok");
    if (probe.state === "ok") {
      expect(probe.profile.uid).toBe("391908628");
      expect(probe.profile.channels[0]?.id).toBe("81728805");
    }
  });

  test("头条号用户链接和百家号问候语可归一化为稳定身份", () => {
    expect(parseToutiaoUserId("//www.toutiao.com/c/user/2979050131305220/?enter_from=mp_profile"))
      .toBe("2979050131305220");
    expect(parseToutiaoUserId("https://mp.toutiao.com/profile_v4/index")).toBeNull();
    expect(parseBaijiaAccountName("晚上好,相向行")).toBe("相向行");
    expect(parseBaijiaAccountName("普通文案")).toBeNull();
  });
});
