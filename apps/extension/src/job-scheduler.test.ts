import { describe, expect, test } from "bun:test";
import { KeyedJobScheduler } from "./job-scheduler";

type Job = {
  jobId: string;
  platformId: string;
};

describe("按平台并发调度", () => {
  test("不同平台全部立即启动，同平台后续任务保持 FIFO", () => {
    const scheduler = new KeyedJobScheduler<Job>((job) => job.jobId, (job) => job.platformId);
    scheduler.enqueue({ jobId: "wechat-1", platformId: "wechat" });
    scheduler.enqueue({ jobId: "wechat-2", platformId: "wechat" });
    scheduler.enqueue({ jobId: "weibo-1", platformId: "weibo" });
    scheduler.enqueue({ jobId: "zhihu-1", platformId: "zhihu" });

    expect(scheduler.takeRunnable().map((job) => job.jobId)).toEqual([
      "wechat-1",
      "weibo-1",
      "zhihu-1",
    ]);
    expect(scheduler.takeRunnable()).toEqual([]);
    expect(scheduler.queued().map((job) => job.jobId)).toEqual(["wechat-2"]);

    scheduler.complete("wechat-1");
    expect(scheduler.takeRunnable().map((job) => job.jobId)).toEqual(["wechat-2"]);
  });

  test("重复任务不会再次入队，排队任务可以取消", () => {
    const scheduler = new KeyedJobScheduler<Job>((job) => job.jobId, (job) => job.platformId);
    expect(scheduler.enqueue({ jobId: "a", platformId: "xhs" })).toBe(true);
    expect(scheduler.enqueue({ jobId: "a", platformId: "xhs" })).toBe(false);
    expect(scheduler.enqueue({ jobId: "b", platformId: "xhs" })).toBe(true);
    expect(scheduler.enqueue({ jobId: "c", platformId: "douban" })).toBe(true);

    expect(scheduler.takeRunnable().map((job) => job.jobId)).toEqual(["a", "c"]);
    expect(scheduler.removeQueued("b")?.jobId).toBe("b");
    expect(scheduler.has("b")).toBe(false);
  });

  test("不存在隐藏的全局并发上限", () => {
    const scheduler = new KeyedJobScheduler<Job>((job) => job.jobId, (job) => job.platformId);
    const platforms = [
      "wechat", "weibo", "xhs", "jike", "x", "zhihu",
      "douban", "xiaoyuzhou", "ximalaya", "qingting", "lizhi", "baijiahao",
    ];
    for (const platformId of platforms) {
      scheduler.enqueue({ jobId: `${platformId}-job`, platformId });
    }
    expect(scheduler.takeRunnable()).toHaveLength(platforms.length);
    expect(scheduler.queued()).toHaveLength(0);
  });
});
