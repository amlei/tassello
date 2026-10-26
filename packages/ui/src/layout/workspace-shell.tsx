import React from "react";
import { WorkspaceSurface } from "./workspace-surface";

export function WorkspaceShell({
  titleBar,
  rail,
  children,
  screenLabel,
}: {
  titleBar: React.ReactNode;
  rail: React.ReactNode;
  children: React.ReactNode;
  screenLabel?: string;
}) {
  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden" data-screen-label={screenLabel}>
      {titleBar}
      <div className="flex min-h-0 flex-1 bg-rail">
        {rail}
        <WorkspaceSurface>{children}</WorkspaceSurface>
      </div>
    </div>
  );
}
