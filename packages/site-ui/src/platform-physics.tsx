"use client";

import { PLATFORM_IMAGE_MARKS, PLATFORM_MARKS } from "@tassello/ui/platform-icons";
import React from "react";

type PlatformStatus = "active" | "planned";

type ShapeName = "blob" | "pebble" | "shard" | "triangle" | "hex" | "star" | "burst" | "wave";

type PlatformToken = {
  id: string;
  name: string;
  color: string;
  shape: ShapeName;
  status: PlatformStatus;
  image?: string;
};

type PhysicsBody = PlatformToken & {
  path: Path2D;
  radius: number;
  homeX: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  va: number;
  rest: boolean;
  imageElement?: HTMLImageElement;
  offsetX?: number;
  offsetY?: number;
};

const PLATFORM_TOKENS: PlatformToken[] = [
  { id: "wechat", name: "微信公众号", color: "#07C160", shape: "blob", status: "active" },
  { id: "weibo", name: "微博", color: "#E6162D", shape: "shard", status: "active" },
  { id: "xhs", name: "小红书", color: "#FF2442", shape: "star", status: "active" },
  { id: "zhihu", name: "知乎", color: "#0084FF", shape: "hex", status: "active" },
  { id: "x", name: "X", color: "#0F1419", shape: "burst", status: "active" },
  { id: "jike", name: "即刻", color: "#3E7BFA", shape: "wave", status: "active" },
  { id: "douban", name: "豆瓣", color: "#007722", shape: "pebble", status: "active" },
  { id: "xiaoyuzhou", name: "小宇宙", color: "#5B6CFF", shape: "blob", status: "active" },
  { id: "ximalaya", name: "喜马拉雅", color: "#F86442", shape: "shard", status: "active" },
  { id: "lizhi", name: "荔枝播客", color: "#FF5E7E", shape: "wave", status: "active" },
  { id: "douyin", name: "抖音", color: "#161823", shape: "triangle", status: "planned" },
  { id: "bili", name: "B站", color: "#00A1D6", shape: "hex", status: "planned" },
  { id: "toutiao", name: "头条号", color: "#FF0000", shape: "shard", status: "planned" },
  { id: "baijiahao", name: "百家号", color: "#2932E1", shape: "triangle", status: "planned" },
];

const createShapes = (): Record<ShapeName, Path2D> => {
  // 所有角都做圆角处理，避免 Canvas 直线连接带来的尖锐感。
  const roundedPath = (points: [number, number][], corner = .22): Path2D => {
    const path = new Path2D();
    const count = points.length;
    const pointAfter = (index: number) => points[(index + 1) % count];
    const pointBefore = (index: number) => points[(index - 1 + count) % count];

    points.forEach((vertex, index) => {
      const before = pointBefore(index);
      const after = pointAfter(index);
      const toBefore = { x: before[0] - vertex[0], y: before[1] - vertex[1] };
      const toAfter = { x: after[0] - vertex[0], y: after[1] - vertex[1] };
      const beforeLength = Math.hypot(toBefore.x, toBefore.y);
      const afterLength = Math.hypot(toAfter.x, toAfter.y);
      const cornerLength = Math.min(corner, beforeLength * .42, afterLength * .42);
      const startX = vertex[0] + toBefore.x / beforeLength * cornerLength;
      const startY = vertex[1] + toBefore.y / beforeLength * cornerLength;
      const endX = vertex[0] + toAfter.x / afterLength * cornerLength;
      const endY = vertex[1] + toAfter.y / afterLength * cornerLength;

      if (index === 0) path.moveTo(startX, startY);
      else path.lineTo(startX, startY);
      path.quadraticCurveTo(vertex[0], vertex[1], endX, endY);
    });

    path.closePath();
    return path;
  };

  const roundedPolygon = (sides: number, spin = 0, corner = .24): Path2D => {
    const points = Array.from({ length: sides }, (_, index) => {
      const angle = spin + (index / sides) * Math.PI * 2;
      return [Math.cos(angle), Math.sin(angle)] as [number, number];
    });
    return roundedPath(points, corner);
  };

  const roundedStar = (points: number, inner: number, corner = .14): Path2D => {
    const points2 = Array.from({ length: points * 2 }, (_, index) => {
      const angle = -Math.PI / 2 + (index / (points * 2)) * Math.PI * 2;
      const radius = index % 2 ? inner : 1;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius] as [number, number];
    });
    return roundedPath(points2, corner);
  };

  const blob = new Path2D();
  blob.moveTo(0, -.98);
  blob.bezierCurveTo(.66, -1.04, 1.05, -.58, .96, -.02);
  blob.bezierCurveTo(.88, .53, .48, 1.03, -.06, .95);
  blob.bezierCurveTo(-.60, .88, -1.06, .42, -.98, -.10);
  blob.bezierCurveTo(-.91, -.62, -.55, -.93, 0, -.98);
  blob.closePath();

  const pebble = new Path2D();
  pebble.moveTo(-.92, -.18);
  pebble.bezierCurveTo(-.74, -.86, .18, -1.08, .72, -.72);
  pebble.bezierCurveTo(1.12, -.38, 1.00, .36, .58, .76);
  pebble.bezierCurveTo(.14, 1.08, -.62, .98, -.88, .48);
  pebble.closePath();

  const shard = roundedPath([
    [-.18, -.98],
    [.80, -.58],
    [.97, .26],
    [.18, .96],
    [-.76, .60],
    [-.97, -.26],
  ], .30);

  const wave = new Path2D();
  wave.moveTo(-1, -.40);
  wave.bezierCurveTo(-.56, -.84, -.10, .02, .38, -.44);
  wave.bezierCurveTo(.64, -.68, .86, -.72, 1, -.52);
  wave.quadraticCurveTo(.98, .32, .74, .68);
  wave.bezierCurveTo(.38, 1.02, -.10, .18, -.46, .60);
  wave.bezierCurveTo(-.70, .82, -.90, .78, -.88, .56);
  wave.closePath();

  return {
    blob,
    pebble,
    shard,
    triangle: roundedPolygon(3, -Math.PI / 2, .38),
    hex: roundedPolygon(6, Math.PI / 6, .26),
    star: roundedStar(5, .54, .14),
    burst: roundedStar(8, .78, .10),
    wave,
  };
};

const random = (min: number, max: number) => min + Math.random() * (max - min);

export function PlatformPhysics() {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!wrap || !canvas || !context) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let running = false;
    let last = 0;
    let shapeCursor = 0;
    let drag: PhysicsBody | null = null;
    let hover: PhysicsBody | null = null;
    const pointer = { x: 0, y: 0 };
    const bodies: PhysicsBody[] = [];
    const shapes = createShapes();
    const shapeKeys = Object.keys(shapes) as ShapeName[];

    const markImage = (token: PlatformToken) => {
      const source = PLATFORM_IMAGE_MARKS[token.id];
      const src = typeof source === "string" ? source : source?.src;
      if (!src) return undefined;
      const image = new Image();
      image.src = src;
      return image;
    };

    const makeBodies = () => {
      bodies.length = 0;
      shapeCursor = 0;
      const base = width < 720 ? Math.min(width / 8.6, 55) : Math.min(width / 15.5, 68);
      PLATFORM_TOKENS.forEach((token, index) => {
        const radius = base * random(.90, 1.14);
        const homeX = ((index + .5) / PLATFORM_TOKENS.length) * width;
        bodies.push({
          ...token,
          path: shapes[shapeKeys[(shapeCursor++) % shapeKeys.length]],
          radius,
          homeX,
          x: homeX + random(-radius, radius),
          y: reduced ? height - radius - random(0, 48) : -radius - random(40, 300),
          vx: random(-30, 30),
          vy: reduced ? 0 : random(-20, 30),
          angle: random(-.32, .32),
          va: random(-.9, .9),
          rest: false,
          imageElement: markImage(token),
        });
      });
    };

    const render = () => {
      const isDark = document.documentElement.dataset.theme === "dark";
      context.clearRect(0, 0, width, height);
      for (const body of bodies) {
        context.save();
        context.translate(body.x, body.y);
        context.rotate(body.angle);
        context.scale(body.radius, body.radius);
        context.shadowColor = isDark ? "rgba(0,0,0,.56)" : "rgba(15,15,15,.28)";
        context.shadowBlur = 42;
        context.shadowOffsetY = 16;
        context.globalAlpha = body.status === "planned" ? .74 : .98;
        context.fillStyle = isDark ? "#303030" : "#FFFFFF";
        context.fill(body.path);
        context.shadowColor = "transparent";
        context.globalAlpha = body.status === "planned" ? .34 : .52;
        context.fillStyle = body.status === "planned" ? "rgba(120,118,114,.14)" : `${body.color}33`;
        context.fill(body.path);
        context.restore();

        const size = body.radius;
        context.save();
        context.translate(body.x, body.y);
        context.rotate(body.angle);
        if (body.status === "planned") {
          context.globalAlpha = .42;
          context.filter = "grayscale(1)";
        }
        if (body.imageElement?.complete && body.imageElement.naturalWidth) {
          context.drawImage(body.imageElement, -size / 2, -size / 2, size, size);
        } else {
          const mark = PLATFORM_MARKS[body.id];
          if (mark) {
            const [,, viewWidth = 24, viewHeight = 24] = mark.viewBox.split(/\s+/).map(Number);
            const scale = size / Math.max(viewWidth, viewHeight);
            context.scale(scale, scale);
            context.translate(-viewWidth / 2, -viewHeight / 2);
            context.fillStyle = body.status === "planned"
              ? (isDark ? "#9B9A97" : "#787672")
              : body.id === "x" ? (isDark ? "#F5F5F3" : "#0F1419") : body.color;
            mark.paths.forEach((path) => {
              const shape = new Path2D(path.d);
              if (path.evenodd) context.fill(shape, "evenodd");
              else context.fill(shape);
            });
          } else {
            context.fillStyle = isDark ? "#E6E5E3" : "#37352F";
            context.font = `600 ${size * .34}px ${getComputedStyle(document.body).fontFamily}`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(body.name.slice(0, 2), 0, 0);
          }
        }
        context.restore();
      }

      const label = hover || drag;
      if (label) {
        context.save();
        context.globalAlpha = .94;
        context.fillStyle = "#191919";
        context.strokeStyle = "rgba(255,255,255,.12)";
        context.font = `650 12px ${getComputedStyle(document.body).fontFamily}`;
        const text = `${label.name}${label.status === "planned" ? " · 规划中" : ""}`;
        const textWidth = context.measureText(text).width;
        const boxWidth = textWidth + 22;
        const boxX = Math.min(Math.max(label.x - boxWidth / 2, 10), width - boxWidth - 10);
        const boxY = Math.max(10, label.y - label.radius - 38);
        context.beginPath();
        context.moveTo(boxX + 14, boxY);
        context.arcTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + 28, 14);
        context.arcTo(boxX + boxWidth, boxY + 28, boxX, boxY + 28, 14);
        context.arcTo(boxX, boxY + 28, boxX, boxY, 14);
        context.arcTo(boxX, boxY, boxX + boxWidth, boxY, 14);
        context.closePath();
        context.fill();
        context.stroke();
        context.fillStyle = "#fff";
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.fillText(text, boxX + 11, boxY + 15);
        context.restore();
      }
    };

    const hitBody = (x: number, y: number) => [...bodies].reverse().find((body) => {
      const dx = x - body.x;
      const dy = y - body.y;
      return dx * dx + dy * dy <= body.radius * body.radius;
    });

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      width = Math.max(320, rect.width);
      height = Math.max(380, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!bodies.length) makeBodies();
      else {
        for (const body of bodies) {
          body.x = Math.min(Math.max(body.x, body.radius), width - body.radius);
          body.y = Math.min(body.y, height - body.radius);
        }
      }
      render();
    };

    const step = (dt: number) => {
      for (const body of bodies) {
        if (body === drag) continue;
        body.vy += 1900 * dt;
        body.vx *= .996;
        body.x += body.vx * dt;
        body.y += body.vy * dt;
        if (!body.rest) body.angle += body.va * dt;

        const left = body.radius;
        const right = width - body.radius;
        const floor = height - body.radius;
        if (body.x < left) {
          body.x = left;
          body.vx *= -.42;
        }
        if (body.x > right) {
          body.x = right;
          body.vx *= -.42;
        }
        if (body.y > floor) {
          body.y = floor;
          if (Math.abs(body.vy) > 90) {
            body.vy *= -.26;
            body.va *= .58;
          } else {
            body.vy = 0;
            body.vx *= .86;
            body.va *= .82;
            body.rest = Math.abs(body.vx) < 3 && Math.abs(body.va) < .04;
          }
        }
      }

      for (let first = 0; first < bodies.length; first += 1) {
        for (let second = first + 1; second < bodies.length; second += 1) {
          const bodyA = bodies[first];
          const bodyB = bodies[second];
          const dx = bodyB.x - bodyA.x;
          const dy = bodyB.y - bodyA.y;
          const minimum = bodyA.radius + bodyB.radius;
          const distance = Math.hypot(dx, dy);
          if (distance >= minimum || distance === 0) continue;

          const nx = dx / distance;
          const ny = dy / distance;
          const overlap = (minimum - distance) / 2;
          if (bodyA !== drag) {
            bodyA.x -= nx * overlap;
            bodyA.y -= ny * overlap;
          }
          if (bodyB !== drag) {
            bodyB.x += nx * overlap;
            bodyB.y += ny * overlap;
          }

          const impact = (bodyB.vx - bodyA.vx) * nx + (bodyB.vy - bodyA.vy) * ny;
          if (impact > 0) continue;
          const impulse = impact * .38;
          if (bodyA !== drag) {
            bodyA.vx += impulse * nx;
            bodyA.vy += impulse * ny;
            bodyA.rest = false;
          }
          if (bodyB !== drag) {
            bodyB.vx -= impulse * nx;
            bodyB.vy -= impulse * ny;
            bodyB.rest = false;
          }
        }
      }

      if (drag) {
        const targetX = pointer.x - (drag.offsetX ?? 0);
        const targetY = pointer.y - (drag.offsetY ?? 0);
        drag.vx = ((targetX - drag.x) / Math.max(dt, .001)) * .22;
        drag.vy = ((targetY - drag.y) / Math.max(dt, .001)) * .22;
        drag.x += (targetX - drag.x) * Math.min(1, dt * 18);
        drag.y += (targetY - drag.y) * Math.min(1, dt * 18);
        drag.x = Math.min(Math.max(drag.x, drag.radius), width - drag.radius);
        drag.y = Math.min(Math.max(drag.y, drag.radius), height - drag.radius);
      }
    };

    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(.032, (now - last) / 1000 || .016);
      last = now;
      step(dt);
      render();
      frameHandle = window.requestAnimationFrame(frame);
    };
    let frameHandle = 0;
    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      frameHandle = window.requestAnimationFrame(frame);
    };
    const stop = () => {
      window.cancelAnimationFrame(frameHandle);
      running = false;
    };

    const pointFromEvent = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const onPointerDown = (event: PointerEvent) => {
      const point = pointFromEvent(event);
      const body = hitBody(point.x, point.y) ?? null;
      if (!body) return;
      drag = body;
      drag.offsetX = point.x - body.x;
      drag.offsetY = point.y - body.y;
      drag.rest = false;
      hover = body;
      canvas.classList.add("dragging");
      canvas.setPointerCapture(event.pointerId);
      start();
    };
    const onPointerMove = (event: PointerEvent) => {
      const point = pointFromEvent(event);
      pointer.x = point.x;
      pointer.y = point.y;
      if (!drag) {
        hover = hitBody(point.x, point.y) ?? null;
        canvas.style.cursor = hover ? "grab" : "default";
        if (!running) render();
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!drag) return;
      drag.rest = false;
      drag = null;
      canvas.classList.remove("dragging");
      canvas.releasePointerCapture(event.pointerId);
    };
    const onPointerLeave = () => {
      hover = null;
      if (!running) render();
    };

    const resizeObserver = new ResizeObserver(resize);
    const visibilityObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        if (reduced) render();
        else start();
      } else stop();
    }, { threshold: .18 });
    const themeObserver = new MutationObserver(render);
    resizeObserver.observe(wrap);
    visibilityObserver.observe(wrap);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    resize();

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);

    return () => {
      stop();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} className="platform-canvas-wrap">
      <canvas ref={canvasRef} className="platform-canvas" aria-hidden="true" />
    </div>
  );
}
