# Simulador Deportivo

App web (Next.js + TypeScript + Tailwind, mobile-first, en español) de simulación deportiva tipo mánager —
**sin jugar los partidos**: gestionar, simular, meter resultados a mano y ver los partidos en vivo.
Tres modos: **Fútbol**, **NFL** y **DC Comics**.

- Partidas en el navegador (IndexedDB): varias partidas, autoguardado, exportar/importar JSON.
- Sin escudos, logos ni imágenes oficiales: colores de equipo + iniciales.
- Todo el motor es TypeScript puro (`src/engine`) y corre igual en el navegador y en scripts de Node.

## Arrancar

```bash
npm install
npm run dev          # http://localhost:3000  (copia /data a /public/data antes de arrancar)
npm run build        # build de producción (Vercel lo ejecuta solo)
npm test             # temporada completa de fútbol, NFL y torneos DC en modo headless
npm run calibrar     # 10.000 partidos por modo con promedios frente a referencias reales
```

Deploy en Vercel: importar el repositorio, framework "Next.js", sin variables de entorno.

## Reglas comunes

Cada partido/batalla: **⚡ Simular**, **▶ En vivo** (pausa, x1, x2, x5, x10, saltar al final) o **✍ Manual**
(fútbol: goleadores/asistentes opcionales; NFL: anotaciones opcionales; DC: ganador y K.O.).
Se puede simular un partido, un día/semana, un mes, hasta una fecha o la temporada entera.
Los resultados se editan o borran y **todo se recalcula**: tablas, estadísticas, cansancio, lesiones y
sanciones se derivan de los resultados guardados (no hay contadores que se desincronicen). Si cambia el
ganador de una eliminatoria y la ronda siguiente aún no se jugó, esa ronda se vuelve a sortear.

La fuerza de cada equipo sale de su alineación real (titulares, banca, posiciones, estado físico, forma):
cualquier cambio afecta a la simulación.

## Modo Fútbol

- Calendario **unificado** con fechas: 5 ligas + segundas divisiones, 6 copas nacionales, 5 supercopas,
  Champions/Europa/Conference con el formato de fase liga de 36 equipos, playoffs de ascenso/descenso.
  Botón **Continuar** (siguiente día con partidos), +1 semana, +1 mes, hasta una fecha o hasta el final.
- Ligas a doble vuelta con los criterios de desempate de cada una (se muestran bajo la tabla).
- Europa: sorteo por bombos (sin rivales del mismo país, máx. 2 del mismo país), 8 partidos en UCL/UEL
  (2 rivales por bombo) y **6 en la Conference** (así es el formato real: 6 bombos, 1 rival por bombo);
  playoff 9-24 a ida y vuelta, octavos/cuartos/semis a ida y vuelta, final única en campo neutral.
- Copas con sus particularidades (Carabao sin prórroga salvo la final, semis a doble partido en Carabao,
  Copa del Rey y Coppa Italia, local el de menor categoría en Copa del Rey y DFB-Pokal…). Prórroga y
  tanda de penales tiro por tiro.
- Alineaciones: editor visual (tocar o arrastrar entre campo, banca y reservas), 10 formaciones,
  posiciones personalizables (mover huecos y cambiar su rol), capitán y lanzadores de penales/faltas/córners,
  táctica, **Mejor once automático** y **IA rota según cansancio**. Lesionados y sancionados no juegan.
- Motor minuto a minuto (1'…45'+añadido, 46'…90'+añadido, prórroga, penales) con tiros, atajadas, palos,
  goles (jugada, cabeza, tiro libre, penal, autogol) con autor y asistencia, córners, faltas, fueras de
  juego, VAR, amarillas/doble amarilla/rojas, lesiones y 5 cambios en 3 ventanas.
- Visor en vivo con narración, posesión, tiros, xG, córners, faltas, tarjetas, alineaciones con nota y
  cambios/táctica/formación en pausa. "Ver todos en vivo" para una jornada entera.
- Tablas con zonas, racha, local/visitante; goleadores, asistencias, porterías a cero, tarjetas y
  valoración por competición; ficha de jugador; historial de partidos, palmarés y récords.
- Temporadas encadenadas: envejecimiento, progresión, retiros, juveniles, ascensos/descensos (incluidos
  playoffs) y clasificación europea y supercopas según la tabla final.
- Mercado entre cualquier club: fichajes, cesiones, intercambios, liberar; modo libre o con presupuestos
  y valores. Edición de medias/atributos y creación de jugadores.

## Modo NFL

- 32 equipos, divisiones y conferencias reales; calendario de 17 partidos en 18 semanas generado con la
  **fórmula de la NFL** (6 divisionales, 4+4 por rotación, 2 por posición, partido 17) y semana de descanso.
- Standings con desempates (directos, división, comunes, conferencia, fuerza de victoria y de calendario…),
  playoffs de 14 equipos con resiembra y Super Bowl en campo neutral.
- Depth chart editable por posición (QB, RB, WR, TE, OL, DL, LB, CB, S, K, P) o automático; lesiones con
  semanas de baja.
- Motor jugada por jugada con reloj real: carreras, pases corto/medio/largo, capturas, intercepciones,
  fumbles, punts, goles de campo, extra/2 puntos, onside, castigos, tiempos muertos, desafíos, decisiones de
  4ª oportunidad y prórroga (10 min en temporada regular con posesión garantizada para ambos; 15 min en playoffs).
- Visor en vivo con campo dibujado, down y distancia; depth chart editable en pausa.
- Líderes, intercambios de jugadores y selecciones del draft, draft simulado, progresión y retiros.

## Modo DC Comics

- 83 personajes (Justice League, Teen Titans, JSA, Suicide Squad, Legion of Doom, Bat-familia, Green Lantern
  Corps, Doom Patrol y villanos principales). **Los stats son una escala propia de esta app (1-100), inventada
  para el juego y editable; no son valores oficiales de DC.**
- Equipos canónicos y propios mezclando cualquier personaje; 1v1, 3v3, 5v5, 7v7.
- Sinergias y tensiones entre personajes (Batman+Robin, Superman+Wonder Woman, némesis en el mismo equipo…).
- Motor por rondas: ataques, poderes, habilidades especiales (daño, aturdir, curar, escudo, potenciar,
  drenar), combos entre compañeros con sinergia, críticos, debilidades (kryptonita, magia, fuego, miedo…),
  K.O. y remontadas; factor de azar configurable por torneo.
- Liga, eliminación directa, grupos + eliminatoria, battle royale y torneo por equipos (duelos 1 vs 1),
  varios a la vez con calendario común, y ranking histórico de personajes y equipos.

> El mensaje original se cortó en "Cada batalla se…". Se implementó igual que en los otros modos:
> cada batalla se puede simular, ver en vivo o meter a mano, y queda guardada con su resumen.

## Datos (`/data`)

| Archivo | Contenido | Estado |
|---|---|---|
| `football/competitions.json` | Formatos de ligas, copas, supercopas y Europa 2026/27 | Formatos reales; fechas **aproximadas**; las entradas con `verified: false` están pendientes de verificar |
| `football/clubs.json`, `players.json` | Clubes y jugadores | **DEMO ficticia** hasta importar el CSV real |
| `football/europe-participants.json` | Clasificados europeos 2026/27 por nombre | Vacío → se rellena por fuerza con cupos por país |
| `nfl/teams.json` | 32 equipos, divisiones, colores, rotación del calendario | Estructura real; rotación 2026 deducida de la fórmula: **verificar** |
| `nfl/players.json` | Rosters | **DEMO ficticia** hasta importar el CSV real |
| `dc/characters.json` | Personajes, equipos y sinergias | Escala propia (no oficial) |

Cada archivo guarda `meta.source` y `meta.updated`; la app muestra "DATOS DEMO" mientras se usen los ficticios.

### Por qué no vienen incluidas las plantillas reales

Las medias de **EA SPORTS FC 26** y **Madden NFL 27** son contenido con copyright de Electronic Arts. EA las
publica en su web de ratings (ea.com/games/ea-sports-fc/ratings y ea.com/games/madden-nfl/player-ratings) pero
no ofrece una descarga con licencia de redistribución, y los datasets públicos (Kaggle, SoFIFA) son extracciones
de esa web con licencias dudosas. Por eso el repositorio incluye **importadores** en vez de los datos, y no se
inventan datos reales: los clubes/jugadores de demo son ficticios.

### Qué archivo conseguir y cómo importarlo

**Fútbol** — un CSV con una fila por jugador de la base de EA SPORTS FC 26 (o la versión más reciente) con columnas
estilo SoFIFA/Kaggle (en la búsqueda solo pude confirmar un dataset de FC 25 en Kaggle; comprueba si ya hay uno de FC 26) (`short_name, long_name, player_positions,
overall, potential, age, nationality_name, preferred_foot, pace, shooting, passing, dribbling, defending, physic,
goalkeeping_*, mentality_penalties, skill_fk_accuracy, attacking_heading_accuracy, attacking_crossing, club_name,
league_name, club_loaned_from, value_eur`). También acepta las columnas de la web de EA (`Name, Team, League,
Position, Alternate positions, OVR, PAC … PHY, Age, Nation, Preferred foot, GK Diving …`). Revisa la licencia del
archivo antes de publicarlo en un repositorio público.

```bash
npm run datos:futbol -- ruta/fc26.csv --fuente "EA SPORTS FC 26 · dataset X (licencia Y) · descargado 2026-09-30"
# añade --otras-ligas "Liga Portugal,Eredivisie" o --todas para más clubes europeos
```

Verifica después: número de clubes por liga (el script avisa si no son 20/24/22/18), fichajes del último mercado
(el dataset debe ser posterior al cierre del 1 de septiembre de 2026) y rellena `europe-participants.json` con los
36 clasificados reales de cada torneo.

**NFL** — CSV de la base de ratings de **Madden NFL 27** con `firstName, lastName, team, position, overall_rating,
age, jerseyNum, speed_rating, strength_rating, throwPower_rating, throwAccuracyShort/Mid/Deep_rating,
catching_rating, carrying_rating, runBlock_rating, passBlock_rating, tackle_rating, powerMoves_rating,
finesseMoves_rating, manCoverage_rating, zoneCoverage_rating, kickPower_rating, kickAccuracy_rating`
(también acepta nombres "Speed", "Strength", "Throw Power"…). Los 53 mejores de cada equipo quedan en el roster
activo y el resto en practice squad si el CSV no trae el estado.

```bash
npm run datos:nfl -- ruta/madden27.csv --fuente "Madden NFL 27 ratings · 2026-09-30"
```

Para regenerar los datos ficticios: `npm run datos:demo`.

## Calibración (10.000 partidos por modo)

`npm run calibrar` — resultados con los datos de demo (las referencias son promedios aproximados de las grandes
ligas europeas y de la NFL de temporadas recientes):

| Fútbol | Motor | Referencia |
|---|---|---|
| Goles por partido | 2.69 | ~2.7 |
| Victorias local / empates / visitante | 44.6% / 25.9% / 29.5% | ~45% / ~25% / ~30% |
| Córners | 10.7 | ~10 |
| Penales señalados | 0.28 | ~0.25-0.30 |
| Tiros (a puerta) | 26.3 (9.0) | ~25 (~8.5) |
| Amarillas / rojas | 3.9 / 0.12 | ~4 / ~0.15 |

| NFL | Motor | Referencia |
|---|---|---|
| Puntos totales | 45.5 | ~45 |
| Victorias local | 56.6% | ~55-57% |
| Yardas por equipo (pase/tierra) | 331 (219/112) | ~330 (~210/~118) |
| Capturas / pérdidas por equipo | 2.54 / 1.24 | ~2.4 / ~1.2 |
| % pases completos / 3ª conversión | 65.4% / 36.8% | ~65% / ~39% |
| % goles de campo / puntos extra | 83.7% / 94.9% | ~85% / ~95% |

DC no tiene referencia real: el script comprueba la coherencia interna (el favorito gana ~81%, curva por
diferencia de overall y duelos de referencia). Las constantes están en `CAL` (`src/engine/football/match.ts`)
y `NCAL` (`src/engine/nfl/game.ts`). Con datos reales conviene volver a correr la calibración.

## Simplificaciones conocidas

- Emparejamientos de liga generados (no es el calendario oficial) y fechas de copas/Europa aproximadas.
- FA Cup y Carabao: solo clubes de Premier y Championship (ronda previa para cuadrar el cuadro).
- Coppa Italia: sorteo libre (el real tiene cabezas de serie). Sin tercera división: nadie desciende de segunda.
- Sanciones: roja = 1 partido; acumulación de amarillas en liga (cada 5) y en Europa (3, luego cada 2).
- NFL: empates de 3+ equipos resueltos aplicando los criterios en orden (aproximación del reglamento).
- Supercopas de la primera temporada: participantes estimados por fuerza (no hay datos 2025/26 en la partida).

## Estructura

```
src/engine/football   tipos, alineaciones, motor de partido, competiciones, temporada, carrera
src/engine/nfl        tipos, depth chart, motor jugada por jugada, temporada/playoffs/draft
src/engine/dc         tipos, motor de batalla, torneos y ranking
src/components        UI por modo (futbol/, nfl/, dc/) y componentes comunes
src/lib               IndexedDB, carga de datos, RNG y fechas
scripts               importadores CSV, datos demo, calibración y pruebas
data                  datos versionados (copiados a public/data al compilar)
```
