/* preview.jsx — 预览弹窗
   右侧不常驻预览列：看一眼是临时的动作，改稿子才是常驻的动作。
   弹窗里复用编辑页那块手机屏（PhoneCard），两处只有一套长相。 */
function PreviewModal({ post, onClose, onEdit }) {
  const t = TYPES[post.type];
  /* Esc 关闭：弹窗要有退路 */
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="m-overlay" onClick={onClose} data-screen-label="预览弹窗">
      <div className="w-pv" role="dialog" aria-modal="true" aria-label="预览" onClick={(e) => e.stopPropagation()}>
        <div className="w-pv-head">
          <span className="w-sq" style={{ background: t.color }}></span>
          <span className="t">{post.title || "未命名稿子"}</span>
          <span className="k">{t.en}</span>
        </div>
        <div className="w-pv-body">
          <PhoneCard post={post} />
        </div>
        <div className="w-pv-foot">
          <span className="w-pv-hint">这是发布后的样子 · Esc 关闭</span>
          <button className="w-ghostbtn" onClick={onClose}>关闭</button>
          <button className="w-primary" onClick={onEdit}>打开编辑</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PreviewModal });
