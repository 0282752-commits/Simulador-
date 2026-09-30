"use client";
import { createContext, useContext } from "react";
import type { FootballSave, Fixture } from "@/engine/football/types";
import type { FootballConfig } from "@/engine/football/season";

export interface FCtx {
  save: FootballSave;
  cfg: FootballConfig;
  tick: number;
  mutate: (fn: (s: FootballSave) => void) => void;
  openLive: (f: Fixture) => void;
  openManual: (f: Fixture) => void;
  openDetail: (f: Fixture) => void;
  openLineup: (clubId: string, f?: Fixture) => void;
  openPlayer: (pid: string) => void;
  openClub: (clubId: string) => void;
}
export const FootballContext = createContext<FCtx | null>(null);
export function useF(): FCtx {
  const c = useContext(FootballContext);
  if (!c) throw new Error("FootballContext no disponible");
  return c;
}
export const fmtMoney = (n?: number) => (n === undefined ? "—" : n >= 1e6 ? `${(n / 1e6).toFixed(1)} M€` : `${Math.round(n / 1e3)} mil €`);
