/* @tassello/web 服务端 API 统一出口：Route Handlers 都是薄壳 */
import { bootstrap } from "@tassello/server";

let ready = false;

export function ensureBoot(): void {
  if (ready) return;
  bootstrap();
  ready = true;
}

export function json<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

export function fail(error: string, status = 400): Response {
  return Response.json({ error }, { status });
}

export async function readJson<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}
