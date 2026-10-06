/* publish.jsx — 发布弹层：只列「支持这篇稿子类型」的平台，方块就是平台 icon
   账号 → 频道：多频道的平台（小宇宙多个节目 / 喜马拉雅多个专辑）选中后，
   弹层里追加一行频道选择 —— 凭据在账号上，落点在频道上；单频道平台不用选。 */
function PublishSheet({ post, platforms, onToggle, onImport, onClose, onConfirm }) {
  const t = TYPES[post.type];
  /* 频道选择只在弹层内记账：platformId → channelId，确认时随任务带走 */
  const [chan, setChan] = React.useState({});
  /* 平台矩阵驱动：不支持当前类型的平台根本不出现 */
  const supported = platforms.filter((p) => supportsType(p, post.type));
  const selected = supported.filter((p) => p.selected);
  /* 选中且账号底下有多个频道的平台，才需要挑 */
  const needChannel = selected.filter((p) => channelsOf(p) && channelsOf(p).length > 1);
  const bodyLen = post.body.length;
  /* 约束预检：发布前就算出哪个平台会拒稿（与任务页的失败归因同源） */
  const problemOf = (p) => {
    if (p.id === "weibo" && bodyLen > 500) return "正文 " + bodyLen + " 字 · 超出 500 字上限";
    return null;
  };
  /* 三态与设置里的默认名单一致：选中 = 平台色填满，没选中 = 同色淡底，凭据没拿到 = 中性灰。
     淡底用 color-mix：平台色可能是主题变量（如 X），字符串拼透明度会失效 */
  const skinOf = (p) => {
    if (p.state !== "ok") return { background: "var(--hover)", color: "var(--ink3)" };
    if (p.selected) return { background: p.color, color: p.fg || "#fff" };
    return { background: "color-mix(in srgb," + p.color + " 20%,transparent)", color: p.fg ? "var(--ink)" : p.color };
  };
  return (
    <div className="m-overlay" onClick={onClose}>
      <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-head">
          <h2>发布到平台</h2>
          <span className="m-typechip-sm" style={{ background: t.color }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#fff", display: "inline-block" }}></span>
            {t.zh}
          </span>
          <span className="sel">已选 {String(selected.length).padStart(2, "0")} / {supported.length}</span>
        </div>
        <div className="m-platwall">
          {supported.map((p) => {
            const problem = problemOf(p);
            const failed = p.state !== "ok";
            return (
              <button
                key={p.id}
                className={"m-platico" + (p.selected ? " sel" : "") + (failed ? " fail" : "")}
                style={skinOf(p)}
                onClick={() => (failed ? onImport() : onToggle(p.id))}
                title={p.name + (failed ? " · 账号未连接，点一下可修复" : problem ? " · " + problem : "")}
                aria-label={p.name}
              >
                {p.char}
                {p.selected && !failed && <span className="m-platck"><IcCheck size={11} /></span>}
                {failed && <span className="m-platretry"><IcRetry size={10} /></span>}
                {problem && !failed && <span className="m-platdot"></span>}
              </button>
            );
          })}
        </div>
        {needChannel.length > 0 && (
          <div className="m-chrows">
            {needChannel.map((p) => {
              const list = channelsOf(p);
              const cur = list.find((c) => c.id === chan[p.id]) || list[0];
              return (
                <div className="m-chrow" key={p.id}>
                  <span className="m-chsq" style={{ background: p.color, color: p.fg || "#fff" }}>{p.char}</span>
                  <span className="m-chlabel">发到「{p.name}」的哪个频道</span>
                  <span className="w-selwrap">
                    <select
                      value={cur.id}
                      onChange={(e) => setChan((m) => ({ ...m, [p.id]: e.target.value }))}
                      aria-label={p.name + " 发布频道"}
                    >
                      {list.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                    <span className="cv" aria-hidden="true"><IcCaret size={10} /></span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="m-sheet-foot">
          <button className="m-ghostbtn" onClick={onClose}>取消</button>
          <button className="m-confirmbtn" disabled={!selected.length} onClick={() => onConfirm(chan)}>
            <IcSend size={15} /> 确认发布
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PublishSheet });
