import React from "react";
import { CountBadge, TypeMark } from "../primitives";

export type RailNavItemProps<T extends React.ElementType = "button"> = {
  as?: T;
  active?: boolean;
  color: string;
  outlineColor?: string;
  label: React.ReactNode;
  count?: number;
  countPad?: number;
  trailing?: React.ReactNode;
  small?: boolean;
  className?: string;
  style?: React.CSSProperties;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "color" | "className" | "style" | "children">;

export function RailNavItem<T extends React.ElementType = "button">({
  as,
  active = false,
  color,
  outlineColor = color,
  label,
  count,
  countPad = 2,
  trailing,
  small = false,
  className = "",
  style,
  ...props
}: RailNavItemProps<T>) {
  const Component = (as ?? "button") as React.ElementType;
  return (
    <Component
      {...props}
      data-on={active}
      aria-current={active ? "page" : undefined}
      className={
        "grid w-full grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] border border-transparent px-2.5 text-left font-bold text-ink transition-colors hover:bg-hover data-[on=true]:bg-selected " +
        (small ? "py-[7px] text-sm " : "py-2 text-[15px] ") +
        className
      }
      style={{
        ...style,
        ...(active ? { outline: `2px solid ${outlineColor}`, outlineOffset: 2 } : {}),
      }}
    >
      <TypeMark color={color} />
      <span>{label}</span>
      {count !== undefined ? <CountBadge value={count} pad={countPad} /> : trailing}
    </Component>
  );
}
