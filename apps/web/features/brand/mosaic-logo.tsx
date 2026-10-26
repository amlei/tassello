import React from "react";

export function MosaicLogo({ size = 11 }: { size?: number }) {
  const cells = ["#2FD9A0", "#17C8E0", "#2E7CF6", "#A55EF5", "w", "#2058EE", "#E8369F", "#F7A21B", "#30C974"];
  return (
    <div
      className="grid gap-[2.5px]"
      style={{ gridTemplateColumns: `repeat(3, ${size}px)`, gridTemplateRows: `repeat(3, ${size}px)` }}
    >
      {cells.map((c, i) => (
        <i key={i} className="relative block rounded-[3px]" style={c === "w" ? { background: "#fff" } : { background: c }}>
          {c === "w" && <i className="mx-auto mt-[31%] block h-[38%] w-[38%] rounded-[22%] bg-[#10B981]" />}
        </i>
      ))}
    </div>
  );
}
