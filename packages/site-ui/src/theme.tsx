"use client";

import React from "react";

export type ThemePref = "light" | "dark" | "system";
const THEME_KEY = "onda-theme";

export function applyTheme(pref: ThemePref): void {
  const dark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function getThemePref(): ThemePref {
  const value = localStorage.getItem(THEME_KEY);
  return value === "light" || value === "dark" ? value : "system";
}

export function setThemePref(pref: ThemePref): void {
  localStorage.setItem(THEME_KEY, pref);
  applyTheme(pref);
}

/* 营销站和桌面应用共用同一份主题初始化逻辑，避免刷新时闪主题。 */
export function ThemeScript(): React.ReactElement {
  const code = `(function(){try{var K="${THEME_KEY}";var pref=function(){var v=null;try{v=localStorage.getItem(K);}catch(e){}return v==="light"||v==="dark"?v:"system";};var apply=function(){var p=pref();var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";};apply();window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",function(){if(pref()==="system")apply();});}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
