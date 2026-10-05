/* html-to-blocks 单测：Tiptap 产物词汇 → 豆瓣 blocks 的映射与边界 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { htmlToDoubanBlocks, parseHtml } from "./html-to-blocks";

describe("parseHtml", () => {
  it("解析嵌套元素、属性与实体", () => {
    const nodes = parseHtml('<p class="a">A&amp;B<br>线</p>');
    assert.equal(nodes.length, 1);
    const p = nodes[0] as Extract<typeof nodes[number], { kind: "el" }>;
    assert.equal(p.tag, "p");
    assert.equal(p.attrs.class, "a");
    assert.deepEqual(p.children.map((c) => (c.kind === "text" ? c.text : c.tag)), ["A&B", "br", "线"]);
  });

  it("容忍未闭合与多余闭合标签（不抛错，就近配对）", () => {
    const nodes = parseHtml("<div><p>一<p>二</span></div>");
    const div = nodes[0] as Extract<typeof nodes[number], { kind: "el" }>;
    assert.equal(div.tag, "div");
    assert.equal(div.children.length, 1); /* 未闭合的 p 就近嵌套，不抛错 */
    const { items } = htmlToDoubanBlocks("<div><p>一<p>二</span></div>");
    assert.equal(items.length, 1);
    assert.ok(items[0]!.kind === "text" && items[0]!.text === "一二");
  });
});

describe("htmlToDoubanBlocks", () => {
  it("标题/粗/斜/删/高亮/行内码映射为 styles", () => {
    const { items, entities } = htmlToDoubanBlocks(
      "<h2>标题</h2><p>前<strong>粗</strong><em>斜</em><u>下</u><s>删</s><mark>亮</mark><code>码</code>后</p>",
    );
    assert.equal(items.length, 2);
    const p = items[1]!;
    assert.ok(p.kind === "text" && p.type === "unstyled");
    assert.equal(p.text, "前粗斜下删亮码后");
    const styles = p.inlineStyleRanges.map((r) => r.style);
    assert.deepEqual(styles, ["BOLD", "ITALIC", "UNDERLINE", "STRIKETHROUGH", "MARK", "CODE"]);
    assert.equal(p.inlineStyleRanges[0]!.offset, 1);
    assert.equal(p.inlineStyleRanges[5]!.offset, 6);
    assert.deepEqual(entities, {});
  });

  it("列表/引用/代码块/链接实体", () => {
    const { items, entities } = htmlToDoubanBlocks(
      '<ul><li>甲</li><li>乙</li></ul><ol><li>丙</li></ol><blockquote>引</blockquote>' +
      "<pre><code>块</code></pre>" +
      '<p>看<a href="https://example.com/">链</a>接</p>',
    );
    assert.equal(items[0]!.kind === "text" && items[0]!.type, "unordered-list-item");
    assert.equal(items[1]!.kind === "text" && items[1]!.type, "unordered-list-item");
    assert.equal(items[2]!.kind === "text" && items[2]!.type, "ordered-list-item");
    assert.equal(items[3]!.kind === "text" && items[3]!.type, "blockquote");
    const linkP = items[items.length - 1]!;
    assert.ok(linkP.kind === "text");
    assert.equal(linkP.text, "看链接");
    assert.equal(linkP.entityRanges.length, 1);
    const key = linkP.entityRanges[0]!.key;
    assert.equal(entities[key]!.data.url, "https://example.com/");
    assert.equal(entities[key]!.type, "LINK");
  });

  it("figure 落 image 项且保持位置；空段跳过；首尾空白平移范围", () => {
    const { items } = htmlToDoubanBlocks(
      '<p>图前</p><figure class="m-fig" data-asset="a1"></figure><p>  <strong>图后粗体</strong>  </p><p>   </p>',
    );
    assert.equal(items.length, 3);
    assert.equal(items[0]!.kind, "text");
    assert.equal(items[1]!.kind, "image");
    if (items[1]!.kind !== "image") throw new Error("unreachable");
    assert.equal(items[1]!.assetId, "a1");
    const last = items[2]!;
    assert.ok(last.kind === "text" && last.text === "图后粗体");
    assert.deepEqual(last.inlineStyleRanges, [{ offset: 0, length: 4, style: "BOLD" }]);
  });

  it("标签 span 只保文字，#标签颜色样式不进正文", () => {
    const { items } = htmlToDoubanBlocks(
      '<p><span class="m-tag" style="color:#x">#话题</span>正文</p>',
    );
    assert.equal(items.length, 1);
    const p = items[0]!;
    assert.ok(p.kind === "text" && p.text === "#话题正文");
    assert.equal(p.inlineStyleRanges.length, 0);
  });

  it("软换行 br 保留为 \\n", () => {
    const { items } = htmlToDoubanBlocks("<p>一<br>二</p>");
    const p = items[0]!;
    assert.ok(p.kind === "text" && p.text === "一\n二");
  });
});
