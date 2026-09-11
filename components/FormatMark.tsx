import type { ContentTypeId } from "@/lib/types";
import { contentTypeMeta } from "@/lib/content-types";

/**
 * 签名元素：版面标记（Format Mark）。
 * 每种内容类型一个精确的小型矢量标记，形状即类型。
 * 线条精细、比例准确，专色只用在这里。
 */
export function FormatMark({
  type,
  size = 16,
  title,
  color: colorOverride,
}: {
  type: ContentTypeId;
  size?: number;
  title?: string;
  /** 深色底等特殊场景的描边色覆盖；默认使用类型专色 */
  color?: string;
}) {
  const meta = contentTypeMeta(type);
  const color = colorOverride ?? meta.color;
  const label = title ?? meta.name;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    role: "img" as const,
    "aria-label": label,
  };
  const stroke = {
    stroke: color,
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
  };

  switch (type) {
    case "longform":
      // 竖直的文本行柱
      return (
        <svg {...common}>
          <g {...stroke}>
            <line x1="3.5" y1="2.5" x2="12.5" y2="2.5" />
            <line x1="3.5" y1="5.5" x2="12.5" y2="5.5" />
            <line x1="3.5" y1="8.5" x2="12.5" y2="8.5" />
            <line x1="3.5" y1="11.5" x2="12.5" y2="11.5" />
            <line x1="3.5" y1="14" x2="9" y2="14" />
          </g>
        </svg>
      );
    case "shortform":
      // 两条短横线
      return (
        <svg {...common}>
          <g {...stroke} strokeWidth={1.6}>
            <line x1="3" y1="6" x2="13" y2="6" />
            <line x1="3" y1="10.5" x2="9.5" y2="10.5" />
          </g>
        </svg>
      );
    case "gallery":
      // 2×2 方格
      return (
        <svg {...common}>
          <g {...stroke} strokeWidth={1.3}>
            <rect x="2.5" y="2.5" width="4.8" height="4.8" rx="0.6" />
            <rect x="8.7" y="2.5" width="4.8" height="4.8" rx="0.6" />
            <rect x="2.5" y="8.7" width="4.8" height="4.8" rx="0.6" />
            <rect x="8.7" y="8.7" width="4.8" height="4.8" rx="0.6" />
          </g>
        </svg>
      );
    case "video":
      // 带齿孔条的 16:9 画框
      return (
        <svg {...common}>
          <g {...stroke} strokeWidth={1.3}>
            <rect x="2" y="4.5" width="12" height="6.75" rx="0.8" />
          </g>
          <g fill={color}>
            <rect x="3.2" y="2.6" width="1.4" height="1.1" rx="0.3" />
            <rect x="5.9" y="2.6" width="1.4" height="1.1" rx="0.3" />
            <rect x="8.6" y="2.6" width="1.4" height="1.1" rx="0.3" />
            <rect x="11.3" y="2.6" width="1.4" height="1.1" rx="0.3" />
          </g>
        </svg>
      );
    case "audio":
      // 波形
      return (
        <svg {...common}>
          <g {...stroke} strokeWidth={1.4}>
            <line x1="2.5" y1="8" x2="2.5" y2="8" />
            <line x1="4.75" y1="6" x2="4.75" y2="10" />
            <line x1="7" y1="3.5" x2="7" y2="12.5" />
            <line x1="9.25" y1="5" x2="9.25" y2="11" />
            <line x1="11.5" y1="6.5" x2="11.5" y2="9.5" />
            <line x1="13.75" y1="7.5" x2="13.75" y2="8.5" />
          </g>
        </svg>
      );
  }
}
