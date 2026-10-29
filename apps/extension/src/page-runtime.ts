type PageFunction<T> = (arg: any) => T | Promise<T>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ONDA_GROUP_TITLE = "九漾 Onda";

async function groupOndaTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id == null || !chrome.tabGroups) return;
  try {
    const groups = await chrome.tabGroups.query({
      title: ONDA_GROUP_TITLE,
      windowId: tab.windowId,
    });
    const existing = groups[0];
    const groupId = await chrome.tabs.group({
      tabIds: tab.id,
      ...(existing
        ? { groupId: existing.id }
        : { createProperties: { windowId: tab.windowId } }),
    });
    await chrome.tabGroups.update(groupId, {
      title: ONDA_GROUP_TITLE,
      color: "purple",
      collapsed: false,
    });
  } catch {
    // 分组失败不能阻断发布；扩展仍可继续在独立标签页中执行任务。
  }
}

export async function openTab(url: string, active = true): Promise<number> {
  const tab = await chrome.tabs.create({ url, active });
  if (tab.id == null) throw new Error("无法创建平台标签页");
  await groupOndaTab(tab);
  await waitForTabReady(tab.id);
  return tab.id;
}

export async function waitForTabReady(tabId: number, timeoutMs = 30_000): Promise<void> {
  const current = await chrome.tabs.get(tabId).catch(() => null);
  if (!current) throw new Error("平台标签页已关闭");
  if (current.status === "complete") return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const onUpdated = (id: number, change: { status?: string }) => {
      if (id === tabId && change.status === "complete") finish();
    };
    const onRemoved = (id: number) => {
      if (id === tabId) finish(new Error("平台标签页已关闭"));
    };
    const timer = setTimeout(() => finish(), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

export async function executeInPage<T>(
  tabId: number,
  func: PageFunction<T>,
  arg?: any,
  timeoutMs = 60_000,
): Promise<T> {
  const result = await Promise.race([
    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: func as (...args: unknown[]) => unknown,
      args: arg === undefined ? [] : [arg],
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("平台页面脚本执行超时")), timeoutMs);
    }),
  ]);
  const first = result[0];
  if (!first) throw new Error("平台页面没有返回执行结果");
  return first.result as T;
}

export async function pageUrl(tabId: number): Promise<string> {
  return (await chrome.tabs.get(tabId)).url ?? "";
}

export async function focusTab(tabId: number): Promise<void> {
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update((await chrome.tabs.get(tabId)).windowId, { focused: true });
}

export async function closeTab(tabId: number): Promise<void> {
  await chrome.tabs.remove(tabId).catch(() => undefined);
}

export async function waitForSelector(
  tabId: number,
  selector: string,
  options: { visible?: boolean; timeoutMs?: number } = {},
): Promise<void> {
  const visible = options.visible !== false;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const found = await executeInPage(tabId, async ({ selector, visible, timeoutMs }) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const element = document.querySelector(selector);
      const shown = !!element && (!visible || (element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0));
      if (shown) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }, { selector, visible, timeoutMs }, timeoutMs + 5_000);
  if (!found) throw new Error(`等待页面元素超时：${selector}`);
}

export async function waitForText(tabId: number, text: string, timeoutMs = 30_000): Promise<void> {
  const found = await executeInPage(tabId, async ({ text, timeoutMs }) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if ((document.body?.innerText ?? "").includes(text)) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }, { text, timeoutMs }, timeoutMs + 5_000);
  if (!found) throw new Error(`等待页面文案超时：${text}`);
}

export async function clickText(
  tabId: number,
  texts: string | string[],
  options: { selector?: string; timeoutMs?: number; exact?: boolean } = {},
): Promise<boolean> {
  const list = typeof texts === "string" ? [texts] : texts;
  const timeoutMs = options.timeoutMs ?? 20_000;
  return await executeInPage(tabId, async ({ list, selector, timeoutMs, exact }) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const candidates = Array.from(document.querySelectorAll(selector || "button, [role=button], a"))
        .filter((element) => {
          const text = (element.textContent || "").trim();
          const rect = element.getBoundingClientRect();
          const visible = rect.width > 0 && rect.height > 0;
          return visible && list.some((wanted: string) => exact ? text === wanted : text.includes(wanted));
        }) as HTMLElement[];
      const target = candidates[candidates.length - 1];
      if (target) {
        target.click();
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }, { list, selector: options.selector, timeoutMs, exact: options.exact === true }, timeoutMs + 5_000);
}

export async function waitForEnabledButton(
  tabId: number,
  texts: string | string[],
  timeoutMs = 60_000,
): Promise<void> {
  const list = typeof texts === "string" ? [texts] : texts;
  const ready = await executeInPage(tabId, async ({ list, timeoutMs }) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const button = Array.from(document.querySelectorAll("button"))
        .find((element) => {
          const text = (element.textContent || "").trim();
          const rect = element.getBoundingClientRect();
          return rect.width > 0
            && rect.height > 0
            && !(element as HTMLButtonElement).disabled
            && list.includes(text);
        });
      if (button) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }, { list, timeoutMs }, timeoutMs + 5_000);
  if (!ready) throw new Error(`等待按钮可点击超时：${list.join(" / ")}`);
}

export async function setControlValue(
  tabId: number,
  selector: string,
  value: string,
): Promise<boolean> {
  return await executeInPage(tabId, ({ selector, value }) => {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) return false;
    element.focus();
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(element, value);
      else element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return true;
    }
    if (!element.isContentEditable) return false;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const inserted = document.execCommand("insertText", false, value);
    if (!inserted || !(element.textContent ?? "").includes(value)) {
      element.textContent = value;
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: value,
      }));
    }
    return (element.textContent ?? "").includes(value);
  }, { selector, value });
}

export async function setEditableText(
  tabId: number,
  selector: string,
  value: string,
): Promise<boolean> {
  return await executeInPage(tabId, ({ selector, value }) => {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) return false;
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const inserted = document.execCommand("insertText", false, value);
    if (!inserted || !(element.textContent ?? "").includes(value)) {
      element.textContent = value;
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value,
      }));
    }
    return (element.textContent ?? "").includes(value);
  }, { selector, value });
}

export async function clearEditable(tabId: number, selector: string): Promise<boolean> {
  return await executeInPage(tabId, ({ selector }) => {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element || !element.isContentEditable) return false;
    element.focus();
    document.execCommand("selectAll");
    document.execCommand("delete");
    if ((element.textContent ?? "").trim()) {
      element.replaceChildren();
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "deleteContentBackward",
      }));
    }
    return !(element.textContent ?? "").trim();
  }, { selector });
}

export async function pasteInto(
  tabId: number,
  selector: string,
  text: string,
  html?: string,
): Promise<boolean> {
  return await executeInPage(tabId, async ({ selector, text, html }) => {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) return false;
    element.focus();
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(element, text);
      else element.value = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return element.value.includes(text);
    }
    const transfer = new DataTransfer();
    transfer.setData("text/plain", text);
    if (html) transfer.setData("text/html", html);
    element.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (!element.textContent?.trim() && text) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
      const inserted = document.execCommand("insertHTML", false, html || text.replace(/\n/g, "<br>"));
      if (!inserted) {
        element.textContent = text;
        element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      }
    }
    const expected = text.split(/\n/, 1)[0] ?? "";
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      if (!expected || (element.textContent ?? "").includes(expected)) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  }, { selector, text, html });
}

export async function replaceEditableHtml(
  tabId: number,
  selector: string,
  text: string,
  html?: string,
): Promise<boolean> {
  return await executeInPage(tabId, async ({ selector, text, html }) => {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) return false;
    element.focus();
    const clearSelection = window.getSelection();
    const clearRange = document.createRange();
    clearRange.selectNodeContents(element);
    clearSelection?.removeAllRanges();
    clearSelection?.addRange(clearRange);
    document.execCommand("delete");
    await new Promise((resolve) => setTimeout(resolve, 100));
    if ((element.textContent ?? "").trim()) {
      element.replaceChildren();
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "deleteContentBackward",
      }));
    }
    const transfer = new DataTransfer();
    transfer.setData("text/plain", text);
    if (html) transfer.setData("text/html", html);
    element.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }));
    const expected = text.replace(/\s+/g, "").slice(0, 32);
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      const actual = (element.textContent ?? "").replace(/\s+/g, "");
      const first = expected ? actual.indexOf(expected) : -1;
      if (!expected || (first >= 0 && actual.indexOf(expected, first + expected.length) < 0)) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const current = (element.textContent ?? "").replace(/\s+/g, "");
    const first = expected ? current.indexOf(expected) : -1;
    if (expected && (first < 0 || current.indexOf(expected, first + expected.length) >= 0)) {
      element.replaceChildren();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
      if (html) document.execCommand("insertHTML", false, html);
      else document.execCommand("insertText", false, text);
      if (!html && !(element.textContent ?? "").includes(text)) element.textContent = text;
      if (html && !(element.textContent ?? "").replace(/\s+/g, "").includes(expected)) {
        element.innerHTML = html;
      }
    }
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertFromPaste",
      data: text,
    }));
    const finalText = (element.textContent ?? "").replace(/\s+/g, "");
    const finalFirst = expected ? finalText.indexOf(expected) : -1;
    return !expected || (finalFirst >= 0 && finalText.indexOf(expected, finalFirst + expected.length) < 0);
  }, { selector, text, html });
}

export type InjectedFile = {
  name: string;
  mime: string;
  base64: string;
};

export async function setInputFiles(
  tabId: number,
  selector: string,
  files: InjectedFile[],
): Promise<boolean> {
  return await executeInPage(tabId, ({ selector, files }) => {
    const inputs = Array.from(document.querySelectorAll(selector)) as HTMLInputElement[];
    const input = inputs.find((candidate) => candidate.offsetHeight > 0)
      ?? inputs[inputs.length - 1]
      ?? inputs[0];
    if (!input) return false;
    const transfer = new DataTransfer();
    for (const file of files) {
      const binary = atob(file.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      transfer.items.add(new File([bytes], file.name, { type: file.mime }));
    }
    input.files = transfer.files;
    if (input.files?.length !== files.length) return false;
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return true;
  }, { selector, files }, 120_000);
}

export async function dropFiles(
  tabId: number,
  selector: string,
  files: InjectedFile[],
): Promise<boolean> {
  return await executeInPage(tabId, async ({ selector, files }) => {
    const target = Array.from(document.querySelectorAll(selector))
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    const dropTarget = target as HTMLElement | undefined;
    if (!dropTarget) return false;
    const transfer = new DataTransfer();
    for (const file of files) {
      const binary = atob(file.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      transfer.items.add(new File([bytes], file.name, { type: file.mime }));
    }
    for (const type of ["dragenter", "dragover", "drop"]) {
      dropTarget.dispatchEvent(new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        dataTransfer: transfer,
      }));
    }
    return dropTarget.isConnected;
  }, { selector, files });
}

export async function setFrameEditableText(
  tabId: number,
  selector: string,
  value: string,
  timeoutMs = 15_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let frame: chrome.scripting.InjectionResult | undefined;
  while (Date.now() < deadline && frame?.frameId == null) {
    const frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (frameSelector: string) => !!document.querySelector(frameSelector),
      args: [selector],
    });
    frame = frames.find((candidate) => candidate.result === true && candidate.frameId != null);
    if (frame?.frameId == null) await sleep(250);
  }
  if (frame?.frameId == null) return false;
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frame.frameId] },
    world: "MAIN",
    func: ({ value }) => {
      const win = window;
      const doc = document;
      const body = doc.body;
      if (!body) return false;
      body.focus();
      const selection = win.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(body);
      selection?.removeAllRanges();
      selection?.addRange(range);
      const inserted = doc.execCommand("insertText", false, value);
      if (!inserted || !(body.textContent ?? "").replace(/\s+/g, "").includes(value.replace(/\s+/g, ""))) {
        body.replaceChildren(...value.split(/\n{2,}/).map((paragraph) => {
          const element = doc.createElement("p");
          element.textContent = paragraph;
          return element;
        }));
      }
      body.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value,
      }));
      return (body.textContent ?? "").replace(/\s+/g, "").includes(value.replace(/\s+/g, ""));
    },
    args: [{ value }],
  });
  return execution?.result === true;
}

export async function waitForUploadIdle(tabId: number, timeoutMs: number): Promise<void> {
  const done = await executeInPage(tabId, async ({ timeoutMs }) => {
    const started = Date.now();
    let quiet = 0;
    while (Date.now() - started < timeoutMs) {
      const text = document.body?.innerText ?? "";
      const busy = /上传中|正在上传|处理中|转码中|剩余时间/.test(text);
      quiet = busy ? 0 : quiet + 1;
      if (quiet >= 3) return true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
  }, { timeoutMs }, timeoutMs + 5_000);
  if (!done) throw new Error("平台素材上传超时");
}

export async function sleepPage(ms: number): Promise<void> {
  await sleep(ms);
}
