/* home.jsx — 首页「我的稿子」：bento 色板墙 */
function HomeView({ posts, onOpen, onNew, onDelete }) {
  const byType = (k) => posts.filter((p) => p.type === k);
  return (
    <div className="m-home">
      <div className="m-bento">
        {TYPE_ORDER.map((k, colIdx) => {
          const t = TYPES[k];
          const list = byType(k);
          return (
            <div className="m-typecol" key={k}>
              <div className="m-typetile" style={{ background: t.color, minHeight: 176 - colIdx * 14 }}>
                <div className="zh">{t.zh}</div>
                <div className="en">{t.en}</div>
                <div className="count">{String(list.length).padStart(2, "0")}</div>
                <div className="glyph">{t.glyph}</div>
                <button className="m-newbtn" onClick={() => onNew(k)}>
                  <IcPlus size={13} /> 新建{t.zh}
                </button>
              </div>
              {list.map((p) => (
                <PostCard key={p.id} post={p} onOpen={onOpen} onDelete={onDelete} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PostCard({ post, onOpen, onDelete }) {
  const t = TYPES[post.type];
  const excerpt = post.body.split("\n").filter(Boolean)[0] || "";
  const [confirming, setConfirming] = React.useState(false);
  return (
    <div className="m-card" onClick={() => onOpen(post.id)}>
      {/* 删除：hover 浮现的 ×，点一次变「删除？」再点确认；不触发进编辑 */}
      <button
        className={"m-card-del" + (confirming ? " confirm" : "")}
        onClick={(e) => {
          e.stopPropagation();
          if (confirming) onDelete(post.id);
          else setConfirming(true);
        }}
        onMouseLeave={() => setConfirming(false)}
        aria-label={confirming ? "确认删除" : "删除这篇稿子"}
      >
        {confirming ? "删除？" : <IcX size={12} />}
      </button>
      <div className="m-card-top">
        <span className="m-card-sq" style={{ background: t.color }}></span>
        <span className="m-card-kind">{t.en}</span>
        <span className={"m-card-status " + (post.status === "published" ? "pub" : "draft")}>
          {post.status === "published" ? "已发布" : "草稿"}
        </span>
      </div>
      <h3>{post.title || "未命名稿子"}</h3>
      <p>{excerpt || "还没写内容，点开继续。"}</p>
      {post.images && (
        <div className="m-thumbstrip">
          {post.images.slice(0, 5).map((im) => (<i key={im.id} style={{ background: im.color }}></i>))}
        </div>
      )}
      <div className="m-card-meta">
        <span>{post.updated}</span>
        <span>{post.body.length} 字</span>
        {post.duration && <span>{post.duration}</span>}
      </div>
    </div>
  );
}

Object.assign(window, { HomeView });
