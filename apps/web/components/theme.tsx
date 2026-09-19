/* theme —— 主题偏好：浅色 / 深色 / 跟随系统（默认系统） */
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

/* 首屏防闪烁：在 body 渲染前按偏好落 data-theme */
export function ThemeScript(): React.ReactElement {
  const code = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"system";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;
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

/* 外观切换：三段选择器（浅色 / 深色 / 跟随系统） */
export function ThemeSwitcher(): React.ReactElement {
  const [pref, setPref] = React.useState<ThemePref>("system");

  React.useEffect(() => {
    setPref(getThemePref());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getThemePref() === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

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
    <div className="inline-flex items-center gap-1 rounded-full border border-line bg-card p-1" role="radiogroup" aria-label="外观">
      {opts.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={pref === o.id}
          className={
            "rounded-full px-3 py-1 text-xs font-bold transition-colors " +
            (pref === o.id ? "bg-accent text-white" : "text-ink2 hover:bg-hover")
          }
          onClick={() => pick(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
