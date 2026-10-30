/* /api/* → 本机 Elysia API 的运行时代理。
 *
 * 不用 next.config rewrites：rewrite 目的地在 `next build` 时求值并烘焙进
 * standalone 产物（Next 16 的 standalone 运行时直接使用构建期序列化的配置），
 * 而打包后的桌面端给 API 分配的是随机空闲端口，运行时注入的 TASSELLO_API_PORT
 * 对 rewrite 无效。Route Handler 在请求期读取环境变量，与桌面端和打包自检的
 * 动态端口兼容；开发态与站点部署按 4311 默认值工作。
 */

export const dynamic = "force-dynamic";

/* 逐跳头不透传；host 与 content-length 由上游 fetch 按新请求重新计算 */
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function filterHeaders(headers: Headers): Headers {
  const filtered = new Headers();
  for (const [name, value] of headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) filtered.set(name, value);
  }
  return filtered;
}

type ProxyContext = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: ProxyContext): Promise<Response> {
  const { path } = await context.params;
  const search = new URL(request.url).search;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const origin = `http://127.0.0.1:${process.env.TASSELLO_API_PORT ?? "4311"}`;
  try {
    const upstream = await fetch(`${origin}/api/v1/${path.join("/")}${search}`, {
      method: request.method,
      headers: filterHeaders(request.headers),
      body: hasBody ? request.body : undefined,
      // 流式转发请求体（媒体上传）需要显式声明半双工
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      signal: request.signal,
    } as RequestInit);
    const headers = filterHeaders(upstream.headers);
    // undici 会自动解压响应体，此时编码与长度头已和实际内容不符
    if (upstream.headers.has("content-encoding")) {
      headers.delete("content-encoding");
      headers.delete("content-length");
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return new Response(`API 代理失败: ${reason}`, { status: 502 });
  }
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as HEAD,
};
