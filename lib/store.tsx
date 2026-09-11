"use client";

// 全局状态：React Context + useReducer，持久化到 localStorage。
// 模拟发布引擎也驻留在这里：任务按阶段推进，失败是确定性的——
// 内容违反目标平台硬约束时，该任务以具体原因失败；合法内容则成功。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type { ReactNode } from "react";
import type {
  Content,
  ContentTypeId,
  JobStage,
  PublishJob,
} from "./types";
import { PLATFORMS, platformById, validateForPlatform } from "./platforms";
import { contentTypeMeta } from "./content-types";

const CONTENTS_KEY = "pugao.contents.v1";
const JOBS_KEY = "pugao.jobs.v1";

interface AppState {
  hydrated: boolean;
  contents: Content[];
  jobs: PublishJob[];
}

type Action =
  | { type: "hydrate"; contents: Content[]; jobs: PublishJob[] }
  | { type: "createContent"; content: Content }
  | { type: "updateContent"; id: string; patch: Partial<Content> }
  | { type: "deleteContent"; id: string }
  | { type: "enqueueJobs"; jobs: PublishJob[] }
  | { type: "patchJob"; id: string; patch: Partial<PublishJob> }
  | { type: "removeJobs"; ids: string[] };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return { hydrated: true, contents: action.contents, jobs: action.jobs };
    case "createContent":
      return { ...state, contents: [action.content, ...state.contents] };
    case "updateContent":
      return {
        ...state,
        contents: state.contents.map((c) =>
          c.id === action.id
            ? { ...c, ...action.patch, updatedAt: Date.now() }
            : c,
        ),
      };
    case "deleteContent":
      return {
        ...state,
        contents: state.contents.filter((c) => c.id !== action.id),
        jobs: state.jobs.filter((j) => j.contentId !== action.id),
      };
    case "enqueueJobs":
      return { ...state, jobs: [...state.jobs, ...action.jobs] };
    case "patchJob":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.id ? { ...j, ...action.patch } : j,
        ),
      };
    case "removeJobs":
      return {
        ...state,
        jobs: state.jobs.filter((j) => !action.ids.includes(j.id)),
      };
    default:
      return state;
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function createDraft(type: ContentTypeId): Content {
  const now = Date.now();
  return {
    id: newId(),
    type,
    title: "",
    body: "",
    summary: "",
    tags: [],
    assets: [],
    duration: "",
    platforms: [],
    createdAt: now,
    updatedAt: now,
  };
}

function seedContents(): Content[] {
  const now = Date.now();
  return [
    {
      id: newId(),
      type: "longform",
      title: "为什么内容本身才是发布工具的主体",
      summary: "平台是出口，不是导航对象。",
      body: "## 从一个判断开始\n\n这个应用的主体不是平台，而是内容本身。\n\n用户打开它，第一眼看到的应该是「我有哪些稿子」，而不是「我连了哪些平台」。\n\n## 一份稿子，多种版面\n\n制版车间的日常，就是同一份内容被排成多种版面、分发到不同渠道。",
      tags: ["产品笔记", "发布"],
      assets: [],
      duration: "",
      platforms: ["wechat", "zhihu"],
      createdAt: now - 86400000 * 2,
      updatedAt: now - 3600000,
    },
    {
      id: newId(),
      type: "gallery",
      title: "制版间的下午",
      summary: "",
      body: "色标条、规矩线和一排晾着的样张。",
      tags: ["摄影"],
      assets: [
        { id: newId(), kind: "image", note: "3000 × 2000 · 占位素材" },
        { id: newId(), kind: "image", note: "3000 × 2000 · 占位素材" },
        { id: newId(), kind: "image", note: "2400 × 3000 · 占位素材" },
      ],
      duration: "",
      platforms: ["wechat", "xiaohongshu"],
      createdAt: now - 86400000,
      updatedAt: now - 7200000,
    },
  ];
}

/** 各阶段基础耗时（毫秒），再乘以平台耗时系数 */
const STAGE_MS: Record<Exclude<JobStage, "queued" | "done">, number> = {
  render: 700,
  assets: 500,
  fill: 600,
  review: 900,
};

const STAGE_LABEL: Record<JobStage, string> = {
  queued: "排队中",
  render: "渲染排版",
  assets: "上传素材",
  fill: "填充编辑器",
  review: "等待人工确认",
  done: "完成",
};

export { STAGE_LABEL };

interface AppContextValue {
  state: AppState;
  createContent: (type: ContentTypeId) => Content;
  updateContent: (id: string, patch: Partial<Content>) => void;
  deleteContent: (id: string) => void;
  publish: (contentId: string, platformIds: string[]) => void;
  retryJob: (id: string) => void;
  cancelJob: (id: string) => void;
  clearFinishedJobs: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    hydrated: false,
    contents: [],
    jobs: [],
  });

  // 挂载时从 localStorage 恢复；刷新前仍在运行的任务重新排队，继续执行
  useEffect(() => {
    let contents: Content[] = [];
    let jobs: PublishJob[] = [];
    try {
      const rawContents = localStorage.getItem(CONTENTS_KEY);
      const rawJobs = localStorage.getItem(JOBS_KEY);
      if (rawContents) {
        contents = JSON.parse(rawContents) as Content[];
      } else {
        contents = seedContents();
      }
      if (rawJobs) {
        jobs = (JSON.parse(rawJobs) as PublishJob[]).map((j) =>
          j.status === "running"
            ? {
                ...j,
                status: "queued" as const,
                stage: "queued" as const,
                progress: 0,
                message: "页面刷新后继续排队",
                startedAt: null,
              }
            : j,
        );
      }
    } catch {
      contents = seedContents();
      jobs = [];
    }
    dispatch({ type: "hydrate", contents, jobs });
  }, []);

  // 状态变更后持久化
  useEffect(() => {
    if (!state.hydrated) return;
    try {
      localStorage.setItem(CONTENTS_KEY, JSON.stringify(state.contents));
      localStorage.setItem(JOBS_KEY, JSON.stringify(state.jobs));
    } catch {
      // localStorage 不可用时静默降级，界面照常工作
    }
  }, [state]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // —— 模拟发布引擎 ——
  // 每次状态变化后检查：没有运行中的任务就提拔队首；
  // 有运行中的任务就为它安排下一步推进。发布不阻塞界面。
  useEffect(() => {
    if (!state.hydrated) return;
    const running = state.jobs.find((j) => j.status === "running");
    if (!running) {
      const next = state.jobs.find((j) => j.status === "queued");
      if (next) {
        dispatch({
          type: "patchJob",
          id: next.id,
          patch: {
            status: "running",
            stage: "render",
            progress: 5,
            message: "正在渲染排版",
            startedAt: Date.now(),
          },
        });
      }
      return;
    }

    const platform = platformById(running.platformId);
    const speed = platform?.speed ?? 1;
    const content = state.contents.find((c) => c.id === running.contentId);
    const assetCount = content?.assets.length ?? 0;
    const base = STAGE_MS[running.stage as Exclude<JobStage, "queued" | "done">] ?? 500;
    // 素材阶段按素材数量线性增加，模拟逐张上传
    const delay =
      running.stage === "assets"
        ? (STAGE_MS.assets + assetCount * 320) * speed
        : base * speed;

    const timer = setTimeout(() => {
      const current = stateRef.current.jobs.find((j) => j.id === running.id);
      if (!current || current.status !== "running") return;

      // 确定性失败：内容违反目标平台硬约束时，渲染后失败并指明原因与数值
      if (current.stage === "render" && platform && content) {
        const problems = validateForPlatform(content, platform);
        if (problems.length > 0) {
          dispatch({
            type: "patchJob",
            id: current.id,
            patch: {
              status: "failed",
              stage: "done",
              progress: 100,
              message: problems.join("；"),
              finishedAt: Date.now(),
            },
          });
          return;
        }
      }

      switch (current.stage) {
        case "render":
          dispatch({
            type: "patchJob",
            id: current.id,
            patch: {
              stage: "assets",
              progress: 30,
              message:
                assetCount > 0
                  ? `正在上传第 ${Math.min(assetCount, 1)} / ${assetCount} 个素材`
                  : "无素材，跳过上传",
            },
          });
          break;
        case "assets": {
          // 素材较多时在阶段内逐张推进
          const uploaded = Math.min(
            assetCount,
            Math.max(1, Math.round(((current.progress - 30) / 30) * assetCount)),
          );
          if (assetCount > 0 && uploaded < assetCount) {
            const nextCount = uploaded + 1;
            dispatch({
              type: "patchJob",
              id: current.id,
              patch: {
                progress: 30 + Math.round((nextCount / assetCount) * 30),
                message: `正在上传第 ${nextCount} / ${assetCount} 个素材`,
              },
            });
          } else {
            dispatch({
              type: "patchJob",
              id: current.id,
              patch: { stage: "fill", progress: 65, message: "正在填充编辑器" },
            });
          }
          break;
        }
        case "fill":
          dispatch({
            type: "patchJob",
            id: current.id,
            patch: {
              stage: "review",
              progress: 85,
              message: "等待人工确认（模拟）",
            },
          });
          break;
        case "review":
          dispatch({
            type: "patchJob",
            id: current.id,
            patch: {
              status: "succeeded",
              stage: "done",
              progress: 100,
              message: "已发布",
              finishedAt: Date.now(),
            },
          });
          break;
        default:
          break;
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [state]);

  const createContent = useCallback((type: ContentTypeId): Content => {
    const draft = createDraft(type);
    dispatch({ type: "createContent", content: draft });
    return draft;
  }, []);

  const updateContent = useCallback((id: string, patch: Partial<Content>) => {
    dispatch({ type: "updateContent", id, patch });
  }, []);

  const deleteContent = useCallback((id: string) => {
    dispatch({ type: "deleteContent", id });
  }, []);

  const publish = useCallback((contentId: string, platformIds: string[]) => {
    const content = stateRef.current.contents.find((c) => c.id === contentId);
    if (!content) return;
    const now = Date.now();
    const jobs: PublishJob[] = platformIds
      .filter((id) => platformById(id))
      .map((platformId) => ({
        id: newId(),
        contentId,
        platformId,
        status: "queued" as const,
        stage: "queued" as const,
        progress: 0,
        message: "排队中",
        attempt: 1,
        createdAt: now,
        startedAt: null,
        finishedAt: null,
      }));
    if (jobs.length > 0) dispatch({ type: "enqueueJobs", jobs });
  }, []);

  const retryJob = useCallback((id: string) => {
    const job = stateRef.current.jobs.find((j) => j.id === id);
    if (!job || job.status !== "failed") return;
    dispatch({
      type: "patchJob",
      id,
      patch: {
        status: "queued",
        stage: "queued",
        progress: 0,
        message: "已重新排队",
        attempt: job.attempt + 1,
        startedAt: null,
        finishedAt: null,
      },
    });
  }, []);

  const cancelJob = useCallback((id: string) => {
    const job = stateRef.current.jobs.find((j) => j.id === id);
    if (!job || job.status !== "queued") return;
    dispatch({
      type: "patchJob",
      id,
      patch: {
        status: "canceled",
        stage: "done",
        message: "已取消",
        finishedAt: Date.now(),
      },
    });
  }, []);

  const clearFinishedJobs = useCallback(() => {
    const ids = stateRef.current.jobs
      .filter(
        (j) =>
          j.status === "succeeded" ||
          j.status === "failed" ||
          j.status === "canceled",
      )
      .map((j) => j.id);
    if (ids.length > 0) dispatch({ type: "removeJobs", ids });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      createContent,
      updateContent,
      deleteContent,
      publish,
      retryJob,
      cancelJob,
      clearFinishedJobs,
    }),
    [
      state,
      createContent,
      updateContent,
      deleteContent,
      publish,
      retryJob,
      cancelJob,
      clearFinishedJobs,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp 必须在 AppProvider 内使用");
  return ctx;
}

export function platformName(id: string): string {
  return platformById(id)?.name ?? id;
}

export function supportedPlatformsFor(type: ContentTypeId) {
  return PLATFORMS.filter((p) => p.supports.includes(type));
}

export function typeName(type: ContentTypeId): string {
  return contentTypeMeta(type).name;
}
