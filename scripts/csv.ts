// Lector CSV mínimo (comillas, separador , o ; autodetectado) y utilidades para los importadores.
import { readFileSync } from "node:fs";

export function readCsv(path: string): Record<string, string>[] {
  let txt = readFileSync(path, "utf8");
  if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
  const firstLine = txt.slice(0, txt.indexOf("\n"));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) {
      if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && txt[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift() ?? [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// Devuelve el valor de la primera columna que coincida con algún alias
export function pick(row: Record<string, string>, aliases: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const a of aliases) {
    const k = keys.find((x) => norm(x) === norm(a));
    if (k !== undefined && row[k] !== "") return row[k];
  }
  return undefined;
}
export function num(row: Record<string, string>, aliases: string[], def = 50): number {
  const v = pick(row, aliases);
  if (v === undefined) return def;
  const n = Number(String(v).replace(/[^0-9.\-+]/g, "").replace(/^(\d+)[+-]\d+$/, "$1"));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : def;
}
export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
export function colorFromName(name: string): [string, string] {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360, hue2 = (hue + 150 + (h >> 8) % 60) % 360;
  const hsl = (hh: number, s: number, l: number) => {
    const a = (s * Math.min(l, 1 - l)) / 1;
    const f = (n: number) => { const k = (n + hh / 30) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, "0"); };
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  return [hsl(hue, 0.65, 0.4), hsl(hue2, 0.7, 0.6)];
}
