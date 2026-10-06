/* search-modal —— 全局搜索弹窗：只负责找稿子并打开，不塞无关命令 */
"use client";

import React from "react";
import { TYPE_META, type PostDTO } from "@tassello/shared";
import { api } from "./api";
import { Button, Input, Modal } from "@heroui/react";
import { Search } from "reicon-react";

function summary(body: string): string {
  return (body || "")
    .replace(/!\[[^\]]*\]\(asset:\/\/[^)]+\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function TypeChip({ type }: { type: PostDTO["type"] }) {
  return (
    <span
      className="inline-flex h-[22px] min-w-[40px] flex-none items-center justify-center rounded-[7px] px-[7px] text-[11px] font-extrabold text-white"
      style={{ background: TYPE_META[type].color }}
    >
      {TYPE_META[type].zh}
    </span>
  );
}

export function SearchModal({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (post: PostDTO) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [posts, setPosts] = React.useState<PostDTO[] | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    let alive = true;
    void api.listPosts().then((data) => { if (alive) setPosts(data); }).catch(() => {});
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  const updateQuery = (value: string) => {
    setQuery(value);
    setActive(0);
  };

  const results = React.useMemo(() => {
    const all = posts ?? [];
    const q = query.trim().toLowerCase();
    const matched = q
      ? all.filter((p) => `${p.title} ${p.body} ${TYPE_META[p.type].zh}`.toLowerCase().includes(q))
      : all.slice();
    if (!q) matched.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return matched.slice(0, 8);
  }, [posts, query]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((n) => (results.length ? (n + 1) % results.length : 0));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((n) => (results.length ? (n + results.length - 1) % results.length : 0));
    }
    if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      onOpen(results[active]);
    }
  };

  return (
    <Modal>
      <Modal.Backdrop isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
        <Modal.Container placement="top" scroll="inside">
          <Modal.Dialog
            className="mt-[10vh] flex max-h-[min(70vh,640px)] w-[min(920px,92vw)] flex-col overflow-hidden rounded-[16px] border border-line bg-card p-0 shadow-[0_14px_40px_rgba(15,15,15,0.18)]"
            style={{
              width: "min(920px, 92vw)",
              maxWidth: "min(920px, 92vw)",
            }}
            role="dialog"
            aria-label="搜索稿子"
          >
            <div className="cmd-input flex flex-none items-center gap-2.5 border-b border-line px-[18px] py-4 text-ink2">
              <Search size={16} strokeWidth={2.2} />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => updateQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="搜索标题、正文或类型"
                aria-label="搜索标题、正文或类型"
                fullWidth
                className="h-auto min-h-0 px-0 py-0 text-base font-semibold text-ink placeholder:font-medium placeholder:text-ink3"
              />
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-auto p-2">
              <div className="px-2.5 pb-1.5 pt-2 font-mono text-[10.5px] tracking-[0.4px] text-ink3">
                {query.trim() ? "搜索结果" : "最近稿子"}
              </div>
              {posts === null && <div className="p-7 text-center text-[13px] text-ink2">加载中…</div>}
              {posts !== null && results.length === 0 && (
                <div className="p-7 text-center text-[13px] text-ink2">没有匹配的稿子</div>
              )}
              {results.map((post, i) => (
                <Button
                  key={post.id}
                  variant="ghost"
                  className={
                    "h-auto min-h-0 grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[10px] border-none p-2.5 text-left text-ink data-[hovered=true]:bg-hover " +
                    (i === active ? "bg-hover" : "bg-transparent")
                  }
                  style={{ justifyContent: "start" }}
                  onPress={() => onOpen(post)}
                  onMouseEnter={() => setActive(i)}
                >
                  <TypeChip type={post.type} />
                  <span className="flex min-w-0 flex-col gap-[3px] text-left">
                    <span className="truncate text-sm font-bold text-ink">{post.title || "未命名稿子"}</span>
                    <span className="truncate text-xs text-ink2">{summary(post.body) || "暂无正文"}</span>
                  </span>
                </Button>
              ))}
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
