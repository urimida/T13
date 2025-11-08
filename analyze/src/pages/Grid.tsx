import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import bg from "../assets/background.png";

const indices = Array.from({ length: 5 }, (_, i) => i);
const colorMap = [
  "#000000",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#2563eb",
  "#7c3aed",
  "#a855f7",
];

export default function GridPage() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useMemo(
    () => indices.map(() => ({ el: null as HTMLButtonElement | null })),
    []
  );

  // simple bubble physics
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const bubbles = indices.map((i) => ({
      x: 0,
      y: 0,
      vx: (Math.random() * 2 - 1) * 0.25,
      vy: (Math.random() * 2 - 1) * 0.25,
      size: 0,
      pad: 8,
      idx: i,
    }));

    function layoutInitial() {
      const rect = container.getBoundingClientRect();
      const cell = Math.min(rect.width, rect.height) / 3;
      bubbles.forEach((b) => {
        b.size = Math.max(64, cell - 24);
        const row = Math.floor(b.idx / 3);
        const col = b.idx % 3;
        const cx = (col + 0.5) * (rect.width / 3);
        const cy = (row + 0.5) * (rect.height / 3);
        // jitter around grid centers
        b.x = cx - b.size / 2 + (Math.random() * 2 - 1) * 10;
        b.y = cy - b.size / 2 + (Math.random() * 2 - 1) * 10;
      });
      // apply styles once
      bubbles.forEach((b, i) => {
        const ref = itemRefs[i].el;
        if (!ref) return;
        ref.style.width = `${b.size}px`;
        ref.style.height = `${b.size}px`;
        ref.style.left = `${b.x}px`;
        ref.style.top = `${b.y}px`;
      });

      // handle pairwise collisions (avoid overlap)
      for (let i = 0; i < bubbles.length; i++) {
        for (let j = i + 1; j < bubbles.length; j++) {
          const a = bubbles[i];
          const c = bubbles[j];
          const ax = a.x + a.size / 2;
          const ay = a.y + a.size / 2;
          const cx = c.x + c.size / 2;
          const cy = c.y + c.size / 2;
          const dx = cx - ax;
          const dy = cy - ay;
          const dist = Math.hypot(dx, dy) || 0.0001;
          const minDist = (a.size + c.size) / 2;
          if (dist < minDist) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;
            // separate equally along normal
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            c.x += nx * overlap * 0.5;
            c.y += ny * overlap * 0.5;

            // swap normal velocity components (elastic, equal mass)
            const avn = a.vx * nx + a.vy * ny;
            const cvn = c.vx * nx + c.vy * ny;
            const avt = a.vx * -ny + a.vy * nx;
            const cvt = c.vx * -ny + c.vy * nx;
            const avn2 = cvn;
            const cvn2 = avn;
            a.vx = avn2 * nx + avt * -ny;
            a.vy = avn2 * ny + avt * nx;
            c.vx = cvn2 * nx + cvt * -ny;
            c.vy = cvn2 * ny + cvt * nx;
          }
        }
      }
    }

    layoutInitial();
    let raf = 0;

    function tick() {
      const rect = container.getBoundingClientRect();
      bubbles.forEach((b, i) => {
        // gentle floating
        b.x += b.vx;
        b.y += b.vy;
        // bounce on walls
        if (b.x < b.pad) {
          b.x = b.pad;
          b.vx *= -1;
        } else if (b.x + b.size > rect.width - b.pad) {
          b.x = rect.width - b.pad - b.size;
          b.vx *= -1;
        }
        if (b.y < b.pad) {
          b.y = b.pad;
          b.vy *= -1;
        } else if (b.y + b.size > rect.height - b.pad) {
          b.y = rect.height - b.pad - b.size;
          b.vy *= -1;
        }
        // small drift changes
        b.vx += (Math.random() * 2 - 1) * 0.008;
        b.vy += (Math.random() * 2 - 1) * 0.008;
        b.vx = Math.max(-0.5, Math.min(0.5, b.vx));
        b.vy = Math.max(-0.5, Math.min(0.5, b.vy));

        const ref = itemRefs[i].el;
        if (!ref) return;
        // Use absolute positioning to avoid compounding base left/top with transforms
        ref.style.transform = "";
        ref.style.left = `${b.x}px`;
        ref.style.top = `${b.y}px`;
      });
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);

    const onResize = () => {
      layoutInitial();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [itemRefs]);

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center p-6">
      <div
        ref={containerRef}
        className="relative w-full max-w-7xl aspect-square"
        style={{ overflow: "hidden" }}
      >
        {indices.map((idx, i) => {
          const styleForCell =
            idx === 0
              ? {
                  backgroundImage: `url(${bg})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : ({ backgroundColor: colorMap[idx] } as React.CSSProperties);

          return (
            <button
              key={idx}
              ref={(el) => (itemRefs[i].el = el)}
              className="absolute rounded-full overflow-hidden focus-visible:outline-ring/50 focus-visible:ring-[3px]"
              style={styleForCell}
              onClick={() => navigate(`/cell/${idx}`)}
              aria-label={`Open cell ${idx + 1}`}
            />
          );
        })}
      </div>
    </div>
  );
}
