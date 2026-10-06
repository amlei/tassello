/* theme —— 主题偏好：浅色 / 深色 / 跟随系统（默认系统） */
"use client";

import React from "react";
import { ToggleButton, ToggleButtonGroup } from "@heroui/react";

export type ThemePref = "light" | "dark" | "system";
const THEME_KEY = "onda-theme";

export function applyTheme(pref: ThemePref): void {
  const dark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/* 首屏防闪烁 + 跟随系统：body 渲染前按偏好落 data-theme，并常驻监听系统主题切换
   （监听放在内联脚本里：ThemeSwitcher 只在设置弹层打开时挂载，跟着组件走会丢事件） */
export function ThemeScript(): React.ReactElement {
  const code = `(function(){try{var K="${THEME_KEY}";var pref=function(){var v=null;try{v=localStorage.getItem(K);}catch(e){}return v==="light"||v==="dark"?v:"system";};var apply=function(){var p=pref();var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";};apply();window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",function(){if(pref()==="system")apply();});}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function setThemePref(pref: ThemePref): void {
  localStorage.setItem(THEME_KEY, pref);
  applyTheme(pref);
}

/* 外观切换：三段选择器（浅色 / 深色 / 跟随系统）。
   只在设置弹层里挂载（纯客户端渲染），useState 惰性读 localStorage；
   系统主题的实时跟随由 ThemeScript 的常驻监听负责 */
export function ThemeSwitcher(): React.ReactElement {
  const [pref, setPref] = React.useState<ThemePref>(() => getThemePref());

  const pick = (p: ThemePref) => {
    setPref(p);
    setThemePref(p);
  };

  const opts: { id: ThemePref; label: string }[] = [
    { id: "light", label: "浅色" },
    { id: "dark", label: "深色" },
    { id: "system", label: "跟随系统" },
  ];
  return (
    <ToggleButtonGroup
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[pref]}
      onSelectionChange={(keys) => {
        const key = Array.from(keys)[0];
        if (key === "light" || key === "dark" || key === "system") pick(key);
      }}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-card p-1"
      aria-label="外观"
    >
      {opts.map((o) => (
        <ToggleButton
          key={o.id}
          id={o.id}
          className={
            "h-auto rounded-full px-3 py-1 text-xs font-bold transition-colors " +
            (pref === o.id ? "bg-accent text-white" : "bg-transparent text-ink2 data-[hovered=true]:bg-hover")
          }
          onPress={() => pick(o.id)}
        >
          {o.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
