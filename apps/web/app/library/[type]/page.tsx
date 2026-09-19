/* 内容库：按类型一页，只装载该类型的数据（计数与任务在服务端一并取好） */
import { notFound } from "next/navigation";
import { CONTENT_TYPES } from "@tassello/shared";
import { loadLibraryData } from "@/lib/data";
import { LibraryScreen } from "@/components/library";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!CONTENT_TYPES.includes(type as (typeof CONTENT_TYPES)[number])) notFound();
  const { posts, counts, tasks, platforms } = await loadLibraryData(type);
  return <LibraryScreen type={type} posts={posts} counts={counts} platforms={platforms} initialTasks={tasks} />;
}
