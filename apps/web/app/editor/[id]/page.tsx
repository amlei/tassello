/* 编辑器：装载单篇完整数据（含 bodyHtml），不触碰其他稿子 */
import { notFound } from "next/navigation";
import { loadEditorData } from "@/lib/data";
import { EditorScreen } from "@/screens/editor-screen";

export const dynamic = "force-dynamic";

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { post, platforms, settings, counts, tasks } = await loadEditorData(id);
  if (!post) notFound();
  return <EditorScreen post={post} platforms={platforms} settings={settings} counts={counts} initialTasks={tasks} />;
}
