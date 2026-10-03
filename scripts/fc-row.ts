// Conversión de una fila del CSV de EA FC a Player (compartido por import-fc-csv y build-nations).
import { pick, num } from "./csv";
import type { Player, Pos } from "../src/engine/football/types";
import { estimateValue } from "../src/engine/football/career";

export const POS: Record<string, Pos> = { GK: "POR", CB: "DFC", RB: "LD", LB: "LI", RWB: "CAD", LWB: "CAI", CDM: "MCD", DM: "MCD", CM: "MC", RM: "MD", LM: "MI", CAM: "MCO", AM: "MCO", RW: "ED", LW: "EI", ST: "DC", CF: "SD", RF: "SD", LF: "SD",
  POR: "POR", DFC: "DFC", LD: "LD", LI: "LI", CAD: "CAD", CAI: "CAI", MCD: "MCD", MC: "MC", MD: "MD", MI: "MI", MCO: "MCO", ED: "ED", EI: "EI", DC: "DC", SD: "SD" };

export const ageFrom = (b?: string): number | undefined => {
  if (!b) return undefined;
  const m = b.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/) ?? null;
  const d = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : new Date(b);
  if (isNaN(+d)) return undefined;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
};
export function rowToPlayer(r: Record<string, string>, id: string, clubId: string): Player {
  const posRaw = (pick(r, ["player_positions", "positions", "position", "posicion", "Position", "Alternate positions"]) ?? "CM").split(/[,/ ]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  const alt = (pick(r, ["Alternate positions", "alt_positions"]) ?? "").split(/[,/ ]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  const positions = [...new Set([...posRaw, ...alt].map((p) => POS[p]).filter(Boolean))] as Pos[];
  if (!positions.length) positions.push("MC");
  const ovr = num(r, ["overall", "ovr", "overall_rating", "rating", "media"], 60);
  const first = pick(r, ["first_name", "firstName"]), last = pick(r, ["last_name", "lastName"]);
  const common = pick(r, ["common_name", "commonName"]);
  const name = pick(r, ["long_name", "name", "full_name", "nombre", "Player Name"]) ?? common ?? (`${first ?? ""} ${last ?? ""}`.trim() || pick(r, ["short_name"]) || "Jugador");
  const short = pick(r, ["short_name", "Known As"]) ?? common ?? (first && last ? `${first[0]}. ${last}` : name);
  const isGk = positions[0] === "POR";
  const p: Player = {
    id, name, shortName: short, clubId, positions,
    age: pick(r, ["age", "edad"]) ? num(r, ["age", "edad"], 25) : ageFrom(pick(r, ["birthdate", "dob", "fecha_nacimiento"])) ?? 25, nationality: pick(r, ["nationality_name", "nationality", "nation", "nacionalidad", "country"]) ?? "—",
    foot: /left|zurdo|izq/i.test(pick(r, ["preferred_foot", "foot", "pie", "Preferred foot"]) ?? "") ? "Zurdo" : "Diestro",
    ovr, pot: pick(r, ["potential", "pot", "potencial"]) ? num(r, ["potential", "pot", "potencial"], ovr) : -1,
    pac: num(r, ["pace", "pac"], ovr), sho: num(r, ["shooting", "sho"], ovr - 10), pas: num(r, ["passing", "pas"], ovr - 5), dri: num(r, ["dribbling", "dri"], ovr - 5), def: num(r, ["defending", "def"], ovr - 20), phy: num(r, ["physic", "physical", "physicality", "phy"], ovr - 5),
    pen: num(r, ["mentality_penalties", "penalties", "penaltis", "Penalties"], 50), fk: num(r, ["skill_fk_accuracy", "fk_accuracy", "free_kick_accuracy", "Free Kick Accuracy"], 50),
    hea: num(r, ["attacking_heading_accuracy", "heading_accuracy", "heading", "Heading Accuracy"], 50), crn: num(r, ["attacking_crossing", "crossing", "Crossing", "curve"], 50),
    value: num(r, ["value_eur", "value", "valor"], 0) || undefined, wage: num(r, ["wage_eur", "wage"], 0) || undefined,
    shirt: num(r, ["club_jersey_number", "jersey_number", "shirt", "dorsal"], 0) || undefined,
  };
  if (isGk) {
    p.gk = { div: num(r, ["goalkeeping_diving", "gk_diving", "diving", "GK Diving"], ovr), han: num(r, ["goalkeeping_handling", "gk_handling", "handling", "GK Handling"], ovr), kic: num(r, ["goalkeeping_kicking", "gk_kicking", "kicking", "GK Kicking"], ovr - 5), ref: num(r, ["goalkeeping_reflexes", "gk_reflexes", "reflexes", "GK Reflexes"], ovr), pos: num(r, ["goalkeeping_positioning", "gk_positioning", "GK Positioning"], ovr) };
    // en el formato EA, las 6 medias del portero vienen en PAC..PHY
    if (!pick(r, ["goalkeeping_diving", "gk_diving", "diving", "GK Diving"]) && pick(r, ["pac"])) p.gk = { div: p.pac, han: p.sho, kic: p.pas, ref: p.dri, pos: p.phy };
  }
  // sin potencial en el archivo: estimación propia (no es dato de EA) según la edad
  if (p.pot < 0) p.pot = Math.min(95, p.age < 24 ? p.ovr + Math.round((24 - p.age) * 1.8) : p.ovr);
  if (!p.value) p.value = estimateValue(p.ovr, p.age);
  return p;
}
