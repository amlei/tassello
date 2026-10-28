/**
 * 一次性迁移：旧 SQLite -> 文件 Vault + state JSON。
 * 用法：bun run migrate:vault -- --db /path/to/tassello.db --vault /path/to/vault
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  stringifyDocument,
  atomicWrite,
  type TasselloFrontmatter,
} from "../packages/vault/src/index.ts";

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const dbFile = path.resolve(argument("db") ?? path.join(process.env.TASSELLO_DATA_DIR ?? "", "tassello.db"));
const vaultPath = path.resolve(argument("vault") ?? path.join(path.dirname(dbFile), "vault"));
process.env.TASSELLO_DATA_DIR = path.dirname(dbFile);

await fs.access(dbFile).catch(() => {
  throw new Error(`旧数据库不存在：${dbFile}`);
});

const { getPrisma } = await import("../packages/db/src/index.ts");
const prisma = getPrisma();
const posts = await prisma.post.findMany({ include: { assets: { orderBy: { order: "asc" } } } });
const accounts = await prisma.platformAccount.findMany({ orderBy: { updatedAt: "desc" } });
const tasks = await prisma.publishTask.findMany({ orderBy: { createdAt: "desc" } });
const setting = await prisma.setting.findUnique({ where: { key: "app" } });

const dirByType: Record<string, string> = {
  article: "articles",
  image: "images",
  video: "videos",
  audio: "audios",
};

function slug(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 72) || "未命名";
}

function markdownBody(post: (typeof posts)[number]): string {
  const byId = new Map(post.assets.map((asset) => [asset.id, asset]));
  let body = post.body
    .replace(/!\[([^\]]*)\]\(asset:\/\/([^)]+)\)/g, (whole, alt: string, id: string) => {
      const asset = byId.get(id);
      return asset?.path ? `![${alt || "配图"}](${asset.path})` : whole;
    })
    .trim();
  const referenced = new Set([...body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]));
  const missing = post.assets.filter((asset) => asset.path && !referenced.has(asset.path));
  if (missing.length) {
    body += `${body ? "\n\n" : ""}${missing.map((asset) => `![${path.basename(asset.path)}](${asset.path})`).join("\n\n")}`;
  }
  return body;
}

async function uniqueFile(dir: string, title: string): Promise<string> {
  const base = slug(title);
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = path.join(dir, `${base}${index === 1 ? "" : `-${index}`}.md`);
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error("无法生成迁移文件名");
}

await fs.mkdir(vaultPath, { recursive: true });
for (const post of posts) {
  const type = post.type as keyof typeof dirByType;
  const dir = path.join(vaultPath, dirByType[type] ?? "articles");
  await fs.mkdir(dir, { recursive: true });
  const file = await uniqueFile(dir, post.title || "未命名");
  const frontmatter: TasselloFrontmatter = {
    version: 1,
    id: post.id,
    type: (dirByType[type] ? type : "article") as TasselloFrontmatter["type"],
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    manualOrder: post.manualOrder,
    options: post.durationSec === null ? {} : { durationSec: post.durationSec },
  };
  const heading = post.title.trim() ? `# ${post.title.trim()}` : "# 未命名";
  const body = markdownBody(post);
  await atomicWrite(file, stringifyDocument(frontmatter, `${heading}${body ? `\n\n${body}` : ""}`));
}

const stateDir = path.join(path.dirname(dbFile), "state");
await Promise.all(["accounts", "extensions", "tasks", "logs", "uploads", "locks"].map((name) =>
  fs.mkdir(path.join(stateDir, name), { recursive: true }),
));
await fs.mkdir(path.join(vaultPath, ".tassello", "trash"), { recursive: true });
await fs.writeFile(
  path.join(stateDir, "identity.json"),
  `${JSON.stringify({ installationId: crypto.randomUUID(), createdAt: new Date().toISOString() }, null, 2)}\n`,
);

let storedSettings: Record<string, unknown> = {};
if (setting?.valueJson) {
  try {
    storedSettings = JSON.parse(setting.valueJson) as Record<string, unknown>;
  } catch {}
}
await fs.writeFile(path.join(stateDir, "settings.json"), `${JSON.stringify({
  defaultTargets: storedSettings.defaultTargets ?? {},
  vaultPath,
  theme: "system",
}, null, 2)}\n`);

for (const account of accounts) {
  let profile: Record<string, unknown> = {};
  try {
    profile = JSON.parse(account.profile) as Record<string, unknown>;
  } catch {}
  await fs.writeFile(path.join(stateDir, "accounts", `${account.platformId}.json`), `${JSON.stringify({
    platformId: account.platformId,
    state: account.state === "ok" ? "ok" : "fail",
    failReason: account.failReason,
    name: account.name,
    uid: account.uid,
    avatarUrl: account.avatarUrl,
    authExpiresAt: account.authExpiresAt?.toISOString() ?? null,
    lastCheckedAt: account.lastCheckedAt?.toISOString() ?? null,
    profile,
    updatedAt: account.updatedAt.toISOString(),
  }, null, 2)}\n`);
}

for (const task of tasks) {
  const post = posts.find((item) => item.id === task.postId);
  await fs.writeFile(path.join(stateDir, "tasks", `${task.id}.json`), `${JSON.stringify({
    id: task.id,
    postId: task.postId,
    postTitle: post?.title ?? "未命名",
    documentPath: null,
    platformId: task.platformId,
    accountUid: task.accountUid,
    channelId: task.channelId,
    channelName: task.channelName,
    status: task.status,
    stage: task.stage,
    progress: task.progress,
    failReason: task.failReason,
    url: task.url,
    urlSource: task.url ? "manual" : null,
    noPublicUrl: false,
    pageUrl: null,
    manualHint: null,
    tabId: null,
    retryOfTaskId: null,
    createdAt: task.createdAt.toISOString(),
    finishedAt: task.finishedAt?.toISOString() ?? null,
  }, null, 2)}\n`);
}

console.log(JSON.stringify({
  ok: true,
  dbFile,
  vaultPath,
  posts: posts.length,
  accounts: accounts.length,
  tasks: tasks.length,
}, null, 2));
