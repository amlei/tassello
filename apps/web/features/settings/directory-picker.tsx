"use client";

import React from "react";
import type { DirectoryListingDTO } from "@tassello/shared";
import { Button, Input, Modal } from "@heroui/react";
import { Folder, FolderUp } from "reicon-react";
import { api } from "../../adapters/api";

const CANCEL_BUTTON_CLASS =
  "dialog-cancel rounded-full px-4 py-2 text-ink2 data-[hovered=true]:!bg-hover data-[hovered=true]:!text-ink";

export function DirectoryPicker({
  initialPath,
  title = "选择内容目录",
  description = "选择 Onda 内容根目录，可以放在已有 Obsidian Vault 内。",
  confirmLabel = "使用这个目录",
  onChoose,
  onClose,
}: {
  initialPath: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onChoose: (path: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [pathValue, setPathValue] = React.useState(initialPath);
  const [listing, setListing] = React.useState<DirectoryListingDTO | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [choosing, setChoosing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const browse = React.useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.listDirectories(target);
      setListing(next);
      setPathValue(next.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    void api.listDirectories(initialPath)
      .then((next) => {
        if (!active) return;
        setListing(next);
        setPathValue(next.path);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialPath]);

  const choose = async () => {
    if (!listing) return;
    setChoosing(true);
    setError(null);
    try {
      await onChoose(listing.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setChoosing(false);
    }
  };

  return (
    <Modal>
      <Modal.Backdrop isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
        <Modal.Container>
          <Modal.Dialog className="flex w-[620px] max-w-[92vw] flex-col rounded-[18px] bg-paper p-6" aria-label={title}>
            <Modal.Heading className="text-[17px] font-bold">{title}</Modal.Heading>
            <p className="mt-2 text-[12.5px] leading-6 text-ink2">{description}</p>
            <div className="mt-4 flex items-center gap-2">
              <Input
                className="min-w-0 flex-1"
                aria-label="目录路径"
                value={pathValue}
                onChange={(event) => setPathValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void browse(pathValue); }}
              />
              <Button variant="ghost" className="h-auto rounded-full border border-line px-4 py-2 text-xs font-bold data-[hovered=true]:bg-hover" onPress={() => void browse(pathValue)}>前往</Button>
            </div>
            <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line">
              <div className="flex min-h-11 items-center gap-2 border-b border-line px-3 text-[11px] text-ink2">
                <Button
                  isIconOnly
                  variant="ghost"
                  aria-label="上级目录"
                  isDisabled={!listing?.parent || loading}
                  className="h-7 w-7 min-w-0 rounded-lg data-[hovered=true]:bg-hover"
                  onPress={() => listing?.parent && void browse(listing.parent)}
                >
                  <FolderUp size={14} />
                </Button>
                <span className="min-w-0 flex-1 truncate font-mono">{listing?.path ?? pathValue}</span>
                {listing?.isVault && <span className="rounded-full border border-green/30 px-2 py-0.5 font-bold text-green">Obsidian Vault</span>}
              </div>
              <div className="scroll-thin min-h-[250px] flex-1 overflow-auto p-2">
                {loading && <div className="p-8 text-center text-[12px] text-ink2">正在读取…</div>}
                {!loading && error && <div className="p-8 text-center text-[12px] text-error">{error}</div>}
                {!loading && !error && listing?.entries.length === 0 && <div className="p-8 text-center text-[12px] text-ink2">没有子目录</div>}
                {listing?.entries.map((entry) => (
                  <Button
                    key={entry.path}
                    variant="ghost"
                    className="grid h-auto w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-2 text-left text-ink data-[hovered=true]:bg-hover"
                    onPress={() => void browse(entry.path)}
                  >
                    <Folder size={16} className="text-ink3" />
                    <span className="truncate text-[13px] font-semibold">{entry.name}</span>
                    {entry.isVault && <span className="font-mono text-[10px] font-bold text-green">VAULT</span>}
                  </Button>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                className={CANCEL_BUTTON_CLASS}
                onPress={onClose}
              >
                取消
              </Button>
              <Button
                className="rounded-full bg-accent px-5 py-2 font-bold text-white data-[hovered=true]:brightness-105"
                isDisabled={!listing?.writable || loading || choosing || !!error}
                onPress={() => void choose()}
              >
                {choosing ? "保存中…" : confirmLabel}
              </Button>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
