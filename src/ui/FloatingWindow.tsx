import { ReactNode, useEffect, useRef, useState } from "react";
export default function FloatingWindow({
  id,
  title,
  color = "blue",
  open,
  onClose,
  children,
  width = 760,
  height = 580,
  z,
  onFocus,
}: {
  id: string;
  title: string;
  color?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  height?: number;
  z: number;
  onFocus: () => void;
}) {
  const [position, setPosition] = useState(() => ({
    x: Math.max(12, (window.innerWidth - width) / 2),
    y: Math.max(38, (window.innerHeight - height) / 2 - 20),
  }));
  const root = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number }>();
  useEffect(() => {
    const fit = () =>
      setPosition((p) => ({
        x: Math.max(
          0,
          Math.min(
            p.x,
            window.innerWidth -
              Math.min(root.current?.offsetWidth ?? width, window.innerWidth),
          ),
        ),
        y: Math.max(0, Math.min(p.y, window.innerHeight - 100)),
      }));
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [width]);
  return (
    <section
      ref={root}
      id={`window-${id}`}
      className={`floating-window window-${color}`}
      hidden={!open}
      style={{ left: position.x, top: position.y, width, height, zIndex: z }}
      aria-label={title}
      onPointerDown={onFocus}
    >
      <div
        className="window-titlebar"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: position.x,
            top: position.y,
          };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPosition({
            x: Math.max(
              0,
              Math.min(
                drag.current.left + e.clientX - drag.current.x,
                window.innerWidth - (root.current?.offsetWidth ?? width),
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                drag.current.top + e.clientY - drag.current.y,
                window.innerHeight - 105,
              ),
            ),
          });
        }}
        onPointerUp={() => {
          drag.current = undefined;
        }}
        onPointerCancel={() => {
          drag.current = undefined;
        }}
      >
        <span className="window-grip" aria-hidden="true">
          ⠿
        </span>
        <strong>{title}</strong>
        <button
          className="window-close"
          aria-label={`Fechar ${title}`}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="floating-content">{children}</div>
    </section>
  );
}
