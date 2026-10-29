export type ImageCandidate = {
  src: string;
  w: number;
  h: number;
  order: number;
};

/** 同一张生成图的不同尺寸变体共享 `/rc_gen_image/<id>`。 */
export function generatedImageKey(src: string): string {
  const generated = src.match(/\/rc_gen_image\/([^./?~]+)/);
  if (generated?.[1]) return generated[1];
  try {
    const url = new URL(src);
    return `${url.origin}${url.pathname}`;
  } catch {
    return src.split("?")[0] ?? src;
  }
}

/** 每个生成图只保留最大尺寸，并保持首次出现的顺序。 */
export function pickBestResultImages<T extends ImageCandidate>(images: T[]): T[] {
  const best = new Map<string, T>();
  const firstOrder = new Map<string, number>();
  for (const image of images) {
    const key = generatedImageKey(image.src);
    const current = best.get(key);
    if (!current) {
      best.set(key, image);
      firstOrder.set(key, image.order);
    } else if (image.w * image.h > current.w * current.h) {
      best.set(key, image);
    }
  }
  return [...best.entries()]
    .map(([key, image]) => ({ ...image, order: firstOrder.get(key) ?? image.order }))
    .sort((a, b) => a.order - b.order);
}
