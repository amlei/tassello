// 平台品牌图标。
// 注意：reicon-brands 的 API 不是 React 组件——每个导出是返回 SVGSVGElement 的
// 普通函数（vanilla DOM），可用成员为 Icon({size,color}) / Icon.toSvg({size,color})
// / Icon.hex / Icon.title / Icon.displayName。这里统一用 toSvg() 生成 SVG 字符串，
// 再包一层 React 组件渲染（SSR 安全，toSvg 是纯字符串拼接）。
//
// 两个特殊情况：
// - 微博：官方色是 #FFFFFF（白），浅色底上会隐形，改为「微博红圆底 + 白色图标」反白。
// - 头条号：reicon-brands 没有对应品牌图标；不用 Bytedance（母公司标识不代表头条号，
//   会误导），退化为 reicon-react 的通用文档图标 Doc，表达「内容平台」。

import type { ReactElement } from "react";
import {
  Bilibili,
  Csdn,
  Douban,
  Juejin,
  Sinaweibo,
  Wechat,
  X,
  Xiaohongshu,
  Zhihu,
  type BrandIconFn,
} from "reicon-brands";
import { Doc } from "reicon-react";

/** 微博品牌红（官方图标本身是白色，需要红底反白才能在浅色底上可辨） */
const WEIBO_RED = "#E6162D";

type BrandDef =
  | { kind: "glyph"; icon: BrandIconFn }
  | { kind: "inverse"; icon: BrandIconFn; background: string }
  | { kind: "generic" };

const BRAND: Record<string, BrandDef> = {
  wechat: { kind: "glyph", icon: Wechat },
  zhihu: { kind: "glyph", icon: Zhihu },
  weibo: { kind: "inverse", icon: Sinaweibo, background: WEIBO_RED },
  bilibili: { kind: "glyph", icon: Bilibili },
  douban: { kind: "glyph", icon: Douban },
  juejin: { kind: "glyph", icon: Juejin },
  csdn: { kind: "glyph", icon: Csdn },
  xiaohongshu: { kind: "glyph", icon: Xiaohongshu },
  x: { kind: "glyph", icon: X },
  toutiao: { kind: "generic" },
};

export function PlatformIcon({
  platformId,
  size = 14,
  dimmed = false,
}: {
  platformId: string;
  size?: number;
  /** 禁用态：降低存在感但不消失（用户仍需认出是哪个平台） */
  dimmed?: boolean;
}): ReactElement {
  const def = BRAND[platformId];
  const dim = dimmed ? "opacity-60" : "";

  if (!def || def.kind === "generic") {
    return (
      <span aria-hidden className={`inline-flex shrink-0 items-center ${dim}`}>
        <Doc size={size} color="currentColor" />
      </span>
    );
  }

  if (def.kind === "inverse") {
    return (
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center rounded-full ${dim}`}
        style={{
          width: size + 4,
          height: size + 4,
          background: def.background,
        }}
        dangerouslySetInnerHTML={{
          __html: def.icon.toSvg({ size: size - 4, color: "#FFFFFF" }),
        }}
      />
    );
  }

  // 官方品牌色直接取自图标自身的 hex 元数据
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center ${dim}`}
      dangerouslySetInnerHTML={{
        __html: def.icon.toSvg({ size, color: `#${def.icon.hex}` }),
      }}
    />
  );
}
