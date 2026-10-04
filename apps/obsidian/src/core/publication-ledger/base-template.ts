import { PLATFORMS } from "../types";
import type { PublicationSettings } from "./types";

const PLATFORM_ORDER_KEYS = PLATFORMS.flatMap((platform) => [
  `note.tassello-${platform.id}-status`,
  `note.tassello-${platform.id}-draft-url`,
  `note.tassello-${platform.id}-publish-url`,
]);

const PLATFORM_PROPERTIES = PLATFORMS.flatMap((platform) => [
  [`note.tassello-${platform.id}-status`, `${platform.name}状态`],
  [`note.tassello-${platform.id}-draft-url`, `${platform.name}草稿`],
  [`note.tassello-${platform.id}-publish-url`, `${platform.name}发布`],
] as const);

/** 只生成 Base 视图；台账数据始终留在用户自己的 Markdown frontmatter。 */
export function publicationBaseTemplate(settings: PublicationSettings): string {
  const statusProperty = "note.tassello-status";
  const updatedProperty = "note.tassello-updated-at";

  return [
    "tassello-managed: publication-ledger/v1",
    "filters:",
    '  and:',
    '    - file.ext == "md"',
    '    - note["tassello-publish"] == true',
    "properties:",
    "  file.name:",
    "    displayName: 内容",
    `  ${statusProperty}:`,
    "    displayName: 状态",
    "  note.tassello-platforms:",
    "    displayName: 平台",
    `  ${updatedProperty}:`,
    "    displayName: 更新时间",
    ...PLATFORM_PROPERTIES.map(([key, name]) => `  ${key}:\n    displayName: ${name}`),
    "views:",
    "  - type: table",
    "    name: 全部发布",
    "    order:",
    "      - file.name",
    `      - ${statusProperty}`,
    "      - note.tassello-platforms",
    ...PLATFORM_ORDER_KEYS.map((key) => `      - ${key}`),
    `      - ${updatedProperty}`,
    "  - type: table",
    "    name: 待处理",
    "    filters:",
    "      or:",
    `        - ${statusProperty} == "待确认"`,
    `        - ${statusProperty} == "失败"`,
    "    order:",
    "      - file.name",
    `      - ${statusProperty}`,
    "      - note.tassello-platforms",
    `      - ${updatedProperty}`,
    "  - type: table",
    "    name: 已发布",
    "    filters:",
    "      or:",
    `        - ${statusProperty} == "完成"`,
    `        - ${statusProperty} == "部分完成"`,
    "    order:",
    "      - file.name",
    `      - ${statusProperty}`,
    "      - note.tassello-platforms",
    `      - ${updatedProperty}`,
    "  - type: table",
    "    name: 失败",
    "    filters:",
    `      - ${statusProperty} == "失败"`,
    "    order:",
    "      - file.name",
    `      - ${statusProperty}`,
    "      - note.tassello-platforms",
    `      - ${updatedProperty}`,
    "",
  ].join("\n");
}
