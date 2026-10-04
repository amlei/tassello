/* settings.jsx — 设置：外观（主题色）+ 浏览器选择 + 平台账号 + 各类型的默认发布平台
   原先摊在左栏底下的那份平台清单收进这里：出口是低频配置，
   不该占日常动线上的位置，也不该在左栏里长成第三个实体。 */

const THEME_KEY = "onda-theme";

/* 浏览器选择 + 导入登录态：导入是独立的显式动作，不绑定在任何单个平台上 ——
   覆盖的是全平台共用的 Cookies 库，多平台同时失效时也只需导入一次，
   导入完成后自动重新检查全部账号（实现见 packages/server/src/accounts.ts 的 importProfile）。
   全局单选 —— 复制的是整个 Cookies 库且解密密钥绑单一 Local State，做不到按平台混用；
   切换只是换偏好，下次导入才以新浏览器整体覆盖。按平台绑定导入来源已记入 docs/todo.md。 */
const BROWSER_KEY = "onda-import-browser";
const BROWSERS = [
  { id: "chrome", name: "Google Chrome", detected: true },
  { id: "edge", name: "Microsoft Edge", detected: true },
];
function getBrowserPref() {
  const v = localStorage.getItem(BROWSER_KEY);
  return BROWSERS.some((b) => b.id === v) ? v : "chrome";
}

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

/* 浏览器选择：一枚 select —— 以后支持的浏览器多了，行内下拉比卡片耐放。
   控件左侧挂品牌 icon（option 是原生菜单放不了图，icon 跟随当前选中项切换），
   小白用户靠图形直接认浏览器；未检测到的禁用并带后缀，让人知道为什么选不了。 */
const BROWSER_ICONS = { chrome: IcChrome, edge: IcEdge };
function BrowserSelect() {
  const [sel, setSel] = React.useState(() => getBrowserPref());
  const pick = (e) => {
    const id = e.target.value;
    setSel(id);
    try { localStorage.setItem(BROWSER_KEY, id); } catch (err) {}
  };
  const SelIcon = BROWSER_ICONS[sel] || IcChrome;
  return (
    <span className="w-selwrap">
      <span className="bico" aria-hidden="true"><SelIcon size={14} /></span>
      <select value={sel} onChange={pick} aria-label="浏览器选择">
        {BROWSERS.map((b) => (
          <option key={b.id} value={b.id} disabled={!b.detected}>
            {b.name + (b.detected ? "" : "（未安装）")}
          </option>
        ))}
      </select>
      <span className="cv" aria-hidden="true"><IcCaret size={10} /></span>
    </span>
  );
}

/* 平台账号一行 = 一枚方块 + 平台名 + 「拿到的是哪个账号」。
   凭据详情不往下展开 —— 那会把下面的名单顶走、还让人丢失上下文；
   改成从这一行旁边浮出来：左列的账号往左弹，右列的往右弹。
   busy：全局导入后的批量重校验进行中 —— 覆盖动作改了所有平台的 Cookies，
   每一行的状态都要等重校验结果落定，期间统一显示「检查中…」。 */
function AccountRow({ p, active, busy, onToggle }) {
  const off = p.state !== "ok";
  const a = p.account;
  return (
    <button
      className={"w-acct" + (off && !busy ? " fail" : "") + (active ? " active" : "")}
      onClick={onToggle}
      aria-expanded={active}
      title={off && !busy ? p.accountError : "查看账号信息"}
    >
      <span className="w-sq" style={{ background: p.color, opacity: off && !busy ? 0.38 : 1 }}></span>
      <span className="w-acctname">{p.name}</span>
      <span className="w-acctwho">
        {off && !busy
          ? "未连接账号"
          : a
            ? (a.channels && a.channels.length > 1 ? a.name + " · " + a.channels.length + " 个频道" : a.name)
            : ""}
      </span>
      {busy
        ? <span className="w-statchip busy">检查中…</span>
        : off
          ? <span className="w-statchip bad">获取失败</span>
          : <span className="w-statchip ok">已获取</span>}
      <span className="w-acctchev"><IcChevron size={11} dir={active ? "left" : "right"} /></span>
    </button>
  );
}

/* 悬浮凭据卡：账号 ID、授权有效期、最近校验，以及最关键的一句 ——
   发布到这儿的内容，最后落在那个账号的哪里。
   失效时的按钮只校验当前选中的平台；登录态源头过期时引导去全局「导入」。 */
function AccountPop({ p, side, style, busy, onImport, onVerify, onClose }) {
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
        <span className="w-sq" style={{ background: p.color, opacity: off && !busy ? 0.38 : 1 }}></span>
        <span className="t">{p.name}</span>
        {busy
          ? <span className="w-statchip busy">检查中…</span>
          : off ? <span className="w-statchip bad">获取失败</span> : <span className="w-statchip ok">已获取</span>}
        <button className="w-acctpop-x" onClick={onClose} aria-label="关闭账号信息"><IcX size={11} /></button>
      </div>
      {off ? (
        <div className="w-acctpop-body">
          <p className="w-accterr"><IcAlert size={12} /> {p.accountError}</p>
          <button className="w-relink" onClick={() => onVerify(p.id)} disabled={busy}>
            <IcRetry size={11} /> {busy ? "检查中…" : "重新检查"}
          </button>
          <p className="w-imphint">在浏览器里重新登录过？点上方「导入」，所有平台账号自动更新。</p>
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
            <div><dt>授权</dt><dd>有效期至 {a.until} · 上次检查 {a.checked}</dd></div>
            <div><dt>发布去向</dt><dd>{a.lands}</dd></div>
          </dl>
          {/* 重新检查：只查这个平台的登录态是否仍有效，不复制任何文件 */}
          <button className="w-relink" onClick={onVerify} disabled={busy}>
            <IcRetry size={11} /> {busy ? "检查中…" : "重新检查"}
          </button>
          {/* 账号 → 频道：小宇宙的节目 / 喜马拉雅的专辑 / 荔枝的播单。
              频道才是发布目标，凭据只是入场券 —— 所以在这里把两者分开列清楚 */}
          {a.channels && a.channels.length > 0 && (
            <div className="w-chlist">
              <div className="w-chhead">
                <span>频道 · {a.channels.length}</span>
                <button className="w-chsync" title="从平台后台重新拉取这个账号的频道列表">同步频道</button>
              </div>
              {a.channels.map((c) => (
                <div className="w-chrow" key={c.id}>
                  <span className="w-chdot" style={{ background: p.color }}></span>
                  <span className="w-chname">{c.name}</span>
                  <span className="w-chmeta">{c.items}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsSheet({ platforms, defaults, onToggle, onImport, onVerify, importing, onClose }) {
  const [pop, setPop] = React.useState(null); // { id, side, top, left }
  const sheetRef = React.useRef(null);
  const busy = !!importing; // 全局导入 / 批量重校验进行中

  const POP_W = 336, GAP = 14, M = 12, POP_H = 360;

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

  /* Esc：先收凭据卡，最后才关设置（导入确认浮层挂在 App 层，自己收自己） */
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (pop) setPop(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pop, onClose]);

  /* 浏览器选择 + 导入按钮（导入入口全局唯一） */
  const importLabel = importing === "copying" ? "导入中…" : importing === "verifying" ? "检查中…" : "导入";

  return (
    <>
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

            {/* 〇.五、浏览器选择 + 导入登录态：导入是随时可用的独立动作，
                    日常浏览器重新登录后点一下，全部平台自动覆盖 + 重校验 */}
            <section className="w-setsec">
              <div className="w-sethead">
                <h4>浏览器选择</h4>
                <span className="w-settools">
                  <BrowserSelect />
                  <button className="w-importbtn" onClick={onImport} disabled={busy}>
                    <IcRetry size={11} /> {importLabel}
                  </button>
                </span>
              </div>
            </section>

            {/* 一、平台账号：凭据状态是发布能不能成的唯一前提。
                    「已获取」三个字本身证明不了什么，所以每行都写明是哪个账号，点一下看凭据。 */}
            <section className="w-setsec">
              <h4>平台账号</h4>
              <div className="w-accts">
                {platforms.map((p) => (
                  <AccountRow key={p.id} p={p} active={!!pop && pop.id === p.id} busy={busy} onToggle={openPop(p)} />
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
                              onClick={() => (off ? onImport() : onToggle(k, p.id))}
                              title={p.name + (off ? " · 账号未连接，点一下可修复" : on ? " · 已是" + t.zh + "的默认平台" : " · 点一下设为" + t.zh + "的默认平台")}
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
              busy={busy}
              onImport={onImport}
              onVerify={() => onVerify(p.id)}
              onClose={() => setPop(null)}
            />
          ) : null;
        })()}
      </div>
    </>
  );
}

Object.assign(window, { SettingsSheet });
