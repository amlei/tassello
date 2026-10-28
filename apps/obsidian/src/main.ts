import { Notice, Plugin, PluginSettingTab, App, Setting } from "obsidian";
import { BackendApi } from "./core/api/client";
import { RemoteTaskEngine } from "./core/tasks/remote-task-engine";
import { PLATFORMS, type PlatformId, type PublishTask } from "./core/types";
import { PUBLISHER_VIEW_TYPE, PublisherView, type PublisherServices } from "./views/publisher-view";

type TasselloData = {
  settings?: {
    apiOrigin?: string;
    defaultPlatforms?: Partial<Record<import("./core/types").ContentType, PlatformId[]>>;
  };
  selectedPlatforms?: PlatformId[];
};

type PluginServices = PublisherServices & {
  saveData(): Promise<void>;
  publishCurrentFile(): Promise<void>;
};

class TasselloSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: TasselloPublisherPlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Tassello Publisher" });

    new Setting(containerEl)
      .setName("本机发布服务")
      .setDesc("Obsidian 与桌面端共用这个服务和同一条浏览器扩展连接。")
      .addText((text) => text
        .setValue(this.plugin.settings.apiOrigin)
        .setPlaceholder("http://127.0.0.1:4311")
        .onChange(async (value) => {
          this.plugin.settings.apiOrigin = value.trim() || "http://127.0.0.1:4311";
          await this.plugin.saveSettings();
        }));

    containerEl.createEl("h3", { text: "默认发布目标" });
    for (const type of ["article", "image"] as const) {
      new Setting(containerEl)
        .setName(type === "article" ? "Article defaults" : "Image defaults")
        .setDesc("frontmatter 未指定 platforms 时使用这些目标")
        .addButton((button) => {
          button.setButtonText("全选").onClick(async () => {
            this.plugin.settings.defaultPlatforms[type] = PLATFORMS.map((platform) => platform.id);
            await this.plugin.saveSettings();
            this.display();
          });
        })
        .addButton((button) => {
          button.setButtonText("清空").onClick(async () => {
            this.plugin.settings.defaultPlatforms[type] = [];
            await this.plugin.saveSettings();
            this.display();
          });
        });
      const row = containerEl.createDiv({ cls: "tassello-setting-chips" });
      for (const platform of PLATFORMS) {
        const selected = this.plugin.settings.defaultPlatforms[type]?.includes(platform.id) ?? false;
        const chip = row.createEl("button", { text: platform.name, cls: selected ? "active" : "" });
        chip.addEventListener("click", async () => {
          const current = this.plugin.settings.defaultPlatforms[type] ?? [];
          this.plugin.settings.defaultPlatforms[type] = selected
            ? current.filter((id) => id !== platform.id)
            : [...current, platform.id];
          await this.plugin.saveSettings();
          this.display();
        });
      }
    }

    containerEl.createEl("h3", { text: "安全" });
    containerEl.createEl("p", {
      text: "插件直接编辑当前 Vault 的 Markdown；发布任务与账号状态由本机后端统一管理，扩展不持有平台密码。",
      cls: "setting-item-description",
    });

    containerEl.createEl("h3", { text: "附件" });
    containerEl.createEl("p", {
      text: "插件沿用 Obsidian 的「文件与链接 → 新附件的默认位置」，不覆盖其中设置的 files/ 等目录。",
      cls: "setting-item-description",
    });
  }
}

export class TasselloPublisherPlugin extends Plugin {
  override settings: {
    apiOrigin: string;
    defaultPlatforms: Partial<Record<import("./core/types").ContentType, PlatformId[]>>;
  } = {
    apiOrigin: "http://127.0.0.1:4311",
    defaultPlatforms: {
      article: ["zhihu"],
      image: ["xhs", "weibo"],
    },
  };

  private selectedPlatforms: PlatformId[] = ["weibo", "zhihu", "xhs"];
  private api!: BackendApi;
  private engine!: RemoteTaskEngine;
  private saveTimer: number | null = null;
  services!: PluginServices;

  override async onload(): Promise<void> {
    const data = await this.loadData() as TasselloData | null;
    this.settings = {
      apiOrigin: data?.settings?.apiOrigin ?? "http://127.0.0.1:4311",
      defaultPlatforms: data?.settings?.defaultPlatforms ?? {
        article: ["zhihu"],
        image: ["xhs", "weibo"],
      },
    };
    this.selectedPlatforms = data?.selectedPlatforms ?? ["weibo", "zhihu", "xhs"];

    this.api = new BackendApi(this.settings.apiOrigin);
    this.engine = new RemoteTaskEngine(this.api);

    this.services = {
      app: this.app,
      api: this.api,
      engine: this.engine,
      getSelectedPlatforms: () => [...this.selectedPlatforms],
      getDefaultPlatforms: (type) => this.settings.defaultPlatforms[type] ?? [],
      setDefaultPlatforms: async (type, values) => {
        this.settings.defaultPlatforms[type] = values;
        await this.scheduleSave();
      },
      setSelectedPlatforms: async (values) => {
        this.selectedPlatforms = values;
        await this.scheduleSave();
      },
      saveData: () => this.saveSettings(),
      publishCurrentFile: async () => {
        const view = this.getActivePublisherView();
        if (!view) {
          await this.activateView();
          window.setTimeout(() => void this.getActivePublisherView()?.publishCurrent(), 80);
          return;
        }
        await view.publishCurrent();
      },
    };

    this.registerView(
      PUBLISHER_VIEW_TYPE,
      (leaf) => new PublisherView(leaf, this.services),
    );

    this.addRibbonIcon("send", "Tassello Publisher", () => void this.activateView());
    this.addCommand({ id: "open-publisher", name: "Open publisher", callback: () => void this.activateView() });
    this.addCommand({ id: "publish-current-note", name: "Publish current note", callback: () => void this.services.publishCurrentFile() });
    this.addSettingTab(new TasselloSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      void this.activateView(false);
    });
  }

  override onunload(): void {
    this.engine.dispose();
  }

  private getActivePublisherView(): PublisherView | null {
    const leaf = this.app.workspace.getLeavesOfType(PUBLISHER_VIEW_TYPE).at(-1);
    return leaf?.view instanceof PublisherView ? leaf.view : null;
  }

  private async activateView(focus = true): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(PUBLISHER_VIEW_TYPE).at(-1);
    const leaf = existing ?? this.app.workspace.getRightLeaf(false)!;
    if (!existing) await leaf.setViewState({ type: PUBLISHER_VIEW_TYPE, active: focus });
    if (focus) this.app.workspace.revealLeaf(leaf);
  }

  async saveSettings(): Promise<void> {
    await this.saveData({
      settings: this.settings,
      selectedPlatforms: this.selectedPlatforms,
    });
  }

  private async scheduleSave(): Promise<void> {
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      void this.saveSettings();
    }, 180);
  }
}

export default TasselloPublisherPlugin;
