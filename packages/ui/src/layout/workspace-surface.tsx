import React from "react";

export type WorkspaceSurfaceVariant = "rail-adjacent" | "inset" | "plain";

const RADIUS: Record<WorkspaceSurfaceVariant, string> = {
  "rail-adjacent": "rounded-tl-[14px]",
  inset: "rounded-[16px]",
  plain: "",
};

export function WorkspaceSurface<T extends React.ElementType = "main">({
  as,
  variant = "rail-adjacent",
  className = "",
  children,
  ...props
}: {
  as?: T;
  variant?: WorkspaceSurfaceVariant;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">) {
  const Component = (as ?? "main") as React.ElementType;
  return (
    <Component className={"flex min-h-0 min-w-0 flex-1 flex-col bg-paper " + RADIUS[variant] + " " + className} {...props}>
      {children}
    </Component>
  );
}
