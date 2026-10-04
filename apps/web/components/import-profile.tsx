/* import-profile —— 「同步账号」全局动作：锁检测阻断 + 确认弹窗 + 覆盖 + 后台全量重校验。
   覆盖的是全平台共用的登录态库，入口全局唯一：设置里的「导入」按钮、
   任何失效平台的点击（账号卡 / 默认名单角标 / 发布弹层灰块）都汇到这里。
   锁检测：日常浏览器运行中时其登录库被锁，带锁拷贝会拿到不完整状态（即刻的
   localStorage token 实测就这么丢的）——服务端直接拒绝（code browser_running），
   这里渲染阻断层让用户退出浏览器后重试，不做任何绕过路径，导入要么完整要么不发生 */
"use client";

import React from "react";
import { IMPORT_BROWSERS } from "@tassello/shared";
import { AlertDialog, Button } from "@heroui/react";
import { api } from "./api";

/** 退出浏览器的操作提示按操作系统区分：macOS ⌘Q；Windows 无全局退出快捷键，指菜单；Linux Ctrl+Q */
function quitHint(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/Mac/i.test(ua)) return "⌘Q";
  if (/Win/i.test(ua)) return "右上角菜单 → 退出";
  return "Ctrl+Q";
}

export function useImportProfile(onSettled?: () => void) {
  /** confirm = 等用户确认；locked = 日常浏览器在运行，等用户退出后重试；
   *  importing = 覆盖进行中（后台重校验靠调用方轮询看结果） */
  const [stage, setStage] = React.useState<"confirm" | "locked" | "importing" | null>(null);
  const [browserName, setBrowserName] = React.useState("所选浏览器");

  /* 打开确认前把浏览器名带上，文案写明从哪导入 */
  const ask = React.useCallback(() => {
    setStage("confirm");
    api.getSettings().then((s) => {
      const b = IMPORT_BROWSERS.find((x) => x.id === s.importBrowser);
      if (b) setBrowserName(b.name);
    }).catch(() => {});
  }, []);

  const run = React.useCallback(async () => {
    setStage("importing");
    let res: { ok: boolean; message?: string; code?: string } = { ok: false };
    try { res = await api.importProfile(); } catch {}
    /* 浏览器运行中被服务端拦下：什么都没覆盖，转入阻断层等用户退出后重试 */
    if (res.code === "browser_running") {
      setStage("locked");
      return;
    }
    onSettled?.();
    /* 全量重校验在服务端后台跑：分几次拉平台状态，让校验结果逐步落定 */
    for (const delay of [2500, 6000, 10000]) {
      setTimeout(() => onSettled?.(), delay);
    }
    setStage(null);
  }, [onSettled]);

  const dialogCls = "max-w-[420px] rounded-[20px] bg-paper p-6 shadow-[0_14px_40px_rgba(15,15,15,0.14)]";
  const ghostBtnCls = "rounded-full px-4 py-2 text-[13.5px] font-bold text-ink2 data-[hovered=true]:bg-hover";
  const accBtnCls = "rounded-full bg-accent px-6 py-2.5 text-sm font-bold text-white data-[hovered=true]:brightness-105";

  const overlay = (
    <AlertDialog>
      {/* 锁检测阻断层：服务端检测到日常浏览器在运行，导入被拒 */}
      <AlertDialog.Backdrop isOpen={stage === "locked"} onOpenChange={(o) => { if (!o) setStage(null); }}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className={dialogCls} role="alertdialog" aria-label="浏览器运行中">
            <AlertDialog.Header className="flex items-start gap-3">
              <AlertDialog.Heading className="text-[17px] font-bold tracking-[-0.2px]">{browserName}正在运行</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="mt-1.5 text-sm leading-relaxed text-ink2">
              浏览器开着时无法完整读取登录状态。请先完全退出它（{quitHint()}），再点下方按钮继续。
            </AlertDialog.Body>
            <AlertDialog.Footer className="mt-5 flex items-center justify-end gap-3">
              <Button variant="ghost" className={ghostBtnCls} onPress={() => setStage(null)}>
                取消
              </Button>
              <Button className={accBtnCls} onPress={() => void run()}>
                已退出，重新检测
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      {/* 确认层：说明覆盖动作，确认后自动覆盖 + 全部平台重校验 */}
      <AlertDialog.Backdrop isOpen={stage === "confirm"} onOpenChange={(o) => { if (!o) setStage(null); }}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className={dialogCls} role="alertdialog" aria-label="同步账号确认">
            <AlertDialog.Header className="flex items-start gap-3">
              <AlertDialog.Heading className="text-[17px] font-bold tracking-[-0.2px]">从 {browserName} 同步账号？</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="mt-1.5 text-sm leading-relaxed text-ink2">
              将用所选浏览器里已登录的账号覆盖工作台，并自动重新校验全部平台。
            </AlertDialog.Body>
            <AlertDialog.Footer className="mt-5 flex items-center justify-end gap-3">
              <Button variant="ghost" className={ghostBtnCls} onPress={() => setStage(null)}>
                取消
              </Button>
              <Button
                isDisabled={stage === "importing"}
                className={accBtnCls}
                onPress={() => void run()}
              >
                导入并校验全部
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );

  return { importing: stage === "importing", ask, overlay };
}
