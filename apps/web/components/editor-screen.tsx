/* editor-screen —— 编辑器页（客户端）：自动保存 + 素材 + 发布流程（从 workbench 拆出） */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { AppSettings, AssetDTO, PlatformDTO, PostDTO, TaskDTO, ContentType } from "@tassello/shared";
import { api } from "./api";
import { Rail } from "./rail";
import { EditorView } from "./editor";
import { PublishSheet } from "./publish";
import { FloatingPill } from "./bits";
import { Button, Modal } from "@heroui/react";

export function EditorScreen({
  post: initialPost, platforms: initialPlatforms, settings: initialSettings, counts, initialTasks,
}: {
  post: PostDTO;
  platforms: PlatformDTO[];
  settings: AppSettings;
  counts: Record<string, number>;
  initialTasks: TaskDTO[];
}) {
  const router = useRouter();
  const [post, setPost] = React.useState(initialPost);
  const [platforms, setPlatforms] = React.useState(initialPlatforms);
  const [settings, setSettings] = React.useState(initialSettings);
  const [saveState, setSaveState] = React.useState<"saved" | "dirty" | "saving">("saved");
  const [tasks, setTasks] = React.useState(initialTasks);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  /* 未保存离开确认：pendingLeave 存放被拦下的动作 */
  const [pendingLeave, setPendingLeave] = React.useState<(() => void) | null>(null);

  const dirtyRef = React.useRef(false);
  const saveTimer = React.useRef<number | null>(null);
  const pendingPatch = React.useRef<{ id: string; patch: Record<string, unknown> } | null>(null);
  const savingRef = React.useRef(false);

  /* 任务轮询：驱动浮动条 */
  React.useEffect(() => {
    const timer = setInterval(() => { void api.listTasks().then(setTasks).catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  }, []);

  /* 保存：停手 2.5s 自动保存一次（再输入重新计时）；手动保存 / ⌘S 随时插队并取消排队的自动保存；
     切换/发布前先冲刷落库 */
  const saveNow = React.useCallback(async (): Promise<boolean> => {
    if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
    const pending = pendingPatch.current;
    if (!pending || savingRef.current) return !pendingPatch.current;
    savingRef.current = true;
    setSaveState("saving");
    try {
      await api.updatePost(pending.id, pending.patch as Parameters<typeof api.updatePost>[1]);
      if (pendingPatch.current === pending) pendingPatch.current = null;
      if (!pendingPatch.current) {
        dirtyRef.current = false;
        setSaveState("saved");
      } else {
        setSaveState("dirty");
      }
      return true;
    } catch {
      setSaveState("dirty");
      return false;
    } finally {
      savingRef.current = false;
    }
  }, []);

  const patchPost = React.useCallback((id: string, patch: Record<string, unknown>) => {
    setPost((p) => (p && p.id === id ? { ...p, ...patch } as PostDTO : p));
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveState("dirty");
    dirtyRef.current = true;
    const prev = pendingPatch.current;
    pendingPatch.current = prev && prev.id === id ? { id, patch: { ...prev.patch, ...patch } } : { id, patch };
    saveTimer.current = window.setTimeout(() => { void saveNow(); }, 2500);
  }, [saveNow]);

  /* 离开守卫：脏着就拦下动作弹三选一；真·离开页面（刷新 / 关闭）走 beforeunload 原生确认 */
  const leaveGuard = React.useCallback((action: () => void) => {
    if (dirtyRef.current) setPendingLeave(() => action);
    else action();
  }, []);
  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  const go = (href: string) => { router.push(href); router.refresh(); };
  const confirmLeave = async (save: boolean) => {
    const action = pendingLeave;
    setPendingLeave(null);
    if (!action) return;
    if (save) {
      const ok = await saveNow();
      if (!ok) return; /* 保存失败留在编辑器，脏状态原样保留 */
    } else if (saveTimer.current) {
      /* 不保存：取消排着的自动保存，改动随离开丢弃 */
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      pendingPatch.current = null;
    }
    dirtyRef.current = false; /* 放行 beforeunload */
    action();
  };

  /* 素材操作 */
  const mutateAssets = (postId: string, fn: (assets: AssetDTO[]) => AssetDTO[]) => {
    setPost((p) => (p && p.id === postId ? { ...p, assets: fn(p.assets) } : p));
  };
  /** 上传图片并返回新素材（正文插图/粘贴：真实文件落盘） */
  const uploadImageForInsert = async (postId: string, file: File): Promise<{ id: string; color: string; path?: string | null } | null> => {
    try {
      const before = new Set(post.assets.map((a) => a.id));
      const updated = await api.uploadMedia(postId, "image", file);
      setPost((p) => (p && p.id === postId ? updated : p));
      const created = updated.assets.find((a) => !before.has(a.id));
      return created ? { id: created.id, color: created.color ?? "var(--onda-hover)", path: created.path } : null;
    } catch {
      return null;
    }
  };
  /** 删除素材（图片/视频/音频通用）：本地收走 + API 落库 */
  const removeAsset = (postId: string, assetId: string) => {
    mutateAssets(postId, (as) => as.filter((a) => a.id !== assetId));
    void api.removeAsset(postId, assetId);
  };
  const moveImageAsset = (postId: string, from: number, to: number) => {
    // 在 updater 外算好新序并写回：updater 在 StrictMode 下会执行两次，副作用（API）不能放里面
    const ids = post.assets.map((a) => a.id);
    if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return;
    const nextIds = ids.slice();
    const [movedId] = nextIds.splice(from, 1);
    nextIds.splice(to, 0, movedId!);
    mutateAssets(postId, (as) => {
      if (from === to || from < 0 || to < 0 || from >= as.length || to >= as.length) return as;
      const next = as.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
    void api.reorderAssets(postId, nextIds);
  };
  const uploadMedia = async (postId: string, kind: "video" | "audio" | "image", file: File): Promise<void> => {
    try {
      const updated = await api.uploadMedia(postId, kind, file);
      setPost((p) => (p && p.id === postId ? updated : p));
    } catch {}
  };

  /* 发布 */
  const runningCount = tasks.filter((t) => t.status === "running").length;
  const avgProgress = runningCount
    ? Math.round(tasks.filter((t) => t.status === "running").reduce((sum, t) => sum + t.progress, 0) / runningCount)
    : 0;

  const openPublishSheet = async () => {
    if (dirtyRef.current && !(await saveNow())) return;
    const want = settings.defaultTargets[post.type as ContentType] ?? [];
    setSelectedIds(
      platforms
        .filter((p) => p.status === "active" && p.account?.state === "ok" && p.supports.includes(post.type) && want.includes(p.id))
        .map((p) => p.id),
    );
    setSheetOpen(true);
  };
  const confirmPublish = async () => {
    try {
      const created = await api.publish(post.id, selectedIds);
      setTasks((ts) => [...created, ...ts]);
    } catch {}
    setSheetOpen(false);
    setSelectedIds([]);
    router.refresh();
  };

  return (
    <div className="flex h-screen min-h-0 overflow-hidden" data-screen-label="编辑器">
      <Rail
        active={post.type}
        counts={counts}
        runningCount={runningCount}
        queueCount={tasks.length}
        platforms={platforms}
        guard={leaveGuard}
      />
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <EditorView
          post={post}
          saveState={saveState}
          onChangeField={(k, v) => patchPost(post.id, { [k]: v })}
          onUploadImage={(file) => uploadImageForInsert(post.id, file)}
          onRemoveAsset={(assetId) => removeAsset(post.id, assetId)}
          onMoveImage={(from, to) => moveImageAsset(post.id, from, to)}
          onUploadMedia={(kind, file) => uploadMedia(post.id, kind, file)}
          onBack={() => leaveGuard(() => go(`/library/${post.type}`))}
          onPublish={() => void openPublishSheet()}
          onSave={() => void saveNow()}
        />
      </div>

      {sheetOpen && (
        <PublishSheet
          post={post}
          platforms={platforms}
          selectedIds={selectedIds}
          onToggle={(id) => setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
          onReacquire={(id) => { void api.accountAction(id, "acquire").then(() => api.listPlatforms()).then(setPlatforms).catch(() => {}); }}
          onClose={() => setSheetOpen(false)}
          onConfirm={() => void confirmPublish()}
        />
      )}

      <FloatingPill running={runningCount} avg={avgProgress} onClick={() => leaveGuard(() => go("/queue"))} />

      {/* 未保存离开确认：三选一（取消 / 不保存并离开 / 保存并离开） */}
      {pendingLeave && (
        <Modal>
          <Modal.Backdrop isOpen onOpenChange={(o) => { if (!o) setPendingLeave(null); }}>
            <Modal.Container>
              <Modal.Dialog className="max-w-[440px] rounded-2xl bg-paper p-6 shadow-[0_14px_40px_rgba(15,15,15,0.14)]" role="alertdialog" aria-label="未保存提示">
                <Modal.Heading className="text-[17px] font-bold tracking-[-0.2px]">有未保存的改动</Modal.Heading>
                <p className="mt-2 text-[13.5px] leading-[1.7] text-ink2">「{post.title || "未命名稿子"}」的改动还没有保存，离开后会丢失。要怎么处理？</p>
                <div className="mt-[22px] flex items-center justify-end gap-2.5">
                  <Button
                    variant="ghost"
                    className="rounded-full px-3.5 py-2 text-[13.5px] font-bold text-ink2 data-[hovered=true]:bg-hover data-[hovered=true]:text-ink"
                    onPress={() => setPendingLeave(null)}
                  >
                    取消
                  </Button>
                  <Button
                    variant="ghost"
                    className="rounded-full px-3.5 py-2 text-[13.5px] font-bold text-error data-[hovered=true]:bg-error/10"
                    onPress={() => void confirmLeave(false)}
                  >
                    不保存并离开
                  </Button>
                  <Button
                    className="rounded-full bg-accent px-5 py-2 text-[13.5px] font-bold text-white data-[hovered=true]:brightness-105"
                    onPress={() => void confirmLeave(true)}
                  >
                    保存并离开
                  </Button>
                </div>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      )}
    </div>
  );
}
