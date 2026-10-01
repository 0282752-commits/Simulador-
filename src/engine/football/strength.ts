// Fuerza de plantilla (media de los 16 mejores) con caché.
import type { Player } from "./types";

const strCache = new WeakMap<object, Map<string, number>>();
export function invalidateStrength(players: object) { strCache.delete(players); }
export function clubStrength(clubId: string, players: Record<string, Player> | Player[]): number {
  let cache = strCache.get(players);
  if (!cache) {
    cache = new Map();
    const lists = new Map<string, number[]>();
    for (const p of Array.isArray(players) ? players : Object.values(players)) if (p.clubId && !p.retired) (lists.get(p.clubId) ?? lists.set(p.clubId, []).get(p.clubId)!).push(p.ovr);
    for (const [c, l] of lists) { const top = l.sort((a, b) => b - a).slice(0, 16); cache.set(c, top.reduce((a, b) => a + b, 0) / top.length); }
    strCache.set(players, cache);
  }
  return cache.get(clubId) ?? 0;
}

