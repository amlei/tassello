/* dnd.jsx — 长按拖拽排序：实时预演（其余格子 FLIP 让位）+ 松手落位

   为什么长按：轻点是「打开这篇」，直接拖会和滚动、点选打架。
   按住 220ms 才拎起来，移动超过 8px 就当作滚动/误触取消。

   两套坐标要分清：
   · 槽位 = offsetLeft/offsetTop（布局位置，不受 transform 影响，动画中读也准）
   · 指针 = clientX/Y 减掉网格左上角，换到同一坐标系
   被拖的那枚始终平移「指针 − 抓取点 − 它当前槽位」，
   所以顺序一变、槽位一换，它自动贴合指针，不会跳。 */
function useLongPressReorder({ ids, onCommit, holdMs = 220, moveTolerance = 8 }) {
  const gridRef = React.useRef(null);
  const els = React.useRef(new Map());
  const prev = React.useRef(new Map());
  const drag = React.useRef(null);
  const press = React.useRef(null);
  const justDragged = React.useRef(false);

  const [order, setOrder] = React.useState(null);
  const [dragId, setDragId] = React.useState(null);
  const [pressing, setPressing] = React.useState(null);

  const idsRef = React.useRef(ids);
  idsRef.current = ids;

  const slot = (el) => ({ left: el.offsetLeft, top: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });

  const register = React.useCallback((id, el) => {
    if (el) els.current.set(id, el); else els.current.delete(id);
  }, []);

  const local = (e) => {
    const gr = gridRef.current.getBoundingClientRect();
    return { x: e.clientX - gr.left, y: e.clientY - gr.top };
  };

  /* 让被拖的那枚一直待在指针下：它的槽位会随顺序变化，所以每次都要重算 */
  const stick = React.useCallback(() => {
    const d = drag.current;
    const el = d && els.current.get(d.id);
    if (!el) return;
    const s = slot(el);
    el.style.transform = "translate(" + (d.x - d.grabX - s.left) + "px," + (d.y - d.grabY - s.top) + "px)";
  }, []);

  /* 指针落在哪一格上：取槽位中心最近的一枚 */
  const indexAt = (x, y) => {
    let best = null, bestD = Infinity;
    els.current.forEach((el, id) => {
      const s = slot(el);
      const dx = x - (s.left + s.w / 2);
      const dy = y - (s.top + s.h / 2);
      const dist = dx * dx + dy * dy;
      if (dist < bestD) { bestD = dist; best = id; }
    });
    return best;
  };

  const clearStyles = () => {
    els.current.forEach((el) => { el.style.transition = ""; el.style.transform = ""; });
  };

  const startDrag = (id) => {
    const list = idsRef.current.slice();
    if (list.indexOf(id) < 0) return;
    clearStyles();
    const snap = new Map();
    els.current.forEach((el, k) => snap.set(k, [el.offsetLeft, el.offsetTop]));
    prev.current = snap;
    drag.current = { id, x: press.current.x, y: press.current.y, grabX: press.current.grabX, grabY: press.current.grabY };
    setOrder(list);
    setDragId(id);
    setPressing(null);
    document.body.classList.add("w-dragging");
  };

  const endDrag = (cancelled) => {
    const d = drag.current;
    drag.current = null;
    if (d) {
      const el = els.current.get(d.id);
      if (el) {
        /* FLIP 落位：从指针处滑回它的槽位 */
        el.style.transition = cancelled ? "none" : "transform .28s cubic-bezier(.2,.7,.3,1)";
        el.style.transform = "translate(0px,0px)";
        window.setTimeout(() => { el.style.transition = ""; el.style.transform = ""; }, 320);
      }
      justDragged.current = !cancelled;
      if (!cancelled && order) onCommit(order);
    }
    setDragId(null);
    setPressing(null);
    setOrder(null);
    document.body.classList.remove("w-dragging");
  };

  const onTilePointerDown = (e, id) => {
    if (e.button != null && e.button !== 0) return;
    /* 格子角上的预览/删除按钮不该把长按也吃了 */
    if (e.target.closest && e.target.closest(".w-tileacts")) return;
    if (idsRef.current.indexOf(id) < 0) return;
    /* 上一次拖拽如果因为 mouseup 落在了别的格子上而没发出 click，
       那个「吃掉下一次点击」的标记会一直挂着 —— 新的按下就该把它清掉 */
    justDragged.current = false;
    const el = els.current.get(id);
    if (!el) return;
    const p = local(e);
    const s = slot(el);
    window.clearTimeout(press.current && press.current.timer);
    press.current = {
      id, x: p.x, y: p.y,
      grabX: p.x - s.left, grabY: p.y - s.top,
      startX: e.clientX, startY: e.clientY,
      timer: window.setTimeout(() => startDrag(id), holdMs),
    };
    setPressing(id);
  };

  /* 拖动期间挂在 window 上：指针滑出格子也照样跟手 */
  React.useEffect(() => {
    const onMove = (e) => {
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
      d.x = p.x; d.y = p.y;
      stick();
      /* 实时预演：指针压到别的一格上，就把自己插到那一格的位置 */
      const overId = indexAt(p.x, p.y);
      if (!overId || overId === d.id) return;
      setOrder((cur) => {
        const o = cur || idsRef.current.slice();
        const from = o.indexOf(d.id), to = o.indexOf(overId);
        if (from < 0 || to < 0 || from === to) return o;
        const rest = o.filter((x) => x !== d.id);
        const at = rest.indexOf(overId);
        rest.splice(to > from ? at + 1 : at, 0, d.id);
        return rest;
      });
    };
    const onUp = () => {
      const pr = press.current;
      if (pr) { window.clearTimeout(pr.timer); press.current = null; }
      if (drag.current) endDrag(false);
      else setPressing(null);
    };
    const onCancel = () => {
      const pr = press.current;
      if (pr) { window.clearTimeout(pr.timer); press.current = null; }
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

  /* 顺序一变做两件事：其余格子 FLIP 让位；被拖的那枚重新贴合指针 */
  React.useLayoutEffect(() => {
    if (!order) return;
    els.current.forEach((el, id) => {
      if (id === (drag.current && drag.current.id)) return;
      const p = prev.current.get(id);
      if (!p) return;
      const left = el.offsetLeft, top = el.offsetTop;
      if (p[0] === left && p[1] === top) return;
      const dx = p[0] - left, dy = p[1] - top;
      el.style.transition = "none";
      el.style.transform = "translate(" + dx + "px," + dy + "px)";
      requestAnimationFrame(() => {
        el.style.transition = "transform .3s cubic-bezier(.2,.7,.3,1)";
        el.style.transform = "";
        /* 动画结束就把内联样式摘掉：留着的话，之后窗口一变宽它也会跟着飘 */
        window.setTimeout(() => {
          if (drag.current && drag.current.id === id) return;
          el.style.transition = "";
          el.style.transform = "";
        }, 340);
      });
    });
    const snap = new Map();
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

Object.assign(window, { useLongPressReorder });
