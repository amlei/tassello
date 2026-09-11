"use client";

// 新建稿件对话框：在发布页触发，创建的内容自动属于当前选中的类型。
// 可顺便起一个标题（也可留空到编辑页再写），创建后进入编辑页。

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ContentTypeId } from "@/lib/types";
import { contentTypeMeta } from "@/lib/content-types";
import { useApp } from "@/lib/store";
import { FormatMark } from "./FormatMark";

export function NewContentDialog({
  open,
  type,
  onClose,
}: {
  open: boolean;
  type: ContentTypeId;
  onClose: () => void;
}) {
  const router = useRouter();
  const { createContent, updateContent } = useApp();
  const [title, setTitle] = useState("");
  const meta = contentTypeMeta(type);

  // 关闭时顺带清空标题，下次打开是干净的
  const close = () => {
    setTitle("");
    onClose();
  };

  const handleCreate = () => {
    const draft = createContent(type);
    if (title.trim()) {
      updateContent(draft.id, { title: title.trim() });
    }
    close();
    router.push(`/content/${draft.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif">
            <FormatMark type={type} size={18} />
            新建{meta.name}
          </DialogTitle>
          <DialogDescription>{meta.blurb}</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-600">
            标题{type === "shortform" ? "（可留空）" : ""}
          </span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            placeholder={`给这篇${meta.name}起个标题`}
            autoFocus
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            取消
          </Button>
          <Button onClick={handleCreate}>创建并开始编辑</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
