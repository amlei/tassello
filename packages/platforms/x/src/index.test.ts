import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { composeXText, xProfileSchema } from "./index";

describe("X regular post", () => {
  test("combines title and body with real line breaks", () => {
    assert.equal(composeXText("标题", "正文"), "标题\n\n正文");
  });

  test("keeps a body that already starts with the title", () => {
    assert.equal(composeXText("标题", "标题\n\n正文"), "标题\n\n正文");
  });

  test("accepts optional browser-derived account fields", () => {
    assert.deepEqual(xProfileSchema.parse({ handle: "example", avatarUrl: "https://pbs.x.com/a.jpg" }), {
      handle: "example",
      avatarUrl: "https://pbs.x.com/a.jpg",
    });
  });
});
