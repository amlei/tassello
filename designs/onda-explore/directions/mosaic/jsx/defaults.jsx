/* defaults.jsx — 默认发布平台：按稿子类型各定一份名单，发布时自动点亮，不用每次手选。
   只有拿到凭据（state = ok）的平台可选，获取失败的一律灰掉。 */
function DefaultsSheet({ platforms, defaults, onToggle, onAcquire, onClose }) {
  const count = TYPE_ORDER.reduce((n, k) => n + defaults[k].length, 0);
  return (
    <div className="m-overlay" onClick={onClose}>
      <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-head">
          <h2>默认发布平台</h2>
          <span className="sel">已定 {count} 项</span>
        </div>
        <div className="m-sheet-sub">每种稿子挑一次，之后打开发布弹层就按这份名单预选。灰掉的平台是凭据获取失败，先重新获取才能选。</div>
        <div className="m-typerows">
          {TYPE_ORDER.map((k) => {
            const t = TYPES[k];
            const list = platforms.filter((p) => supportsType(p, k));
            return (
              <div className="m-typerow" key={k}>
                <span className="m-trowlabel">
                  <span className="sq" style={{ background: t.color }}></span>
                  {t.zh}
                </span>
                <div className="m-trowicons">
                  {list.map((p) => {
                    const on = defaults[k].indexOf(p.id) >= 0;
                    const off = p.state !== "ok";
                    return (
                      <button
                        key={p.id}
                        className={"m-platico sm" + (on ? " sel" : "") + (off ? " muted" : "")}
                        style={on && !off
                          ? { background: "#fff", color: p.color, boxShadow: "inset 0 0 0 2px " + p.color }
                          : { background: off ? "#F1EFE8" : p.color, color: off ? "#A9A294" : (p.fg || "#fff") }}
                        onClick={() => (off ? onAcquire(k, p.id) : onToggle(k, p.id))}
                        title={p.name + (off ? " · 获取失败，点一下重新获取并设为" + t.zh + "的默认平台" : on ? " · 已是" + t.zh + "的默认平台" : " · 点一下设为" + t.zh + "的默认平台")}
                        aria-label={p.name}
                      >
                        {p.char}
                        {on && !off && <span className="m-platck"><IcCheck size={9} /></span>}
                        {off && <span className="m-platretry"><IcRetry size={9} /></span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="m-sheet-foot">
          <span className="cnt">默认名单只管预选，每次发布仍可临时增减</span>
          <button className="m-ghostbtn" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DefaultsSheet });
