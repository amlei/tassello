import React from "react";
import { Button } from "@heroui/react";

type HeroButtonProps = React.ComponentProps<typeof Button>;
export type AppButtonTone = "primary" | "secondary" | "ghost" | "danger";

const TONE: Record<AppButtonTone, string> = {
  primary:
    "rounded-full bg-accent text-white data-[hovered=true]:brightness-105 data-[disabled=true]:opacity-50",
  secondary:
    "rounded-full border border-line bg-paper text-ink data-[hovered=true]:bg-hover data-[disabled=true]:opacity-50",
  ghost:
    "rounded-[10px] text-ink data-[hovered=true]:bg-hover data-[disabled=true]:opacity-50",
  danger:
    "rounded-full bg-error text-white data-[hovered=true]:brightness-105 data-[disabled=true]:opacity-50",
};

export function AppButton({
  tone = "secondary",
  variant = "ghost",
  className = "",
  ...props
}: Omit<HeroButtonProps, "variant"> & {
  tone?: AppButtonTone;
  variant?: HeroButtonProps["variant"];
}) {
  return <Button variant={variant} className={TONE[tone] + " " + className} {...props} />;
}
