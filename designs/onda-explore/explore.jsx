// 九漾 Onda · 三个方向的对比画布。
// 每块画板内嵌一个方向完整可交互的原型（iframe，1280×800 缩放到 0.5）。

const FRAME_W = 1280;
const FRAME_H = 800;
const FRAME_SCALE = 0.5;

function ProtoFrame({ src, title }) {
  return (
    <div
      style={{
        width: FRAME_W * FRAME_SCALE,
        height: FRAME_H * FRAME_SCALE,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <iframe
        src={src}
        title={title}
        style={{
          width: FRAME_W,
          height: FRAME_H,
          border: 0,
          display: "block",
          transform: `scale(${FRAME_SCALE})`,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}

function DirectionNote({ children }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        fontSize: 12.5,
        lineHeight: 1.6,
        color: "#5a5348",
        borderTop: "1px solid rgba(0,0,0,0.06)",
        background: "rgba(255,255,255,0.9)",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif',
      }}
    >
      {children}
    </div>
  );
}

function ExploreApp() {
  const boardW = FRAME_W * FRAME_SCALE;
  const boardH = FRAME_H * FRAME_SCALE + 56;
  return (
    <DesignCanvas>
      <DCSection
        id="directions"
        title="三个方向"
        subtitle="稿子是主体，平台只是出口 —— 这句产品判断不变，其余全部重做"
        gap={56}
      >
        <DCArtboard id="paper" label="A · 书房 Study —— 稿纸、印章、朱砂" width={boardW} height={boardH}>
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <ProtoFrame src="directions/paper/index.html" title="书房方向原型" />
            <DirectionNote>
              暖纸底 + 墨色衬线 + 朱砂印泥动作色；四类型是靛蓝/胭脂/赭石/黛青四方印章。首页是书桌，发布是盖印，任务页是发行账簿。
            </DirectionNote>
          </div>
        </DCArtboard>

        <DCArtboard id="ripple" label="B · 涟漪 Ripple —— 深夜水面，内容荡开" width={boardW} height={boardH}>
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <ProtoFrame src="directions/ripple/index.html" title="涟漪方向原型" />
            <DirectionNote>
              近黑水面 + 同心圆涟漪为唯一图形语言；类型色取荧光变体。发布弹层是一圈环绕稿子的平台光点，点亮即涟漪荡到那一格。
            </DirectionNote>
          </div>
        </DCArtboard>

        <DCArtboard id="mosaic" label="C · 色板 Mosaic —— Logo 九宫格即布局" width={boardW} height={boardH}>
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <ProtoFrame src="directions/mosaic/index.html" title="色板方向原型" />
            <DirectionNote>
              bento 墙：类型色大号平涂色块拼成不对称网格，大字号 + mono 数据；无渐变无阴影堆叠，靠色块本身分层。
            </DirectionNote>
          </div>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ExploreApp />);
