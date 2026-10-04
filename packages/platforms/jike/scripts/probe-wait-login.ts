/* 轮询等待人工登录：每 30s 探一次登录态，最多 15 分钟；登录成功后打印 cookie 名 */
import { evaluateScalar } from "@tassello/cdp";
import { connectProbe, openJikeTab, sleep } from "./_probe-lib";

const deadline = Date.now() + 15 * 60 * 1000;
const cdp = await connectProbe();
for (;;) {
  const { sessionId, targetId } = await openJikeTab(cdp);
  await sleep(3500);
  let url0 = "ERR";
  let cookieNames: string[] = [];
  try {
    const st = await evaluateScalar<{ url: string; cookieNames: string[] }>(
      cdp,
      sessionId,
      `(() => JSON.parse(JSON.stringify({ url: location.href, cookieNames: document.cookie.split(";").map(s => s.trim().split("=")[0]).filter(Boolean) })))`,
      { timeoutMs: 15_000 },
    );
    url0 = st?.url ?? "ERR";
    cookieNames = st?.cookieNames ?? [];
  } catch (e) {
    url0 = "ERR " + String(e);
  }
  await cdp.send("Target.closeTarget", { targetId }).catch(() => {});
  console.log(new Date().toISOString(), url0, JSON.stringify(cookieNames));
  if (!url0.includes("/login")) {
    console.log("LOGGED_IN");
    break;
  }
  if (Date.now() > deadline) {
    console.log("TIMEOUT_NOT_LOGGED_IN");
    break;
  }
  await sleep(30_000);
}
cdp.close();
process.exit(0);
