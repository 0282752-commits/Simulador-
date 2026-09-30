"use client";
// Hook de partida cargada: mutaciones en sitio + autoguardado con retardo.
import { useCallback, useEffect, useRef, useState } from "react";
import { loadSave, writeSave, type AnySave, type SaveMeta } from "./db";

export interface SaveCtl<T extends AnySave> {
  save: T;
  meta: SaveMeta;
  tick: number;
  mutate: (fn: (s: T) => void) => void;
  refresh: () => void;
  saving: boolean;
  flush: () => Promise<void>;
}

export function useSave(id: string | null) {
  const [state, setState] = useState<{ meta: SaveMeta; data: AnySave } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    if (!id) return;
    loadSave(id).then((r) => (r ? setState(r) : setError("No se encontró la partida."))).catch((e) => setError(String(e)));
  }, [id]);

  const flush = useCallback(async () => {
    const cur = ref.current;
    if (!cur) return;
    setSaving(true);
    try {
      const meta = await writeSave(cur.meta, cur.data);
      cur.meta = meta;
    } finally {
      setSaving(false);
    }
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { flush(); }, 1500);
  }, [flush]);

  const mutate = useCallback((fn: (s: AnySave) => void) => {
    const cur = ref.current;
    if (!cur) return;
    fn(cur.data);
    setTick((t) => t + 1);
    schedule();
  }, [schedule]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); flush(); } }, [flush]);
  useEffect(() => {
    const h = () => { if (timer.current) { clearTimeout(timer.current); flush(); } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [flush]);

  return { state, error, tick, mutate, refresh, saving, flush };
}
