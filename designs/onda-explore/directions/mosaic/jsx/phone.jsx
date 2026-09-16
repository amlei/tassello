/* phone.jsx — 一篇稿子发出去的样子。
   同一块屏幕有两个入口：编辑页右侧的常驻预览列（PreviewColumn），
   以及列表行内按钮唤起的预览弹窗（PhoneCard）。两者共用一个组件，
   免得「预览」在应用里长出两套长相。 */

const PHONE_IMG_RE = /^!\[([^\]]*)\]\(asset:\/\/([^)]+)\)$/;

function PhoneCard({ post, paneRef, onScroll, more }) {
  const t = TYPES[post.type];
  const paras = post.body.split("\n").filter((p) => p.trim());
  const assets = post.images || [];
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
            {paras.length ? paras.map((p, i) => {
              /* 独占一行的 ![说明](asset://id) 在预览里落成一张图，实现图文混排 */
              const m = p.trim().match(PHONE_IMG_RE);
              if (m) {
                const im = assets.find((x) => x.id === m[2]);
                return <div key={i} className="pimgblock" style={im ? { background: im.color } : null}>{!im && <span>素材已不在</span>}</div>;
              }
              return <p key={i} style={{ marginBottom: 10 }}>{tagNodes(p, t.color, "pv" + i)}</p>;
            }) : <p style={{ color: "#C9C4B8" }}>正文会实时出现在这里…</p>}
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
