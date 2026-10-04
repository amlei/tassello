/* cleanup-e2e：荔枝测试残留清理 —— 本期 e2e 未跑通（登录态过期阻塞），无平台侧残留；
 * 本地测试音频在 /tmp（lizhi-test.m4a），不入仓库。拿到登录态跑通 e2e 后，
 * 在这里实现：列出 tassello 测试标题的草稿并逐条删除（草稿列表接口待真机探明，
 * 候选线索：njnew.lizhi.fm/voice/* 与 playsheet/* 域，以登录后 Network 面板为准）。 */
console.log("本期荔枝 e2e 未执行（登录态过期阻塞），无平台侧测试残留需要清理。");
process.exit(0);
