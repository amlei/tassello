import Link from "next/link";
import { CONTENT_TYPES } from "@/lib/content-types";
import type { ContentTypeId } from "@/lib/types";
import { FormatMark } from "@/components/FormatMark";
import { Workbench } from "@/components/Workbench";

function parseType(raw: string | string[] | undefined): ContentTypeId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return CONTENT_TYPES.some((t) => t.id === value)
    ? (value as ContentTypeId)
    : "longform";
}

/** 发布页顶部的内容类型切换条：类型不是导航层级，只作为本页的切换状态（体现在 URL 上） */
function TypeSwitcher({ active }: { active: ContentTypeId }) {
  return (
    <div
      role="tablist"
      aria-label="内容类型"
      className="flex items-center gap-1 overflow-x-auto border-b border-rule bg-surface px-4 py-2 sm:px-6"
    >
      {CONTENT_TYPES.map((t) => {
        const selected = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.id === "longform" ? "/" : `/?type=${t.id}`}
            role="tab"
            aria-selected={selected}
            className={`flex shrink-0 items-center gap-2 rounded-[6px] px-3 py-1.5 text-sm transition-colors ${
              selected
                ? "bg-ink font-medium text-surface"
                : "text-ink-600 hover:bg-bg"
            }`}
          >
            <FormatMark
              type={t.id}
              size={15}
              color={selected ? "currentColor" : undefined}
            />
            {t.name}
          </Link>
        );
      })}
    </div>
  );
}

export default async function Page(props: PageProps<"/">) {
  const searchParams = await props.searchParams;
  const type = parseType(searchParams.type);

  return (
    <div>
      <TypeSwitcher active={type} />
      <Workbench type={type} />
    </div>
  );
}
