# Sandbox

A fight of the player's own: an arena of another encounter, monsters of the
other encounters placed on it, and one of two modes. Route `/sandbox/`
(`/sandbox/<arena>` for each arena, e.g. `/sandbox/inferno`); in the
encounter picker it is "Sandbox", with an "Arena" choice. Code:
`client/encounters/sandbox/`.

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

**Play** restarts the run with the scenario (the application's own restart).
Every change is kept at once as the active scenario (localStorage), so a
reload keeps it; the fight on screen only changes on a restart.

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

- Every sandbox NPC has one behaviour (`brawler.js`): walk to the target
  (with the route search around obstacles), attack with whichever of its
  attacks reaches, wait its attack speed. The special mechanics of the
  original fights are not there: no Jad prayer switch, no Sol Heredit
  spears, shields or grapples, no manticore charge, no healers healing, no
  Vardorvis axes, no Doom orbs or shields. Their stats, models and
  animations are the originals'.
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
  "options": { "playerStart": null, "ffaIncludesPlayer": true },
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

`tools/determinism/scenarios/sandbox.mjs` runs both modes and each example.
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
| `editor.js` | the editor panel |

No file under `client/assets/` was changed.
