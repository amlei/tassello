type ActiveEntry<Work> = {
  key: string;
  work: Work;
};

/** 按平台键调度任务：同一平台 FIFO，不同平台不设全局并发上限。 */
export class KeyedJobScheduler<Work> {
  private queue: Work[] = [];
  private readonly active = new Map<string, ActiveEntry<Work>>();

  constructor(
    private readonly idOf: (work: Work) => string,
    private readonly keyOf: (work: Work) => string,
  ) {}

  enqueue(work: Work): boolean {
    const jobId = this.idOf(work);
    if (this.active.has(jobId) || this.queue.some((item) => this.idOf(item) === jobId)) {
      return false;
    }
    this.queue.push(work);
    return true;
  }

  takeRunnable(): Work[] {
    const blockedKeys = new Set([...this.active.values()].map((entry) => entry.key));
    const runnable: Work[] = [];
    const remaining: Work[] = [];
    for (const work of this.queue) {
      const key = this.keyOf(work);
      if (blockedKeys.has(key)) {
        remaining.push(work);
        continue;
      }
      blockedKeys.add(key);
      this.active.set(this.idOf(work), { key, work });
      runnable.push(work);
    }
    this.queue = remaining;
    return runnable;
  }

  complete(jobId: string): boolean {
    return this.active.delete(jobId);
  }

  removeQueued(jobId: string): Work | null {
    const index = this.queue.findIndex((work) => this.idOf(work) === jobId);
    if (index < 0) return null;
    return this.queue.splice(index, 1)[0] ?? null;
  }

  has(jobId: string): boolean {
    return this.active.has(jobId) || this.queue.some((work) => this.idOf(work) === jobId);
  }

  queued(): Work[] {
    return [...this.queue];
  }

  activeWorks(): Work[] {
    return [...this.active.values()].map((entry) => entry.work);
  }

  activeCount(): number {
    return this.active.size;
  }
}
