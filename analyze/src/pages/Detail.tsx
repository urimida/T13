import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import bg from "../assets/background.png";

const colorMap = [
  "#000000", // 0: not used (image)
  "#ef4444", // 1: red
  "#f97316", // 2: orange
  "#f59e0b", // 3: yellow
  "#22c55e", // 4: green
  "#3b82f6", // 5: blue
  "#2563eb", // 6: indigo-ish
  "#7c3aed", // 7: violet
  "#a855f7", // 8: purple
];

export default function DetailPage() {
  const navigate = useNavigate();
  const params = useParams();
  const index = useMemo(() => {
    const n = Number(params.id);
    return Number.isFinite(n) && n >= 0 && n < 9 ? n : 0;
  }, [params.id]);

  const styleForDetail =
    index === 0
      ? {
          backgroundImage: `url(${bg})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "saturate(1.05)",
        }
      : ({ backgroundColor: colorMap[index] } as React.CSSProperties);

  useEffect(() => {
    const COUNT = 30;
    const TAG_W = 250;
    const TAG_H = 74;

    const created: HTMLElement[] = [];

    function createTag(i: number) {
      const el = document.createElement("div");
      el.className = "floating-tag";
      el.textContent = `# 태그 ${i + 1}`;
      const maxX = Math.max(0, window.innerWidth - TAG_W);
      const maxY = Math.max(0, window.innerHeight - TAG_H);
      const x = Math.floor(Math.random() * (maxX + 1));
      const y = Math.floor(Math.random() * (maxY + 1));
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.width = TAG_W + "px";
      el.style.height = TAG_H + "px";
      document.body.appendChild(el);
      created.push(el);
    }

    for (let i = 0; i < COUNT; i++) createTag(i);

    function intersectsCircleRect(
      cx: number,
      cy: number,
      cr: number,
      rx: number,
      ry: number,
      rw: number,
      rh: number
    ) {
      const closestX = Math.max(rx, Math.min(cx, rx + rw));
      const closestY = Math.max(ry, Math.min(cy, ry + rh));
      const dx = cx - closestX;
      const dy = cy - closestY;
      return dx * dx + dy * dy <= cr * cr;
    }

    let raf = 0;
    function updateVisibility() {
      const lens: any = (window as any).currentLens;
      if (!lens) {
        created.forEach((el) => el.classList.remove("visible"));
      } else {
        created.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const hit = intersectsCircleRect(
            lens.x,
            lens.y,
            lens.r,
            rect.left,
            rect.top,
            rect.width,
            rect.height
          );
          if (hit) el.classList.add("visible");
          else el.classList.remove("visible");
        });
      }
      raf = requestAnimationFrame(updateVisibility);
    }
    raf = requestAnimationFrame(updateVisibility);

    const handleResize = () => {
      // 간단히 재배치
      created.forEach((el) => {
        const maxX = Math.max(0, window.innerWidth - TAG_W);
        const maxY = Math.max(0, window.innerHeight - TAG_H);
        const x = Math.floor(Math.random() * (maxX + 1));
        const y = Math.floor(Math.random() * (maxY + 1));
        el.style.left = x + "px";
        el.style.top = y + "px";
      });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
      created.forEach((el) => el.remove());
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#141414]">
      <div className="max-w-7xl mx-auto p-4 flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Back
        </Button>
        <div className="text-white/70 text-sm">Cell {index + 1}</div>
      </div>

      <div className="relative w-full h-[calc(100vh-80px)]">
        <div className="absolute inset-0" style={styleForDetail} />
      </div>
      {/* liquid-glass.js는 index.html에 포함되어 있어 유리 효과 드래그 관찰 가능 */}
    </div>
  );
}
