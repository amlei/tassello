import React from "react";
import { Button } from "@heroui/react";

type HeroButtonProps = React.ComponentProps<typeof Button>;

export function IconButton({
  label,
  children,
  className = "",
  ...props
}: Omit<HeroButtonProps, "children" | "isIconOnly"> & {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      isIconOnly
      variant="ghost"
      aria-label={label}
      className={"min-w-0 rounded-[9px] text-ink2 data-[hovered=true]:bg-hover data-[hovered=true]:text-ink " + className}
      {...props}
    >
      {children}
    </Button>
  );
}
