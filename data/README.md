# Datos

Ver la sección "Datos" del README principal. Resumen de procedencia:

- `football/competitions.json`: formatos de competición (número de equipos, ascensos/descensos, desempates,
  rondas, ida/vuelta, prórroga) según los reglamentos conocidos a la fecha de corte; fechas aproximadas.
  Marcado `verified: false`: desempates de Ligue 1/Ligue 2, formato de Coppa Italia, Coupe de France y supercopas.
- `football/clubs.json` y `players.json`: DEMOSTRACIÓN FICTICIA (generada por `scripts/generate-demo-data.ts`).
  Sustituir con `npm run datos:futbol -- archivo.csv`.
- `nfl/teams.json`: 32 franquicias, conferencias y divisiones (estructura vigente desde 2002), colores aproximados.
  La rotación de rivales 2026 se dedujo de la fórmula de la NFL: verificar con el calendario oficial.
- `nfl/players.json`: DEMOSTRACIÓN FICTICIA. Sustituir con `npm run datos:nfl -- archivo.csv`.
- `dc/characters.json`: escala propia de la app, no oficial.

Coloca los CSV originales en `data/**/raw/` (ignorado por git) si no tienes licencia para redistribuirlos.
