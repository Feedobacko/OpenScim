# Sandbox

A fight of the player's own: an arena of another encounter, monsters of the
other encounters placed on it, optionally the arena's own boss with all its
mechanics, and one of two modes. Code: `client/encounters/sandbox/`.

Ways in: "Sandbox" in the encounter picker and the quick search (one entry;
the arena is chosen in the sandbox's editor, not in the menus), and the
gateway in the lobby, a dais ringed with coloured beams on the spoke between
Yama and his neighbour. Both open the setup window, where the loadout can be
any preset of any fight. Routes: `/sandbox/` and `/sandbox/<arena>` (e.g.
`/sandbox/inferno`).

## Using it

The **Sandbox editor** button at the top of the screen opens a panel in three steps:

1. **Arena**: the scenario's name, author and description; the arena (another
   arena is another route: the page goes there and the editor reopens at
   step 2); the mode; the ten examples; the scenarios saved in this browser.
2. **Monsters**: a map of the arena's walkable tiles. Drag a monster from the
   list onto its starting tile, drag it on the map to move it, click it to
   edit its hitpoints, max hit, attack speed, levels and team, duplicate it or
   remove it. The blue **P** is the player's starting tile; drag it the same
   way. A footprint must stand on walkable tiles and on no one else.
3. **Save & share**: save in this browser, export or import a `.json` file,
   copy a share code or a link, import a code, a link or JSON.

**Apply & restart** restarts the run with the scenario (the application's
own restart; a reload when the boss was switched on or off, because the
scene is chosen as a visit starts). Every change is kept at once as the
active scenario (localStorage), so a reload keeps it; the fight on screen
only changes on a restart.

Every run waits: nothing moves until **Start encounter** at the top of the
screen, which then becomes **Pause** / **Resume**. The application's tick
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
  standing; with the player left out, when one team of NPCs is left (the
  snapshot's `winner` names it).

NPC-on-NPC attacks are the engine's own (the Inferno's nibblers hit its
pillars the same way): `rollNpcAttack` rolls them with the monster table's
stats of both sides, and the hits land through the combat system as any
other.

## Limitations

- Every monster placed from the catalog has one behaviour (`brawler.js`):
  walk to the target (with the route search around obstacles), attack with
  whichever of its attacks reaches, wait its attack speed. Their special
  mechanics are those of the arena's host only (above): a Jad, a Sol or a
  Doom placed from the catalog has no prayer switch, spears or orbs. Their
  stats, models and animations are the originals'.
- The catalog is the monsters whose models and sequences the trimmed cache
  already holds and whose stats are in the monster table
  (`client/data/monsters.js`); the Doom's larvae, Zebak and Yama are left
  out for that reason (Zebak and Yama: their sequences are only in
  `client/assets/rendering.js`). A monster's numbers that are not the
  table's are named with their source in `catalog.js`; several are
  "inferred".
- Arenas: the lobby is left out (its floor and walls are drawn by its own
  scene in `rendering.js`). The Inferno's has no pillars.
- Ranged and magic attacks without a projectile of their own (Jad, the blob,
  the Doom's orb, the shockwave colossus) land after a fixed delay and show
  only the attack animation.
- The share code goes in the address (`#sbx=`); there is no server. A
  scenario of 40 monsters makes a code of about 800 characters.

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
  "npcs": [
    { "id": "sol-west", "npc": "sol_heredit", "position": [27, 36] },
    { "id": "sol-east", "npc": "sol_heredit", "position": [34, 36], "hp": 750, "team": "red" }
  ]
}
```

`normalizeScenario` checks every value and is where a later version would
read an older one. Arena ids are in `arenas.js`, NPC ids in `catalog.js`;
neither may be renamed once shared. A share code is `OSB1.` and the
deflated JSON (pako, `deflateRaw`) in base64url.

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
examples.

## Files

| File | Contents |
|---|---|
| `arenas.js` | the arenas: map square, collision, start tile, camera; the variant kind of each |
| `catalog.js` | the monsters: NPC type, size, speed, attacks, sequences, projectiles |
| `scenario.js` | the format: `normalizeScenario`, JSON, share codes |
| `examples.js` | the ten examples |
| `brawler.js` | the NPC definition every sandbox NPC has |
| `encounter.js` | `SandboxEncounter`, the modes, the definition with its variants |
| `activeScenario.js` | the scenario the next run starts with (localStorage, `#sbx=` links) |
| `storage.js` | the saved scenarios (localStorage) |
| `presentation.js` | one presentation per arena; brings the editor in step every frame |
| `editor.js` | the editor panel, and Start / Pause |
| `clock.js` | whether the run may tick: waiting for Start, running, paused |
| `visit.js` | whether a visit fights the host (and draws its scene) |
| `gateway.js` | the gateway in the lobby (`client/lobby/gateways.js` lists it) |

What needed `client/assets/`, each a few lines: the tick loop asks
`encounter.isPaused()` (`Grid.js`); `routeVariants` (variants with a route
and presets that the menus do not list) and the sandbox's presets, every
fight's (`application.js`); `presentationOf(kind)` handed to the
presentations written in modules (`rendering.js`).
