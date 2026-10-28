/* data —— Server Component 通过本机 Elysia HTTP API 装载数据。 */
import type {
  ApiResult,
  AppSettings,
  PlatformDTO,
  PodcastRssDTO,
  PostDTO,
  TaskDTO,
} from "@tassello/shared";

const API_BASE = process.env.TASSELLO_API_URL ??
  `http://127.0.0.1:${process.env.TASSELLO_API_PORT ?? "4311"}`;

async function apiGet<T>(pathname: string): Promise<T> {
  const response = await fetch(`${API_BASE}/api/v1${pathname}`, { cache: "no-store" });
  const payload = await response.json() as ApiResult<T>;
  if (!payload.ok) throw new Error(payload.error);
  return payload.data;
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
  const [all, tasks, platforms] = await Promise.all([
    apiGet<PostDTO[]>("/posts?scope=all&sort=recent"),
    apiGet<TaskDTO[]>("/tasks"),
    apiGet<PlatformDTO[]>("/platforms"),
  ]);
  const counts: Record<string, number> = {};
  for (const p of all) counts[p.type] = (counts[p.type] ?? 0) + 1;
  const posts = all.filter((p) => p.type === type).map(slimForLibrary);
  return { posts, counts, tasks, platforms };
}

export async function loadQueueData(): Promise<{
  tasks: TaskDTO[];
  postMins: { id: string; type: string; title: string }[];
  platforms: PlatformDTO[];
  counts: Record<string, number>;
}> {
  const [tasks, all, platforms] = await Promise.all([
    apiGet<TaskDTO[]>("/tasks"),
    apiGet<PostDTO[]>("/posts?scope=all&sort=recent"),
    apiGet<PlatformDTO[]>("/platforms"),
  ]);
  const byId = new Map(all.map((p) => [p.id, p]));
  const postMins = tasks.map((t) => {
    const p = byId.get(t.postId);
    return { id: t.postId, type: p?.type ?? "article", title: p?.title ?? t.postTitle };
  });
  const counts: Record<string, number> = {};
  for (const p of all) counts[p.type] = (counts[p.type] ?? 0) + 1;
  return { tasks, postMins, platforms, counts };
}

export async function loadEditorData(id: string): Promise<{
  post: PostDTO | null;
  platforms: PlatformDTO[];
  settings: AppSettings;
  rss: PodcastRssDTO | null;
  counts: Record<string, number>;
  tasks: TaskDTO[];
}> {
  const [post, platforms, settings, rss, all, tasks] = await Promise.all([
    apiGet<PostDTO>(`/posts/${encodeURIComponent(id)}`).catch(() => null),
    apiGet<PlatformDTO[]>("/platforms"),
    apiGet<AppSettings>("/settings"),
    apiGet<PodcastRssDTO | null>("/podcast-rss"),
    apiGet<PostDTO[]>("/posts?scope=all&sort=recent"),
    apiGet<TaskDTO[]>("/tasks"),
  ]);
  const counts: Record<string, number> = {};
  for (const p of all) counts[p.type] = (counts[p.type] ?? 0) + 1;
  return { post, platforms, settings, rss, counts, tasks };
}

export async function loadPlatformsWithSettings(): Promise<{ platforms: PlatformDTO[]; settings: AppSettings }> {
  const [platforms, settings] = await Promise.all([
    apiGet<PlatformDTO[]>("/platforms"),
    apiGet<AppSettings>("/settings"),
  ]);
  return { platforms, settings };
}
