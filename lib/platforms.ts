import type { Content, PlatformSpec } from "./types";

/**
 * 平台矩阵：静态配置，约束驱动 UI。
 * 不支持当前类型的平台被禁用并给出理由；违反硬约束的内容在该平台行内联提示，
 * 且对应发布任务会以同样这条原因确定性地失败。
 */
export const PLATFORMS: PlatformSpec[] = [
  {
    id: "wechat",
    name: "微信公众号",
    supports: ["longform", "gallery", "video", "audio"],
    constraintNotes: "长文标题 ≤64、摘要 ≤120；贴图标题 ≤20、描述 ≤1000、图片 ≤9",
    connection: "connected",
    speed: 1,
  },
  {
    id: "weibo",
    name: "微博",
    supports: ["shortform", "gallery", "video", "longform"],
    constraintNotes: "头条文章：标题 ≤32、导语 ≤44；图片+视频合计 ≤18",
    connection: "connected",
    speed: 1,
  },
  {
    id: "x",
    name: "X",
    supports: ["shortform", "longform", "gallery", "video"],
    constraintNotes: "短文 ≤280 字符",
    connection: "expired",
    speed: 0.8,
  },
  {
    id: "zhihu",
    name: "知乎",
    supports: ["longform"],
    constraintNotes: "—",
    connection: "connected",
    speed: 1,
  },
  {
    id: "juejin",
    name: "掘金",
    supports: ["longform"],
    constraintNotes: "—",
    connection: "disconnected",
    speed: 0.9,
  },
  {
    id: "csdn",
    name: "CSDN",
    supports: ["longform"],
    constraintNotes: "—",
    connection: "connected",
    speed: 0.9,
  },
  {
    id: "bilibili",
    name: "B站",
    supports: ["longform", "video"],
    constraintNotes: "—",
    connection: "connected",
    speed: 1.8,
  },
  {
    id: "toutiao",
    name: "头条号",
    supports: ["longform", "shortform", "gallery", "video"],
    constraintNotes: "—",
    connection: "connected",
    speed: 1.1,
  },
  {
    id: "xiaohongshu",
    name: "小红书",
    supports: ["gallery", "video"],
    constraintNotes: "标题 ≤20、正文 ≤1000、图片 1–18",
    connection: "connected",
    speed: 1.6,
  },
  {
    id: "douban",
    name: "豆瓣",
    supports: ["longform"],
    constraintNotes: "—",
    connection: "disconnected",
    speed: 1,
  },
];

export function platformById(id: string): PlatformSpec | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

function countAssets(content: Content, kinds: ("image" | "video")[]): number {
  return content.assets.filter((a) => kinds.includes(a.kind as "image" | "video")).length;
}

/**
 * 约束校验：返回违反项列表（空数组 = 合法）。
 * 文案带具体数值，既用于发布面板的行内提示，也用作任务的失败原因。
 */
export function validateForPlatform(
  content: Content,
  platform: PlatformSpec,
): string[] {
  const problems: string[] = [];
  const titleLen = content.title.length;
  const bodyLen = content.body.length;

  switch (platform.id) {
    case "wechat": {
      if (content.type === "longform") {
        if (titleLen > 64)
          problems.push(`标题 ${titleLen} 字，超出微信公众号 64 字上限`);
        if (content.summary.length > 120)
          problems.push(`摘要 ${content.summary.length} 字，超出微信公众号 120 字上限`);
      }
      if (content.type === "gallery") {
        if (titleLen > 20)
          problems.push(`标题 ${titleLen} 字，超出微信公众号贴图 20 字上限`);
        if (bodyLen > 1000)
          problems.push(`描述 ${bodyLen} 字，超出微信公众号 1000 字上限`);
        const images = countAssets(content, ["image"]);
        if (images > 9)
          problems.push(`图片 ${images} 张，超出微信公众号 9 张上限`);
      }
      break;
    }
    case "weibo": {
      if (content.type === "longform") {
        if (titleLen > 32)
          problems.push(`标题 ${titleLen} 字，超出微博头条文章 32 字上限`);
        if (content.summary.length > 44)
          problems.push(`导语 ${content.summary.length} 字，超出微博 44 字上限`);
      }
      const media = countAssets(content, ["image", "video"]);
      if ((content.type === "gallery" || content.type === "video") && media > 18)
        problems.push(`图片与视频合计 ${media} 个，超出微博 18 个上限`);
      break;
    }
    case "x": {
      if (content.type === "shortform" && bodyLen > 280)
        problems.push(`正文 ${bodyLen} 字符，超出 X 280 字符上限`);
      break;
    }
    case "xiaohongshu": {
      if (titleLen > 20)
        problems.push(`标题 ${titleLen} 字，超出小红书 20 字上限`);
      if (bodyLen > 1000)
        problems.push(`正文 ${bodyLen} 字，超出小红书 1000 字上限`);
      if (content.type === "gallery") {
        const images = countAssets(content, ["image"]);
        if (images < 1) problems.push("小红书要求至少 1 张图片");
        if (images > 18)
          problems.push(`图片 ${images} 张，超出小红书 18 张上限`);
      }
      break;
    }
    default:
      break;
  }
  return problems;
}

export function platformSupports(platform: PlatformSpec, type: Content["type"]): boolean {
  return platform.supports.includes(type);
}
