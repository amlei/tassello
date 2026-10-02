/* 探针：点击「新的创作」菜单项（文章/贴图/视频/播客），捕获跳转 URL */
import { evaluateScalar, withPage } from "@tassello/cdp";

const names = process.argv.slice(2);
const items = names.length ? names : ["文章", "贴图", "视频", "播客"];

await withPage("wechat", { url: "https://mp.weixin.qq.com", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await new Promise((r) => setTimeout(r, 6000));
  for (const name of items) {
    const r = await evaluateScalar<{ opened: string[]; here: string }>(
      cdp,
      sid,
      `(async () => {
        window.__opened = [];
        const origOpen = window.open;
        window.open = function (u) { window.__opened.push(String(u)); return null; };
        const items = Array.from(document.querySelectorAll(".new-creation__menu-item"));
        const hit = items.find((el) => (el.querySelector(".new-creation__menu-title") || el).textContent.trim() === ${JSON.stringify(name)});
        if (!hit) return { opened: ["NO-MENU-ITEM"], here: location.href };
        hit.click();
        await new Promise((r2) => setTimeout(r2, 1500));
        window.open = origOpen;
        return JSON.parse(JSON.stringify({ opened: window.__opened, here: location.href }));
      })()`,
      { timeoutMs: 15_000 },
    );
    console.log(name, "=>", JSON.stringify(r, null, 2));
  }
});
