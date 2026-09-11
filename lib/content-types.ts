import type { ContentTypeId } from "./types";

export interface ContentTypeMeta {
  id: ContentTypeId;
  name: string;
  /** 印刷色标专色，只用在格式标记上 */
  color: string;
  /** 编辑形态一句话说明，用于新建对话框 */
  blurb: string;
}

export const CONTENT_TYPES: ContentTypeMeta[] = [
  {
    id: "longform",
    name: "长文",
    color: "#0E7C99",
    blurb: "Markdown 正文，配摘要与标签，是完整意义上的写作。",
  },
  {
    id: "shortform",
    name: "短文",
    color: "#C9256E",
    blurb: "纯文本速记，标题可省，写完就走。",
  },
  {
    id: "gallery",
    name: "贴图",
    color: "#D98A00",
    blurb: "图片编排：一句话描述加一组图片素材。",
  },
  {
    id: "video",
    name: "视频",
    color: "#16181D",
    blurb: "视频素材与封面，加一段简介。",
  },
  {
    id: "audio",
    name: "音频",
    color: "#2E7D4F",
    blurb: "音频素材、时长与简介。",
  },
];

export function contentTypeMeta(id: ContentTypeId): ContentTypeMeta {
  const meta = CONTENT_TYPES.find((t) => t.id === id);
  if (!meta) throw new Error(`unknown content type: ${id}`);
  return meta;
}
