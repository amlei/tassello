import type { ReactNode } from "react";
import { SiteChrome } from "@tassello/site-ui/site-chrome";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
