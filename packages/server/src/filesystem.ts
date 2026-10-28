import { constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DirectoryEntryDTO, DirectoryListingDTO } from "@tassello/shared";

const MAX_DIRECTORY_ENTRIES = 1_000;
const ENTRY_CHECK_CONCURRENCY = 24;

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

async function isWritable(target: string): Promise<boolean> {
  try {
    await fs.access(target, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function hasObsidianConfig(target: string): Promise<boolean> {
  try {
    return (await fs.stat(path.join(target, ".obsidian"))).isDirectory();
  } catch {
    return false;
  }
}

async function defaultBrowsePath(): Promise<string> {
  const documents = path.join(os.homedir(), "Documents");
  try {
    if ((await fs.stat(documents)).isDirectory()) return documents;
  } catch {
    // Minimal systems may not create ~/Documents before the user picks a folder.
  }
  return os.homedir();
}

async function mapBounded<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/** 只读取当前层目录；浏览复杂度 O(D)，不递归读取 Markdown。 */
export async function listDirectories(inputPath?: string): Promise<DirectoryListingDTO> {
  const requested = inputPath?.trim() || await defaultBrowsePath();
  const current = path.resolve(expandHome(requested));
  const info = await fs.stat(current);
  if (!info.isDirectory()) throw new Error("所选路径不是目录");

  const children = await fs.readdir(current, { withFileTypes: true });
  const names = children
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "zh"))
    .slice(0, MAX_DIRECTORY_ENTRIES);

  const entries = await mapBounded(names, ENTRY_CHECK_CONCURRENCY, async (name): Promise<DirectoryEntryDTO> => {
    const target = path.join(current, name);
    const [isVault, writable] = await Promise.all([
      hasObsidianConfig(target),
      isWritable(target),
    ]);
    return { name, path: target, isVault, writable };
  });

  return {
    path: current,
    parent: current === path.parse(current).root ? null : path.dirname(current),
    isVault: await hasObsidianConfig(current),
    writable: await isWritable(current),
    entries,
  };
}
