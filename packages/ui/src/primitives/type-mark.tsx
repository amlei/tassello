import type React from "react";

export function TypeMark({
  color,
  size = 14,
  radius = 4,
  className = "",
  style,
}: {
  color: string;
  size?: number;
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={"block flex-none " + className}
      style={{ width: size, height: size, borderRadius: radius, background: color, ...style }}
    />
  );
}
