import { describe, expect, test } from "bun:test";
import { parseImageEmbeds } from "./image-embeds";

describe("Markdown image parsing", () => {
  test("parses encoded, angle-bracket, and unencoded paths", () => {
    const body = [
      "![encoded](files/Pasted%20image%2020261004102932.png)",
      "![](<files/Pasted image 20261004102932.png>)",
      "![](files/Pasted image 20261004102932.png)",
      '![titled](files/a.png "图片标题")',
    ].join("\n");
    const parsed = parseImageEmbeds(body);

    expect(parsed).toHaveLength(4);
    expect(parsed[0]?.linkpath).toBe("files/Pasted image 20261004102932.png");
    expect(parsed[1]?.linkpath).toBe("files/Pasted image 20261004102932.png");
    expect(parsed[2]?.linkpath).toBe("files/Pasted image 20261004102932.png");
    expect(parsed[3]?.alt).toBe("titled");
  });

  test("keeps wiki embeds before markdown embeds", () => {
    const parsed = parseImageEmbeds("![[first.png]]\n![](second.png)");
    expect(parsed.map((item) => item.linkpath)).toEqual(["first.png", "second.png"]);
  });
});
