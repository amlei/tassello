/* data —— Server Component 专用数据装载：直接走服务层，不经 HTTP */
import { bootstrap, getPost, getSettings, listPlatforms, listPosts, listTasks } from "@tassello/server";
import type { AppSettings, PlatformDTO, PostDTO, TaskDTO } from "@tassello/shared";

let ready = false;
function boot(): void {
  if (!ready) {
    bootstrap();
    ready = true;
  }
}

/* 库列表给客户端的数据：正文 plain 保留（摘要用），bodyHtml 清空（体积大头） */
function slimForLibrary(p: PostDTO): PostDTO {
  return { ...p, bodyHtml: "" };
}

export async function loadLibraryData(type: string): Promise<{
  posts: PostDTO[];
  counts: Record<string, number>;
  tasks: TaskDTO[];
  platforms: PlatformDTO[];
}> {
  boot();
  const [all, tasks, platforms] = await Promise.all([listPosts({ scope: "all", query: "", sort: "recent" }), listTasks(), listPlatforms()]);
  const counts: Record<string, number> = {};
  for (const p of all) counts[p.type] = (counts[p.type] ?? 0) + 1;
  const posts = all.filter((p) => p.type === type).map(slimForLibrary);
  return { posts, counts, tasks, platforms };
}

export async function loadQueueData(): Promise<{
  tasks: TaskDTO[];
  postMins: { id: string; type: string; title: string }[];
  platforms: PlatformDTO[];
}> {
  boot();
  const [tasks, all, platforms] = await Promise.all([listTasks(), listPosts({ scope: "all", query: "", sort: "recent" }), listPlatforms()]);
  const byId = new Map(all.map((p) => [p.id, p]));
  const postMins = tasks.map((t) => {
    const p = byId.get(t.postId);
    return { id: t.postId, type: p?.type ?? "article", title: p?.title ?? t.postTitle };
  });
  return { tasks, postMins, platforms };
}

export async function loadEditorData(id: string): Promise<{
  post: PostDTO | null;
  platforms: PlatformDTO[];
  settings: AppSettings;
  counts: Record<string, number>;
}> {
  boot();
  const [post, platforms, settings, all] = await Promise.all([
    getPost(id),
    listPlatforms(),
    getSettings(),
    listPosts({ scope: "all", query: "", sort: "recent" }),
  ]);
  const counts: Record<string, number> = {};
  for (const p of all) counts[p.type] = (counts[p.type] ?? 0) + 1;
  return { post, platforms, settings, counts };
}

export async function loadPlatformsWithSettings(): Promise<{ platforms: PlatformDTO[]; settings: AppSettings }> {
  boot();
  const [platforms, settings] = await Promise.all([listPlatforms(), getSettings()]);
  return { platforms, settings };
}
