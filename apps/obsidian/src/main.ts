import { Notice, Plugin, PluginSettingTab, App, Setting, TFile, normalizePath } from "obsidian";
import { DefaultChromeManager } from "./core/browser/default-chrome";
import { TaskEngine } from "./core/tasks/task-engine";
import { TaskStore } from "./core/tasks/task-store";
import { PLATFORMS, type PlatformId, type PublishTask } from "./core/types";
import { PublicationLedger } from "./core/publication-ledger/publication-ledger";
import { PUBLISHER_VIEW_TYPE, PublisherView, type PublisherServices } from "./views/publisher-view";

type ChromeChannel = "stable" | "beta" | "canary" | "dev";

type TasselloData = {
  settings?: {
    chromeChannel?: ChromeChannel;
    defaultPlatforms?: Partial<Record<import("./core/types").ContentType, PlatformId[]>>;
    publicationBasePath?: string;
    publicationAutoCreate?: boolean;
    publicationIncludeFailReason?: boolean;
  };
  publicationMigrationVersion?: number;
  selectedPlatforms?: PlatformId[];
  tasks?: PublishTask[];
};

type PluginServices = PublisherServices & {
  saveData(): Promise<void>;
  publishCurrentFile(): Promise<void>;
};

class TasselloSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: TasselloPublisherPlugin,
    private readonly browser: DefaultChromeManager,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Tassello Publisher" });

    new Setting(containerEl)
      .setName("Chrome channel")
      .setDesc("插件只读取该 Chrome 频道目录下的 DevToolsActivePort。")
      .addDropdown((dropdown) => {
        dropdown
          .addOptions({
            stable: "Chrome Stable",
            beta: "Chrome Beta",
            canary: "Chrome Canary",
            dev: "Chrome Dev",
          })
          .setValue(this.plugin.settings.chromeChannel)
          .onChange(async (value) => {
            this.plugin.settings.chromeChannel = value as ChromeChannel;
            this.browser.channel = this.plugin.settings.chromeChannel;
            this.browser.disconnect();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Open Chrome remote debugging")
      .setDesc("在 Chrome 打开 chrome://inspect/#remote-debugging，开启开关，并在插件连接时选择允许。")
      .addButton((button) => {
        button.setButtonText("重新连接").onClick(() => {
          void this.browser.connect().catch((error) => {
            new Notice(error instanceof Error ? error.message : String(error));
          });
        });
      });

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

    containerEl.createEl("h3", { text: "发布库" });
    new Setting(containerEl)
      .setName("Publication base path")
      .setDesc("插件只维护这个 Base 文件；发布状态写回各篇 Markdown 的 frontmatter。")
      .addText((text) => {
        text
          .setValue(this.plugin.settings.publicationBasePath)
          .onChange(async (value) => {
            this.plugin.settings.publicationBasePath = value;
            this.plugin.ledger.updateSettings({
              basePath: value,
              autoCreate: this.plugin.settings.publicationAutoCreate,
              includeFailReason: this.plugin.settings.publicationIncludeFailReason,
            });
            await this.plugin.saveSettings();
          });
      });
    new Setting(containerEl)
      .setName("自动创建发布库")
      .setDesc("路径不存在时创建默认 Publishments.base。")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.publicationAutoCreate)
          .onChange(async (value) => {
            this.plugin.settings.publicationAutoCreate = value;
            this.plugin.ledger.updateSettings({
              basePath: this.plugin.settings.publicationBasePath,
              autoCreate: value,
              includeFailReason: this.plugin.settings.publicationIncludeFailReason,
            });
            await this.plugin.saveSettings();
          });
      });
    new Setting(containerEl)
      .setName("保存失败原因")
      .setDesc("把平台失败原因写入对应笔记的发布属性。")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.publicationIncludeFailReason)
          .onChange(async (value) => {
            this.plugin.settings.publicationIncludeFailReason = value;
            this.plugin.ledger.updateSettings({
              basePath: this.plugin.settings.publicationBasePath,
              autoCreate: this.plugin.settings.publicationAutoCreate,
              includeFailReason: value,
            });
            await this.plugin.saveSettings();
          });
      });
    new Setting(containerEl)
      .setName("打开发布库")
      .setDesc("创建或刷新默认 Base，然后在主工作区打开。")
      .addButton((button) => {
        button.setButtonText("打开").onClick(() => {
          void this.plugin.services.openPublicationBase().catch((error) => {
            new Notice(error instanceof Error ? error.message : String(error));
          });
        });
      });

    containerEl.createEl("h3", { text: "安全" });
    containerEl.createEl("p", {
      text: "插件只读取当前 Vault 文件和本机 Chrome 的 DevToolsActivePort；发布始终停在人工确认，不会自动点击最终发布。",
      cls: "setting-item-description",
    });
  }
}

export class TasselloPublisherPlugin extends Plugin {
  override settings: {
    chromeChannel: ChromeChannel;
    defaultPlatforms: Partial<Record<import("./core/types").ContentType, PlatformId[]>>;
    publicationBasePath: string;
    publicationAutoCreate: boolean;
    publicationIncludeFailReason: boolean;
  } = {
    chromeChannel: "stable",
    defaultPlatforms: {
      article: ["zhihu"],
      image: ["xhs", "weibo"],
    },
    publicationBasePath: "Tassello/Publishments.base",
    publicationAutoCreate: true,
    publicationIncludeFailReason: true,
  };

  private publicationMigrationVersion = 0;

  private selectedPlatforms: PlatformId[] = ["weibo", "zhihu", "xhs"];
  private browser!: DefaultChromeManager;
  private store!: TaskStore;
  private engine!: TaskEngine;
  ledger!: PublicationLedger;
  private dataTasks: PublishTask[] = [];
  private saveTimer: number | null = null;
  services!: PluginServices;

  override async onload(): Promise<void> {
    const data = await this.loadData() as TasselloData | null;
    this.settings = {
      chromeChannel: data?.settings?.chromeChannel ?? "stable",
      defaultPlatforms: data?.settings?.defaultPlatforms ?? {
        article: ["zhihu"],
        image: ["xhs", "weibo"],
      },
      publicationBasePath: data?.settings?.publicationBasePath ?? "Tassello/Publishments.base",
      publicationAutoCreate: data?.settings?.publicationAutoCreate ?? true,
      publicationIncludeFailReason: data?.settings?.publicationIncludeFailReason ?? true,
    };
    this.publicationMigrationVersion = data?.publicationMigrationVersion ?? 0;
    this.selectedPlatforms = data?.selectedPlatforms ?? ["weibo", "zhihu", "xhs"];
    this.dataTasks = data?.tasks ?? [];

    this.browser = new DefaultChromeManager(this.settings.chromeChannel);
    this.store = new TaskStore(async (tasks) => {
      this.dataTasks = tasks;
      await this.scheduleSave();
    });
    this.store.load(this.dataTasks);
    this.ledger = new PublicationLedger(this.app, {
      basePath: this.settings.publicationBasePath,
      autoCreate: this.settings.publicationAutoCreate,
      includeFailReason: this.settings.publicationIncludeFailReason,
    });
    this.engine = new TaskEngine(this.app, this.browser, this.store, this.ledger);

    this.services = {
      app: this.app,
      browser: this.browser,
      engine: this.engine,
      getSelectedPlatforms: () => [...this.selectedPlatforms],
      getDefaultPlatforms: (type) => this.settings.defaultPlatforms[type] ?? [],
      setSelectedPlatforms: async (values) => {
        this.selectedPlatforms = values;
        await this.scheduleSave();
      },
      saveData: () => this.saveSettings(),
      openPublicationBase: async () => {
        const file = await this.ledger.ensureBase();
        if (file) await this.app.workspace.getLeaf(false).openFile(file);
      },
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
    this.addCommand({ id: "open-publication-base", name: "Open publication base", callback: () => void this.services.openPublicationBase() });
    this.addCommand({
      id: "connect-default-chrome",
      name: "Connect default Chrome",
      callback: () => {
        void this.browser.connect().catch((error) => {
          new Notice(error instanceof Error ? error.message : String(error));
        });
      },
    });
    this.addCommand({
      id: "disconnect-default-chrome",
      name: "Disconnect default Chrome",
      callback: () => this.browser.disconnect(),
    });
    this.addSettingTab(new TasselloSettingTab(this.app, this, this.browser));

    this.app.workspace.onLayoutReady(() => {
      // 启动即自动连接默认 Chrome（approval 模式：Chrome 弹一次授权框，允许后整会话有效）
      void this.browser.connect().catch(() => {
        // 静默失败：状态条保持 disconnected + detail，用户可手动重连
      });
      void this.activateView(false);
      void (async () => {
        await this.engine.markInterruptedOnLoad();
        await this.initializePublicationLedger();
      })();
    });

    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (!(file instanceof TFile)) return;
      void this.engine.renamePath(oldPath, file.path);
    }));
  }

  override onunload(): void {
    void this.engine.markInterruptedOnUnload();
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

  private async initializePublicationLedger(): Promise<void> {
    try {
      await this.ledger.ensureBase();
      if (this.publicationMigrationVersion < 1) {
        const tasks = this.store.all();
        await this.ledger.syncTasks(tasks);
        this.store.replace(tasks.filter((task) =>
          task.status === "failed" ||
          task.status === "queued" ||
          task.status === "running" ||
          task.status === "awaiting_confirm",
        ));
        this.publicationMigrationVersion = 1;
        await this.saveSettings();
      }
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }

  async saveSettings(): Promise<void> {
    const tasks = this.dataTasks;
    await this.saveData({
      settings: this.settings,
      selectedPlatforms: this.selectedPlatforms,
      publicationMigrationVersion: this.publicationMigrationVersion,
      tasks,
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
