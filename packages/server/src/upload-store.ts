import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import type { UploadCacheQuery, UploadCacheRef } from "@tassello/shared";
import { readJsonFile, statePath, writeJsonAtomic } from "./state";

function accountKey(accountUid: string): string {
  return createHash("sha256").update(accountUid).digest("hex").slice(0, 20);
}

function cacheFile(query: UploadCacheQuery): string {
  if (!/^[a-f0-9]{64}$/i.test(query.contentHash)) throw new Error("素材内容 hash 不合法");
  const scope = query.scope.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 80) || "default";
  return statePath(
    "uploads",
    query.platformId.replace(/[^a-zA-Z0-9_-]+/g, "_"),
    accountKey(query.accountUid),
    `${query.contentHash.slice(0, 32)}--${query.kind}--${scope}.json`,
  );
}

export async function findUploadCache(query: UploadCacheQuery): Promise<UploadCacheRef | null> {
  return readJsonFile<UploadCacheRef | null>(cacheFile(query), null);
}

export async function saveUploadCache(
  query: UploadCacheQuery,
  value: { id: string; url?: string | null; payload?: Record<string, unknown> },
): Promise<UploadCacheRef> {
  const saved: UploadCacheRef = {
    id: value.id,
    url: value.url ?? null,
    payload: value.payload ?? {},
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(cacheFile(query), saved);
  return saved;
}

export async function forgetUploadCache(query: UploadCacheQuery): Promise<void> {
  await fs.rm(cacheFile(query), { force: true });
}
