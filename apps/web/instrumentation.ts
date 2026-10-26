/* Next server 启动钩子：register() 在 server 处理任何请求前执行且必须完成
 * （见 next 16.3.5 本地文档 file-conventions/instrumentation.md）。
 * 在这里把数据库迁移到 head（v0.1.1 真机回归：打包产物没有 Prisma CLI，
 * 首次启动 0 字节空库直接导致 no such table → web server 起不来）。
 * 不变量：server 起来 = 数据库已在 head 水位。失败 = server 起不来 = 桌面壳弹窗可见。 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { migrateToHead } = await import("@tassello/db");
  await migrateToHead();
}
