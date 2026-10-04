import type { PublishTask } from "../types";

export class TaskStore {
  private tasks = new Map<string, PublishTask>();

  constructor(private readonly persist: (tasks: PublishTask[]) => Promise<void>) {}

  load(tasks: PublishTask[] | undefined): void {
    this.tasks.clear();
    for (const task of tasks ?? []) this.tasks.set(task.id, task);
  }

  all(): PublishTask[] {
    return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): PublishTask | undefined {
    return this.tasks.get(id);
  }

  async upsert(task: PublishTask): Promise<void> {
    this.tasks.set(task.id, task);
    await this.persist(this.all());
  }

  async remove(id: string): Promise<void> {
    this.tasks.delete(id);
    await this.persist(this.all());
  }

  async replace(tasks: PublishTask[]): Promise<void> {
    this.tasks.clear();
    for (const task of tasks) this.tasks.set(task.id, task);
    await this.persist(this.all());
  }

  async renamePath(oldPath: string, newPath: string): Promise<boolean> {
    let changed = false;
    const next: PublishTask[] = this.all().map((task) => {
      if (task.filePath !== oldPath) return task;
      changed = true;
      return { ...task, filePath: newPath, updatedAt: new Date().toISOString() };
    });
    if (changed) await this.replace(next);
    return changed;
  }
}
