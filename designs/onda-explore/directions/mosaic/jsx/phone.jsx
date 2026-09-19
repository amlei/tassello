/* phone.jsx — 一篇稿子发出去的样子。
   只在编辑页右侧常驻（PreviewColumn）：列表里不再提供预览入口，
   想知道发出去什么样，就打开这篇稿子。 */

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
          <div className="when">刚刚 · 来自 Onda 工作台</div>
        </div>
      </div>
      <h2 className="m-phone-title">{post.title || "未命名"}</h2>
      {/* 只有正文这一块滚：素材与页脚留在屏内，长文不会把它们顶走 */}
      <div className="m-phone-body">
        <div className="m-phone-scroll" ref={paneRef} onScroll={onScroll}>
          <div className="body">
            {html.trim()
              ? <div className="m-richbody-phone" dangerouslySetInnerHTML={{ __html: html }} />
              : <p style={{ color: "#C9C4B8" }}>正文会实时出现在这里…</p>}
          </div>
        </div>
        <span className={"m-more" + (more ? "" : " off")} aria-hidden="true"></span>
      </div>
      {/* 文章的图在正文行间，不再重复进素材区 */}
      {(post.type === "video" || post.type === "audio" || (post.type === "image" && post.images)) && (
        <div className="m-phone-media">
          {post.type === "image" && post.images && (
            <div className="pimgs">
              {post.images.slice(0, 8).map((im) => (<i key={im.id} style={{ background: im.color }}></i>))}
            </div>
          )}
          {post.type === "video" && (
            <div className="pcover">
              <span className="tri"></span>
              <span className="d">{post.duration || "00:00"}</span>
            </div>
          )}
          {post.type === "audio" && (
            <div className="paudio">
              <span className="btn"></span>
              <span className="ln"><i></i></span>
              <span className="tm">{post.duration || "00:00"}</span>
            </div>
          )}
        </div>
      )}
      <div className="foot">
        <span>{post.body.length} 字</span>
        <span>#话题 {(post.body.match(/#[^\s#，。]+/g) || []).length} 个</span>
      </div>
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
