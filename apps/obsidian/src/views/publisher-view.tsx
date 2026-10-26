import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import { PublisherApp } from "./publisher-app";

export const PUBLISHER_VIEW_TYPE = "tassello-publisher-view";

export type PublisherServices = {
  app: import("obsidian").App;
  api: import("../core/api/client").BackendApi;
  engine: import("../core/tasks/remote-task-engine").RemoteTaskEngine;
  getSelectedPlatforms(): PlatformId[];
  setSelectedPlatforms(values: PlatformId[]): Promise<void>;
  getDefaultPlatforms(type: import("../core/types").ContentType): PlatformId[];
  setDefaultPlatforms(type: import("../core/types").ContentType, values: PlatformId[]): Promise<void>;
  publishCurrentFile(): Promise<void>;
};

type PlatformId = string;

export class PublisherView extends ItemView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly services: PublisherServices,
  ) {
    super(leaf);
    this.navigation = false;
  }

  override getViewType(): string {
    return PUBLISHER_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "Tassello Publisher";
  }

  override getIcon(): string {
    return "send";
  }

  publishCurrent(): void {
    this.contentEl.dispatchEvent(new Event("tassello:publish-current"));
  }

  override async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("tassello-publisher");
    this.root = createRoot(this.contentEl);
    this.root.render(<PublisherApp services={this.services} host={this.contentEl} />);
  }

  override async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
  }
}
