# Sandbox

A fight of the player's own: an arena of another encounter, monsters of the
other encounters placed on it, optionally the arena's own boss with all its
mechanics, and one of two modes. Code: `client/encounters/sandbox/`.

Ways in: "Sandbox" in the encounter picker and the quick search (one entry;
the arena is chosen in the sandbox's editor, not in the menus), and the
gateway in the lobby, a dais ringed with coloured beams on the spoke between
Yama and his neighbour. Both open the setup window, where the loadout can be
any preset of any fight. The gateway's also offers "Load a scenario", the way
in for someone holding a code: it takes a share code, a link or a scenario's
JSON and switches the window to its arena, so that Start Encounter plays it.
Routes: `/sandbox/` and `/sandbox/<arena>` (e.g. `/sandbox/inferno`).

## Using it

The editor is the one place to build and play a scenario. The top bar holds
**Start encounter** and the **Sandbox editor** button, which opens a panel in
three steps:

1. **Arena**: the scenario's name, author and description; the arena (another
   arena is another route, which the application enters without loading the
   page; the editor reopens at step 2); the mode; the twenty examples; the
   library; the scenarios saved in this browser.
2. **Monsters**: a map of the arena's walkable tiles. Drag a monster from the
   list onto its starting tile, drag it on the map to move it, click it to
   edit its hitpoints, max hit, attack speed, levels and team, duplicate it or
   remove it. The blue **P** is the player's starting tile; drag it the same
   way. A footprint must stand on walkable tiles and on no one else.
3. **Gear & share**: the scenario's gear ("Choose gear…" opens the
   application's setup window for the arena, with the presets of every
   fight; "Use my current gear" keeps what you wear in the scenario; "Remove
   gear"), save in this browser, export a `.json` file, copy a share code or
   a link, and the one import box: a code, a link or JSON pasted, or a file.

A scenario with gear puts it on when it is applied, loaded from the setup
window or opened by link: the application sets the sandbox's loadout and,
in the render that holds it, enters the arena with it.

The editor reaches the application through `bridge.js`: one
`sandbox-request` window event (heard in `assets/application.js`) whose
listener takes each request at once and settles a promise when it is done
(the setup window open, the loadout read, the loadout set and the arena
entered, an arena entered). Nothing waits a guessed time.

**Apply & restart**, the editor's one primary action, restarts the run with
the scenario (the application's own restart; when the boss was switched on
or off, the application enters the arena again, because the scene is chosen
as a visit starts). Every change is kept at once as the
active scenario (localStorage), so a reload keeps it; the fight on screen
only changes on a restart. The scene follows the scenario of the run, not
the editor's: the encounter notes it as it resets (`visit.js`), and should a
run start that wants the other scene (a replay or a restart with the boss
set the other way), the page reloads into it.

Every run waits: nothing moves until **Start encounter** at the top of the
screen, which then becomes **Pause** / **Resume**. The start-of-fight
countdown (Settings) counts after Start, not before. The application's tick
loop asks the encounter (`isPaused`, a seam in `assets/Grid.js`); the engine
never does, so replays, rebuilds and the determinism harness are untouched.

## The arena's boss

Step 1 has "Fight this arena's boss with all its mechanics" in the arenas
that have one (`hostKind` in `arenas.js`): Sol Heredit's arena, Yama's room,
Zebak's room, Vardorvis' clearing and both rooms of the Doom of Mokhaiotl.
The scenario's `options.bossMechanics` then makes the arena's own encounter
the sandbox's host (`encounter.js`): it is made by its own factory and runs
inside the sandbox with everything it has (attacks, phases, hazards, adds,
its engine rules, its debug actions and boss hitpoint controls in the
Practice panel), and its scene is the one the fight has
(`presentationOf(kind)`, a seam in `assets/rendering.js`, reaches the scenes
that live in the bundle). The scenario's monsters fight beside it; in "ffa"
the host's NPCs are one team, "boss". The run is won when the host's fight
is won and the scenario's monsters are beaten. "Two Suns" is the real Sol
Heredit and a second one of the sandbox's.

One host per arena, where its fight puts it: a boss's mechanics are written
for its own room and its own actor ids, so a second copy of a boss, or a
boss in another arena, is the sandbox's plain version (below). The host's
intro is left out (the sandbox's Start replaces it).

## Modes

- **versus** ("All against you"): every NPC attacks the player. Won when all are dead.
- **ffa** ("Free for all"): every NPC attacks its nearest enemy: the NPCs of
  other teams (an NPC without a team is a team of its own) and, unless
  "Monsters may attack the player" is off, the player. NPCs of the team
  `player` fight on the player's side. An NPC that is hit turns on its
  attacker if that is an enemy. Won when the player's side is the last
  standing; with the player left out, when one team of NPCs is left. The top
  bar names the winner: the snapshot's `sandbox.winner`, which every
  snapshot of the sandbox carries, a host's included.

NPC-on-NPC attacks are the engine's own (the Inferno's nibblers hit its
pillars the same way): `rollNpcAttack` rolls them with the monster table's
stats of both sides, and the hits land through the combat system as any
other.

## Limitations

- Every monster placed from the catalog has one behaviour (`brawler.js`):
  walk to the target (with the route search around obstacles), attack with
  whichever of its attacks reaches, wait its attack speed. Their full
  mechanics are those of the arena's host only (above). A boss from the
  catalog keeps its look and the shape of its attacks: JalTok-Jad winds up
  for three ticks and throws his three-part magic or his ranged boulder (the
  style to pray against shows in the animation, but he picks it at random),
  TzKal-Zuk does not move, the Doom throws his orbs, the jaguar claws three
  times at once and the manticore throws its three orbs a tick apart (each
  hit with its hitsplat: `hits` and `volley` in `catalog.js`). Sol Heredit's
  regular attack is his own fight's (`solGroundAttack` in
  `sol-heredit/sandbox.js`, a `special` that `brawler.js` starts and
  `encounter.js` lands and draws, with `buildGroundAttackArea`): a spear or
  a shield at even odds, the first a spear, the variant alternating; the
  tiles from where he and his target stand three ticks after the telegraph,
  the stomp going out from his centre, the larger of two rolls of 0 to 44
  that no prayer stops, 7 or 6 ticks between attacks. His triple attack,
  grapple and phases, Yama's fireballs or Vardorvis' axes come only with
  the host.
- The catalog is the monsters whose models and sequences the trimmed cache
  already holds and whose stats are in the monster table
  (`client/data/monsters.js`). Its bosses: Sol Heredit, Yama, Vardorvis, the
  Doom of Mokhaiotl, JalTok-Jad and TzKal-Zuk. The Doom's larvae are left
  out (not in the table), and Zebak (a head and a tail of nine tiles) is
  only the host of his room. A monster's numbers that are not the table's
  are named with their source in its encounter's `sandbox.js`; several are
  "inferred".
- What an attack looks like is announced as an "inferno_visual" event
  (the default scene) and a "colosseum_visual" one (Sol Heredit's and
  Yama's scenes, which the hosts draw with; Yama's plays them, with their
  projectiles and graphics, since a seam in `assets/rendering.js`). Both
  scenes also load the spot animations of the sandbox's render config.
- Arenas: the lobby is left out (its floor and walls are drawn by its own
  scene in `rendering.js`). The Inferno's has no pillars.
- Yama from the catalog shows the effect on his target but no projectile
  (his own are drawn by his scene from his fight's events).
- The share code goes in the address (`#sbx=`); there is no server. A
  scenario of 40 monsters makes a code of about 800 characters.

## New encounters' monsters

The catalog follows the encounters by itself. `tools/sandbox-catalog.mjs`
reads the render config of every presentation written in modules (the way
every new encounter is added) and finds each NPC it draws that has stats in
the monster table and an attack clip. One that the curated catalog
neither holds nor excludes (`sandboxCatalogExclusions` in `catalog.js`, each
with its reason) becomes an entry of `discovered.js`, a generated file:
its size and attack speed from the table, the style its levels and bonuses
favour, its sequences from the render config. The sandbox's catalog is the
curated entries and these. The curated entries are each encounter's own:
`client/encounters/<encounter>/sandbox.js` (the Inferno, the Colosseum, Sol
Heredit, Vardorvis, the Doom, Yama) holds its monsters' entries beside the
ids, sequences and projectiles they copy, and `catalog.js` gathers them.

- `npm run sandbox:catalog` (or `node tools/sandbox-catalog.mjs --write`)
  writes `discovered.js`; without `--write` it lists every NPC found and
  where it went.
- `test/test-sandbox-catalog.mjs` (part of `npm test`) fails while
  `discovered.js` is out of date, checks the discovery on a made-up
  encounter, and fights every entry, curated or discovered: it must have
  stats, its clips, be loaded by the scene and attack the player within 40
  ticks. A monster that cannot fight as a plain sandbox NPC (Zebak, nine
  tiles of head and tail, fails here) goes to the exclusions with its
  reason, or to the curated catalog with its own numbers.
- The determinism harness has a scenario per entry (`sandbox/catalog/<id>`):
  a new one needs its digests recorded
  (`node tools/determinism/harness.mjs --update --only sandbox/catalog/`).

## Format

`scenario.js` holds the format, version 1, with its full description at the
top. In short:

```json
{
  "format": "openscim-sandbox",
  "version": 1,
  "meta": { "name": "Two Suns", "author": "OpenScim", "description": "..." },
  "arena": "sol_heredit",
  "mode": "versus",
  "options": { "playerStart": null, "ffaIncludesPlayer": true, "bossMechanics": true },
  "gear": {
    "name": "Max melee",
    "equipment": { "weapon": 26219, "shield": 22322, "head": 26382 },
    "inventory": [{ "id": 13652 }, { "id": 6685 }, null],
    "supplies": {}
  },
  "npcs": [
    { "id": "sol-west", "npc": "sol_heredit", "position": [27, 36] },
    { "id": "sol-east", "npc": "sol_heredit", "position": [34, 36], "hp": 750, "team": "red" }
  ]
}
```

`normalizeScenario` checks every value and is where a later version would
read an older one. Arena ids are in `arenas.js`, NPC ids in `catalog.js`;
neither may be renamed once shared. `gear.supplies` keeps only what the
application reads of a loadout's supplies (ammunition, quiver, rune pouch,
blowpipe, spell, spellbook), parsed as `engine/supplies.js` parses them. A
scenario NPC whose id is a host NPC's is renamed (`yama-2`), not left out.

A share code is `OSB1.` and the deflated JSON (pako, `deflateRaw`) in
base64url. The largest scenario is about 13 KB of JSON and 1,200 characters
of code; a code over 16K characters is refused before it is decoded, and its
JSON is not inflated past 64 KB, so that a crafted code cannot exhaust the
tab. The import box goes by the first character: `{` is JSON, `OSB` a code,
anything else is searched for a `#sbx=` link.

Opening a `#sbx=` link shows what it holds (name, author, arena, monsters)
and asks before it replaces the player's scenario, and again before its gear
replaces their loadout and restarts the run. The code leaves the address in
every case, and one that cannot be read says why. Saved scenarios this
client cannot read (from a newer version, or naming a renamed catalog id)
are not listed but are kept as they were.

Sharing through a server later needs no change of the format: store the JSON
or the code, and open `/sandbox/<arena>#sbx=<code>`.

## Determinism and replays

The scenario is part of the encounter's seeds (`getSeeds()` returns
`{ encounterSeed, scenario }`): a replay and a restart with the same seeds
play the scenario they were recorded with, whatever the editor holds later.
The editor's scenario is read only when a run starts without seeds. Target
choice is deterministic (last attacker, current target, nearest); the one
random choice, between attacks that reach, draws from the encounter's
seeded generator.

`tools/determinism/scenarios/sandbox.mjs` runs both modes, each host with
two of the sandbox's monsters, and each example.
`test/test-sandbox-scenario.mjs` checks the format, the codes and the
examples; `test/test-sandbox-examples.mjs` that each of the twenty, and each
scenario of the library, stands on walkable tiles, clear of the others, of
the host's NPCs and of the player. `test/test-sandbox-wiring.mjs` fails when
the engine calls a hook of an encounter that the sandbox neither implements
nor hands its host (`sandboxHostHooks` in `encounter.js`), and when
`engine/encounterKinds.js` does not list the arenas of `arenas.js`.

## The examples

Twenty, bosses only, each with its gear (max ranged, melee or magic). Eleven
fight the arena's real boss with all its mechanics and other bosses beside
it (Two Suns, Sun and Flame, Sun and Shadow, Yama's Court, Two Lords of
Fire, The Stranglewood Hunt, Three Heads, The Doom and Two Jads, The Abyss
Below, Depths of Fire, Jaws and Spear); nine put the catalog's bosses
together: Zuk's Set, Triple Jad, Boss Rush, Twin Flames (all against you),
Royal Rumble (every one for itself), The Champions' Stand (two bosses on
your side), Clash of Titans and Boss Royale (bosses against each other
while you watch), Tomb Raiders.

## The library

`client/encounters/sandbox/scenarios/` holds scenarios that players submit
by pull request: one JSON file each, as the editor's "Export .json" writes
it, under a short name of its own, listed in that directory's `index.js`.
The editor offers them as the Library, next to the examples.
`test/test-sandbox-examples.mjs` checks that every file is listed and reads,
and places each as it places the examples. Share codes stay for casual
sharing; the library is reviewed, permanent and one click away.

## Files

| File | Contents |
|---|---|
| `arenas.js` | the arenas: map square, collision, start tile, camera; the variant kind of each |
| `catalog.js` | the monsters, gathered from each encounter's `sandbox.js`, and the exclusions |
| `scenario.js` | the format: `normalizeScenario`, JSON, share codes |
| `examples.js` | the twenty examples and their gear |
| `brawler.js` | the NPC definition every sandbox NPC has |
| `encounter.js` | `SandboxEncounter`, the modes, the definition with its variants |
| `activeScenario.js` | the scenario the next run starts with (localStorage, `#sbx=` links) |
| `storage.js` | the saved scenarios (localStorage) |
| `presentation.js` | one presentation per arena; brings the editor in step every frame |
| `editor.js` | the editor panel, Start / Pause and the run's result |
| `bridge.js` | the editor's requests to the application, as promises |
| `scenarios/` | the library: one JSON scenario per file, and its `index.js` |
| `clock.js` | whether the run may tick: waiting for Start, running, paused |
| `visit.js` | whether a visit fights the host (and draws its scene) |
| `gateway.js` | the gateway in the lobby (`client/lobby/gateways.js` lists it) |
| `discovered.js` | the generated part of the catalog (`tools/sandbox-catalog.mjs`, `tools/sandbox/discover.mjs`) |

What needed `client/assets/`, each a few lines: the tick loop asks
`encounter.isPaused()` (`Grid.js`); `routeVariants` (variants with a route
and presets that the menus do not list) and the sandbox's presets, every
fight's, the scenario code field of the setup window (from the lobby's
gateway), and the `sandbox-request` listener of `bridge.js`
(`application.js`);
`presentationOf(kind)` handed to the presentations written in modules, and
Yama's scene playing other NPCs' "colosseum_visual" animations, projectiles
and graphics, cleared on a replay jump, a despawn and when the scene goes
(`rendering.js`).
