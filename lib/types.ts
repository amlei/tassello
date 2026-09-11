// 铺稿 · 领域模型
// 纯前端原型：无后端、无数据库，全部状态存于 localStorage。

export type ContentTypeId =
  | "longform"
  | "shortform"
  | "gallery"
  | "video"
  | "audio";

/** 素材占位：不做真实上传，仅记录序号与尺寸/时长占位文案 */
export interface AssetPlaceholder {
  id: string;
  kind: "image" | "video" | "audio" | "cover";
  /** 占位文案，如「1920 × 1080 · 占位」 */
  note: string;
}

export interface Content {
  id: string;
  type: ContentTypeId;
  title: string;
  /** 长文 Markdown 正文 / 短文纯文本 / 贴图一句话描述 / 视频与音频简介 */
  body: string;
  /** 长文摘要（微博发布时作为导语） */
  summary: string;
  tags: string[];
  assets: AssetPlaceholder[];
  /** 音频时长，占位文本，如「12:30」 */
  duration: string;
  /** 已选择的发布平台 id */
  platforms: string[];
  createdAt: number;
  updatedAt: number;
}

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

/** 阶段命名来自真实发布链路 */
export type JobStage =
  | "queued"
  | "render"
  | "assets"
  | "fill"
  | "review"
  | "done";

export interface PublishJob {
  id: string;
  contentId: string;
  platformId: string;
  status: JobStatus;
  stage: JobStage;
  /** 0 - 100 */
  progress: number;
  /** 当前阶段的可读文案 / 失败原因 */
  message: string;
  attempt: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export type ConnectionStatus = "connected" | "disconnected" | "expired";

export interface PlatformSpec {
  id: string;
  name: string;
  supports: ContentTypeId[];
  /** 约束说明，展示用 */
  constraintNotes: string;
  /** 模拟连接状态：原型只做展示，这里将是未来的授权入口 */
  connection: ConnectionStatus;
  /** 模拟耗时系数：视频重的平台更慢 */
  speed: number;
}
