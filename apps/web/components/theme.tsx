"use client";

import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import React from "react";
import {
  applyTheme,
  getThemePref,
  setThemePref,
  ThemeScript,
  type ThemePref,
} from "@tassello/site-ui/theme";

export type { ThemePref };
export { applyTheme, getThemePref, setThemePref, ThemeScript };

/* 外观切换只在桌面设置弹层里挂载 */
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
      {opts.map((option) => (
        <ToggleButton
          key={option.id}
          id={option.id}
          className={
            "h-auto rounded-full px-3 py-1 text-xs font-bold transition-colors " +
            (pref === option.id ? "bg-accent text-white" : "bg-transparent text-ink2 data-[hovered=true]:bg-hover")
          }
          onPress={() => pick(option.id)}
        >
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
