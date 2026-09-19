/* evaluate —— 页面求值铁律：只允许标量/纯结构出页面。
   小红书等 Vue 站点的页面对象是响应式 Proxy（循环引用），直接 return 会炸序列化。 */

export type Scalar =
  | string
  | number
  | boolean
  | null
  | Scalar[]
  | { [key: string]: Scalar };

const MAX_DEPTH = 8;

function check(v: unknown, depth: number): void {
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return;
  if (depth > MAX_DEPTH) throw new Error("evaluateScalar: result too deep (page object leaked?)");
  if (Array.isArray(v)) {
    for (const item of v) check(item, depth + 1);
    return;
  }
  if (typeof v === "object") {
    for (const value of Object.values(v as Record<string, unknown>)) check(value, depth + 1);
    return;
  }
  throw new Error(`evaluateScalar: unsupported value type ${typeof v}`);
}

export class PageEvalError extends Error {
  constructor(
    public description: string,
  ) {
    super("Page evaluate failed: " + description);
  }
}

/** 在页面上下文求值并取回结果。表达式自己负责只返回标量/纯结构（先 JSON.parse(JSON.stringify(...)) 再返回）。 */
export async function evaluateScalar<T extends Scalar = Scalar>(
  cdp: { send: <R = unknown>(method: string, params?: Record<string, unknown>, opts?: { sessionId?: string }) => Promise<R> },
  sessionId: string,
  expression: string,
  opts?: { timeoutMs?: number },
): Promise<T> {
  const res = (await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    { sessionId },
  )) as {
    result?: { value?: unknown };
    exceptionDetails?: { text: string; exception?: { description?: string } };
  };
  if (res.exceptionDetails) {
    throw new PageEvalError(
      (res.exceptionDetails.exception?.description || res.exceptionDetails.text).slice(0, 400),
    );
  }
  const value = res.result?.value;
  check(value, 0);
  return value as T;
}
