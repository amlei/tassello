# TODO

> 非规范性待办索引。现行架构、规范和流程以 [`README.md`](../README.md) 的索引为准。

## 待办

- [ ] [浏览器扩展正式发布迁移](./publish-migration.md)：当前只迁移发布任务的执行可靠性、活跃平台驱动、素材复用和真机验收。
- [ ] 浏览器扩展分别支持 Chrome 与 Edge；不恢复浏览器 profile 选择或登录态导入。
- [ ] 清理迁移结束后不再使用的 CDP 产品路径、SQLite/Prisma 与旧客户端实现。
- [ ] [已有 Vault 的目录结构兼容](./existing-vault-directory-compatibility.md)：运营端接入用户已有 Vault 时保留原目录结构，区分逻辑分类和物理目录。

Agent/MCP、面向发布流程的 CLI 和非 active 平台明确延期；豆包生图 CLI 作为应用内部能力独立维护，不计入发布平台范围。
