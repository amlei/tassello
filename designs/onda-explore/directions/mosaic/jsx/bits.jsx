/* bits.jsx — 共享小组件：Logo、#标签 高亮、音频假播放条 */
function MosaicLogo({ size = 11 }) {
  const cells = ["#2C6FF0", "#D52088", "#FD8D11", "#0EC3D4", "c", "#07B56F", "#FD8D11", "#2C6FF0", "#D52088"];
  return (
    <div className="m-logo" style={{ gridTemplateColumns: "repeat(3," + size + "px)", gridTemplateRows: "repeat(3," + size + "px)" }}>
      {cells.map((c, i) => (
        <i key={i} className={c === "c" ? "c" : ""} style={c === "c" ? {} : { background: c }}></i>
      ))}
    </div>
  );
}

/* 把文本切成片段：#标签 用类型色高亮，插图记号用浅灰（纯着色，不动字重，避免光标跑位） */
function tagNodes(text, color, keyPrefix = "t") {
  if (!text) return null;
  const parts = text.split(/(#[^\s#，。！？；：,.!?;:]+|!\[[^\]]*\]\(asset:\/\/[^)]+\))/g);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.charAt(0) === "#") {
      return <span key={keyPrefix + i} className="tag" style={{ color, background: color + "1A" }}>{p}</span>;
    }
    if (p.slice(0, 2) === "![") {
      return <span key={keyPrefix + i} className="mdimg">{p}</span>;
    }
    return <React.Fragment key={keyPrefix + i}>{p}</React.Fragment>;
  });
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

/* 假播放条：本地 state，interval 推进 */
function AudioBar({ durationSec, color = "#0EC3D4", compact = false }) {
  const total = durationSec || 725;
  const [playing, setPlaying] = React.useState(false);
  const [cur, setCur] = React.useState(0);
  React.useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setCur((c) => {
        if (c + 1 >= total) { setPlaying(false); return 0; }
        return c + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [playing, total]);
  return (
    <div className="m-audiobar">
      <button className="m-audioplay" style={{ background: color }} onClick={() => setPlaying((p) => !p)} aria-label={playing ? "暂停" : "播放"}>
        {playing ? <IcPause size={16} /> : <IcPlay size={16} />}
      </button>
      <div className="m-audiotrack">
        <div className="m-audiotime"><span>{fmtTime(cur)}</span><span>{fmtTime(total)}</span></div>
        <div className="m-audioline"><i style={{ width: (cur / total * 100) + "%", background: color }}></i></div>
      </div>
    </div>
  );
}

/* 发布任务浮动指示条 */
function FloatingPill({ tasks, onClick }) {
  const running = tasks.filter((t) => t.status === "running");
  if (!running.length) return null;
  const avg = Math.round(running.reduce((s, t) => s + t.progress, 0) / running.length);
  return (
    <button className="m-pill" onClick={onClick}>
      <span className="sqs">
        <i style={{ background: "#2C6FF0" }}></i>
        <i style={{ background: "#D52088" }}></i>
        <i style={{ background: "#FD8D11" }}></i>
      </span>
      正在发布 {running.length} 个任务
      <span className="mono">{avg}% · 查看队列</span>
    </button>
  );
}

Object.assign(window, { MosaicLogo, tagNodes, fmtTime, AudioBar, FloatingPill });
