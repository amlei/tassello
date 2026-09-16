/* settings.jsx — 设置：平台账号 + 各类型的默认发布平台
   原先摊在左栏底下的那份平台清单收进这里：出口是低频配置，
   不该占日常动线上的位置，也不该在左栏里长成第三个实体。 */

/* 平台账号一行 = 一枚方块 + 平台名 + 「拿到的是哪个账号」。
   凭据详情不往下展开 —— 那会把下面的名单顶走、还让人丢失上下文；
   改成从这一行旁边浮出来：左列的账号往左弹，右列的往右弹。 */
function AccountRow({ p, active, onToggle }) {
  const off = p.state !== "ok";
  const a = p.account;
  return (
    <button
      className={"w-acct" + (off ? " fail" : "") + (active ? " active" : "")}
      onClick={onToggle}
      aria-expanded={active}
      title={off ? p.accountError : "查看这个账号的凭据"}
    >
      <span className="w-sq" style={{ background: p.color, opacity: off ? 0.38 : 1 }}></span>
      <span className="w-acctname">{p.name}</span>
      <span className="w-acctwho">{off ? "未连接账号" : (a ? a.name + " · " + a.kind : "")}</span>
      {off
        ? <span className="w-statchip bad">获取失败</span>
        : <span className="w-statchip ok">已获取</span>}
      <span className="w-acctchev"><IcChevron size={11} dir={active ? "left" : "right"} /></span>
    </button>
  );
}

/* 悬浮凭据卡：账号 ID、授权有效期、最近校验，以及最关键的一句 ——
   发布到这儿的内容，最后落在那个账号的哪里。 */
function AccountPop({ p, side, style, onReacquire, onClose }) {
  const off = p.state !== "ok";
  const a = p.account;
  return (
    <div
      className={"w-acctpop " + side}
      style={style}
      role="dialog"
      aria-label={p.name + " 账号信息"}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-acctpop-head">
        <span className="w-sq" style={{ background: p.color, opacity: off ? 0.38 : 1 }}></span>
        <span className="t">{p.name}</span>
        {off ? <span className="w-statchip bad">获取失败</span> : <span className="w-statchip ok">已获取</span>}
        <button className="w-acctpop-x" onClick={onClose} aria-label="关闭账号信息"><IcX size={11} /></button>
      </div>
      {off ? (
        <div className="w-acctpop-body">
          <p className="w-accterr"><IcAlert size={12} /> {p.accountError}</p>
          <button className="w-relink" onClick={() => onReacquire(p.id)}>
            <IcRetry size={11} /> 重新获取{String(p.name)}账号
          </button>
        </div>
      ) : (
        <div className="w-acctpop-body">
          <div className="w-acctpop-acc">
            <span className="w-avatar" style={{ background: p.color, color: p.fg || "#fff" }} aria-hidden="true">{a.name.slice(0, 1)}</span>
            <div className="w-acctpop-who">
              <div className="n">{a.name}<span className="w-acctkind">{a.kind}</span></div>
              <div className="u">{a.uid}</div>
            </div>
          </div>
          <dl className="w-acctrows">
            <div><dt>授权</dt><dd>有效至 {a.until} · 最近校验 {a.checked}</dd></div>
            <div><dt>发布去向</dt><dd>{a.lands}</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}

function SettingsSheet({ platforms, defaults, onToggle, onAcquire, onReacquire, onClose }) {
  const okCount = platforms.filter((p) => p.state === "ok").length;
  const picked = TYPE_ORDER.reduce((n, k) => n + (defaults[k] || []).length, 0);
  const [pop, setPop] = React.useState(null); // { id, side, top, left }
  const sheetRef = React.useRef(null);

  const POP_W = 336, GAP = 14, M = 12, POP_H = 240;

  /* 点一行：按它落在左列还是右列，把凭据卡放到弹窗外侧的对应一边。
     窗口太窄时哪边宽就往哪边放；实在都放不下就贴视口边缘压住弹窗。 */
  const openPop = (p) => (e) => {
    if (pop && pop.id === p.id) { setPop(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const s = sheetRef.current.getBoundingClientRect();
    const wantRight = (r.left - s.left) > s.width / 2;
    const rightRoom = window.innerWidth - s.right - GAP - M;
    const leftRoom = s.left - GAP - M;
    let side = wantRight ? "right" : "left";
    if (side === "left" && leftRoom < POP_W && rightRoom > leftRoom) side = "right";
    if (side === "right" && rightRoom < POP_W && leftRoom > rightRoom) side = "left";
    const rawLeft = side === "right" ? s.right + GAP : s.left - GAP - POP_W;
    setPop({
      id: p.id,
      side,
      left: Math.max(M, Math.min(rawLeft, window.innerWidth - POP_W - M)),
      top: Math.max(M, Math.min(r.top - 12, window.innerHeight - POP_H - M)),
    });
  };

  React.useEffect(() => {
    const close = () => setPop(null);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);

  /* Esc：先收凭据卡，再按一次才关设置 */
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (pop) setPop(null); else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pop, onClose]);

  return (
    <div className="m-overlay" onClick={() => (pop ? setPop(null) : onClose())}>
      <div className="m-sheet w-set" data-screen-label="设置" ref={sheetRef} onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-head">
          <h2>设置</h2>
          <span className="sel">{okCount}/{platforms.length} 已获取</span>
        </div>
        <div className="m-sheet-sub">平台账号与默认发布名单。只有拿到凭据的平台能作为发布出口。</div>

        <div className="w-setscroll" onScroll={() => { if (pop) setPop(null); }}>
          {/* 一、平台账号：凭据状态是发布能不能成的唯一前提，所以放在最上。
                 「已获取」三个字本身证明不了什么，所以每行都写明是哪个账号，点一下看凭据。 */}
          <section className="w-setsec">
            <h4>平台账号 <span className="w-setn">点一行看账号详情</span></h4>
            <div className="w-accts">
              {platforms.map((p) => (
                <AccountRow key={p.id} p={p} active={!!pop && pop.id === p.id} onToggle={openPop(p)} />
              ))}
            </div>
          </section>

          {/* 二、默认发布名单：每种稿子挑一次，发布弹层就按这份名单预选 */}
          <section className="w-setsec">
            <h4>默认发布平台 <span className="w-setn">已定 {picked} 项</span></h4>
            <p className="w-setnote">每种稿子挑一次，之后打开发布弹层就按这份名单预选。灰掉的平台是凭据获取失败，点一下会先重新获取，再设为该类型的默认。</p>
            <div className="m-typerows">
              {TYPE_ORDER.map((k) => {
                const t = TYPES[k];
                const list = platforms.filter((p) => supportsType(p, k));
                const chosen = defaults[k] || [];
                return (
                  <div className="m-typerow" key={k}>
                    <span className="m-trowlabel">
                      <span className="sq" style={{ background: t.color }}></span>
                      {t.zh}
                    </span>
                    <div className="m-trowicons">
                      {list.map((p) => {
                        const on = chosen.indexOf(p.id) >= 0;
                        const off = p.state !== "ok";
                        /* 三态：选中 = 平台色填满；没选中 = 同色淡底（保留平台身份）；凭据没拿到 = 中性灰 */
                        const skin = off
                          ? { background: "#F1EFE8", color: "#A9A294" }
                          : on
                            ? { background: p.color, color: p.fg || "#fff" }
                            : { background: p.color + "33", color: p.fg ? "#16130E" : p.color };
                        return (
                          <button
                            key={p.id}
                            className={"m-platico sm" + (on ? " sel" : "") + (off ? " muted" : "")}
                            style={skin}
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
          </section>
        </div>

        <div className="m-sheet-foot">
          <span className="cnt">默认名单只管预选，每次发布仍可临时增减</span>
          <button className="m-ghostbtn" onClick={onClose}>完成</button>
        </div>
      </div>

      {pop && (() => {
        const p = platforms.find((x) => x.id === pop.id);
        return p ? (
          <AccountPop
            p={p}
            side={pop.side}
            style={{ top: pop.top, left: pop.left, width: POP_W }}
            onReacquire={onReacquire}
            onClose={() => setPop(null)}
          />
        ) : null;
      })()}
    </div>
  );
}

Object.assign(window, { SettingsSheet });
