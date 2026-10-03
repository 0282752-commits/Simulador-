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

## Dos formas de jugar (Fútbol y NFL)

- **★ Mi equipo:** eliges un club o franquicia y con un clic juegas su próximo partido, avanzas hasta él para verlo
  en vivo, simulas la temporada entera (todas sus competiciones a la vez) o 3, 5 o 10 temporadas seguidas con
  resumen de cada campaña (posición, copas, Europa o playoffs, títulos).
- **Todas las competiciones:** controlas el calendario completo, partido a partido o por bloques.

## Mercado realista

- **Fútbol:** ventanas de verano (15 jun – 1 sep) e invierno (enero). Cada traspaso se negocia: primero el club
  (precio según valor, rol en la plantilla y años de contrato; puede contraofertar) y luego el jugador (sueldo,
  nivel del club y minutos). Cesiones, intercambios con dinero y agentes libres. La IA ficha y vende entre todos
  los clubes según sus necesidades y presupuesto, y hace ofertas por tus jugadores (aceptar, rechazar o
  contraofertar). Contratos con fecha de fin: si no renuevas, el jugador se va libre en verano. Valores,
  sueldos y contratos son estimaciones de la app (la base de EA no los trae). "Modo editor" para mover
  jugadores sin negociar.
- **NFL:** tope salarial (estimado en 300 M USD) y contratos estimados; trades que debe aprobar el otro equipo
  (o ambos si no controlas a ninguno) según el valor de jugadores y selecciones (tabla de valor del draft),
  necesidades y tope; fecha límite en la semana 9; la IA hace trades entre sí y te ofrece trades. Temporada baja
  por fases: draft interactivo de 7 rondas (eliges cuando te toca o simulas), agencia libre por días (la IA
  firma, los precios bajan) y recortes a 53 + practice squad.

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

## Torneos personalizados

Cuarto modo de la portada (🏆). Eliges deporte, formato y participantes:

- **Deportes:** fútbol (cualquier club de la base), **selecciones nacionales**, NFL y DC (personajes 1 vs 1 o equipos de 3/5/7).
- **Formatos:** eliminatoria directa (4, 8, 16, 32, 64, 128 o cualquier número, con exentos), liga (solo tabla o con fase
  final, p. ej. Final Four), grupos + eliminatoria (Mundial 48, Mundial 32, Eurocopa 24, Champions clásica…) y
  **liga suiza estilo Champions actual** (36 equipos, 8 partidos, 1.º-8.º directos, 9.º-24.º playoff).
  Todo editable: número de grupos, clasificados por grupo, mejores terceros, ida y vuelta, tercer puesto, bombos.
- **Mundial 2026** con las 48 selecciones y los 12 grupos reales del sorteo (5-dic-2025) y la repesca de marzo de 2026.
  El cruce de dieciseisavos no copia la tabla oficial de FIFA: se ordena por rendimiento y evita rivales del mismo grupo.
- **Sorteos animados** bola a bola: bombos de la fase de grupos (con tope por confederación en selecciones), fase liga
  estilo Champions (2 rivales de cada bombo, mitad en casa) y cruces de eliminatoria (cabezas de serie contra no cabezas,
  sin repetir rival del mismo grupo; playoff y cuadro de la Champions por parejas de puestos). Se pueden repetir mientras
  no se haya jugado la fase. Opción de cuadro fijo (Mundial/Eurocopa) en lugar de sorteo.
- Cada partido: simular, ver en vivo (los mismos visores de cada modo) o resultado manual; editar o borrar recalcula
  tablas y cuadro (los cruces que no cambian conservan su resultado). Tablas, cuadro, goleadores/líderes y plantillas.
- **Selecciones:** convocatoria **estimada** de 26 (3 POR, 9 DEF, 8 MED, 6 DEL por media) a partir de toda la base de
  EA FC 27, incluidas ligas no simuladas (MLS, Arabia, Brasil…). No son las listas oficiales. Las selecciones con pocos
  jugadores en la base (Catar, Irán, Jordania, Uzbekistán…) se completan con jugadores de **relleno** marcados como no reales.
  Se generan con `bun scripts/build-nations.ts players.csv` (sin ese archivo, la app las arma con las ligas simuladas).

## Datos (`/data`)

| Archivo | Contenido | Estado |
|---|---|---|
| `football/competitions.json` | Formatos de ligas, copas, supercopas y Europa 2026/27 | Formatos reales; fechas **aproximadas**; las entradas con `verified: false` están pendientes de verificar |
| `football/clubs.json`, `players.json` | Clubes y jugadores | **DEMO ficticia** hasta importar el CSV real |
| `football/europe-participants.json` | Clasificados europeos 2026/27 por nombre | Vacío → se rellena por fuerza con cupos por país |
| `nfl/teams.json` | 32 equipos, divisiones, colores, rotación del calendario | Estructura real; rotación 2026 deducida de la fórmula: **verificar** |
| `nfl/players.json` | Rosters | **DEMO ficticia** hasta importar el CSV real |
| `dc/characters.json` | Personajes, equipos y sinergias | Escala propia (no oficial) |
| `football/nations-meta.json` | Selecciones: nombre, código, colores, confederación y grupos del Mundial 2026 | Grupos reales con fuente |
| `football/nations.json` | Convocatorias estimadas (generado, no se sube) | Se crea con `scripts/build-nations.ts` |

Cada archivo guarda `meta.source` y `meta.updated`; la app muestra "DATOS DEMO" mientras se usen los ficticios.

### Por qué no vienen incluidas las plantillas reales

Las medias de **EA SPORTS FC 27** (salió el 25 de septiembre de 2026) y **Madden NFL 27** son contenido con copyright de Electronic Arts. EA las
publica en su web de ratings (ea.com/games/ea-sports-fc/ratings y ea.com/games/madden-nfl/player-ratings) pero
no ofrece una descarga con licencia de redistribución, y los datasets públicos (Kaggle, SoFIFA) son extracciones
de esa web con licencias dudosas. Por eso el repositorio incluye **importadores** en vez de los datos, y no se
inventan datos reales: los clubes/jugadores de demo son ficticios.

### Fuente probada: FC 27 real

El repositorio público [LakshmiKanth11/EA_FC_ANALYSIS](https://github.com/LakshmiKanth11/EA_FC_ANALYSIS) contiene
`data/players.csv` con los 19.789 jugadores de la API oficial de ratings de EA (instantánea del 12-09-2026). Se importa directo:

```bash
git clone --depth 1 https://github.com/LakshmiKanth11/EA_FC_ANALYSIS /tmp/eafc
npm run datos:futbol -- "/tmp/eafc/EA_FC_PLAYERS_DATASET_AND_ DASHBOARD/data/players.csv" --fuente "EA SPORTS FC 27 (instantánea 2026-09-12)"
```

Resultado: las 10 ligas completas (20/24/20/22/20/20/18/18/18/18 clubes), más Portugal, Países Bajos, Bélgica, Turquía,
Escocia, etc.; los clubes con plantilla incompleta en la base de EA se completan hasta 18 con canteranos marcados "(relleno)".
El potencial y el valor de mercado no vienen en ese archivo: la app los estima. Los colores de club salen de
`data/football/club-colors.json`. Este repositorio es público, así que los datos de EA no se suben: solo los demo.

### Traspasos del cierre del mercado (verano 2026)

La base de EA no recoge los traspasos de las últimas semanas del mercado. `data/football/transfers-2026-summer.json` tiene más de
100 movimientos reales recopilados de medios (ESPN, Goal, Sky Italia, Fussballdaten, Ligue 1…), cada uno con su fuente.
El importador los aplica solo (o a mano: `bun scripts/apply-transfers.ts data/football/`). Se omitieron los casos con fuentes
contradictorias. Las medias siguen siendo las de EA SPORTS FC 27.

### Nombres de clubes no licenciados por EA

EA SPORTS FC usa otros nombres para algunos clubes: `Milano FC` (AC Milan), `Lombardia FC` (Inter), `Bergamo Calcio`
(Atalanta) y `Latium` (Lazio). `data/football/club-aliases.json` los traduce al nombre real al importar; las listas de
traspasos pueden usar cualquiera de los dos nombres.

### NFL real: Madden 27

[zachxwalton/madden-ratings-breakdown](https://github.com/zachxwalton/madden-ratings-breakdown) tiene
`scraper/output/madden27_ratings.csv` (2.365 jugadores, ratings de lanzamiento de la web de EA):

```bash
git clone --depth 1 https://github.com/zachxwalton/madden-ratings-breakdown /tmp/m27
npm run datos:nfl -- /tmp/m27/scraper/output/madden27_ratings.csv --fuente "Madden NFL 27 (ratings de lanzamiento)"
```

Los motores están centrados en las medias reales de Madden 27 y FC 27 (`NCAL.ref` y `CAL`): con los datos demo
los promedios de `npm run calibrar` se desvían; con los reales cuadran con la tabla de abajo.

### Qué archivo conseguir y cómo importarlo

**Fútbol (EA SPORTS FC 27)** — dónde verlos: en la base oficial de EA, https://www.ea.com/games/ea-sports-fc/ratings
(filtros por liga, club y posición; ficha de cada jugador con todos los atributos). EA no ofrece un botón de descarga,
así que hay dos caminos:

1. **Automático (recomendado):** en tu computadora, con internet:
   ```bash
   npm run datos:fc27
   ```
   Descarga la base completa desde el mismo servicio que usa la web de EA a `data/football/raw/fc27.csv`
   (carpeta ignorada por git), la importa y reemplaza los datos demo. Equivale a `npm run datos:ea` seguido de
   `npm run datos:futbol -- data/football/raw/fc27.csv`. Tarda unos minutos (21.000+ jugadores).
   El servicio no es una API pública documentada: si EA lo cambia y el script falla, usa la opción 2.
2. **Manual:** un CSV de FC 27 hecho por la comunidad (Kaggle, SoFIFA) con columnas estilo SoFIFA
   (`short_name, long_name, player_positions, overall, age, nationality_name, preferred_foot, pace … physic,
   goalkeeping_*, mentality_penalties, skill_fk_accuracy, attacking_heading_accuracy, attacking_crossing, club_name,
   league_name`) o las de la web de EA (`Name, Team, League, Position, OVR, PAC … PHY …`):
   ```bash
   npm run datos:futbol -- ruta/fc27.csv --fuente "EA SPORTS FC 27 · origen · fecha"
   ```

Los ratings son de Electronic Arts: úsalos para tu partida y no subas el CSV/JSON a un repositorio público
(si despliegas en Vercel, el sitio servirá esos datos). Después de importar, revisa el aviso de clubes por liga y
rellena `europe-participants.json` con los clasificados reales.

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

`npm run calibrar` — resultados con los datos reales de EA SPORTS FC 27 y Madden NFL 27 importados (las referencias son promedios aproximados de las grandes
ligas europeas y de la NFL de temporadas recientes):

| Fútbol | Motor | Referencia |
|---|---|---|
| Goles por partido | 2.72 | ~2.7 |
| Victorias local / empates / visitante | 45.4% / 25.5% / 29.1% | ~45% / ~25% / ~30% |
| Córners | 10.7 | ~10 |
| Penales señalados | 0.28 | ~0.25-0.30 |
| Tiros (a puerta) | 27.1 (9.2) | ~25 (~8.5) |
| Amarillas / rojas | 3.9 / 0.12 | ~4 / ~0.15 |

| NFL | Motor | Referencia |
|---|---|---|
| Puntos totales | 44.6 | ~45 |
| Victorias local | 56.9% | ~55-57% |
| Yardas por equipo (pase/tierra) | 329 (216/113) | ~330 (~210/~118) |
| Capturas / pérdidas por equipo | 2.47 / 1.25 | ~2.4 / ~1.2 |
| % pases completos / 3ª conversión | 64.9% / 36.7% | ~65% / ~39% |
| % goles de campo / puntos extra | 88.0% / 95.7% | ~85% / ~95% |

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
