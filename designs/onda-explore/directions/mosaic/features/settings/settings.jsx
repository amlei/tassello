/* features/settings/settings.jsx — 设置、账号与默认发布目标。
   主题属于基础设置，不单独占一个分类。
   原先摊在左栏底下的那份平台清单收进这里：出口是低频配置，
   不该占日常动线上的位置，也不该在左栏里长成第三个实体。 */

const THEME_KEY = "onda-theme";

/* 主题偏好：浅色 / 深色 / 跟随系统（默认系统）。
   首屏防闪烁与系统跟随由 index.html 里的常驻脚本负责，这里只落偏好。 */
function applyTheme(pref) {
  document.documentElement.dataset.theme = pref;
  document.documentElement.style.colorScheme = pref === "system" ? "light dark" : pref;
}
function getThemePref() {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}
function ThemeSwitcher() {
  const [pref, setPref] = React.useState(() => getThemePref());
  React.useEffect(() => {
    const syncFromStorage = (event) => {
      if (event.key === THEME_KEY) {
        const next = getThemePref();
        setPref(next);
        applyTheme(next);
      }
    };
    window.addEventListener("storage", syncFromStorage);
    return () => window.removeEventListener("storage", syncFromStorage);
  }, []);
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
    <div className="w-theme" role="radiogroup" aria-label="主题">
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

/* 浏览器不是下拉选项：用户直接把扩展装到 Chrome 或 Edge。 */
const EXTENSION_INSTALLS = [
  { id: "chrome", name: "Chrome", Icon: IcChrome },
  { id: "edge", name: "Edge", Icon: IcEdge },
];

function ExtensionCard({ extension, install, onInstall, onManualInstall }) {
  const connected = extension.status === "connected";
  const installing = install && (install.phase === "opening" || install.phase === "waiting");
  const failed = install && install.phase === "error";
  const currentBrowser = connected && /edge/i.test(extension.browser)
    ? "edge"
    : connected && /chrome/i.test(extension.browser)
      ? "chrome"
      : null;
  const healthLabel = failed ? "需要重试" : installing ? "连接中" : connected ? "可用" : "待连接";
  return (
    <section className="w-extsetup">
      <div className="w-extsetup-head">
        <span className="w-extsetup-mark"><IcPuzzle size={16} /></span>
        <span className="w-extsetup-copy">
          <b>浏览器扩展</b>
          <span>安装后自动连接，桌面端和 Obsidian 共用</span>
        </span>
        <span className={"w-exthealth" + (failed ? " bad" : installing ? " wait" : connected ? " on" : "")} role="status">
          <i></i>
          {healthLabel}
        </span>
      </div>
      <div>
        {EXTENSION_INSTALLS.map(({ id, name, Icon }) => {
          const active = currentBrowser === id;
          const targeted = install && install.browser === id;
          const phase = targeted ? install.phase : null;
          const rowConnected = active || phase === "connected";
          const rowBusy = phase === "opening" || phase === "waiting";
          const rowFailed = phase === "error";
          return (
            <div
              key={id}
              className={"w-installrow" + (targeted ? " targeted" : "")}
            >
              <span className="w-installlogo"><Icon size={22} /></span>
              <span className="w-installcopy">
                <b>{name} 扩展程序</b>
                <span className={rowConnected ? "ok" : rowFailed ? "bad" : rowBusy ? "wait" : ""}>
                  {rowConnected
                    ? "已连接，可直接发布"
                    : phase === "opening"
                      ? `正在 ${name} 中打开安装页…`
                      : phase === "waiting"
                        ? `等待 ${name} 扩展自动连接…`
                        : rowFailed
                          ? "连接失败，请重新安装或重试"
                          : `在 ${name} 中安装后自动连接`}
                </span>
              </span>
              {rowConnected ? (
                <span className="w-installstate"><IcCheck size={10} /> 当前</span>
              ) : (
                <button
                  className={"w-installaction" + (rowFailed ? " retry" : "")}
                  onClick={() => onInstall(id)}
                  disabled={rowBusy}
                >
                  {rowBusy ? "连接中…" : rowFailed ? "重试" : "安装"}
                  {!rowBusy && <IcLinkOut size={11} />}
                </button>
              )}
            </div>
          );
        })}
        <div className="w-installrow manual">
          <span className="w-installlogo"><IcPanel size={17} /></span>
          <span className="w-installcopy">
            <b>无法访问扩展商店？</b>
            <span>手动加载扩展，安装完成后同样自动连接</span>
          </span>
          <button className="w-installaction" onClick={onManualInstall}>手动安装</button>
        </div>
        {failed && (
          <div className="w-extnotice" role="alert">
            <IcAlert size={12} />
            <span>{install.browser === "edge" ? "Edge" : "Chrome"} 扩展没有完成自动连接。</span>
            <button onClick={() => onInstall(install.browser)}>重新检查</button>
          </div>
        )}
      </div>
    </section>
  );
}

function VaultCard({ vault, onChoose }) {
  const healthy = vault.status === "ok";
  return (
    <div className="w-settingrow">
      <span className={"w-basicsq md" + (healthy && vault.conflicts === 0 ? " ok" : " warn")}>MD</span>
      <span className="w-settingmain">
        <span className="w-settingtitle">
          <b>内容目录</b>
          <span className={"w-statchip " + (vault.conflicts ? "bad" : healthy ? "ok" : "busy")}>
            {vault.conflicts ? "有冲突" : healthy ? "可发布" : "待选择"}
          </span>
        </span>
        <button className="w-vaultpath" onClick={onChoose}>
          <span className="w-vaulttitle">{vault.path || "尚未选择目录"}</span>
          {vault.path && (
            <span className="w-vaultmeta">
              {vault.files} 篇{vault.warnings ? ` · ${vault.warnings} 个提示` : ""}{vault.conflicts ? ` · ${vault.conflicts} 个重复 ID` : ""}
            </span>
          )}
        </button>
      </span>
      <div className="w-rowactions">
        <button className="w-rowbutton" onClick={onChoose}>选择目录</button>
      </div>
    </div>
  );
}

function AttachmentCard({ path, onChange }) {
  return (
    <div className="w-settingrow">
      <span className="w-basicsq"><IcFolderFiles size={15} /></span>
      <span className="w-settingmain">
        <span className="w-settingtitle"><b>资源目录</b></span>
        <button type="button" className="w-vaultpath" onClick={onChange}>
          <span className="w-vaulttitle">{path}</span>
          <span className="w-vaultmeta">粘贴和上传的图片、视频、音频保存在这里</span>
        </button>
      </span>
      <div className="w-rowactions">
        <button type="button" className="w-rowbutton" onClick={onChange}>修改</button>
      </div>
    </div>
  );
}

function AttachmentPathPicker({ value, onSave, onClose }) {
  const [draft, setDraft] = React.useState(value);
  const save = () => {
    const next = draft.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
    if (next) onSave(next);
  };
  return (
    <div className="m-overlay w-vaultpick-overlay" onClick={onClose}>
      <div className="m-mini w-vaultpick" role="dialog" aria-modal="true" aria-label="设置资源目录" onClick={(event) => event.stopPropagation()}>
        <h3>资源目录</h3>
        <p>相对内容目录，也可填写绝对路径；Obsidian 使用自身的附件设置。</p>
        <input
          className="w-pathinput"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="media"
          aria-label="资源目录路径"
          autoFocus
        />
        <div className="m-mini-foot">
          <button type="button" className="m-btn-plain" onClick={onClose}>取消</button>
          <button className="m-btn-primary" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
}

function VaultPicker({ vault, onPick, onClose }) {
  const choices = [
    { path: "~/Documents/Onda", meta: "默认 · 将创建 articles/ 与 .onda/", status: "ok" },
    { path: "~/Documents/写作库", meta: "Obsidian · 128 篇", status: "ok" },
  ];
  return (
    <div className="m-overlay w-vaultpick-overlay" onClick={onClose}>
      <div className="m-mini w-vaultpick" role="dialog" aria-modal="true" aria-label="选择内容目录" onClick={(event) => event.stopPropagation()}>
        <h3>选择内容目录</h3>
        <p>选择 Onda 内容根目录，可以放在已有 Obsidian Vault 内。</p>
        <div className="w-vaultchoices">
          {choices.map((choice) => (
            <button key={choice.path} className={"w-vaultchoice" + (vault.path === choice.path ? " active" : "")} onClick={() => onPick(choice)}>
              <span className="w-vaultmark ok">MD</span>
              <span>
                <b>{choice.path}</b>
                <small>{choice.meta}</small>
              </span>
              {vault.path === choice.path && <IcCheck size={11} />}
            </button>
          ))}
        </div>
        <div className="m-mini-foot">
          <button type="button" className="m-btn-plain" onClick={onClose}>取消</button>
          <button className="m-btn-primary" onClick={() => onPick({ path: "~/Documents/新内容目录", meta: "空目录 · 将创建 articles/", status: "ok" })}>选择其他文件夹…</button>
        </div>
      </div>
    </div>
  );
}

/* 平台账号一行 = 一枚方块 + 平台名 + 「拿到的是哪个账号」。
   凭据详情不往下展开 —— 那会把下面的名单顶走、还让人丢失上下文；
   改成从这一行旁边浮出来：左列的账号往左弹，右列的往右弹。
   busy：扩展正在为当前平台执行 verify，期间统一显示「检查中…」。 */
function accountPhase(p) {
  return p.syncPhase || (p.state === "ok" ? "connected" : "needs_login");
}
const ACCOUNT_PHASE_COPY = {
  extension_offline: ["等待扩展", "等待浏览器扩展连接"],
  unverified: ["待检测", "等待首次账号检查"],
  checking: ["检查中…", "正在读取浏览器登录态"],
  source_changed: ["重新验证", "浏览器或扩展来源已变化，请重新验证"],
  needs_login: ["需要登录", "需要在浏览器中登录该平台"],
  failed: ["检查失败", "账号检查没有完成，请重试"],
  unsupported: ["尚未接入", "该平台尚未接入浏览器扩展"],
  connected: ["已连接", ""],
};
function accountPhaseCopy(p) {
  return ACCOUNT_PHASE_COPY[accountPhase(p)] || ACCOUNT_PHASE_COPY.failed;
}
function AccountRow({ p, active, busy, onToggle }) {
  const off = accountPhase(p) !== "connected";
  const a = p.account;
  const [chip, reason] = accountPhaseCopy(p);
  return (
    <button
      className={"w-acct" + (off && !busy ? " fail" : "") + (active ? " active" : "")}
      onClick={onToggle}
      aria-expanded={active}
      title={off && !busy ? (p.accountError || reason) : "查看账号信息"}
    >
      <span className="w-sq" style={{ background: p.color, opacity: off && !busy ? 0.38 : 1 }}></span>
      <span className="w-acctname">{p.name}</span>
      <span className="w-acctwho">
        {off && !busy
          ? accountPhaseCopy(p)[0]
          : a
            ? (a.channels && a.channels.length > 1 ? a.name + " · " + a.channels.length + " 个频道" : a.name)
            : ""}
      </span>
      {busy
        ? <span className="w-statchip busy">检查中…</span>
        : off
          ? <span className={"w-statchip " + (accountPhase(p) === "unverified" || accountPhase(p) === "source_changed" || accountPhase(p) === "extension_offline" ? "busy" : "bad")}>{chip}</span>
          : <span className="w-statchip ok">已连接</span>}
      <span className="w-acctchev"><IcChevron size={11} dir={active ? "left" : "right"} /></span>
    </button>
  );
}

/* 悬浮凭据卡：账号 ID、授权有效期、最近校验，以及最关键的一句 ——
   发布到这儿的内容，最后落在那个账号的哪里。
   失效时先打开平台登录页；登录完成后由扩展重新获取这个账号。 */
function AccountPop({ p, side, style, busy, onOpenLogin, onVerify, onClose }) {
  const off = accountPhase(p) !== "connected";
  const a = p.account;
  const [chip, reason] = accountPhaseCopy(p);
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
          : off ? <span className="w-statchip bad">{chip}</span> : <span className="w-statchip ok">已连接</span>}
        <button className="w-acctpop-x" onClick={onClose} aria-label="关闭账号信息"><IcX size={11} /></button>
      </div>
      {off ? (
        <div className="w-acctpop-body">
          <p className="w-accterr"><IcAlert size={12} /> {p.accountError || reason}</p>
          <button className="w-relink" onClick={onOpenLogin}>
            在浏览器中打开登录页
          </button>
          <button className="w-relink" onClick={() => onVerify(p.id)} disabled={busy}>
            <IcRetry size={11} /> {busy ? "检查中…" : "重新检查"}
          </button>
          <p className="w-imphint">在浏览器里重新登录后，点「打开登录页」完成登录，扩展会自动重验这个平台。</p>
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
          {/* 重新检查：扩展打开后台标签页，只验证这个平台。 */}
          <button className="w-relink" onClick={() => onVerify(p.id)} disabled={busy}>
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

function RssFeedDialog({ rss, onSave, onClose }) {
  const [url, setUrl] = React.useState(rss?.feedUrl || "");
  const save = () => {
    const next = url.trim();
    if (!next) return;
    onSave(rss ? { ...rss, feedUrl: next } : null);
    onClose();
  };
  return (
    <div className="m-overlay w-vaultpick-overlay" onClick={onClose}>
      <div className="m-mini w-vaultpick w-rsspick" role="dialog" aria-modal="true" aria-label="播客 RSS" onClick={(event) => event.stopPropagation()}>
        <h3>播客 RSS</h3>
        <p>优先从小红书、微信公众号和蜻蜓 FM 的已导入记录中发现；没有记录时再手动填写。</p>
        <div className="w-rssfound">
          <span className="w-rssfoundicon"><IcRss size={14} /></span>
          <span>
            <b>自动发现 1 个 Feed</b>
            <small>{rss ? `${rss.title} · 来自小宇宙 · ${rss.episodeCount} 期` : "在当前账号中未发现"}</small>
          </span>
        </div>
        <label className="w-rssfield">
          <span>RSS 地址</span>
          <input
            className="w-pathinput"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/podcast/feed.xml"
            autoFocus
          />
        </label>
        {rss && (
          <div className="w-rssclaims">
            {rss.claims.map((claim) => {
              const platform = PLATFORMS.find((p) => p.id === claim.platformId);
              return (
                <span key={claim.platformId} className={"w-rssclaim " + (claim.state === "claimed" ? "on" : "")}>
                  <PlatformMark id={claim.platformId} char={platform?.char} size={13} tone={claim.state === "claimed" ? "lit" : "dim"} />
                  {platform?.name}
                  <em>{claim.label}</em>
                </span>
              );
            })}
          </div>
        )}
        <div className="m-mini-foot">
          <button type="button" className="m-btn-plain" onClick={onClose}>取消</button>
          <button className="m-btn-primary" onClick={save} disabled={!url.trim()}>保存</button>
        </div>
      </div>
    </div>
  );
}

function SettingsSheet({ platforms, defaults, rss, onRssChange, extension, extensionInstall, vault, onToggle, onOpenLogin, onVerify, onInstallExtension, onChooseVault, onClose }) {
  const [pop, setPop] = React.useState(null); // { id, side, top, left }
  const [vaultPicker, setVaultPicker] = React.useState(false);
  const [rssPicker, setRssPicker] = React.useState(false);
  const [attachmentPath, setAttachmentPath] = React.useState("media");
  const [attachmentPicker, setAttachmentPicker] = React.useState(false);
  const [section, setSection] = React.useState("basic");
  const sheetRef = React.useRef(null);
  const sections = [
    { id: "basic", label: "基础设置" },
    { id: "accounts", label: "平台账号" },
    { id: "defaults", label: "默认发布" },
  ];

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

  return (
    <>
      <div className="m-overlay" onClick={() => (pop ? setPop(null) : onClose())}>
        <div className="m-sheet w-set" data-screen-label="设置" ref={sheetRef} onClick={(e) => e.stopPropagation()}>
          <div className="w-setlayout">
            <nav className="w-setnav" aria-label="设置分类">
              <div className="w-setnavhead">
                <MosaicLogo size={7} />
                <span className="brandcopy">
                  <strong>设置</strong>
                  <span>九漾 Onda</span>
                </span>
              </div>
              <div className="w-setnavitems">
                {sections.map((item) => (
                  <button
                    key={item.id}
                    className={item.id === section ? "on" : ""}
                    onClick={() => { setSection(item.id); setPop(null); }}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </nav>

            <div className="w-setright">
              <div className="w-setpane" onScroll={() => { if (pop) setPop(null); }}>
                {section === "basic" && (
                  <section className="w-setsec">
                    <div className="w-basic-theme">
                      <b>主题</b>
                      <ThemeSwitcher />
                    </div>
                    <div className="w-settingrows">
                      <ExtensionCard
                        extension={extension}
                        install={extensionInstall}
                        onInstall={onInstallExtension}
                        onManualInstall={() => onOpenLogin("extension")}
                      />
                      <VaultCard
                        vault={vault}
                        onChoose={() => setVaultPicker(true)}
                      />
                      <AttachmentCard
                        path={attachmentPath}
                        onChange={() => setAttachmentPicker(true)}
                      />
                    </div>
                  </section>
                )}

                {section === "accounts" && (
                  <section className="w-setsec">
                    <div className="w-accts">
                      {platforms.filter((p) => !p.rssOnly).map((p) => (
                        <AccountRow key={p.id} p={p} active={!!pop && pop.id === p.id} busy={false} onToggle={openPop(p)} />
                      ))}
                    </div>
                  </section>
                )}

                {section === "defaults" && (
                  <section className="w-setsec">
                    <div className="m-typerows">
                      {TYPE_ORDER.map((k) => {
                        const t = TYPES[k];
                        const rssClaimed = k === "audio" && rss
                          ? new Set(rss.claims.filter((claim) => claim.state === "claimed" || claim.state === "indexed").map((claim) => claim.platformId))
                          : new Set();
                        const list = platforms.filter((p) => supportsType(p, k) && !p.rssOnly && !rssClaimed.has(p.id));
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
                                const off = accountPhase(p) !== "connected";
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
                                    onClick={() => (off ? onOpenLogin(p.id) : onToggle(k, p.id))}
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
                            {k === "audio" && (
                              <button className="m-rssentry" onClick={() => setRssPicker(true)} aria-label="查看播客 RSS" title="播客 RSS">
                                <IcRss size={16} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>
        </div>

        {pop && (() => {
          const p = platforms.find((x) => x.id === pop.id);
          return p ? (
            <AccountPop
              p={p}
              side={pop.side}
              style={{ top: pop.top, left: pop.left, width: POP_W }}
              busy={false}
              onOpenLogin={() => onOpenLogin(p.id)}
              onVerify={() => onVerify(p.id)}
              onClose={() => setPop(null)}
            />
          ) : null;
        })()}
      </div>
      {vaultPicker && (
        <VaultPicker
          vault={vault}
          onPick={(choice) => {
            onChooseVault({ status: "ok", path: choice.path, files: choice.path.includes("写作库") ? 128 : 60, conflicts: 0, warnings: 2, lastScan: "刚刚" });
            setVaultPicker(false);
          }}
          onClose={() => setVaultPicker(false)}
        />
      )}
      {attachmentPicker && (
        <AttachmentPathPicker
          value={attachmentPath}
          onSave={(next) => {
            setAttachmentPath(next);
            setAttachmentPicker(false);
          }}
          onClose={() => setAttachmentPicker(false)}
        />
      )}
      {rssPicker && (
        <RssFeedDialog
          rss={rss}
          onSave={onRssChange}
          onClose={() => setRssPicker(false)}
        />
      )}
    </>
  );
}

Object.assign(window, { SettingsSheet });
