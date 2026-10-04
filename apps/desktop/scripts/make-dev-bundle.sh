#!/bin/bash
# make-dev-bundle —— 生成 dev 用 Tasselo.app 壳（基于 Electron runtime）。
# Dock 名称/图标在 macOS 上只认 .app bundle 的 Info.plist + icns，
# 直接跑 Electron 二进制永远是「Electron」+默认图标；打包产物也用同一套资源。
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="node_modules/electron/dist/Electron.app"
DST="build/Tasselo.app"
ICNS_SRC="build/tasselo.icns"
LOGO="../web/public/logo.svg"

# icns 从 logo.svg 生成：Chrome headless 渲染 → 合成满幅底 → iconset → icns。
# logo.svg 是唯一图标源；改 logo 后重跑本脚本即可。Chrome 不在时回退现有 icon.png
mkdir -p build
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ -f "$LOGO" ] && [ -x "$CHROME" ]; then
  echo "[dev-bundle] rendering icon from $LOGO"
  B64=$(base64 -i "$LOGO" | tr -d '\n')
  cat > build/logo-render.html <<HTML
<!doctype html><html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,$B64" style="width:1024px;height:1024px;display:block"></body></html>
HTML
  "$CHROME" --headless=new --disable-gpu --screenshot=build/logo-raw.png \
    --window-size=1024,1024 --default-background-color=00000000 --virtual-time-budget=3000 \
    "file://$(pwd)/build/logo-render.html" > /dev/null 2>&1
  python3 - <<'PY'
from PIL import Image, ImageDraw
raw = Image.open("build/logo-raw.png").convert("RGBA")
bbox = raw.split()[3].getbbox()
content = raw.crop(bbox)
S = 1024
canvas = Image.new("RGB", (S, S), (255, 255, 255))
d = ImageDraw.Draw(canvas)
top, bottom = (255, 255, 255), (244, 241, 232)   # 白 → 应用米色 #F4F1E8
for y in range(S):
    t = y / S
    d.line([(0, y), (S, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
target = 880   # 系统遮罩区约 824/1024，logo 自带留白，86% 视觉贴边
content = content.resize((target, target), Image.LANCZOS)
canvas.paste(content, ((S - target) // 2, (S - target) // 2), content)
canvas.save("icon.png")
print("[dev-bundle] icon.png regenerated from logo.svg")
PY
fi
if [ ! -f icon.png ]; then echo "缺少 icon.png 且无法从 logo.svg 渲染"; exit 1; fi
rm -rf build/tasselo.iconset && mkdir -p build/tasselo.iconset
for s in 16 32 128 256 512; do
  sips -z $s $s icon.png --out "build/tasselo.iconset/icon_${s}x${s}.png" > /dev/null
  sips -z $((s*2)) $((s*2)) icon.png --out "build/tasselo.iconset/icon_${s}x${s}@2x.png" > /dev/null
done
sips -z 1024 1024 icon.png --out build/tasselo.iconset/icon_512x512@2x.png > /dev/null
iconutil -c icns build/tasselo.iconset -o "$ICNS_SRC"

# 复制 runtime（已存在且 Electron 版本未变则跳过，避免 250MB 重复拷贝）
if [ ! -d "$DST" ]; then
  echo "[dev-bundle] copying Electron runtime → $DST"
  mkdir -p build
  cp -R "$SRC" "$DST"
fi

PLIST="$DST/Contents/Info.plist"
plutil -replace CFBundleName -string "tassello" "$PLIST"
plutil -replace CFBundleDisplayName -string "tassello" "$PLIST"
plutil -replace CFBundleIdentifier -string "com.tassello.app" "$PLIST"
plutil -replace CFBundleIconFile -string "tasselo" "$PLIST"
cp "$ICNS_SRC" "$DST/Contents/Resources/tasselo.icns"
touch "$DST"   # 让 LaunchServices 重新注册
echo "[dev-bundle] ready: $DST"
