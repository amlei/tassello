import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createDocument,
  deleteDocument,
  extractMedia,
  getDocument,
  listDocuments,
  normalizeMediaOrder,
  parseDocumentFile,
  splitFrontmatter,
  updateDocument,
} from "./index";

const tempDirs: string[] = [];

async function tempVault(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tassello-vault-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("frontmatter", () => {
  test("解析合法 tassello 字段并保留正文", () => {
    const parsed = splitFrontmatter(`---
title: 保留字段
tassello:
  version: 1
  id: abc
  type: article
  createdAt: 2026-10-26T10:00:00+08:00
  updatedAt: 2026-10-26T11:00:00+08:00
  cover: ../files/cover.png
---
# 标题

正文`);
    assert.equal(parsed.error, null);
    assert.equal(parsed.data.id, "abc");
    assert.equal(parsed.data.type, "article");
    assert.equal(parsed.data.cover, "../files/cover.png");
    assert.equal(parsed.rawData.title, "保留字段");
    assert.match(parsed.body, /# 标题/);
  });

  test("损坏 YAML 标记为错误而不是自动修复", () => {
    const parsed = splitFrontmatter("---\ntassello: [\n---\n正文");
    assert.match(parsed.error ?? "", /frontmatter/);
    assert.match(parsed.body, /正文/);
  });

  test("只要求 id 与 type，时间从文件 stat 派生", async () => {
    const vault = await tempVault();
    const file = path.join(vault, "minimal.md");
    await fs.writeFile(file, `---
tassello:
  id: minimal
  type: article
---
# 标题
`);
    const document = await parseDocumentFile(vault, file);
    assert.equal(document.status, "ready");
    assert.equal(document.id, "minimal");
    assert.ok(Number.isFinite(Date.parse(document.createdAt)));
    assert.ok(Number.isFinite(Date.parse(document.updatedAt)));
  });
});

describe("markdown media", () => {
  test("按出现顺序提取本地和远程媒体", () => {
    const media = extractMedia("![a](../图/a.png)\n![v](https://example.com/a.mp4)\n![s](../音频/a.mp3)");
    assert.deepEqual(media.map((item) => [item.kind, item.source]), [
      ["image", "relative"],
      ["video", "url"],
      ["audio", "relative"],
    ]);
  });

  test("音频和视频保留图片作为封面等附加素材", () => {
    const media = extractMedia("![封面](../图/cover.png)\n![音频](../音频/episode.mp3)");
    assert.deepEqual(normalizeMediaOrder("audio", media).map((item) => item.kind), ["image", "audio"]);
    assert.deepEqual(normalizeMediaOrder("video", media).map((item) => item.kind), ["image"]);
  });
});

describe("vault store", () => {
  test("创建、读取、冲突检查、更新和删除", async () => {
    const vault = await tempVault();
    const created = await createDocument(vault, { type: "article", title: "测试稿件", markdown: "正文" });
    assert.equal(created.status, "ready");
    assert.match(created.markdown, /# 测试稿件/);
    assert.equal(created.relativePath.startsWith("articles/"), true);

    const loaded = await getDocument(vault, created.id);
    assert.equal(loaded?.plain, "正文");

    const updated = await updateDocument(vault, created.id, {
      markdown: "# 新标题\n\n新正文",
      expectedFingerprint: loaded?.fingerprint,
    });
    assert.equal(updated.title, "新标题");
    assert.equal(updated.plain, "新正文");

    await assert.rejects(updateDocument(vault, created.id, {
      markdown: "旧版本覆盖",
      expectedFingerprint: loaded?.fingerprint,
    }), /另一个应用/);

    await deleteDocument(vault, created.id);
    assert.equal(await getDocument(vault, created.id), null);
    const trash = await fs.readdir(path.join(vault, ".onda", "trash"));
    assert.equal(trash.length, 1);
  });

  test("递归扫描并标记重复 ID", async () => {
    const vault = await tempVault();
    await fs.mkdir(path.join(vault, "nested"), { recursive: true });
    const raw = `---
tassello:
  version: 1
  id: duplicate
  type: image
  createdAt: 2026-10-26T10:00:00Z
  updatedAt: 2026-10-26T10:00:00Z
---
# 标题
`;
    await fs.writeFile(path.join(vault, "a.md"), raw);
    await fs.writeFile(path.join(vault, "nested", "b.md"), raw);
    const records = await listDocuments(vault);
    assert.equal(records.length, 2);
    assert.equal(records.every((record) => record.status === "identity_conflict"), true);
  });

  test("封面可作为稿件资产存在但不进入正文媒体顺序", async () => {
    const vault = await tempVault();
    const file = path.join(vault, "cover.md");
    await fs.writeFile(file, `---
tassello:
  version: 1
  id: cover-only
  type: article
  createdAt: 2026-10-26T10:00:00Z
  updatedAt: 2026-10-26T10:00:00Z
  cover: ../files/cover.png
---
# 标题

正文`);
    const document = await parseDocumentFile(vault, file);
    assert.equal(document.cover, "../files/cover.png");
    assert.equal(document.bodyMarkdown.includes("cover.png"), false);
    assert.deepEqual(document.media.map((media) => [media.kind, media.role]), [["image", "cover"]]);
  });

  test("未知 frontmatter 字段保存后仍保留", async () => {
    const vault = await tempVault();
    const file = path.join(vault, "custom.md");
    await fs.writeFile(file, `---
custom:
  nested: true
tassello:
  version: 1
  id: keep
  type: article
  createdAt: 2026-10-26T10:00:00Z
  updatedAt: 2026-10-26T10:00:00Z
  customField: keep
---
# 标题
`);
    const document = await parseDocumentFile(vault, file);
    await updateDocument(vault, "keep", { markdown: "# 新标题", expectedFingerprint: document.fingerprint });
    const saved = await fs.readFile(file, "utf8");
    assert.match(saved, /custom:/);
    assert.match(saved, /nested: true/);
    assert.match(saved, /customField: keep/);
    assert.doesNotMatch(saved, /version:/);
    assert.doesNotMatch(saved, /createdAt:/);
    assert.doesNotMatch(saved, /updatedAt:/);
  });

  test("只更新正文时保留首个 H1，不把标题退化为文件名", async () => {
    const vault = await tempVault();
    const created = await createDocument(vault, {
      type: "article",
      title: "标题保留测试",
      markdown: "第一段",
    });
    const updated = await updateDocument(vault, created.id, {
      markdown: "第一段\n\n![配图](../files/test.png)",
      expectedFingerprint: created.fingerprint,
    });
    assert.equal(updated.title, "标题保留测试");
    assert.match(updated.markdown, /^# 标题保留测试/);
    assert.match(updated.markdown, /!\[配图\]/);
  });

  test("显式标题与无标题正文一起保存时生成唯一首个 H1", async () => {
    const vault = await tempVault();
    const created = await createDocument(vault, {
      type: "article",
      title: "原标题",
      markdown: "正文",
    });
    const updated = await updateDocument(vault, created.id, {
      title: "新标题",
      markdown: "更新正文",
      expectedFingerprint: created.fingerprint,
    });
    assert.equal(updated.title, "新标题");
    assert.equal((updated.markdown.match(/^# /gm) ?? []).length, 1);
    assert.doesNotMatch(updated.markdown, /^# 原标题/m);
  });
});
