/* phone.jsx — 一篇稿子发出去的样子。
   只在编辑页右侧常驻（PreviewColumn）：列表里不再提供预览入口，
   想知道发出去什么样，就打开这篇稿子。
   预览区只读但可交互：正文不可编辑；媒体能播、进度能拖、链接可点（新开页）。 */

/* "MM:SS" → 秒；没有时长就当 1 秒，进度条不至于除零 */
function mediaSec(post) {
  if (post.durationSec) return post.durationSec;
  const m = /^(\d{1,2}):(\d{2})$/.exec(post.duration || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 1;
}

/* 预览视频：点封面播放 / 暂停，底部一条进度随假播放推进 */
function PreviewVideo({ post }) {
  const total = mediaSec(post);
  const [playing, setPlaying] = React.useState(false);
  const [cur, setCur] = React.useState(0);
  React.useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => {
      setCur((c) => {
        if (c + 1 >= total) { setPlaying(false); return 0; }
        return c + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [playing, total]);
  return (
    <div
      className="pcover"
      role="button"
      tabIndex={0}
      aria-label={playing ? "暂停视频" : "播放视频"}
      onClick={() => setPlaying((p) => !p)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPlaying((p) => !p); } }}
    >
      {playing ? <span className="ppause" aria-hidden="true"></span> : <span className="tri" aria-hidden="true"></span>}
      <span className="d">{fmtTime(cur)} / {fmtTime(total)}</span>
      <span className="track" aria-hidden="true"><i style={{ width: (cur / total * 100) + "%" }}></i></span>
    </div>
  );
}

/* 预览音频：点按钮播放 / 暂停，点进度条跳播（与真机听感一致的最小交互） */
function PreviewAudio({ post }) {
  const total = mediaSec(post);
  const [playing, setPlaying] = React.useState(false);
  const [cur, setCur] = React.useState(0);
  React.useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => {
      setCur((c) => {
        if (c + 1 >= total) { setPlaying(false); return 0; }
        return c + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [playing, total]);
  const seek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setCur(Math.round(pct * total));
  };
  return (
    <div className="paudio">
      <button
        className="btn"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? "暂停" : "播放"}
      >
        {playing ? <span className="pp" aria-hidden="true"></span> : <span className="ptri" aria-hidden="true"></span>}
      </button>
      <span className="ln" onClick={seek} role="slider" aria-label="播放进度" aria-valuemin={0} aria-valuemax={total} aria-valuenow={cur}>
        <i style={{ width: (cur / total * 100) + "%" }}></i>
      </span>
      <span className="tm">{fmtTime(cur)} / {fmtTime(total)}</span>
    </div>
  );
}

/* 预览贴图条：手机交互 —— 缩略图定宽，按住拖动横滑（不是电脑端滚动条） */
function PreviewGallery({ images }) {
  const ref = React.useRef(null);
  const drag = React.useRef(null);
  const onPointerDown = (e) => {
    const el = ref.current;
    if (!el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft };
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
  };
  const onPointerMove = (e) => {
    const el = ref.current;
    if (!drag.current || !el) return;
    el.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
  };
  const endPan = () => { drag.current = null; };
  return (
    <div
      className="pimgs"
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onPointerLeave={endPan}
    >
      {images.map((im) => (<i key={im.id} style={{ background: im.color }}></i>))}
    </div>
  );
}

function PhoneCard({ post, paneRef, onScroll, more }) {
  const t = TYPES[post.type];
  const assets = post.images || [];
  /* 预览与编辑用同一份富文本：编辑器里长什么样，发出去就长什么样 */
  const html = (post.bodyHtml && post.bodyHtml.trim()) ? post.bodyHtml : mdToHtml(post.body || "", t.color, assets);
  return (
    <div className="m-phone">
      <div className="m-phone-head">
        <span className="av" style={{ background: t.color }}>九</span>
        <div>
          <div className="who">九漾小记</div>
        </div>
      </div>
      <h2 className="m-phone-title">{post.title || "未命名"}</h2>
      {/* 只有正文这一块滚：素材与页脚留在屏内，长文不会把它们顶走。
          正文只读 —— 链接点了新开页，不把原型带走 */}
      <div className="m-phone-body">
        <div className="m-phone-scroll" ref={paneRef} onScroll={onScroll}>
          <div
            className="body"
            onClick={(e) => {
              const a = e.target && e.target.closest ? e.target.closest("a") : null;
              if (a && a.getAttribute("href")) {
                e.preventDefault();
                window.open(a.href, "_blank", "noopener");
              }
            }}
          >
            {html.trim()
              ? <div className="m-richbody-phone" dangerouslySetInnerHTML={{ __html: html }} />
              : <p style={{ color: "var(--ink3)" }}>正文会出现在这里…</p>}
          </div>
        </div>
        <span className={"m-more" + (more ? "" : " off")} aria-hidden="true"></span>
      </div>
      {/* 文章的图在正文行间，不再重复进素材区；视频 / 音频没传文件时不出现 */}
      {((post.type === "video" || post.type === "audio") && post.media !== false || (post.type === "image" && post.images && post.images.length > 0)) && (
        <div className="m-phone-media">
          {post.type === "image" && post.images && post.images.length > 0 && <PreviewGallery images={post.images} />}
          {post.type === "video" && post.media !== false && <PreviewVideo post={post} />}
          {post.type === "audio" && post.media !== false && <PreviewAudio post={post} />}
        </div>
      )}
    </div>
  );
}

/* 编辑页右侧：常驻预览列 */
function PreviewColumn({ post, paneRef, onScroll, more }) {
  return (
    <div className="m-pane">
      <div className="m-prevcol">
        <PhoneCard post={post} paneRef={paneRef} onScroll={onScroll} more={more} />
      </div>
    </div>
  );
}

Object.assign(window, { PhoneCard, PreviewColumn });
