"use client";
import { useEffect, type ReactNode } from "react";

export function cx(...a: (string | false | null | undefined)[]) { return a.filter(Boolean).join(" "); }

export function Badge({ colors, label, size = 28 }: { colors: [string, string]; label: string; size?: number }) {
  const txt = label.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/g, "").slice(0, 3).toUpperCase();
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-md font-bold" style={{ width: size, height: size, fontSize: size * 0.34, background: `linear-gradient(135deg, ${colors[0]} 0 55%, ${colors[1]} 55% 100%)`, color: contrast(colors[0]), textShadow: "0 1px 1px rgba(0,0,0,.4)" }}>
      {txt}
    </span>
  );
}

export function contrast(hex: string): string {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#111" : "#fff";
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="scroll-x -mx-3 flex gap-1 border-b border-borde px-3">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={cx("whitespace-nowrap border-b-2 px-3 py-2 text-sm", value === t.id ? "border-acento text-white" : "border-transparent text-gray-400")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div className={cx("max-h-[94vh] w-full overflow-y-auto rounded-t-2xl border border-borde bg-panel sm:rounded-2xl", wide ? "sm:max-w-5xl" : "sm:max-w-lg")} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-borde bg-panel px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Progress({ text, pct }: { text: string; pct?: number }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
      <div className="card w-72 text-center">
        <div className="mb-2 text-sm">{text}</div>
        <div className="h-2 overflow-hidden rounded bg-fondo"><div className="h-full bg-acento transition-all" style={{ width: `${Math.round((pct ?? 0) * 100)}%` }} /></div>
      </div>
    </div>
  );
}

export const SPEEDS = [0, 1, 2, 5, 10] as const;
export function SpeedControls({ speed, setSpeed, onEnd, finished }: { speed: number; setSpeed: (s: number) => void; onEnd: () => void; finished: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {SPEEDS.map((s) => (
        <button key={s} disabled={finished} onClick={() => setSpeed(s)} className={cx("btn-sm btn", speed === s ? "bg-acento text-black" : "border border-borde")}>
          {s === 0 ? "⏸ Pausa" : `x${s}`}
        </button>
      ))}
      <button disabled={finished} className="btn-ghost btn-sm" onClick={onEnd}>⏭ Final</button>
    </div>
  );
}

export function Stat({ label, a, b, pct }: { label: string; a: number | string; b: number | string; pct?: boolean }) {
  const na = Number(a), nb = Number(b);
  const tot = na + nb || 1;
  return (
    <div className="text-xs">
      <div className="flex justify-between tabular"><span>{a}{pct ? "%" : ""}</span><span className="text-gray-400">{label}</span><span>{b}{pct ? "%" : ""}</span></div>
      <div className="mt-0.5 flex h-1 overflow-hidden rounded bg-fondo"><div className="bg-sky-400" style={{ width: `${(na / tot) * 100}%` }} /><div className="bg-rose-400" style={{ width: `${(nb / tot) * 100}%` }} /></div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs text-gray-400"><span className="mb-1 block">{label}</span>{children}</label>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-gray-500">{children}</div>;
}
