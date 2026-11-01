function loopbackHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:"
      || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveWebAppUrl(webOrigin: unknown, pathname: string): string {
  if (typeof webOrigin !== "string") throw new Error("本机服务没有提供 Web 界面地址");
  const origin = loopbackHttpOrigin(webOrigin);
  if (!origin) throw new Error("本机 Web 界面地址无效");
  return new URL(pathname.startsWith("/") ? pathname : `/${pathname}`, `${origin}/`).href;
}
