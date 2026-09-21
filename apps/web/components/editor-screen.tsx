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

function fmtClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

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
  const [savedAt, setSavedAt] = React.useState(() => fmtClock(initialPost.updatedAt));
  const [tasks, setTasks] = React.useState(initialTasks);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  const dirtyRef = React.useRef(false);
  const saveTimer = React.useRef<number | null>(null);
  const pendingPatch = React.useRef<{ id: string; patch: Record<string, unknown> } | null>(null);
  const savingRef = React.useRef(false);

  /* 任务轮询：驱动浮动条 */
  React.useEffect(() => {
    const timer = setInterval(() => { void api.listTasks().then(setTasks).catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  }, []);

  /* 保存：900ms 防抖自动保存 + ⌘S；切换/发布前先冲刷落库 */
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
        setSavedAt(fmtClock(new Date().toISOString()));
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
    saveTimer.current = window.setTimeout(() => { void saveNow(); }, 900);
  }, [saveNow]);

  const back = () => {
    void (async () => {
      for (let i = 0; i < 3 && dirtyRef.current; i += 1) {
        if (!(await saveNow())) return;
      }
      router.push(`/library/${post.type}`);
      router.refresh();
    })();
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
      setSavedAt(fmtClock(new Date().toISOString()));
      const created = updated.assets.find((a) => !before.has(a.id));
      return created ? { id: created.id, color: created.color ?? "var(--onda-hover)", path: created.path } : null;
    } catch {
      return null;
    }
  };
  const removeImageAsset = (postId: string, assetId: string) => {
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
      setSavedAt(fmtClock(new Date().toISOString()));
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
      />
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <EditorView
          post={post}
          saveState={saveState}
          savedAt={savedAt}
          onChangeField={(k, v) => patchPost(post.id, { [k]: v })}
          onUploadImage={(file) => uploadImageForInsert(post.id, file)}
          onRemoveAsset={(assetId) => removeImageAsset(post.id, assetId)}
          onMoveImage={(from, to) => moveImageAsset(post.id, from, to)}
          onUploadMedia={(kind, file) => uploadMedia(post.id, kind, file)}
          onBack={back}
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

      <FloatingPill running={runningCount} avg={avgProgress} onClick={() => router.push("/queue")} />
    </div>
  );
}
