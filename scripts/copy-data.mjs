// Copia /data a /public/data para servirlo como estático (se ejecuta antes de dev y build).
import { cpSync, mkdirSync, rmSync } from "node:fs";
rmSync("public/data", { recursive: true, force: true });
mkdirSync("public", { recursive: true });
cpSync("data", "public/data", { recursive: true, filter: (src) => !src.includes("/raw") && !src.endsWith(".md") });
console.log("data/ → public/data/");
