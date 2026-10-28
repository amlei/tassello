import { ensureStateLayout } from "./state";

let booted = false;

/** 文件状态库没有数据库迁移；首次调用只确保目录存在。 */
export function bootstrap(): void {
  if (booted) return;
  booted = true;
  void ensureStateLayout();
}

export * from "./account-store";
export * from "./account-sync";
export * from "./browser-launcher";
export * from "./documents";
export * from "./extensions";
export * from "./filesystem";
export * from "./media-token";
export * from "./podcast-rss";
export * from "./state";
export * from "./task-service";
export * from "./upload-store";
