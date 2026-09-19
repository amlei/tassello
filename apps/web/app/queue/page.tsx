/* 发布队列：任务 + 稿子最小信息（标题/类型），不装载正文 */
import { loadQueueData } from "@/lib/data";
import { QueueScreen } from "@/components/queue-screen";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const { tasks, postMins, platforms } = await loadQueueData();
  return <QueueScreen tasks={tasks} postMins={postMins} platforms={platforms} />;
}
