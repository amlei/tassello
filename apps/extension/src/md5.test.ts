import { describe, expect, test } from "bun:test";
import { md5Base64, md5Hex } from "./md5";

describe("MD5", () => {
  test("符合标准测试向量", () => {
    const encoder = new TextEncoder();
    expect(md5Hex(encoder.encode(""))).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5Hex(encoder.encode("abc"))).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5Hex(encoder.encode("The quick brown fox jumps over the lazy dog"))).toBe("9e107d9d372bb6826bd81d3542a419d6");
    expect(md5Base64(btoa("abc"))).toBe("900150983cd24fb0d6963f7d28e17f72");
  });
});
