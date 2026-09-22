/* settings.jsx — 设置：外观（主题色）+ 平台账号 + 各类型的默认发布平台
   原先摊在左栏底下的那份平台清单收进这里：出口是低频配置，
   不该占日常动线上的位置，也不该在左栏里长成第三个实体。 */

const THEME_KEY = "onda-theme";

/* 主题偏好：浅色 / 深色 / 跟随系统（默认系统）。
   首屏防闪烁与系统跟随由 index.html 里的常驻脚本负责，这里只落偏好。 */
function applyTheme(pref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
function getThemePref() {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}
function ThemeSwitcher() {
  const [pref, setPref] = React.useState(() => getThemePref());
  const pick = (p) => {
    setPref(p);
    try { localStorage.setItem(THEME_KEY, p); } catch (e) {}
    applyTheme(p);
  };
  const opts = [
    { id: "light", label: "浅色" },
    { id: "dark", label: "深色" },
    { id: "system", label: "跟随系统" },
  ];
  return (
    <div className="w-theme" role="radiogroup" aria-label="外观">
      {opts.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={pref === o.id}
          className={pref === o.id ? "on" : ""}
          onClick={() => pick(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

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
      <span className="w-acctwho">{off ? "未连接账号" : (a ? a.name : "")}</span>
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
            <IcRetry size={11} /> 重新获取
          </button>
        </div>
      ) : (
        <div className="w-acctpop-body">
          <div className="w-acctpop-acc">
            <span className="w-avatar" style={{ background: p.color, color: p.fg || "#fff" }} aria-hidden="true">{a.name.slice(0, 1)}</span>
            <div className="w-acctpop-who">
              <div className="n">{a.name}</div>
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
        </div>

        <div className="w-setscroll" onScroll={() => { if (pop) setPop(null); }}>
          {/* 〇、外观：标题与主题切换器同一行，不占两行 */}
          <section className="w-setsec">
            <div className="w-sethead">
              <h4>外观</h4>
              <ThemeSwitcher />
            </div>
          </section>

          {/* 一、平台账号：凭据状态是发布能不能成的唯一前提。
                  「已获取」三个字本身证明不了什么，所以每行都写明是哪个账号，点一下看凭据。 */}
          <section className="w-setsec">
            <h4>平台账号</h4>
            <div className="w-accts">
              {platforms.map((p) => (
                <AccountRow key={p.id} p={p} active={!!pop && pop.id === p.id} onToggle={openPop(p)} />
              ))}
            </div>
          </section>

          {/* 二、默认发布名单：每种稿子挑一次，发布弹层就按这份名单预选 */}
          <section className="w-setsec">
            <h4>默认发布平台</h4>
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
                        /* 三态：选中 = 平台色填满；没选中 = 同色淡底（保留平台身份）；凭据没拿到 = 中性灰。
                           淡底用 color-mix：平台色可能是主题变量（如 X），字符串拼透明度会失效 */
                        const skin = off
                          ? { background: "var(--hover)", color: "var(--ink3)" }
                          : on
                            ? { background: p.color, color: p.fg || "#fff" }
                            : { background: "color-mix(in srgb," + p.color + " 20%,transparent)", color: p.fg ? "var(--ink)" : p.color };
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
          <button className="m-donebtn" onClick={onClose}>完成</button>
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
