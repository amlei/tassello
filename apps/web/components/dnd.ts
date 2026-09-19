/* dnd —— 长按拖拽排序：实时预演（FLIP 让位）+ 松手落位（移植原型 dnd.jsx） */
"use client";

import React from "react";

type DragState = { id: string; x: number; y: number; grabX: number; grabY: number };
type PressState = {
  id: string;
  x: number;
  y: number;
  grabX: number;
  grabY: number;
  startX: number;
  startY: number;
  timer: number;
};

export function useLongPressReorder({
  ids,
  onCommit,
  holdMs = 220,
  moveTolerance = 8,
  ignoreSelector = ".w-tileacts",
}: {
  ids: string[];
  /** ids = 落定后的完整顺序；draggedId = 被拖的那格（换算 splice 语义的 from/to 用它，别的格只是被挤开） */
  onCommit: (ids: string[], draggedId: string) => void;
  holdMs?: number;
  moveTolerance?: number;
  ignoreSelector?: string;
}) {
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const els = React.useRef(new Map<string, HTMLElement>());
  const prev = React.useRef(new Map<string, [number, number]>());
  const drag = React.useRef<DragState | null>(null);
  const press = React.useRef<PressState | null>(null);
  const justDragged = React.useRef(false);

  const [order, setOrderState] = React.useState<string[] | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [pressing, setPressing] = React.useState<string | null>(null);
  const orderRef = React.useRef<string[] | null>(null);

  const idsRef = React.useRef(ids);
  idsRef.current = ids;

  const slot = (el: HTMLElement) => ({ left: el.offsetLeft, top: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });

  const register = React.useCallback((id: string, el: HTMLElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const gr = gridRef.current?.getBoundingClientRect();
    return { x: e.clientX - (gr?.left ?? 0), y: e.clientY - (gr?.top ?? 0) };
  };

  const stick = React.useCallback(() => {
    const d = drag.current;
    const el = d && els.current.get(d.id);
    if (!el) return;
    const s = slot(el);
    el.style.transform = `translate(${d.x - d.grabX - s.left}px, ${d.y - d.grabY - s.top}px)`;
  }, []);

  const indexAt = (x: number, y: number): string | null => {
    let best: string | null = null;
    let bestD = Infinity;
    els.current.forEach((el, id) => {
      const s = slot(el);
      const dx = x - (s.left + s.w / 2);
      const dy = y - (s.top + s.h / 2);
      const dist = dx * dx + dy * dy;
      if (dist < bestD) {
        bestD = dist;
        best = id;
      }
    });
    return best;
  };

  const clearStyles = () => {
    els.current.forEach((el) => {
      el.style.transition = "";
      el.style.transform = "";
    });
  };

  const startDrag = (id: string) => {
    const list = idsRef.current.slice();
    if (list.indexOf(id) < 0) return;
    clearStyles();
    const snap = new Map<string, [number, number]>();
    els.current.forEach((el, k) => snap.set(k, [el.offsetLeft, el.offsetTop]));
    prev.current = snap;
    const p = press.current!;
    drag.current = { id, x: p.x, y: p.y, grabX: p.grabX, grabY: p.grabY };
    orderRef.current = list;
    setOrderState(list);
    setDragId(id);
    setPressing(null);
    document.body.classList.add("w-dragging");
  };

  const endDrag = (cancelled: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (d) {
      const el = els.current.get(d.id);
      if (el) {
        el.style.transition = cancelled ? "none" : "transform .28s cubic-bezier(.2,.7,.3,1)";
        el.style.transform = "translate(0px,0px)";
        window.setTimeout(() => {
          el.style.transition = "";
          el.style.transform = "";
        }, 320);
      }
      justDragged.current = !cancelled;
      if (!cancelled && orderRef.current) onCommit(orderRef.current, d.id);
    }
    setDragId(null);
    setPressing(null);
    orderRef.current = null;
    setOrderState(null);
    document.body.classList.remove("w-dragging");
  };

  const onTilePointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest(ignoreSelector)) return;
    if (idsRef.current.indexOf(id) < 0) return;
    justDragged.current = false;
    const el = els.current.get(id);
    if (!el) return;
    const p = local(e);
    const s = slot(el);
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = {
      id,
      x: p.x,
      y: p.y,
      grabX: p.x - s.left,
      grabY: p.y - s.top,
      startX: e.clientX,
      startY: e.clientY,
      timer: window.setTimeout(() => startDrag(id), holdMs),
    };
    setPressing(id);
  };

  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pr = press.current;
      if (pr && !drag.current) {
        if (Math.abs(e.clientX - pr.startX) > moveTolerance || Math.abs(e.clientY - pr.startY) > moveTolerance) {
          window.clearTimeout(pr.timer);
          press.current = null;
          setPressing(null);
        }
        return;
      }
      const d = drag.current;
      if (!d) return;
      e.preventDefault();
      const p = local(e);
      d.x = p.x;
      d.y = p.y;
      stick();
      const overId = indexAt(p.x, p.y);
      if (!overId || overId === d.id) return;
      /* 直接从 orderRef 同步计算下一序：functional updater 要等 React 渲染才执行，
         连续 pointermove 的更新会排队，pointerup 读 ref 时拿到的就是旧序 */
      const cur = orderRef.current || idsRef.current.slice();
      const from = cur.indexOf(d.id);
      const to = cur.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return;
      const rest = cur.filter((x) => x !== d.id);
      const at = rest.indexOf(overId);
      rest.splice(to > from ? at + 1 : at, 0, d.id);
      orderRef.current = rest;
      setOrderState(rest);
    };
    const onUp = () => {
      const pr = press.current;
      if (pr) {
        window.clearTimeout(pr.timer);
        press.current = null;
      }
      if (drag.current) endDrag(false);
      else setPressing(null);
    };
    const onCancel = () => {
      const pr = press.current;
      if (pr) {
        window.clearTimeout(pr.timer);
        press.current = null;
      }
      if (drag.current) endDrag(true);
      else setPressing(null);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  });

  React.useLayoutEffect(() => {
    if (!order) return;
    els.current.forEach((el, id) => {
      if (drag.current && id === drag.current.id) return;
      const p = prev.current.get(id);
      if (!p) return;
      const left = el.offsetLeft;
      const top = el.offsetTop;
      if (p[0] === left && p[1] === top) return;
      const dx = p[0] - left;
      const dy = p[1] - top;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform .3s cubic-bezier(.2,.7,.3,1)";
        el.style.transform = "";
        window.setTimeout(() => {
          if (drag.current && drag.current.id === id) return;
          el.style.transition = "";
          el.style.transform = "";
        }, 340);
      });
    });
    const snap = new Map<string, [number, number]>();
    els.current.forEach((el, k) => snap.set(k, [el.offsetLeft, el.offsetTop]));
    prev.current = snap;
    stick();
  });

  const shouldSuppressClick = () => {
    if (!justDragged.current) return false;
    justDragged.current = false;
    return true;
  };

  return { gridRef, order, dragId, pressing, register, onTilePointerDown, shouldSuppressClick };
}
